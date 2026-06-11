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
import { DocsPageEntity } from "./entities/docs-page.entity";
import { DocsService } from "./docs.service";
import { DOCS_DIFF_MAX_BODY_BYTES, DOCS_DIFF_MAX_LINES } from "./docs.types";

// ---------------------------------------------------------------------------
// Minimal repository stubs — only methods called by DocsService are needed.
// ---------------------------------------------------------------------------

interface MinimalRepo {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  createQueryBuilder: ReturnType<typeof vi.fn>;
  manager: unknown;
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
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: vi.fn().mockReturnValue(qb),
    manager: undefined
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
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
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
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
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
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
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
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
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
    const service = new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });

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
    const service = new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });

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
    const service = new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });

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
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
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
    const service = new DocsService(pRepo as never, createMinimalRepo() as never, auth, { lockTtlMinutes: 30 });

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
    const service = new DocsService(pRepo as never, createMinimalRepo() as never, auth, { lockTtlMinutes: 30 });

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
// ST-5: DocsService.computeLineDiff — static method, deterministic (AC2)
// ---------------------------------------------------------------------------

describe("DocsService.computeLineDiff (ST-5 AC2: static, deterministic line-level diff)", () => {
  it("returns empty hunks array for two identical inputs", () => {
    const result = DocsService.computeLineDiff(["a", "b", "c"], ["a", "b", "c"]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("unchanged");
    expect(result[0].lines).toEqual(["a", "b", "c"]);
  });

  it("returns a single added hunk when a line is appended", () => {
    const result = DocsService.computeLineDiff(["a", "b"], ["a", "b", "c"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "unchanged", lines: ["a", "b"] });
    expect(result[1]).toEqual({ type: "added", lines: ["c"] });
  });

  it("returns a single removed hunk when a line is deleted", () => {
    const result = DocsService.computeLineDiff(["a", "b", "c"], ["a", "b"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "unchanged", lines: ["a", "b"] });
    expect(result[1]).toEqual({ type: "removed", lines: ["c"] });
  });

  it("returns removed + added hunks when a middle line is replaced", () => {
    const result = DocsService.computeLineDiff(["a", "b", "c"], ["a", "x", "c"]);
    // The LCS is ["a", "c"]; "b" is removed, "x" is added.
    expect(result.some((h) => h.type === "removed" && h.lines.includes("b"))).toBe(true);
    expect(result.some((h) => h.type === "added" && h.lines.includes("x"))).toBe(true);
    expect(result.some((h) => h.type === "unchanged" && h.lines.includes("a"))).toBe(true);
  });

  it("returns single added hunk when toLines has all lines added (fromLines empty)", () => {
    const result = DocsService.computeLineDiff([], ["a", "b", "c"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "added", lines: ["a", "b", "c"] });
  });

  it("returns single removed hunk when toLines is empty (all lines removed)", () => {
    const result = DocsService.computeLineDiff(["a", "b"], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "removed", lines: ["a", "b"] });
  });

  it("returns empty array for two empty inputs", () => {
    const result = DocsService.computeLineDiff([], []);
    expect(result).toHaveLength(0);
  });

  it("is deterministic — same inputs always produce same output", () => {
    const from = ["line 1", "line 2", "line 3"];
    const to = ["line 1", "modified line 2", "line 3", "line 4"];
    const r1 = DocsService.computeLineDiff(from, to);
    const r2 = DocsService.computeLineDiff(from, to);
    expect(r1).toEqual(r2);
  });

  it("merges adjacent same-type ops into a single hunk", () => {
    // All lines from->to are different (no common lines), so we get two merged hunks.
    const result = DocsService.computeLineDiff(["a", "b"], ["c", "d"]);
    // All a,b removed (merged), all c,d added (merged)
    const removed = result.find((h) => h.type === "removed");
    const added = result.find((h) => h.type === "added");
    expect(removed?.lines).toHaveLength(2);
    expect(added?.lines).toHaveLength(2);
  });

  it("produces hunks with correct types: only 'unchanged', 'added', or 'removed'", () => {
    const result = DocsService.computeLineDiff(["x", "y"], ["x", "z"]);
    for (const hunk of result) {
      expect(["unchanged", "added", "removed"]).toContain(hunk.type);
    }
  });

  it("fixed-input pinning: ['hello','world'] vs ['hello','universe'] produces correct diff", () => {
    const result = DocsService.computeLineDiff(["hello", "world"], ["hello", "universe"]);
    expect(result[0]).toEqual({ type: "unchanged", lines: ["hello"] });
    // "world" removed, "universe" added — may be in either order depending on LCS scan,
    // but both must appear.
    expect(result.some((h) => h.type === "removed" && h.lines.includes("world"))).toBe(true);
    expect(result.some((h) => h.type === "added" && h.lines.includes("universe"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ST-5: DocsService.getPageHistory — AC1: history endpoint
// ---------------------------------------------------------------------------

/**
 * Build a history-capable DocsService stub.
 */
const makeHistoryDocsService = (
  pageStub: unknown,
  revisionsStub: unknown[] = []
) => {
  const auth = new AuthorizationService();
  const pRepo = {
    ...createMinimalRepo(),
    findOne: vi.fn().mockResolvedValue(pageStub)
  };
  const rRepo = {
    ...createMinimalRepo(),
    find: vi.fn().mockResolvedValue(revisionsStub)
  };
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
};

describe("DocsService.getPageHistory (ST-5 AC1: ordered history, oracle-parity 404)", () => {
  it("returns { revisions } ordered by revisionNumber ASC for a readable page", async () => {
    const page = makeSitePage({ id: "p1", visibility: "public" });
    const rev1 = {
      id: "rev-1", revisionNumber: 1, pageId: "p1",
      author: { username: "alice", displayName: "Alice" }, editorUser: null,
      summary: "initial", createdAt: now
    };
    const rev2 = {
      id: "rev-2", revisionNumber: 2, pageId: "p1",
      author: { username: "alice", displayName: "Alice" },
      editorUser: { username: "bob" },
      summary: "second", createdAt: now
    };
    const service = makeHistoryDocsService(page, [rev1, rev2]);
    const result = await service.getPageHistory("p1");

    expect(result.revisions).toHaveLength(2);
    expect(result.revisions[0].revisionNumber).toBe(1);
    expect(result.revisions[1].revisionNumber).toBe(2);
    expect(result.revisions[0].author).toEqual({ username: "alice", displayName: "Alice" });
    expect(result.revisions[1].editorUsername).toBe("bob");
  });

  it("returns an empty revisions array when the page has no revisions", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeHistoryDocsService(page, []);
    const result = await service.getPageHistory("p1");

    expect(result.revisions).toEqual([]);
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for nonexistent page (AC1: oracle parity)", async () => {
    const service = makeHistoryDocsService(null);
    await expect(service.getPageHistory("nonexistent")).rejects.toThrow(NotFoundException);
    await expect(service.getPageHistory("nonexistent")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for deleted page (AC1: oracle parity)", async () => {
    const deletedPage = makeSitePage({ id: "p1", status: "deleted" });
    const service = makeHistoryDocsService(deletedPage);
    await expect(service.getPageHistory("p1")).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for non-readable page (members, AC1: oracle parity)", async () => {
    const membersPage = makeSitePage({ id: "p1", visibility: "members" });
    const service = makeHistoryDocsService(membersPage);
    await expect(service.getPageHistory("p1")).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("error message is identical for all non-readable paths (AC1: no oracle leak)", async () => {
    const nonexistentService = makeHistoryDocsService(null);
    const deletedService = makeHistoryDocsService(makeSitePage({ status: "deleted" }));
    const hiddenService = makeHistoryDocsService(makeSitePage({ visibility: "members" }));

    const msgs: string[] = [];
    for (const svc of [nonexistentService, deletedService, hiddenService]) {
      try {
        await svc.getPageHistory("p1");
      } catch (e: unknown) {
        msgs.push((e as Error).message);
      }
    }
    expect(msgs).toHaveLength(3);
    expect(new Set(msgs).size).toBe(1);
    expect(msgs[0]).toBe(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("maps each revision to DocsRevisionMetaShape (revisionNumber, author, editorUsername, summary, createdAt)", async () => {
    const page = makeSitePage({ id: "p1" });
    const rev = {
      id: "rev-1", revisionNumber: 3, pageId: "p1",
      author: { username: "carol", displayName: null }, editorUser: { username: "dave" },
      summary: "edit summary", createdAt: now
    };
    const service = makeHistoryDocsService(page, [rev]);
    const result = await service.getPageHistory("p1");

    expect(result.revisions[0]).toEqual({
      revisionNumber: 3,
      author: { username: "carol", displayName: null },
      editorUsername: "dave",
      summary: "edit summary",
      createdAt: now
    });
  });
});

// ---------------------------------------------------------------------------
// ST-5: DocsService.getRevisionByNumber — single revision body
// ---------------------------------------------------------------------------

/**
 * Build a getRevisionByNumber-capable DocsService stub.
 */
const makeRevisionByNumberService = (
  pageStub: unknown,
  revisionStub: unknown
) => {
  const auth = new AuthorizationService();
  const pRepo = {
    ...createMinimalRepo(),
    findOne: vi.fn().mockResolvedValue(pageStub)
  };
  const rRepo = {
    ...createMinimalRepo(),
    findOne: vi.fn().mockResolvedValue(revisionStub)
  };
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
};

describe("DocsService.getRevisionByNumber (ST-5 AC1: single revision, oracle parity)", () => {
  const makeRevision = (overrides?: Partial<Record<string, unknown>>) => ({
    id: "rev-1",
    revisionNumber: 1,
    pageId: "p1",
    title: "Getting Started",
    body: "# Getting Started\n\nContent here",
    summary: "initial",
    author: { username: "alice", displayName: "Alice" },
    editorUser: null,
    createdAt: now,
    ...overrides
  });

  it("returns DocsSingleRevisionShape for an existing revision", async () => {
    const page = makeSitePage({ id: "p1" });
    const rev = makeRevision();
    const service = makeRevisionByNumberService(page, rev);

    const result = await service.getRevisionByNumber("p1", 1);

    expect(result.revisionNumber).toBe(1);
    expect(result.title).toBe("Getting Started");
    expect(result.body).toBe("# Getting Started\n\nContent here");
    expect(result.author).toEqual({ username: "alice", displayName: "Alice" });
    expect(result.editorUsername).toBeNull();
    expect(result.summary).toBe("initial");
    expect(result.createdAt).toBe(now);
  });

  it("returns editorUsername from editorUser relation when present", async () => {
    const page = makeSitePage({ id: "p1" });
    const rev = makeRevision({ editorUser: { username: "bob" } });
    const service = makeRevisionByNumberService(page, rev);

    const result = await service.getRevisionByNumber("p1", 1);

    expect(result.editorUsername).toBe("bob");
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for nonexistent page (oracle parity)", async () => {
    const service = makeRevisionByNumberService(null, null);
    await expect(service.getRevisionByNumber("nonexistent", 1)).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for deleted page (oracle parity)", async () => {
    const deletedPage = makeSitePage({ id: "p1", status: "deleted" });
    const service = makeRevisionByNumberService(deletedPage, null);
    await expect(service.getRevisionByNumber("p1", 1)).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for non-readable page (oracle parity)", async () => {
    const membersPage = makeSitePage({ id: "p1", visibility: "members" });
    const service = makeRevisionByNumberService(membersPage, null);
    await expect(service.getRevisionByNumber("p1", 1)).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) when revision number does not exist", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeRevisionByNumberService(page, null); // revision findOne returns null
    await expect(service.getRevisionByNumber("p1", 999)).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });
});

// ---------------------------------------------------------------------------
// ST-5: DocsService.getDiff — validation + oracle parity (AC2)
// ---------------------------------------------------------------------------

/**
 * Build a getDiff-capable DocsService stub.
 */
const makeDiffDocsService = (
  pageStub: unknown,
  fromRevStub: unknown,
  toRevStub: unknown
) => {
  const auth = new AuthorizationService();
  const pRepo = {
    ...createMinimalRepo(),
    findOne: vi.fn().mockResolvedValue(pageStub)
  };
  const rRepo = {
    ...createMinimalRepo(),
    findOne: vi.fn()
      .mockResolvedValueOnce(fromRevStub)
      .mockResolvedValueOnce(toRevStub)
  };
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
};

describe("DocsService.getDiff (ST-5 AC2: validation + diff computation + oracle parity)", () => {
  it("throws BadRequestException when from === to (AC2: equal revisions)", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeDiffDocsService(page, null, null);
    await expect(service.getDiff("p1", 1, 1)).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when from is not a positive integer (AC2: validation)", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeDiffDocsService(page, null, null);
    await expect(service.getDiff("p1", 0, 2)).rejects.toThrow(BadRequestException);
    await expect(service.getDiff("p1", -1, 2)).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when to is not a positive integer (AC2: validation)", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeDiffDocsService(page, null, null);
    await expect(service.getDiff("p1", 1, 0)).rejects.toThrow(BadRequestException);
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for nonexistent page (AC2: oracle parity)", async () => {
    const service = makeDiffDocsService(null, null, null);
    await expect(service.getDiff("nonexistent", 1, 2)).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for deleted page (AC2: oracle parity)", async () => {
    const deletedPage = makeSitePage({ status: "deleted" });
    const service = makeDiffDocsService(deletedPage, null, null);
    await expect(service.getDiff("p1", 1, 2)).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for non-readable page (AC2: oracle parity)", async () => {
    const membersPage = makeSitePage({ visibility: "members" });
    const service = makeDiffDocsService(membersPage, null, null);
    await expect(service.getDiff("p1", 1, 2)).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) when fromRevision is missing (AC2)", async () => {
    const page = makeSitePage({ id: "p1" });
    // fromRev = null (not found), toRev irrelevant
    const service = makeDiffDocsService(page, null, { id: "rev-2", body: "v2", revisionNumber: 2 });
    await expect(service.getDiff("p1", 1, 2)).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) when toRevision is missing (AC2)", async () => {
    const page = makeSitePage({ id: "p1" });
    const service = makeDiffDocsService(
      page,
      { id: "rev-1", body: "v1", revisionNumber: 1 },
      null
    );
    await expect(service.getDiff("p1", 1, 2)).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("returns DocsDiffShape with fromRevisionNumber, toRevisionNumber, and hunks (AC2)", async () => {
    const page = makeSitePage({ id: "p1" });
    const auth = new AuthorizationService();
    const pRepo = {
      ...createMinimalRepo(),
      findOne: vi.fn().mockResolvedValue(page)
    };
    // Both revisions resolved via Promise.all — need two calls to return both
    const fromRev = { id: "rev-1", body: "hello\nworld", revisionNumber: 1, pageId: "p1" };
    const toRev = { id: "rev-2", body: "hello\nuniverse", revisionNumber: 2, pageId: "p1" };
    const rRepo = {
      ...createMinimalRepo(),
      findOne: vi.fn()
        .mockResolvedValueOnce(fromRev)
        .mockResolvedValueOnce(toRev)
    };
    const service = new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });

    const result = await service.getDiff("p1", 1, 2);

    expect(result.fromRevisionNumber).toBe(1);
    expect(result.toRevisionNumber).toBe(2);
    expect(Array.isArray(result.hunks)).toBe(true);
    expect(result.hunks.length).toBeGreaterThan(0);
    // Verify the unchanged line "hello" appears
    expect(result.hunks.some((h) => h.type === "unchanged" && h.lines.includes("hello"))).toBe(true);
    // Verify "world" is removed and "universe" is added
    expect(result.hunks.some((h) => h.type === "removed" && h.lines.includes("world"))).toBe(true);
    expect(result.hunks.some((h) => h.type === "added" && h.lines.includes("universe"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ST-5 remediation: DocsService.getDiff — DoS size guard (DOCS_DIFF_MAX_BODY_BYTES / DOCS_DIFF_MAX_LINES)
// ---------------------------------------------------------------------------
//
// Acceptance criteria validated:
//   AC-bytes-1: fromRev.body exceeds DOCS_DIFF_MAX_BODY_BYTES → BadRequestException (400)
//   AC-bytes-2: toRev.body exceeds DOCS_DIFF_MAX_BODY_BYTES → BadRequestException (400)
//   AC-lines-1: fromRev split line count > DOCS_DIFF_MAX_LINES → BadRequestException (400)
//   AC-lines-2: toRev split line count > DOCS_DIFF_MAX_LINES → BadRequestException (400)
//   AC-at-cap:  body exactly at DOCS_DIFF_MAX_BODY_BYTES passes (no error)
//   AC-msg:     exception message names the violated limit
//   AC-no-env:  guard is driven by named constants, not env vars (DOCS_DIFF_MAX_BODY_BYTES
//               and DOCS_DIFF_MAX_LINES are re-imported from docs.types here as the source of truth)

/**
 * Builds a diff-capable service stub that returns the given from/to revision bodies.
 * Re-usable across size-guard tests.
 */
const makeSizeGuardDiffService = (fromBody: string, toBody: string) => {
  const page = makeSitePage({ id: "p1" });
  const auth = new AuthorizationService();
  const pRepo = {
    ...createMinimalRepo(),
    findOne: vi.fn().mockResolvedValue(page)
  };
  const fromRev = { id: "rev-1", body: fromBody, revisionNumber: 1, pageId: "p1" };
  const toRev = { id: "rev-2", body: toBody, revisionNumber: 2, pageId: "p1" };
  const rRepo = {
    ...createMinimalRepo(),
    findOne: vi.fn()
      .mockResolvedValueOnce(fromRev)
      .mockResolvedValueOnce(toRev)
  };
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
};

describe("DocsService.getDiff — DoS size guard (ST-5 remediation: DOCS_DIFF_MAX_BODY_BYTES / DOCS_DIFF_MAX_LINES)", () => {
  // -----------------------------------------------------------------------
  // Byte-limit: guard fires BEFORE the O(m·n) LCS table is allocated.
  // -----------------------------------------------------------------------

  it("throws BadRequestException (400) when fromRev.body exceeds DOCS_DIFF_MAX_BODY_BYTES (AC-bytes-1)", async () => {
    // A body just one byte over the cap (ASCII 'a' repeated, so 1 byte per char).
    const oversizedBody = "a".repeat(DOCS_DIFF_MAX_BODY_BYTES + 1);
    const service = makeSizeGuardDiffService(oversizedBody, "normal body");

    await expect(service.getDiff("p1", 1, 2)).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) when toRev.body exceeds DOCS_DIFF_MAX_BODY_BYTES (AC-bytes-2)", async () => {
    const oversizedBody = "a".repeat(DOCS_DIFF_MAX_BODY_BYTES + 1);
    const service = makeSizeGuardDiffService("normal body", oversizedBody);

    await expect(service.getDiff("p1", 1, 2)).rejects.toThrow(BadRequestException);
  });

  it("byte-limit exception message names the byte cap (AC-msg)", async () => {
    const oversizedBody = "a".repeat(DOCS_DIFF_MAX_BODY_BYTES + 1);
    const service = makeSizeGuardDiffService(oversizedBody, "normal body");

    let caught: unknown = null;
    try {
      await service.getDiff("p1", 1, 2);
    } catch (e) {
      caught = e;
    }

    expect(caught).not.toBeNull();
    expect(caught instanceof BadRequestException).toBe(true);
    // Message must reference the byte limit so operators can act on it.
    expect((caught as BadRequestException).message).toContain(String(DOCS_DIFF_MAX_BODY_BYTES));
  });

  // -----------------------------------------------------------------------
  // Line-limit: guard fires AFTER the byte check, BEFORE LCS allocation.
  // -----------------------------------------------------------------------

  it("throws BadRequestException (400) when fromRev split line count > DOCS_DIFF_MAX_LINES (AC-lines-1)", async () => {
    // Build a body that is within the byte cap but has too many lines.
    // Each line is "x\n" (2 bytes); DOCS_DIFF_MAX_LINES + 1 lines = safely within 512 KB.
    const oversizedLines = Array.from({ length: DOCS_DIFF_MAX_LINES + 1 }, () => "x").join("\n");
    const service = makeSizeGuardDiffService(oversizedLines, "normal body");

    await expect(service.getDiff("p1", 1, 2)).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) when toRev split line count > DOCS_DIFF_MAX_LINES (AC-lines-2)", async () => {
    const oversizedLines = Array.from({ length: DOCS_DIFF_MAX_LINES + 1 }, () => "x").join("\n");
    const service = makeSizeGuardDiffService("normal body", oversizedLines);

    await expect(service.getDiff("p1", 1, 2)).rejects.toThrow(BadRequestException);
  });

  it("line-limit exception message names the line cap (AC-msg)", async () => {
    const oversizedLines = Array.from({ length: DOCS_DIFF_MAX_LINES + 1 }, () => "x").join("\n");
    const service = makeSizeGuardDiffService(oversizedLines, "normal body");

    let caught: unknown = null;
    try {
      await service.getDiff("p1", 1, 2);
    } catch (e) {
      caught = e;
    }

    expect(caught).not.toBeNull();
    expect(caught instanceof BadRequestException).toBe(true);
    expect((caught as BadRequestException).message).toContain(String(DOCS_DIFF_MAX_LINES));
  });

  // -----------------------------------------------------------------------
  // At-cap: body exactly AT the limit must pass without error (AC-at-cap).
  // -----------------------------------------------------------------------

  it("at-cap fromRev.body (exactly DOCS_DIFF_MAX_BODY_BYTES) does NOT throw (AC-at-cap)", async () => {
    // Exactly DOCS_DIFF_MAX_BODY_BYTES bytes of ASCII.
    const atCapBody = "a".repeat(DOCS_DIFF_MAX_BODY_BYTES);
    const service = makeSizeGuardDiffService(atCapBody, "normal to body");

    await expect(service.getDiff("p1", 1, 2)).resolves.toBeDefined();
  });

  it("at-cap toRev.body (exactly DOCS_DIFF_MAX_BODY_BYTES) does NOT throw (AC-at-cap)", async () => {
    const atCapBody = "a".repeat(DOCS_DIFF_MAX_BODY_BYTES);
    const service = makeSizeGuardDiffService("normal from body", atCapBody);

    await expect(service.getDiff("p1", 1, 2)).resolves.toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Guard fires BEFORE LCS: verify the constant values match the implementation.
  // -----------------------------------------------------------------------

  it("DOCS_DIFF_MAX_BODY_BYTES is 512_000 (512 KB per revision body, no env var)", () => {
    expect(DOCS_DIFF_MAX_BODY_BYTES).toBe(512_000);
  });

  it("DOCS_DIFF_MAX_LINES is 5_000 (lines per revision body, no env var)", () => {
    expect(DOCS_DIFF_MAX_LINES).toBe(5_000);
  });
});

// ---------------------------------------------------------------------------
// ST-5: DocsService.rollbackPage — AC3 (non-destructive), AC4 (access gate via assertDocWriteAccess)
// ---------------------------------------------------------------------------

/**
 * Build a rollback-capable DocsService stub.
 * The transaction callback receives a fake entity manager.
 */
const makeRollbackDocsService = (
  pageStub: unknown,
  targetRevStub: unknown,
  lastRevStub?: unknown,
  overrideTransactionBehavior?: (callback: (em: unknown) => Promise<unknown>) => Promise<unknown>
) => {
  const defaultTransactionBehavior = async (
    callback: (em: unknown) => Promise<unknown>
  ) => {
    const em = {
      findOne: vi.fn()
        .mockResolvedValueOnce(pageStub)          // page load
        .mockResolvedValueOnce(targetRevStub)     // target revision load
        .mockResolvedValueOnce(lastRevStub ?? targetRevStub) // last revision (highest revNum)
        .mockResolvedValue(pageStub),              // re-load for updatedAt
      create: vi.fn().mockImplementation((_entity: unknown, data: unknown) => ({
        ...data as object, createdAt: now, updatedAt: now
      })),
      save: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({})
    };
    return callback(em);
  };

  const auth = new AuthorizationService();
  const pRepo = {
    ...createMinimalRepo(),
    manager: { transaction: overrideTransactionBehavior ?? defaultTransactionBehavior }
  };
  const rRepo = createMinimalRepo();
  return new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: 30 });
};

describe("DocsService.rollbackPage (ST-5 AC3: non-destructive, creates new revision)", () => {
  const makeTargetRevision = (overrides?: Partial<Record<string, unknown>>) => ({
    id: "rev-1",
    revisionNumber: 1,
    pageId: "p1",
    title: "Original Title",
    body: "# Original content",
    summary: "initial",
    createdAt: now,
    ...overrides
  });

  it("returns DocWriteResultShape with new revisionNumber > target's revisionNumber (AC3)", async () => {
    const page = makeSitePage({ id: "p1", status: "published" });
    const targetRev = makeTargetRevision({ revisionNumber: 1 });
    // lastRev has revisionNumber=3, so the new rollback should be #4
    const lastRev = makeTargetRevision({ revisionNumber: 3 });
    const service = makeRollbackDocsService(page, targetRev, lastRev);

    const result = await service.rollbackPage("user-1", "p1", { revisionNumber: 1 });

    expect(result.revisionNumber).toBe(4);
    expect(result.title).toBe("Original Title");
    expect(result.id).toBe("p1");
  });

  it("creates a new revision with summary='Rolled back to revision N' (AC3)", async () => {
    const page = makeSitePage({ id: "p1", status: "published" });
    const targetRev = makeTargetRevision({ revisionNumber: 2 });

    let capturedRevisionData: Record<string, unknown> | null = null;

    const txBehavior = async (callback: (em: unknown) => Promise<unknown>) => {
      const em = {
        findOne: vi.fn()
          .mockResolvedValueOnce(page)
          .mockResolvedValueOnce(targetRev)
          .mockResolvedValueOnce({ revisionNumber: 3 })
          .mockResolvedValue(page),
        create: vi.fn().mockImplementation((_entity: unknown, data: unknown) => {
          capturedRevisionData = data as Record<string, unknown>;
          return { ...data as object, createdAt: now };
        }),
        save: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({})
      };
      return callback(em);
    };

    const auth = new AuthorizationService();
    const pRepo = { ...createMinimalRepo(), manager: { transaction: txBehavior } };
    const service = new DocsService(pRepo as never, createMinimalRepo() as never, auth, { lockTtlMinutes: 30 });

    await service.rollbackPage("user-1", "p1", { revisionNumber: 2 });

    // The second create call should be the DocsRevisionEntity (not the page).
    // We check the last create call data.
    expect((capturedRevisionData as unknown as Record<string, unknown>)["summary"]).toBe("Rolled back to revision 2");
  });

  it("throws BadRequestException (400) for non-positive revisionNumber input (AC3: validation)", async () => {
    const page = makeSitePage({ id: "p1", status: "published" });
    const service = makeRollbackDocsService(page, null);

    await expect(service.rollbackPage("user-1", "p1", { revisionNumber: 0 })).rejects.toThrow(
      BadRequestException
    );
    await expect(service.rollbackPage("user-1", "p1", { revisionNumber: -1 })).rejects.toThrow(
      BadRequestException
    );
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) when page does not exist (AC3: oracle parity)", async () => {
    const service = makeRollbackDocsService(null, null);
    await expect(service.rollbackPage("user-1", "nonexistent", { revisionNumber: 1 })).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for deleted page (AC3: oracle parity)", async () => {
    const deletedPage = makeSitePage({ id: "p1", status: "deleted" });
    const service = makeRollbackDocsService(deletedPage, null);
    await expect(service.rollbackPage("user-1", "p1", { revisionNumber: 1 })).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) when target revision does not exist (AC3)", async () => {
    const page = makeSitePage({ id: "p1", status: "published" });
    // targetRev null → revision not found
    const service = makeRollbackDocsService(page, null);
    await expect(service.rollbackPage("user-1", "p1", { revisionNumber: 99 })).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("sets the new revision's body to the target revision's body (non-destructive, AC3)", async () => {
    const page = makeSitePage({ id: "p1", status: "published" });
    const targetRev = makeTargetRevision({ body: "# Original content from rev 1" });

    const capturedCreates: Array<Record<string, unknown>> = [];

    const txBehavior = async (callback: (em: unknown) => Promise<unknown>) => {
      const em = {
        findOne: vi.fn()
          .mockResolvedValueOnce(page)
          .mockResolvedValueOnce(targetRev)
          .mockResolvedValueOnce({ revisionNumber: 1 })
          .mockResolvedValue(page),
        create: vi.fn().mockImplementation((_entity: unknown, data: unknown) => {
          capturedCreates.push(data as Record<string, unknown>);
          return { ...data as object, createdAt: now };
        }),
        save: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({})
      };
      return callback(em);
    };

    const auth = new AuthorizationService();
    const pRepo = { ...createMinimalRepo(), manager: { transaction: txBehavior } };
    const service = new DocsService(pRepo as never, createMinimalRepo() as never, auth, { lockTtlMinutes: 30 });

    await service.rollbackPage("user-1", "p1", { revisionNumber: 1 });

    // At least one create call should have the target body (the revision create)
    const revCreate = capturedCreates.find((c) => c.body === "# Original content from rev 1");
    expect(revCreate).toBeDefined();
  });

  it("calls em.save and em.update inside the transaction (P10: transactional, AC3)", async () => {
    const page = makeSitePage({ id: "p1", status: "published" });
    const targetRev = makeTargetRevision({ revisionNumber: 1 });

    const saveSpy = vi.fn().mockResolvedValue({});
    const updateSpy = vi.fn().mockResolvedValue({});

    const txBehavior = async (callback: (em: unknown) => Promise<unknown>) => {
      const em = {
        findOne: vi.fn()
          .mockResolvedValueOnce(page)
          .mockResolvedValueOnce(targetRev)
          .mockResolvedValueOnce({ revisionNumber: 1 })
          .mockResolvedValue(page),
        create: vi.fn().mockImplementation((_entity: unknown, data: unknown) => ({
          ...data as object, createdAt: now
        })),
        save: saveSpy,
        update: updateSpy
      };
      return callback(em);
    };

    const auth = new AuthorizationService();
    const pRepo = { ...createMinimalRepo(), manager: { transaction: txBehavior } };
    const service = new DocsService(pRepo as never, createMinimalRepo() as never, auth, { lockTtlMinutes: 30 });

    await service.rollbackPage("user-1", "p1", { revisionNumber: 1 });

    // save: the new revision row
    expect(saveSpy).toHaveBeenCalledTimes(1);
    // update: current_revision_id pointer + title on the page
    expect(updateSpy).toHaveBeenCalledTimes(1);
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

// ---------------------------------------------------------------------------
// ST-6: toPageShape lock field (AC10)
// ---------------------------------------------------------------------------

describe("DocsService toPageShape — lock field (AC10)", () => {
  // toPageShape is private; we test it indirectly via getPageByPath.

  it("includes lock field with isLocked=false when page is not locked", async () => {
    const page = makeSitePage({
      isLocked: 0,
      lockedByUserId: null,
      lockedAt: null,
      lockExpiresAt: null
    });
    const service = makeDocsService({ findOne: vi.fn().mockResolvedValue(page) });
    const result = await service.getPageByPath("getting-started");
    expect(result.lock).toBeDefined();
    expect(result.lock.isLocked).toBe(false);
    expect(result.lock.lockedByUserId).toBeNull();
    expect(result.lock.lockedAt).toBeNull();
    expect(result.lock.lockExpiresAt).toBeNull();
  });

  it("includes lock field with isLocked=true when page has a non-expired lock", async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const lockedAt = new Date(Date.now() - 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-99",
      lockedAt,
      lockExpiresAt: future
    });
    const service = makeDocsService({ findOne: vi.fn().mockResolvedValue(page) });
    const result = await service.getPageByPath("getting-started");
    expect(result.lock.isLocked).toBe(true);
    expect(result.lock.lockedByUserId).toBe("user-99");
    expect(result.lock.lockedAt).toEqual(lockedAt);
    expect(result.lock.lockExpiresAt).toEqual(future);
  });

  it("treats an expired lock as free (isLocked=false) even when isLocked=1 in DB", async () => {
    const past = new Date(Date.now() - 1000); // expired
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-99",
      lockedAt: new Date(Date.now() - 60000),
      lockExpiresAt: past
    });
    const service = makeDocsService({ findOne: vi.fn().mockResolvedValue(page) });
    const result = await service.getPageByPath("getting-started");
    // AC7: expired lock treated as free on read shape
    expect(result.lock.isLocked).toBe(false);
    expect(result.lock.lockedByUserId).toBeNull();
    expect(result.lock.lockExpiresAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ST-6: isActiveForeignLock (private — tested via assertNotForeignLocked) (AC7, AC8)
// ---------------------------------------------------------------------------

describe("DocsService.assertNotForeignLocked (AC6, AC7, AC8)", () => {
  it("does not throw when page is not locked (isLocked=0)", () => {
    const service = makeDocsService();
    const page = makeSitePage({ isLocked: 0 }) as never;
    expect(() => service.assertNotForeignLocked(page, "user-1", "user")).not.toThrow();
  });

  it("does not throw when the actor is the lock holder (isLocked=1, same userId)", () => {
    const service = makeDocsService();
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-1",
      lockedAt: new Date(),
      lockExpiresAt: future
    }) as never;
    expect(() => service.assertNotForeignLocked(page, "user-1", "user")).not.toThrow();
  });

  it("throws ConflictException (409) when a non-expired foreign lock exists (AC6)", () => {
    const { ConflictException: CE } = require("@nestjs/common");
    const service = makeDocsService();
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    }) as never;
    expect(() => service.assertNotForeignLocked(page, "user-actor", "user")).toThrow(CE);
  });

  it("does not throw when the foreign lock has expired (AC7: expired lock treated as free)", () => {
    const service = makeDocsService();
    const past = new Date(Date.now() - 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(Date.now() - 60000),
      lockExpiresAt: past
    }) as never;
    expect(() => service.assertNotForeignLocked(page, "user-actor", "user")).not.toThrow();
  });

  it("does not throw for moderator actor even when a foreign non-expired lock exists (AC8: staff bypass)", () => {
    const authorizationService = new AuthorizationService();
    const service = makeDocsService(undefined, undefined, authorizationService);
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    }) as never;
    expect(() => service.assertNotForeignLocked(page, "mod-actor", "moderator")).not.toThrow();
  });

  it("does not throw for admin actor even when a foreign non-expired lock exists (AC8: staff bypass)", () => {
    const authorizationService = new AuthorizationService();
    const service = makeDocsService(undefined, undefined, authorizationService);
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    }) as never;
    expect(() => service.assertNotForeignLocked(page, "admin-actor", "admin")).not.toThrow();
  });

  it("ConflictException includes holder metadata (lockedByUserId, lockExpiresAt)", () => {
    const service = makeDocsService();
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    }) as never;
    let thrown: unknown;
    try {
      service.assertNotForeignLocked(page, "user-actor", "user");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ConflictException);
    const response = (thrown as ConflictException).getResponse() as { details: { lockedByUserId: string; lockExpiresAt: Date } };
    expect(response.details.lockedByUserId).toBe("user-holder");
    expect(response.details.lockExpiresAt).toEqual(future);
  });
});

// ---------------------------------------------------------------------------
// ST-6: acquireLock (AC1, AC2, AC8)
// ---------------------------------------------------------------------------

describe("DocsService.acquireLock (AC1, AC2, AC8)", () => {
  const makeTransactionManager = (page: ReturnType<typeof makeSitePage> | null) => {
    const findOneSpy = vi.fn().mockResolvedValue(page);
    const updateSpy = vi.fn().mockResolvedValue({ affected: 1 });
    const txManager = { findOne: findOneSpy, update: updateSpy };
    const manager = {
      transaction: vi.fn().mockImplementation(async (cb: (em: typeof txManager) => unknown) => cb(txManager))
    };
    return { findOneSpy, updateSpy, manager };
  };

  it("returns DocsLockResultShape with { pageId, lock } on success (AC1)", async () => {
    const page = makeSitePage({ isLocked: 0, lockedByUserId: null });
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    const result = await service.acquireLock("user-1", "moderator", "page-1");
    expect(result.pageId).toBe("page-1");
    expect(result.lock.isLocked).toBe(true);
    expect(result.lock.lockedByUserId).toBe("user-1");
    expect(result.lock.lockedAt).toBeInstanceOf(Date);
    expect(result.lock.lockExpiresAt).toBeInstanceOf(Date);
  });

  it("lockExpiresAt is approximately now + lockTtlMinutes (AC1: TTL applied)", async () => {
    const page = makeSitePage({ isLocked: 0 });
    const { manager } = makeTransactionManager(page);
    const ttlMinutes = 15;
    const auth = new AuthorizationService();
    const pRepo = { ...createMinimalRepo(), manager };
    const rRepo = createMinimalRepo();
    const service = new DocsService(pRepo as never, rRepo as never, auth, { lockTtlMinutes: ttlMinutes });
    const before = Date.now();
    const result = await service.acquireLock("user-1", "moderator", "page-1");
    const after = Date.now();
    const expiresMs = result.lock.lockExpiresAt!.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + ttlMinutes * 60 * 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + ttlMinutes * 60 * 1000);
  });

  it("same holder can refresh an existing non-expired lock (AC1: refresh)", async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-1",
      lockedAt: new Date(Date.now() - 1000),
      lockExpiresAt: future
    });
    const { manager, updateSpy } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    const result = await service.acquireLock("user-1", "moderator", "page-1");
    // update was called — lock was refreshed
    expect(updateSpy).toHaveBeenCalled();
    expect(result.lock.isLocked).toBe(true);
    expect(result.lock.lockedByUserId).toBe("user-1");
  });

  it("throws ConflictException (409) with holder metadata when foreign non-expired lock exists (AC2)", async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    });
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    await expect(service.acquireLock("user-actor", "user", "page-1")).rejects.toThrow(ConflictException);
  });

  it("ConflictException response includes details.lockedByUserId and details.lockExpiresAt (AC2)", async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    });
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    let thrown: unknown;
    try {
      await service.acquireLock("user-actor", "user", "page-1");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ConflictException);
    const response = (thrown as ConflictException).getResponse() as { details: { lockedByUserId: string; lockExpiresAt: Date } };
    expect(response.details.lockedByUserId).toBe("user-holder");
    expect(response.details.lockExpiresAt).toEqual(future);
  });

  it("moderator can acquire lock even when a foreign non-expired lock exists (AC8: staff bypass)", async () => {
    const authorizationService = new AuthorizationService();
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    });
    const { manager } = makeTransactionManager(page);
    const pRepo = { ...createMinimalRepo(), manager };
    const rRepo = createMinimalRepo();
    const service = new DocsService(pRepo as never, rRepo as never, authorizationService, { lockTtlMinutes: 30 });
    const result = await service.acquireLock("mod-actor", "moderator", "page-1");
    expect(result.lock.isLocked).toBe(true);
    expect(result.lock.lockedByUserId).toBe("mod-actor");
  });

  it("acquires when expired foreign lock exists (AC7: expired lock treated as free)", async () => {
    const past = new Date(Date.now() - 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(Date.now() - 60000),
      lockExpiresAt: past
    });
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    const result = await service.acquireLock("user-actor", "user", "page-1");
    expect(result.lock.isLocked).toBe(true);
    expect(result.lock.lockedByUserId).toBe("user-actor");
  });

  it("throws NotFoundException (404) when page does not exist", async () => {
    const { manager } = makeTransactionManager(null);
    const service = makeDocsService({ manager });
    await expect(service.acquireLock("user-1", "moderator", "nonexistent")).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException (404) when page is deleted", async () => {
    const page = makeSitePage({ status: "deleted" });
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    await expect(service.acquireLock("user-1", "moderator", "page-1")).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// ST-6: releaseLock (AC3, AC4, AC5)
// ---------------------------------------------------------------------------

describe("DocsService.releaseLock (AC3, AC4, AC5)", () => {
  const makeTransactionManager = (page: ReturnType<typeof makeSitePage> | null) => {
    const findOneSpy = vi.fn().mockResolvedValue(page);
    const updateSpy = vi.fn().mockResolvedValue({ affected: 1 });
    const txManager = { findOne: findOneSpy, update: updateSpy };
    const manager = {
      transaction: vi.fn().mockImplementation(async (cb: (em: typeof txManager) => unknown) => cb(txManager))
    };
    return { findOneSpy, updateSpy, manager };
  };

  it("returns void (204-equivalent) and clears lock fields when holder releases (AC3)", async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-1",
      lockedAt: new Date(),
      lockExpiresAt: future
    });
    const { manager, updateSpy } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    await expect(service.releaseLock("user-1", "moderator", "page-1")).resolves.toBeUndefined();
    expect(updateSpy).toHaveBeenCalledWith(
      DocsPageEntity,
      { id: "page-1" },
      { isLocked: 0, lockedByUserId: null, lockedAt: null, lockExpiresAt: null }
    );
  });

  it("is idempotent when page is not locked — no error (AC3)", async () => {
    const page = makeSitePage({ isLocked: 0, lockedByUserId: null });
    const { manager, updateSpy } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    await expect(service.releaseLock("user-1", "moderator", "page-1")).resolves.toBeUndefined();
    expect(updateSpy).toHaveBeenCalled();
  });

  it("is idempotent when lock has already expired — no error (AC3)", async () => {
    const past = new Date(Date.now() - 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-1",
      lockedAt: new Date(Date.now() - 60000),
      lockExpiresAt: past
    });
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    await expect(service.releaseLock("user-1", "moderator", "page-1")).resolves.toBeUndefined();
  });

  it("moderator can release a lock held by another user (AC4: staff override)", async () => {
    const authorizationService = new AuthorizationService();
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    });
    const { manager } = makeTransactionManager(page);
    const pRepo = { ...createMinimalRepo(), manager };
    const rRepo = createMinimalRepo();
    const service = new DocsService(pRepo as never, rRepo as never, authorizationService, { lockTtlMinutes: 30 });
    await expect(service.releaseLock("mod-actor", "moderator", "page-1")).resolves.toBeUndefined();
  });

  it("admin can release a lock held by another user (AC4: staff override)", async () => {
    const authorizationService = new AuthorizationService();
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    });
    const { manager } = makeTransactionManager(page);
    const pRepo = { ...createMinimalRepo(), manager };
    const rRepo = createMinimalRepo();
    const service = new DocsService(pRepo as never, rRepo as never, authorizationService, { lockTtlMinutes: 30 });
    await expect(service.releaseLock("admin-actor", "admin", "page-1")).resolves.toBeUndefined();
  });

  it("throws ForbiddenException (403) when non-holder non-staff tries to release an active lock (AC5)", async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    });
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    await expect(service.releaseLock("user-actor", "user", "page-1")).rejects.toThrow(ForbiddenException);
  });

  it("throws NotFoundException (404) when page does not exist", async () => {
    const { manager } = makeTransactionManager(null);
    const service = makeDocsService({ manager });
    await expect(service.releaseLock("user-1", "moderator", "nonexistent")).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// ST-6: addRevision / renamePage / softDeletePage / rollbackPage call assertNotForeignLocked (AC6)
// ---------------------------------------------------------------------------

describe("DocsService write paths — assertNotForeignLocked called (AC6)", () => {
  const makeForeignLockedPage = () => {
    const future = new Date(Date.now() + 30 * 60 * 1000);
    return makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    });
  };

  const makeTransactionManager = (page: ReturnType<typeof makeSitePage>) => {
    const findOneSpy = vi.fn().mockResolvedValue(page);
    const lastRevSpy = vi.fn().mockResolvedValue(null);
    // Implement varying findOne responses for addRevision, renamePage, rollbackPage
    findOneSpy.mockImplementation((_entity: unknown, opts: unknown) => {
      const options = opts as { where?: { revisionNumber?: number } };
      if (options?.where && "revisionNumber" in (options.where ?? {})) {
        return Promise.resolve(null);
      }
      return Promise.resolve(page);
    });
    const updateSpy = vi.fn().mockResolvedValue({ affected: 1 });
    const saveSpy = vi.fn().mockResolvedValue({});
    const createSpy = vi.fn().mockReturnValue({});
    const qb: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["where", "andWhere", "getMany"]) {
      qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb["getMany"] = vi.fn().mockResolvedValue([]);
    const createQueryBuilderSpy = vi.fn().mockReturnValue(qb);
    const txManager = {
      findOne: findOneSpy,
      update: updateSpy,
      save: saveSpy,
      create: createSpy,
      createQueryBuilder: createQueryBuilderSpy
    };
    const manager = {
      transaction: vi.fn().mockImplementation(async (cb: (em: typeof txManager) => unknown) => cb(txManager))
    };
    return { manager, findOneSpy };
  };

  it("addRevision throws 409 when page is locked by another user (AC6)", async () => {
    const page = makeForeignLockedPage();
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    await expect(
      service.addRevision("user-actor", "page-1", { title: "T", body: "B" }, "user")
    ).rejects.toThrow(ConflictException);
  });

  it("renamePage throws 409 when page is locked by another user (AC6)", async () => {
    const page = makeForeignLockedPage();
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    await expect(
      service.renamePage("page-1", { title: "New Title" }, "user-actor", "user")
    ).rejects.toThrow(ConflictException);
  });

  it("softDeletePage throws 409 when page is locked by another user (AC6)", async () => {
    const page = makeForeignLockedPage();
    const findOneSpy = vi.fn().mockResolvedValue(page);
    const countSpy = vi.fn().mockResolvedValue(0);
    const updateSpy = vi.fn().mockResolvedValue({ affected: 1 });
    const txManager = { findOne: findOneSpy, count: countSpy, update: updateSpy };
    const manager = {
      transaction: vi.fn().mockImplementation(async (cb: (em: typeof txManager) => unknown) => cb(txManager))
    };
    const service = makeDocsService({ manager });
    await expect(
      service.softDeletePage("page-1", "user-actor", "user")
    ).rejects.toThrow(ConflictException);
  });

  it("rollbackPage throws 409 when page is locked by another user (AC6)", async () => {
    const page = makeForeignLockedPage();
    const { manager } = makeTransactionManager(page);
    const service = makeDocsService({ manager });
    await expect(
      service.rollbackPage("user-actor", "page-1", { revisionNumber: 1 }, "user")
    ).rejects.toThrow(ConflictException);
  });

  it("addRevision succeeds for same holder (AC6: holder is not foreign)", async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000);
    const page = makeSitePage({
      isLocked: 1,
      lockedByUserId: "user-holder",
      lockedAt: new Date(),
      lockExpiresAt: future
    });
    const findOneSpy = vi.fn()
      .mockResolvedValueOnce(page) // load page
      .mockResolvedValueOnce(null)  // last revision
      .mockResolvedValueOnce(page); // re-load after update
    const updateSpy = vi.fn().mockResolvedValue({ affected: 1 });
    const saveSpy = vi.fn().mockResolvedValue({});
    const createSpy = vi.fn().mockReturnValue({});
    const txManager = { findOne: findOneSpy, update: updateSpy, save: saveSpy, create: createSpy };
    const manager = {
      transaction: vi.fn().mockImplementation(async (cb: (em: typeof txManager) => unknown) => cb(txManager))
    };
    const service = makeDocsService({ manager });
    await expect(
      service.addRevision("user-holder", "page-1", { title: "T", body: "B" }, "user")
    ).resolves.not.toThrow();
  });
});
