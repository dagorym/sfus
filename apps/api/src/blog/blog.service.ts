import crypto from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThanOrEqual, Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { validateMarkdownBody, normalizeMarkdownBody } from "../media/markdown-sanitizer";
import { MediaReferenceEntity } from "../media/entities/media-reference.entity";
import { BlogCommentEntity, BlogCommentStatus } from "./entities/blog-comment.entity";
import { BlogPostEntity } from "./entities/blog-post.entity";
import { BlogPostTagEntity } from "./entities/blog-post-tag.entity";

export interface CreateBlogPostInput {
  title: string;
  slug?: string | null;
  body: string;
  summary?: string | null;
  featuredImageId?: string | null;
  isFeatured?: boolean;
  tags?: string[];
}

export interface UpdateBlogPostInput {
  title?: string;
  slug?: string;
  body?: string;
  summary?: string | null;
  featuredImageId?: string | null;
  isFeatured?: boolean;
  tags?: string[];
}

export interface CreateCommentInput {
  body: string;
  /** Optional image media reference id to associate with the comment. */
  imageId?: string | null;
  /** Optional parent comment id — permits exactly one level of replies. */
  parentId?: string | null;
}

/**
 * BlogService enforces admin-only site-wide management for blog posts.
 *
 * Blog posts (create/edit/publish/unpublish/delete) require the caller to hold
 * the global "admin" role — this is the Milestone 3 locked decision for
 * site-wide content management.
 *
 * Comments are publicly readable and authenticated-member writable. Moderators
 * and admins can moderate comments (hide/remove). These finer-grained checks
 * will be expanded in Subtask 4; this service provides the authorization
 * boundary stubs so later subtasks do not need to re-establish them.
 */
@Injectable()
export class BlogService {
  constructor(
    @InjectRepository(BlogPostEntity)
    private readonly blogPostRepository: Repository<BlogPostEntity>,
    @InjectRepository(BlogPostTagEntity)
    private readonly blogPostTagRepository: Repository<BlogPostTagEntity>,
    @InjectRepository(BlogCommentEntity)
    private readonly blogCommentRepository: Repository<BlogCommentEntity>,
    @InjectRepository(MediaReferenceEntity)
    private readonly mediaRepository: Repository<MediaReferenceEntity>,
    private readonly authorizationService: AuthorizationService
  ) {}

  /**
   * Asserts that the actor holds the global admin role for site-wide blog
   * management actions (create, edit, publish, unpublish, delete).
   */
  assertAdminManagementAccess(actorGlobalRole: string): void {
    if (!this.authorizationService.hasGlobalRole(actorGlobalRole, "admin")) {
      throw new ForbiddenException("Blog management requires the admin role.");
    }
  }

  /**
   * Asserts that the actor can moderate blog comments (requires moderator or
   * admin global role).
   */
  assertModerationAccess(actorGlobalRole: string): void {
    if (!this.authorizationService.hasGlobalRole(actorGlobalRole, "moderator")) {
      throw new ForbiddenException("Comment moderation requires the moderator or admin role.");
    }
  }

  /**
   * Returns only published blog posts whose publishedAt is at or before now —
   * safe for public/guest access. Future-dated published posts are hidden until
   * their publishedAt time is reached (no background job needed; the filter is
   * evaluated at query time). Featured/pinned posts are surfaced first.
   */
  async findPublished(): Promise<BlogPostEntity[]> {
    const now = new Date();
    return this.blogPostRepository.find({
      where: { status: "published", publishedAt: LessThanOrEqual(now) },
      order: { isFeatured: "DESC", publishedAt: "DESC" },
      relations: ["postTags"]
    });
  }

  /**
   * Returns a single published post by slug whose publishedAt is at or before
   * now. Returns null when the post does not exist, is not published, or its
   * publishedAt is in the future, so callers never expose draft, unpublished,
   * or future-scheduled content through public routes.
   */
  async findPublishedBySlug(slug: string): Promise<BlogPostEntity | null> {
    const now = new Date();
    return this.blogPostRepository.findOne({
      where: { slug, status: "published", publishedAt: LessThanOrEqual(now) },
      relations: ["postTags"]
    });
  }

  /**
   * Returns a single published post by id whose publishedAt is at or before
   * now. Returns null when the post does not exist, is not published, or its
   * publishedAt is in the future — identical visibility predicate to
   * findPublishedBySlug, used to guard public routes that accept a UUID path
   * parameter instead of a slug.
   */
  async findPublishedById(id: string): Promise<BlogPostEntity | null> {
    const now = new Date();
    return this.blogPostRepository.findOne({
      where: { id, status: "published", publishedAt: LessThanOrEqual(now) },
      relations: ["postTags"]
    });
  }

  /**
   * Returns all blog posts regardless of status — admin-only surface.
   * Caller must have verified admin access before calling this.
   */
  async findAll(): Promise<BlogPostEntity[]> {
    return this.blogPostRepository.find({
      order: { createdAt: "DESC" },
      relations: ["postTags"]
    });
  }

  /**
   * Returns a single post by id regardless of status — admin-only surface.
   * Caller must have verified admin access before calling this.
   */
  async findById(id: string): Promise<BlogPostEntity | null> {
    return this.blogPostRepository.findOne({
      where: { id },
      relations: ["postTags"]
    });
  }

  /**
   * Creates a new blog post in draft status.
   * Body is sanitized with the shared markdown sanitizer before persistence.
   * Caller must have verified admin access before calling this.
   */
  async create(authorUserId: string, input: CreateBlogPostInput): Promise<BlogPostEntity> {
    this.assertTitleValid(input.title);

    // Resolve slug: use provided slug (validated) or auto-derive from title.
    let resolvedSlug: string;
    if (input.slug && input.slug.trim()) {
      this.assertSlugValid(input.slug.trim());
      resolvedSlug = input.slug.trim();
    } else {
      resolvedSlug = await this.deriveUniqueSlug(input.title);
    }

    const normalizedBody = normalizeMarkdownBody(input.body ?? "");
    const sanitizationResult = validateMarkdownBody(normalizedBody);
    if (!sanitizationResult.safe) {
      throw new BadRequestException(`Post body contains unsafe content: ${sanitizationResult.reason}`);
    }

    if (input.featuredImageId) {
      await this.assertFeaturedImageExists(input.featuredImageId);
    }

    const id = crypto.randomUUID();
    const post = this.blogPostRepository.create({
      id,
      authorUserId,
      title: input.title,
      slug: resolvedSlug,
      body: normalizedBody,
      summary: input.summary ?? null,
      status: "draft",
      isFeatured: input.isFeatured ?? false,
      featuredImageId: input.featuredImageId ?? null,
      publishedAt: null
    });
    await this.blogPostRepository.save(post);

    if (input.tags && input.tags.length > 0) {
      await this.replaceTags(id, input.tags);
    }

    return this.blogPostRepository.findOne({ where: { id }, relations: ["postTags"] }) as Promise<BlogPostEntity>;
  }

  /**
   * Updates an existing blog post (title, slug, body, summary, featured image,
   * isFeatured, tags). Body is sanitized with the shared markdown sanitizer.
   * Caller must have verified admin access before calling this.
   */
  async update(id: string, input: UpdateBlogPostInput): Promise<BlogPostEntity> {
    const post = await this.blogPostRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }

    if (input.slug !== undefined) {
      this.assertSlugValid(input.slug);
      post.slug = input.slug;
    }
    if (input.title !== undefined) {
      this.assertTitleValid(input.title);
      post.title = input.title;
    }
    if (input.body !== undefined) {
      const normalizedBody = normalizeMarkdownBody(input.body);
      const sanitizationResult = validateMarkdownBody(normalizedBody);
      if (!sanitizationResult.safe) {
        throw new BadRequestException(`Post body contains unsafe content: ${sanitizationResult.reason}`);
      }
      post.body = normalizedBody;
    }
    if (input.summary !== undefined) {
      post.summary = input.summary;
    }
    if (input.featuredImageId !== undefined) {
      if (input.featuredImageId) {
        await this.assertFeaturedImageExists(input.featuredImageId);
      }
      post.featuredImageId = input.featuredImageId;
    }
    if (input.isFeatured !== undefined) {
      post.isFeatured = input.isFeatured;
    }

    await this.blogPostRepository.save(post);

    if (input.tags !== undefined) {
      await this.replaceTags(id, input.tags);
    }

    return this.blogPostRepository.findOne({ where: { id }, relations: ["postTags"] }) as Promise<BlogPostEntity>;
  }

  /**
   * Publishes a blog post immediately.
   * Caller must have verified admin access before calling this.
   */
  async publish(id: string): Promise<BlogPostEntity> {
    const post = await this.blogPostRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    const now = new Date();
    post.status = "published";
    post.publishedAt = now;
    await this.blogPostRepository.save(post);
    return this.blogPostRepository.findOne({ where: { id }, relations: ["postTags"] }) as Promise<BlogPostEntity>;
  }

  /**
   * Unpublishes a blog post (returns it to draft status, hides from public).
   * Caller must have verified admin access before calling this.
   */
  async unpublish(id: string): Promise<BlogPostEntity> {
    const post = await this.blogPostRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    post.status = "draft";
    post.publishedAt = null;
    await this.blogPostRepository.save(post);
    return this.blogPostRepository.findOne({ where: { id }, relations: ["postTags"] }) as Promise<BlogPostEntity>;
  }

  /**
   * Schedules a blog post for future publication by setting status=published
   * and publishedAt to the chosen future datetime. The post remains hidden from
   * public routes until publishedAt <= now (evaluated at query time, no background
   * job needed). Caller must have verified admin access before calling this.
   */
  async publishAt(id: string, publishedAt: Date): Promise<BlogPostEntity> {
    const post = await this.blogPostRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    post.status = "published";
    post.publishedAt = publishedAt;
    await this.blogPostRepository.save(post);
    return this.blogPostRepository.findOne({ where: { id }, relations: ["postTags"] }) as Promise<BlogPostEntity>;
  }

  /**
   * Toggles the isFeatured (pin) state of a post. Featured posts surface first
   * in the public listing. Only admins may toggle this.
   * Caller must have verified admin access before calling this.
   */
  async toggleFeatured(id: string): Promise<BlogPostEntity> {
    const post = await this.blogPostRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    post.isFeatured = !post.isFeatured;
    await this.blogPostRepository.save(post);
    return this.blogPostRepository.findOne({ where: { id }, relations: ["postTags"] }) as Promise<BlogPostEntity>;
  }

  /**
   * Deletes a blog post. Caller must have verified admin access before calling this.
   */
  async delete(id: string): Promise<void> {
    const post = await this.blogPostRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    await this.blogPostRepository.remove(post);
  }

  /**
   * Returns all comments with status "visible" for a given post — safe for
   * public/guest access. Does not expose the parent post itself, so callers
   * must separately confirm the post is published before surfacing comments.
   * Top-level comments (parentId IS NULL) are loaded; replies are nested under them.
   */
  async findVisibleComments(postId: string): Promise<BlogCommentEntity[]> {
    return this.blogCommentRepository.find({
      where: { postId, status: "visible" },
      order: { createdAt: "ASC" },
      relations: ["replies"]
    });
  }

  /**
   * Returns all comments for a post regardless of status — moderator/admin surface.
   * Caller must have verified moderation access before calling this.
   */
  async findAllComments(postId: string): Promise<BlogCommentEntity[]> {
    return this.blogCommentRepository.find({
      where: { postId },
      order: { createdAt: "ASC" }
    });
  }

  /**
   * Creates a new comment on a published post by an authenticated member.
   *
   * Guards:
   * - The parent post must be published AND publishedAt <= now — prevents
   *   comment creation on draft, unpublished, or future-scheduled posts (no
   *   exposure of non-public parent content).
   * - The parent post must not have commentsLocked set — when locked, new
   *   comment creation is rejected for all members including moderators.
   * - If parentId is supplied, the referenced comment must exist, belong to
   *   the same post, and itself have no parent (enforces max 1-level nesting).
   * - If imageId is supplied, the referenced media record must exist and have
   *   resourceType "blog-comment" (usage-scope enforcement).
   * - The comment body is sanitized with the shared markdown sanitizer before
   *   persistence.
   */
  async createComment(postId: string, authorUserId: string, input: CreateCommentInput): Promise<BlogCommentEntity> {
    // Confirm parent post exists and is publicly visible (published + publishedAt <= now).
    const post = await this.blogPostRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    const now = new Date();
    if (post.status !== "published" || !post.publishedAt || post.publishedAt > now) {
      throw new ForbiddenException("Comments can only be added to published posts.");
    }

    // Enforce thread-lock: reject new comments when the post has commentsLocked.
    if (post.commentsLocked) {
      throw new ForbiddenException("Comments are locked on this post.");
    }

    // Enforce 1-level threading: validate parentId when supplied.
    let resolvedParentId: string | null = null;
    if (input.parentId) {
      const parentComment = await this.blogCommentRepository.findOne({ where: { id: input.parentId } });
      if (!parentComment) {
        throw new BadRequestException("Parent comment not found.");
      }
      if (parentComment.postId !== postId) {
        throw new BadRequestException("Parent comment does not belong to this post.");
      }
      if (parentComment.parentId !== null) {
        throw new BadRequestException("Replies cannot be nested more than one level deep.");
      }
      resolvedParentId = input.parentId;
    }

    // Validate imageId scope: must be blog-comment-scoped media.
    let resolvedMediaReferenceId: string | null = null;
    if (input.imageId) {
      const mediaRecord = await this.mediaRepository.findOne({ where: { id: input.imageId } });
      if (!mediaRecord) {
        throw new BadRequestException("imageId references a media record that does not exist.");
      }
      if (mediaRecord.resourceType !== "blog-comment") {
        throw new BadRequestException("imageId must reference a blog-comment-scoped media record.");
      }
      resolvedMediaReferenceId = input.imageId;
    }

    // Sanitize the body with the shared markdown sanitizer.
    const normalizedBody = normalizeMarkdownBody(input.body ?? "");
    if (!normalizedBody) {
      throw new BadRequestException("Comment body must not be empty.");
    }
    const sanitizationResult = validateMarkdownBody(normalizedBody);
    if (!sanitizationResult.safe) {
      throw new BadRequestException(`Comment body contains unsafe content: ${sanitizationResult.reason}`);
    }

    const id = crypto.randomUUID();
    const comment = this.blogCommentRepository.create({
      id,
      postId,
      parentId: resolvedParentId,
      authorUserId,
      body: normalizedBody,
      status: "visible",
      mediaReferenceId: resolvedMediaReferenceId,
      moderatedByUserId: null,
      moderatedAt: null
    });

    return this.blogCommentRepository.save(comment) as Promise<BlogCommentEntity>;
  }

  /**
   * Locks the comment thread on a blog post — prevents new comments from being
   * created. Caller must have verified admin access before calling this.
   */
  async lockComments(postId: string): Promise<BlogPostEntity> {
    const post = await this.blogPostRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    post.commentsLocked = true;
    await this.blogPostRepository.save(post);
    return this.blogPostRepository.findOne({ where: { id: postId }, relations: ["postTags"] }) as Promise<BlogPostEntity>;
  }

  /**
   * Unlocks the comment thread on a blog post — allows new comments again.
   * Caller must have verified admin access before calling this.
   */
  async unlockComments(postId: string): Promise<BlogPostEntity> {
    const post = await this.blogPostRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    post.commentsLocked = false;
    await this.blogPostRepository.save(post);
    return this.blogPostRepository.findOne({ where: { id: postId }, relations: ["postTags"] }) as Promise<BlogPostEntity>;
  }

  /**
   * Finds a single comment by id — used for moderation lookups.
   */
  async findCommentById(id: string): Promise<BlogCommentEntity | null> {
    return this.blogCommentRepository.findOne({ where: { id } });
  }

  /**
   * Updates comment status for moderation (hide, remove, or restore to visible).
   * Caller must have verified moderation access before calling this.
   *
   * Records the moderatorUserId and timestamp on every status change.
   */
  async moderateComment(
    commentId: string,
    newStatus: BlogCommentStatus,
    moderatorUserId: string
  ): Promise<BlogCommentEntity> {
    const comment = await this.blogCommentRepository.findOne({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException("Comment not found.");
    }
    comment.status = newStatus;
    comment.moderatedByUserId = moderatorUserId;
    comment.moderatedAt = new Date();
    return this.blogCommentRepository.save(comment) as Promise<BlogCommentEntity>;
  }

  /**
   * Deletes a comment permanently.
   * Caller must have verified moderation access before calling this.
   */
  async deleteComment(commentId: string): Promise<void> {
    const comment = await this.blogCommentRepository.findOne({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException("Comment not found.");
    }
    await this.blogCommentRepository.remove(comment);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async assertFeaturedImageExists(featuredImageId: string): Promise<void> {
    const media = await this.mediaRepository.findOne({ where: { id: featuredImageId } });
    if (!media) {
      throw new BadRequestException("featuredImageId references a media record that does not exist.");
    }
  }

  private assertSlugValid(slug: string): void {
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException(
        "Slug must be lowercase alphanumeric words separated by hyphens (e.g. 'my-post-title')."
      );
    }
  }

  /**
   * Converts a title string into a URL-safe slug:
   * lowercase, non-alphanumeric runs collapsed to single hyphens,
   * leading/trailing hyphens trimmed.
   * Falls back to "post" if the result would be empty.
   */
  private slugifyTitle(title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "post";
  }

  /**
   * Derives a unique slug from a title by slugifying it and appending
   * an incrementing numeric suffix (-2, -3, …) until no existing post
   * uses the same slug.
   */
  private async deriveUniqueSlug(title: string): Promise<string> {
    const base = this.slugifyTitle(title);
    // Check if base slug is already taken.
    const existing = await this.blogPostRepository.findOne({ where: { slug: base } });
    if (!existing) {
      return base;
    }
    // Append incrementing suffix until unique. Guard with a safety ceiling to
    // satisfy the linter's no-constant-condition rule — in practice the loop
    // terminates long before the ceiling is reached.
    const maxSuffix = 10_000;
    for (let suffix = 2; suffix <= maxSuffix; suffix++) {
      const candidate = `${base}-${suffix}`;
      const taken = await this.blogPostRepository.findOne({ where: { slug: candidate } });
      if (!taken) {
        return candidate;
      }
    }
    // Fallback: append a random segment if all suffix candidates are taken.
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }

  private assertTitleValid(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new BadRequestException("Title must not be empty.");
    }
  }

  private async replaceTags(postId: string, tags: string[]): Promise<void> {
    // Remove existing tags then insert fresh ones (simple replace strategy).
    await this.blogPostTagRepository.delete({ postId });
    if (tags.length > 0) {
      const tagEntities = tags.map((tag) => {
        const entity = new BlogPostTagEntity();
        entity.postId = postId;
        entity.tag = tag.toLowerCase().trim();
        return entity;
      });
      await this.blogPostTagRepository.save(tagEntities);
    }
  }
}
