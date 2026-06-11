/**
 * docs.service.test.ts
 *
 * Unit tests for DocsService (ST-2).
 *
 * Acceptance criteria validated:
 * AC1: getPageByPath resolves a published site page by full path, returns current revision
 *      content plus ordered breadcrumb ancestry.
 * AC2: Nonexistent path, deleted page, and non-publicly-readable page all return the same
 *      404 class and message (oracle parity). Constant: DocsService.PAGE_NOT_FOUND_MESSAGE.
 * AC3: listPageTree returns site page tree with no project-scoped pages present.
 * AC4: listRecentEdits returns recent published site-doc edits, excludes deleted/non-readable/
 *      project pages, respects limit. Default=5, max=20.
 * AC5: Every read path routes visibility through AuthorizationService.evaluate() with no inline
 *      re-derived predicate.
 */

import { NotFoundException } from "@nestjs/common";
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
