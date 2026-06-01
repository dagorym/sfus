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
  Req
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import type { NavigationItemEntity } from "./entities/navigation-item.entity";
import { navigationLinkTypes, navigationVisibilities } from "./entities/navigation-item.entity";
import type { CreateNavigationItemInput, UpdateNavigationItemInput } from "./navigation.service";
import { NavigationService } from "./navigation.service";

/**
 * NavigationController exposes admin-only CRUD endpoints for navigation items.
 *
 * GET /navigation/admin — list all items (admin)
 * POST /navigation/admin — create item (admin)
 * PATCH /navigation/admin/:id — update item (admin)
 * DELETE /navigation/admin/:id — delete item (admin)
 *
 * All admin routes require an active session AND the global "admin" role,
 * enforced via NavigationService.assertAdminManagementAccess().
 */
@ApiTags("navigation")
@Controller("navigation")
export class NavigationController {
  constructor(
    private readonly navigationService: NavigationService,
    private readonly authService: AuthService
  ) {}

  // ---------------------------------------------------------------------------
  // Public read routes — guest and authenticated access
  // ---------------------------------------------------------------------------

  @Get("items/public")
  @ApiOperation({ summary: "List public active navigation items (guest-accessible)." })
  @ApiOkResponse({ description: "Public active navigation items returned." })
  async listPublic(): Promise<{ items: NavigationItemDetail[] }> {
    const items = await this.navigationService.findPublic();
    return { items: items.map(toDetail) };
  }

  @Get("items/authenticated")
  @ApiOperation({ summary: "List all active navigation items (authenticated users)." })
  @ApiOkResponse({ description: "Active navigation items for authenticated users returned." })
  async listAuthenticated(): Promise<{ items: NavigationItemDetail[] }> {
    const items = await this.navigationService.findForAuthenticatedUser();
    return { items: items.map(toDetail) };
  }

  // ---------------------------------------------------------------------------
  // Admin management routes — require active session + admin role
  // ---------------------------------------------------------------------------

  @Get("admin")
  @ApiOperation({ summary: "List all navigation items regardless of visibility (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiOkResponse({ description: "All navigation items returned." })
  async adminListAll(@Req() request: Request): Promise<{ items: NavigationItemDetail[] }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.navigationService.assertAdminManagementAccess(session.user.globalRole);
    const items = await this.navigationService.findAll();
    return { items: items.map(toDetail) };
  }

  @Post("admin")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a new navigation item (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiBadRequestResponse({ description: "Invalid input." })
  async adminCreate(@Req() request: Request, @Body() body: unknown): Promise<{ item: NavigationItemDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.navigationService.assertAdminManagementAccess(session.user.globalRole);
    const input = parseCreateInput(body);
    const item = await this.navigationService.create(input);
    return { item: toDetail(item) };
  }

  @Patch("admin/:id")
  @ApiOperation({ summary: "Update a navigation item (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Navigation item not found." })
  @ApiBadRequestResponse({ description: "Invalid input." })
  async adminUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ): Promise<{ item: NavigationItemDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.navigationService.assertAdminManagementAccess(session.user.globalRole);
    const input = parseUpdateInput(body);
    const item = await this.navigationService.update(id, input);
    return { item: toDetail(item) };
  }

  @Delete("admin/:id")
  @ApiOperation({ summary: "Delete a navigation item (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Navigation item not found." })
  async adminDelete(@Req() request: Request, @Param("id") id: string): Promise<{ deleted: true }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.navigationService.assertAdminManagementAccess(session.user.globalRole);
    await this.navigationService.delete(id);
    return { deleted: true };
  }
}

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

interface NavigationItemDetail {
  id: string;
  parentId: string | null;
  label: string;
  linkType: string;
  url: string;
  visibility: string;
  sortOrder: number;
  isActive: boolean;
  children: NavigationItemDetail[];
  createdAt: string;
  updatedAt: string;
}

function toDetail(item: NavigationItemEntity): NavigationItemDetail {
  return {
    id: item.id,
    parentId: item.parentId,
    label: item.label,
    linkType: item.linkType,
    url: item.url,
    visibility: item.visibility,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    children: item.children ? item.children.map(toDetail) : [],
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

// ---------------------------------------------------------------------------
// Input parsers
// ---------------------------------------------------------------------------

function parseCreateInput(body: unknown): CreateNavigationItemInput {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.label !== "string" || !b.label.trim()) {
    throw new BadRequestException("label is required.");
  }
  if (typeof b.url !== "string" || !b.url.trim()) {
    throw new BadRequestException("url is required.");
  }
  if (b.linkType !== undefined && !(navigationLinkTypes as readonly string[]).includes(b.linkType as string)) {
    throw new BadRequestException(`linkType must be one of: ${navigationLinkTypes.join(", ")}.`);
  }
  if (b.visibility !== undefined && !(navigationVisibilities as readonly string[]).includes(b.visibility as string)) {
    throw new BadRequestException(`visibility must be one of: ${navigationVisibilities.join(", ")}.`);
  }
  return {
    label: b.label,
    url: b.url,
    linkType: b.linkType as CreateNavigationItemInput["linkType"],
    visibility: b.visibility as CreateNavigationItemInput["visibility"],
    sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : undefined,
    parentId: typeof b.parentId === "string" ? b.parentId : null
  };
}

function parseUpdateInput(body: unknown): UpdateNavigationItemInput {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const input: UpdateNavigationItemInput = {};
  if (b.label !== undefined) {
    if (typeof b.label !== "string") throw new BadRequestException("label must be a string.");
    input.label = b.label;
  }
  if (b.url !== undefined) {
    if (typeof b.url !== "string") throw new BadRequestException("url must be a string.");
    input.url = b.url;
  }
  if (b.linkType !== undefined) {
    if (!(navigationLinkTypes as readonly string[]).includes(b.linkType as string)) {
      throw new BadRequestException(`linkType must be one of: ${navigationLinkTypes.join(", ")}.`);
    }
    input.linkType = b.linkType as UpdateNavigationItemInput["linkType"];
  }
  if (b.visibility !== undefined) {
    if (!(navigationVisibilities as readonly string[]).includes(b.visibility as string)) {
      throw new BadRequestException(`visibility must be one of: ${navigationVisibilities.join(", ")}.`);
    }
    input.visibility = b.visibility as UpdateNavigationItemInput["visibility"];
  }
  if (b.sortOrder !== undefined) {
    if (typeof b.sortOrder !== "number") throw new BadRequestException("sortOrder must be a number.");
    input.sortOrder = b.sortOrder;
  }
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") throw new BadRequestException("isActive must be a boolean.");
    input.isActive = b.isActive;
  }
  if (b.parentId !== undefined) {
    input.parentId = b.parentId === null ? null : typeof b.parentId === "string" ? b.parentId : undefined;
  }
  return input;
}
