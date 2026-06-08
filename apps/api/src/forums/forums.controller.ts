import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { ForumsService } from "./forums.service";
import type { ForumCategoryEntity } from "./entities/forum-category.entity";
import type { ForumBoardEntity } from "./entities/forum-board.entity";
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
  PublicPostShape,
  PaginatedPostsShape,
  CreatePostInput
} from "./forums.types";

/**
 * ForumsController exposes:
 *
 * 1. **Public read routes (ST3/ST4)** — no authentication required:
 *    - `GET /forums/categories` — list categories with publicly-readable site boards only.
 *    - `GET /forums/boards/:id` — fetch a single publicly-readable site board.
 *    - `GET /forums/boards/:boardId/topics` — paginated topic list (isPinned DESC, lastPostAt DESC).
 *    All routes route every visibility decision through `AuthorizationService.evaluate()`.
 *    Hidden/nonexistent boards and topics return a uniform `404` (no existence oracle).
 *
 * 2. **Member-authenticated topic creation (ST4)**:
 *    - `POST /forums/boards/:boardId/topics` — create a topic within a readable board.
 *    Requires an active session (401). Board must be publicly readable (404 if not).
 *    Body is normalized (normalizeMarkdownBody) then validated (validateMarkdownBody)
 *    before persistence; unsafe Markdown returns 400.
 *
 * 3. **Posts — member create and public paginated read (ST5)**:
 *    - `POST /forums/topics/:topicId/posts` — create a post (reply) within an unlocked readable topic.
 *    Requires an active session (401). Board+topic must be publicly readable (404 if not).
 *    Locked topic returns 403. Invalid parentId (nonexistent, different topic, reply-to-reply) → 400.
 *    - `GET /forums/topics/:topicId/posts` — paginated post list (oldest-first, deletedAt excluded).
 *
 * 3. **Admin management routes (ST2)** — require active session + global "admin" role:
 *    Full CRUD for categories and boards, enforced by
 *    `ForumsService.assertAdminManagementAccess()`.
 *
 * Admin error contract (uniform across all admin handlers):
 * - 401 No active session (thrown by AuthService.resolveSession).
 * - 403 Caller's role is insufficient (thrown by assertAdminManagementAccess).
 * Both checks happen before any data operation.
 */
@ApiTags("forums")
@Controller("forums")
export class ForumsController {
  constructor(
    private readonly forumsService: ForumsService,
    private readonly authService: AuthService
  ) {}

  // ===========================================================================
  // Public read — Categories and boards (ST3)
  // ===========================================================================

  /**
   * List all forum categories with their publicly-readable site boards.
   *
   * Only `scope_type='site'` boards whose visibility is publicly readable (as
   * determined by `AuthorizationService.evaluate()` for an anonymous actor) are
   * included. Project-scoped or non-readable boards are excluded from output
   * **and** their counts are not reflected in the response.
   *
   * No authentication required.
   *
   * @returns 200 with `{ categories }` ordered by sortOrder ASC.
   */
  @Get("categories")
  @ApiOperation({ summary: "List all forum categories with their publicly-readable site boards." })
  @ApiOkResponse({
    description:
      "Categories returned. Only site-scoped, publicly-readable boards are included. " +
      "Project-scoped or non-readable boards are absent from output and counts."
  })
  async listPublicCategories(): Promise<{ categories: PublicCategoryShape[] }> {
    const categories = await this.forumsService.listPublicCategories();
    return { categories };
  }

  /**
   * Fetch a single publicly-readable site board by id.
   *
   * Returns `404` for both nonexistent boards and boards that exist but are
   * hidden (project-scoped or non-publicly-readable), using an **identical**
   * error message in both cases so callers cannot infer existence (oracle
   * parity; P12).
   *
   * No authentication required.
   *
   * @param id Board UUID.
   * @returns 200 with `{ board }`.
   * @throws 404 Board not found or not publicly accessible.
   */
  @Get("boards/:id")
  @ApiOperation({ summary: "Fetch a single publicly-readable site forum board by id." })
  @ApiOkResponse({ description: "Board returned." })
  @ApiNotFoundResponse({
    description:
      "Board not found, or is not publicly accessible. " +
      "The error message is identical for nonexistent and hidden boards (oracle parity)."
  })
  async getPublicBoard(@Param("id") id: string): Promise<{ board: PublicBoardShape }> {
    const board = await this.forumsService.getPublicBoard(id);
    return { board };
  }

  // ===========================================================================
  // Topics — public read and member-authenticated creation (ST4)
  // ===========================================================================

  /**
   * List topics in a publicly-readable board, paginated.
   *
   * Pinned topics always sort first, then by `lastPostAt DESC` (most-recently
   * active), then `createdAt DESC`. Only non-deleted topics are returned.
   *
   * Returns `404` when the board does not exist **or** is not publicly
   * readable (oracle parity; P12).
   *
   * No authentication required.
   *
   * @param boardId Board UUID.
   * @param page 1-indexed page number (default 1).
   * @param pageSize Number of topics per page (default 20, max 100).
   * @returns 200 with `{ topics, total, page, pageSize }`.
   * @throws 404 Board not found or not publicly accessible.
   */
  @Get("boards/:boardId/topics")
  @ApiOperation({ summary: "List paginated topics in a publicly-readable board (isPinned DESC, lastPostAt DESC)." })
  @ApiOkResponse({
    description:
      "Paginated topic list. Pinned topics first, then by most-recently active. " +
      "Author shape exposes only username/displayName."
  })
  @ApiNotFoundResponse({
    description:
      "Board not found, or is not publicly accessible. " +
      "The error message is identical for nonexistent and hidden boards (oracle parity)."
  })
  async listTopics(
    @Param("boardId") boardId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): Promise<PaginatedTopicsShape> {
    return this.forumsService.listTopics(boardId, {
      page: page !== undefined ? parseInt(page, 10) : undefined,
      pageSize: pageSize !== undefined ? parseInt(pageSize, 10) : undefined
    });
  }

  /**
   * Create a new topic in a publicly-readable board.
   *
   * Requires an active session (`401` otherwise). The target board must be
   * publicly readable — a non-readable or nonexistent board returns `404`
   * with the same message as a truly nonexistent board (oracle parity; P12).
   *
   * The body is run through `normalizeMarkdownBody` then `validateMarkdownBody`
   * before persistence; unsafe Markdown is rejected with `400` before any DB write.
   *
   * @param boardId Board UUID.
   * @body `{ title, body }`
   * @returns 201 with `{ topic }`.
   * @throws 400 Empty title, title too long, or unsafe Markdown in body.
   * @throws 401 No active session.
   * @throws 404 Board not found or not publicly accessible (uniform message).
   */
  @Post("boards/:boardId/topics")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a topic in a readable board (member-authenticated)." })
  @ApiCreatedResponse({
    description: "Topic created. Author shape exposes only username/displayName."
  })
  @ApiBadRequestResponse({
    description: "Empty or too-long title, or unsafe Markdown content in body (rejected before persistence)."
  })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiNotFoundResponse({
    description:
      "Board not found, or is not publicly accessible. " +
      "The error message is identical for nonexistent and hidden boards (oracle parity)."
  })
  async createTopic(
    @Req() request: Request,
    @Param("boardId") boardId: string,
    @Body() body: Omit<CreateTopicInput, "boardId">
  ): Promise<{ topic: PublicTopicShape }> {
    // 401 check must happen before any data operation.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    const topic = await this.forumsService.createTopic(session.user.id, { boardId, ...body });
    return { topic };
  }

  // ===========================================================================
  // Posts — public paginated read and member-authenticated creation (ST5)
  // ===========================================================================

  /**
   * List posts in a topic, paginated, oldest-first.
   *
   * Only non-deleted posts are returned. The board and topic must both be publicly
   * readable — a non-readable or nonexistent board/topic returns `404` with the same
   * message as a truly nonexistent topic (oracle parity; P12).
   *
   * No authentication required.
   *
   * @param topicId Topic UUID.
   * @param page 1-indexed page number (default 1).
   * @param pageSize Number of posts per page (default 20, max 100).
   * @returns 200 with `{ posts, total, page, pageSize }`.
   * @throws 404 Topic not found or not publicly accessible.
   */
  @Get("topics/:topicId/posts")
  @ApiOperation({ summary: "List paginated posts in a topic (oldest-first)." })
  @ApiOkResponse({
    description:
      "Paginated post list, oldest-first. " +
      "Author shape exposes only username/displayName."
  })
  @ApiNotFoundResponse({
    description:
      "Topic not found, or its board is not publicly accessible. " +
      "The error message is identical for nonexistent and hidden cases (oracle parity)."
  })
  async listPosts(
    @Param("topicId") topicId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): Promise<PaginatedPostsShape> {
    return this.forumsService.listPosts(topicId, {
      page: page !== undefined ? parseInt(page, 10) : undefined,
      pageSize: pageSize !== undefined ? parseInt(pageSize, 10) : undefined
    });
  }

  /**
   * Create a new post (reply) in a readable, unlocked topic.
   *
   * Requires an active session (`401` otherwise). The board and topic must be
   * publicly readable — a non-readable or nonexistent board/topic returns `404`
   * with the same message as a truly nonexistent topic (oracle parity; P12).
   *
   * Locked topics return `403` (thread-locked). Invalid `parentId` (nonexistent,
   * different topic, or reply-to-a-reply) returns `400` with no existence oracle.
   *
   * The body is run through `normalizeMarkdownBody` then `validateMarkdownBody`
   * before persistence; unsafe Markdown is rejected with `400`.
   *
   * @param topicId Topic UUID.
   * @body `{ body, parentId?, quotedPostId? }`
   * @returns 201 with `{ post }`.
   * @throws 400 Unsafe Markdown, non-string body, or invalid parentId.
   * @throws 401 No active session.
   * @throws 403 Topic is locked.
   * @throws 404 Topic or board not found or not publicly accessible (uniform message).
   */
  @Post("topics/:topicId/posts")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a post (reply) in a readable, unlocked topic (member-authenticated)." })
  @ApiCreatedResponse({
    description: "Post created. Author shape exposes only username/displayName."
  })
  @ApiBadRequestResponse({
    description: "Non-string body, unsafe Markdown, or invalid parentId (uniform 400, no existence oracle)."
  })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Topic is locked." })
  @ApiNotFoundResponse({
    description:
      "Topic or board not found, or not publicly accessible. " +
      "The error message is identical for nonexistent and hidden cases (oracle parity)."
  })
  async createPost(
    @Req() request: Request,
    @Param("topicId") topicId: string,
    @Body() body: Omit<CreatePostInput, "topicId">
  ): Promise<{ post: PublicPostShape }> {
    // 401 check must happen before any data operation.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    const post = await this.forumsService.createPost(session.user.id, { topicId, ...body });
    return { post };
  }

  // ===========================================================================
  // Admin — Category management
  // ===========================================================================

  /**
   * List all forum categories with their boards.
   *
   * @returns 200 with `{ categories }` list ordered by sortOrder ASC.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   */
  @Get("admin/categories")
  @ApiOperation({ summary: "List all forum categories (admin)." })
  @ApiOkResponse({ description: "All categories returned ordered by sortOrder." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  async adminListCategories(@Req() request: Request): Promise<{ categories: ForumCategoryEntity[] }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    const categories = await this.forumsService.findAllCategories();
    return { categories };
  }

  /**
   * Get a single forum category by id.
   *
   * @param id Category UUID.
   * @returns 200 with `{ category }`.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   * @throws 404 Category not found.
   */
  @Get("admin/categories/:id")
  @ApiOperation({ summary: "Get a forum category by id (admin)." })
  @ApiOkResponse({ description: "Category returned." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Category not found." })
  async adminGetCategory(
    @Req() request: Request,
    @Param("id") id: string
  ): Promise<{ category: ForumCategoryEntity }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    const category = await this.forumsService.findCategoryById(id);
    if (!category) {
      throw new NotFoundException("Forum category not found.");
    }
    return { category };
  }

  /**
   * Create a new forum category.
   *
   * @body `{ name, slug, description?, sortOrder? }`
   * @returns 201 with `{ category }`.
   * @throws 400 Invalid input (name/slug empty or malformed).
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   */
  @Post("admin/categories")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a forum category (admin)." })
  @ApiCreatedResponse({ description: "Category created." })
  @ApiBadRequestResponse({ description: "Invalid input." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  async adminCreateCategory(
    @Req() request: Request,
    @Body() body: CreateCategoryInput
  ): Promise<{ category: ForumCategoryEntity }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    const category = await this.forumsService.createCategory(body);
    return { category };
  }

  /**
   * Update an existing forum category.
   *
   * @param id Category UUID.
   * @body Partial `{ name?, slug?, description?, sortOrder? }`
   * @returns 200 with `{ category }`.
   * @throws 400 Invalid input.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   * @throws 404 Category not found.
   */
  @Patch("admin/categories/:id")
  @ApiOperation({ summary: "Update a forum category (admin)." })
  @ApiOkResponse({ description: "Category updated." })
  @ApiBadRequestResponse({ description: "Invalid input." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Category not found." })
  async adminUpdateCategory(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: UpdateCategoryInput
  ): Promise<{ category: ForumCategoryEntity }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    const category = await this.forumsService.updateCategory(id, body);
    return { category };
  }

  /**
   * Delete a forum category.
   * The category must have no boards; otherwise returns 400.
   *
   * @param id Category UUID.
   * @returns 204 No Content on success.
   * @throws 400 Category still has boards.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   * @throws 404 Category not found.
   */
  @Delete("admin/categories/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a forum category (admin)." })
  @ApiNoContentResponse({ description: "Category deleted." })
  @ApiBadRequestResponse({ description: "Category still has boards." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Category not found." })
  async adminDeleteCategory(@Req() request: Request, @Param("id") id: string): Promise<void> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    await this.forumsService.deleteCategory(id);
  }

  /**
   * Reorder forum categories.
   * All existing category ids must appear in `orderedIds`; the position in the
   * array becomes the sortOrder (0-indexed). The response contains all categories
   * in the new order.
   *
   * @body `{ orderedIds: string[] }`
   * @returns 200 with `{ categories }` in deterministic sortOrder order.
   * @throws 400 Mismatch between orderedIds and existing categories.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   */
  @Put("admin/categories/reorder")
  @ApiOperation({ summary: "Reorder all forum categories (admin)." })
  @ApiOkResponse({ description: "Categories reordered; full list returned in new order." })
  @ApiBadRequestResponse({ description: "orderedIds does not match the set of existing categories." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  async adminReorderCategories(
    @Req() request: Request,
    @Body() body: ReorderCategoryInput
  ): Promise<{ categories: ForumCategoryEntity[] }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    if (!Array.isArray(body.orderedIds)) {
      throw new BadRequestException("orderedIds must be an array.");
    }
    const categories = await this.forumsService.reorderCategories(body);
    return { categories };
  }

  // ===========================================================================
  // Admin — Board management
  // ===========================================================================

  /**
   * List all boards in a category.
   *
   * @param categoryId Category UUID.
   * @returns 200 with `{ boards }` ordered by sortOrder ASC.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   * @throws 404 Category not found.
   */
  @Get("admin/categories/:categoryId/boards")
  @ApiOperation({ summary: "List all boards in a category (admin)." })
  @ApiOkResponse({ description: "Boards returned ordered by sortOrder." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Category not found." })
  async adminListBoards(
    @Req() request: Request,
    @Param("categoryId") categoryId: string
  ): Promise<{ boards: ForumBoardEntity[] }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    const boards = await this.forumsService.findBoardsByCategoryId(categoryId);
    return { boards };
  }

  /**
   * Get a single board by id.
   *
   * @param id Board UUID.
   * @returns 200 with `{ board }`.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   * @throws 404 Board not found.
   */
  @Get("admin/boards/:id")
  @ApiOperation({ summary: "Get a forum board by id (admin)." })
  @ApiOkResponse({ description: "Board returned." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Board not found." })
  async adminGetBoard(
    @Req() request: Request,
    @Param("id") id: string
  ): Promise<{ board: ForumBoardEntity }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    const board = await this.forumsService.findBoardById(id);
    if (!board) {
      throw new NotFoundException("Forum board not found.");
    }
    return { board };
  }

  /**
   * Create a new forum board.
   *
   * Scope and visibility values must be from the allowed vocabularies:
   * - `scopeType`: `site` | `project` (default: `site`)
   * - `visibility`: `public` | `unlisted` | `members` | `project-only` | `private` (default: `public`)
   *
   * @body `{ categoryId, name, slug, description?, sortOrder?, scopeType?, visibility?, projectId? }`
   * @returns 201 with `{ board }`.
   * @throws 400 Invalid input or unrecognised scopeType/visibility.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   * @throws 404 Category not found.
   */
  @Post("admin/boards")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a forum board (admin)." })
  @ApiCreatedResponse({ description: "Board created." })
  @ApiBadRequestResponse({
    description: "Invalid input, or unrecognised scopeType/visibility value."
  })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Category not found." })
  async adminCreateBoard(
    @Req() request: Request,
    @Body() body: CreateBoardInput
  ): Promise<{ board: ForumBoardEntity }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    const board = await this.forumsService.createBoard(body);
    return { board };
  }

  /**
   * Update an existing forum board.
   *
   * @param id Board UUID.
   * @body Partial `{ categoryId?, name?, slug?, description?, sortOrder?, scopeType?, visibility?, projectId? }`
   * @returns 200 with `{ board }`.
   * @throws 400 Invalid input or unrecognised scopeType/visibility value.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   * @throws 404 Board or category not found.
   */
  @Patch("admin/boards/:id")
  @ApiOperation({ summary: "Update a forum board (admin)." })
  @ApiOkResponse({ description: "Board updated." })
  @ApiBadRequestResponse({
    description: "Invalid input, or unrecognised scopeType/visibility value."
  })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Board or category not found." })
  async adminUpdateBoard(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: UpdateBoardInput
  ): Promise<{ board: ForumBoardEntity }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    const board = await this.forumsService.updateBoard(id, body);
    return { board };
  }

  /**
   * Delete a forum board.
   *
   * @param id Board UUID.
   * @returns 204 No Content on success.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   * @throws 404 Board not found.
   */
  @Delete("admin/boards/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a forum board (admin)." })
  @ApiNoContentResponse({ description: "Board deleted." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Board not found." })
  async adminDeleteBoard(@Req() request: Request, @Param("id") id: string): Promise<void> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    await this.forumsService.deleteBoard(id);
  }

  /**
   * Reorder boards within a category.
   * All board ids in the category must appear in `orderedIds`; the position
   * becomes the sortOrder (0-indexed). Returns all boards in the category in
   * the new order.
   *
   * @param categoryId Category UUID.
   * @body `{ orderedIds: string[] }`
   * @returns 200 with `{ boards }` in deterministic sortOrder order.
   * @throws 400 Mismatch between orderedIds and boards in the category.
   * @throws 401 No active session.
   * @throws 403 Admin role required.
   * @throws 404 Category not found.
   */
  @Put("admin/categories/:categoryId/boards/reorder")
  @ApiOperation({ summary: "Reorder boards within a category (admin)." })
  @ApiOkResponse({ description: "Boards reordered; full list returned in new order." })
  @ApiBadRequestResponse({ description: "orderedIds does not match the boards in this category." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Category not found." })
  async adminReorderBoards(
    @Req() request: Request,
    @Param("categoryId") categoryId: string,
    @Body() body: ReorderBoardInput
  ): Promise<{ boards: ForumBoardEntity[] }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.forumsService.assertAdminManagementAccess(session.user.globalRole);
    if (!Array.isArray(body.orderedIds)) {
      throw new BadRequestException("orderedIds must be an array.");
    }
    const boards = await this.forumsService.reorderBoards(categoryId, body);
    return { boards };
  }
}
