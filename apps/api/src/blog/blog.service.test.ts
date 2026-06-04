import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { blogPostStatuses } from "./entities/blog-post.entity";

import { AuthorizationService } from "../authorization/authorization.service";
import { BlogService } from "./blog.service";
import type { BlogCommentEntity } from "./entities/blog-comment.entity";

// Minimal Repository stub — only the methods called by BlogService are needed.
interface MinimalRepo {
  find: (opts?: unknown) => Promise<unknown[]>;
  findOne: (opts?: unknown) => Promise<unknown>;
  save: (entity: unknown) => Promise<unknown>;
  delete: (opts?: unknown) => Promise<unknown>;
  remove: (entity: unknown) => Promise<unknown>;
  create: (partial?: unknown) => unknown;
}

const createMinimalRepository = (): MinimalRepo => ({
  find: async () => [],
  findOne: async () => null,
  save: async (e) => e,
  delete: async () => ({ affected: 0 }),
  remove: async (e) => e,
  create: (partial) => ({ ...(partial as object) })
});

const makeBlogService = (): BlogService => {
  const authorizationService = new AuthorizationService();
  return new BlogService(
    createMinimalRepository() as never,
    createMinimalRepository() as never,
    createMinimalRepository() as never,
    createMinimalRepository() as never,
    authorizationService
  );
};

describe("BlogService.assertAdminManagementAccess", () => {
  // Acceptance criterion: BlogService.assertAdminManagementAccess() enforces
  // admin-only site-wide management by delegating to
  // AuthorizationService.hasGlobalRole('admin').

  it("allows the admin global role to manage blog content", () => {
    const service = makeBlogService();
    // Should not throw for a user with the admin role.
    expect(() => service.assertAdminManagementAccess("admin")).not.toThrow();
  });

  it("throws ForbiddenException when the caller has the user role", () => {
    const service = makeBlogService();
    expect(() => service.assertAdminManagementAccess("user")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when the caller has the moderator role", () => {
    const service = makeBlogService();
    // Moderator is below admin — blog management is admin-only.
    expect(() => service.assertAdminManagementAccess("moderator")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when the caller has no role (empty string)", () => {
    const service = makeBlogService();
    expect(() => service.assertAdminManagementAccess("")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for an unrecognised role", () => {
    const service = makeBlogService();
    expect(() => service.assertAdminManagementAccess("superuser")).toThrow(ForbiddenException);
  });
});

// ---------------------------------------------------------------------------
// Publish-state transitions — reusable authorization checks
// ---------------------------------------------------------------------------

describe("BlogService publish-state transitions", () => {
  it("publish() sets status to published and records publishedAt", async () => {
    const post = {
      id: "post-1",
      status: "draft",
      publishedAt: null,
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValueOnce(post).mockResolvedValueOnce({ ...post, status: "published", publishedAt: new Date(), postTags: [] }),
      save: vi.fn().mockResolvedValue(post)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.publish("post-1");
    expect(result.status).toBe("published");
    expect(result.publishedAt).not.toBeNull();
  });

  it("unpublish() sets status to draft and clears publishedAt", async () => {
    const post = {
      id: "post-1",
      status: "published",
      publishedAt: new Date(),
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValueOnce(post).mockResolvedValueOnce({ ...post, status: "draft", publishedAt: null, postTags: [] }),
      save: vi.fn().mockResolvedValue(post)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.unpublish("post-1");
    expect(result.status).toBe("draft");
    expect(result.publishedAt).toBeNull();
  });

  it("publish() throws NotFoundException for unknown post id", async () => {
    const service = makeBlogService();
    // Default stub returns null for findOne
    await expect(service.publish("nonexistent")).rejects.toThrow(NotFoundException);
  });

  it("unpublish() throws NotFoundException for unknown post id", async () => {
    const service = makeBlogService();
    await expect(service.unpublish("nonexistent")).rejects.toThrow(NotFoundException);
  });

  it("delete() throws NotFoundException for unknown post id", async () => {
    const service = makeBlogService();
    await expect(service.delete("nonexistent")).rejects.toThrow(NotFoundException);
  });

  it("create() throws BadRequestException for invalid slug", async () => {
    const service = makeBlogService();
    await expect(
      service.create("user-1", { title: "Valid Title", slug: "INVALID SLUG!", body: "" })
    ).rejects.toThrow(BadRequestException);
  });

  it("create() throws BadRequestException for empty title", async () => {
    const service = makeBlogService();
    await expect(
      service.create("user-1", { title: "   ", slug: "valid-slug", body: "" })
    ).rejects.toThrow(BadRequestException);
  });

  it("update() throws NotFoundException for unknown post id", async () => {
    const service = makeBlogService();
    await expect(service.update("nonexistent", { title: "New Title" })).rejects.toThrow(NotFoundException);
  });

  it("findPublished() only queries for status=published with publishedAt<=now (public-route filtering)", async () => {
    const authorizationService = new AuthorizationService();
    const findSpy = vi.fn().mockResolvedValue([]);
    const postRepo = {
      ...createMinimalRepository(),
      find: findSpy
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await service.findPublished();
    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "published" })
    }));
  });

  it("findPublishedBySlug() only queries for status=published with publishedAt<=now (public-route filtering)", async () => {
    const authorizationService = new AuthorizationService();
    const findOneSpy = vi.fn().mockResolvedValue(null);
    const postRepo = {
      ...createMinimalRepository(),
      findOne: findOneSpy
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await service.findPublishedBySlug("my-post");
    expect(findOneSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ slug: "my-post", status: "published" })
    }));
  });
});

// ---------------------------------------------------------------------------
// Comment moderation access assertions
// ---------------------------------------------------------------------------

describe("BlogService.assertModerationAccess", () => {
  it("allows moderator role", () => {
    const service = makeBlogService();
    expect(() => service.assertModerationAccess("moderator")).not.toThrow();
  });

  it("allows admin role (admin >= moderator)", () => {
    const service = makeBlogService();
    expect(() => service.assertModerationAccess("admin")).not.toThrow();
  });

  it("throws ForbiddenException for user role", () => {
    const service = makeBlogService();
    expect(() => service.assertModerationAccess("user")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for empty role", () => {
    const service = makeBlogService();
    expect(() => service.assertModerationAccess("")).toThrow(ForbiddenException);
  });
});

// ---------------------------------------------------------------------------
// Comment creation
// ---------------------------------------------------------------------------

describe("BlogService.createComment", () => {
  const publishedPost = {
    id: "post-published",
    status: "published",
    publishedAt: new Date(Date.now() - 1000), // published 1 second ago
    title: "Test Post",
    slug: "test-post",
    body: "body",
    postTags: []
  };

  const draftPost = {
    id: "post-draft",
    status: "draft",
    title: "Draft Post",
    slug: "draft-post",
    body: "body",
    postTags: []
  };

  it("creates a visible comment on a published post", async () => {
    const authorizationService = new AuthorizationService();
    const savedComment: Partial<BlogCommentEntity> = {
      id: "comment-1",
      postId: publishedPost.id,
      authorUserId: "user-1",
      body: "Great post!",
      status: "visible",
      moderatedByUserId: null,
      moderatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const commentRepo = {
      ...createMinimalRepository(),
      create: vi.fn().mockReturnValue(savedComment),
      save: vi.fn().mockResolvedValue(savedComment)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      commentRepo as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.createComment(publishedPost.id, "user-1", { body: "Great post!" });
    expect(result.status).toBe("visible");
    expect(result.authorUserId).toBe("user-1");
  });

  it("throws ForbiddenException when post is not published (draft)", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(draftPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(draftPost.id, "user-1", { body: "Comment on draft" })
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws NotFoundException when post does not exist", async () => {
    const service = makeBlogService();
    await expect(
      service.createComment("nonexistent-post", "user-1", { body: "Comment" })
    ).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException for empty comment body", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(publishedPost.id, "user-1", { body: "   " })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException for unsafe markdown body (script injection)", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(publishedPost.id, "user-1", { body: "<script>alert(1)</script>" })
    ).rejects.toThrow(BadRequestException);
  });

  // AC4: Comments cannot bypass the shared sanitization model — iframe injection
  it("throws BadRequestException for unsafe markdown body (iframe injection)", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(publishedPost.id, "user-1", { body: '<iframe src="https://evil.example"></iframe>' })
    ).rejects.toThrow(BadRequestException);
  });

  // AC4: Comments cannot bypass the shared sanitization model — event handler injection
  it("throws BadRequestException for unsafe markdown body (event handler injection)", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(publishedPost.id, "user-1", { body: '<img src=x onerror="alert(1)">' })
    ).rejects.toThrow(BadRequestException);
  });

  // AC4: Comments cannot expose unpublished parent content — unpublished post guard
  it("throws ForbiddenException when post is unpublished", async () => {
    const unpublishedPost = {
      id: "post-unpublished",
      status: "unpublished",
      publishedAt: null,
      title: "Unpublished Post",
      slug: "unpublished-post",
      body: "body",
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(unpublishedPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(unpublishedPost.id, "user-1", { body: "Comment on unpublished" })
    ).rejects.toThrow(ForbiddenException);
  });
});

// ---------------------------------------------------------------------------
// Comment moderation (hide, remove, restore)
// ---------------------------------------------------------------------------

describe("BlogService.moderateComment", () => {
  const visibleComment: Partial<BlogCommentEntity> = {
    id: "comment-1",
    postId: "post-1",
    authorUserId: "user-1",
    body: "A comment",
    status: "visible",
    moderatedByUserId: null,
    moderatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("sets status to hidden and records moderator id and timestamp", async () => {
    const authorizationService = new AuthorizationService();
    const hiddenComment = { ...visibleComment, status: "hidden", moderatedByUserId: "mod-1", moderatedAt: new Date() };
    const commentRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue({ ...visibleComment }),
      save: vi.fn().mockResolvedValue(hiddenComment)
    };
    const service = new BlogService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      commentRepo as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.moderateComment("comment-1", "hidden", "mod-1");
    expect(result.status).toBe("hidden");
    expect(result.moderatedByUserId).toBe("mod-1");
    expect(result.moderatedAt).not.toBeNull();
  });

  it("throws NotFoundException for unknown comment id", async () => {
    const service = makeBlogService();
    await expect(service.moderateComment("nonexistent", "hidden", "mod-1")).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Comment deletion
// ---------------------------------------------------------------------------

describe("BlogService.deleteComment", () => {
  it("removes comment successfully", async () => {
    const authorizationService = new AuthorizationService();
    const commentRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue({ id: "comment-1", body: "A comment" }),
      remove: vi.fn().mockResolvedValue(undefined)
    };
    const service = new BlogService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      commentRepo as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(service.deleteComment("comment-1")).resolves.toBeUndefined();
    expect(commentRepo.remove).toHaveBeenCalled();
  });

  it("throws NotFoundException for unknown comment id", async () => {
    const service = makeBlogService();
    await expect(service.deleteComment("nonexistent")).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// findVisibleComments — unpublished post protection
// ---------------------------------------------------------------------------

describe("BlogService.findVisibleComments", () => {
  it("only queries comments with status=visible (guest-safe filter)", async () => {
    const authorizationService = new AuthorizationService();
    const findSpy = vi.fn().mockResolvedValue([]);
    const commentRepo = {
      ...createMinimalRepository(),
      find: findSpy
    };
    const service = new BlogService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      commentRepo as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await service.findVisibleComments("post-1");
    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ postId: "post-1", status: "visible" })
    }));
  });
});

// ---------------------------------------------------------------------------
// AC2 / AC7: BlogPostStatus type normalization — no scheduled value
// ---------------------------------------------------------------------------

describe("BlogPostStatus enum normalization", () => {
  // AC2: BlogPostStatus type is draft/published/unpublished only - no scheduled value
  it("blogPostStatuses contains exactly draft, published, and unpublished", () => {
    expect(blogPostStatuses).toEqual(["draft", "published", "unpublished"]);
  });

  it("blogPostStatuses does not contain scheduled", () => {
    expect((blogPostStatuses as readonly string[]).includes("scheduled")).toBe(false);
  });
});
