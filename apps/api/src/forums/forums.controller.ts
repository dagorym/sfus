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
  ReorderBoardInput
} from "./forums.types";

/**
 * ForumsController exposes the admin management surface for forum categories
 * and boards (ST2). All routes require an active session with the global "admin"
 * role enforced by ForumsService.assertAdminManagementAccess().
 *
 * Public read routes for categories and boards are in ST3.
 *
 * Error contract (uniform across all admin handlers):
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
