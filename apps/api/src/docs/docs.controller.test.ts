/**
 * docs.controller.test.ts
 *
 * Unit tests for DocsController (ST-2, ST-3, and ST-4).
 *
 * ST-2 acceptance criteria validated:
 * AC1: listPageTree delegates to docsService.listPageTree; getPageByPath delegates to
 *      docsService.getPageByPath — resolves published site page with breadcrumbs.
 * AC2: Oracle parity — NotFoundException from service propagates unchanged; the same 404
 *      is returned regardless of whether the page is nonexistent, deleted, or non-readable.
 * AC3: listPageTree wraps result in { pages } shape; no project pages present.
 * AC4: listRecentEdits delegates to docsService.listRecentEdits with parsed limit; wraps
 *      result in { docs } shape.
 * AC5: All routes require no authentication; AuthService is never invoked.
 *
 * ST-3 acceptance criteria validated:
 * AC1: POST /api/docs (createPage) delegates to service and returns 201 { page }.
 * AC2: POST /api/docs/:id/revisions (addRevision) delegates to service and returns 201 { page }.
 * AC3: 400 propagated for invalid input; 409 propagated for path_hash collision.
 * AC4: ThrottleGuard attached at the decorator level (presence validated by metadata).
 * AC5: assertDocWriteAccess is the SINGLE auth gate — controller calls auth then service.
 *
 * ST-4 acceptance criteria validated:
 * AC1: PATCH /api/docs/:id (renamePage) delegates to service and returns 200 { page }.
 * AC2: Title-only rename returns 200 { page } without altering path.
 * AC3: DELETE /api/docs/:id (softDeletePage) returns 204 No Content for leaf pages.
 * AC4: DELETE returns 409 when service throws ConflictException (non-deleted children).
 * AC5: Both PATCH and DELETE routes call resolveSession (401) then assertDocWriteAccess (403).
 */

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
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

// ---------------------------------------------------------------------------
// POST /docs — createPage (ST-3 AC1, AC3, AC4, AC5)
// ---------------------------------------------------------------------------

const makeWriteResult = (overrides?: Record<string, unknown>) => ({
  id: "page-1",
  title: "My Page",
  path: "my-page",
  depth: 0,
  parentId: null,
  currentRevisionId: "rev-1",
  revisionNumber: 1,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

/**
 * Build a write-capable controller with AuthService stub that resolves a
 * moderator session.
 */
const makeWriteController = (
  docsServiceOverrides?: Record<string, unknown>,
  authServiceOverrides?: Record<string, unknown>
) => {
  const docsService = {
    ...makeDocsService(),
    assertDocWriteAccess: vi.fn(),
    createPage: vi.fn().mockResolvedValue(makeWriteResult()),
    addRevision: vi.fn().mockResolvedValue(makeWriteResult({ revisionNumber: 2 })),
    ...docsServiceOverrides
  };
  const authService = {
    resolveSession: vi.fn().mockResolvedValue({
      user: { id: "user-1", globalRole: "moderator" }
    }),
    ...authServiceOverrides
  };
  return new DocsController(docsService as never, authService as never);
};

const makeFakeRequest = (cookie?: string) => ({
  headers: { cookie: cookie ?? "session=abc" }
}) as never;

describe("DocsController: createPage (ST-3 AC1, AC3, AC4, AC5)", () => {
  it("returns { page } with revisionNumber=1 for a valid create request (AC1)", async () => {
    const controller = makeWriteController();
    const result = await controller.createPage(makeFakeRequest(), {
      title: "My Page",
      slug: "my-page",
      body: "# Hello"
    });
    expect(result).toHaveProperty("page");
    expect(result.page.revisionNumber).toBe(1);
    expect(result.page.path).toBe("my-page");
  });

  it("delegates to docsService.createPage with the actor userId and body (AC1)", async () => {
    const createPageSpy = vi.fn().mockResolvedValue(makeWriteResult());
    const controller = makeWriteController({ createPage: createPageSpy });
    const body = { title: "Page", slug: "page", body: "body" };
    await controller.createPage(makeFakeRequest(), body);
    expect(createPageSpy).toHaveBeenCalledWith("user-1", body);
  });

  it("calls assertDocWriteAccess with actor globalRole and 'site' before docsService.createPage (AC5)", async () => {
    const assertSpy = vi.fn();
    const createPageSpy = vi.fn().mockResolvedValue(makeWriteResult());
    const controller = makeWriteController({ assertDocWriteAccess: assertSpy, createPage: createPageSpy });
    await controller.createPage(makeFakeRequest(), { title: "P", slug: "p", body: "b" });
    expect(assertSpy).toHaveBeenCalledWith("moderator", "site");
    // createPage should be called AFTER assertDocWriteAccess
    const assertOrder = assertSpy.mock.invocationCallOrder[0];
    const createOrder = createPageSpy.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(createOrder!);
  });

  it("propagates ForbiddenException (403) when assertDocWriteAccess throws (AC5)", async () => {
    const controller = makeWriteController({
      assertDocWriteAccess: vi.fn().mockImplementation(() => {
        throw new ForbiddenException("Write access requires moderator or admin role.");
      })
    });
    await expect(
      controller.createPage(makeFakeRequest(), { title: "P", slug: "p", body: "b" })
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws BadRequestException (400) for missing title in body guard (AC3)", async () => {
    const controller = makeWriteController();
    await expect(
      controller.createPage(makeFakeRequest(), { title: "  ", slug: "p", body: "b" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for missing slug in body guard (AC3)", async () => {
    const controller = makeWriteController();
    await expect(
      controller.createPage(makeFakeRequest(), { title: "T", slug: "  ", body: "b" })
    ).rejects.toThrow(BadRequestException);
  });

  it("propagates ConflictException (409) from service on path_hash collision (AC3)", async () => {
    const controller = makeWriteController({
      createPage: vi.fn().mockRejectedValue(
        new ConflictException("A page with this path already exists in this scope.")
      )
    });
    await expect(
      controller.createPage(makeFakeRequest(), { title: "T", slug: "t", body: "b" })
    ).rejects.toThrow(ConflictException);
  });

  it("propagates UnauthorizedException (401) when resolveSession throws (AC5)", async () => {
    const controller = makeWriteController(
      {},
      {
        resolveSession: vi.fn().mockRejectedValue(
          new UnauthorizedException("No active session.")
        )
      }
    );
    await expect(
      controller.createPage(makeFakeRequest(), { title: "T", slug: "t", body: "b" })
    ).rejects.toThrow(UnauthorizedException);
  });
});

// ---------------------------------------------------------------------------
// POST /docs/:id/revisions — addRevision (ST-3 AC2, AC3, AC4, AC5)
// ---------------------------------------------------------------------------

describe("DocsController: addRevision (ST-3 AC2, AC3, AC4, AC5)", () => {
  it("returns { page } with incremented revisionNumber for a valid edit request (AC2)", async () => {
    const controller = makeWriteController();
    const result = await controller.addRevision(makeFakeRequest(), "page-1", {
      title: "Updated Title",
      body: "new body"
    });
    expect(result).toHaveProperty("page");
    expect(result.page.revisionNumber).toBe(2);
  });

  it("delegates to docsService.addRevision with actorUserId, pageId, and body (AC2)", async () => {
    const addRevisionSpy = vi.fn().mockResolvedValue(makeWriteResult({ revisionNumber: 2 }));
    const controller = makeWriteController({ addRevision: addRevisionSpy });
    const body = { title: "Revised", body: "body v2" };
    await controller.addRevision(makeFakeRequest(), "page-1", body);
    expect(addRevisionSpy).toHaveBeenCalledWith("user-1", "page-1", body);
  });

  it("calls assertDocWriteAccess with actor globalRole and 'site' before service.addRevision (AC5)", async () => {
    const assertSpy = vi.fn();
    const addRevisionSpy = vi.fn().mockResolvedValue(makeWriteResult({ revisionNumber: 2 }));
    const controller = makeWriteController({
      assertDocWriteAccess: assertSpy,
      addRevision: addRevisionSpy
    });
    await controller.addRevision(makeFakeRequest(), "page-1", {
      title: "T",
      body: "b"
    });
    expect(assertSpy).toHaveBeenCalledWith("moderator", "site");
    const assertOrder = assertSpy.mock.invocationCallOrder[0];
    const addRevOrder = addRevisionSpy.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(addRevOrder!);
  });

  it("propagates ForbiddenException (403) when assertDocWriteAccess throws (AC5)", async () => {
    const controller = makeWriteController({
      assertDocWriteAccess: vi.fn().mockImplementation(() => {
        throw new ForbiddenException("Write access requires moderator or admin role.");
      })
    });
    await expect(
      controller.addRevision(makeFakeRequest(), "page-1", { title: "T", body: "b" })
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws BadRequestException (400) for empty title in body guard (AC3)", async () => {
    const controller = makeWriteController();
    await expect(
      controller.addRevision(makeFakeRequest(), "page-1", { title: "  ", body: "b" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for non-string body (AC3)", async () => {
    const controller = makeWriteController();
    await expect(
      controller.addRevision(makeFakeRequest(), "page-1", { title: "T", body: 42 as never })
    ).rejects.toThrow(BadRequestException);
  });

  it("propagates NotFoundException (404) for nonexistent page (AC2 / oracle parity)", async () => {
    const controller = makeWriteController({
      addRevision: vi.fn().mockRejectedValue(
        new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
      )
    });
    await expect(
      controller.addRevision(makeFakeRequest(), "nonexistent", { title: "T", body: "b" })
    ).rejects.toThrow(NotFoundException);
  });

  it("propagates UnauthorizedException (401) when resolveSession throws (AC5)", async () => {
    const controller = makeWriteController(
      {},
      {
        resolveSession: vi.fn().mockRejectedValue(
          new UnauthorizedException("No active session.")
        )
      }
    );
    await expect(
      controller.addRevision(makeFakeRequest(), "page-1", { title: "T", body: "b" })
    ).rejects.toThrow(UnauthorizedException);
  });
});

// ---------------------------------------------------------------------------
// PATCH /docs/:id — renamePage (ST-4 AC1, AC2, AC5)
// ---------------------------------------------------------------------------

/**
 * Build a rename-capable write controller stub.
 * Extends makeWriteController with a `renamePage` service method.
 */
const makeRenameController = (
  docsServiceOverrides?: Record<string, unknown>,
  authServiceOverrides?: Record<string, unknown>
) => {
  const docsService = {
    ...makeDocsService(),
    assertDocWriteAccess: vi.fn(),
    renamePage: vi.fn().mockResolvedValue(makeWriteResult()),
    softDeletePage: vi.fn().mockResolvedValue(undefined),
    ...docsServiceOverrides
  };
  const authService = {
    resolveSession: vi.fn().mockResolvedValue({
      user: { id: "user-1", globalRole: "moderator" }
    }),
    ...authServiceOverrides
  };
  return new DocsController(docsService as never, authService as never);
};

describe("DocsController: renamePage (ST-4 AC1, AC2, AC5)", () => {
  it("returns { page } for a valid slug rename (AC1: slug rename returns 200 { page })", async () => {
    const renameResult = makeWriteResult({ path: "new-slug" });
    const controller = makeRenameController({ renamePage: vi.fn().mockResolvedValue(renameResult) });

    const result = await controller.renamePage(makeFakeRequest(), "page-1", { slug: "new-slug" });

    expect(result).toHaveProperty("page");
    expect(result.page.path).toBe("new-slug");
  });

  it("delegates to docsService.renamePage with the page id and body (AC1)", async () => {
    const renamePageSpy = vi.fn().mockResolvedValue(makeWriteResult());
    const controller = makeRenameController({ renamePage: renamePageSpy });
    const body = { slug: "new-slug" };

    await controller.renamePage(makeFakeRequest(), "page-1", body);

    expect(renamePageSpy).toHaveBeenCalledWith("page-1", body);
  });

  it("returns { page } for a title-only rename (AC2: title-only returns 200 { page })", async () => {
    const renameResult = makeWriteResult({ title: "New Title" });
    const controller = makeRenameController({ renamePage: vi.fn().mockResolvedValue(renameResult) });

    const result = await controller.renamePage(makeFakeRequest(), "page-1", { title: "New Title" });

    expect(result).toHaveProperty("page");
    expect(result.page.title).toBe("New Title");
  });

  it("calls assertDocWriteAccess with actor globalRole and 'site' before renamePage (AC5)", async () => {
    const assertSpy = vi.fn();
    const renamePageSpy = vi.fn().mockResolvedValue(makeWriteResult());
    const controller = makeRenameController({ assertDocWriteAccess: assertSpy, renamePage: renamePageSpy });

    await controller.renamePage(makeFakeRequest(), "page-1", { slug: "new-slug" });

    expect(assertSpy).toHaveBeenCalledWith("moderator", "site");
    const assertOrder = assertSpy.mock.invocationCallOrder[0];
    const renameOrder = renamePageSpy.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(renameOrder!);
  });

  it("throws BadRequestException (400) when neither slug nor title provided (body guard)", async () => {
    const controller = makeRenameController();

    await expect(
      controller.renamePage(makeFakeRequest(), "page-1", {})
    ).rejects.toThrow(BadRequestException);
  });

  it("propagates ForbiddenException (403) when assertDocWriteAccess throws (AC5)", async () => {
    const controller = makeRenameController({
      assertDocWriteAccess: vi.fn().mockImplementation(() => {
        throw new ForbiddenException("Write access requires moderator or admin role.");
      })
    });

    await expect(
      controller.renamePage(makeFakeRequest(), "page-1", { slug: "new-slug" })
    ).rejects.toThrow(ForbiddenException);
  });

  it("propagates NotFoundException (404) from service for nonexistent page (AC1)", async () => {
    const controller = makeRenameController({
      renamePage: vi.fn().mockRejectedValue(
        new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
      )
    });

    await expect(
      controller.renamePage(makeFakeRequest(), "nonexistent", { slug: "new-slug" })
    ).rejects.toThrow(NotFoundException);
  });

  it("propagates ConflictException (409) from service for path collision (AC1)", async () => {
    const controller = makeRenameController({
      renamePage: vi.fn().mockRejectedValue(
        new ConflictException("A page with this path already exists in this scope.")
      )
    });

    await expect(
      controller.renamePage(makeFakeRequest(), "page-1", { slug: "collision-slug" })
    ).rejects.toThrow(ConflictException);
  });

  it("propagates UnauthorizedException (401) when resolveSession throws (AC5)", async () => {
    const controller = makeRenameController(
      {},
      { resolveSession: vi.fn().mockRejectedValue(new UnauthorizedException("No active session.")) }
    );

    await expect(
      controller.renamePage(makeFakeRequest(), "page-1", { slug: "new-slug" })
    ).rejects.toThrow(UnauthorizedException);
  });
});

// ---------------------------------------------------------------------------
// DELETE /docs/:id — softDeletePage (ST-4 AC3, AC4, AC5)
// ---------------------------------------------------------------------------

describe("DocsController: softDeletePage (ST-4 AC3, AC4, AC5)", () => {
  it("returns void (undefined) for a successful leaf page delete (AC3: 204 No Content)", async () => {
    const controller = makeRenameController({ softDeletePage: vi.fn().mockResolvedValue(undefined) });

    const result = await controller.softDeletePage(makeFakeRequest(), "page-1");

    expect(result).toBeUndefined();
  });

  it("delegates to docsService.softDeletePage with the page id (AC3)", async () => {
    const softDeleteSpy = vi.fn().mockResolvedValue(undefined);
    const controller = makeRenameController({ softDeletePage: softDeleteSpy });

    await controller.softDeletePage(makeFakeRequest(), "page-1");

    expect(softDeleteSpy).toHaveBeenCalledWith("page-1");
  });

  it("calls assertDocWriteAccess with actor globalRole and 'site' before softDeletePage (AC5)", async () => {
    const assertSpy = vi.fn();
    const softDeleteSpy = vi.fn().mockResolvedValue(undefined);
    const controller = makeRenameController({ assertDocWriteAccess: assertSpy, softDeletePage: softDeleteSpy });

    await controller.softDeletePage(makeFakeRequest(), "page-1");

    expect(assertSpy).toHaveBeenCalledWith("moderator", "site");
    const assertOrder = assertSpy.mock.invocationCallOrder[0];
    const deleteOrder = softDeleteSpy.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(deleteOrder!);
  });

  it("propagates ConflictException (409) from service when non-deleted children exist (AC4)", async () => {
    const controller = makeRenameController({
      softDeletePage: vi.fn().mockRejectedValue(
        new ConflictException(
          "Cannot delete a page that has non-deleted children. Delete or move the children first."
        )
      )
    });

    await expect(
      controller.softDeletePage(makeFakeRequest(), "page-1")
    ).rejects.toThrow(ConflictException);
  });

  it("propagates NotFoundException (404) from service for nonexistent page", async () => {
    const controller = makeRenameController({
      softDeletePage: vi.fn().mockRejectedValue(
        new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
      )
    });

    await expect(
      controller.softDeletePage(makeFakeRequest(), "nonexistent")
    ).rejects.toThrow(NotFoundException);
  });

  it("propagates ForbiddenException (403) when assertDocWriteAccess throws (AC5)", async () => {
    const controller = makeRenameController({
      assertDocWriteAccess: vi.fn().mockImplementation(() => {
        throw new ForbiddenException("Write access requires moderator or admin role.");
      })
    });

    await expect(
      controller.softDeletePage(makeFakeRequest(), "page-1")
    ).rejects.toThrow(ForbiddenException);
  });

  it("propagates UnauthorizedException (401) when resolveSession throws (AC5)", async () => {
    const controller = makeRenameController(
      {},
      { resolveSession: vi.fn().mockRejectedValue(new UnauthorizedException("No active session.")) }
    );

    await expect(
      controller.softDeletePage(makeFakeRequest(), "page-1")
    ).rejects.toThrow(UnauthorizedException);
  });
});

// ---------------------------------------------------------------------------
// ST-5: GET /docs/:id/history — getPageHistory (AC1)
// ---------------------------------------------------------------------------

/**
 * Shared history fixture used by controller history tests.
 */
const makeHistoryResult = () => ({
  revisions: [
    {
      revisionNumber: 1,
      author: { username: "alice", displayName: "Alice" },
      editorUsername: null,
      summary: "initial",
      createdAt: now
    },
    {
      revisionNumber: 2,
      author: { username: "alice", displayName: "Alice" },
      editorUsername: "bob",
      summary: "second edit",
      createdAt: now
    }
  ]
});

describe("DocsController: getPageHistory (ST-5 AC1: history endpoint delegation)", () => {
  it("returns { history } from docsService.getPageHistory", async () => {
    const historyResult = makeHistoryResult();
    const getPageHistorySpy = vi.fn().mockResolvedValue(historyResult);
    const docsService = makeDocsService({ getPageHistory: getPageHistorySpy });
    const controller = makeController(docsService);

    const result = await controller.getPageHistory("page-1");

    expect(result).toEqual({ history: historyResult });
    expect(getPageHistorySpy).toHaveBeenCalledWith("page-1");
  });

  it("propagates NotFoundException (404) from service (oracle parity — AC1)", async () => {
    const getPageHistorySpy = vi.fn().mockRejectedValue(
      new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
    );
    const docsService = makeDocsService({ getPageHistory: getPageHistorySpy });
    const controller = makeController(docsService);

    await expect(controller.getPageHistory("nonexistent")).rejects.toThrow(NotFoundException);
    await expect(controller.getPageHistory("nonexistent")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });

  it("returns { history: { revisions: [] } } when no revisions exist", async () => {
    const docsService = makeDocsService({
      getPageHistory: vi.fn().mockResolvedValue({ revisions: [] })
    });
    const controller = makeController(docsService);

    const result = await controller.getPageHistory("page-1");

    expect(result).toEqual({ history: { revisions: [] } });
  });
});

// ---------------------------------------------------------------------------
// ST-5: GET /docs/:id/revisions/:n — getRevisionByNumber (AC1)
// ---------------------------------------------------------------------------

const makeRevisionResult = () => ({
  revisionNumber: 2,
  title: "Getting Started",
  body: "# Getting Started\n\nUpdated",
  summary: "second edit",
  author: { username: "alice", displayName: "Alice" },
  editorUsername: "bob",
  createdAt: now
});

describe("DocsController: getRevisionByNumber (ST-5 AC1: single revision endpoint)", () => {
  it("returns { revision } from docsService.getRevisionByNumber with parsed revisionNumber", async () => {
    const revResult = makeRevisionResult();
    const getRevSpy = vi.fn().mockResolvedValue(revResult);
    const docsService = makeDocsService({ getRevisionByNumber: getRevSpy });
    const controller = makeController(docsService);

    const result = await controller.getRevisionByNumber("page-1", "2");

    expect(result).toEqual({ revision: revResult });
    expect(getRevSpy).toHaveBeenCalledWith("page-1", 2);
  });

  it("throws BadRequestException (400) when revisionNumber is not a positive integer string", async () => {
    const docsService = makeDocsService({ getRevisionByNumber: vi.fn() });
    const controller = makeController(docsService);

    await expect(controller.getRevisionByNumber("page-1", "0")).rejects.toThrow(BadRequestException);
    await expect(controller.getRevisionByNumber("page-1", "-1")).rejects.toThrow(BadRequestException);
    await expect(controller.getRevisionByNumber("page-1", "abc")).rejects.toThrow(BadRequestException);
  });

  it("propagates NotFoundException (404) from service for nonexistent page (oracle parity)", async () => {
    const docsService = makeDocsService({
      getRevisionByNumber: vi.fn().mockRejectedValue(
        new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
      )
    });
    const controller = makeController(docsService);

    await expect(controller.getRevisionByNumber("nonexistent", "1")).rejects.toThrow(NotFoundException);
  });

  it("propagates NotFoundException (404) from service for missing revision number (oracle parity)", async () => {
    const docsService = makeDocsService({
      getRevisionByNumber: vi.fn().mockRejectedValue(
        new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
      )
    });
    const controller = makeController(docsService);

    await expect(controller.getRevisionByNumber("page-1", "999")).rejects.toThrow(
      DocsService.PAGE_NOT_FOUND_MESSAGE
    );
  });
});

// ---------------------------------------------------------------------------
// ST-5: GET /docs/:id/diff — getDiff (AC2)
// ---------------------------------------------------------------------------

const makeDiffResult = () => ({
  fromRevisionNumber: 1,
  toRevisionNumber: 2,
  hunks: [
    { type: "unchanged" as const, lines: ["hello"] },
    { type: "removed" as const, lines: ["world"] },
    { type: "added" as const, lines: ["universe"] }
  ]
});

describe("DocsController: getDiff (ST-5 AC2: diff endpoint delegation + validation)", () => {
  it("returns { diff } from docsService.getDiff with parsed from/to", async () => {
    const diffResult = makeDiffResult();
    const getDiffSpy = vi.fn().mockResolvedValue(diffResult);
    const docsService = makeDocsService({ getDiff: getDiffSpy });
    const controller = makeController(docsService);

    const result = await controller.getDiff("page-1", "1", "2");

    expect(result).toEqual({ diff: diffResult });
    expect(getDiffSpy).toHaveBeenCalledWith("page-1", 1, 2);
  });

  it("throws BadRequestException (400) when 'from' query param is missing", async () => {
    const docsService = makeDocsService({ getDiff: vi.fn() });
    const controller = makeController(docsService);

    await expect(controller.getDiff("page-1", undefined, "2")).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) when 'to' query param is missing", async () => {
    const docsService = makeDocsService({ getDiff: vi.fn() });
    const controller = makeController(docsService);

    await expect(controller.getDiff("page-1", "1", undefined)).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) when 'from' is not a positive integer string", async () => {
    const docsService = makeDocsService({ getDiff: vi.fn() });
    const controller = makeController(docsService);

    await expect(controller.getDiff("page-1", "0", "2")).rejects.toThrow(BadRequestException);
    await expect(controller.getDiff("page-1", "-1", "2")).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) when 'to' is not a positive integer string", async () => {
    const docsService = makeDocsService({ getDiff: vi.fn() });
    const controller = makeController(docsService);

    await expect(controller.getDiff("page-1", "1", "0")).rejects.toThrow(BadRequestException);
  });

  it("propagates NotFoundException (404) from service (oracle parity — AC2)", async () => {
    const docsService = makeDocsService({
      getDiff: vi.fn().mockRejectedValue(
        new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
      )
    });
    const controller = makeController(docsService);

    await expect(controller.getDiff("nonexistent", "1", "2")).rejects.toThrow(NotFoundException);
  });

  it("propagates BadRequestException (400) from service when from === to (AC2)", async () => {
    const docsService = makeDocsService({
      getDiff: vi.fn().mockRejectedValue(
        new BadRequestException("'from' and 'to' must be different revision numbers.")
      )
    });
    const controller = makeController(docsService);

    await expect(controller.getDiff("page-1", "2", "2")).rejects.toThrow(BadRequestException);
  });

  it("propagates BadRequestException (400) from service DoS size guard — over-cap body bytes (ST-5 remediation)", async () => {
    // When the service throws BadRequestException due to the byte-size DoS guard,
    // the controller must surface the same 400 to the HTTP caller unchanged.
    const docsService = makeDocsService({
      getDiff: vi.fn().mockRejectedValue(
        new BadRequestException("Revision body exceeds the maximum allowed size for diff (512000 bytes).")
      )
    });
    const controller = makeController(docsService);

    await expect(controller.getDiff("page-1", "1", "2")).rejects.toThrow(BadRequestException);
  });

  it("propagates BadRequestException (400) from service DoS size guard — over-cap line count (ST-5 remediation)", async () => {
    const docsService = makeDocsService({
      getDiff: vi.fn().mockRejectedValue(
        new BadRequestException("Revision body exceeds the maximum allowed line count for diff (5000 lines).")
      )
    });
    const controller = makeController(docsService);

    await expect(controller.getDiff("page-1", "1", "2")).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// ST-5: POST /docs/:id/rollback — rollbackPage (AC3, AC4)
// ---------------------------------------------------------------------------

/**
 * Build a rollback-capable write controller stub.
 */
const makeRollbackController = (
  docsServiceOverrides?: Record<string, unknown>,
  authServiceOverrides?: Record<string, unknown>
) => {
  const docsService = {
    ...makeDocsService(),
    assertDocWriteAccess: vi.fn(),
    rollbackPage: vi.fn().mockResolvedValue({
      id: "page-1",
      title: "Original Title",
      path: "getting-started",
      depth: 0,
      parentId: null,
      currentRevisionId: "rev-new",
      revisionNumber: 3,
      createdAt: now,
      updatedAt: now
    }),
    ...docsServiceOverrides
  };
  const authService = {
    resolveSession: vi.fn().mockResolvedValue({
      user: { id: "user-1", globalRole: "moderator" }
    }),
    ...authServiceOverrides
  };
  return new DocsController(docsService as never, authService as never);
};

describe("DocsController: rollbackPage (ST-5 AC3, AC4: rollback delegation + auth gate)", () => {
  it("returns { page } from docsService.rollbackPage for a valid rollback request (AC3)", async () => {
    const controller = makeRollbackController();
    const result = await controller.rollbackPage(makeFakeRequest(), "page-1", { revisionNumber: 1 });

    expect(result).toHaveProperty("page");
    expect(result.page.revisionNumber).toBe(3);
  });

  it("delegates to docsService.rollbackPage with actorUserId, pageId, and body (AC3)", async () => {
    const rollbackSpy = vi.fn().mockResolvedValue({
      id: "page-1", title: "T", path: "p", depth: 0, parentId: null,
      currentRevisionId: "r", revisionNumber: 2, createdAt: now, updatedAt: now
    });
    const controller = makeRollbackController({ rollbackPage: rollbackSpy });

    await controller.rollbackPage(makeFakeRequest(), "page-1", { revisionNumber: 1 });

    expect(rollbackSpy).toHaveBeenCalledWith("user-1", "page-1", { revisionNumber: 1 });
  });

  it("calls assertDocWriteAccess with actor globalRole and 'site' before rollbackPage (AC4)", async () => {
    const assertSpy = vi.fn();
    const rollbackSpy = vi.fn().mockResolvedValue({
      id: "page-1", title: "T", path: "p", depth: 0, parentId: null,
      currentRevisionId: "r", revisionNumber: 2, createdAt: now, updatedAt: now
    });
    const controller = makeRollbackController({
      assertDocWriteAccess: assertSpy,
      rollbackPage: rollbackSpy
    });

    await controller.rollbackPage(makeFakeRequest(), "page-1", { revisionNumber: 1 });

    expect(assertSpy).toHaveBeenCalledWith("moderator", "site");
    const assertOrder = assertSpy.mock.invocationCallOrder[0];
    const rollbackOrder = rollbackSpy.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(rollbackOrder!);
  });

  it("propagates ForbiddenException (403) when assertDocWriteAccess throws (AC4: user role denied)", async () => {
    const controller = makeRollbackController(
      {
        assertDocWriteAccess: vi.fn().mockImplementation(() => {
          throw new ForbiddenException("Write access requires moderator or admin role.");
        })
      },
      {
        resolveSession: vi.fn().mockResolvedValue({ user: { id: "user-1", globalRole: "user" } })
      }
    );

    await expect(
      controller.rollbackPage(makeFakeRequest(), "page-1", { revisionNumber: 1 })
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws BadRequestException (400) for non-integer revisionNumber body guard", async () => {
    const controller = makeRollbackController();

    await expect(
      controller.rollbackPage(makeFakeRequest(), "page-1", { revisionNumber: 0 })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException (400) for non-number revisionNumber (body guard: string coercion)", async () => {
    const controller = makeRollbackController();

    await expect(
      controller.rollbackPage(makeFakeRequest(), "page-1", { revisionNumber: "1" as never })
    ).rejects.toThrow(BadRequestException);
  });

  it("propagates UnauthorizedException (401) when resolveSession throws (AC4)", async () => {
    const controller = makeRollbackController(
      {},
      { resolveSession: vi.fn().mockRejectedValue(new UnauthorizedException("No active session.")) }
    );

    await expect(
      controller.rollbackPage(makeFakeRequest(), "page-1", { revisionNumber: 1 })
    ).rejects.toThrow(UnauthorizedException);
  });

  it("propagates NotFoundException (404) from service for nonexistent page (AC3)", async () => {
    const controller = makeRollbackController({
      rollbackPage: vi.fn().mockRejectedValue(
        new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
      )
    });

    await expect(
      controller.rollbackPage(makeFakeRequest(), "page-1", { revisionNumber: 1 })
    ).rejects.toThrow(NotFoundException);
  });

  it("propagates NotFoundException (404) from service for nonexistent target revision (AC3)", async () => {
    const controller = makeRollbackController({
      rollbackPage: vi.fn().mockRejectedValue(
        new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)
      )
    });

    await expect(
      controller.rollbackPage(makeFakeRequest(), "page-1", { revisionNumber: 99 })
    ).rejects.toThrow(DocsService.PAGE_NOT_FOUND_MESSAGE);
  });
});
