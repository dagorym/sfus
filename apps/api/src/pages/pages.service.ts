import crypto from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { validateMarkdownBody, normalizeMarkdownBody } from "../media/markdown-sanitizer";
import { PageRevisionEntity } from "./entities/page-revision.entity";
import { StandalonePageEntity } from "./entities/standalone-page.entity";

/**
 * Slugs that are reserved and must never be used for a standalone page because
 * they collide with Next.js app routes or protected API/admin surfaces.
 */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "blog",
  "login",
  "register",
  "onboarding",
  "profile",
  "settings",
  "health"
]);

export interface CreatePageInput {
  title: string;
  slug: string;
  body: string;
  summary?: string | null;
  changeNote?: string | null;
  featuredMediaId?: string | null;
}

export interface UpdatePageInput {
  title?: string;
  slug?: string;
  body?: string;
  summary?: string | null;
  changeNote?: string | null;
  featuredMediaId?: string | null;
}

/**
 * PagesService enforces admin-only site-wide management for standalone pages.
 *
 * All create/edit/publish/unpublish/restore actions require the caller to hold
 * the global "admin" role — this is the Milestone 3 locked decision for
 * site-wide content management.
 *
 * Public read access is limited to pages with status "published".
 */
@Injectable()
export class PagesService {
  constructor(
    @InjectRepository(StandalonePageEntity)
    private readonly pageRepository: Repository<StandalonePageEntity>,
    @InjectRepository(PageRevisionEntity)
    private readonly revisionRepository: Repository<PageRevisionEntity>,
    private readonly authorizationService: AuthorizationService
  ) {}

  /**
   * Asserts that the actor holds the global admin role for site-wide page
   * management actions (create, edit, publish, unpublish, restore).
   */
  assertAdminManagementAccess(actorGlobalRole: string): void {
    if (!this.authorizationService.hasGlobalRole(actorGlobalRole, "admin")) {
      throw new ForbiddenException("Standalone page management requires the admin role.");
    }
  }

  /**
   * Returns only published standalone pages — safe for public/guest access.
   */
  async findPublished(): Promise<StandalonePageEntity[]> {
    return this.pageRepository.find({
      where: { status: "published" },
      order: { title: "ASC" }
    });
  }

  /**
   * Returns a single published page by slug. Returns null when the page does
   * not exist or is not published, so callers never expose draft content
   * through public routes.
   */
  async findPublishedBySlug(slug: string): Promise<StandalonePageEntity | null> {
    return this.pageRepository.findOne({
      where: { slug, status: "published" }
    });
  }

  /**
   * Returns all pages regardless of status — admin-only surface.
   * Caller must have verified admin access before calling this.
   */
  async findAll(): Promise<StandalonePageEntity[]> {
    return this.pageRepository.find({
      order: { createdAt: "DESC" }
    });
  }

  /**
   * Returns a single page by id regardless of status — admin-only surface.
   * Caller must have verified admin access before calling this.
   */
  async findById(id: string): Promise<StandalonePageEntity | null> {
    return this.pageRepository.findOne({ where: { id } });
  }

  /**
   * Creates a new standalone page in draft status and records revision 1.
   * Caller must have verified admin access before calling this.
   */
  async create(authorUserId: string, input: CreatePageInput): Promise<StandalonePageEntity> {
    this.assertSlugValid(input.slug);
    this.assertTitleValid(input.title);

    const sanitationResult = validateMarkdownBody(input.body);
    if (!sanitationResult.safe) {
      throw new BadRequestException(`Page body contains unsafe content: ${sanitationResult.reason}`);
    }
    const normalizedBody = normalizeMarkdownBody(input.body);

    const pageId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();

    // Insert the parent standalone_pages row first so the FK on
    // page_revisions.page_id → standalone_pages.id is satisfied.
    // currentRevisionId is nullable and will be set after the revision is saved.
    const page = this.pageRepository.create({
      id: pageId,
      createdByUserId: authorUserId,
      title: input.title,
      slug: input.slug,
      status: "draft",
      publishedAt: null,
      currentRevisionId: null
    });
    await this.pageRepository.save(page);

    const revision = this.revisionRepository.create({
      id: revisionId,
      pageId,
      authorUserId,
      title: input.title,
      body: normalizedBody,
      summary: input.summary ?? null,
      changeNote: input.changeNote ?? null,
      featuredMediaId: input.featuredMediaId ?? null,
      revisionNumber: 1
    });
    const savedRevision = await this.revisionRepository.save(revision);

    // Update the page to point at its initial revision.
    page.currentRevisionId = savedRevision.id;
    await this.pageRepository.save(page);

    return this.pageRepository.findOne({ where: { id: pageId } }) as Promise<StandalonePageEntity>;
  }

  /**
   * Updates an existing standalone page and creates a new revision.
   * Caller must have verified admin access before calling this.
   */
  async update(id: string, authorUserId: string, input: UpdatePageInput): Promise<StandalonePageEntity> {
    const page = await this.pageRepository.findOne({ where: { id } });
    if (!page) {
      throw new NotFoundException("Standalone page not found.");
    }

    if (input.slug !== undefined) {
      this.assertSlugValid(input.slug);
      page.slug = input.slug;
    }
    if (input.title !== undefined) {
      this.assertTitleValid(input.title);
      page.title = input.title;
    }

    // Sanitize and normalize body when provided.
    let resolvedBody: string;
    if (input.body !== undefined) {
      const sanitationResult = validateMarkdownBody(input.body);
      if (!sanitationResult.safe) {
        throw new BadRequestException(`Page body contains unsafe content: ${sanitationResult.reason}`);
      }
      resolvedBody = normalizeMarkdownBody(input.body);
    } else {
      // Fall back to the current revision's body when body is not being changed.
      const currentRevision = page.currentRevisionId
        ? await this.revisionRepository.findOne({ where: { id: page.currentRevisionId } })
        : null;
      resolvedBody = currentRevision?.body ?? "";
    }

    // Determine next revision number.
    const latestRevision = await this.revisionRepository.findOne({
      where: { pageId: id },
      order: { revisionNumber: "DESC" }
    });
    const nextRevisionNumber = latestRevision ? latestRevision.revisionNumber + 1 : 1;

    const revisionId = crypto.randomUUID();
    const revision = this.revisionRepository.create({
      id: revisionId,
      pageId: id,
      authorUserId,
      editorUserId: authorUserId,
      title: input.title ?? page.title,
      body: resolvedBody,
      summary: input.summary !== undefined ? input.summary : null,
      changeNote: input.changeNote !== undefined ? input.changeNote : null,
      featuredMediaId: input.featuredMediaId !== undefined ? input.featuredMediaId : null,
      revisionNumber: nextRevisionNumber
    });
    const savedRevision = await this.revisionRepository.save(revision);

    page.currentRevisionId = savedRevision.id;
    await this.pageRepository.save(page);

    return this.pageRepository.findOne({ where: { id } }) as Promise<StandalonePageEntity>;
  }

  /**
   * Publishes a standalone page immediately.
   * Caller must have verified admin access before calling this.
   */
  async publish(id: string): Promise<StandalonePageEntity> {
    const page = await this.pageRepository.findOne({ where: { id } });
    if (!page) {
      throw new NotFoundException("Standalone page not found.");
    }
    page.status = "published";
    page.publishedAt = new Date();
    await this.pageRepository.save(page);
    return this.pageRepository.findOne({ where: { id } }) as Promise<StandalonePageEntity>;
  }

  /**
   * Unpublishes a standalone page (moves it back to unpublished status).
   * Caller must have verified admin access before calling this.
   */
  async unpublish(id: string): Promise<StandalonePageEntity> {
    const page = await this.pageRepository.findOne({ where: { id } });
    if (!page) {
      throw new NotFoundException("Standalone page not found.");
    }
    page.status = "unpublished";
    await this.pageRepository.save(page);
    return this.pageRepository.findOne({ where: { id } }) as Promise<StandalonePageEntity>;
  }

  /**
   * Restores a page to the content of a specific prior revision. Creates a new
   * revision capturing the restored content so the audit trail is complete.
   * Caller must have verified admin access before calling this.
   */
  async restoreRevision(pageId: string, revisionId: string, authorUserId: string): Promise<StandalonePageEntity> {
    const page = await this.pageRepository.findOne({ where: { id: pageId } });
    if (!page) {
      throw new NotFoundException("Standalone page not found.");
    }
    const source = await this.revisionRepository.findOne({ where: { id: revisionId, pageId } });
    if (!source) {
      throw new NotFoundException("Revision not found.");
    }

    const latestRevision = await this.revisionRepository.findOne({
      where: { pageId },
      order: { revisionNumber: "DESC" }
    });
    const nextRevisionNumber = latestRevision ? latestRevision.revisionNumber + 1 : 1;

    // Normalize body from source revision (sanitization already passed when it was first stored).
    const normalizedBody = normalizeMarkdownBody(source.body);

    const newRevisionId = crypto.randomUUID();
    const newRevision = this.revisionRepository.create({
      id: newRevisionId,
      pageId,
      authorUserId,
      editorUserId: authorUserId,
      title: source.title,
      body: normalizedBody,
      summary: source.summary ?? null,
      featuredMediaId: source.featuredMediaId ?? null,
      changeNote: `Restored from revision ${source.revisionNumber}`,
      revisionNumber: nextRevisionNumber
    });
    const savedRevision = await this.revisionRepository.save(newRevision);

    page.title = source.title;
    page.currentRevisionId = savedRevision.id;
    await this.pageRepository.save(page);

    return this.pageRepository.findOne({ where: { id: pageId } }) as Promise<StandalonePageEntity>;
  }

  /**
   * Returns all revisions for a page ordered by revision number ascending.
   * Callers must verify that the requesting actor is an admin before using
   * this method — revision history is not a public surface.
   */
  async findRevisions(pageId: string): Promise<PageRevisionEntity[]> {
    return this.revisionRepository.find({
      where: { pageId },
      order: { revisionNumber: "ASC" }
    });
  }

  /**
   * Returns a single revision by its id. Used for efficient current-body
   * resolution without scanning the full revision list.
   */
  async findRevisionById(revisionId: string): Promise<PageRevisionEntity | null> {
    return this.revisionRepository.findOne({ where: { id: revisionId } });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private assertSlugValid(slug: string): void {
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException(
        "Slug must be lowercase alphanumeric words separated by hyphens (e.g. 'about-us')."
      );
    }
    if (RESERVED_PAGE_SLUGS.has(slug)) {
      throw new BadRequestException(
        `Slug "${slug}" is reserved and cannot be used for a standalone page.`
      );
    }
  }

  private assertTitleValid(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new BadRequestException("Title must not be empty.");
    }
  }
}
