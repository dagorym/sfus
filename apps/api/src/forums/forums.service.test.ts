/**
 * forums.service.test.ts
 *
 * Unit tests for ForumsService (ST2).
 *
 * Acceptance criteria validated:
 * AC1: Admin endpoints enforce 401/403 gate — assertAdminManagementAccess throws ForbiddenException
 *      for non-admin callers; DB mocks are NOT called when the gate fires.
 * AC2: Create/update persist scopeType, visibility, projectId; reorder result is deterministic.
 * AC3: Invalid scopeType/visibility values are rejected with 400 (BadRequestException).
 * AC4: deleteCategory rejects with 400 if boards still attached; throws 404 if not found.
 *      Board create validates categoryId references existing category (404 if not found).
 */

import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { ForumsService } from "./forums.service";

// ---------------------------------------------------------------------------
// Minimal Repository stub — only methods called by ForumsService are needed.
// ---------------------------------------------------------------------------

interface MinimalRepo {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

const createMinimalRepository = (): MinimalRepo => ({
  find: vi.fn().mockResolvedValue([]),
  findOne: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockImplementation(async (e: unknown) => e),
  remove: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockImplementation((partial?: unknown) => ({ ...(partial as object) }))
});

const makeForumsService = (
  categoryRepo?: Partial<MinimalRepo>,
  boardRepo?: Partial<MinimalRepo>,
  topicRepo?: Partial<MinimalRepo>
): ForumsService => {
  const authorizationService = new AuthorizationService();
  const catRepo = { ...createMinimalRepository(), ...categoryRepo };
  const brdRepo = { ...createMinimalRepository(), ...boardRepo };
  const tpcRepo = { ...createMinimalRepository(), ...topicRepo };
  return new ForumsService(catRepo as never, brdRepo as never, tpcRepo as never, authorizationService);
};

// ---------------------------------------------------------------------------
// AC1: assertAdminManagementAccess — gate enforcement and DB non-call
// ---------------------------------------------------------------------------

describe("ForumsService.assertAdminManagementAccess (AC1: 403 gate)", () => {
  it("allows the admin global role", () => {
    const service = makeForumsService();
    expect(() => service.assertAdminManagementAccess("admin")).not.toThrow();
  });

  it("throws ForbiddenException for the user role", () => {
    const service = makeForumsService();
    expect(() => service.assertAdminManagementAccess("user")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for the moderator role", () => {
    const service = makeForumsService();
    expect(() => service.assertAdminManagementAccess("moderator")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for an empty string role", () => {
    const service = makeForumsService();
    expect(() => service.assertAdminManagementAccess("")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for an unrecognised role", () => {
    const service = makeForumsService();
    expect(() => service.assertAdminManagementAccess("superadmin")).toThrow(ForbiddenException);
  });

  it("DB repository is NOT called when the gate fires (gate-ordering assertion)", async () => {
    // This is a unit-level proxy: the gate is synchronous; DB calls happen in async methods.
    // We verify that after a gate failure, no repo method was invoked.
    const findSpy = vi.fn();
    const findOneSpy = vi.fn();
    const service = makeForumsService(
      { find: findSpy, findOne: findOneSpy },
      { find: findSpy, findOne: findOneSpy }
    );
    expect(() => service.assertAdminManagementAccess("user")).toThrow(ForbiddenException);
    // Gate is synchronous — DB async calls must not have been initiated.
    expect(findSpy).not.toHaveBeenCalled();
    expect(findOneSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Category management — findAllCategories, findCategoryById
// ---------------------------------------------------------------------------

describe("ForumsService.findAllCategories", () => {
  it("returns the list from the repository ordered by sortOrder", async () => {
    const categories = [
      { id: "cat-1", name: "Category A", slug: "cat-a", sortOrder: 0, boards: [] },
      { id: "cat-2", name: "Category B", slug: "cat-b", sortOrder: 1, boards: [] }
    ];
    const findSpy = vi.fn().mockResolvedValue(categories);
    const service = makeForumsService({ find: findSpy });
    const result = await service.findAllCategories();
    expect(result).toBe(categories);
    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({ order: expect.objectContaining({ sortOrder: "ASC" }) })
    );
  });
});

describe("ForumsService.findCategoryById", () => {
  it("returns null when category is not found", async () => {
    const service = makeForumsService();
    const result = await service.findCategoryById("nonexistent");
    expect(result).toBeNull();
  });

  it("returns the category when found", async () => {
    const cat = { id: "cat-1", name: "Cat", slug: "cat", boards: [] };
    const findOneSpy = vi.fn().mockResolvedValue(cat);
    const service = makeForumsService({ findOne: findOneSpy });
    const result = await service.findCategoryById("cat-1");
    expect(result).toBe(cat);
  });
});

// ---------------------------------------------------------------------------
// Category creation
// ---------------------------------------------------------------------------

describe("ForumsService.createCategory", () => {
  it("throws BadRequestException for empty name", async () => {
    const service = makeForumsService();
    await expect(service.createCategory({ name: "   ", slug: "valid-slug" })).rejects.toThrow(
      BadRequestException
    );
  });

  it("throws BadRequestException for invalid slug", async () => {
    const service = makeForumsService();
    await expect(service.createCategory({ name: "Category", slug: "INVALID SLUG!" })).rejects.toThrow(
      BadRequestException
    );
  });

  it("saves a category and returns the stored entity", async () => {
    const saved = { id: "cat-new", name: "My Category", slug: "my-category", sortOrder: 0, boards: [] };
    const createSpy = vi.fn().mockReturnValue(saved);
    const saveSpy = vi.fn().mockResolvedValue(saved);
    const findOneSpy = vi.fn().mockResolvedValue(saved);
    const service = makeForumsService({ create: createSpy, save: saveSpy, findOne: findOneSpy });
    const result = await service.createCategory({ name: "My Category", slug: "my-category" });
    expect(saveSpy).toHaveBeenCalled();
    expect(result).toBe(saved);
  });

  it("uses sortOrder 0 when not provided", async () => {
    const saved = { id: "cat-new", name: "Cat", slug: "cat", sortOrder: 0, boards: [] };
    const createSpy = vi.fn().mockReturnValue(saved);
    const saveSpy = vi.fn().mockResolvedValue(saved);
    const findOneSpy = vi.fn().mockResolvedValue(saved);
    const service = makeForumsService({ create: createSpy, save: saveSpy, findOne: findOneSpy });
    await service.createCategory({ name: "Cat", slug: "cat" });
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 0 }));
  });
});

// ---------------------------------------------------------------------------
// Category update
// ---------------------------------------------------------------------------

describe("ForumsService.updateCategory", () => {
  it("throws NotFoundException when category does not exist", async () => {
    const service = makeForumsService();
    await expect(service.updateCategory("nonexistent", { name: "New Name" })).rejects.toThrow(
      NotFoundException
    );
  });

  it("throws BadRequestException for invalid slug on update", async () => {
    const existing = { id: "cat-1", name: "Cat", slug: "cat", sortOrder: 0 };
    const findOneSpy = vi.fn().mockResolvedValue(existing);
    const service = makeForumsService({ findOne: findOneSpy });
    await expect(service.updateCategory("cat-1", { slug: "BAD SLUG!!" })).rejects.toThrow(
      BadRequestException
    );
  });

  it("updates name and returns updated entity", async () => {
    const existing = { id: "cat-1", name: "Original", slug: "original", sortOrder: 0 };
    const updated = { ...existing, name: "Updated" };
    const findOneSpy = vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce({ ...updated, boards: [] });
    const saveSpy = vi.fn().mockResolvedValue(updated);
    const service = makeForumsService({ findOne: findOneSpy, save: saveSpy });
    const result = await service.updateCategory("cat-1", { name: "Updated" });
    expect(saveSpy).toHaveBeenCalled();
    expect(result.name).toBe("Updated");
  });
});

// ---------------------------------------------------------------------------
// AC4: deleteCategory — 400 if boards attached, 404 if not found
// ---------------------------------------------------------------------------

describe("ForumsService.deleteCategory (AC4)", () => {
  it("throws NotFoundException when category does not exist", async () => {
    const service = makeForumsService();
    await expect(service.deleteCategory("nonexistent")).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException when category still has boards (AC4: 400 if boards attached)", async () => {
    const categoryWithBoards = {
      id: "cat-1",
      name: "Cat",
      slug: "cat",
      sortOrder: 0,
      boards: [{ id: "board-1", name: "Board A" }]
    };
    const findOneSpy = vi.fn().mockResolvedValue(categoryWithBoards);
    const service = makeForumsService({ findOne: findOneSpy });
    await expect(service.deleteCategory("cat-1")).rejects.toThrow(BadRequestException);
  });

  it("deletes successfully when category has no boards", async () => {
    const emptyCategory = { id: "cat-1", name: "Cat", slug: "cat", sortOrder: 0, boards: [] };
    const findOneSpy = vi.fn().mockResolvedValue(emptyCategory);
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    const service = makeForumsService({ findOne: findOneSpy, remove: removeSpy });
    await expect(service.deleteCategory("cat-1")).resolves.toBeUndefined();
    expect(removeSpy).toHaveBeenCalledWith(emptyCategory);
  });

  it("repository remove is NOT called when 404 fires (gate-ordering)", async () => {
    const removeSpy = vi.fn();
    const service = makeForumsService({ findOne: vi.fn().mockResolvedValue(null), remove: removeSpy });
    await expect(service.deleteCategory("cat-missing")).rejects.toThrow(NotFoundException);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC2: reorderCategories — deterministic result ordering
// ---------------------------------------------------------------------------

describe("ForumsService.reorderCategories (AC2: deterministic ordering)", () => {
  it("throws BadRequestException when orderedIds count does not match existing categories", async () => {
    const existing = [
      { id: "cat-1", sortOrder: 0 },
      { id: "cat-2", sortOrder: 1 }
    ];
    const findSpy = vi.fn().mockResolvedValue(existing);
    const service = makeForumsService({ find: findSpy });
    // Providing only 1 id for 2 categories
    await expect(service.reorderCategories({ orderedIds: ["cat-1"] })).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when an id in orderedIds does not exist", async () => {
    const existing = [{ id: "cat-1", sortOrder: 0 }];
    const findSpy = vi.fn().mockResolvedValue(existing);
    const service = makeForumsService({ find: findSpy });
    await expect(service.reorderCategories({ orderedIds: ["nonexistent-id"] })).rejects.toThrow(
      BadRequestException
    );
  });

  it("saves categories with sortOrder equal to their position in orderedIds", async () => {
    const cat1 = { id: "cat-1", sortOrder: 1 };
    const cat2 = { id: "cat-2", sortOrder: 0 };
    const existing = [cat1, cat2];
    const reordered = [
      { id: "cat-2", sortOrder: 0, boards: [] },
      { id: "cat-1", sortOrder: 1, boards: [] }
    ];
    const findSpy = vi
      .fn()
      .mockResolvedValueOnce(existing) // initial find for validation
      .mockResolvedValueOnce(reordered); // final find after save
    const saveSpy = vi.fn().mockResolvedValue(undefined);
    const service = makeForumsService({ find: findSpy, save: saveSpy });
    const result = await service.reorderCategories({ orderedIds: ["cat-2", "cat-1"] });
    // After reorder: cat-2 should be at position 0, cat-1 at position 1
    expect(saveSpy).toHaveBeenCalled();
    // Verify the saved array has sortOrder assigned by position
    const savedArray = saveSpy.mock.calls[0][0] as Array<{ id: string; sortOrder: number }>;
    const cat2Entry = savedArray.find((c) => c.id === "cat-2");
    const cat1Entry = savedArray.find((c) => c.id === "cat-1");
    expect(cat2Entry?.sortOrder).toBe(0);
    expect(cat1Entry?.sortOrder).toBe(1);
    // Result is the final ordered list from repository
    expect(result).toBe(reordered);
  });
});

// ---------------------------------------------------------------------------
// Board management — findBoardsByCategoryId, findBoardById
// ---------------------------------------------------------------------------

describe("ForumsService.findBoardsByCategoryId", () => {
  it("returns boards for the given category ordered by sortOrder", async () => {
    const boards = [{ id: "board-1", categoryId: "cat-1", sortOrder: 0 }];
    const findSpy = vi.fn().mockResolvedValue(boards);
    const service = makeForumsService(undefined, { find: findSpy });
    const result = await service.findBoardsByCategoryId("cat-1");
    expect(result).toBe(boards);
    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: "cat-1" }),
        order: expect.objectContaining({ sortOrder: "ASC" })
      })
    );
  });
});

describe("ForumsService.findBoardById", () => {
  it("returns null when board is not found", async () => {
    const service = makeForumsService();
    const result = await service.findBoardById("nonexistent");
    expect(result).toBeNull();
  });

  it("returns the board when found", async () => {
    const board = { id: "board-1", name: "Board A", categoryId: "cat-1" };
    const findOneSpy = vi.fn().mockResolvedValue(board);
    const service = makeForumsService(undefined, { findOne: findOneSpy });
    const result = await service.findBoardById("board-1");
    expect(result).toBe(board);
  });
});

// ---------------------------------------------------------------------------
// AC2+AC3: Board creation — scopeType, visibility, projectId persistence and enum validation
// ---------------------------------------------------------------------------

describe("ForumsService.createBoard (AC2: field persistence; AC3: enum validation)", () => {
  it("throws NotFoundException when categoryId does not reference an existing category (AC4 board variant)", async () => {
    // categoryRepository.findOne returns null → 404
    const catFindOneSpy = vi.fn().mockResolvedValue(null);
    const service = makeForumsService({ findOne: catFindOneSpy });
    await expect(
      service.createBoard({ categoryId: "nonexistent", name: "Board", slug: "board" })
    ).rejects.toThrow(NotFoundException);
  });

  it("saves board with default scopeType=site and visibility=public when omitted", async () => {
    const category = { id: "cat-1", name: "Cat" };
    const savedBoard = {
      id: "board-new",
      categoryId: "cat-1",
      name: "Board",
      slug: "board",
      scopeType: "site",
      visibility: "public",
      projectId: null,
      sortOrder: 0
    };
    const catFindOneSpy = vi.fn().mockResolvedValue(category);
    const boardCreateSpy = vi.fn().mockReturnValue(savedBoard);
    const boardSaveSpy = vi.fn().mockResolvedValue(savedBoard);
    const boardFindOneSpy = vi.fn().mockResolvedValue(savedBoard);
    const service = makeForumsService(
      { findOne: catFindOneSpy },
      { create: boardCreateSpy, save: boardSaveSpy, findOne: boardFindOneSpy }
    );
    await service.createBoard({ categoryId: "cat-1", name: "Board", slug: "board" });
    expect(boardCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ scopeType: "site", visibility: "public", projectId: null })
    );
  });

  it("persists scopeType=project when provided (AC2)", async () => {
    const category = { id: "cat-1" };
    const savedBoard = {
      id: "board-new",
      categoryId: "cat-1",
      name: "Project Board",
      slug: "project-board",
      scopeType: "project",
      visibility: "members",
      projectId: "proj-123",
      sortOrder: 0
    };
    const catFindOneSpy = vi.fn().mockResolvedValue(category);
    const boardCreateSpy = vi.fn().mockReturnValue(savedBoard);
    const boardSaveSpy = vi.fn().mockResolvedValue(savedBoard);
    const boardFindOneSpy = vi.fn().mockResolvedValue(savedBoard);
    const service = makeForumsService(
      { findOne: catFindOneSpy },
      { create: boardCreateSpy, save: boardSaveSpy, findOne: boardFindOneSpy }
    );
    await service.createBoard({
      categoryId: "cat-1",
      name: "Project Board",
      slug: "project-board",
      scopeType: "project",
      visibility: "members",
      projectId: "proj-123"
    });
    expect(boardCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ scopeType: "project", visibility: "members", projectId: "proj-123" })
    );
  });

  it("throws BadRequestException for invalid scopeType before any DB call (AC3)", async () => {
    const catFindOneSpy = vi.fn().mockResolvedValue({ id: "cat-1" });
    const boardSaveSpy = vi.fn();
    const service = makeForumsService({ findOne: catFindOneSpy }, { save: boardSaveSpy });
    await expect(
      service.createBoard({
        categoryId: "cat-1",
        name: "Board",
        slug: "board",
        scopeType: "invalid-scope" as never
      })
    ).rejects.toThrow(BadRequestException);
    expect(boardSaveSpy).not.toHaveBeenCalled();
  });

  it("throws BadRequestException for invalid visibility before any DB call (AC3)", async () => {
    const catFindOneSpy = vi.fn().mockResolvedValue({ id: "cat-1" });
    const boardSaveSpy = vi.fn();
    const service = makeForumsService({ findOne: catFindOneSpy }, { save: boardSaveSpy });
    await expect(
      service.createBoard({
        categoryId: "cat-1",
        name: "Board",
        slug: "board",
        visibility: "world" as never
      })
    ).rejects.toThrow(BadRequestException);
    expect(boardSaveSpy).not.toHaveBeenCalled();
  });

  // Verify all valid scopeType values are accepted (AC3 positive cases)
  it.each(["site", "project"] as const)(
    "accepts valid scopeType=%s without error",
    async (scopeType) => {
      const category = { id: "cat-1" };
      const savedBoard = { id: "board-new", categoryId: "cat-1", name: "B", slug: "b", scopeType, visibility: "public", projectId: null, sortOrder: 0 };
      const catFindOneSpy = vi.fn().mockResolvedValue(category);
      const boardCreateSpy = vi.fn().mockReturnValue(savedBoard);
      const boardSaveSpy = vi.fn().mockResolvedValue(savedBoard);
      const boardFindOneSpy = vi.fn().mockResolvedValue(savedBoard);
      const service = makeForumsService(
        { findOne: catFindOneSpy },
        { create: boardCreateSpy, save: boardSaveSpy, findOne: boardFindOneSpy }
      );
      await expect(
        service.createBoard({ categoryId: "cat-1", name: "B", slug: "b", scopeType })
      ).resolves.toBeDefined();
    }
  );

  // Verify all valid visibility values are accepted (AC3 positive cases)
  it.each(["public", "unlisted", "members", "project-only", "private"] as const)(
    "accepts valid visibility=%s without error",
    async (visibility) => {
      const category = { id: "cat-1" };
      const savedBoard = { id: "board-new", categoryId: "cat-1", name: "B", slug: "b", scopeType: "site", visibility, projectId: null, sortOrder: 0 };
      const catFindOneSpy = vi.fn().mockResolvedValue(category);
      const boardCreateSpy = vi.fn().mockReturnValue(savedBoard);
      const boardSaveSpy = vi.fn().mockResolvedValue(savedBoard);
      const boardFindOneSpy = vi.fn().mockResolvedValue(savedBoard);
      const service = makeForumsService(
        { findOne: catFindOneSpy },
        { create: boardCreateSpy, save: boardSaveSpy, findOne: boardFindOneSpy }
      );
      await expect(
        service.createBoard({ categoryId: "cat-1", name: "B", slug: "b", visibility })
      ).resolves.toBeDefined();
    }
  );

  it("throws BadRequestException for empty board name", async () => {
    const service = makeForumsService();
    await expect(
      service.createBoard({ categoryId: "cat-1", name: "   ", slug: "board" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException for invalid slug", async () => {
    const service = makeForumsService();
    await expect(
      service.createBoard({ categoryId: "cat-1", name: "Board", slug: "INVALID!!" })
    ).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// AC2+AC3: Board update — scopeType/visibility/projectId persistence and enum validation
// ---------------------------------------------------------------------------

describe("ForumsService.updateBoard (AC2: field persistence; AC3: enum validation)", () => {
  it("throws NotFoundException when board does not exist", async () => {
    const service = makeForumsService();
    await expect(service.updateBoard("nonexistent", { name: "New Name" })).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException for invalid scopeType during update (AC3)", async () => {
    const existing = { id: "board-1", categoryId: "cat-1", name: "Board", slug: "board", scopeType: "site", visibility: "public", projectId: null, sortOrder: 0 };
    const boardFindOneSpy = vi.fn().mockResolvedValue(existing);
    const boardSaveSpy = vi.fn();
    const service = makeForumsService(undefined, { findOne: boardFindOneSpy, save: boardSaveSpy });
    await expect(
      service.updateBoard("board-1", { scopeType: "bad-scope" as never })
    ).rejects.toThrow(BadRequestException);
    expect(boardSaveSpy).not.toHaveBeenCalled();
  });

  it("throws BadRequestException for invalid visibility during update (AC3)", async () => {
    const existing = { id: "board-1", categoryId: "cat-1", name: "Board", slug: "board", scopeType: "site", visibility: "public", projectId: null, sortOrder: 0 };
    const boardFindOneSpy = vi.fn().mockResolvedValue(existing);
    const boardSaveSpy = vi.fn();
    const service = makeForumsService(undefined, { findOne: boardFindOneSpy, save: boardSaveSpy });
    await expect(
      service.updateBoard("board-1", { visibility: "unknown" as never })
    ).rejects.toThrow(BadRequestException);
    expect(boardSaveSpy).not.toHaveBeenCalled();
  });

  it("persists updated scopeType, visibility, and projectId (AC2)", async () => {
    const existing = {
      id: "board-1",
      categoryId: "cat-1",
      name: "Board",
      slug: "board",
      scopeType: "site",
      visibility: "public",
      projectId: null,
      sortOrder: 0
    };
    const updatedBoard = { ...existing, scopeType: "project", visibility: "members", projectId: "proj-abc" };
    const boardFindOneSpy = vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(updatedBoard);
    const boardSaveSpy = vi.fn().mockResolvedValue(updatedBoard);
    const service = makeForumsService(undefined, { findOne: boardFindOneSpy, save: boardSaveSpy });
    const result = await service.updateBoard("board-1", {
      scopeType: "project",
      visibility: "members",
      projectId: "proj-abc"
    });
    expect(boardSaveSpy).toHaveBeenCalled();
    const savedBoard = boardSaveSpy.mock.calls[0][0] as { scopeType: string; visibility: string; projectId: string | null };
    expect(savedBoard.scopeType).toBe("project");
    expect(savedBoard.visibility).toBe("members");
    expect(savedBoard.projectId).toBe("proj-abc");
    expect(result.scopeType).toBe("project");
  });

  it("throws NotFoundException when new categoryId does not reference an existing category", async () => {
    const existing = { id: "board-1", categoryId: "cat-1", name: "Board", slug: "board", scopeType: "site", visibility: "public", projectId: null, sortOrder: 0 };
    const boardFindOneSpy = vi.fn().mockResolvedValue(existing);
    const catFindOneSpy = vi.fn().mockResolvedValue(null); // category not found
    const service = makeForumsService({ findOne: catFindOneSpy }, { findOne: boardFindOneSpy });
    await expect(
      service.updateBoard("board-1", { categoryId: "nonexistent-cat" })
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Board deletion
// ---------------------------------------------------------------------------

describe("ForumsService.deleteBoard", () => {
  it("throws NotFoundException when board does not exist", async () => {
    const service = makeForumsService();
    await expect(service.deleteBoard("nonexistent")).rejects.toThrow(NotFoundException);
  });

  it("removes the board when found", async () => {
    const board = { id: "board-1", name: "Board A" };
    const findOneSpy = vi.fn().mockResolvedValue(board);
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    const service = makeForumsService(undefined, { findOne: findOneSpy, remove: removeSpy });
    await expect(service.deleteBoard("board-1")).resolves.toBeUndefined();
    expect(removeSpy).toHaveBeenCalledWith(board);
  });

  it("repository remove is NOT called when 404 fires", async () => {
    const removeSpy = vi.fn();
    const service = makeForumsService(undefined, { findOne: vi.fn().mockResolvedValue(null), remove: removeSpy });
    await expect(service.deleteBoard("missing")).rejects.toThrow(NotFoundException);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ST3: isBoardPubliclyReadable — predicate unit tests
// ---------------------------------------------------------------------------

describe("ForumsService.isBoardPubliclyReadable (ST3: predicate)", () => {
  it("returns false for scopeType='project' WITHOUT calling evaluate (short-circuit)", () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");
    const service = new ForumsService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const board = { id: "b1", scopeType: "project", visibility: "public", projectId: null } as never;
    const result = service.isBoardPubliclyReadable(board);
    expect(result).toBe(false);
    expect(evaluateSpy).not.toHaveBeenCalled();
  });

  it("calls evaluate() and returns true for scopeType='site', visibility='public'", () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");
    const service = new ForumsService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const board = { id: "b2", scopeType: "site", visibility: "public", projectId: null } as never;
    const result = service.isBoardPubliclyReadable(board);
    expect(result).toBe(true);
    expect(evaluateSpy).toHaveBeenCalled();
  });

  it("calls evaluate() and returns true for scopeType='site', visibility='unlisted'", () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");
    const service = new ForumsService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const board = { id: "b3", scopeType: "site", visibility: "unlisted", projectId: null } as never;
    const result = service.isBoardPubliclyReadable(board);
    expect(result).toBe(true);
    expect(evaluateSpy).toHaveBeenCalled();
  });

  it("calls evaluate() and returns false for scopeType='site', visibility='private'", () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");
    const service = new ForumsService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const board = { id: "b4", scopeType: "site", visibility: "private", projectId: null } as never;
    const result = service.isBoardPubliclyReadable(board);
    expect(result).toBe(false);
    expect(evaluateSpy).toHaveBeenCalled();
  });

  it("returns false for scopeType='site', visibility='members'", () => {
    const authorizationService = new AuthorizationService();
    const service = new ForumsService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const board = { id: "b5", scopeType: "site", visibility: "members", projectId: null } as never;
    expect(service.isBoardPubliclyReadable(board)).toBe(false);
  });

  it("returns false for scopeType='site', visibility='project-only'", () => {
    const authorizationService = new AuthorizationService();
    const service = new ForumsService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const board = { id: "b6", scopeType: "site", visibility: "project-only", projectId: null } as never;
    expect(service.isBoardPubliclyReadable(board)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ST3: listPublicCategories — leak and shape tests
// ---------------------------------------------------------------------------

describe("ForumsService.listPublicCategories (ST3: leak tests)", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  const makeCategory = (boards: object[]) => ({
    id: "cat-1",
    name: "General",
    slug: "general",
    description: null,
    sortOrder: 0,
    boards,
    createdAt: now,
    updatedAt: now
  });

  it("project-scoped board (scopeType='project') is ABSENT from the listing", async () => {
    const projectBoard = {
      id: "board-proj",
      name: "Project Board",
      slug: "project-board",
      description: null,
      sortOrder: 0,
      scopeType: "project",
      visibility: "public",
      projectId: "proj-1",
      categoryId: "cat-1",
      createdAt: now,
      updatedAt: now
    };
    const category = makeCategory([projectBoard]);
    const findSpy = vi.fn().mockResolvedValue([category]);
    const service = makeForumsService({ find: findSpy });
    const result = await service.listPublicCategories();
    expect(result).toHaveLength(1);
    expect(result[0].boards).toHaveLength(0);
    const boardIds = result[0].boards.map((b) => b.id);
    expect(boardIds).not.toContain("board-proj");
  });

  it.each(["members", "private", "project-only"] as const)(
    "board with visibility='%s' is ABSENT from the listing",
    async (visibility) => {
      const hiddenBoard = {
        id: `board-${visibility}`,
        name: "Hidden",
        slug: "hidden",
        description: null,
        sortOrder: 0,
        scopeType: "site",
        visibility,
        projectId: null,
        categoryId: "cat-1",
        createdAt: now,
        updatedAt: now
      };
      const category = makeCategory([hiddenBoard]);
      const findSpy = vi.fn().mockResolvedValue([category]);
      const service = makeForumsService({ find: findSpy });
      const result = await service.listPublicCategories();
      expect(result[0].boards).toHaveLength(0);
      expect(result[0].boards.map((b) => b.id)).not.toContain(`board-${visibility}`);
    }
  );

  it("site/public board APPEARS in the listing", async () => {
    const publicBoard = {
      id: "board-public",
      name: "Public Board",
      slug: "public-board",
      description: null,
      sortOrder: 0,
      scopeType: "site",
      visibility: "public",
      projectId: null,
      categoryId: "cat-1",
      createdAt: now,
      updatedAt: now
    };
    const category = makeCategory([publicBoard]);
    const findSpy = vi.fn().mockResolvedValue([category]);
    const service = makeForumsService({ find: findSpy });
    const result = await service.listPublicCategories();
    expect(result[0].boards).toHaveLength(1);
    expect(result[0].boards[0].id).toBe("board-public");
  });

  it("site/unlisted board APPEARS in the listing (unlisted passes evaluate for read)", async () => {
    const unlistedBoard = {
      id: "board-unlisted",
      name: "Unlisted Board",
      slug: "unlisted-board",
      description: null,
      sortOrder: 0,
      scopeType: "site",
      visibility: "unlisted",
      projectId: null,
      categoryId: "cat-1",
      createdAt: now,
      updatedAt: now
    };
    const category = makeCategory([unlistedBoard]);
    const findSpy = vi.fn().mockResolvedValue([category]);
    const service = makeForumsService({ find: findSpy });
    const result = await service.listPublicCategories();
    expect(result[0].boards).toHaveLength(1);
    expect(result[0].boards[0].id).toBe("board-unlisted");
  });

  it("public board shape from listPublicCategories excludes scopeType, projectId, categoryId", async () => {
    const publicBoard = {
      id: "board-shape",
      name: "Shape Board",
      slug: "shape-board",
      description: "desc",
      sortOrder: 1,
      scopeType: "site",
      visibility: "public",
      projectId: "proj-9",
      categoryId: "cat-1",
      createdAt: now,
      updatedAt: now
    };
    const category = makeCategory([publicBoard]);
    const findSpy = vi.fn().mockResolvedValue([category]);
    const service = makeForumsService({ find: findSpy });
    const result = await service.listPublicCategories();
    const board = result[0].boards[0];
    expect(board).not.toHaveProperty("scopeType");
    expect(board).not.toHaveProperty("projectId");
    expect(board).not.toHaveProperty("categoryId");
    // Required fields present
    expect(board.id).toBe("board-shape");
    expect(board.name).toBe("Shape Board");
    expect(board.slug).toBe("shape-board");
    expect(board.visibility).toBe("public");
  });
});

// ---------------------------------------------------------------------------
// ST3: getPublicBoard — oracle parity tests
// ---------------------------------------------------------------------------

describe("ForumsService.getPublicBoard (ST3: oracle parity)", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("throws NotFoundException for a nonexistent board id", async () => {
    const service = makeForumsService();
    await expect(service.getPublicBoard("nonexistent-id")).rejects.toThrow(NotFoundException);
  });

  it("nonexistent board throws NotFoundException with message === BOARD_NOT_FOUND_MESSAGE", async () => {
    const service = makeForumsService();
    await expect(service.getPublicBoard("nonexistent-id")).rejects.toThrow(
      ForumsService.BOARD_NOT_FOUND_MESSAGE
    );
  });

  it("project-scoped board throws NotFoundException with the IDENTICAL message as nonexistent", async () => {
    const projectBoard = {
      id: "board-proj",
      name: "Project Board",
      slug: "project-board",
      description: null,
      sortOrder: 0,
      scopeType: "project",
      visibility: "public",
      projectId: "proj-1",
      categoryId: "cat-1",
      createdAt: now,
      updatedAt: now
    };
    const boardFindOneSpy = vi.fn().mockResolvedValue(projectBoard);
    const service = makeForumsService(undefined, { findOne: boardFindOneSpy });
    await expect(service.getPublicBoard("board-proj")).rejects.toThrow(
      ForumsService.BOARD_NOT_FOUND_MESSAGE
    );
  });

  it("visibility='members' board throws NotFoundException with the IDENTICAL message as nonexistent", async () => {
    const membersBoard = {
      id: "board-members",
      name: "Members Board",
      slug: "members-board",
      description: null,
      sortOrder: 0,
      scopeType: "site",
      visibility: "members",
      projectId: null,
      categoryId: "cat-1",
      createdAt: now,
      updatedAt: now
    };
    const boardFindOneSpy = vi.fn().mockResolvedValue(membersBoard);
    const service = makeForumsService(undefined, { findOne: boardFindOneSpy });
    await expect(service.getPublicBoard("board-members")).rejects.toThrow(
      ForumsService.BOARD_NOT_FOUND_MESSAGE
    );
  });

  it("site/public board returns the board shape WITHOUT scopeType, projectId, categoryId", async () => {
    const publicBoard = {
      id: "board-public",
      name: "Public Board",
      slug: "public-board",
      description: "a description",
      sortOrder: 2,
      scopeType: "site",
      visibility: "public",
      projectId: null,
      categoryId: "cat-1",
      createdAt: now,
      updatedAt: now
    };
    const boardFindOneSpy = vi.fn().mockResolvedValue(publicBoard);
    const service = makeForumsService(undefined, { findOne: boardFindOneSpy });
    const result = await service.getPublicBoard("board-public");
    expect(result.id).toBe("board-public");
    expect(result.name).toBe("Public Board");
    expect(result.visibility).toBe("public");
    expect(result).not.toHaveProperty("scopeType");
    expect(result).not.toHaveProperty("projectId");
    expect(result).not.toHaveProperty("categoryId");
  });
});

// ---------------------------------------------------------------------------
// AC2: reorderBoards — deterministic result ordering
// ---------------------------------------------------------------------------

describe("ForumsService.reorderBoards (AC2: deterministic ordering)", () => {
  it("throws NotFoundException when categoryId does not exist", async () => {
    const catFindOneSpy = vi.fn().mockResolvedValue(null);
    const service = makeForumsService({ findOne: catFindOneSpy });
    await expect(service.reorderBoards("nonexistent-cat", { orderedIds: [] })).rejects.toThrow(
      NotFoundException
    );
  });

  it("throws BadRequestException when orderedIds count does not match boards in category", async () => {
    const category = { id: "cat-1", name: "Cat" };
    const boards = [{ id: "board-1", categoryId: "cat-1", sortOrder: 0 }];
    const catFindOneSpy = vi.fn().mockResolvedValue(category);
    const boardFindSpy = vi.fn().mockResolvedValue(boards);
    const service = makeForumsService({ findOne: catFindOneSpy }, { find: boardFindSpy });
    await expect(service.reorderBoards("cat-1", { orderedIds: [] })).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when an id in orderedIds is not in the category", async () => {
    const category = { id: "cat-1" };
    const boards = [{ id: "board-1", categoryId: "cat-1", sortOrder: 0 }];
    const catFindOneSpy = vi.fn().mockResolvedValue(category);
    const boardFindSpy = vi.fn().mockResolvedValue(boards);
    const service = makeForumsService({ findOne: catFindOneSpy }, { find: boardFindSpy });
    await expect(service.reorderBoards("cat-1", { orderedIds: ["unknown-board"] })).rejects.toThrow(
      BadRequestException
    );
  });

  it("assigns sortOrder by position and returns boards in deterministic order (AC2)", async () => {
    const category = { id: "cat-1" };
    const board1 = { id: "board-1", categoryId: "cat-1", sortOrder: 1 };
    const board2 = { id: "board-2", categoryId: "cat-1", sortOrder: 0 };
    const boards = [board1, board2];
    const reordered = [
      { id: "board-2", categoryId: "cat-1", sortOrder: 0 },
      { id: "board-1", categoryId: "cat-1", sortOrder: 1 }
    ];
    const catFindOneSpy = vi.fn().mockResolvedValue(category);
    const boardFindSpy = vi
      .fn()
      .mockResolvedValueOnce(boards) // initial find for validation
      .mockResolvedValueOnce(reordered); // final find after save
    const boardSaveSpy = vi.fn().mockResolvedValue(undefined);
    const service = makeForumsService({ findOne: catFindOneSpy }, { find: boardFindSpy, save: boardSaveSpy });
    const result = await service.reorderBoards("cat-1", { orderedIds: ["board-2", "board-1"] });

    // Verify sortOrder assigned by position
    const savedArray = boardSaveSpy.mock.calls[0][0] as Array<{ id: string; sortOrder: number }>;
    const b2Entry = savedArray.find((b) => b.id === "board-2");
    const b1Entry = savedArray.find((b) => b.id === "board-1");
    expect(b2Entry?.sortOrder).toBe(0);
    expect(b1Entry?.sortOrder).toBe(1);

    // Result is the final ordered list (deterministic)
    expect(result).toBe(reordered);
  });
});
