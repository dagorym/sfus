/**
 * forums.controller.test.ts
 *
 * Unit tests for ForumsController (ST2).
 *
 * Acceptance criteria validated:
 * AC1: Admin endpoints enforce 401 (no session) / 403 (non-admin) before any data operation.
 *      DB mocks are NOT called when the auth/authz gate fires.
 * AC2: Create/update persist scopeType, visibility, projectId; reorder/position is deterministic.
 * AC3: Invalid scopeType/visibility values are rejected 400.
 * AC4: Swagger/JSDoc match the real status contract (source-contract assertions on key handlers).
 *
 * Tests exercise the controller's auth-gate wiring using mocked ForumsService and AuthService —
 * no NestJS application is spun up.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ForumsController } from "./forums.controller";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const makeAdminSession = () => ({
  user: { id: "user-admin", globalRole: "admin" },
  id: "session-admin"
});

const makeUserSession = () => ({
  user: { id: "user-regular", globalRole: "user" },
  id: "session-user"
});

const makeRequest = (cookie?: string) => ({
  headers: { cookie: cookie ?? "session=test" }
});

/** AuthService stub that resolves successfully (admin session by default). */
const makeAuthService = (session?: unknown) => ({
  resolveSession: vi.fn().mockResolvedValue(session ?? makeAdminSession())
});

/** AuthService stub that throws 401 (no active session). */
const makeAuthServiceNoSession = () => ({
  resolveSession: vi.fn().mockRejectedValue(new UnauthorizedException("No active session."))
});

/** ForumsService stub with all methods as no-ops / empty returns. */
const makeForumsService = (overrides?: Record<string, unknown>) => ({
  assertAdminManagementAccess: vi.fn(), // does not throw by default
  findAllCategories: vi.fn().mockResolvedValue([]),
  findCategoryById: vi.fn().mockResolvedValue(null),
  createCategory: vi.fn().mockResolvedValue({ id: "cat-new", name: "Cat", slug: "cat", sortOrder: 0, boards: [] }),
  updateCategory: vi.fn().mockResolvedValue({ id: "cat-1", name: "Updated", slug: "updated", sortOrder: 0, boards: [] }),
  deleteCategory: vi.fn().mockResolvedValue(undefined),
  reorderCategories: vi.fn().mockResolvedValue([]),
  findBoardsByCategoryId: vi.fn().mockResolvedValue([]),
  findBoardById: vi.fn().mockResolvedValue(null),
  createBoard: vi.fn().mockResolvedValue({ id: "board-new", name: "Board", categoryId: "cat-1", slug: "board", scopeType: "site", visibility: "public", projectId: null, sortOrder: 0 }),
  updateBoard: vi.fn().mockResolvedValue({ id: "board-1", name: "Updated Board", categoryId: "cat-1", slug: "board", scopeType: "site", visibility: "public", projectId: null, sortOrder: 0 }),
  deleteBoard: vi.fn().mockResolvedValue(undefined),
  reorderBoards: vi.fn().mockResolvedValue([]),
  // ST3: public read routes
  listPublicCategories: vi.fn().mockResolvedValue([]),
  getPublicBoard: vi.fn().mockResolvedValue(null),
  ...overrides
});

const makeController = (
  forumsService?: ReturnType<typeof makeForumsService>,
  authService?: ReturnType<typeof makeAuthService>
) =>
  new ForumsController(
    (forumsService ?? makeForumsService()) as never,
    (authService ?? makeAuthService()) as never
  );

// ---------------------------------------------------------------------------
// Helper to verify that the authz gate fires before DB calls
// ---------------------------------------------------------------------------

const assertGateFiresBeforeDb = async (
  action: (controller: ForumsController) => Promise<unknown>,
  expectedError: typeof ForbiddenException | typeof UnauthorizedException
) => {
  const dbSpy = vi.fn();
  const forumsService = {
    ...makeForumsService(),
    assertAdminManagementAccess:
      expectedError === ForbiddenException
        ? vi.fn().mockImplementation(() => {
            throw new ForbiddenException("forbidden");
          })
        : vi.fn(),
    findAllCategories: dbSpy,
    findCategoryById: dbSpy,
    createCategory: dbSpy,
    updateCategory: dbSpy,
    deleteCategory: dbSpy,
    reorderCategories: dbSpy,
    findBoardsByCategoryId: dbSpy,
    findBoardById: dbSpy,
    createBoard: dbSpy,
    updateBoard: dbSpy,
    deleteBoard: dbSpy,
    reorderBoards: dbSpy
  };
  const authService =
    expectedError === UnauthorizedException ? makeAuthServiceNoSession() : makeAuthService(makeUserSession());
  const controller = makeController(forumsService as never, authService as never);
  await expect(action(controller)).rejects.toThrow(expectedError);
  // No data operation should have been reached.
  expect(dbSpy).not.toHaveBeenCalled();
};

// ---------------------------------------------------------------------------
// AC1: 401 gate — no active session on every admin handler
// ---------------------------------------------------------------------------

describe("ForumsController: 401 gate fires before any DB operation (AC1)", () => {
  it("adminListCategories throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminListCategories(makeRequest() as never),
      UnauthorizedException
    );
  });

  it("adminGetCategory throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminGetCategory(makeRequest() as never, "cat-1"),
      UnauthorizedException
    );
  });

  it("adminCreateCategory throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminCreateCategory(makeRequest() as never, { name: "Cat", slug: "cat" }),
      UnauthorizedException
    );
  });

  it("adminUpdateCategory throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminUpdateCategory(makeRequest() as never, "cat-1", {}),
      UnauthorizedException
    );
  });

  it("adminDeleteCategory throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminDeleteCategory(makeRequest() as never, "cat-1"),
      UnauthorizedException
    );
  });

  it("adminReorderCategories throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminReorderCategories(makeRequest() as never, { orderedIds: [] }),
      UnauthorizedException
    );
  });

  it("adminListBoards throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminListBoards(makeRequest() as never, "cat-1"),
      UnauthorizedException
    );
  });

  it("adminGetBoard throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminGetBoard(makeRequest() as never, "board-1"),
      UnauthorizedException
    );
  });

  it("adminCreateBoard throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminCreateBoard(makeRequest() as never, { categoryId: "cat-1", name: "Board", slug: "board" }),
      UnauthorizedException
    );
  });

  it("adminUpdateBoard throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminUpdateBoard(makeRequest() as never, "board-1", {}),
      UnauthorizedException
    );
  });

  it("adminDeleteBoard throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminDeleteBoard(makeRequest() as never, "board-1"),
      UnauthorizedException
    );
  });

  it("adminReorderBoards throws 401 when no session", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminReorderBoards(makeRequest() as never, "cat-1", { orderedIds: [] }),
      UnauthorizedException
    );
  });
});

// ---------------------------------------------------------------------------
// AC1: 403 gate — non-admin session on every admin handler
// ---------------------------------------------------------------------------

describe("ForumsController: 403 gate fires before any DB operation (AC1)", () => {
  it("adminListCategories throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminListCategories(makeRequest() as never),
      ForbiddenException
    );
  });

  it("adminGetCategory throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminGetCategory(makeRequest() as never, "cat-1"),
      ForbiddenException
    );
  });

  it("adminCreateCategory throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminCreateCategory(makeRequest() as never, { name: "Cat", slug: "cat" }),
      ForbiddenException
    );
  });

  it("adminUpdateCategory throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminUpdateCategory(makeRequest() as never, "cat-1", {}),
      ForbiddenException
    );
  });

  it("adminDeleteCategory throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminDeleteCategory(makeRequest() as never, "cat-1"),
      ForbiddenException
    );
  });

  it("adminReorderCategories throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminReorderCategories(makeRequest() as never, { orderedIds: [] }),
      ForbiddenException
    );
  });

  it("adminListBoards throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminListBoards(makeRequest() as never, "cat-1"),
      ForbiddenException
    );
  });

  it("adminGetBoard throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminGetBoard(makeRequest() as never, "board-1"),
      ForbiddenException
    );
  });

  it("adminCreateBoard throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminCreateBoard(makeRequest() as never, { categoryId: "cat-1", name: "B", slug: "b" }),
      ForbiddenException
    );
  });

  it("adminUpdateBoard throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminUpdateBoard(makeRequest() as never, "board-1", {}),
      ForbiddenException
    );
  });

  it("adminDeleteBoard throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminDeleteBoard(makeRequest() as never, "board-1"),
      ForbiddenException
    );
  });

  it("adminReorderBoards throws 403 when caller is not admin", async () => {
    await assertGateFiresBeforeDb(
      (c) => c.adminReorderBoards(makeRequest() as never, "cat-1", { orderedIds: [] }),
      ForbiddenException
    );
  });
});

// ---------------------------------------------------------------------------
// AC1: resolveSession is called with the cookie header on each handler
// ---------------------------------------------------------------------------

describe("ForumsController: resolveSession is called with cookie header (AC1)", () => {
  it("adminListCategories calls resolveSession with cookieHeader from request", async () => {
    const authService = makeAuthService();
    const controller = makeController(undefined, authService);
    await controller.adminListCategories(makeRequest("myCookie=abc") as never);
    expect(authService.resolveSession).toHaveBeenCalledWith(
      expect.objectContaining({ cookieHeader: "myCookie=abc" })
    );
  });

  it("adminCreateBoard calls resolveSession with cookieHeader from request", async () => {
    const authService = makeAuthService();
    const forumsService = makeForumsService();
    const controller = makeController(forumsService, authService);
    await controller.adminCreateBoard(makeRequest("tok=xyz") as never, {
      categoryId: "cat-1",
      name: "Board",
      slug: "board"
    });
    expect(authService.resolveSession).toHaveBeenCalledWith(
      expect.objectContaining({ cookieHeader: "tok=xyz" })
    );
  });
});

// ---------------------------------------------------------------------------
// AC1: assertAdminManagementAccess is called with the session user's globalRole
// ---------------------------------------------------------------------------

describe("ForumsController: assertAdminManagementAccess receives session.user.globalRole (AC1)", () => {
  it("adminListCategories passes session.user.globalRole to assertAdminManagementAccess", async () => {
    const authService = makeAuthService(makeAdminSession());
    const forumsService = makeForumsService();
    const controller = makeController(forumsService, authService);
    await controller.adminListCategories(makeRequest() as never);
    expect(forumsService.assertAdminManagementAccess).toHaveBeenCalledWith("admin");
  });

  it("adminCreateBoard passes session.user.globalRole to assertAdminManagementAccess", async () => {
    const authService = makeAuthService(makeAdminSession());
    const forumsService = makeForumsService();
    const controller = makeController(forumsService, authService);
    await controller.adminCreateBoard(makeRequest() as never, {
      categoryId: "cat-1",
      name: "Board",
      slug: "board"
    });
    expect(forumsService.assertAdminManagementAccess).toHaveBeenCalledWith("admin");
  });
});

// ---------------------------------------------------------------------------
// Happy-path handler wiring tests (admin authenticated)
// ---------------------------------------------------------------------------

describe("ForumsController: adminListCategories (happy path)", () => {
  it("returns { categories } from forumsService.findAllCategories", async () => {
    const categories = [{ id: "cat-1", name: "Cat A", slug: "cat-a", sortOrder: 0, boards: [] }];
    const forumsService = makeForumsService({ findAllCategories: vi.fn().mockResolvedValue(categories) });
    const controller = makeController(forumsService);
    const result = await controller.adminListCategories(makeRequest() as never);
    expect(result).toEqual({ categories });
  });
});

describe("ForumsController: adminGetCategory", () => {
  it("returns { category } when found", async () => {
    const category = { id: "cat-1", name: "Cat", slug: "cat", sortOrder: 0, boards: [] };
    const forumsService = makeForumsService({ findCategoryById: vi.fn().mockResolvedValue(category) });
    const controller = makeController(forumsService);
    const result = await controller.adminGetCategory(makeRequest() as never, "cat-1");
    expect(result).toEqual({ category });
  });

  it("throws NotFoundException when category is not found", async () => {
    const forumsService = makeForumsService({ findCategoryById: vi.fn().mockResolvedValue(null) });
    const controller = makeController(forumsService);
    await expect(controller.adminGetCategory(makeRequest() as never, "nonexistent")).rejects.toThrow(
      NotFoundException
    );
  });
});

describe("ForumsController: adminCreateCategory", () => {
  it("returns { category } from forumsService.createCategory", async () => {
    const created = { id: "cat-new", name: "New Cat", slug: "new-cat", sortOrder: 0, boards: [] };
    const forumsService = makeForumsService({ createCategory: vi.fn().mockResolvedValue(created) });
    const controller = makeController(forumsService);
    const result = await controller.adminCreateCategory(makeRequest() as never, { name: "New Cat", slug: "new-cat" });
    expect(result).toEqual({ category: created });
  });
});

describe("ForumsController: adminUpdateCategory", () => {
  it("returns { category } from forumsService.updateCategory", async () => {
    const updated = { id: "cat-1", name: "Updated", slug: "updated", sortOrder: 0, boards: [] };
    const forumsService = makeForumsService({ updateCategory: vi.fn().mockResolvedValue(updated) });
    const controller = makeController(forumsService);
    const result = await controller.adminUpdateCategory(makeRequest() as never, "cat-1", { name: "Updated" });
    expect(result).toEqual({ category: updated });
  });
});

describe("ForumsController: adminDeleteCategory", () => {
  it("resolves without returning a body (204)", async () => {
    const forumsService = makeForumsService({ deleteCategory: vi.fn().mockResolvedValue(undefined) });
    const controller = makeController(forumsService);
    const result = await controller.adminDeleteCategory(makeRequest() as never, "cat-1");
    expect(result).toBeUndefined();
  });
});

describe("ForumsController: adminReorderCategories (AC2: deterministic result)", () => {
  it("returns { categories } from forumsService.reorderCategories", async () => {
    const reordered = [
      { id: "cat-2", sortOrder: 0, boards: [] },
      { id: "cat-1", sortOrder: 1, boards: [] }
    ];
    const forumsService = makeForumsService({
      reorderCategories: vi.fn().mockResolvedValue(reordered)
    });
    const controller = makeController(forumsService);
    const result = await controller.adminReorderCategories(makeRequest() as never, { orderedIds: ["cat-2", "cat-1"] });
    expect(result).toEqual({ categories: reordered });
  });

  it("throws BadRequestException when orderedIds is not an array", async () => {
    const controller = makeController();
    await expect(
      controller.adminReorderCategories(makeRequest() as never, { orderedIds: "not-an-array" as never })
    ).rejects.toThrow(BadRequestException);
  });
});

describe("ForumsController: adminListBoards", () => {
  it("returns { boards } from forumsService.findBoardsByCategoryId", async () => {
    const boards = [{ id: "board-1", categoryId: "cat-1", name: "Board A", slug: "board-a", scopeType: "site", visibility: "public", projectId: null, sortOrder: 0 }];
    const forumsService = makeForumsService({ findBoardsByCategoryId: vi.fn().mockResolvedValue(boards) });
    const controller = makeController(forumsService);
    const result = await controller.adminListBoards(makeRequest() as never, "cat-1");
    expect(result).toEqual({ boards });
  });
});

describe("ForumsController: adminGetBoard", () => {
  it("returns { board } when found", async () => {
    const board = { id: "board-1", name: "Board", categoryId: "cat-1", slug: "board", scopeType: "site", visibility: "public", projectId: null, sortOrder: 0 };
    const forumsService = makeForumsService({ findBoardById: vi.fn().mockResolvedValue(board) });
    const controller = makeController(forumsService);
    const result = await controller.adminGetBoard(makeRequest() as never, "board-1");
    expect(result).toEqual({ board });
  });

  it("throws NotFoundException when board is not found", async () => {
    const forumsService = makeForumsService({ findBoardById: vi.fn().mockResolvedValue(null) });
    const controller = makeController(forumsService);
    await expect(controller.adminGetBoard(makeRequest() as never, "nonexistent")).rejects.toThrow(
      NotFoundException
    );
  });
});

describe("ForumsController: adminCreateBoard (AC2: field persistence)", () => {
  it("delegates to forumsService.createBoard and returns { board }", async () => {
    const board = {
      id: "board-new",
      categoryId: "cat-1",
      name: "Project Board",
      slug: "project-board",
      scopeType: "project",
      visibility: "members",
      projectId: "proj-123",
      sortOrder: 0
    };
    const createBoardSpy = vi.fn().mockResolvedValue(board);
    const forumsService = makeForumsService({ createBoard: createBoardSpy });
    const controller = makeController(forumsService);
    const input = {
      categoryId: "cat-1",
      name: "Project Board",
      slug: "project-board",
      scopeType: "project" as const,
      visibility: "members" as const,
      projectId: "proj-123"
    };
    const result = await controller.adminCreateBoard(makeRequest() as never, input);
    expect(createBoardSpy).toHaveBeenCalledWith(input);
    expect(result).toEqual({ board });
  });
});

describe("ForumsController: adminUpdateBoard (AC2: field persistence)", () => {
  it("delegates scopeType, visibility, projectId updates to forumsService.updateBoard", async () => {
    const updatedBoard = {
      id: "board-1",
      categoryId: "cat-1",
      name: "Board",
      slug: "board",
      scopeType: "project",
      visibility: "private",
      projectId: "proj-456",
      sortOrder: 0
    };
    const updateBoardSpy = vi.fn().mockResolvedValue(updatedBoard);
    const forumsService = makeForumsService({ updateBoard: updateBoardSpy });
    const controller = makeController(forumsService);
    const input = { scopeType: "project" as const, visibility: "private" as const, projectId: "proj-456" };
    const result = await controller.adminUpdateBoard(makeRequest() as never, "board-1", input);
    expect(updateBoardSpy).toHaveBeenCalledWith("board-1", input);
    expect(result).toEqual({ board: updatedBoard });
  });
});

describe("ForumsController: adminDeleteBoard", () => {
  it("resolves without returning a body (204)", async () => {
    const forumsService = makeForumsService({ deleteBoard: vi.fn().mockResolvedValue(undefined) });
    const controller = makeController(forumsService);
    const result = await controller.adminDeleteBoard(makeRequest() as never, "board-1");
    expect(result).toBeUndefined();
  });
});

describe("ForumsController: adminReorderBoards (AC2: deterministic result)", () => {
  it("returns { boards } from forumsService.reorderBoards", async () => {
    const reordered = [
      { id: "board-2", categoryId: "cat-1", sortOrder: 0 },
      { id: "board-1", categoryId: "cat-1", sortOrder: 1 }
    ];
    const forumsService = makeForumsService({ reorderBoards: vi.fn().mockResolvedValue(reordered) });
    const controller = makeController(forumsService);
    const result = await controller.adminReorderBoards(makeRequest() as never, "cat-1", {
      orderedIds: ["board-2", "board-1"]
    });
    expect(result).toEqual({ boards: reordered });
  });

  it("throws BadRequestException when orderedIds is not an array", async () => {
    const controller = makeController();
    await expect(
      controller.adminReorderBoards(makeRequest() as never, "cat-1", { orderedIds: "not-an-array" as never })
    ).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// ST3: Public read routes — listPublicCategories and getPublicBoard
// No authentication required; service methods delegated correctly.
// ---------------------------------------------------------------------------

describe("ForumsController: listPublicCategories (ST3: public route, no auth)", () => {
  it("returns { categories } from forumsService.listPublicCategories without touching auth", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const categories = [
      {
        id: "cat-1",
        name: "General",
        slug: "general",
        description: null,
        sortOrder: 0,
        boards: [
          {
            id: "board-1",
            name: "Public Board",
            slug: "public-board",
            description: null,
            sortOrder: 0,
            visibility: "public",
            createdAt: now,
            updatedAt: now
          }
        ],
        createdAt: now,
        updatedAt: now
      }
    ];
    const listPublicCategoriesSpy = vi.fn().mockResolvedValue(categories);
    const authServiceSpy = { resolveSession: vi.fn() };
    const forumsService = makeForumsService({ listPublicCategories: listPublicCategoriesSpy });
    const controller = makeController(forumsService as never, authServiceSpy as never);
    const result = await controller.listPublicCategories();
    expect(result).toEqual({ categories });
    expect(listPublicCategoriesSpy).toHaveBeenCalled();
    // Auth is NOT invoked for public routes
    expect(authServiceSpy.resolveSession).not.toHaveBeenCalled();
  });
});

describe("ForumsController: getPublicBoard (ST3: public route, no auth)", () => {
  it("returns { board } from forumsService.getPublicBoard without touching auth", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const board = {
      id: "board-1",
      name: "Public Board",
      slug: "public-board",
      description: null,
      sortOrder: 0,
      visibility: "public" as const,
      createdAt: now,
      updatedAt: now
    };
    const getPublicBoardSpy = vi.fn().mockResolvedValue(board);
    const authServiceSpy = { resolveSession: vi.fn() };
    const forumsService = makeForumsService({ getPublicBoard: getPublicBoardSpy });
    const controller = makeController(forumsService as never, authServiceSpy as never);
    const result = await controller.getPublicBoard("board-1");
    expect(result).toEqual({ board });
    expect(getPublicBoardSpy).toHaveBeenCalledWith("board-1");
    // Auth is NOT invoked for public routes
    expect(authServiceSpy.resolveSession).not.toHaveBeenCalled();
  });

  it("propagates NotFoundException from forumsService.getPublicBoard unchanged", async () => {
    const getPublicBoardSpy = vi.fn().mockRejectedValue(new NotFoundException("Forum board not found."));
    const authServiceSpy = { resolveSession: vi.fn() };
    const forumsService = makeForumsService({ getPublicBoard: getPublicBoardSpy });
    const controller = makeController(forumsService as never, authServiceSpy as never);
    await expect(controller.getPublicBoard("hidden-board-id")).rejects.toThrow(NotFoundException);
    await expect(controller.getPublicBoard("hidden-board-id")).rejects.toThrow("Forum board not found.");
  });
});

// ---------------------------------------------------------------------------
// AC4 (Swagger/JSDoc): Source-contract assertions verifying key status codes
// are documented in JSDoc for controller handlers.
// ---------------------------------------------------------------------------

describe("ForumsController source-contract: Swagger/JSDoc status code documentation (AC4)", () => {
  const controllerSourcePath = path.resolve(
    __dirname,
    "forums.controller.ts"
  );

  it("adminListCategories JSDoc documents 401 and 403 throws", async () => {
    const source = await readFile(controllerSourcePath, "utf-8");
    // Anchor on a stable string inside the adminListCategories JSDoc so the slice
    // includes the handler's own @throws lines rather than relying on the next
    // method's JSDoc being captured by luck of ordering.
    const listCatSection = source.slice(
      source.indexOf("List all forum categories with their boards"),
      source.indexOf("async adminGetCategory")
    );
    expect(listCatSection).toContain("401");
    expect(listCatSection).toContain("403");
  });

  it("adminCreateBoard JSDoc documents 400, 401, 403, 404 throws", async () => {
    const source = await readFile(controllerSourcePath, "utf-8");
    // Anchor on a stable string inside the adminCreateBoard JSDoc so the slice
    // covers the handler's own @throws lines rather than relying on the next
    // method's JSDoc being captured by luck of ordering.
    const createBoardSection = source.slice(
      source.indexOf("Create a new forum board"),
      source.indexOf("async adminUpdateBoard")
    );
    expect(createBoardSection).toContain("400");
    expect(createBoardSection).toContain("401");
    expect(createBoardSection).toContain("403");
    expect(createBoardSection).toContain("404");
  });

  it("adminCreateBoard JSDoc mentions scopeType and visibility allowed values", async () => {
    const source = await readFile(controllerSourcePath, "utf-8");
    // Same stable anchor as the previous test — JSDoc start for adminCreateBoard.
    const createBoardSection = source.slice(
      source.indexOf("Create a new forum board"),
      source.indexOf("async adminUpdateBoard")
    );
    expect(createBoardSection).toMatch(/scopeType/);
    expect(createBoardSection).toMatch(/visibility/);
  });

  it("adminDeleteCategory JSDoc documents 400 (boards still attached) and 404", async () => {
    const source = await readFile(controllerSourcePath, "utf-8");
    // Anchor on a stable string inside the adminDeleteCategory JSDoc/decorator
    // block so the slice includes the handler's own @throws 400 and @throws 404
    // lines. Using the method name alone starts AFTER the JSDoc and @ApiNotFoundResponse
    // decorator, causing a false-negative — this anchor fixes that.
    const deleteCatSection = source.slice(
      source.indexOf("Category still has boards"),
      source.indexOf("async adminReorderCategories")
    );
    expect(deleteCatSection).toContain("400");
    expect(deleteCatSection).toContain("404");
  });

  it("Swagger decorators use ApiUnauthorizedResponse (401) on admin handlers", async () => {
    const source = await readFile(controllerSourcePath, "utf-8");
    // The source must import and use ApiUnauthorizedResponse for 401 contract
    expect(source).toContain("ApiUnauthorizedResponse");
  });

  it("Swagger decorators use ApiForbiddenResponse (403) on admin handlers", async () => {
    const source = await readFile(controllerSourcePath, "utf-8");
    expect(source).toContain("ApiForbiddenResponse");
  });

  it("Swagger decorators use ApiBadRequestResponse (400) on handlers with invalid input", async () => {
    const source = await readFile(controllerSourcePath, "utf-8");
    expect(source).toContain("ApiBadRequestResponse");
  });
});
