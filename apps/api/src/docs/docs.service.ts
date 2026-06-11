import crypto from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { DocsPageEntity } from "./entities/docs-page.entity";
import { DocsRevisionEntity } from "./entities/docs-revision.entity";
import type {
  DocsBreadcrumbItem,
  DocsPageShape,
  DocsTreeItem,
  DocsRecentEditShape,
  DocsRecentQuery
} from "./docs.types";

/**
 * DocsService provides read access to the site wiki.
 *
 * Security contract (P12 / oracle parity):
 * - Every visibility decision is routed through AuthorizationService.evaluate()
 *   with an anonymous actor for unauthenticated reads — no inline re-derived predicates.
 * - scope_type='project' pages are excluded from every site index (mirror isBoardPubliclyReadable).
 * - Gated and nonexistent pages return an identical 404 (PAGE_NOT_FOUND_MESSAGE) —
 *   no 403 vs 404 distinction, no message that distinguishes hidden from nonexistent.
 */
@Injectable()
export class DocsService {
  /**
   * The uniform "not found" message used for both nonexistent and non-readable pages.
   * A single constant guarantees oracle parity (hidden === nonexistent in error shape, P12).
   */
  static readonly PAGE_NOT_FOUND_MESSAGE = "Document page not found.";

  /** Hard cap on the number of recent edits returned by the recent feed. */
  static readonly RECENT_DOCS_MAX_LIMIT = 20;

  /** Default number of recent edits returned when no limit is specified. */
  static readonly RECENT_DOCS_DEFAULT_LIMIT = 5;

  /**
   * Anonymous actor used for all public (unauthenticated) visibility evaluation.
   * No userId and an empty-string role means only public/unlisted resources are allowed.
   */
  private readonly anonymousActor = { userId: null as null, globalRole: "" };

  constructor(
    @InjectRepository(DocsPageEntity)
    private readonly pageRepository: Repository<DocsPageEntity>,
    @InjectRepository(DocsRevisionEntity)
    private readonly revisionRepository: Repository<DocsRevisionEntity>,
    private readonly authorizationService: AuthorizationService
  ) {}

  // ---------------------------------------------------------------------------
  // Visibility gate — mirrors ForumsService.isBoardPubliclyReadable
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the given page is readable by an unauthenticated guest
   * **and** has scopeType='site'. Both conditions must hold for the page to
   * appear in public reads.
   *
   * All visibility decisions are routed through AuthorizationService.evaluate()
   * — no inline re-derived predicates.
   */
  isPagePubliclyReadable(page: DocsPageEntity): boolean {
    if (page.scopeType !== "site") {
      return false;
    }
    const decision = this.authorizationService.evaluate({
      actor: this.anonymousActor,
      resource: {
        resourceType: "docs_page",
        resourceId: page.id,
        visibility: page.visibility,
        projectId: null
      },
      action: "read"
    });
    return decision.allowed;
  }

  // ---------------------------------------------------------------------------
  // Path resolution — GET /api/docs/*path
  // ---------------------------------------------------------------------------

  /**
   * Resolves a published site page by its full path, returning its current revision
   * body plus an ordered breadcrumb ancestry array.
   *
   * Security contract (P12):
   * - Nonexistent path, deleted page, and non-publicly-readable page all return
   *   the same NotFoundException(PAGE_NOT_FOUND_MESSAGE) — no 403 vs 404 distinction.
   * - Visibility routed through isPagePubliclyReadable (→ AuthorizationService.evaluate()).
   *
   * @param path The full slash-joined path (e.g. "getting-started/installation").
   */
  async getPageByPath(path: string): Promise<DocsPageShape> {
    const normalizedPath = this.normalizePath(path);
    const pathHash = this.computePathHash("site", null, normalizedPath);

    const page = await this.pageRepository.findOne({
      where: { scopeType: "site", scopeId: IsNull(), pathHash },
      relations: ["currentRevision", "currentRevision.author", "currentRevision.editorUser"]
    });

    // Oracle parity: nonexistent, deleted, or non-readable all → identical 404.
    if (!page || page.status !== "published" || !this.isPagePubliclyReadable(page)) {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }

    const breadcrumbs = await this.buildBreadcrumbs(page);
    return this.toPageShape(page, breadcrumbs);
  }

  // ---------------------------------------------------------------------------
  // Tree / children index — GET /api/docs
  // ---------------------------------------------------------------------------

  /**
   * Returns the site page tree: children of the root (when no parentPath given)
   * or children of a specific parent path (when ?parentPath= is provided).
   *
   * Only site-scoped, status='published', publicly-readable pages are included.
   * Project-scoped pages are always excluded (mirror ForumsService scope filter).
   *
   * @param parentPath Optional full path of the parent page. Omit for root children.
   */
  async listPageTree(parentPath?: string): Promise<DocsTreeItem[]> {
    let parentId: string | null = null;

    if (parentPath !== undefined && parentPath.trim().length > 0) {
      const normalizedParentPath = this.normalizePath(parentPath.trim());
      const parentHash = this.computePathHash("site", null, normalizedParentPath);
      const parent = await this.pageRepository.findOne({
        where: { scopeType: "site", scopeId: IsNull(), pathHash: parentHash }
      });
      // Non-existent or non-readable parent → same 404 (oracle parity).
      if (!parent || parent.status !== "published" || !this.isPagePubliclyReadable(parent)) {
        throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
      }
      parentId = parent.id;
    }

    // Query children at this level. parentId IS NULL means root pages.
    const pages = await this.pageRepository.find({
      where: {
        scopeType: "site",
        scopeId: IsNull(),
        status: "published",
        parentId: parentId !== null ? (parentId as string) : IsNull()
      },
      order: { title: "ASC" }
    });

    // Filter through the visibility gate (no inline re-derived predicate).
    const visible = pages.filter((p) => this.isPagePubliclyReadable(p));

    return visible.map((p) => this.toTreeItem(p));
  }

  // ---------------------------------------------------------------------------
  // Recent feed — GET /api/docs/recent
  // ---------------------------------------------------------------------------

  /**
   * Returns recent publicly-readable, site-scope, non-deleted document edits
   * for the landing feed: page title, path, editor, timestamp.
   *
   * Security contract (P12):
   * - Only pages that pass isPagePubliclyReadable are included.
   *   Project-scoped pages and non-readable pages are excluded — no oracle leak.
   * - Returns a stable empty list when no public activity exists.
   *
   * Ordering: most-recently-edited first (revision.created_at DESC).
   * Limit: defaults to RECENT_DOCS_DEFAULT_LIMIT; hard-capped at RECENT_DOCS_MAX_LIMIT.
   */
  async listRecentEdits(query: DocsRecentQuery): Promise<DocsRecentEditShape[]> {
    const rawLimit = query.limit;
    const safeLimit = Number.isFinite(rawLimit) ? rawLimit! : DocsService.RECENT_DOCS_DEFAULT_LIMIT;
    const limit = Math.min(DocsService.RECENT_DOCS_MAX_LIMIT, Math.max(1, safeLimit));

    // Build the allow-list of publicly-readable site page ids.
    // All visibility decisions route through isPagePubliclyReadable → AuthorizationService.evaluate().
    const allPages = await this.pageRepository.find({
      where: { scopeType: "site", scopeId: IsNull(), status: "published" }
    });
    const publicPageIds = allPages.filter((p) => this.isPagePubliclyReadable(p)).map((p) => p.id);

    if (publicPageIds.length === 0) {
      return [];
    }

    // Query the most recent revisions for public pages, joining editor user.
    // Each page's current_revision_id identifies the most-recently-applied revision.
    // We join through docs_pages to get the page title and path, and the revision
    // created_at for ordering.
    const rows = await this.revisionRepository
      .createQueryBuilder("revision")
      .innerJoinAndSelect("revision.page", "page")
      .leftJoinAndSelect("revision.editorUser", "editor")
      .leftJoinAndSelect("revision.author", "author")
      .where("page.id IN (:...pageIds)", { pageIds: publicPageIds })
      .andWhere("page.current_revision_id = revision.id")
      .orderBy("revision.createdAt", "DESC")
      .take(limit)
      .getMany();

    return rows.map((rev) => this.toRecentEditShape(rev));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the ordered breadcrumb ancestry for a page, from the shallowest ancestor
   * down to (but not including) the current page itself.
   *
   * Walks the parent chain via parentId in the DB. Ancestry is built in reverse
   * (deepest-first) then reversed for display order (root → immediate parent).
   *
   * Security contract (oracle parity, P12):
   * - Every ancestor is routed through isPagePubliclyReadable before its id or title
   *   is included. If an ancestor fails the gate (non-readable, project-scoped, deleted,
   *   or members/private visibility), the chain is truncated at that point — neither that
   *   ancestor nor any shallower ancestor appears in the response. This prevents id and
   *   title leakage for non-public nodes. The chain truncation (not a per-item skip) avoids
   *   creating a positional existence side channel.
   */
  private async buildBreadcrumbs(page: DocsPageEntity): Promise<DocsBreadcrumbItem[]> {
    const breadcrumbs: DocsBreadcrumbItem[] = [];
    let currentParentId = page.parentId;

    while (currentParentId !== null) {
      const ancestor = await this.pageRepository.findOne({ where: { id: currentParentId } });
      // Ancestor missing or fails the visibility gate: truncate the chain here.
      // Do not expose id/title for any gated ancestor (oracle parity — gated === absent).
      if (!ancestor || ancestor.status !== "published" || !this.isPagePubliclyReadable(ancestor)) {
        break;
      }
      breadcrumbs.push({ id: ancestor.id, title: ancestor.title, path: ancestor.path });
      currentParentId = ancestor.parentId;
    }

    // Reverse: we walked deepest-first; display order is root → immediate parent.
    breadcrumbs.reverse();
    return breadcrumbs;
  }

  /**
   * Normalizes a path segment string: trims whitespace and leading/trailing slashes.
   * "getting-started/installation" and "/getting-started/installation/" both normalize
   * to "getting-started/installation".
   */
  private normalizePath(path: string): string {
    return path.trim().replace(/^\/+|\/+$/g, "");
  }

  /**
   * Computes the SHA-256 path hash used for indexed full-path lookups.
   * The hash encodes scopeType + scopeId + path so the unique index
   * (scope_type, scope_id, path_hash) is correct across scopes.
   *
   * @param scopeType e.g. "site"
   * @param scopeId   project UUID or null for site scope
   * @param path      normalized full path (e.g. "getting-started/install")
   */
  computePathHash(scopeType: string, scopeId: string | null, path: string): string {
    const input = `${scopeType}:${scopeId ?? ""}:${path}`;
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  /**
   * Maps a DocsPageEntity (with loaded currentRevision and breadcrumbs) to
   * the public DocsPageShape DTO.
   */
  private toPageShape(page: DocsPageEntity, breadcrumbs: DocsBreadcrumbItem[]): DocsPageShape {
    const rev = page.currentRevision;
    return {
      id: page.id,
      title: page.title,
      path: page.path,
      depth: page.depth,
      parentId: page.parentId,
      visibility: page.visibility,
      breadcrumbs,
      currentRevision: rev
        ? {
            id: rev.id,
            title: rev.title,
            body: rev.body,
            summary: rev.summary,
            revisionNumber: rev.revisionNumber,
            author: rev.author
              ? { username: (rev.author as { username: string; displayName: string | null }).username, displayName: (rev.author as { username: string; displayName: string | null }).displayName }
              : null,
            editorUsername: rev.editorUser
              ? (rev.editorUser as { username: string }).username
              : null,
            createdAt: rev.createdAt
          }
        : null,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt
    };
  }

  /**
   * Maps a DocsPageEntity to a lightweight DocsTreeItem for index/tree responses.
   */
  private toTreeItem(page: DocsPageEntity): DocsTreeItem {
    return {
      id: page.id,
      title: page.title,
      path: page.path,
      depth: page.depth,
      parentId: page.parentId,
      hasChildren: false, // Populated by caller when needed; default false for now
      createdAt: page.createdAt,
      updatedAt: page.updatedAt
    };
  }

  /**
   * Maps a DocsRevisionEntity (with loaded page and users) to the public
   * DocsRecentEditShape DTO.
   */
  private toRecentEditShape(revision: DocsRevisionEntity): DocsRecentEditShape {
    const page = revision.page as DocsPageEntity;
    const editorUser = revision.editorUser as { username: string; displayName: string | null } | null;
    const authorUser = revision.author as { username: string; displayName: string | null } | null;
    const editor = editorUser ?? authorUser;
    return {
      pageId: page.id,
      title: page.title,
      path: page.path,
      editor: editor ? { username: editor.username, displayName: editor.displayName } : null,
      editedAt: revision.createdAt
    };
  }
}
