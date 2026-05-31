import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { PageRevisionEntity } from "./entities/page-revision.entity";
import { StandalonePageEntity } from "./entities/standalone-page.entity";

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
}
