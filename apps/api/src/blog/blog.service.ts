import crypto from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { BlogCommentEntity } from "./entities/blog-comment.entity";
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
   * not exist or is not published, so callers never expose draft or scheduled
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
      publishedAt: null,
      scheduledAt: null
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
    post.scheduledAt = null;
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
   * Schedules a blog post for future publication at the given UTC datetime.
   * Caller must have verified admin access before calling this.
   */
  async schedule(id: string, scheduledAt: Date): Promise<BlogPostEntity> {
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException("scheduledAt must be a future UTC datetime.");
    }
    const post = await this.blogPostRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException("Blog post not found.");
    }
    post.status = "scheduled";
    post.scheduledAt = scheduledAt;
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
