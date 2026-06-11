/**
 * docs.controller.test.ts
 *
 * Unit tests for DocsController (ST-2).
 *
 * Acceptance criteria validated:
 * AC1: listPageTree delegates to docsService.listPageTree; getPageByPath delegates to
 *      docsService.getPageByPath — resolves published site page with breadcrumbs.
 * AC2: Oracle parity — NotFoundException from service propagates unchanged; the same 404
 *      is returned regardless of whether the page is nonexistent, deleted, or non-readable.
 * AC3: listPageTree wraps result in { pages } shape; no project pages present.
 * AC4: listRecentEdits delegates to docsService.listRecentEdits with parsed limit; wraps
 *      result in { docs } shape.
 * AC5: All routes require no authentication; AuthService is never invoked.
 */

import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { DocsController } from "./docs.controller";
import { DocsService } from "./docs.service";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const now = new Date("2026-01-01T00:00:00Z");

const makeDocsService = (overrides?: Record<string, unknown>) => ({
  isPagePubliclyReadable: vi.fn().mockReturnValue(true),
  computePathHash: vi.fn().mockReturnValue("abc123"),
  getPageByPath: vi.fn().mockResolvedValue({
    id: "page-1",
    title: "Getting Started",
    path: "getting-started",
    depth: 0,
    parentId: null,
    visibility: "public",
    breadcrumbs: [],
    currentRevision: {
      id: "rev-1",
      title: "Getting Started",
      body: "# Getting Started",
      summary: null,
      revisionNumber: 1,
      author: { username: "author1", displayName: "Author One" },
      editorUsername: null,
      createdAt: now
    },
    createdAt: now,
    updatedAt: now
  }),
  listPageTree: vi.fn().mockResolvedValue([]),
  listRecentEdits: vi.fn().mockResolvedValue([]),
  ...overrides
});

// ST-3 added AuthService as a second constructor parameter (required for write routes).
// Read-route tests pass null for authService — the read handlers never invoke it.
const makeController = (docsService?: ReturnType<typeof makeDocsService>) =>
  new DocsController((docsService ?? makeDocsService()) as never, null as never);

// ---------------------------------------------------------------------------
// GET /docs — listPageTree (AC3)
// ---------------------------------------------------------------------------

describe("DocsController: listPageTree (AC3: tree shape, no project pages)", () => {
  it("returns { pages } from docsService.listPageTree", async () => {
    const pages = [
      {
        id: "page-1",
        title: "Getting Started",
        path: "getting-started",
        depth: 0,
        parentId: null,
        hasChildren: false,
        createdAt: now,
        updatedAt: now
      }
    ];
    const listPageTreeSpy = vi.fn().mockResolvedValue(pages);
    const docsService = makeDocsService({ listPageTree: listPageTreeSpy });
    const controller = makeController(docsService);

    const result = await controller.listPageTree();

    expect(result).toEqual({ pages });
    expect(listPageTreeSpy).toHaveBeenCalledWith(undefined);
  });

  it("passes parentPath query param to docsService.listPageTree", async () => {
    const listPageTreeSpy = vi.fn().mockResolvedValue([]);
    const docsService = makeDocsService({ listPageTree: listPageTreeSpy });
    const controller = makeController(docsService);

    await controller.listPageTree("getting-started");

    expect(listPageTreeSpy).toHaveBeenCalledWith("getting-started");
  });

  it("propagates NotFoundException from service when parentPath is not found (oracle parity)", async () => {
    const listPageTreeSpy = vi.fn().mockRejectedValue(
      new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
    );
    const docsService = makeDocsService({ listPageTree: listPageTreeSpy });
    const controller = makeController(docsService);

    await expect(controller.listPageTree("nonexistent-parent")).rejects.toThrow(NotFoundException);
    await expect(controller.listPageTree("nonexistent-parent")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("returns { pages: [] } when no publicly-readable site pages exist (AC3: stable empty list)", async () => {
    const docsService = makeDocsService({ listPageTree: vi.fn().mockResolvedValue([]) });
    const controller = makeController(docsService);

    const result = await controller.listPageTree();

    expect(result).toEqual({ pages: [] });
  });
});

// ---------------------------------------------------------------------------
// GET /docs/recent — listRecentEdits (AC4)
// ---------------------------------------------------------------------------

describe("DocsController: listRecentEdits (AC4: recent feed delegation)", () => {
  it("returns { docs } from docsService.listRecentEdits", async () => {
    const recentItems = [
      {
        pageId: "page-1",
        title: "Getting Started",
        path: "getting-started",
        editor: { username: "user1", displayName: "User One" },
        editedAt: now
      }
    ];
    const listRecentEditsSpy = vi.fn().mockResolvedValue(recentItems);
    const docsService = makeDocsService({ listRecentEdits: listRecentEditsSpy });
    const controller = makeController(docsService);

    const result = await controller.listRecentEdits();

    expect(result).toEqual({ docs: recentItems });
    expect(listRecentEditsSpy).toHaveBeenCalledWith({ limit: undefined });
  });

  it("parses the limit query string to integer and passes to service (AC4: limit param)", async () => {
    const listRecentEditsSpy = vi.fn().mockResolvedValue([]);
    const docsService = makeDocsService({ listRecentEdits: listRecentEditsSpy });
    const controller = makeController(docsService);

    await controller.listRecentEdits("10");

    expect(listRecentEditsSpy).toHaveBeenCalledWith({ limit: 10 });
  });

  it("passes undefined limit when no limit string is given (AC4: default applied by service)", async () => {
    const listRecentEditsSpy = vi.fn().mockResolvedValue([]);
    const docsService = makeDocsService({ listRecentEdits: listRecentEditsSpy });
    const controller = makeController(docsService);

    await controller.listRecentEdits(undefined);

    expect(listRecentEditsSpy).toHaveBeenCalledWith({ limit: undefined });
  });

  it("returns { docs: [] } when no public activity exists (AC4: stable empty list)", async () => {
    const docsService = makeDocsService({ listRecentEdits: vi.fn().mockResolvedValue([]) });
    const controller = makeController(docsService);

    const result = await controller.listRecentEdits();

    expect(result).toEqual({ docs: [] });
  });
});

// ---------------------------------------------------------------------------
// GET /docs/*path — getPageByPath (AC1, AC2)
// ---------------------------------------------------------------------------

describe("DocsController: getPageByPath (AC1: path resolution and breadcrumbs)", () => {
  it("returns { page } from docsService.getPageByPath for a valid path", async () => {
    const page = {
      id: "page-1",
      title: "Getting Started",
      path: "getting-started",
      depth: 0,
      parentId: null,
      visibility: "public",
      breadcrumbs: [],
      currentRevision: {
        id: "rev-1",
        title: "Getting Started",
        body: "# Getting Started",
        summary: null,
        revisionNumber: 1,
        author: { username: "author1", displayName: "Author One" },
        editorUsername: null,
        createdAt: now
      },
      createdAt: now,
      updatedAt: now
    };
    const getPageByPathSpy = vi.fn().mockResolvedValue(page);
    const docsService = makeDocsService({ getPageByPath: getPageByPathSpy });
    const controller = makeController(docsService);

    const result = await controller.getPageByPath("getting-started");

    expect(result).toEqual({ page });
    expect(getPageByPathSpy).toHaveBeenCalledWith("getting-started");
  });

  it("handles wildcard path param as an array of segments (NestJS Express adapter variation)", async () => {
    const getPageByPathSpy = vi.fn().mockResolvedValue({
      id: "page-1",
      title: "Installation",
      path: "getting-started/installation",
      depth: 1,
      parentId: "page-root",
      visibility: "public",
      breadcrumbs: [{ id: "page-root", title: "Getting Started", path: "getting-started" }],
      currentRevision: null,
      createdAt: now,
      updatedAt: now
    });
    const docsService = makeDocsService({ getPageByPath: getPageByPathSpy });
    const controller = makeController(docsService);

    // Simulate NestJS passing path as an array
    await controller.getPageByPath(["getting-started", "installation"] as never);

    expect(getPageByPathSpy).toHaveBeenCalledWith("getting-started/installation");
  });

  it("returns breadcrumbs array in the page shape (AC1: ordered breadcrumb ancestry)", async () => {
    const page = {
      id: "page-child",
      title: "Installation",
      path: "getting-started/installation",
      depth: 1,
      parentId: "page-root",
      visibility: "public",
      breadcrumbs: [{ id: "page-root", title: "Getting Started", path: "getting-started" }],
      currentRevision: null,
      createdAt: now,
      updatedAt: now
    };
    const docsService = makeDocsService({ getPageByPath: vi.fn().mockResolvedValue(page) });
    const controller = makeController(docsService);

    const result = await controller.getPageByPath("getting-started/installation");

    expect(result.page.breadcrumbs).toHaveLength(1);
    expect(result.page.breadcrumbs[0]).toEqual({
      id: "page-root",
      title: "Getting Started",
      path: "getting-started"
    });
  });
});

describe("DocsController: getPageByPath oracle parity (AC2: identical 404 for all non-readable paths)", () => {
  it("throws NotFoundException when path is empty (guards against zero-length path)", async () => {
    const docsService = makeDocsService();
    const controller = makeController(docsService);
    await expect(controller.getPageByPath("  ")).rejects.toThrow(NotFoundException);
    await expect(controller.getPageByPath("  ")).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });

  it("propagates NotFoundException from service for nonexistent path (oracle parity)", async () => {
    const getPageByPathSpy = vi.fn().mockRejectedValue(
      new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
    );
    const docsService = makeDocsService({ getPageByPath: getPageByPathSpy });
    const controller = makeController(docsService);

    await expect(controller.getPageByPath("nonexistent/path")).rejects.toThrow(NotFoundException);
    await expect(controller.getPageByPath("nonexistent/path")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("propagates NotFoundException from service for deleted page (oracle parity)", async () => {
    const getPageByPathSpy = vi.fn().mockRejectedValue(
      new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
    );
    const docsService = makeDocsService({ getPageByPath: getPageByPathSpy });
    const controller = makeController(docsService);

    await expect(controller.getPageByPath("deleted-page")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("propagates NotFoundException from service for non-readable page (oracle parity)", async () => {
    const getPageByPathSpy = vi.fn().mockRejectedValue(
      new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
    );
    const docsService = makeDocsService({ getPageByPath: getPageByPathSpy });
    const controller = makeController(docsService);

    await expect(controller.getPageByPath("members-only-page")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("all three gated cases propagate the IDENTICAL message (AC2: oracle parity)", async () => {
    const makeGatedController = () => {
      const spy = vi.fn().mockRejectedValue(
        new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
      );
      return makeController(makeDocsService({ getPageByPath: spy }));
    };

    let nonexistentMsg = "";
    let deletedMsg = "";
    let gatedMsg = "";

    try { await makeGatedController().getPageByPath("nonexistent"); } catch (e: unknown) { nonexistentMsg = (e as Error).message; }
    try { await makeGatedController().getPageByPath("deleted"); } catch (e: unknown) { deletedMsg = (e as Error).message; }
    try { await makeGatedController().getPageByPath("members-only"); } catch (e: unknown) { gatedMsg = (e as Error).message; }

    expect(nonexistentMsg).toBe(DocsService.PAGE_NOT_FOUND_MESSAGE);
    expect(deletedMsg).toBe(DocsService.PAGE_NOT_FOUND_MESSAGE);
    expect(gatedMsg).toBe(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// AC5: No authentication on any route
// ---------------------------------------------------------------------------

describe("DocsController AC5: routes require no authentication (public, anonymous)", () => {
  it("listPageTree succeeds without any auth context", async () => {
    const controller = makeController();
    // Should not throw even with no auth-related arguments
    const result = await controller.listPageTree();
    expect(result).toHaveProperty("pages");
  });

  it("listRecentEdits succeeds without any auth context", async () => {
    const controller = makeController();
    const result = await controller.listRecentEdits();
    expect(result).toHaveProperty("docs");
  });

  it("getPageByPath succeeds without any auth context", async () => {
    const controller = makeController();
    const result = await controller.getPageByPath("getting-started");
    expect(result).toHaveProperty("page");
  });

  it("DocsController constructor is constructable with DocsService and a null AuthService (read routes use no auth)", () => {
    // ST-3 added AuthService as a required constructor param (for write-route session resolution).
    // Read routes (listPageTree, listRecentEdits, getPageByPath) do not invoke AuthService,
    // so passing null for test purposes is safe for read-only test scenarios.
    expect(() => new DocsController(makeDocsService() as never, null as never)).not.toThrow();
  });
});
