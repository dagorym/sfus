import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import type { CreateBlogPostInput, UpdateBlogPostInput } from "./blog.service";
import { BlogService } from "./blog.service";
import type { BlogPostEntity } from "./entities/blog-post.entity";

/**
 * BlogController exposes two access surfaces:
 *
 * 1. Public routes (GET /blog, GET /blog/:slug) — no authentication required;
 *    only published posts are returned.
 *
 * 2. Admin management routes (POST/PATCH/DELETE /blog/admin/**) — require an
 *    active session AND the global "admin" role enforced by BlogService.
 *    Authorization is delegated to BlogService.assertAdminManagementAccess() to
 *    keep gating in a single reusable location rather than duplicated inline.
 */
@ApiTags("blog")
@Controller("blog")
export class BlogController {
  constructor(
    private readonly blogService: BlogService,
    private readonly authService: AuthService
  ) {}

  // ---------------------------------------------------------------------------
  // Public routes — guest-accessible, published content only
  // ---------------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: "List all published blog posts (public)." })
  @ApiOkResponse({ description: "Published blog posts returned." })
  async listPublished(): Promise<{ posts: BlogPostSummary[] }> {
    const posts = await this.blogService.findPublished();
    return { posts: posts.map(toSummary) };
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get a single published blog post by slug (public)." })
  @ApiOkResponse({ description: "Published blog post returned." })
  @ApiNotFoundResponse({ description: "Post not found or not published." })
  async getPublishedBySlug(@Param("slug") slug: string): Promise<{ post: BlogPostDetail }> {
    const post = await this.blogService.findPublishedBySlug(slug);
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    return { post: toDetail(post) };
  }

  // ---------------------------------------------------------------------------
  // Admin management routes — require active session + admin role
  // ---------------------------------------------------------------------------

  @Get("admin/posts")
  @ApiOperation({ summary: "List all blog posts regardless of status (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  async adminListAll(@Req() request: Request): Promise<{ posts: BlogPostDetail[] }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    const posts = await this.blogService.findAll();
    return { posts: posts.map(toDetail) };
  }

  @Get("admin/posts/:id")
  @ApiOperation({ summary: "Get a single blog post by id (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  async adminGetById(@Req() request: Request, @Param("id") id: string): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    const post = await this.blogService.findById(id);
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    return { post: toDetail(post) };
  }

  @Post("admin/posts")
  @ApiOperation({ summary: "Create a new blog post in draft status (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiBadRequestResponse({ description: "Invalid input." })
  async adminCreate(@Req() request: Request, @Body() body: unknown): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    const input = parseCreateInput(body);
    const post = await this.blogService.create(session.user.id, input);
    return { post: toDetail(post) };
  }

  @Patch("admin/posts/:id")
  @ApiOperation({ summary: "Update a blog post (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  async adminUpdate(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    const input = parseUpdateInput(body);
    const post = await this.blogService.update(id, input);
    return { post: toDetail(post) };
  }

  @Post("admin/posts/:id/publish")
  @ApiOperation({ summary: "Publish a blog post immediately (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  async adminPublish(@Req() request: Request, @Param("id") id: string): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    const post = await this.blogService.publish(id);
    return { post: toDetail(post) };
  }

  @Post("admin/posts/:id/unpublish")
  @ApiOperation({ summary: "Unpublish a blog post (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  async adminUnpublish(@Req() request: Request, @Param("id") id: string): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    const post = await this.blogService.unpublish(id);
    return { post: toDetail(post) };
  }

  @Post("admin/posts/:id/schedule")
  @ApiOperation({ summary: "Schedule a blog post for future publication (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  @ApiBadRequestResponse({ description: "Invalid or past scheduledAt value." })
  async adminSchedule(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    const scheduledAt = parseScheduleInput(body);
    const post = await this.blogService.schedule(id, scheduledAt);
    return { post: toDetail(post) };
  }

  @Delete("admin/posts/:id")
  @ApiOperation({ summary: "Delete a blog post (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  async adminDelete(@Req() request: Request, @Param("id") id: string): Promise<{ deleted: true }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    await this.blogService.delete(id);
    return { deleted: true };
  }
}

// ---------------------------------------------------------------------------
// Response shape helpers
// ---------------------------------------------------------------------------

interface BlogPostSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  featuredImageId: string | null;
  tags: string[];
  createdAt: string;
}

interface BlogPostDetail extends BlogPostSummary {
  body: string;
  authorUserId: string;
  updatedAt: string;
}

function toSummary(post: BlogPostEntity): BlogPostSummary {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    status: post.status,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    featuredImageId: post.featuredImageId,
    tags: post.postTags ? post.postTags.map((t) => t.tag) : [],
    createdAt: post.createdAt.toISOString()
  };
}

function toDetail(post: BlogPostEntity): BlogPostDetail {
  return {
    ...toSummary(post),
    body: post.body,
    authorUserId: post.authorUserId,
    updatedAt: post.updatedAt.toISOString()
  };
}

// ---------------------------------------------------------------------------
// Input parsers — typed wrappers that throw BadRequestException on bad input
// ---------------------------------------------------------------------------

function parseCreateInput(body: unknown): CreateBlogPostInput {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) {
    throw new BadRequestException("title is required.");
  }
  if (typeof b.slug !== "string" || !b.slug.trim()) {
    throw new BadRequestException("slug is required.");
  }
  if (typeof b.body !== "string") {
    throw new BadRequestException("body is required.");
  }
  return {
    title: b.title,
    slug: b.slug,
    body: b.body,
    featuredImageId: typeof b.featuredImageId === "string" ? b.featuredImageId : null,
    tags: Array.isArray(b.tags) ? (b.tags as unknown[]).filter((t): t is string => typeof t === "string") : []
  };
}

function parseUpdateInput(body: unknown): UpdateBlogPostInput {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const input: UpdateBlogPostInput = {};
  if (b.title !== undefined) {
    if (typeof b.title !== "string") throw new BadRequestException("title must be a string.");
    input.title = b.title;
  }
  if (b.slug !== undefined) {
    if (typeof b.slug !== "string") throw new BadRequestException("slug must be a string.");
    input.slug = b.slug;
  }
  if (b.body !== undefined) {
    if (typeof b.body !== "string") throw new BadRequestException("body must be a string.");
    input.body = b.body;
  }
  if (b.featuredImageId !== undefined) {
    input.featuredImageId = typeof b.featuredImageId === "string" ? b.featuredImageId : null;
  }
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags)) throw new BadRequestException("tags must be an array.");
    input.tags = (b.tags as unknown[]).filter((t): t is string => typeof t === "string");
  }
  return input;
}

function parseScheduleInput(body: unknown): Date {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object with a scheduledAt field.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.scheduledAt !== "string") {
    throw new BadRequestException("scheduledAt must be an ISO 8601 UTC datetime string.");
  }
  const date = new Date(b.scheduledAt);
  if (isNaN(date.getTime())) {
    throw new BadRequestException("scheduledAt is not a valid datetime.");
  }
  return date;
}
