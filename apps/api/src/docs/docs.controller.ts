import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
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
  ApiNoContentResponse,
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
  DocRollbackInput,
  DocWriteResultShape,
  DocsDiffShape,
  DocsHistoryShape,
  DocsSingleRevisionShape,
  DocsPageShape,
  DocsRecentEditShape,
  DocsTreeItem,
  RenameDocPageInput
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
  // PATCH /docs/:id — rename a page (slug and/or title, staff-gated)
  // ===========================================================================

  /**
   * Renames an existing wiki page's slug and/or title within the same parent.
   *
   * When the slug changes, recomputes this page's path/path_hash and
   * transactionally rewrites every descendant's path/path_hash (AC1, P10).
   * A title-only rename leaves all paths unchanged (AC2).
   *
   * Cross-parent move/reparent is NOT implemented (deferred).
   *
   * Authorization: moderator or admin only. Anonymous and `user`-role callers
   * receive `403` from `assertDocWriteAccess`.
   *
   * @param id   Page UUID.
   * @body `{ slug?, title? }` — at least one must be provided.
   * @returns 200 with `{ page }` reflecting the rename result.
   * @throws 400 Invalid slug/title or no field provided.
   * @throws 401 No active session.
   * @throws 403 Moderator or admin role required.
   * @throws 404 Page not found or deleted.
   * @throws 409 New path collides with an existing page in the same scope.
   */
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottleGuard)
  @ThrottleLabel(THROTTLE_LABEL_DOC_EDIT)
  @ApiOperation({ summary: "Rename a wiki page slug/title within the same parent (moderator/admin)." })
  @ApiOkResponse({
    description:
      "Page renamed. When slug changed, all descendant paths are rewritten atomically."
  })
  @ApiBadRequestResponse({
    description: "Invalid slug or title, or neither field provided."
  })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiNotFoundResponse({ description: "Page not found or deleted (oracle parity)." })
  @ApiConflictResponse({ description: "New path already exists in this scope." })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded." })
  async renamePage(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: RenameDocPageInput
  ): Promise<{ page: DocWriteResultShape }> {
    // 401: session required before any data operation.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    // 403: single authorization gate for all site-scope doc writes.
    this.docsService.assertDocWriteAccess(session.user.globalRole, "site");
    // Input guard: at least one field must be present.
    if (body?.slug === undefined && body?.title === undefined) {
      throw new BadRequestException("At least one of 'slug' or 'title' must be provided.");
    }
    const page = await this.docsService.renamePage(id, body);
    return { page };
  }

  // ===========================================================================
  // DELETE /docs/:id — soft-delete a page (staff-gated)
  // ===========================================================================

  /**
   * Soft-deletes a wiki page by setting its status to 'deleted'.
   *
   * The page's revision history is preserved. Soft-deleted pages disappear
   * from all public reads (ST-2) (AC3).
   *
   * Rejected with 409 when the page has any non-deleted children — the tree
   * is never orphaned (AC4).
   *
   * Authorization: moderator or admin only. Anonymous and `user`-role callers
   * receive `403` from `assertDocWriteAccess`.
   *
   * @param id Page UUID.
   * @returns 204 No Content on success.
   * @throws 401 No active session.
   * @throws 403 Moderator or admin role required.
   * @throws 404 Page not found or already deleted.
   * @throws 409 Page has non-deleted children.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ThrottleGuard)
  @ThrottleLabel(THROTTLE_LABEL_DOC_EDIT)
  @ApiOperation({ summary: "Soft-delete a wiki page (moderator/admin)." })
  @ApiNoContentResponse({
    description:
      "Page soft-deleted (status=deleted). Revisions preserved. " +
      "Page no longer appears in public reads."
  })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiNotFoundResponse({ description: "Page not found or already deleted." })
  @ApiConflictResponse({
    description: "Page has non-deleted children; cannot soft-delete until children are removed."
  })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded." })
  async softDeletePage(
    @Req() request: Request,
    @Param("id") id: string
  ): Promise<void> {
    // 401: session required before any data operation.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    // 403: single authorization gate for all site-scope doc writes.
    this.docsService.assertDocWriteAccess(session.user.globalRole, "site");
    await this.docsService.softDeletePage(id);
  }

  // ===========================================================================
  // GET /docs/:id/history — ordered revision metadata (ST-5)
  // ===========================================================================

  /**
   * Returns ordered revision metadata for a wiki page (ascending revision number).
   *
   * Oracle parity (P12): a non-readable, deleted, or nonexistent page returns the
   * same 404 as GET /docs/*path. No 403 vs 404 distinction.
   *
   * No authentication required.
   *
   * @param id Page UUID.
   * @returns 200 with `{ history }` (revisions ordered by revision_number ASC).
   * @throws 404 Page not found or not publicly accessible (oracle parity).
   */
  @Get(":id/history")
  @ApiOperation({ summary: "List ordered revision metadata for a wiki page." })
  @ApiOkResponse({
    description: "Revision metadata returned ordered by revision_number ASC."
  })
  @ApiNotFoundResponse({
    description: "Page not found or not publicly accessible (oracle parity; P12)."
  })
  async getPageHistory(@Param("id") id: string): Promise<{ history: DocsHistoryShape }> {
    const history = await this.docsService.getPageHistory(id);
    return { history };
  }

  // ===========================================================================
  // GET /docs/:id/revisions/:revisionNumber — single revision body (ST-5)
  // ===========================================================================

  /**
   * Returns the full body of a specific revision for a wiki page.
   *
   * Oracle parity (P12): a non-readable, deleted, or nonexistent page (or a missing
   * revision number) returns the same 404 as ST-2.
   *
   * No authentication required.
   *
   * @param id             Page UUID.
   * @param revisionNumber Revision number (positive integer, 1-based).
   * @returns 200 with `{ revision }` including body, title, author, and timestamp.
   * @throws 400 Invalid revision number.
   * @throws 404 Page or revision not found (oracle parity).
   */
  @Get(":id/revisions/:revisionNumber")
  @ApiOperation({ summary: "Retrieve a single revision body for a wiki page." })
  @ApiOkResponse({
    description: "Single revision body returned."
  })
  @ApiBadRequestResponse({ description: "Invalid revision number." })
  @ApiNotFoundResponse({
    description: "Page or revision not found (oracle parity; P12)."
  })
  async getRevisionByNumber(
    @Param("id") id: string,
    @Param("revisionNumber") revisionNumberStr: string
  ): Promise<{ revision: DocsSingleRevisionShape }> {
    const revisionNumber = parseInt(revisionNumberStr, 10);
    if (!Number.isFinite(revisionNumber) || revisionNumber < 1) {
      throw new BadRequestException("revisionNumber must be a positive integer.");
    }
    const revision = await this.docsService.getRevisionByNumber(id, revisionNumber);
    return { revision };
  }

  // ===========================================================================
  // GET /docs/:id/diff?from=&to= — deterministic line-level diff (ST-5)
  // ===========================================================================

  /**
   * Returns a deterministic line-level diff between two revisions of a wiki page.
   *
   * The diff is computed server-side using the LCS algorithm and returns ordered
   * hunks of type "unchanged" | "added" | "removed".
   *
   * Oracle parity (P12): a non-readable, deleted, or nonexistent page returns the
   * same 404 as ST-2.
   *
   * No authentication required.
   *
   * @param id   Page UUID.
   * @param from Revision number of the "from" (base) revision.
   * @param to   Revision number of the "to" (target) revision.
   * @returns 200 with `{ diff }` containing ordered hunks.
   * @throws 400 Invalid or equal from/to revision numbers.
   * @throws 404 Page or either revision not found (oracle parity).
   */
  @Get(":id/diff")
  @ApiOperation({ summary: "Compute a deterministic line-level diff between two revisions." })
  @ApiOkResponse({
    description: "Line-level diff returned as ordered hunks (unchanged/added/removed)."
  })
  @ApiBadRequestResponse({
    description: "Invalid or equal from/to revision numbers."
  })
  @ApiNotFoundResponse({
    description: "Page or either revision not found (oracle parity; P12)."
  })
  async getDiff(
    @Param("id") id: string,
    @Query("from") fromStr?: string,
    @Query("to") toStr?: string
  ): Promise<{ diff: DocsDiffShape }> {
    if (fromStr === undefined || toStr === undefined) {
      throw new BadRequestException("Both 'from' and 'to' query parameters are required.");
    }
    const fromRevNumber = parseInt(fromStr, 10);
    const toRevNumber = parseInt(toStr, 10);
    if (!Number.isFinite(fromRevNumber) || fromRevNumber < 1) {
      throw new BadRequestException("'from' must be a positive integer revision number.");
    }
    if (!Number.isFinite(toRevNumber) || toRevNumber < 1) {
      throw new BadRequestException("'to' must be a positive integer revision number.");
    }
    const diff = await this.docsService.getDiff(id, fromRevNumber, toRevNumber);
    return { diff };
  }

  // ===========================================================================
  // POST /docs/:id/rollback — non-destructive rollback (ST-5, staff-gated, throttled)
  // ===========================================================================

  /**
   * Creates a new highest-numbered revision whose content equals the target revision
   * (non-destructive rollback), updates `current_revision_id`, and preserves all
   * existing revisions.
   *
   * Authorization: moderator or admin only. Anonymous and `user`-role callers
   * receive `403` from `assertDocWriteAccess`.
   *
   * @param id   Page UUID.
   * @body `{ revisionNumber }` — the revision number to roll back to.
   * @returns 201 with `{ page }` reflecting the new rollback revision.
   * @throws 400 Invalid revisionNumber.
   * @throws 401 No active session.
   * @throws 403 Moderator or admin role required.
   * @throws 404 Page or target revision not found.
   * @throws 429 Rate limit exceeded.
   */
  @Post(":id/rollback")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottleGuard)
  @ThrottleLabel(THROTTLE_LABEL_DOC_EDIT)
  @ApiOperation({ summary: "Non-destructive rollback: create a new revision equal to the target (moderator/admin)." })
  @ApiCreatedResponse({
    description:
      "New revision created with content equal to the target; current_revision_id updated. " +
      "All existing revisions preserved (non-destructive)."
  })
  @ApiBadRequestResponse({ description: "Invalid revisionNumber." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiNotFoundResponse({
    description: "Page or target revision not found."
  })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded." })
  async rollbackPage(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: DocRollbackInput
  ): Promise<{ page: DocWriteResultShape }> {
    // 401: session required before any data operation.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    // 403: single authorization gate for all site-scope doc writes.
    this.docsService.assertDocWriteAccess(session.user.globalRole, "site");
    // Input guard.
    if (typeof body?.revisionNumber !== "number" || !Number.isInteger(body.revisionNumber) || body.revisionNumber < 1) {
      throw new BadRequestException("revisionNumber must be a positive integer.");
    }
    const page = await this.docsService.rollbackPage(session.user.id, id, body);
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
