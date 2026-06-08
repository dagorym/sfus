import crypto from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { normalizeMarkdownBody, validateMarkdownBody } from "../media/markdown-sanitizer";
import { ForumCategoryEntity } from "./entities/forum-category.entity";
import { ForumBoardEntity } from "./entities/forum-board.entity";
import { ForumTopicEntity } from "./entities/forum-topic.entity";
import { forumBoardScopeTypes, forumBoardVisibilities } from "./forums.types";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  ReorderCategoryInput,
  CreateBoardInput,
  UpdateBoardInput,
  ReorderBoardInput,
  PublicBoardShape,
  PublicCategoryShape,
  PublicTopicShape,
  PaginatedTopicsShape,
  CreateTopicInput,
  TopicListQuery,
  PublicAuthorShape
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
    @InjectRepository(ForumTopicEntity)
    private readonly topicRepository: Repository<ForumTopicEntity>,
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
  // Public read — categories and boards (ST3)
  // ---------------------------------------------------------------------------

  /**
   * The uniform "not found" message used for both nonexistent and hidden boards.
   * Using a constant guarantees oracle parity (hidden == nonexistent in error shape).
   */
  static readonly BOARD_NOT_FOUND_MESSAGE = "Forum board not found.";

  /**
   * Anonymous actor used for public (unauthenticated) visibility evaluation.
   * Passing no userId and an empty-string role means only open-visibility
   * resources (public / unlisted) will be allowed by evaluate().
   */
  private readonly anonymousActor = { userId: null as null, globalRole: "" };

  /**
   * Returns true when the given board is readable by an unauthenticated guest
   * **and** has scopeType='site'. Both conditions must hold for the board to
   * appear in the public forum index.
   *
   * All visibility decisions are routed through AuthorizationService.evaluate()
   * — no inline re-derived predicates.
   */
  isBoardPubliclyReadable(board: ForumBoardEntity): boolean {
    if (board.scopeType !== "site") {
      return false;
    }
    const decision = this.authorizationService.evaluate({
      actor: this.anonymousActor,
      resource: {
        resourceType: "forum_board",
        resourceId: board.id,
        visibility: board.visibility,
        projectId: board.projectId
      },
      action: "read"
    });
    return decision.allowed;
  }

  /**
   * Maps a ForumBoardEntity to the public-safe PublicBoardShape DTO.
   * Strips internal-only fields (scopeType, projectId, categoryId FK).
   */
  private toBoardShape(board: ForumBoardEntity): PublicBoardShape {
    return {
      id: board.id,
      name: board.name,
      slug: board.slug,
      description: board.description,
      sortOrder: board.sortOrder,
      visibility: board.visibility,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt
    };
  }

  /**
   * Returns all forum categories with their publicly-readable site boards,
   * ordered by category sortOrder ASC. Only site-scoped boards whose visibility
   * passes AuthorizationService.evaluate() for an anonymous actor are included.
   *
   * Project-scoped boards and boards whose visibility is not publicly readable
   * are excluded from both the board list and the board count.
   */
  async listPublicCategories(): Promise<PublicCategoryShape[]> {
    const categories = await this.categoryRepository.find({
      order: { sortOrder: "ASC", createdAt: "ASC" },
      relations: ["boards"]
    });

    return categories.map((category) => {
      const visibleBoards = (category.boards ?? [])
        .filter((board) => this.isBoardPubliclyReadable(board))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        sortOrder: category.sortOrder,
        boards: visibleBoards.map((b) => this.toBoardShape(b)),
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      };
    });
  }

  /**
   * Returns a single publicly-readable site board by id.
   *
   * Returns NotFoundException (404) in two cases:
   * 1. No board with the given id exists.
   * 2. The board exists but is not publicly readable (hidden by scope or visibility).
   *
   * Both cases return the same message — BOARD_NOT_FOUND_MESSAGE — so callers
   * cannot distinguish existence from access (oracle parity, P12).
   *
   * Visibility is evaluated via AuthorizationService.evaluate() — no inline predicate.
   */
  async getPublicBoard(id: string): Promise<PublicBoardShape> {
    const board = await this.boardRepository.findOne({ where: { id } });
    if (!board || !this.isBoardPubliclyReadable(board)) {
      throw new NotFoundException(ForumsService.BOARD_NOT_FOUND_MESSAGE);
    }
    return this.toBoardShape(board);
  }

  // ---------------------------------------------------------------------------
  // Topics — create and paginated read (ST4)
  // ---------------------------------------------------------------------------

  /**
   * The uniform "not found" message used for both nonexistent and hidden topics.
   * Identical structure to BOARD_NOT_FOUND_MESSAGE for oracle parity (P12).
   */
  static readonly TOPIC_NOT_FOUND_MESSAGE = "Forum topic not found.";

  /**
   * Maps a ForumTopicEntity (with loaded `author` relation) to the public-safe
   * PublicTopicShape DTO. Strips internal-only fields (authorUserId FK,
   * boardId, movedBy/lockedBy audit fields, deletedAt, isLocked).
   */
  private toTopicShape(topic: ForumTopicEntity & { author: { username: string; displayName: string | null } }): PublicTopicShape {
    const author: PublicAuthorShape = {
      username: topic.author.username,
      displayName: topic.author.displayName
    };
    return {
      id: topic.id,
      title: topic.title,
      slug: topic.slug,
      body: topic.body,
      isPinned: topic.isPinned,
      replyCount: topic.replyCount,
      lastPostAt: topic.lastPostAt,
      author,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt
    };
  }

  /**
   * Creates a new forum topic within a board, authenticated as `authorUserId`.
   *
   * Security contract:
   * - The board must exist **and** be publicly readable (isBoardPubliclyReadable).
   *   Non-readable or nonexistent boards return TOPIC_NOT_FOUND_MESSAGE (oracle parity).
   * - Body is normalized then validated before persistence; unsafe content returns 400.
   * - The caller must already hold an active session (controller resolves session
   *   and passes the user id — 401 happens at the controller layer before this call).
   */
  async createTopic(
    authorUserId: string,
    input: CreateTopicInput
  ): Promise<PublicTopicShape> {
    // Board lookup + visibility gate (oracle-parity: nonexistent === gated → 404).
    const board = await this.boardRepository.findOne({ where: { id: input.boardId } });
    if (!board || !this.isBoardPubliclyReadable(board)) {
      throw new NotFoundException(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
    }

    // Input validation.
    this.assertTopicTitleValid(input.title);

    // Markdown sanitization — normalize then validate before any persistence.
    const normalizedBody = normalizeMarkdownBody(input.body);
    const validation = validateMarkdownBody(normalizedBody);
    if (!validation.safe) {
      throw new BadRequestException(`Unsafe Markdown content rejected. ${validation.reason ?? ""}`);
    }

    const slug = this.generateTopicSlug(input.title);
    const id = crypto.randomUUID();

    const topic = this.topicRepository.create({
      id,
      boardId: input.boardId,
      authorUserId,
      title: input.title.trim(),
      slug,
      body: normalizedBody,
      isPinned: false,
      isLocked: false,
      replyCount: 0,
      lastPostAt: null,
      movedByUserId: null,
      movedAt: null,
      lockedByUserId: null,
      lockedAt: null,
      deletedAt: null
    });
    await this.topicRepository.save(topic);

    // Reload with author relation for the public shape.
    const saved = await this.topicRepository.findOne({
      where: { id },
      relations: ["author"]
    });
    if (!saved) {
      // Should never happen immediately after a successful save.
      throw new NotFoundException(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
    }
    return this.toTopicShape(saved as ForumTopicEntity & { author: { username: string; displayName: string | null } });
  }

  /**
   * Returns a paginated list of publicly-visible topics in a board.
   *
   * Security contract:
   * - The board must exist **and** be publicly readable (oracle parity, P12).
   * - Only non-deleted topics (deletedAt IS NULL) are returned.
   * - Deterministic order: isPinned DESC, then lastPostAt DESC (nulls last),
   *   then createdAt DESC.
   *
   * Pagination contract:
   * - page is 1-indexed; pageSize defaults to 20; max pageSize is 100.
   * - Returns total count for stable pagination across pages.
   */
  async listTopics(boardId: string, query: TopicListQuery): Promise<PaginatedTopicsShape> {
    // Board lookup + visibility gate (oracle-parity: nonexistent === gated → 404).
    const board = await this.boardRepository.findOne({ where: { id: boardId } });
    if (!board || !this.isBoardPubliclyReadable(board)) {
      throw new NotFoundException(ForumsService.TOPIC_NOT_FOUND_MESSAGE);
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const [topics, total] = await this.topicRepository.findAndCount({
      where: { boardId, deletedAt: IsNull() },
      relations: ["author"],
      order: {
        isPinned: "DESC",
        lastPostAt: "DESC",
        createdAt: "DESC"
      },
      skip,
      take: pageSize
    });

    return {
      topics: topics.map((t) =>
        this.toTopicShape(t as ForumTopicEntity & { author: { username: string; displayName: string | null } })
      ),
      total,
      page,
      pageSize
    };
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

  private assertTopicTitleValid(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new BadRequestException("Topic title must not be empty.");
    }
    if (title.trim().length > 255) {
      throw new BadRequestException("Topic title must not exceed 255 characters.");
    }
  }

  /**
   * Generates a URL-safe slug from a topic title.
   * Lowercases, replaces non-alphanumeric runs with hyphens, trims hyphens.
   * Truncates to 200 characters to stay within the varchar(255) column.
   */
  private generateTopicSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200);
  }
}
