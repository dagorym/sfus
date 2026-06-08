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
import { IsNull } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { ForumsService } from "./forums.service";

// ---------------------------------------------------------------------------
// Minimal Repository stub — only methods called by ForumsService are needed.
// ---------------------------------------------------------------------------

interface MinimalRepo {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  findAndCount: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

const createMinimalRepository = (): MinimalRepo => ({
  find: vi.fn().mockResolvedValue([]),
  findOne: vi.fn().mockResolvedValue(null),
  findAndCount: vi.fn().mockResolvedValue([[], 0]),
  save: vi.fn().mockImplementation(async (e: unknown) => e),
  remove: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockImplementation((partial?: unknown) => ({ ...(partial as object) }))
});

const makeForumsService = (
  categoryRepo?: Partial<MinimalRepo>,
  boardRepo?: Partial<MinimalRepo>,
  topicRepo?: Partial<MinimalRepo>,
  postRepo?: Partial<MinimalRepo>
): ForumsService => {
  const authorizationService = new AuthorizationService();
  const catRepo = { ...createMinimalRepository(), ...categoryRepo };
  const brdRepo = { ...createMinimalRepository(), ...boardRepo };
  const tpcRepo = { ...createMinimalRepository(), ...topicRepo };
  const pstRepo = { ...createMinimalRepository(), ...postRepo };
  return new ForumsService(catRepo as never, brdRepo as never, tpcRepo as never, pstRepo as never, authorizationService);
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

// ---------------------------------------------------------------------------
// ST4: createTopic — board visibility gate, Markdown validation, public shape
// ---------------------------------------------------------------------------

describe("ForumsService.createTopic (ST4: board gate)", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  const makePublicBoard = () => ({
    id: "board-pub",
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
  });

  // TC1: nonexistent board → TOPIC_NOT_FOUND_MESSAGE
  it("throws NotFoundException with TOPIC_NOT_FOUND_MESSAGE for nonexistent board (TC1)", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(null);
    const service = makeForumsService(undefined, { findOne: boardFindOneSpy });
    await expect(
      service.createTopic("user-1", { boardId: "board-nonexistent", title: "Hello", body: "World" })
    ).rejects.toThrow(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
  });

  // TC2: gated board (members visibility) → IDENTICAL TOPIC_NOT_FOUND_MESSAGE
  it("throws NotFoundException with IDENTICAL TOPIC_NOT_FOUND_MESSAGE for members-visibility board (TC2: oracle parity)", async () => {
    const gatedBoard = {
      ...makePublicBoard(),
      visibility: "members"
    };
    const boardFindOneSpy = vi.fn().mockResolvedValue(gatedBoard);
    const service = makeForumsService(undefined, { findOne: boardFindOneSpy });

    // Nonexistent board throws the same message as gated board (oracle parity)
    const nonexistentService = makeForumsService(undefined, { findOne: vi.fn().mockResolvedValue(null) });
    await expect(
      service.createTopic("user-1", { boardId: "board-gated", title: "Hello", body: "World" })
    ).rejects.toThrow(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
    await expect(
      nonexistentService.createTopic("user-1", { boardId: "board-missing", title: "Hello", body: "World" })
    ).rejects.toThrow(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
    // Confirm both produce the exact same message
    let gatedMsg = "";
    let nonexistentMsg = "";
    try { await service.createTopic("user-1", { boardId: "board-gated", title: "H", body: "B" }); } catch (e: unknown) { gatedMsg = (e as Error).message; }
    try { await nonexistentService.createTopic("user-1", { boardId: "board-missing", title: "H", body: "B" }); } catch (e: unknown) { nonexistentMsg = (e as Error).message; }
    expect(gatedMsg).toBe(nonexistentMsg);
  });

  // TC5: createTopic on readable board calls AuthorizationService.evaluate()
  it("calls AuthorizationService.evaluate() when board is readable (TC5: spy asserted)", async () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");

    const savedTopic = {
      id: "topic-1",
      boardId: "board-pub",
      authorUserId: "user-1",
      title: "Hello",
      slug: "hello",
      body: "World",
      isPinned: false,
      isLocked: false,
      replyCount: 0,
      lastPostAt: null,
      movedByUserId: null,
      movedAt: null,
      lockedByUserId: null,
      lockedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      author: { username: "testuser", displayName: "Test User" }
    };

    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicCreateSpy = vi.fn().mockReturnValue(savedTopic);
    const topicSaveSpy = vi.fn().mockResolvedValue(savedTopic);
    const topicFindOneSpy = vi.fn().mockResolvedValue(savedTopic);
    const service = new ForumsService(
      createMinimalRepository() as never,
      { ...createMinimalRepository(), findOne: boardFindOneSpy } as never,
      { ...createMinimalRepository(), create: topicCreateSpy, save: topicSaveSpy, findOne: topicFindOneSpy } as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await service.createTopic("user-1", { boardId: "board-pub", title: "Hello", body: "World" });
    expect(evaluateSpy).toHaveBeenCalled();
  });

  // TC7: Unsafe Markdown (<script>) → BadRequestException, save NOT called
  it("rejects <script> body with BadRequestException before persistence (TC7: unsafe Markdown)", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { save: topicSaveSpy }
    );
    await expect(
      service.createTopic("user-1", {
        boardId: "board-pub",
        title: "Test topic",
        body: "<script>alert('xss')</script>"
      })
    ).rejects.toThrow(BadRequestException);
    expect(topicSaveSpy).not.toHaveBeenCalled();
  });

  // TC8: Unsafe Markdown (javascript: link) → 400 before persistence
  it("rejects javascript: link body with BadRequestException before persistence (TC8: unsafe Markdown)", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { save: topicSaveSpy }
    );
    await expect(
      service.createTopic("user-1", {
        boardId: "board-pub",
        title: "Test topic",
        body: "[click me](javascript:alert(1))"
      })
    ).rejects.toThrow(BadRequestException);
    expect(topicSaveSpy).not.toHaveBeenCalled();
  });

  // TC10: Public shape lacks authorUserId, boardId, isLocked, movedByUserId, lockedByUserId, deletedAt
  //       and has author.username, author.displayName
  it("response shape lacks internal fields and includes author.username/displayName (TC10: public shape)", async () => {
    const savedTopic = {
      id: "topic-shape",
      boardId: "board-pub",
      authorUserId: "user-secret",
      title: "Shape Test",
      slug: "shape-test",
      body: "Hello world",
      isPinned: false,
      isLocked: true,
      replyCount: 5,
      lastPostAt: now,
      movedByUserId: "mover-id",
      movedAt: now,
      lockedByUserId: "locker-id",
      lockedAt: now,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      author: { username: "testuser", displayName: "Test User" }
    };
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicCreateSpy = vi.fn().mockReturnValue(savedTopic);
    const topicSaveSpy = vi.fn().mockResolvedValue(savedTopic);
    const topicFindOneSpy = vi.fn().mockResolvedValue(savedTopic);
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { create: topicCreateSpy, save: topicSaveSpy, findOne: topicFindOneSpy }
    );
    const result = await service.createTopic("user-1", { boardId: "board-pub", title: "Shape Test", body: "Hello world" });

    // Internal fields must be absent
    expect(result).not.toHaveProperty("authorUserId");
    expect(result).not.toHaveProperty("boardId");
    expect(result).not.toHaveProperty("isLocked");
    expect(result).not.toHaveProperty("movedByUserId");
    expect(result).not.toHaveProperty("lockedByUserId");
    expect(result).not.toHaveProperty("deletedAt");

    // Public author sub-object present with correct fields
    expect(result.author).toBeDefined();
    expect(result.author.username).toBe("testuser");
    expect(result.author.displayName).toBe("Test User");
  });
});

// ---------------------------------------------------------------------------
// ST4: listTopics — board gate, pinned ordering, pagination, public shape
// ---------------------------------------------------------------------------

describe("ForumsService.listTopics (ST4: board gate + pagination)", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  const makePublicBoard = () => ({
    id: "board-pub",
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
  });

  // TC3: listTopics nonexistent board → TOPIC_NOT_FOUND_MESSAGE
  it("throws NotFoundException with TOPIC_NOT_FOUND_MESSAGE for nonexistent board (TC3)", async () => {
    const service = makeForumsService(undefined, { findOne: vi.fn().mockResolvedValue(null) });
    await expect(service.listTopics("board-missing", {})).rejects.toThrow(
      ForumsService.TOPIC_NOT_FOUND_MESSAGE
    );
  });

  // TC4: listTopics gated board → IDENTICAL TOPIC_NOT_FOUND_MESSAGE
  it("throws IDENTICAL TOPIC_NOT_FOUND_MESSAGE for gated board as for nonexistent board (TC4: oracle parity)", async () => {
    const gatedBoard = { ...makePublicBoard(), visibility: "project-only" };
    const gatedService = makeForumsService(undefined, { findOne: vi.fn().mockResolvedValue(gatedBoard) });
    const missingService = makeForumsService(undefined, { findOne: vi.fn().mockResolvedValue(null) });

    let gatedMsg = "";
    let missingMsg = "";
    try { await gatedService.listTopics("board-gated", {}); } catch (e: unknown) { gatedMsg = (e as Error).message; }
    try { await missingService.listTopics("board-missing", {}); } catch (e: unknown) { missingMsg = (e as Error).message; }
    expect(gatedMsg).toBe(missingMsg);
    expect(gatedMsg).toBe(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
  });

  // TC6: listTopics on readable board calls evaluate()
  it("calls AuthorizationService.evaluate() when board is readable (TC6: spy asserted)", async () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");

    const topics: unknown[] = [];
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicFindAndCountSpy = vi.fn().mockResolvedValue([topics, 0]);
    const service = new ForumsService(
      createMinimalRepository() as never,
      { ...createMinimalRepository(), findOne: boardFindOneSpy } as never,
      { ...createMinimalRepository(), findAndCount: topicFindAndCountSpy } as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await service.listTopics("board-pub", {});
    expect(evaluateSpy).toHaveBeenCalled();
  });

  // TC9: findAndCount called with order {isPinned:'DESC', lastPostAt:'DESC', createdAt:'DESC'}
  it("passes correct pinned+activity order to findAndCount (TC9: pinned ordering)", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { findAndCount: topicFindAndCountSpy }
    );
    await service.listTopics("board-pub", {});
    expect(topicFindAndCountSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { isPinned: "DESC", lastPostAt: "DESC", createdAt: "DESC" }
      })
    );
  });

  // TC11: listTopics public shape: same field-stripping as createTopic (TC11)
  it("returned topic shapes lack internal fields and include author.username/displayName (TC11: shape)", async () => {
    const topicEntity = {
      id: "topic-list",
      boardId: "board-pub",
      authorUserId: "user-secret",
      title: "List Topic",
      slug: "list-topic",
      body: "Content here",
      isPinned: false,
      isLocked: false,
      replyCount: 2,
      lastPostAt: now,
      movedByUserId: null,
      movedAt: null,
      lockedByUserId: null,
      lockedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      author: { username: "listuser", displayName: "List User" }
    };
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicFindAndCountSpy = vi.fn().mockResolvedValue([[topicEntity], 1]);
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { findAndCount: topicFindAndCountSpy }
    );
    const result = await service.listTopics("board-pub", {});
    expect(result.topics).toHaveLength(1);
    const topic = result.topics[0];
    expect(topic).not.toHaveProperty("authorUserId");
    expect(topic).not.toHaveProperty("boardId");
    expect(topic).not.toHaveProperty("isLocked");
    expect(topic).not.toHaveProperty("movedByUserId");
    expect(topic).not.toHaveProperty("lockedByUserId");
    expect(topic).not.toHaveProperty("deletedAt");
    expect(topic.author.username).toBe("listuser");
    expect(topic.author.displayName).toBe("List User");
  });

  // TC12: Pagination: page=2, pageSize=5 → skip=5, take=5
  it("translates page=2, pageSize=5 into skip=5, take=5 (TC12: pagination offset)", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { findAndCount: topicFindAndCountSpy }
    );
    await service.listTopics("board-pub", { page: 2, pageSize: 5 });
    expect(topicFindAndCountSpy).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 })
    );
  });

  // TC13: Pagination clamping: pageSize=999 → clamped to 100
  it("clamps pageSize=999 to 100 (TC13: pagination clamping)", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { findAndCount: topicFindAndCountSpy }
    );
    await service.listTopics("board-pub", { page: 1, pageSize: 999 });
    const callArgs = topicFindAndCountSpy.mock.calls[0][0] as { take: number };
    expect(callArgs.take).toBe(100);
  });

  // TEST A (WARNING-2 regression coverage): listTopics must include deletedAt: IsNull() in the
  // where clause to exclude soft-deleted topics. Dropping that condition would expose deleted
  // topics to public consumers; this assertion would catch such a regression.
  it("issues repository query with deletedAt: IsNull() in the where clause (TEST A: soft-delete exclusion)", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { findAndCount: topicFindAndCountSpy }
    );
    await service.listTopics("board-pub", {});
    const callArgs = topicFindAndCountSpy.mock.calls[0][0] as { where: Record<string, unknown> };
    // The where clause must include a TypeORM IsNull() FindOperator for deletedAt.
    // Any regression dropping this condition would pass `undefined` or omit the key entirely,
    // causing this assertion to fail and deleted topics to leak.
    expect(callArgs.where).toHaveProperty("deletedAt");
    expect(callArgs.where.deletedAt).toEqual(IsNull());
  });
});

// ---------------------------------------------------------------------------
// ST5: createPost — topic gate, locked topic, input guards, threading, shape
// ---------------------------------------------------------------------------

describe("ForumsService.createPost (ST5: topic gate + 401 boundary)", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  const makePublicBoard = () => ({
    id: "board-pub",
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
  });

  const makeUnlockedTopic = () => ({
    id: "topic-1",
    boardId: "board-pub",
    authorUserId: "user-1",
    title: "Test Topic",
    slug: "test-topic",
    body: "Topic body",
    isPinned: false,
    isLocked: false,
    replyCount: 0,
    lastPostAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    board: makePublicBoard()
  });

  const makeSavedPost = (overrides?: object) => ({
    id: "post-1",
    topicId: "topic-1",
    authorUserId: "user-1",
    body: "Hello world",
    parentId: null,
    quotedPostId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    author: { username: "testuser", displayName: "Test User" },
    ...overrides
  });

  // ST5-AC1a: nonexistent topic → TOPIC_NOT_FOUND_MESSAGE
  it("throws NotFoundException with TOPIC_NOT_FOUND_MESSAGE for nonexistent topic", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(null);
    const service = makeForumsService(undefined, undefined, { findOne: topicFindOneSpy });
    await expect(
      service.createPost("user-1", { topicId: "topic-nonexistent", body: "Hello" })
    ).rejects.toThrow(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
  });

  // ST5-AC1b: gated board (topic exists but board is not publicly readable) → IDENTICAL TOPIC_NOT_FOUND_MESSAGE
  it("throws IDENTICAL TOPIC_NOT_FOUND_MESSAGE for topic with gated board as for nonexistent topic (oracle parity)", async () => {
    const gatedBoard = { ...makePublicBoard(), visibility: "members" };
    const topicWithGatedBoard = { ...makeUnlockedTopic(), board: gatedBoard };
    const gatedService = makeForumsService(
      undefined, undefined,
      { findOne: vi.fn().mockResolvedValue(topicWithGatedBoard) }
    );
    const missingService = makeForumsService(
      undefined, undefined,
      { findOne: vi.fn().mockResolvedValue(null) }
    );
    let gatedMsg = "";
    let missingMsg = "";
    try { await gatedService.createPost("user-1", { topicId: "topic-gated", body: "Hello" }); } catch (e: unknown) { gatedMsg = (e as Error).message; }
    try { await missingService.createPost("user-1", { topicId: "topic-missing", body: "Hello" }); } catch (e: unknown) { missingMsg = (e as Error).message; }
    expect(gatedMsg).toBe(missingMsg);
    expect(gatedMsg).toBe(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
  });

  // ST5-AC1c: locked topic → 403 thread-locked, save NOT called
  it("throws ForbiddenException for locked topic and does NOT call save (ST5: locked topic 403)", async () => {
    const lockedTopic = { ...makeUnlockedTopic(), isLocked: true };
    const topicFindOneSpy = vi.fn().mockResolvedValue(lockedTopic);
    const postSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy, save: postSaveSpy },
      { save: postSaveSpy }
    );
    await expect(
      service.createPost("user-1", { topicId: "topic-1", body: "Hello" })
    ).rejects.toThrow(ForbiddenException);
    expect(postSaveSpy).not.toHaveBeenCalled();
  });

  // ST5: createPost calls AuthorizationService.evaluate()
  it("calls AuthorizationService.evaluate() when board is readable (ST5: spy asserted)", async () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");

    const savedPost = makeSavedPost();
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const postCreateSpy = vi.fn().mockReturnValue(savedPost);
    const postSaveSpy = vi.fn().mockResolvedValue(savedPost);
    const postFindOneSpy = vi.fn().mockResolvedValue(savedPost);
    // need topicRepo.save too for replyCount update
    const topicSaveSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());

    const service = new ForumsService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      { ...createMinimalRepository(), findOne: topicFindOneSpy, save: topicSaveSpy } as never,
      { ...createMinimalRepository(), create: postCreateSpy, save: postSaveSpy, findOne: postFindOneSpy } as never,
      authorizationService
    );
    await service.createPost("user-1", { topicId: "topic-1", body: "Hello world" });
    expect(evaluateSpy).toHaveBeenCalled();
  });

  // ST5-THREADING-valid: valid parentId (top-level post on same topic) → accepted
  it("accepts valid parentId that is a top-level post on the same topic", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const parentPost = {
      id: "parent-post-1",
      topicId: "topic-1",
      parentId: null, // top-level
      deletedAt: null
    };
    const savedPost = makeSavedPost({ parentId: "parent-post-1" });
    const postFindOneSpy = vi.fn()
      .mockResolvedValueOnce(parentPost)  // parent lookup
      .mockResolvedValueOnce(savedPost);  // reload after save
    const postCreateSpy = vi.fn().mockReturnValue(savedPost);
    const postSaveSpy = vi.fn().mockResolvedValue(savedPost);
    const topicSaveSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy, save: topicSaveSpy },
      { findOne: postFindOneSpy, create: postCreateSpy, save: postSaveSpy }
    );
    const result = await service.createPost("user-1", {
      topicId: "topic-1",
      body: "Hello world",
      parentId: "parent-post-1"
    });
    expect(result.parentId).toBe("parent-post-1");
  });

  // ST5-THREADING-invalid-a: nonexistent parentId → uniform 400, save NOT called
  it("throws uniform BadRequestException for nonexistent parentId — save NOT called (ST5: threading invalid-a)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const postFindOneSpy = vi.fn()
      .mockResolvedValueOnce(null); // parent not found
    const postSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findOne: postFindOneSpy, save: postSaveSpy }
    );
    await expect(
      service.createPost("user-1", { topicId: "topic-1", body: "Hello", parentId: "nonexistent-parent" })
    ).rejects.toThrow(BadRequestException);
    expect(postSaveSpy).not.toHaveBeenCalled();
  });

  // ST5-THREADING-invalid-b: parentId belongs to different topic → uniform 400 with IDENTICAL message
  it("throws uniform BadRequestException for parentId from different topic — IDENTICAL message as nonexistent (ST5: threading invalid-b)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const wrongTopicParent = {
      id: "parent-other-topic",
      topicId: "topic-OTHER",
      parentId: null,
      deletedAt: null
    };
    const notFoundParent = null;
    const serviceA = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findOne: vi.fn().mockResolvedValueOnce(wrongTopicParent), save: vi.fn() }
    );
    const serviceB = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findOne: vi.fn().mockResolvedValueOnce(notFoundParent), save: vi.fn() }
    );
    let msgA = "";
    let msgB = "";
    try { await serviceA.createPost("user-1", { topicId: "topic-1", body: "Hi", parentId: "parent-other-topic" }); } catch (e: unknown) { msgA = (e as Error).message; }
    try { await serviceB.createPost("user-1", { topicId: "topic-1", body: "Hi", parentId: "nonexistent" }); } catch (e: unknown) { msgB = (e as Error).message; }
    expect(msgA).toBe(msgB); // IDENTICAL message — no oracle
    expect(msgA).toBeTruthy();
  });

  // ST5-THREADING-invalid-c: parentId is itself a reply (reply-to-a-reply) → uniform 400, save NOT called
  it("throws uniform BadRequestException for reply-to-a-reply parentId — same message — save NOT called (ST5: threading invalid-c)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const replyPost = {
      id: "reply-post-1",
      topicId: "topic-1",
      parentId: "some-other-post", // is a reply, not top-level
      deletedAt: null
    };
    const notFoundParent = null;
    const serviceA = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findOne: vi.fn().mockResolvedValueOnce(replyPost), save: vi.fn() }
    );
    const serviceB = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findOne: vi.fn().mockResolvedValueOnce(notFoundParent), save: vi.fn() }
    );
    let msgA = "";
    let msgB = "";
    try { await serviceA.createPost("user-1", { topicId: "topic-1", body: "Hi", parentId: "reply-post-1" }); } catch (e: unknown) { msgA = (e as Error).message; }
    try { await serviceB.createPost("user-1", { topicId: "topic-1", body: "Hi", parentId: "nonexistent" }); } catch (e: unknown) { msgB = (e as Error).message; }
    expect(msgA).toBe(msgB); // IDENTICAL — uniform 400
    expect(msgA).toBeTruthy();
  });

  // ST5-MARKDOWN: unsafe body (<script>) → 400 BEFORE persistence
  it("rejects <script> body with BadRequestException before persistence (ST5: unsafe Markdown)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const postSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { save: postSaveSpy }
    );
    await expect(
      service.createPost("user-1", { topicId: "topic-1", body: "<script>alert('xss')</script>" })
    ).rejects.toThrow(BadRequestException);
    expect(postSaveSpy).not.toHaveBeenCalled();
  });

  // ST5-MARKDOWN: javascript: URL in body → 400 BEFORE persistence
  it("rejects javascript: link body with BadRequestException before persistence (ST5: unsafe Markdown URL)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const postSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { save: postSaveSpy }
    );
    await expect(
      service.createPost("user-1", { topicId: "topic-1", body: "[click](javascript:alert(1))" })
    ).rejects.toThrow(BadRequestException);
    expect(postSaveSpy).not.toHaveBeenCalled();
  });

  // ST5-INPUT: undefined body → BadRequestException (400), NOT TypeError/500, save NOT called
  it("throws BadRequestException (400) for undefined body — NOT TypeError — save NOT called", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const postSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { save: postSaveSpy }
    );
    const err = await service.createPost("user-1", { topicId: "topic-1", body: undefined as never }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(postSaveSpy).not.toHaveBeenCalled();
  });

  // ST5-INPUT: body=42 → BadRequestException (400), save NOT called
  it("throws BadRequestException (400) for body=42 (number) — save NOT called", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const postSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { save: postSaveSpy }
    );
    await expect(
      service.createPost("user-1", { topicId: "topic-1", body: 42 as never })
    ).rejects.toThrow(BadRequestException);
    expect(postSaveSpy).not.toHaveBeenCalled();
  });

  // ST5-INPUT: body={} → BadRequestException (400), save NOT called
  it("throws BadRequestException (400) for body={} (object) — save NOT called", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const postSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { save: postSaveSpy }
    );
    await expect(
      service.createPost("user-1", { topicId: "topic-1", body: {} as never })
    ).rejects.toThrow(BadRequestException);
    expect(postSaveSpy).not.toHaveBeenCalled();
  });

  // ST5-SHAPE: public post shape strips authorUserId, topicId, deletedAt; exposes author.username/displayName and quotedPostId
  it("response shape strips authorUserId, topicId, deletedAt and exposes author/quotedPostId (ST5: public shape)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const rawPost = {
      id: "post-shape",
      topicId: "topic-SECRET",
      authorUserId: "user-SECRET",
      body: "Hello world",
      parentId: null,
      quotedPostId: "quoted-post-99",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      author: { username: "shapeuser", displayName: "Shape User" }
    };
    const postCreateSpy = vi.fn().mockReturnValue(rawPost);
    const postSaveSpy = vi.fn().mockResolvedValue(rawPost);
    const postFindOneSpy = vi.fn().mockResolvedValue(rawPost);
    const topicSaveSpy = vi.fn().mockResolvedValue(makeUnlockedTopic());
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy, save: topicSaveSpy },
      { create: postCreateSpy, save: postSaveSpy, findOne: postFindOneSpy }
    );
    const result = await service.createPost("user-1", { topicId: "topic-1", body: "Hello world", quotedPostId: "quoted-post-99" });
    // Stripped internal fields
    expect(result).not.toHaveProperty("authorUserId");
    expect(result).not.toHaveProperty("topicId");
    expect(result).not.toHaveProperty("deletedAt");
    // Exposed public fields
    expect(result.author).toBeDefined();
    expect(result.author.username).toBe("shapeuser");
    expect(result.author.displayName).toBe("Shape User");
    expect(result.quotedPostId).toBe("quoted-post-99");
  });
});

// ---------------------------------------------------------------------------
// ST5: listPosts — topic gate, query/order contract, pagination, public shape
// ---------------------------------------------------------------------------

describe("ForumsService.listPosts (ST5: topic gate + pagination)", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  const makePublicBoard = () => ({
    id: "board-pub",
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
  });

  const makeTopicWithPublicBoard = () => ({
    id: "topic-1",
    boardId: "board-pub",
    authorUserId: "user-1",
    title: "Test Topic",
    slug: "test-topic",
    body: "Topic body",
    isPinned: false,
    isLocked: false,
    replyCount: 0,
    lastPostAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    board: makePublicBoard()
  });

  // ST5-GATE-a: nonexistent topic → TOPIC_NOT_FOUND_MESSAGE
  it("throws NotFoundException with TOPIC_NOT_FOUND_MESSAGE for nonexistent topic (ST5: listPosts gate)", async () => {
    const service = makeForumsService(undefined, undefined, { findOne: vi.fn().mockResolvedValue(null) });
    await expect(service.listPosts("topic-missing", {})).rejects.toThrow(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
  });

  // ST5-GATE-b: gated topic (board not readable) → IDENTICAL TOPIC_NOT_FOUND_MESSAGE
  it("throws IDENTICAL TOPIC_NOT_FOUND_MESSAGE for gated topic as for nonexistent (oracle parity)", async () => {
    const gatedTopic = { ...makeTopicWithPublicBoard(), board: { ...makePublicBoard(), visibility: "project-only" } };
    const gatedService = makeForumsService(undefined, undefined, { findOne: vi.fn().mockResolvedValue(gatedTopic) });
    const missingService = makeForumsService(undefined, undefined, { findOne: vi.fn().mockResolvedValue(null) });
    let gatedMsg = "";
    let missingMsg = "";
    try { await gatedService.listPosts("topic-gated", {}); } catch (e: unknown) { gatedMsg = (e as Error).message; }
    try { await missingService.listPosts("topic-missing", {}); } catch (e: unknown) { missingMsg = (e as Error).message; }
    expect(gatedMsg).toBe(missingMsg);
    expect(gatedMsg).toBe(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
  });

  // ST5: listPosts calls AuthorizationService.evaluate()
  it("calls AuthorizationService.evaluate() when topic is readable (ST5: spy asserted)", async () => {
    const authorizationService = new AuthorizationService();
    const evaluateSpy = vi.spyOn(authorizationService, "evaluate");

    const topicFindOneSpy = vi.fn().mockResolvedValue(makeTopicWithPublicBoard());
    const postFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = new ForumsService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      { ...createMinimalRepository(), findOne: topicFindOneSpy } as never,
      { ...createMinimalRepository(), findAndCount: postFindAndCountSpy } as never,
      authorizationService
    );
    await service.listPosts("topic-1", {});
    expect(evaluateSpy).toHaveBeenCalled();
  });

  // ST5-ORDER: listPosts passes { createdAt: 'ASC', id: 'ASC' } order to findAndCount
  it("passes oldest-first order { createdAt: ASC, id: ASC } to findAndCount (ST5: deterministic order)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeTopicWithPublicBoard());
    const postFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findAndCount: postFindAndCountSpy }
    );
    await service.listPosts("topic-1", {});
    expect(postFindAndCountSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { createdAt: "ASC", id: "ASC" }
      })
    );
  });

  // ST5-SOFTDELETE: listPosts includes deletedAt: IsNull() in where clause
  it("issues query with deletedAt: IsNull() in where clause (ST5: soft-delete exclusion regression guard)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeTopicWithPublicBoard());
    const postFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findAndCount: postFindAndCountSpy }
    );
    await service.listPosts("topic-1", {});
    const callArgs = postFindAndCountSpy.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArgs.where).toHaveProperty("deletedAt");
    expect(callArgs.where.deletedAt).toEqual(IsNull());
  });

  // ST5-PAGINATION: page=2, pageSize=5 → skip=5, take=5
  it("translates page=2, pageSize=5 into skip=5, take=5 (ST5: pagination offset)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeTopicWithPublicBoard());
    const postFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findAndCount: postFindAndCountSpy }
    );
    await service.listPosts("topic-1", { page: 2, pageSize: 5 });
    expect(postFindAndCountSpy).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 })
    );
  });

  // ST5-PAGINATION: pageSize=999 → clamped to 100
  it("clamps pageSize=999 to 100 (ST5: pageSize clamp)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeTopicWithPublicBoard());
    const postFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findAndCount: postFindAndCountSpy }
    );
    await service.listPosts("topic-1", { page: 1, pageSize: 999 });
    const callArgs = postFindAndCountSpy.mock.calls[0][0] as { take: number };
    expect(callArgs.take).toBe(100);
  });

  // ST5-PAGINATION: pageSize=0 → clamped to 1
  it("clamps pageSize=0 to 1 (ST5: pageSize minimum clamp)", async () => {
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeTopicWithPublicBoard());
    const postFindAndCountSpy = vi.fn().mockResolvedValue([[], 0]);
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findAndCount: postFindAndCountSpy }
    );
    await service.listPosts("topic-1", { page: 1, pageSize: 0 });
    const callArgs = postFindAndCountSpy.mock.calls[0][0] as { take: number };
    expect(callArgs.take).toBe(1);
  });

  // ST5-SHAPE: listPosts public shape strips authorUserId, topicId, deletedAt; exposes author/quotedPostId
  it("returned post shapes strip internal fields and expose author.username/displayName and quotedPostId (ST5: public shape)", async () => {
    const postEntity = {
      id: "post-list",
      topicId: "topic-SECRET",
      authorUserId: "user-SECRET",
      body: "Content",
      parentId: null,
      quotedPostId: "quoted-ref-55",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      author: { username: "listposter", displayName: "List Poster" }
    };
    const topicFindOneSpy = vi.fn().mockResolvedValue(makeTopicWithPublicBoard());
    const postFindAndCountSpy = vi.fn().mockResolvedValue([[postEntity], 1]);
    const service = makeForumsService(
      undefined, undefined,
      { findOne: topicFindOneSpy },
      { findAndCount: postFindAndCountSpy }
    );
    const result = await service.listPosts("topic-1", {});
    expect(result.posts).toHaveLength(1);
    const post = result.posts[0];
    expect(post).not.toHaveProperty("authorUserId");
    expect(post).not.toHaveProperty("topicId");
    expect(post).not.toHaveProperty("deletedAt");
    expect(post.author.username).toBe("listposter");
    expect(post.author.displayName).toBe("List Poster");
    expect(post.quotedPostId).toBe("quoted-ref-55");
  });
});

// ---------------------------------------------------------------------------
// TEST B (WARNING-1 fix validation): createTopic must reject missing/non-string
// title or body with BadRequestException (400), NOT a TypeError (500).
// save must NOT be called in these cases.
// ---------------------------------------------------------------------------

describe("ForumsService.createTopic (TEST B: WARNING-1 type-guard regression)", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  const makePublicBoard = () => ({
    id: "board-pub",
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
  });

  // Missing/undefined body → BadRequestException (400), save NOT called.
  it("throws BadRequestException (400) for undefined body — save NOT called", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { save: topicSaveSpy }
    );
    await expect(
      service.createTopic("user-1", { boardId: "board-pub", title: "Hello", body: undefined as never })
    ).rejects.toThrow(BadRequestException);
    expect(topicSaveSpy).not.toHaveBeenCalled();
  });

  // Non-string body (number 42) → BadRequestException (400), save NOT called.
  it("throws BadRequestException (400) for body=42 (number) — save NOT called", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { save: topicSaveSpy }
    );
    await expect(
      service.createTopic("user-1", { boardId: "board-pub", title: "Hello", body: 42 as never })
    ).rejects.toThrow(BadRequestException);
    expect(topicSaveSpy).not.toHaveBeenCalled();
  });

  // Non-string body (object {}) → BadRequestException (400), save NOT called.
  it("throws BadRequestException (400) for body={} (object) — save NOT called", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { save: topicSaveSpy }
    );
    await expect(
      service.createTopic("user-1", { boardId: "board-pub", title: "Hello", body: {} as never })
    ).rejects.toThrow(BadRequestException);
    expect(topicSaveSpy).not.toHaveBeenCalled();
  });

  // Missing/undefined title → BadRequestException (400), save NOT called.
  it("throws BadRequestException (400) for undefined title — save NOT called", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { save: topicSaveSpy }
    );
    await expect(
      service.createTopic("user-1", { boardId: "board-pub", title: undefined as never, body: "World" })
    ).rejects.toThrow(BadRequestException);
    expect(topicSaveSpy).not.toHaveBeenCalled();
  });

  // Non-string title (number 99) → BadRequestException (400), save NOT called.
  it("throws BadRequestException (400) for title=99 (number) — save NOT called", async () => {
    const boardFindOneSpy = vi.fn().mockResolvedValue(makePublicBoard());
    const topicSaveSpy = vi.fn();
    const service = makeForumsService(
      undefined,
      { findOne: boardFindOneSpy },
      { save: topicSaveSpy }
    );
    await expect(
      service.createTopic("user-1", { boardId: "board-pub", title: 99 as never, body: "World" })
    ).rejects.toThrow(BadRequestException);
    expect(topicSaveSpy).not.toHaveBeenCalled();
  });
});
