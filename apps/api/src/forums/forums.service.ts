import crypto from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { ForumCategoryEntity } from "./entities/forum-category.entity";
import { ForumBoardEntity } from "./entities/forum-board.entity";
import { forumBoardScopeTypes, forumBoardVisibilities } from "./forums.types";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  ReorderCategoryInput,
  CreateBoardInput,
  UpdateBoardInput,
  ReorderBoardInput
} from "./forums.types";

/**
 * ForumsService enforces admin-only site-wide management for forum categories
 * and boards (ST2). The authorization gate mirrors BlogService.assertAdminManagementAccess.
 */
@Injectable()
export class ForumsService {
  constructor(
    @InjectRepository(ForumCategoryEntity)
    private readonly categoryRepository: Repository<ForumCategoryEntity>,
    @InjectRepository(ForumBoardEntity)
    private readonly boardRepository: Repository<ForumBoardEntity>,
    private readonly authorizationService: AuthorizationService
  ) {}

  // ---------------------------------------------------------------------------
  // Authorization gate — must be called before any data operation.
  // ---------------------------------------------------------------------------

  /**
   * Asserts the caller holds the global admin role. Throws:
   * - `ForbiddenException` (403) when the session role is insufficient.
   *
   * Callers must already have resolved a live session (resolveSession throws 401
   * when there is no session, so this method sees only authenticated actors).
   */
  assertAdminManagementAccess(actorGlobalRole: string): void {
    if (!this.authorizationService.hasGlobalRole(actorGlobalRole, "admin")) {
      throw new ForbiddenException("Forum management requires the admin role.");
    }
  }

  // ---------------------------------------------------------------------------
  // Category management (admin-only)
  // ---------------------------------------------------------------------------

  /**
   * Returns all categories ordered by sortOrder ASC. Admin-only surface.
   * Caller must have verified admin access before calling this.
   */
  async findAllCategories(): Promise<ForumCategoryEntity[]> {
    return this.categoryRepository.find({
      order: { sortOrder: "ASC", createdAt: "ASC" },
      relations: ["boards"]
    });
  }

  /**
   * Returns a single category by id. Admin-only surface.
   * Caller must have verified admin access before calling this.
   */
  async findCategoryById(id: string): Promise<ForumCategoryEntity | null> {
    return this.categoryRepository.findOne({ where: { id }, relations: ["boards"] });
  }

  /**
   * Creates a new forum category.
   * Caller must have verified admin access before calling this.
   */
  async createCategory(input: CreateCategoryInput): Promise<ForumCategoryEntity> {
    this.assertCategoryNameValid(input.name);
    this.assertSlugValid(input.slug);

    const id = crypto.randomUUID();
    const category = this.categoryRepository.create({
      id,
      name: input.name.trim(),
      slug: input.slug.trim(),
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0
    });
    await this.categoryRepository.save(category);
    return this.categoryRepository.findOne({ where: { id }, relations: ["boards"] }) as Promise<ForumCategoryEntity>;
  }

  /**
   * Updates an existing category.
   * Caller must have verified admin access before calling this.
   */
  async updateCategory(id: string, input: UpdateCategoryInput): Promise<ForumCategoryEntity> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException("Forum category not found.");
    }

    if (input.name !== undefined) {
      this.assertCategoryNameValid(input.name);
      category.name = input.name.trim();
    }
    if (input.slug !== undefined) {
      this.assertSlugValid(input.slug);
      category.slug = input.slug.trim();
    }
    if (input.description !== undefined) {
      category.description = input.description;
    }
    if (input.sortOrder !== undefined) {
      category.sortOrder = input.sortOrder;
    }

    await this.categoryRepository.save(category);
    return this.categoryRepository.findOne({ where: { id }, relations: ["boards"] }) as Promise<ForumCategoryEntity>;
  }

  /**
   * Deletes a category. The category must have no boards (rejects with 400
   * if boards remain — avoids orphaned boards).
   * Caller must have verified admin access before calling this.
   */
  async deleteCategory(id: string): Promise<void> {
    const category = await this.categoryRepository.findOne({ where: { id }, relations: ["boards"] });
    if (!category) {
      throw new NotFoundException("Forum category not found.");
    }
    if (category.boards && category.boards.length > 0) {
      throw new BadRequestException("Cannot delete a category that still has boards. Delete or move the boards first.");
    }
    await this.categoryRepository.remove(category);
  }

  /**
   * Reorders categories by assigning sortOrder values based on the provided
   * ordered id list. Every existing category id must appear in the list.
   * Returns all categories in the new order.
   * Caller must have verified admin access before calling this.
   */
  async reorderCategories(input: ReorderCategoryInput): Promise<ForumCategoryEntity[]> {
    const existing = await this.categoryRepository.find({ order: { sortOrder: "ASC" } });
    const existingIds = new Set(existing.map((c) => c.id));

    if (input.orderedIds.length !== existing.length) {
      throw new BadRequestException("orderedIds must contain exactly one entry per existing category.");
    }
    for (const id of input.orderedIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(`Category id '${id}' not found.`);
      }
    }

    // Assign sortOrder by position in the provided list.
    const updates = input.orderedIds.map((id, index) => {
      const cat = existing.find((c) => c.id === id)!;
      cat.sortOrder = index;
      return cat;
    });
    await this.categoryRepository.save(updates);

    return this.categoryRepository.find({ order: { sortOrder: "ASC", createdAt: "ASC" }, relations: ["boards"] });
  }

  // ---------------------------------------------------------------------------
  // Board management (admin-only)
  // ---------------------------------------------------------------------------

  /**
   * Returns all boards within a category ordered by sortOrder ASC. Admin surface.
   * Caller must have verified admin access before calling this.
   */
  async findBoardsByCategoryId(categoryId: string): Promise<ForumBoardEntity[]> {
    return this.boardRepository.find({
      where: { categoryId },
      order: { sortOrder: "ASC", createdAt: "ASC" }
    });
  }

  /**
   * Returns a single board by id. Admin surface.
   * Caller must have verified admin access before calling this.
   */
  async findBoardById(id: string): Promise<ForumBoardEntity | null> {
    return this.boardRepository.findOne({ where: { id } });
  }

  /**
   * Creates a new forum board.
   * Caller must have verified admin access before calling this.
   */
  async createBoard(input: CreateBoardInput): Promise<ForumBoardEntity> {
    this.assertBoardNameValid(input.name);
    this.assertSlugValid(input.slug);

    // Validate enum values explicitly so invalid values return 400 before persistence.
    const scopeType = input.scopeType ?? "site";
    this.assertScopeTypeValid(scopeType);

    const visibility = input.visibility ?? "public";
    this.assertVisibilityValid(visibility);

    // Confirm the parent category exists.
    const category = await this.categoryRepository.findOne({ where: { id: input.categoryId } });
    if (!category) {
      throw new NotFoundException("Forum category not found.");
    }

    const id = crypto.randomUUID();
    const board = this.boardRepository.create({
      id,
      categoryId: input.categoryId,
      name: input.name.trim(),
      slug: input.slug.trim(),
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      scopeType,
      visibility,
      projectId: input.projectId ?? null
    });
    await this.boardRepository.save(board);
    return this.boardRepository.findOne({ where: { id } }) as Promise<ForumBoardEntity>;
  }

  /**
   * Updates an existing forum board.
   * Caller must have verified admin access before calling this.
   */
  async updateBoard(id: string, input: UpdateBoardInput): Promise<ForumBoardEntity> {
    const board = await this.boardRepository.findOne({ where: { id } });
    if (!board) {
      throw new NotFoundException("Forum board not found.");
    }

    if (input.categoryId !== undefined) {
      const category = await this.categoryRepository.findOne({ where: { id: input.categoryId } });
      if (!category) {
        throw new NotFoundException("Forum category not found.");
      }
      board.categoryId = input.categoryId;
    }
    if (input.name !== undefined) {
      this.assertBoardNameValid(input.name);
      board.name = input.name.trim();
    }
    if (input.slug !== undefined) {
      this.assertSlugValid(input.slug);
      board.slug = input.slug.trim();
    }
    if (input.description !== undefined) {
      board.description = input.description;
    }
    if (input.sortOrder !== undefined) {
      board.sortOrder = input.sortOrder;
    }
    if (input.scopeType !== undefined) {
      this.assertScopeTypeValid(input.scopeType);
      board.scopeType = input.scopeType;
    }
    if (input.visibility !== undefined) {
      this.assertVisibilityValid(input.visibility);
      board.visibility = input.visibility;
    }
    if (input.projectId !== undefined) {
      board.projectId = input.projectId;
    }

    await this.boardRepository.save(board);
    return this.boardRepository.findOne({ where: { id } }) as Promise<ForumBoardEntity>;
  }

  /**
   * Deletes a forum board.
   * Caller must have verified admin access before calling this.
   */
  async deleteBoard(id: string): Promise<void> {
    const board = await this.boardRepository.findOne({ where: { id } });
    if (!board) {
      throw new NotFoundException("Forum board not found.");
    }
    await this.boardRepository.remove(board);
  }

  /**
   * Reorders boards within a category by assigning sortOrder values based on the
   * provided ordered id list. Every board in the category must appear in the list.
   * Returns all boards in the category in the new order.
   * Caller must have verified admin access before calling this.
   */
  async reorderBoards(categoryId: string, input: ReorderBoardInput): Promise<ForumBoardEntity[]> {
    // Confirm category exists.
    const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
    if (!category) {
      throw new NotFoundException("Forum category not found.");
    }

    const existing = await this.boardRepository.find({ where: { categoryId }, order: { sortOrder: "ASC" } });
    const existingIds = new Set(existing.map((b) => b.id));

    if (input.orderedIds.length !== existing.length) {
      throw new BadRequestException("orderedIds must contain exactly one entry per board in this category.");
    }
    for (const id of input.orderedIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(`Board id '${id}' not found in this category.`);
      }
    }

    const boardsById = new Map(existing.map((b) => [b.id, b]));
    const updates = input.orderedIds.map((id, index) => {
      const board = boardsById.get(id)!;
      board.sortOrder = index;
      return board;
    });
    await this.boardRepository.save(updates);

    return this.boardRepository.find({ where: { categoryId }, order: { sortOrder: "ASC", createdAt: "ASC" } });
  }

  // ---------------------------------------------------------------------------
  // Private validation helpers
  // ---------------------------------------------------------------------------

  private assertCategoryNameValid(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException("Category name must not be empty.");
    }
  }

  private assertBoardNameValid(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException("Board name must not be empty.");
    }
  }

  private assertSlugValid(slug: string): void {
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      throw new BadRequestException(
        "Slug must be lowercase alphanumeric words separated by hyphens (e.g. 'my-category')."
      );
    }
  }

  private assertScopeTypeValid(scopeType: string): void {
    if (!(forumBoardScopeTypes as readonly string[]).includes(scopeType)) {
      throw new BadRequestException(
        `Invalid scopeType '${scopeType}'. Allowed values: ${forumBoardScopeTypes.join(", ")}.`
      );
    }
  }

  private assertVisibilityValid(visibility: string): void {
    if (!(forumBoardVisibilities as readonly string[]).includes(visibility)) {
      throw new BadRequestException(
        `Invalid visibility '${visibility}'. Allowed values: ${forumBoardVisibilities.join(", ")}.`
      );
    }
  }
}
