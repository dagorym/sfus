import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { ThrottleGuard, ThrottleLabel } from "../common/throttle/throttle.guard";
import { DocsService } from "./docs.service";
import type {
  AddDocRevisionInput,
  CreateDocPageInput,
  DocWriteResultShape,
  DocsPageShape,
  DocsRecentEditShape,
  DocsTreeItem
} from "./docs.types";

/**
 * DocsController exposes the public read surface for the Documents wiki.
 *
 * All routes are unauthenticated (no session required). Every visibility decision
 * is routed through AuthorizationService.evaluate() for an anonymous actor —
 * no inline re-derived predicates.
 *
 * Oracle parity (P12): nonexistent, deleted, and non-publicly-readable pages
 * all return the same 404 with an identical message. No 403 vs 404 distinction,
 * no message that distinguishes hidden from nonexistent.
 *
 * Route ordering: the "recent" literal route must be declared BEFORE the `*path`
 * catch-all so NestJS resolves `GET /docs/recent` as the recent-feed handler
 * rather than treating "recent" as a path segment.
 */
/** Route label for docs page creation throttle key. */
const THROTTLE_LABEL_DOC_CREATE = "doc-page-create";
/** Route label for docs revision creation throttle key. */
const THROTTLE_LABEL_DOC_EDIT = "doc-page-edit";

@ApiTags("docs")
@Controller("docs")
export class DocsController {
  constructor(
    private readonly docsService: DocsService,
    private readonly authService: AuthService
  ) {}

  // ===========================================================================
  // GET /docs — site root tree / children of ?parentPath=
  // ===========================================================================

  /**
   * Returns the site page tree: the top-level (root) pages when no `parentPath`
   * is given, or the direct children of the specified parent path.
   *
   * Only site-scoped, `status='published'`, publicly-readable pages are included.
   * Project-scoped pages are always excluded (no oracle leak).
   *
   * No authentication required.
   *
   * @param parentPath Optional full path of the parent page (e.g. `getting-started`).
   *                   Omit to get root-level pages.
   * @returns 200 with `{ pages }` ordered by title ASC.
   * @throws 404 when `parentPath` is provided but the parent does not exist or
   *         is not publicly accessible (oracle parity — same message as page not found).
   */
  @Get()
  @ApiOperation({ summary: "List site-root pages or direct children of a parent path." })
  @ApiOkResponse({
    description:
      "Site page tree returned. Only site-scoped, published, publicly-readable pages are included. " +
      "Project-scoped pages are excluded."
  })
  @ApiNotFoundResponse({
    description:
      "parentPath not found, or is not publicly accessible (oracle parity — same message as page not found)."
  })
  async listPageTree(@Query("parentPath") parentPath?: string): Promise<{ pages: DocsTreeItem[] }> {
    const pages = await this.docsService.listPageTree(parentPath);
    return { pages };
  }

  // ===========================================================================
  // GET /docs/recent — recent published site-doc edits (landing feed)
  // ===========================================================================

  /**
   * Returns recent publicly-readable, site-scope, non-deleted document edits
   * for use by the landing-page activity feed.
   *
   * Only pages that pass the public visibility gate are included. Non-readable,
   * deleted, and project-scoped pages are excluded — no oracle leak.
   *
   * No authentication required.
   *
   * @param limit Number of recent edits to return (default 5; hard cap 20).
   * @returns 200 with `{ docs }` ordered most-recently-edited first.
   *          Stable empty list when no public activity exists.
   */
  @Get("recent")
  @ApiOperation({ summary: "List recent publicly-readable site-doc edits (landing-page feed)." })
  @ApiOkResponse({
    description:
      "Recent public document edits returned, ordered most-recently-edited first. " +
      "Non-readable, deleted, and project-scoped pages are excluded. " +
      "Returns a stable empty list when no public activity exists (oracle parity; P12)."
  })
  async listRecentEdits(@Query("limit") limit?: string): Promise<{ docs: DocsRecentEditShape[] }> {
    const docs = await this.docsService.listRecentEdits({
      limit: limit !== undefined ? parseInt(limit, 10) : undefined
    });
    return { docs };
  }

  // ===========================================================================
  // POST /docs — create a new wiki page (staff-gated, throttled)
  // ===========================================================================

  /**
   * Creates a new wiki page, optionally under a parent.
   *
   * Derives `path`, `path_hash`, and `depth` from the slug and optional parent.
   * Creates revision #1 and sets `current_revision_id` in a single transaction.
   *
   * Authorization: moderator or admin only. Anonymous and `user`-role callers
   * receive `403` from `assertDocWriteAccess`.
   *
   * @body `{ title, slug, body, summary?, parentPath?, parentId? }`
   * @returns 201 with `{ page }` including derived path and revision #1.
   * @throws 400 Invalid slug/title or parent does not exist.
   * @throws 401 No active session.
   * @throws 403 Moderator or admin role required.
   * @throws 409 Path collision — a page with the same full path already exists.
   * @throws 429 Rate limit exceeded.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottleGuard)
  @ThrottleLabel(THROTTLE_LABEL_DOC_CREATE)
  @ApiOperation({ summary: "Create a new wiki page (moderator/admin)." })
  @ApiCreatedResponse({
    description: "Page created with revision #1 and current_revision_id set."
  })
  @ApiBadRequestResponse({
    description: "Invalid slug or title, or parent page does not exist."
  })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiConflictResponse({ description: "A page with this full path already exists." })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded." })
  async createPage(
    @Req() request: Request,
    @Body() body: CreateDocPageInput
  ): Promise<{ page: DocWriteResultShape }> {
    // 401: session required before any data operation.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    // 403: single authorization gate for all site-scope doc writes.
    this.docsService.assertDocWriteAccess(session.user.globalRole, "site");
    // Input guard: required fields must be present (no global ValidationPipe).
    if (typeof body?.title !== "string" || body.title.trim().length === 0) {
      throw new BadRequestException("title must be a non-empty string.");
    }
    if (typeof body?.slug !== "string" || body.slug.trim().length === 0) {
      throw new BadRequestException("slug must be a non-empty string.");
    }
    const page = await this.docsService.createPage(session.user.id, body);
    return { page };
  }

  // ===========================================================================
  // POST /docs/:id/revisions — append a revision to an existing page (staff-gated, throttled)
  // ===========================================================================

  /**
   * Appends a new revision to an existing wiki page.
   *
   * Bumps `revision_number`, updates `current_revision_id`, `title`, and
   * `updated_at` in a single transaction.
   *
   * Authorization: moderator or admin only. Anonymous and `user`-role callers
   * receive `403` from `assertDocWriteAccess`.
   *
   * @param id Page UUID.
   * @body `{ title, body, summary? }`
   * @returns 201 with `{ page }` reflecting the new revision.
   * @throws 400 Invalid title.
   * @throws 401 No active session.
   * @throws 403 Moderator or admin role required.
   * @throws 404 Page not found or deleted.
   * @throws 429 Rate limit exceeded.
   */
  @Post(":id/revisions")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottleGuard)
  @ThrottleLabel(THROTTLE_LABEL_DOC_EDIT)
  @ApiOperation({ summary: "Append a new revision to a wiki page (moderator/admin)." })
  @ApiCreatedResponse({
    description: "Revision added; page current_revision_id, title, and updated_at updated."
  })
  @ApiBadRequestResponse({ description: "Invalid title." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiNotFoundResponse({ description: "Page not found or deleted (oracle parity)." })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded." })
  async addRevision(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: AddDocRevisionInput
  ): Promise<{ page: DocWriteResultShape }> {
    // 401: session required before any data operation.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });

    // Load the page to determine scope for the authorization gate.
    // We pass "site" as the scope because ST-3 only handles site-scoped pages;
    // the scope is known from the create flow. For existing pages we could load
    // the page entity; using the "site" string is safe until project docs exist.
    this.docsService.assertDocWriteAccess(session.user.globalRole, "site");

    // Input guard: required fields must be present.
    if (typeof body?.title !== "string" || body.title.trim().length === 0) {
      throw new BadRequestException("title must be a non-empty string.");
    }
    if (typeof body?.body !== "string") {
      throw new BadRequestException("body must be a string.");
    }
    const page = await this.docsService.addRevision(session.user.id, id, body);
    return { page };
  }

  // ===========================================================================
  // GET /docs/*path — resolve a page by full path
  // ===========================================================================

  /**
   * Resolves a published site page by its full path (e.g. `getting-started/installation`).
   *
   * Returns the page's current revision body plus an ordered breadcrumb ancestry array.
   *
   * Oracle parity (P12): a nonexistent path, a deleted page, and a non-publicly-readable
   * page all return the **same** 404 with an identical message. No 403 vs 404 distinction.
   *
   * No authentication required.
   *
   * @param path The full slash-joined path as an array of segments (Express wildcard).
   * @returns 200 with `{ page }` including current revision body and breadcrumbs.
   * @throws 404 Page not found or not publicly accessible (oracle parity).
   */
  @Get("*path")
  @ApiOperation({ summary: "Resolve a published site page by full path, with current revision and breadcrumbs." })
  @ApiOkResponse({
    description:
      "Page returned with its current revision body and ordered breadcrumb ancestry. " +
      "Only published, publicly-readable site pages are resolved."
  })
  @ApiNotFoundResponse({
    description:
      "Page not found, or is not publicly accessible. " +
      "The error message is identical for nonexistent, deleted, and hidden pages (oracle parity; P12)."
  })
  async getPageByPath(@Param("path") pathParam: string | string[]): Promise<{ page: DocsPageShape }> {
    // NestJS may pass the wildcard param as a string ("a/b/c") or as an array
    // depending on the Express adapter version. Normalise to a single slash-joined string.
    const rawPath = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;

    if (!rawPath || rawPath.trim().length === 0) {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }

    const page = await this.docsService.getPageByPath(rawPath);
    return { page };
  }
}
