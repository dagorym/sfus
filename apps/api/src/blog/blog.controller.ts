import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
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
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { exceedsLinkLimit } from "../common/throttle/link-limit";
import { ThrottleService } from "../common/throttle/throttle.service";
import type { ThrottleConfig } from "../common/throttle/throttle.types";
import { THROTTLE_CONFIG } from "../common/throttle/throttle.types";
import { UsersService } from "../users/users.service";
import type { CreateBlogPostInput, UpdateBlogPostInput, CreateCommentInput } from "./blog.service";
import { BlogService } from "./blog.service";
import type { BlogPostEntity } from "./entities/blog-post.entity";
import type { BlogCommentEntity, BlogCommentStatus } from "./entities/blog-comment.entity";
import { blogCommentStatuses } from "./entities/blog-comment.entity";

/** Route label for blog comment creation throttle key. */
const THROTTLE_LABEL_BLOG_COMMENT = "blog-comment-create";

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
 *
 * 3. Comment creation (POST /blog/:postId/comments) — requires an authenticated
 *    session; rate-limited (ST9) using the ST8 ThrottleService with the new-account
 *    tier active. Bodies exceeding the link cap are rejected (400).
 */
@ApiTags("blog")
@Controller("blog")
export class BlogController {
  constructor(
    private readonly blogService: BlogService,
    private readonly authService: AuthService,
    private readonly throttleService: ThrottleService,
    private readonly usersService: UsersService,
    @Inject(THROTTLE_CONFIG) private readonly throttleConfig: ThrottleConfig
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

  @Post("admin/posts/:id/publish-at")
  @ApiOperation({ summary: "Schedule a blog post for future publication (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  @ApiBadRequestResponse({ description: "Invalid or missing publishedAt datetime." })
  async adminPublishAt(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    const publishedAt = parsePublishAtInput(body);
    const post = await this.blogService.publishAt(id, publishedAt);
    return { post: toDetail(post) };
  }

  @Post("admin/posts/:id/toggle-featured")
  @ApiOperation({ summary: "Toggle pin/featured state of a blog post (admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  async adminToggleFeatured(@Req() request: Request, @Param("id") id: string): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertAdminManagementAccess(session.user.globalRole);
    const post = await this.blogService.toggleFeatured(id);
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

  /**
   * Locks the comment thread for a post, preventing any new comments from being
   * created. Requires moderator or admin role. Returns the updated post detail.
   */
  @Post("admin/posts/:id/lock-comments")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Lock comments on a blog post — prevents new comments (admin/moderator)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  async adminLockComments(@Req() request: Request, @Param("id") id: string): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertModerationAccess(session.user.globalRole);
    const post = await this.blogService.lockComments(id);
    return { post: toDetail(post) };
  }

  /**
   * Unlocks the comment thread for a post, re-enabling new comment creation.
   * Requires moderator or admin role. Returns the updated post detail.
   */
  @Post("admin/posts/:id/unlock-comments")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unlock comments on a blog post — re-enables new comments (admin/moderator)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  async adminUnlockComments(@Req() request: Request, @Param("id") id: string): Promise<{ post: BlogPostDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertModerationAccess(session.user.globalRole);
    const post = await this.blogService.unlockComments(id);
    return { post: toDetail(post) };
  }

  // ---------------------------------------------------------------------------
  // Public comment route — guest-accessible, visible comments only
  // ---------------------------------------------------------------------------

  @Get(":postId/comments")
  @ApiOperation({ summary: "List visible comments for a published post (public)." })
  @ApiOkResponse({ description: "Visible comments returned. Response omits moderation-internal fields (authorUserId, moderatedByUserId, moderatedAt)." })
  @ApiNotFoundResponse({ description: "Post not found or not published." })
  async listComments(@Param("postId") postId: string): Promise<{ comments: PublicBlogCommentDetail[]; commentsLocked: boolean }> {
    // Verify the post exists and is publicly visible (status=published AND publishedAt<=now)
    // before exposing any comments. The UUID fallback uses findPublishedById so that
    // future-scheduled posts addressed by id are treated identically to those addressed
    // by slug — both return 404 until their publishedAt time is reached.
    const post = await this.blogService.findPublishedBySlug(postId) ??
      await this.blogService.findPublishedById(postId);
    if (!post) {
      throw new NotFoundException("Blog post not found or not published.");
    }
    const allVisible = await this.blogService.findVisibleComments(post.id);
    // Only surface top-level comments in the list; replies are nested inside.
    const topLevel = allVisible.filter((c) => c.parentId === null);
    return { comments: topLevel.map(toPublicCommentDetailWithReplies), commentsLocked: post.commentsLocked ?? false };
  }

  // ---------------------------------------------------------------------------
  // Member comment creation — requires authenticated session (any role)
  // ---------------------------------------------------------------------------

  @Post(":postId/comments")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a comment on a published post (authenticated member)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Comments are locked on this post." })
  @ApiBadRequestResponse({ description: "Invalid or unsafe comment body, too many links, or invalid parentId/imageId reference." })
  @ApiNotFoundResponse({ description: "Post not found or not published." })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded. Retry after the indicated delay." })
  async createComment(
    @Req() request: Request,
    @Param("postId") postId: string,
    @Body() body: unknown
  ): Promise<{ comment: PublicBlogCommentDetail }> {
    // 401 check must happen before any data operation (auth gate first).
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    const input = parseCreateCommentInput(body);
    // Link-limit check before persistence (ST8 contract).
    if (exceedsLinkLimit(input.body, this.throttleConfig.maxLinksPerPost)) {
      throw new BadRequestException(
        `Comment body may not contain more than ${this.throttleConfig.maxLinksPerPost} link${this.throttleConfig.maxLinksPerPost === 1 ? "" : "s"}.`
      );
    }
    // Throttle check — supply createdAt for new-account tier (ST9 wiring).
    const userEntity = await this.usersService.findById(session.user.id);
    this.throttleService.checkRequest({
      routeLabel: THROTTLE_LABEL_BLOG_COMMENT,
      request,
      userId: session.user.id,
      userCreatedAt: userEntity?.createdAt ?? null
    });
    // Resolve the post id from either slug or id path param.
    const resolvedPostId = await this.resolvePostId(postId);
    const comment = await this.blogService.createComment(resolvedPostId, session.user.id, input);
    return { comment: toPublicCommentDetail(comment) };
  }

  // ---------------------------------------------------------------------------
  // Moderation routes — require active session + moderator/admin role
  // ---------------------------------------------------------------------------

  @Get("moderation/comments/:postId")
  @ApiOperation({ summary: "List all comments for a post regardless of status (moderator/admin)." })
  @ApiOkResponse({ description: "All comments returned. Full payload includes authorUserId, moderatedByUserId, moderatedAt for moderation workflows." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiNotFoundResponse({ description: "Post not found." })
  async moderationListComments(
    @Req() request: Request,
    @Param("postId") postId: string
  ): Promise<{ comments: BlogCommentDetail[] }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertModerationAccess(session.user.globalRole);
    const post = await this.blogService.findById(postId);
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    const comments = await this.blogService.findAllComments(post.id);
    return { comments: comments.map(toCommentDetail) };
  }

  @Patch("moderation/comments/:commentId/status")
  @ApiOperation({ summary: "Update comment status (hide, remove, or restore) (moderator/admin)." })
  @ApiOkResponse({ description: "Updated comment returned. Full payload includes authorUserId, moderatedByUserId, moderatedAt for moderation workflows." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiNotFoundResponse({ description: "Comment not found." })
  @ApiBadRequestResponse({ description: "Invalid status value." })
  async moderateCommentStatus(
    @Req() request: Request,
    @Param("commentId") commentId: string,
    @Body() body: unknown
  ): Promise<{ comment: BlogCommentDetail }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertModerationAccess(session.user.globalRole);
    const status = parseCommentStatus(body);
    const comment = await this.blogService.moderateComment(commentId, status, session.user.id);
    return { comment: toCommentDetail(comment) };
  }

  @Delete("moderation/comments/:commentId")
  @ApiOperation({ summary: "Permanently delete a comment (moderator/admin)." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({ description: "Moderator or admin role required." })
  @ApiNotFoundResponse({ description: "Comment not found." })
  async deleteComment(
    @Req() request: Request,
    @Param("commentId") commentId: string
  ): Promise<{ deleted: true }> {
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });
    this.blogService.assertModerationAccess(session.user.globalRole);
    await this.blogService.deleteComment(commentId);
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves a path segment that may be a post slug or post id into a stable
   * post id string. Tries slug lookup first (published-only); falls back to
   * published-only id lookup. Throws NotFoundException when neither resolves
   * to a publicly visible post.
   *
   * Both branches use the published-only visibility predicate so that a
   * non-public post addressed by UUID is indistinguishable from a nonexistent
   * one on the comment-creation path (milestone visibility invariant).
   */
  private async resolvePostId(slugOrId: string): Promise<string> {
    // Try slug first (only matches published posts).
    const bySlug = await this.blogService.findPublishedBySlug(slugOrId);
    if (bySlug) return bySlug.id;
    // Try id with the same published-only predicate so draft/scheduled posts
    // are invisible here, matching the nonexistent-post 404 response.
    const byId = await this.blogService.findPublishedById(slugOrId);
    if (byId) return byId.id;
    throw new NotFoundException("Blog post not found.");
  }
}

// ---------------------------------------------------------------------------
// Response shape helpers
// ---------------------------------------------------------------------------

interface BlogPostSummary {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: string;
  isFeatured: boolean;
  publishedAt: string | null;
  featuredImageId: string | null;
  tags: string[];
  createdAt: string;
}

interface BlogPostDetail extends BlogPostSummary {
  body: string;
  authorUserId: string;
  commentsLocked: boolean;
  updatedAt: string;
}

function toSummary(post: BlogPostEntity): BlogPostSummary {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    summary: post.summary ?? null,
    status: post.status,
    isFeatured: post.isFeatured ?? false,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
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
    commentsLocked: post.commentsLocked ?? false,
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
  if (typeof b.body !== "string") {
    throw new BadRequestException("body is required.");
  }
  return {
    title: b.title,
    slug: typeof b.slug === "string" && b.slug.trim() ? b.slug : null,
    body: b.body,
    summary: typeof b.summary === "string" ? b.summary : null,
    featuredImageId: typeof b.featuredImageId === "string" ? b.featuredImageId : null,
    isFeatured: b.isFeatured === true,
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
  if (b.summary !== undefined) {
    input.summary = typeof b.summary === "string" ? b.summary : null;
  }
  if (b.featuredImageId !== undefined) {
    input.featuredImageId = typeof b.featuredImageId === "string" ? b.featuredImageId : null;
  }
  if (b.isFeatured !== undefined) {
    input.isFeatured = b.isFeatured === true;
  }
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags)) throw new BadRequestException("tags must be an array.");
    input.tags = (b.tags as unknown[]).filter((t): t is string => typeof t === "string");
  }
  return input;
}

function parsePublishAtInput(body: unknown): Date {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object with a publishedAt field.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.publishedAt !== "string" || !b.publishedAt) {
    throw new BadRequestException("publishedAt must be an ISO 8601 datetime string.");
  }
  const d = new Date(b.publishedAt);
  if (isNaN(d.getTime())) {
    throw new BadRequestException("publishedAt must be a valid ISO 8601 datetime string.");
  }
  return d;
}

// ---------------------------------------------------------------------------
// Comment response shape helpers
// ---------------------------------------------------------------------------

/**
 * Public-facing comment payload — omits moderation-internal fields
 * (authorUserId, moderatedByUserId, moderatedAt) to minimize information
 * exposure on guest-accessible endpoints (listComments, createComment).
 */
interface PublicBlogCommentDetail {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  status: string;
  mediaReferenceId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Visible replies — only present on top-level comments returned by the public list route. */
  replies?: PublicBlogCommentDetail[];
}

/**
 * Full comment payload used by admin/moderation endpoints — includes
 * authorUserId, moderatedByUserId, and moderatedAt for moderation workflows.
 */
interface BlogCommentDetail extends PublicBlogCommentDetail {
  authorUserId: string;
  moderatedByUserId: string | null;
  moderatedAt: string | null;
  replies?: BlogCommentDetail[];
}

/**
 * Serializes a comment for PUBLIC endpoints (listComments, createComment).
 * Does NOT include authorUserId, moderatedByUserId, or moderatedAt.
 */
function toPublicCommentDetail(comment: BlogCommentEntity): PublicBlogCommentDetail {
  return {
    id: comment.id,
    postId: comment.postId,
    parentId: comment.parentId,
    body: comment.body,
    status: comment.status,
    mediaReferenceId: comment.mediaReferenceId,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString()
  };
}

/**
 * Serializes a comment for ADMIN/MODERATION endpoints. Includes
 * authorUserId, moderatedByUserId, and moderatedAt.
 */
function toCommentDetail(comment: BlogCommentEntity): BlogCommentDetail {
  return {
    id: comment.id,
    postId: comment.postId,
    parentId: comment.parentId,
    authorUserId: comment.authorUserId,
    body: comment.body,
    status: comment.status,
    mediaReferenceId: comment.mediaReferenceId,
    moderatedByUserId: comment.moderatedByUserId,
    moderatedAt: comment.moderatedAt ? comment.moderatedAt.toISOString() : null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString()
  };
}

/**
 * Converts a top-level comment (with loaded replies relation) to a PUBLIC
 * detail object that includes only visible replies for the public listing
 * endpoint. Does NOT include authorUserId, moderatedByUserId, or moderatedAt.
 */
function toPublicCommentDetailWithReplies(comment: BlogCommentEntity): PublicBlogCommentDetail {
  const detail = toPublicCommentDetail(comment);
  if (comment.replies) {
    detail.replies = comment.replies
      .filter((r) => r.status === "visible")
      .map((r) => toPublicCommentDetail(r));
  }
  return detail;
}

// ---------------------------------------------------------------------------
// Comment input parsers
// ---------------------------------------------------------------------------

function parseCreateCommentInput(body: unknown): CreateCommentInput {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.body !== "string") {
    throw new BadRequestException("body is required and must be a string.");
  }
  return {
    body: b.body,
    imageId: typeof b.imageId === "string" ? b.imageId : null,
    parentId: typeof b.parentId === "string" ? b.parentId : null
  };
}

function parseCommentStatus(body: unknown): BlogCommentStatus {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Request body must be a JSON object with a status field.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.status !== "string" || !(blogCommentStatuses as readonly string[]).includes(b.status)) {
    throw new BadRequestException(
      `status must be one of: ${blogCommentStatuses.join(", ")}.`
    );
  }
  return b.status as BlogCommentStatus;
}
