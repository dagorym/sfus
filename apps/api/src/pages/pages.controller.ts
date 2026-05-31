import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import type { CreatePageInput, UpdatePageInput } from "./pages.service";
import { PagesService } from "./pages.service";
import type { StandalonePageEntity } from "./entities/standalone-page.entity";
import type { PageRevisionEntity } from "./entities/page-revision.entity";

/**
 * PagesController exposes two access surfaces:
 *
 * 1. Public routes (GET /pages/:slug) — no authentication required; only
 *    published pages are returned.
 *
 * 2. Admin management routes (POST/PATCH /pages/admin/**) — require an active
 *    session AND the global "admin" role enforced by PagesService.
 *    Authorization is delegated to PagesService.assertAdminManagementAccess().
 */
@ApiTags("pages")
@Controller("pages")
export class PagesController {
  constructor(
    private readonly pagesService: PagesService,
    private readonly authService: AuthService
  ) {}

  // ---------------------------------------------------------------------------
  // Public routes — guest-accessible, published content only
  // ---------------------------------------------------------------------------

  @Get(":slug")
  @ApiOperation({ summary: "Get a single published standalone page by slug (public)." })
  @ApiOkResponse({ description: "Published standalone page returned." })
  @ApiNotFoundResponse({ description: "Page not found or not published." })
  async getPublishedBySlug(@Param("slug") slug: string): Promise<{ page: PageDetail }> {
    const page = await this.pagesService.findPublishedBySlug(slug);
    if (!page) {
      throw new NotFoundException("Standalone page not found.");
    }
    // Load the current revision to supply the body content.
    const body = await this.resolveCurrentBody(page.id, page.currentRevisionId);
    return { page: toDetail(page, body) };
  }

  // ---------------------------------------------------------------------------
  // Admin management routes — require active session + admin role
  // ---------------------------------------------------------------------------

  @Get("admin/pages")
  @ApiOperation({ summary: "List all standalone pages regardless of status (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  async adminListAll(@Req() request: Request): Promise<{ pages: PageDetail[] }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.pagesService.assertAdminManagementAccess(session.user.globalRole);
    const pages = await this.pagesService.findAll();
    // For list view, body is empty string (body is only needed in detail views).
    return { pages: pages.map((p) => toDetail(p, "")) };
  }

  @Get("admin/pages/:id")
  @ApiOperation({ summary: "Get a single standalone page by id (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Page not found." })
  async adminGetById(
    @Req() request: Request,
    @Param("id") id: string
  ): Promise<{ page: PageDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.pagesService.assertAdminManagementAccess(session.user.globalRole);
    const page = await this.pagesService.findById(id);
    if (!page) {
      throw new NotFoundException("Standalone page not found.");
    }
    const body = await this.resolveCurrentBody(page.id, page.currentRevisionId);
    return { page: toDetail(page, body) };
  }

  @Post("admin/pages")
  @ApiOperation({ summary: "Create a new standalone page in draft status (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiBadRequestResponse({ description: "Invalid input." })
  async adminCreate(
    @Req() request: Request,
    @Body() body: unknown
  ): Promise<{ page: PageDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.pagesService.assertAdminManagementAccess(session.user.globalRole);
    const input = parseCreateInput(body);
    const page = await this.pagesService.create(session.user.id, input);
    return { page: toDetail(page, input.body) };
  }

  @Patch("admin/pages/:id")
  @ApiOperation({ summary: "Update a standalone page, creating a new revision (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Page not found." })
  async adminUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ): Promise<{ page: PageDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.pagesService.assertAdminManagementAccess(session.user.globalRole);
    const input = parseUpdateInput(body);
    const page = await this.pagesService.update(id, session.user.id, input);
    const bodyContent = await this.resolveCurrentBody(page.id, page.currentRevisionId);
    return { page: toDetail(page, bodyContent) };
  }

  @Post("admin/pages/:id/publish")
  @ApiOperation({ summary: "Publish a standalone page immediately (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Page not found." })
  async adminPublish(
    @Req() request: Request,
    @Param("id") id: string
  ): Promise<{ page: PageDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.pagesService.assertAdminManagementAccess(session.user.globalRole);
    const page = await this.pagesService.publish(id);
    const body = await this.resolveCurrentBody(page.id, page.currentRevisionId);
    return { page: toDetail(page, body) };
  }

  @Post("admin/pages/:id/unpublish")
  @ApiOperation({ summary: "Unpublish a standalone page (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Page not found." })
  async adminUnpublish(
    @Req() request: Request,
    @Param("id") id: string
  ): Promise<{ page: PageDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.pagesService.assertAdminManagementAccess(session.user.globalRole);
    const page = await this.pagesService.unpublish(id);
    const body = await this.resolveCurrentBody(page.id, page.currentRevisionId);
    return { page: toDetail(page, body) };
  }

  @Get("admin/pages/:id/revisions")
  @ApiOperation({ summary: "List all revisions for a standalone page (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Page not found." })
  async adminListRevisions(
    @Req() request: Request,
    @Param("id") id: string
  ): Promise<{ revisions: RevisionDetail[] }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.pagesService.assertAdminManagementAccess(session.user.globalRole);
    const page = await this.pagesService.findById(id);
    if (!page) {
      throw new NotFoundException("Standalone page not found.");
    }
    const revisions = await this.pagesService.findRevisions(id);
    return { revisions: revisions.map(toRevisionDetail) };
  }

  @Post("admin/pages/:id/restore/:revisionId")
  @ApiOperation({ summary: "Restore a standalone page to a prior revision (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Page or revision not found." })
  async adminRestoreRevision(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("revisionId") revisionId: string
  ): Promise<{ page: PageDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.pagesService.assertAdminManagementAccess(session.user.globalRole);
    const page = await this.pagesService.restoreRevision(id, revisionId, session.user.id);
    const body = await this.resolveCurrentBody(page.id, page.currentRevisionId);
    return { page: toDetail(page, body) };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Loads the body from the current revision. Returns empty string when no
   * current revision is set (e.g., freshly created page with no revisions yet).
   */
  private async resolveCurrentBody(pageId: string, currentRevisionId: string | null): Promise<string> {
    if (!currentRevisionId) return "";
    const revisions = await this.pagesService.findRevisions(pageId);
    const current = revisions.find((r) => r.id === currentRevisionId);
    return current?.body ?? "";
  }
}

// ---------------------------------------------------------------------------
// Response shape helpers
// ---------------------------------------------------------------------------

interface PageDetail {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: string;
  publishedAt: string | null;
  currentRevisionId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface RevisionDetail {
  id: string;
  pageId: string;
  authorUserId: string;
  title: string;
  body: string;
  revisionNumber: number;
  createdAt: string;
}

function toDetail(page: StandalonePageEntity, body: string): PageDetail {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    body,
    status: page.status,
    publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null,
    currentRevisionId: page.currentRevisionId,
    createdByUserId: page.createdByUserId,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString()
  };
}

function toRevisionDetail(revision: PageRevisionEntity): RevisionDetail {
  return {
    id: revision.id,
    pageId: revision.pageId,
    authorUserId: revision.authorUserId,
    title: revision.title,
    body: revision.body,
    revisionNumber: revision.revisionNumber,
    createdAt: revision.createdAt.toISOString()
  };
}

// ---------------------------------------------------------------------------
// Input parsers — typed wrappers that throw BadRequestException on bad input
// ---------------------------------------------------------------------------

function parseCreateInput(body: unknown): CreatePageInput {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) {
    throw new BadRequestException("title is required.");
  }
  if (typeof b.slug !== "string" || !b.slug.trim()) {
    throw new BadRequestException("slug is required.");
  }
  if (typeof b.body !== "string") {
    throw new BadRequestException("body is required.");
  }
  return { title: b.title, slug: b.slug, body: b.body };
}

function parseUpdateInput(body: unknown): UpdatePageInput {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const input: UpdatePageInput = {};
  if (b.title !== undefined) {
    if (typeof b.title !== "string") throw new BadRequestException("title must be a string.");
    input.title = b.title;
  }
  if (b.slug !== undefined) {
    if (typeof b.slug !== "string") throw new BadRequestException("slug must be a string.");
    input.slug = b.slug;
  }
  if (b.body !== undefined) {
    if (typeof b.body !== "string") throw new BadRequestException("body must be a string.");
    input.body = b.body;
  }
  return input;
}
