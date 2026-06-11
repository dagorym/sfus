import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import { DocsService } from "./docs.service";
import type { DocsPageShape, DocsRecentEditShape, DocsTreeItem } from "./docs.types";

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
@ApiTags("docs")
@Controller("docs")
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

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
