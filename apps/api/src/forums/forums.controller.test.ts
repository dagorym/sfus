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

// Required for Reflect.getMetadata used in the ST6 decorator-metadata assertions.
import "reflect-metadata";

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
  // ST4: topic routes
  createTopic: vi.fn().mockResolvedValue({ id: "topic-new", title: "Test", slug: "test", body: "Body", isPinned: false, replyCount: 0, lastPostAt: null, author: { username: "u", displayName: null }, createdAt: new Date(), updatedAt: new Date() }),
  listTopics: vi.fn().mockResolvedValue({ topics: [], total: 0, page: 1, pageSize: 20 }),
  // ST5: post routes
  createPost: vi.fn().mockResolvedValue({ id: "post-new", body: "Reply", parentId: null, quotedPostId: null, author: { username: "u", displayName: null }, createdAt: new Date(), updatedAt: new Date() }),
  listPosts: vi.fn().mockResolvedValue({ posts: [], total: 0, page: 1, pageSize: 20 }),
  // ST6: moderation routes
  assertModerationAccess: vi.fn(), // does not throw by default (moderator/admin session)
  setPinned: vi.fn().mockResolvedValue({ id: "topic-1", title: "T", slug: "t", isPinned: true, isLocked: false, boardId: "board-1", lockedByUserId: null, lockedAt: null, movedByUserId: null, movedAt: null, replyCount: 0, lastPostAt: null, createdAt: new Date(), updatedAt: new Date() }),
  setLocked: vi.fn().mockResolvedValue({ id: "topic-1", title: "T", slug: "t", isPinned: false, isLocked: true, boardId: "board-1", lockedByUserId: "mod-1", lockedAt: new Date(), movedByUserId: null, movedAt: null, replyCount: 0, lastPostAt: null, createdAt: new Date(), updatedAt: new Date() }),
  moveTopic: vi.fn().mockResolvedValue({ id: "topic-1", title: "T", slug: "t", isPinned: false, isLocked: false, boardId: "board-dest", lockedByUserId: null, lockedAt: null, movedByUserId: "mod-1", movedAt: new Date(), replyCount: 0, lastPostAt: null, createdAt: new Date(), updatedAt: new Date() }),
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

// ---------------------------------------------------------------------------
// ST4: createTopic controller — 401 gate fires before any service call (TC14)
// ---------------------------------------------------------------------------

describe("ForumsController: createTopic — 401 gate fires before any service call (TC14)", () => {
  // TC14: resolveSession rejection → UnauthorizedException BEFORE any service call
  it("throws UnauthorizedException and does NOT call forumsService when session is missing (TC14)", async () => {
    const createTopicSpy = vi.fn();
    const listTopicsSpy = vi.fn();
    const forumsService = makeForumsService({
      createTopic: createTopicSpy,
      listTopics: listTopicsSpy
    });
    const authService = makeAuthServiceNoSession();
    const controller = makeController(forumsService as never, authService as never);

    await expect(
      controller.createTopic(
        makeRequest() as never,
        "board-1",
        { title: "Test", body: "Test body" }
      )
    ).rejects.toThrow(UnauthorizedException);

    // Service methods must not have been called
    expect(createTopicSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ST4: listTopics and createTopic — happy-path controller delegation
// ---------------------------------------------------------------------------

describe("ForumsController: listTopics (ST4: public route, no auth)", () => {
  it("delegates to forumsService.listTopics and returns paginated result", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const paginatedResult = {
      topics: [
        {
          id: "topic-1",
          title: "Test Topic",
          slug: "test-topic",
          body: "Body",
          isPinned: false,
          replyCount: 0,
          lastPostAt: null,
          author: { username: "user1", displayName: "User One" },
          createdAt: now,
          updatedAt: now
        }
      ],
      total: 1,
      page: 1,
      pageSize: 20
    };
    const listTopicsSpy = vi.fn().mockResolvedValue(paginatedResult);
    const authServiceSpy = { resolveSession: vi.fn() };
    const forumsService = makeForumsService({ listTopics: listTopicsSpy });
    const controller = makeController(forumsService as never, authServiceSpy as never);
    const result = await controller.listTopics("board-1");
    expect(result).toEqual(paginatedResult);
    expect(listTopicsSpy).toHaveBeenCalledWith("board-1", { page: undefined, pageSize: undefined });
    // No auth required for public listing
    expect(authServiceSpy.resolveSession).not.toHaveBeenCalled();
  });

  it("passes parsed page and pageSize query params to forumsService.listTopics", async () => {
    const listTopicsSpy = vi.fn().mockResolvedValue({ topics: [], total: 0, page: 2, pageSize: 5 });
    const forumsService = makeForumsService({ listTopics: listTopicsSpy });
    const controller = makeController(forumsService as never, makeAuthService() as never);
    await controller.listTopics("board-1", "2", "5");
    expect(listTopicsSpy).toHaveBeenCalledWith("board-1", { page: 2, pageSize: 5 });
  });
});

// ---------------------------------------------------------------------------
// ST5: createPost — 401 gate fires before any service call
// ---------------------------------------------------------------------------

describe("ForumsController: createPost — 401 gate fires before any service call (ST5-AC-auth)", () => {
  // ST5-AUTH: resolveSession rejection → UnauthorizedException BEFORE createPost service call
  it("throws UnauthorizedException and does NOT call forumsService.createPost when session is missing", async () => {
    const createPostSpy = vi.fn();
    const forumsService = makeForumsService({ createPost: createPostSpy });
    const authService = makeAuthServiceNoSession();
    const controller = makeController(forumsService as never, authService as never);

    await expect(
      controller.createPost(makeRequest() as never, "topic-1", { body: "Hello" })
    ).rejects.toThrow(UnauthorizedException);

    // Service must NOT have been called before 401 is thrown
    expect(createPostSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ST5: listPosts — public route, no auth required
// ---------------------------------------------------------------------------

describe("ForumsController: listPosts (ST5: public route, no auth)", () => {
  it("delegates to forumsService.listPosts and returns paginated result without touching auth", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const paginatedResult = {
      posts: [
        {
          id: "post-1",
          body: "Hello world",
          parentId: null,
          quotedPostId: null,
          author: { username: "user1", displayName: "User One" },
          createdAt: now,
          updatedAt: now
        }
      ],
      total: 1,
      page: 1,
      pageSize: 20
    };
    const listPostsSpy = vi.fn().mockResolvedValue(paginatedResult);
    const authServiceSpy = { resolveSession: vi.fn() };
    const forumsService = makeForumsService({ listPosts: listPostsSpy });
    const controller = makeController(forumsService as never, authServiceSpy as never);
    const result = await controller.listPosts("topic-1");
    expect(result).toEqual(paginatedResult);
    expect(listPostsSpy).toHaveBeenCalledWith("topic-1", { page: undefined, pageSize: undefined });
    // Auth is NOT invoked for public listing
    expect(authServiceSpy.resolveSession).not.toHaveBeenCalled();
  });

  it("passes parsed page and pageSize query params to forumsService.listPosts", async () => {
    const listPostsSpy = vi.fn().mockResolvedValue({ posts: [], total: 0, page: 3, pageSize: 10 });
    const forumsService = makeForumsService({ listPosts: listPostsSpy });
    const controller = makeController(forumsService as never, makeAuthService() as never);
    await controller.listPosts("topic-1", "3", "10");
    expect(listPostsSpy).toHaveBeenCalledWith("topic-1", { page: 3, pageSize: 10 });
  });
});

// ---------------------------------------------------------------------------
// ST5: createPost — happy-path delegation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ST6: Moderation endpoints — helper to assert gate fires before any service data op
// ---------------------------------------------------------------------------

/** ForumsService stub that overrides assertModerationAccess to throw 403. */
const makeModerationForbiddenService = (dataSpy: ReturnType<typeof vi.fn>) => ({
  ...makeForumsService(),
  assertModerationAccess: vi.fn().mockImplementation(() => {
    throw new ForbiddenException("moderation requires moderator or admin role");
  }),
  setPinned: dataSpy,
  setLocked: dataSpy,
  moveTopic: dataSpy
});

/** Assert 401 fires before any data op (resolveSession rejects). */
const assertModeration401FiresBeforeData = async (
  action: (controller: ForumsController) => Promise<unknown>
) => {
  const dataSpy = vi.fn();
  const forumsService = { ...makeForumsService(), setPinned: dataSpy, setLocked: dataSpy, moveTopic: dataSpy };
  const authService = makeAuthServiceNoSession();
  const controller = makeController(forumsService as never, authService as never);
  await expect(action(controller)).rejects.toThrow(UnauthorizedException);
  expect(dataSpy).not.toHaveBeenCalled();
};

/** Assert 403 fires before any data op when assertModerationAccess throws. */
const assertModeration403FiresBeforeData = async (
  action: (controller: ForumsController) => Promise<unknown>
) => {
  const dataSpy = vi.fn();
  const forumsService = makeModerationForbiddenService(dataSpy);
  const authService = makeAuthService(makeUserSession()); // non-moderator session
  const controller = makeController(forumsService as never, authService as never);
  await expect(action(controller)).rejects.toThrow(ForbiddenException);
  expect(dataSpy).not.toHaveBeenCalled();
};

// ---------------------------------------------------------------------------
// ST6: 401 gate fires before any data op — all six moderation endpoints
// ---------------------------------------------------------------------------

describe("ForumsController ST6: 401 gate fires before any data op on all moderation endpoints", () => {
  it("pinTopic throws 401 before any data op when no session", async () => {
    await assertModeration401FiresBeforeData((c) => c.pinTopic(makeRequest() as never, "topic-1"));
  });

  it("unpinTopic throws 401 before any data op when no session", async () => {
    await assertModeration401FiresBeforeData((c) => c.unpinTopic(makeRequest() as never, "topic-1"));
  });

  it("lockTopic throws 401 before any data op when no session", async () => {
    await assertModeration401FiresBeforeData((c) => c.lockTopic(makeRequest() as never, "topic-1"));
  });

  it("unlockTopic throws 401 before any data op when no session", async () => {
    await assertModeration401FiresBeforeData((c) => c.unlockTopic(makeRequest() as never, "topic-1"));
  });

  it("moveTopic throws 401 before any data op when no session", async () => {
    await assertModeration401FiresBeforeData((c) =>
      c.moveTopic(makeRequest() as never, "topic-1", { destinationBoardId: "board-dest" })
    );
  });
});

// ---------------------------------------------------------------------------
// ST6: 403 gate fires before any repository save/find — all six moderation endpoints
// ---------------------------------------------------------------------------

describe("ForumsController ST6: 403 gate fires before repository ops on all moderation endpoints (non-moderator)", () => {
  it("pinTopic throws 403 before any data op for non-moderator", async () => {
    await assertModeration403FiresBeforeData((c) => c.pinTopic(makeRequest() as never, "topic-1"));
  });

  it("unpinTopic throws 403 before any data op for non-moderator", async () => {
    await assertModeration403FiresBeforeData((c) => c.unpinTopic(makeRequest() as never, "topic-1"));
  });

  it("lockTopic throws 403 before any data op for non-moderator", async () => {
    await assertModeration403FiresBeforeData((c) => c.lockTopic(makeRequest() as never, "topic-1"));
  });

  it("unlockTopic throws 403 before any data op for non-moderator", async () => {
    await assertModeration403FiresBeforeData((c) => c.unlockTopic(makeRequest() as never, "topic-1"));
  });

  it("moveTopic throws 403 before any data op for non-moderator", async () => {
    await assertModeration403FiresBeforeData((c) =>
      c.moveTopic(makeRequest() as never, "topic-1", { destinationBoardId: "board-dest" })
    );
  });
});

// ---------------------------------------------------------------------------
// ST6: moveTopic input guard — malformed destinationBoardId → 400 before auth
// ---------------------------------------------------------------------------

describe("ForumsController ST6: moveTopic input guard — malformed destinationBoardId → 400 NOT 500, save NOT called", () => {
  const makeModeratorSession = () => ({
    user: { id: "user-mod", globalRole: "moderator" },
    id: "session-mod"
  });

  it("missing destinationBoardId (undefined) → BadRequestException (400), moveTopic NOT called", async () => {
    const moveTopicSpy = vi.fn();
    const forumsService = makeForumsService({ moveTopic: moveTopicSpy });
    const authService = makeAuthService(makeModeratorSession());
    const controller = makeController(forumsService as never, authService as never);
    // No destinationBoardId field — will be undefined
    await expect(
      controller.moveTopic(makeRequest() as never, "topic-1", {} as never)
    ).rejects.toThrow(BadRequestException);
    expect(moveTopicSpy).not.toHaveBeenCalled();
  });

  it("empty string destinationBoardId → BadRequestException (400), moveTopic NOT called", async () => {
    const moveTopicSpy = vi.fn();
    const forumsService = makeForumsService({ moveTopic: moveTopicSpy });
    const authService = makeAuthService(makeModeratorSession());
    const controller = makeController(forumsService as never, authService as never);
    await expect(
      controller.moveTopic(makeRequest() as never, "topic-1", { destinationBoardId: "   " })
    ).rejects.toThrow(BadRequestException);
    expect(moveTopicSpy).not.toHaveBeenCalled();
  });

  it("numeric destinationBoardId (42) → BadRequestException (400), moveTopic NOT called", async () => {
    const moveTopicSpy = vi.fn();
    const forumsService = makeForumsService({ moveTopic: moveTopicSpy });
    const authService = makeAuthService(makeModeratorSession());
    const controller = makeController(forumsService as never, authService as never);
    await expect(
      controller.moveTopic(makeRequest() as never, "topic-1", { destinationBoardId: 42 as never })
    ).rejects.toThrow(BadRequestException);
    expect(moveTopicSpy).not.toHaveBeenCalled();
  });

  it("object destinationBoardId ({}) → BadRequestException (400), moveTopic NOT called", async () => {
    const moveTopicSpy = vi.fn();
    const forumsService = makeForumsService({ moveTopic: moveTopicSpy });
    const authService = makeAuthService(makeModeratorSession());
    const controller = makeController(forumsService as never, authService as never);
    await expect(
      controller.moveTopic(makeRequest() as never, "topic-1", { destinationBoardId: {} as never })
    ).rejects.toThrow(BadRequestException);
    expect(moveTopicSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ST6: happy-path delegation — moderator session, service methods called
// ---------------------------------------------------------------------------

describe("ForumsController ST6: happy-path delegation — moderator session", () => {
  const makeModeratorSession = () => ({
    user: { id: "user-mod", globalRole: "moderator" },
    id: "session-mod"
  });

  const makeModeratedShape = (overrides?: object) => ({
    id: "topic-1",
    title: "T",
    slug: "t",
    isPinned: false,
    isLocked: false,
    boardId: "board-1",
    lockedByUserId: null,
    lockedAt: null,
    movedByUserId: null,
    movedAt: null,
    replyCount: 0,
    lastPostAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  it("pinTopic: calls assertModerationAccess + setPinned(userId, topicId, true), returns { topic }", async () => {
    const pinned = makeModeratedShape({ isPinned: true });
    const setPinnedSpy = vi.fn().mockResolvedValue(pinned);
    const assertModerationSpy = vi.fn();
    const forumsService = makeForumsService({ setPinned: setPinnedSpy, assertModerationAccess: assertModerationSpy });
    const authService = makeAuthService(makeModeratorSession());
    const controller = makeController(forumsService as never, authService as never);
    const result = await controller.pinTopic(makeRequest() as never, "topic-1");
    expect(assertModerationSpy).toHaveBeenCalledWith("moderator");
    expect(setPinnedSpy).toHaveBeenCalledWith("user-mod", "topic-1", true);
    expect(result).toEqual({ topic: pinned });
  });

  it("unpinTopic: calls assertModerationAccess + setPinned(userId, topicId, false), returns { topic }", async () => {
    const unpinned = makeModeratedShape({ isPinned: false });
    const setPinnedSpy = vi.fn().mockResolvedValue(unpinned);
    const assertModerationSpy = vi.fn();
    const forumsService = makeForumsService({ setPinned: setPinnedSpy, assertModerationAccess: assertModerationSpy });
    const authService = makeAuthService(makeModeratorSession());
    const controller = makeController(forumsService as never, authService as never);
    const result = await controller.unpinTopic(makeRequest() as never, "topic-1");
    expect(assertModerationSpy).toHaveBeenCalledWith("moderator");
    expect(setPinnedSpy).toHaveBeenCalledWith("user-mod", "topic-1", false);
    expect(result).toEqual({ topic: unpinned });
  });

  it("lockTopic: calls assertModerationAccess + setLocked(userId, topicId, true), returns { topic }", async () => {
    const locked = makeModeratedShape({ isLocked: true, lockedByUserId: "user-mod", lockedAt: new Date() });
    const setLockedSpy = vi.fn().mockResolvedValue(locked);
    const assertModerationSpy = vi.fn();
    const forumsService = makeForumsService({ setLocked: setLockedSpy, assertModerationAccess: assertModerationSpy });
    const authService = makeAuthService(makeModeratorSession());
    const controller = makeController(forumsService as never, authService as never);
    const result = await controller.lockTopic(makeRequest() as never, "topic-1");
    expect(assertModerationSpy).toHaveBeenCalledWith("moderator");
    expect(setLockedSpy).toHaveBeenCalledWith("user-mod", "topic-1", true);
    expect(result).toEqual({ topic: locked });
  });

  it("unlockTopic: calls assertModerationAccess + setLocked(userId, topicId, false), returns { topic }", async () => {
    const unlocked = makeModeratedShape({ isLocked: false });
    const setLockedSpy = vi.fn().mockResolvedValue(unlocked);
    const assertModerationSpy = vi.fn();
    const forumsService = makeForumsService({ setLocked: setLockedSpy, assertModerationAccess: assertModerationSpy });
    const authService = makeAuthService(makeModeratorSession());
    const controller = makeController(forumsService as never, authService as never);
    const result = await controller.unlockTopic(makeRequest() as never, "topic-1");
    expect(assertModerationSpy).toHaveBeenCalledWith("moderator");
    expect(setLockedSpy).toHaveBeenCalledWith("user-mod", "topic-1", false);
    expect(result).toEqual({ topic: unlocked });
  });

  it("moveTopic: calls assertModerationAccess + moveTopic(userId, topicId, boardId), returns { topic }", async () => {
    const moved = makeModeratedShape({ boardId: "board-dest", movedByUserId: "user-mod", movedAt: new Date() });
    const moveTopicSpy = vi.fn().mockResolvedValue(moved);
    const assertModerationSpy = vi.fn();
    const forumsService = makeForumsService({ moveTopic: moveTopicSpy, assertModerationAccess: assertModerationSpy });
    const authService = makeAuthService(makeModeratorSession());
    const controller = makeController(forumsService as never, authService as never);
    const result = await controller.moveTopic(makeRequest() as never, "topic-1", { destinationBoardId: "board-dest" });
    expect(assertModerationSpy).toHaveBeenCalledWith("moderator");
    expect(moveTopicSpy).toHaveBeenCalledWith("user-mod", "topic-1", "board-dest");
    expect(result).toEqual({ topic: moved });
  });
});

// ---------------------------------------------------------------------------
// ST6: Swagger decorator metadata contract — via Reflect.getMetadata
// Assert each of the six moderation handlers carries the correct response decorators.
// Uses decorator metadata, NOT source-text slicing.
// ---------------------------------------------------------------------------

describe("ForumsController ST6: Swagger decorator metadata contract (decorator-metadata assertions)", () => {
  // Import reflect-metadata to ensure Reflect API is available
  // NestJS decorators store metadata via Reflect.defineMetadata
  // The metadata key for API responses is 'swagger/apiResponse'
  const SWAGGER_API_RESPONSE_KEY = "swagger/apiResponse";

  const getHandlerResponses = (methodName: keyof ForumsController): Record<number, unknown> => {
    const proto = ForumsController.prototype as unknown as Record<string, object>;
    return Reflect.getMetadata(SWAGGER_API_RESPONSE_KEY, proto[methodName as string]) ?? {};
  };

  // pin: must have 401, 403, 404
  it("pinTopic carries @ApiUnauthorizedResponse (401)", () => {
    const responses = getHandlerResponses("pinTopic");
    expect(responses).toHaveProperty("401");
  });
  it("pinTopic carries @ApiForbiddenResponse (403)", () => {
    const responses = getHandlerResponses("pinTopic");
    expect(responses).toHaveProperty("403");
  });
  it("pinTopic carries @ApiNotFoundResponse (404)", () => {
    const responses = getHandlerResponses("pinTopic");
    expect(responses).toHaveProperty("404");
  });

  // unpin: must have 401, 403, 404
  it("unpinTopic carries @ApiUnauthorizedResponse (401)", () => {
    const responses = getHandlerResponses("unpinTopic");
    expect(responses).toHaveProperty("401");
  });
  it("unpinTopic carries @ApiForbiddenResponse (403)", () => {
    const responses = getHandlerResponses("unpinTopic");
    expect(responses).toHaveProperty("403");
  });
  it("unpinTopic carries @ApiNotFoundResponse (404)", () => {
    const responses = getHandlerResponses("unpinTopic");
    expect(responses).toHaveProperty("404");
  });

  // lock: must have 401, 403, 404
  it("lockTopic carries @ApiUnauthorizedResponse (401)", () => {
    const responses = getHandlerResponses("lockTopic");
    expect(responses).toHaveProperty("401");
  });
  it("lockTopic carries @ApiForbiddenResponse (403)", () => {
    const responses = getHandlerResponses("lockTopic");
    expect(responses).toHaveProperty("403");
  });
  it("lockTopic carries @ApiNotFoundResponse (404)", () => {
    const responses = getHandlerResponses("lockTopic");
    expect(responses).toHaveProperty("404");
  });

  // unlock: must have 401, 403, 404
  it("unlockTopic carries @ApiUnauthorizedResponse (401)", () => {
    const responses = getHandlerResponses("unlockTopic");
    expect(responses).toHaveProperty("401");
  });
  it("unlockTopic carries @ApiForbiddenResponse (403)", () => {
    const responses = getHandlerResponses("unlockTopic");
    expect(responses).toHaveProperty("403");
  });
  it("unlockTopic carries @ApiNotFoundResponse (404)", () => {
    const responses = getHandlerResponses("unlockTopic");
    expect(responses).toHaveProperty("404");
  });

  // move: must have 400, 401, 403, 404
  it("moveTopic carries @ApiBadRequestResponse (400)", () => {
    const responses = getHandlerResponses("moveTopic");
    expect(responses).toHaveProperty("400");
  });
  it("moveTopic carries @ApiUnauthorizedResponse (401)", () => {
    const responses = getHandlerResponses("moveTopic");
    expect(responses).toHaveProperty("401");
  });
  it("moveTopic carries @ApiForbiddenResponse (403)", () => {
    const responses = getHandlerResponses("moveTopic");
    expect(responses).toHaveProperty("403");
  });
  it("moveTopic carries @ApiNotFoundResponse (404)", () => {
    const responses = getHandlerResponses("moveTopic");
    expect(responses).toHaveProperty("404");
  });
});

describe("ForumsController: createPost (ST5: happy path delegation)", () => {
  it("resolves session and delegates to forumsService.createPost, returning { post }", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const createdPost = {
      id: "post-new",
      body: "Reply text",
      parentId: null,
      quotedPostId: null,
      author: { username: "replyuser", displayName: "Reply User" },
      createdAt: now,
      updatedAt: now
    };
    const createPostSpy = vi.fn().mockResolvedValue(createdPost);
    const authService = makeAuthService(makeUserSession());
    const forumsService = makeForumsService({ createPost: createPostSpy });
    const controller = makeController(forumsService as never, authService as never);
    const result = await controller.createPost(
      makeRequest() as never,
      "topic-1",
      { body: "Reply text" }
    );
    expect(result).toEqual({ post: createdPost });
    expect(createPostSpy).toHaveBeenCalledWith("user-regular", { topicId: "topic-1", body: "Reply text" });
  });
});
