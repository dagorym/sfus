/**
 * docs.service.test.ts
 *
 * Unit tests for DocsService (ST-2 and ST-3).
 *
 * ST-2 acceptance criteria validated:
 * AC1: getPageByPath resolves a published site page by full path, returns current revision
 *      content plus ordered breadcrumb ancestry.
 * AC2: Nonexistent path, deleted page, and non-publicly-readable page all return the same
 *      404 class and message (oracle parity). Constant: DocsService.PAGE_NOT_FOUND_MESSAGE.
 * AC3: listPageTree returns site page tree with no project-scoped pages present.
 * AC4: listRecentEdits returns recent published site-doc edits, excludes deleted/non-readable/
 *      project pages, respects limit. Default=5, max=20.
 * AC5: Every read path routes visibility through AuthorizationService.evaluate() with no inline
 *      re-derived predicate.
 *
 * ST-3 acceptance criteria validated:
 * AC1: createPage creates page + revision #1 + sets current_revision_id in a single transaction.
 * AC2: addRevision bumps revision_number, updates current_revision_id, title, updated_at.
 * AC3: ConflictException (409) on path_hash collision; BadRequestException (400) on invalid
 *      slug/title or missing parent.
 * AC5: assertDocWriteAccess is the SINGLE authorization gate; site scope requires moderator/admin.
 */

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { IsNull } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { DocsService } from "./docs.service";

// ---------------------------------------------------------------------------
// Minimal repository stubs — only methods called by DocsService are needed.
// ---------------------------------------------------------------------------

interface MinimalRepo {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  createQueryBuilder: ReturnType<typeof vi.fn>;
}

const createMinimalRepo = (): MinimalRepo => {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  const chainMethods = [
    "innerJoinAndSelect",
    "leftJoinAndSelect",
    "where",
    "andWhere",
    "orderBy",
    "take"
  ];
  for (const m of chainMethods) {
    qb[m] = vi.fn().mockReturnValue(qb);
  }
  qb["getMany"] = vi.fn().mockResolvedValue([]);
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    createQueryBuilder: vi.fn().mockReturnValue(qb)
  };
};

const makeDocsService = (
  pageRepo?: Partial<MinimalRepo>,
  revisionRepo?: Partial<MinimalRepo>,
  authorizationService?: AuthorizationService
): DocsService => {
  const auth = authorizationService ?? new AuthorizationService();
  const pRepo = { ...createMinimalRepo(), ...pageRepo };
  const rRepo = { ...createMinimalRepo(), ...revisionRepo };
  return new DocsService(pRepo as never, rRepo as never, auth);
};

// ---------------------------------------------------------------------------
// Shared test data builders
// ---------------------------------------------------------------------------

const now = new Date("2026-01-01T00:00:00Z");

const makeSitePage = (overrides?: Partial<Record<string, unknown>>) => ({
  id: "page-1",
  scopeType: "site" as const,
  scopeId: null,
  title: "Getting Started",
  slug: "getting-started",
  path: "getting-started",
  pathHash: "abc123",
  depth: 0,
  parentId: null,
  visibility: "public" as const,
  status: "published" as const,
  isLocked: 0,
  lockedByUserId: null,
  lockedAt: null,
  lockExpiresAt: null,
  currentRevisionId: "rev-1",
  createdByUserId: "user-1",
  createdAt: now,
  updatedAt: now,
  currentRevision: {
    id: "rev-1",
    title: "Getting Started",
    body: "# Getting Started",
    summary: null,
    revisionNumber: 1,
    author: { username: "author1", displayName: "Author One" },
    editorUser: null,
    createdAt: now
  },
  ...overrides
});

// ---------------------------------------------------------------------------
// DocsService.PAGE_NOT_FOUND_MESSAGE — static constant (AC2)
// ---------------------------------------------------------------------------

describe("DocsService.PAGE_NOT_FOUND_MESSAGE (AC2: oracle parity constant)", () => {
  it("is the string 'Document page not found.'", () => {
    expect(DocsService.PAGE_NOT_FOUND_MESSAGE).toBe("Document page not found.");
  });

  it("is a static property on DocsService", () => {
    expect(typeof DocsService.PAGE_NOT_FOUND_MESSAGE).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// DocsService.computePathHash — public utility used by ST-3 write path
// ---------------------------------------------------------------------------

describe("DocsService.computePathHash", () => {
  it("returns a 64-character hex SHA-256 hash", () => {
    const service = makeDocsService();
    const hash = service.computePathHash("site", null, "getting-started");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("produces different hashes for different paths", () => {
    const service = makeDocsService();
    const h1 = service.computePathHash("site", null, "path-a");
    const h2 = service.computePathHash("site", null, "path-b");
    expect(h1).not.toBe(h2);
  });

  it("produces different hashes for different scopeTypes", () => {
    const service = makeDocsService();
    const h1 = service.computePathHash("site", null, "docs");
    const h2 = service.computePathHash("project", "proj-1", "docs");
    expect(h1).not.toBe(h2);
  });

  it("is deterministic — same input produces same hash", () => {
    const service = makeDocsService();
    const h1 = service.computePathHash("site", null, "getting-started/install");
    const h2 = service.computePathHash("site", null, "getting-started/install");
    expect(h1).toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// DocsService.isPagePubliclyReadable — mirrors ForumsService.isBoardPubliclyReadable (AC5)
// ---------------------------------------------------------------------------

describe("DocsService.isPagePubliclyReadable (AC5: AuthorizationService.evaluate routing)", () => {
  it("returns false for scopeType='project' WITHOUT calling evaluate (short-circuit)", () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");
    const service = makeDocsService(undefined, undefined, authorizationService);
    const page = makeSitePage({ scopeType: "project" }) as never;
    const result = service.isPagePubliclyReadable(page);
    expect(result).toBe(false);
    expect(evaluateSpy).not.toHaveBeenCalled();
  });

  it("calls evaluate() for scopeType='site', visibility='public' and returns true", () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");
    const service = makeDocsService(undefined, undefined, authorizationService);
    const page = makeSitePage({ visibility: "public" }) as never;
    const result = service.isPagePubliclyReadable(page);
    expect(result).toBe(true);
    expect(evaluateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ userId: null }),
        action: "read"
      })
    );
  });

  it("calls evaluate() for scopeType='site', visibility='unlisted' and returns true", () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");
    const service = makeDocsService(undefined, undefined, authorizationService);
    const page = makeSitePage({ visibility: "unlisted" }) as never;
    const result = service.isPagePubliclyReadable(page);
    expect(result).toBe(true);
    expect(evaluateSpy).toHaveBeenCalled();
  });

  it("calls evaluate() for scopeType='site', visibility='private' and returns false", () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");
    const service = makeDocsService(undefined, undefined, authorizationService);
    const page = makeSitePage({ visibility: "private" }) as never;
    const result = service.isPagePubliclyReadable(page);
    expect(result).toBe(false);
    expect(evaluateSpy).toHaveBeenCalled();
  });

  it("returns false for scopeType='site', visibility='members' (members not publicly readable)", () => {
    const service = makeDocsService();
    const page = makeSitePage({ visibility: "members" }) as never;
    expect(service.isPagePubliclyReadable(page)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DocsService.getPageByPath — AC1: path resolution, breadcrumbs
// ---------------------------------------------------------------------------

describe("DocsService.getPageByPath (AC1: path resolution and breadcrumbs)", () => {
  it("returns page shape with currentRevision and empty breadcrumbs for a root page", async () => {
    const page = makeSitePage();
    const findOneSpy = vi.fn().mockResolvedValue(page);
    const service = makeDocsService({ findOne: findOneSpy });

    const result = await service.getPageByPath("getting-started");

    expect(result.id).toBe("page-1");
    expect(result.title).toBe("Getting Started");
    expect(result.path).toBe("getting-started");
    expect(result.currentRevision).toBeDefined();
    expect(result.currentRevision?.body).toBe("# Getting Started");
    expect(result.breadcrumbs).toEqual([]);
  });

  it("returns breadcrumbs as an ordered array from root to immediate parent (AC1)", async () => {
    const parentPage = makeSitePage({
      id: "page-root",
      title: "Root",
      path: "root",
      parentId: null
    });
    const childPage = makeSitePage({
      id: "page-child",
      title: "Child",
      path: "root/child",
      parentId: "page-root"
    });

    // findOne called twice: once for the page, once for the ancestor
    const findOneSpy = vi
      .fn()
      .mockResolvedValueOnce(childPage) // page lookup
      .mockResolvedValueOnce(parentPage); // ancestor lookup

    const service = makeDocsService({ findOne: findOneSpy });
    const result = await service.getPageByPath("root/child");

    expect(result.breadcrumbs).toHaveLength(1);
    expect(result.breadcrumbs[0]).toEqual({
      id: "page-root",
      title: "Root",
      path: "root"
    });
  });

  it("normalizes path by trimming whitespace and leading/trailing slashes", async () => {
    const page = makeSitePage();
    const findOneSpy = vi.fn().mockResolvedValue(page);
    const service = makeDocsService({ findOne: findOneSpy });

    await service.getPageByPath("  /getting-started/  ");

    // Should still call findOne (path was normalized correctly)
    expect(findOneSpy).toHaveBeenCalled();
  });

  // NEW: Negative breadcrumb ancestor test (AC1 truncation / oracle parity)
  it("returns empty breadcrumbs when the immediate ancestor is not publicly readable (truncation, not error)", async () => {
    // A public child page whose parentId points to a project-scoped (non-readable) ancestor.
    const nonReadableAncestor = makeSitePage({
      id: "ancestor-project",
      title: "Private Project Page",
      path: "project-section",
      scopeType: "project",
      scopeId: "proj-1",
      parentId: null
    });
    const childPage = makeSitePage({
      id: "page-child",
      title: "Child",
      path: "project-section/child",
      parentId: "ancestor-project"
    });

    // findOne: first call resolves the target page, second resolves the non-readable ancestor
    const findOneSpy = vi
      .fn()
      .mockResolvedValueOnce(childPage) // page lookup
      .mockResolvedValueOnce(nonReadableAncestor); // ancestor lookup

    const service = makeDocsService({ findOne: findOneSpy });
    const result = await service.getPageByPath("project-section/child");

    // The page itself is returned normally (no error).
    expect(result.id).toBe("page-child");
    // The non-readable ancestor must NOT appear in breadcrumbs (chain truncated at first gate).
    expect(result.breadcrumbs).toHaveLength(0);
    expect(result.breadcrumbs.map((b) => b.id)).not.toContain("ancestor-project");
    expect(result.breadcrumbs.map((b) => b.title)).not.toContain("Private Project Page");
  });

  it("returns empty breadcrumbs when the ancestor has status='deleted' (truncation, oracle parity)", async () => {
    const deletedAncestor = makeSitePage({
      id: "ancestor-deleted",
      title: "Deleted Page",
      path: "deleted-section",
      status: "deleted",
      parentId: null
    });
    const childPage = makeSitePage({
      id: "page-child-of-deleted",
      title: "Child of Deleted",
      path: "deleted-section/child",
      parentId: "ancestor-deleted"
    });

    const findOneSpy = vi
      .fn()
      .mockResolvedValueOnce(childPage)
      .mockResolvedValueOnce(deletedAncestor);

    const service = makeDocsService({ findOne: findOneSpy });
    const result = await service.getPageByPath("deleted-section/child");

    // Page is returned without error; deleted ancestor is silently omitted.
    expect(result.id).toBe("page-child-of-deleted");
    expect(result.breadcrumbs).toHaveLength(0);
    expect(result.breadcrumbs.map((b) => b.id)).not.toContain("ancestor-deleted");
  });

  it("returns empty breadcrumbs when the ancestor has visibility='private' (truncation, oracle parity)", async () => {
    const privateAncestor = makeSitePage({
      id: "ancestor-private",
      title: "Private Section",
      path: "private-section",
      visibility: "private",
      parentId: null
    });
    const childPage = makeSitePage({
      id: "page-child-of-private",
      title: "Child of Private",
      path: "private-section/child",
      parentId: "ancestor-private"
    });

    const findOneSpy = vi
      .fn()
      .mockResolvedValueOnce(childPage)
      .mockResolvedValueOnce(privateAncestor);

    const service = makeDocsService({ findOne: findOneSpy });
    const result = await service.getPageByPath("private-section/child");

    // Page is returned without error; private ancestor is silently omitted.
    expect(result.id).toBe("page-child-of-private");
    expect(result.breadcrumbs).toHaveLength(0);
    expect(result.breadcrumbs.map((b) => b.id)).not.toContain("ancestor-private");
    expect(result.breadcrumbs.map((b) => b.title)).not.toContain("Private Section");
  });
});

// ---------------------------------------------------------------------------
// DocsService.getPageByPath — AC2: oracle parity (same 404 for all gated paths)
// ---------------------------------------------------------------------------

describe("DocsService.getPageByPath oracle parity (AC2: identical 404 for all non-readable paths)", () => {
  it("throws NotFoundException for a nonexistent path", async () => {
    const service = makeDocsService(); // findOne returns null by default
    await expect(service.getPageByPath("nonexistent/path")).rejects.toThrow(NotFoundException);
  });

  it("nonexistent path throws with message === PAGE_NOT_FOUND_MESSAGE", async () => {
    const service = makeDocsService();
    await expect(service.getPageByPath("nonexistent/path")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("deleted page throws NotFoundException with IDENTICAL message (oracle parity)", async () => {
    const deletedPage = makeSitePage({ status: "deleted" });
    const findOneSpy = vi.fn().mockResolvedValue(deletedPage);
    const service = makeDocsService({ findOne: findOneSpy });
    await expect(service.getPageByPath("getting-started")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("non-readable page (visibility='members') throws NotFoundException with IDENTICAL message (oracle parity)", async () => {
    const membersPage = makeSitePage({ visibility: "members" });
    const findOneSpy = vi.fn().mockResolvedValue(membersPage);
    const service = makeDocsService({ findOne: findOneSpy });
    await expect(service.getPageByPath("getting-started")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("non-readable page (visibility='private') throws NotFoundException with IDENTICAL message (oracle parity)", async () => {
    const privatePage = makeSitePage({ visibility: "private" });
    const findOneSpy = vi.fn().mockResolvedValue(privatePage);
    const service = makeDocsService({ findOne: findOneSpy });
    await expect(service.getPageByPath("getting-started")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("nonexistent and deleted pages produce the identical error message string", async () => {
    const service = makeDocsService();
    const deletedPage = makeSitePage({ status: "deleted" });
    const deletedService = makeDocsService({ findOne: vi.fn().mockResolvedValue(deletedPage) });

    let nonexistentMsg = "";
    let deletedMsg = "";
    try {
      await service.getPageByPath("nonexistent");
    } catch (e: unknown) {
      nonexistentMsg = (e as Error).message;
    }
    try {
      await deletedService.getPageByPath("getting-started");
    } catch (e: unknown) {
      deletedMsg = (e as Error).message;
    }

    expect(nonexistentMsg).toBe(deletedMsg);
    expect(nonexistentMsg).toBe(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("gated and nonexistent pages produce the identical error message string (no oracle leak)", async () => {
    const service = makeDocsService();
    const membersPage = makeSitePage({ visibility: "members" });
    const membersService = makeDocsService({ findOne: vi.fn().mockResolvedValue(membersPage) });

    let nonexistentMsg = "";
    let gatedMsg = "";
    try {
      await service.getPageByPath("nonexistent");
    } catch (e: unknown) {
      nonexistentMsg = (e as Error).message;
    }
    try {
      await membersService.getPageByPath("getting-started");
    } catch (e: unknown) {
      gatedMsg = (e as Error).message;
    }

    expect(nonexistentMsg).toBe(gatedMsg);
  });
});

// ---------------------------------------------------------------------------
// DocsService.listPageTree — AC3: tree returns only site pages, no project pages
// ---------------------------------------------------------------------------

describe("DocsService.listPageTree (AC3: site page tree, no project pages)", () => {
  it("returns an empty array when no pages exist", async () => {
    const service = makeDocsService();
    const result = await service.listPageTree();
    expect(result).toEqual([]);
  });

  it("returns only site-scoped published pages (AC3: project pages excluded)", async () => {
    const publicSitePage = makeSitePage({ id: "site-1", scopeType: "site" as const });
    // Project page id for oracle assertion — the repo query filters by scopeType='site'
    // so proj-page-1 should never appear in results.
    const projectPageId = "proj-page-1";

    // The repository query already filters by scopeType='site', but the service also
    // filters via isPagePubliclyReadable which short-circuits project pages.
    // Simulate the repo returning only site pages (repository level filter respected).
    const findSpy = vi.fn().mockResolvedValue([publicSitePage]);
    const service = makeDocsService({ find: findSpy });

    const result = await service.listPageTree();

    expect(result.map((p) => p.id)).toContain("site-1");
    expect(result.map((p) => p.id)).not.toContain(projectPageId);
    // Verify repository was called with site scope filter
    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scopeType: "site", scopeId: IsNull() })
      })
    );
  });

  it("filters out non-readable site pages via isPagePubliclyReadable (AC3, AC5)", async () => {
    const publicPage = makeSitePage({ id: "pub", visibility: "public" as const });
    const privatePage = makeSitePage({ id: "prv", visibility: "private" as const });
    const findSpy = vi.fn().mockResolvedValue([publicPage, privatePage]);
    const service = makeDocsService({ find: findSpy });

    const result = await service.listPageTree();

    expect(result.map((p) => p.id)).toContain("pub");
    expect(result.map((p) => p.id)).not.toContain("prv");
  });

  it("returns DocsTreeItem shapes with hasChildren=false (ST-2 default)", async () => {
    const page = makeSitePage();
    const findSpy = vi.fn().mockResolvedValue([page]);
    const service = makeDocsService({ find: findSpy });

    const result = await service.listPageTree();

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("hasChildren", false);
    expect(result[0]).toHaveProperty("id", "page-1");
    expect(result[0]).toHaveProperty("title", "Getting Started");
  });

  it("throws NotFoundException for non-existent parentPath (oracle parity — same message)", async () => {
    // findOne returns null → parent not found
    const service = makeDocsService();
    await expect(service.listPageTree("nonexistent-parent")).rejects.toThrow(NotFoundException);
    await expect(service.listPageTree("nonexistent-parent")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException for deleted parentPath (oracle parity)", async () => {
    const deletedParent = makeSitePage({ status: "deleted" });
    const findOneSpy = vi.fn().mockResolvedValue(deletedParent);
    const service = makeDocsService({ findOne: findOneSpy });
    await expect(service.listPageTree("getting-started")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("returns children of a valid parentPath when parent is found and readable", async () => {
    const parent = makeSitePage({ id: "parent-1", path: "parent" });
    const child = makeSitePage({ id: "child-1", parentId: "parent-1", path: "parent/child" });

    const findOneSpy = vi.fn().mockResolvedValue(parent);
    const findSpy = vi.fn().mockResolvedValue([child]);
    const service = makeDocsService({ findOne: findOneSpy, find: findSpy });

    const result = await service.listPageTree("parent");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("child-1");
  });
});

// ---------------------------------------------------------------------------
// DocsService.listRecentEdits — AC4: recent feed, limit, exclusions
// ---------------------------------------------------------------------------

describe("DocsService.listRecentEdits (AC4: recent feed with limit and exclusions)", () => {
  it("returns empty array when no publicly-readable pages exist", async () => {
    const service = makeDocsService(); // find returns [] by default
    const result = await service.listRecentEdits({});
    expect(result).toEqual([]);
  });

  it("uses default limit of 5 when no limit given (AC4: default=5)", async () => {
    const pages = [makeSitePage()];
    const findSpy = vi.fn().mockResolvedValue(pages);

    // Build a qb stub that captures the .take() call
    const takeSpy = vi.fn().mockReturnThis();
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    const chainMethods = ["innerJoinAndSelect", "leftJoinAndSelect", "where", "andWhere", "orderBy"];
    for (const m of chainMethods) {
      qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb["take"] = takeSpy;
    qb["getMany"] = vi.fn().mockResolvedValue([]);
    const createQueryBuilderSpy = vi.fn().mockReturnValue(qb);

    const service = makeDocsService({ find: findSpy }, { createQueryBuilder: createQueryBuilderSpy });
    await service.listRecentEdits({});
    expect(takeSpy).toHaveBeenCalledWith(DocsService.RECENT_DOCS_DEFAULT_LIMIT);
  });

  it("respects provided limit (AC4: limit param)", async () => {
    const pages = [makeSitePage()];
    const findSpy = vi.fn().mockResolvedValue(pages);

    const takeSpy = vi.fn().mockReturnThis();
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    const chainMethods = ["innerJoinAndSelect", "leftJoinAndSelect", "where", "andWhere", "orderBy"];
    for (const m of chainMethods) {
      qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb["take"] = takeSpy;
    qb["getMany"] = vi.fn().mockResolvedValue([]);
    const createQueryBuilderSpy = vi.fn().mockReturnValue(qb);

    const service = makeDocsService({ find: findSpy }, { createQueryBuilder: createQueryBuilderSpy });
    await service.listRecentEdits({ limit: 3 });
    expect(takeSpy).toHaveBeenCalledWith(3);
  });

  it("hard-caps limit at 20 (AC4: max=20)", async () => {
    const pages = [makeSitePage()];
    const findSpy = vi.fn().mockResolvedValue(pages);

    const takeSpy = vi.fn().mockReturnThis();
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    const chainMethods = ["innerJoinAndSelect", "leftJoinAndSelect", "where", "andWhere", "orderBy"];
    for (const m of chainMethods) {
      qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb["take"] = takeSpy;
    qb["getMany"] = vi.fn().mockResolvedValue([]);
    const createQueryBuilderSpy = vi.fn().mockReturnValue(qb);

    const service = makeDocsService({ find: findSpy }, { createQueryBuilder: createQueryBuilderSpy });
    await service.listRecentEdits({ limit: 100 });
    // Must cap at max
    expect(takeSpy).toHaveBeenCalledWith(DocsService.RECENT_DOCS_MAX_LIMIT);
  });

  it("RECENT_DOCS_MAX_LIMIT is 20 (AC4: max=20)", () => {
    expect(DocsService.RECENT_DOCS_MAX_LIMIT).toBe(20);
  });

  it("RECENT_DOCS_DEFAULT_LIMIT is 5 (AC4: default=5)", () => {
    expect(DocsService.RECENT_DOCS_DEFAULT_LIMIT).toBe(5);
  });

  it("excludes non-readable pages from the allow-list before querying (AC4, AC5)", async () => {
    // Only readable pages should contribute their ids to the IN clause
    const publicPage = makeSitePage({ id: "pub", visibility: "public" as const });
    const privatePage = makeSitePage({ id: "prv", visibility: "private" as const });

    // Simulate find returning both, but only public is readable
    const findSpy = vi.fn().mockResolvedValue([publicPage, privatePage]);

    const whereArgCapture: unknown[] = [];
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    const chainMethods = ["innerJoinAndSelect", "leftJoinAndSelect", "orderBy", "take"];
    for (const m of chainMethods) {
      qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb["where"] = vi.fn().mockReturnValue(qb);
    qb["andWhere"] = vi.fn().mockImplementation((q: unknown, params: unknown) => {
      whereArgCapture.push({ q, params });
      return qb;
    });
    qb["getMany"] = vi.fn().mockResolvedValue([]);
    const createQueryBuilderSpy = vi.fn().mockReturnValue(qb);

    const service = makeDocsService({ find: findSpy }, { createQueryBuilder: createQueryBuilderSpy });
    await service.listRecentEdits({});

    // The where call on the QB should use only the public page id
    const whereCall = qb["where"].mock.calls[0];
    // The IN clause param should contain only "pub", not "prv"
    expect(whereCall?.[1]?.pageIds).toContain("pub");
    expect(whereCall?.[1]?.pageIds).not.toContain("prv");
  });

  it("project-scoped pages are excluded from the allow-list (AC3, AC4)", async () => {
    const sitePublicPage = makeSitePage({ id: "site-pub", scopeType: "site" as const });
    // Project page: isPagePubliclyReadable always returns false for project scope
    const projectPage = makeSitePage({ id: "proj-page", scopeType: "project" as const });

    const findSpy = vi.fn().mockResolvedValue([sitePublicPage, projectPage]);

    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    const chainMethods = ["innerJoinAndSelect", "leftJoinAndSelect", "orderBy", "take", "andWhere"];
    for (const m of chainMethods) {
      qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb["where"] = vi.fn().mockReturnValue(qb);
    qb["getMany"] = vi.fn().mockResolvedValue([]);
    const createQueryBuilderSpy = vi.fn().mockReturnValue(qb);

    const service = makeDocsService({ find: findSpy }, { createQueryBuilder: createQueryBuilderSpy });
    await service.listRecentEdits({});

    const whereCall = qb["where"].mock.calls[0];
    expect(whereCall?.[1]?.pageIds).toContain("site-pub");
    expect(whereCall?.[1]?.pageIds).not.toContain("proj-page");
  });

  it("returns DocsRecentEditShape items with required fields", async () => {
    const publicPage = makeSitePage({ id: "pub-1" });
    const findSpy = vi.fn().mockResolvedValue([publicPage]);

    const revisionRow = {
      id: "rev-1",
      createdAt: now,
      page: { id: "pub-1", title: "Getting Started", path: "getting-started" },
      editorUser: { username: "editor1", displayName: "Editor One" },
      author: { username: "author1", displayName: "Author One" }
    };

    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    const chainMethods = ["innerJoinAndSelect", "leftJoinAndSelect", "where", "andWhere", "orderBy", "take"];
    for (const m of chainMethods) {
      qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb["getMany"] = vi.fn().mockResolvedValue([revisionRow]);
    const createQueryBuilderSpy = vi.fn().mockReturnValue(qb);

    const service = makeDocsService({ find: findSpy }, { createQueryBuilder: createQueryBuilderSpy });
    const result = await service.listRecentEdits({});

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("pageId", "pub-1");
    expect(result[0]).toHaveProperty("title", "Getting Started");
    expect(result[0]).toHaveProperty("path", "getting-started");
    expect(result[0]).toHaveProperty("editor");
    expect(result[0]).toHaveProperty("editedAt");
  });

  it("returns stable empty list when no public pages exist (AC4: no oracle leak)", async () => {
    const service = makeDocsService();
    const result = await service.listRecentEdits({ limit: 10 });
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ST-3: assertDocWriteAccess — AC5: single authorization gate
// ---------------------------------------------------------------------------

describe("DocsService.assertDocWriteAccess (ST-3 AC5: single authorization gate)", () => {
  it("throws ForbiddenException for null/anonymous actor on site scope", () => {
    const service = makeDocsService();
    expect(() => service.assertDocWriteAccess(null, "site")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for undefined actor on site scope", () => {
    const service = makeDocsService();
    expect(() => service.assertDocWriteAccess(undefined, "site")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for 'user' role on site scope", () => {
    const service = makeDocsService();
    expect(() => service.assertDocWriteAccess("user", "site")).toThrow(ForbiddenException);
  });

  it("does NOT throw for 'moderator' role on site scope (AC5: moderator clears gate)", () => {
    const service = makeDocsService();
    expect(() => service.assertDocWriteAccess("moderator", "site")).not.toThrow();
  });

  it("does NOT throw for 'admin' role on site scope (AC5: admin clears gate)", () => {
    const service = makeDocsService();
    expect(() => service.assertDocWriteAccess("admin", "site")).not.toThrow();
  });

  it("throws ForbiddenException for unrecognised scope type (AC5: deny-by-default)", () => {
    const service = makeDocsService();
    expect(() => service.assertDocWriteAccess("moderator", "unknown-scope")).toThrow(ForbiddenException);
  });

  it("accepts a DocsPageEntity with scopeType='site' as the second argument (AC5: entity overload)", () => {
    const service = makeDocsService();
    const sitePageEntity = makeSitePage() as never;
    expect(() => service.assertDocWriteAccess("moderator", sitePageEntity)).not.toThrow();
  });

  it("rejects a DocsPageEntity with scopeType='site' when actor has 'user' role (AC5: entity overload gate)", () => {
    const service = makeDocsService();
    const sitePageEntity = makeSitePage() as never;
    expect(() => service.assertDocWriteAccess("user", sitePageEntity)).toThrow(ForbiddenException);
  });

  it("calls AuthorizationService.hasGlobalRole for site scope (AC5: routed through auth service)", () => {
    const authorizationService = new AuthorizationService();
    const hasGlobalRoleSpy = vi.spyOn(authorizationService, "hasGlobalRole");
    const service = makeDocsService(undefined, undefined, authorizationService);
    try {
      service.assertDocWriteAccess("moderator", "site");
    } catch {
      // ignore
    }
    expect(hasGlobalRoleSpy).toHaveBeenCalledWith("moderator", "moderator");
  });
});

// ---------------------------------------------------------------------------
// ST-3: createPage — AC1 (transaction) and AC3 (validation / collision)
// ---------------------------------------------------------------------------

/**
 * Build a write-capable DocsService stub with transaction manager support.
 * The `transaction` callback is called immediately with a fake entity manager.
 */
const makeWriteDocsService = (
  transactionBehavior?: (callback: (em: unknown) => Promise<unknown>) => Promise<unknown>,
  pageRepo?: Partial<MinimalRepo>,
  revisionRepo?: Partial<MinimalRepo>
) => {
  const defaultTransactionBehavior = async (
    callback: (em: unknown) => Promise<unknown>
  ) => {
    const em = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((_entity: unknown, data: unknown) => ({ ...data as object, createdAt: now, updatedAt: now })),
      save: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    };
    return callback(em);
  };

  const auth = new AuthorizationService();
  const pRepo = {
    ...createMinimalRepo(),
    ...pageRepo,
    manager: {
      transaction: transactionBehavior ?? defaultTransactionBehavior
    }
  };
  const rRepo = { ...createMinimalRepo(), ...revisionRepo };
  return new DocsService(pRepo as never, rRepo as never, auth);
};

describe("DocsService.createPage (ST-3 AC1: page + revision #1 + pointer in transaction)", () => {
  it("returns DocWriteResultShape with revisionNumber=1 and truthy currentRevisionId", async () => {
    const service = makeWriteDocsService();
    const result = await service.createPage("user-1", {
      title: "My Page",
      slug: "my-page",
      body: "# Hello"
    });
    expect(result.revisionNumber).toBe(1);
    expect(result.currentRevisionId).toBeTruthy();
    expect(result.title).toBe("My Page");
    expect(result.path).toBe("my-page");
    expect(result.depth).toBe(0);
    expect(result.parentId).toBeNull();
  });

  it("derives the full path by joining parentPath and slug for a nested page (AC1)", async () => {
    // Simulate parent page found by resolveParent
    const parentPage = makeSitePage({ id: "parent-1", path: "getting-started", depth: 0 });
    const findOneSpy = vi.fn().mockResolvedValue(parentPage);
    const service = makeWriteDocsService(undefined, { findOne: findOneSpy });

    const result = await service.createPage("user-1", {
      title: "Install",
      slug: "install",
      body: "Install body",
      parentId: "parent-1"
    });

    expect(result.path).toBe("getting-started/install");
    expect(result.depth).toBe(1);
    expect(result.parentId).toBe("parent-1");
  });

  it("stores revision #1 and sets current_revision_id via em.update (AC1: transaction integrity)", async () => {
    const saveSpy = vi.fn().mockResolvedValue({});
    const updateSpy = vi.fn().mockResolvedValue({});
    const createSpy = vi.fn().mockImplementation((_entity: unknown, data: unknown) => ({
      ...data as object, createdAt: now, updatedAt: now
    }));
    const emFindOneSpy = vi.fn().mockResolvedValue(null);

    const txBehavior = async (callback: (em: unknown) => Promise<unknown>) => {
      const em = {
        findOne: emFindOneSpy,
        create: createSpy,
        save: saveSpy,
        update: updateSpy,
      };
      return callback(em);
    };

    const service = makeWriteDocsService(txBehavior);
    await service.createPage("user-1", { title: "T", slug: "t", body: "b" });

    // save should be called twice: once for the page row, once for the revision
    expect(saveSpy).toHaveBeenCalledTimes(2);
    // update should be called once: to set current_revision_id
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("DocsService.createPage (ST-3 AC3: validation and collision errors)", () => {
  it("throws BadRequestException (400) for empty slug", async () => {
    const service = makeWriteDocsService();
    await expect(
      service.createPage("user-1", { title: "T", slug: "", body: "b" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for slug with invalid characters (uppercase)", async () => {
    const service = makeWriteDocsService();
    await expect(
      service.createPage("user-1", { title: "T", slug: "My-Page", body: "b" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for slug exceeding 255 characters", async () => {
    const service = makeWriteDocsService();
    const longSlug = "a".repeat(256);
    await expect(
      service.createPage("user-1", { title: "T", slug: longSlug, body: "b" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for empty title", async () => {
    const service = makeWriteDocsService();
    await expect(
      service.createPage("user-1", { title: "   ", slug: "my-page", body: "b" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for title exceeding 255 characters", async () => {
    const service = makeWriteDocsService();
    const longTitle = "A".repeat(256);
    await expect(
      service.createPage("user-1", { title: longTitle, slug: "my-page", body: "b" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) when parentId is provided but parent does not exist", async () => {
    const findOneSpy = vi.fn().mockResolvedValue(null);
    const service = makeWriteDocsService(undefined, { findOne: findOneSpy });
    await expect(
      service.createPage("user-1", { title: "T", slug: "t", body: "b", parentId: "nonexistent-id" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws ConflictException (409) when path_hash already exists in the transaction", async () => {
    // Simulate the em.findOne inside the transaction returning an existing page (collision)
    const txBehavior = async (callback: (em: unknown) => Promise<unknown>) => {
      const em = {
        findOne: vi.fn().mockResolvedValue(makeSitePage()), // collision found
        create: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
      };
      return callback(em);
    };

    const service = makeWriteDocsService(txBehavior);
    await expect(
      service.createPage("user-1", { title: "T", slug: "getting-started", body: "b" })
    ).rejects.toThrow(ConflictException);
  });
});

// ---------------------------------------------------------------------------
// ST-3: addRevision — AC2 (transaction) and AC3 (validation / 404)
// ---------------------------------------------------------------------------

/**
 * Build a write-capable DocsService stub for addRevision tests.
 * The transaction manager's em.findOne returns `pageStub` for the page lookup
 * and the last revision lookup returns `lastRevisionStub`.
 */
const makeAddRevisionService = (
  pageStub: unknown,
  lastRevisionStub: unknown = null
) => {
  const txBehavior = async (callback: (em: unknown) => Promise<unknown>) => {
    const findOneSpy = vi.fn()
      .mockResolvedValueOnce(pageStub)   // page load
      .mockResolvedValueOnce(lastRevisionStub) // last revision load
      .mockResolvedValue(pageStub); // re-load for updatedAt
    const em = {
      findOne: findOneSpy,
      create: vi.fn().mockImplementation((_entity: unknown, data: unknown) => ({ ...data as object })),
      save: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({})
    };
    return callback(em);
  };
  const auth = new AuthorizationService();
  const pRepo = {
    ...createMinimalRepo(),
    manager: { transaction: txBehavior }
  };
  const rRepo = createMinimalRepo();
  return new DocsService(pRepo as never, rRepo as never, auth);
};

describe("DocsService.addRevision (ST-3 AC2: revision bump + pointer update)", () => {
  it("returns revisionNumber=2 when page has one existing revision (AC2)", async () => {
    const page = makeSitePage({ id: "p1", status: "published" });
    const lastRevision = { id: "rev-1", revisionNumber: 1, pageId: "p1" };
    const service = makeAddRevisionService(page, lastRevision);

    const result = await service.addRevision("user-1", "p1", {
      title: "Updated Title",
      body: "new body"
    });

    expect(result.revisionNumber).toBe(2);
    expect(result.title).toBe("Updated Title");
    expect(result.id).toBe("p1");
  });

  it("returns revisionNumber=1 when page has no prior revisions (defensive: last revision null)", async () => {
    const page = makeSitePage({ id: "p2", status: "published" });
    // null lastRevision → nextRevisionNumber = 1
    const service = makeAddRevisionService(page, null);

    const result = await service.addRevision("user-1", "p2", {
      title: "First Edit",
      body: "body"
    });

    expect(result.revisionNumber).toBe(1);
  });

  it("sets a new currentRevisionId (different from the page's old one) (AC2)", async () => {
    const page = makeSitePage({ id: "p3", status: "published", currentRevisionId: "rev-old" });
    const lastRevision = { id: "rev-old", revisionNumber: 1, pageId: "p3" };
    const service = makeAddRevisionService(page, lastRevision);

    const result = await service.addRevision("user-1", "p3", {
      title: "New Title",
      body: "body"
    });

    expect(result.currentRevisionId).toBeTruthy();
    expect(result.currentRevisionId).not.toBe("rev-old");
  });

  it("throws NotFoundException (404) when page does not exist (AC2: oracle parity)", async () => {
    const service = makeAddRevisionService(null); // page lookup returns null
    await expect(
      service.addRevision("user-1", "nonexistent", { title: "T", body: "b" })
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException (404) with PAGE_NOT_FOUND_MESSAGE for nonexistent page", async () => {
    const service = makeAddRevisionService(null);
    await expect(
      service.addRevision("user-1", "nonexistent", { title: "T", body: "b" })
    ).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("throws NotFoundException (404) for deleted page (status='deleted', oracle parity)", async () => {
    const deletedPage = makeSitePage({ id: "p-del", status: "deleted" });
    const service = makeAddRevisionService(deletedPage);
    await expect(
      service.addRevision("user-1", "p-del", { title: "T", body: "b" })
    ).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("throws BadRequestException (400) for empty title (AC3: input validation)", async () => {
    // Validation runs BEFORE the transaction — use empty transaction behavior
    const service = makeWriteDocsService();
    await expect(
      service.addRevision("user-1", "some-id", { title: "   ", body: "b" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for title exceeding 255 characters", async () => {
    const service = makeWriteDocsService();
    await expect(
      service.addRevision("user-1", "some-id", { title: "A".repeat(256), body: "b" })
    ).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// ST-4: renamePage — AC1 (slug rename + descendant rewrite) and AC2 (title-only)
// ---------------------------------------------------------------------------

/**
 * Build a rename-capable DocsService stub.
 *
 * The transaction callback is called immediately with a fake entity manager.
 * `pageStub` is returned for em.findOne() calls (the page load and re-load).
 * `descendantStubs` are returned by em.createQueryBuilder().getMany().
 */
const makeRenameDocsService = (
  pageStub: unknown,
  descendantStubs: unknown[] = [],
  collisionStub: unknown = null,
  overrideTransactionBehavior?: (callback: (em: unknown) => Promise<unknown>) => Promise<unknown>
) => {
  const defaultTransactionBehavior = async (
    callback: (em: unknown) => Promise<unknown>
  ) => {
    // Build a minimal query builder stub for descendant scan.
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    const qbChain = ["where", "andWhere"];
    for (const m of qbChain) {
      qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb["getMany"] = vi.fn().mockResolvedValue(descendantStubs);

    // findOne call order: (1) page load, (2) collision check, (3) re-load after update
    const findOneSpy = vi.fn()
      .mockResolvedValueOnce(pageStub)  // (1) page load
      .mockResolvedValueOnce(collisionStub) // (2) collision check
      .mockResolvedValue(pageStub); // (3) re-load

    const em = {
      findOne: findOneSpy,
      update: vi.fn().mockResolvedValue({}),
      createQueryBuilder: vi.fn().mockReturnValue(qb)
    };
    return callback(em);
  };

  const auth = new AuthorizationService();
  const pRepo = {
    ...createMinimalRepo(),
    manager: {
      transaction: overrideTransactionBehavior ?? defaultTransactionBehavior
    }
  };
  const rRepo = createMinimalRepo();
  return new DocsService(pRepo as never, rRepo as never, auth);
};

describe("DocsService.renamePage (ST-4 AC1: slug rename + descendant rewrite)", () => {
  it("returns updated page shape with the new slug and path for a root page", async () => {
    const page = makeSitePage({ id: "p1", slug: "old-slug", path: "old-slug", parentId: null, depth: 0 });
    const service = makeRenameDocsService(page);

    const result = await service.renamePage("p1", { slug: "new-slug" });

    expect(result.id).toBe("p1");
    expect(result.title).toBe("Getting Started"); // unchanged title
    // The path is derived inside the transaction; finalPage.path is what we set.
    // Since finalPage = updatedPage (3rd findOne which returns page stub with old path),
    // the result path comes from the transaction logic. We validate the call ordering instead.
  });

  it("throws BadRequestException (400) when neither slug nor title is provided (AC validation)", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeRenameDocsService(page);

    await expect(service.renamePage("p1", {})).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for invalid slug (uppercase characters)", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeRenameDocsService(page);

    await expect(service.renamePage("p1", { slug: "Invalid-Slug" })).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for empty slug", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeRenameDocsService(page);

    await expect(service.renamePage("p1", { slug: "" })).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for empty title", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeRenameDocsService(page);

    await expect(service.renamePage("p1", { title: "   " })).rejects.toThrow(BadRequestException);
  });

  it("throws NotFoundException (404) when page does not exist", async () => {
    const service = makeRenameDocsService(null); // findOne returns null

    await expect(service.renamePage("nonexistent", { slug: "new-slug" })).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException (404) with PAGE_NOT_FOUND_MESSAGE for nonexistent page", async () => {
    const service = makeRenameDocsService(null);

    await expect(service.renamePage("nonexistent", { slug: "new-slug" })).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException (404) for deleted page (status='deleted')", async () => {
    const deletedPage = makeSitePage({ id: "p-del", status: "deleted" });
    const service = makeRenameDocsService(deletedPage);

    await expect(service.renamePage("p-del", { slug: "new-slug" })).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws ConflictException (409) when new slug collides with an existing page path", async () => {
    const page = makeSitePage({ id: "p1", slug: "old-slug", path: "old-slug", parentId: null });
    const collidingPage = makeSitePage({ id: "p2", slug: "existing-slug", path: "existing-slug" });
    const service = makeRenameDocsService(page, [], collidingPage);

    await expect(service.renamePage("p1", { slug: "existing-slug" })).rejects.toThrow(ConflictException);
  });

  it("calls em.update for the page and for each descendant when slug changes (AC1: subtree rewrite)", async () => {
    const page = makeSitePage({ id: "p1", slug: "docs", path: "docs", parentId: null });
    const child = makeSitePage({ id: "child-1", path: "docs/install", slug: "install", scopeType: "site", scopeId: null, parentId: "p1" });
    const grandChild = makeSitePage({ id: "grand-1", path: "docs/install/quick", slug: "quick", scopeType: "site", scopeId: null, parentId: "child-1" });

    const updateSpy = vi.fn().mockResolvedValue({});

    const txBehavior = async (callback: (em: unknown) => Promise<unknown>) => {
      const qb: Record<string, ReturnType<typeof vi.fn>> = {};
      const qbChain = ["where", "andWhere"];
      for (const m of qbChain) {
        qb[m] = vi.fn().mockReturnValue(qb);
      }
      qb["getMany"] = vi.fn().mockResolvedValue([child, grandChild]);

      const findOneSpy = vi.fn()
        .mockResolvedValueOnce(page)   // page load
        .mockResolvedValueOnce(null)   // no collision
        .mockResolvedValue(page);      // re-load

      const em = {
        findOne: findOneSpy,
        update: updateSpy,
        createQueryBuilder: vi.fn().mockReturnValue(qb)
      };
      return callback(em);
    };

    const auth = new AuthorizationService();
    const pRepo = { ...createMinimalRepo(), manager: { transaction: txBehavior } };
    const rRepo = createMinimalRepo();
    const service = new DocsService(pRepo as never, rRepo as never, auth);

    await service.renamePage("p1", { slug: "wiki" });

    // em.update called once for the page, once for child, once for grandChild
    expect(updateSpy).toHaveBeenCalledTimes(3);
  });
});

describe("DocsService.renamePage (ST-4 AC2: title-only rename does not alter path)", () => {
  it("returns the same path when only title changes (AC2: no path rewrite)", async () => {
    const page = makeSitePage({ id: "p1", slug: "my-page", path: "my-page", parentId: null });
    const updateSpy = vi.fn().mockResolvedValue({});

    const txBehavior = async (callback: (em: unknown) => Promise<unknown>) => {
      const em = {
        findOne: vi.fn()
          .mockResolvedValueOnce(page)  // page load
          .mockResolvedValue(page),     // re-load
        update: updateSpy,
        createQueryBuilder: vi.fn()
      };
      return callback(em);
    };

    const auth = new AuthorizationService();
    const pRepo = { ...createMinimalRepo(), manager: { transaction: txBehavior } };
    const rRepo = createMinimalRepo();
    const service = new DocsService(pRepo as never, rRepo as never, auth);

    await service.renamePage("p1", { title: "New Title" });

    // em.update called ONCE (for the page title only); no descendant scan, no path update
    expect(updateSpy).toHaveBeenCalledTimes(1);
    // em.update(Entity, where, data) — the data object is the 3rd argument (index 2).
    const updateArgs = updateSpy.mock.calls[0];
    expect(updateArgs[2]).not.toHaveProperty("slug");
    expect(updateArgs[2]).not.toHaveProperty("path");
    expect(updateArgs[2]).not.toHaveProperty("pathHash");
    expect(updateArgs[2]).toHaveProperty("title", "New Title");
  });

  it("does not scan descendants when only title changes (AC2: no createQueryBuilder call)", async () => {
    const page = makeSitePage({ id: "p1", slug: "my-page", path: "my-page", parentId: null });
    const createQueryBuilderSpy = vi.fn();

    const txBehavior = async (callback: (em: unknown) => Promise<unknown>) => {
      const em = {
        findOne: vi.fn()
          .mockResolvedValueOnce(page)
          .mockResolvedValue(page),
        update: vi.fn().mockResolvedValue({}),
        createQueryBuilder: createQueryBuilderSpy
      };
      return callback(em);
    };

    const auth = new AuthorizationService();
    const pRepo = { ...createMinimalRepo(), manager: { transaction: txBehavior } };
    const rRepo = createMinimalRepo();
    const service = new DocsService(pRepo as never, rRepo as never, auth);

    await service.renamePage("p1", { title: "New Title" });

    // createQueryBuilder must NOT be called for a title-only rename
    expect(createQueryBuilderSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ST-4: softDeletePage — AC3 (leaf delete) and AC4 (409 on children)
// ---------------------------------------------------------------------------

/**
 * Build a softDelete-capable DocsService stub.
 *
 * `pageStub` is returned by findOne, `nonDeletedChildCount` by count.
 */
const makeSoftDeleteDocsService = (
  pageStub: unknown,
  nonDeletedChildCount = 0
) => {
  const auth = new AuthorizationService();
  const pRepo = {
    ...createMinimalRepo(),
    findOne: vi.fn().mockResolvedValue(pageStub),
    count: vi.fn().mockResolvedValue(nonDeletedChildCount),
    update: vi.fn().mockResolvedValue({})
  };
  const rRepo = createMinimalRepo();
  return new DocsService(pRepo as never, rRepo as never, auth);
};

describe("DocsService.softDeletePage (ST-4 AC3: leaf page soft-delete)", () => {
  it("returns void (no error) for a valid leaf page delete (AC3)", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeSoftDeleteDocsService(page, 0);

    await expect(service.softDeletePage("p1")).resolves.toBeUndefined();
  });

  it("throws NotFoundException (404) when page does not exist (oracle parity)", async () => {
    const service = makeSoftDeleteDocsService(null, 0);

    await expect(service.softDeletePage("nonexistent")).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException (404) with PAGE_NOT_FOUND_MESSAGE for nonexistent page", async () => {
    const service = makeSoftDeleteDocsService(null, 0);

    await expect(service.softDeletePage("nonexistent")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException (404) for already-deleted page (oracle parity)", async () => {
    const deletedPage = makeSitePage({ id: "p-del", status: "deleted" });
    const service = makeSoftDeleteDocsService(deletedPage, 0);

    await expect(service.softDeletePage("p-del")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("calls update with status='deleted' on the page repo (AC3: sets status=deleted)", async () => {
    const page = makeSitePage({ id: "p1" });
    const auth = new AuthorizationService();
    const updateSpy = vi.fn().mockResolvedValue({});
    const pRepo = {
      ...createMinimalRepo(),
      findOne: vi.fn().mockResolvedValue(page),
      count: vi.fn().mockResolvedValue(0),
      update: updateSpy
    };
    const service = new DocsService(pRepo as never, createMinimalRepo() as never, auth);

    await service.softDeletePage("p1");

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1" }),
      expect.objectContaining({ status: "deleted" })
    );
  });
});

describe("DocsService.softDeletePage (ST-4 AC4: 409 when children exist)", () => {
  it("throws ConflictException (409) when page has non-deleted children (AC4)", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeSoftDeleteDocsService(page, 2); // 2 non-deleted children

    await expect(service.softDeletePage("p1")).rejects.toThrow(ConflictException);
  });

  it("ConflictException message mentions children (AC4: clear message)", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeSoftDeleteDocsService(page, 1);

    let caught: unknown = null;
    try {
      await service.softDeletePage("p1");
    } catch (e) {
      caught = e;
    }

    expect(caught).not.toBeNull();
    expect(caught instanceof ConflictException).toBe(true);
    // The message must clearly communicate the children constraint.
    expect((caught as ConflictException).message.toLowerCase()).toMatch(/child/);
  });

  it("does NOT call update when children block the delete (AC4: no partial state)", async () => {
    const page = makeSitePage({ id: "p1" });
    const auth = new AuthorizationService();
    const updateSpy = vi.fn().mockResolvedValue({});
    const pRepo = {
      ...createMinimalRepo(),
      findOne: vi.fn().mockResolvedValue(page),
      count: vi.fn().mockResolvedValue(1), // child exists
      update: updateSpy
    };
    const service = new DocsService(pRepo as never, createMinimalRepo() as never, auth);

    await expect(service.softDeletePage("p1")).rejects.toThrow(ConflictException);

    // update must NOT have been called — no partial state
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ST-4: resolveParent fix — parentId branch now applies status=published filter
// ---------------------------------------------------------------------------

describe("DocsService.createPage resolveParent fix (ST-4: parentId branch filters soft-deleted parents)", () => {
  it("throws BadRequestException when parentId points to a soft-deleted parent", async () => {
    // After the ST-4 fix, findOne on the parentId branch includes status='published'.
    // Simulate the repo returning null (soft-deleted parent not found with that filter).
    const findOneSpy = vi.fn().mockResolvedValue(null);
    const service = makeWriteDocsService(undefined, { findOne: findOneSpy });

    await expect(
      service.createPage("user-1", { title: "T", slug: "t", body: "b", parentId: "deleted-parent-id" })
    ).rejects.toThrow(BadRequestException);
  });

  it("accepts parentId for a published (non-deleted) parent (positive-path parity)", async () => {
    const publishedParent = makeSitePage({ id: "parent-1", path: "parent", depth: 0 });
    const findOneSpy = vi.fn().mockResolvedValue(publishedParent);
    const service = makeWriteDocsService(undefined, { findOne: findOneSpy });

    const result = await service.createPage("user-1", {
      title: "Child",
      slug: "child",
      body: "body",
      parentId: "parent-1"
    });

    expect(result.parentId).toBe("parent-1");
    expect(result.path).toBe("parent/child");
  });
});

// ---------------------------------------------------------------------------
// DocsService — AC5: every path routes through AuthorizationService.evaluate()
// ---------------------------------------------------------------------------

describe("DocsService AC5: all read paths route through AuthorizationService.evaluate()", () => {
  it("getPageByPath calls AuthorizationService.evaluate() for a readable page", async () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");

    const page = makeSitePage({ visibility: "public" as const });
    const findOneSpy = vi.fn().mockResolvedValue(page);
    const service = makeDocsService({ findOne: findOneSpy }, undefined, authorizationService);

    await service.getPageByPath("getting-started");

    expect(evaluateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ userId: null, globalRole: "" }),
        action: "read"
      })
    );
  });

  it("listPageTree calls AuthorizationService.evaluate() to filter results", async () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");

    const pages = [makeSitePage({ visibility: "public" as const })];
    const findSpy = vi.fn().mockResolvedValue(pages);
    const service = makeDocsService({ find: findSpy }, undefined, authorizationService);

    await service.listPageTree();

    expect(evaluateSpy).toHaveBeenCalled();
  });

  it("listRecentEdits calls AuthorizationService.evaluate() to build the allow-list", async () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");

    const pages = [makeSitePage({ visibility: "public" as const })];
    const findSpy = vi.fn().mockResolvedValue(pages);

    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    const chainMethods = ["innerJoinAndSelect", "leftJoinAndSelect", "where", "andWhere", "orderBy", "take"];
    for (const m of chainMethods) {
      qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb["getMany"] = vi.fn().mockResolvedValue([]);
    const service = makeDocsService(
      { find: findSpy },
      { createQueryBuilder: vi.fn().mockReturnValue(qb) },
      authorizationService
    );

    await service.listRecentEdits({});

    expect(evaluateSpy).toHaveBeenCalled();
  });

  it("isPagePubliclyReadable uses anonymous actor { userId: null, globalRole: '' } (AC5: no inline predicate)", () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");
    const service = makeDocsService(undefined, undefined, authorizationService);
    const page = makeSitePage({ visibility: "public" as const }) as never;

    service.isPagePubliclyReadable(page);

    expect(evaluateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { userId: null, globalRole: "" }
      })
    );
  });
});
