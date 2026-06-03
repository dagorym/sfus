import crypto from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { validateMarkdownBody, normalizeMarkdownBody } from "../media/markdown-sanitizer";
import { BlogCommentEntity, BlogCommentStatus } from "./entities/blog-comment.entity";
import { BlogPostEntity } from "./entities/blog-post.entity";
import { BlogPostTagEntity } from "./entities/blog-post-tag.entity";

export interface CreateBlogPostInput {
  title: string;
  slug: string;
  body: string;
  featuredImageId?: string | null;
  tags?: string[];
}

export interface UpdateBlogPostInput {
  title?: string;
  slug?: string;
  body?: string;
  featuredImageId?: string | null;
  tags?: string[];
}

export interface CreateCommentInput {
  body: string;
  /** Optional image media reference id to associate with the comment. */
  imageId?: string | null;
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
   * Returns only published blog posts — safe for public/guest access.
   */
  async findPublished(): Promise<BlogPostEntity[]> {
    return this.blogPostRepository.find({
      where: { status: "published" },
      order: { publishedAt: "DESC" },
      relations: ["postTags"]
    });
  }

  /**
   * Returns a single published post by slug. Returns null when the post does
   * not exist or is not published, so callers never expose draft or unpublished
   * content through public routes.
   */
  async findPublishedBySlug(slug: string): Promise<BlogPostEntity | null> {
    return this.blogPostRepository.findOne({
      where: { slug, status: "published" },
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
   * Caller must have verified admin access before calling this.
   */
  async create(authorUserId: string, input: CreateBlogPostInput): Promise<BlogPostEntity> {
    this.assertSlugValid(input.slug);
    this.assertTitleValid(input.title);

    const id = crypto.randomUUID();
    const post = this.blogPostRepository.create({
      id,
      authorUserId,
      title: input.title,
      slug: input.slug,
      body: input.body,
      status: "draft",
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
   * Updates an existing blog post (title, slug, body, featured image, tags).
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
      post.body = input.body;
    }
    if (input.featuredImageId !== undefined) {
      post.featuredImageId = input.featuredImageId;
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
   * Unpublishes a blog post (moves it back to unpublished status).
   * Caller must have verified admin access before calling this.
   */
  async unpublish(id: string): Promise<BlogPostEntity> {
    const post = await this.blogPostRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    post.status = "unpublished";
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
   */
  async findVisibleComments(postId: string): Promise<BlogCommentEntity[]> {
    return this.blogCommentRepository.find({
      where: { postId, status: "visible" },
      order: { createdAt: "ASC" }
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
   * - The parent post must be published — prevents comment creation on draft or
   *   unpublished posts (no exposure of non-public parent content).
   * - The comment body is sanitized with the shared markdown sanitizer before
   *   persistence.
   */
  async createComment(postId: string, authorUserId: string, input: CreateCommentInput): Promise<BlogCommentEntity> {
    // Confirm parent post exists and is published.
    const post = await this.blogPostRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    if (post.status !== "published") {
      throw new ForbiddenException("Comments can only be added to published posts.");
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
      authorUserId,
      body: normalizedBody,
      status: "visible",
      moderatedByUserId: null,
      moderatedAt: null
    });

    return this.blogCommentRepository.save(comment) as Promise<BlogCommentEntity>;
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

  private assertSlugValid(slug: string): void {
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException(
        "Slug must be lowercase alphanumeric words separated by hyphens (e.g. 'my-post-title')."
      );
    }
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
