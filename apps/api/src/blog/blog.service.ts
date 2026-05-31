import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { BlogCommentEntity } from "./entities/blog-comment.entity";
import { BlogPostEntity } from "./entities/blog-post.entity";

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
      order: { publishedAt: "DESC" }
    });
  }

  /**
   * Returns a single published post by slug. Returns null when the post does
   * not exist or is not published, so callers never expose draft or scheduled
   * content through public routes.
   */
  async findPublishedBySlug(slug: string): Promise<BlogPostEntity | null> {
    return this.blogPostRepository.findOne({
      where: { slug, status: "published" }
    });
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
}
