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
    // Verify that a publishedAt constraint is present in the query (LessThanOrEqual guard)
    const calledWith = findSpy.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(calledWith.where).toHaveProperty("publishedAt");
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
    // Verify the publishedAt value is a TypeORM LessThanOrEqual FindOperator, not just a Date.
    // Key-presence alone would not distinguish LessThanOrEqual from a plain equality filter.
    const calledWith = findOneSpy.mock.calls[0][0] as { where: Record<string, unknown> };
    const publishedAtOperator = calledWith.where["publishedAt"] as { type?: string };
    expect(publishedAtOperator).toHaveProperty("type");
    expect(publishedAtOperator.type).toBe("lessThanOrEqual");
  });
});

// ---------------------------------------------------------------------------
// Security regression: findPublishedById enforces full public-visibility predicate
// (status=published AND publishedAt<=now), same as findPublishedBySlug.
// This guards the listComments UUID-fallback path against leaking future-scheduled posts.
// ---------------------------------------------------------------------------

describe("BlogService.findPublishedById public-visibility predicate (security regression)", () => {
  it("queries with status=published and a publishedAt LessThanOrEqual constraint", async () => {
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
    await service.findPublishedById("some-uuid");
    expect(findOneSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "some-uuid", status: "published" })
    }));
    // Verify the publishedAt value is a TypeORM LessThanOrEqual FindOperator.
    // Key-presence alone would not distinguish LessThanOrEqual from a plain equality filter;
    // verifying .type === "lessThanOrEqual" ensures the correct operator is used.
    const calledWith = findOneSpy.mock.calls[0][0] as { where: Record<string, unknown> };
    const publishedAtOperator = calledWith.where["publishedAt"] as { type?: string };
    expect(publishedAtOperator).toHaveProperty("type");
    expect(publishedAtOperator.type).toBe("lessThanOrEqual");
  });

  it("returns null for a future-scheduled post (published but publishedAt in the future)", async () => {
    // Simulates the DB returning no row because the LessThanOrEqual filter excludes
    // future-dated posts. The service must propagate null unchanged so the controller
    // raises 404 rather than exposing the post content or its comments.
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null) // DB excluded the future-dated post
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.findPublishedById("future-post-uuid");
    // Controller will receive null and must respond with 404 — no comments exposed.
    expect(result).toBeNull();
  });

  it("returns the post for a genuinely public post (published and publishedAt in the past)", async () => {
    const publicPost = {
      id: "past-post-uuid",
      status: "published",
      publishedAt: new Date(Date.now() - 60_000),
      title: "A public post",
      slug: "a-public-post",
      body: "body",
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publicPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.findPublishedById("past-post-uuid");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("past-post-uuid");
    expect(result!.status).toBe("published");
  });

  it("returns null for a draft post (no published status, no publishedAt)", async () => {
    // Draft posts must not be accessible through the UUID-fallback path.
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null) // DB excluded the draft post
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.findPublishedById("draft-post-uuid");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC3: Body sanitization on create and update
// ---------------------------------------------------------------------------

describe("BlogService body sanitization on create and update (AC3)", () => {
  it("create() rejects a body containing a <script> tag", async () => {
    const service = makeBlogService();
    await expect(
      service.create("user-1", { title: "Valid Title", slug: "valid-slug", body: "<script>alert(1)</script>" })
    ).rejects.toThrow(BadRequestException);
  });

  it("create() rejects a body containing an iframe injection", async () => {
    const service = makeBlogService();
    await expect(
      service.create("user-1", { title: "Valid Title", slug: "valid-slug", body: '<iframe src="https://evil.example"></iframe>' })
    ).rejects.toThrow(BadRequestException);
  });

  it("create() rejects a body with an event handler attribute (onerror)", async () => {
    const service = makeBlogService();
    await expect(
      service.create("user-1", { title: "Valid Title", slug: "valid-slug", body: '<img src=x onerror="alert(1)">' })
    ).rejects.toThrow(BadRequestException);
  });

  it("create() accepts a safe markdown body without error", async () => {
    const authorizationService = new AuthorizationService();
    const savedPost = {
      id: "post-new",
      title: "Safe Post",
      slug: "safe-post",
      body: "# Hello\n\nWorld.",
      status: "draft",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      create: vi.fn().mockReturnValue(savedPost),
      save: vi.fn().mockResolvedValue(savedPost),
      findOne: vi.fn().mockResolvedValue({ ...savedPost, postTags: [] })
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.create("user-1", { title: "Safe Post", slug: "safe-post", body: "# Hello\n\nWorld." })
    ).resolves.toBeDefined();
  });

  it("update() rejects a body containing a <script> tag", async () => {
    const existingPost = {
      id: "post-1",
      title: "Existing",
      slug: "existing",
      body: "original",
      status: "draft",
      summary: null,
      featuredImageId: null,
      isFeatured: false,
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(existingPost),
      save: vi.fn().mockResolvedValue(existingPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.update("post-1", { body: "<script>document.cookie</script>" })
    ).rejects.toThrow(BadRequestException);
  });

  it("update() accepts a safe body change without error", async () => {
    const existingPost = {
      id: "post-1",
      title: "Existing",
      slug: "existing",
      body: "original",
      status: "draft",
      summary: null,
      featuredImageId: null,
      isFeatured: false,
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue({ ...existingPost, postTags: [] }),
      save: vi.fn().mockResolvedValue(existingPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.update("post-1", { body: "Updated **safe** body." })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AC4: featuredImageId validation against media_references
// ---------------------------------------------------------------------------

describe("BlogService featuredImageId validation (AC4)", () => {
  it("create() throws BadRequestException when featuredImageId does not exist in media_references", async () => {
    const authorizationService = new AuthorizationService();
    // mediaRepository.findOne returns null (media record not found)
    const mediaRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null)
    };
    const service = new BlogService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      mediaRepo as never,
      authorizationService
    );
    await expect(
      service.create("user-1", {
        title: "Post With Image",
        slug: "post-with-image",
        body: "Body text",
        featuredImageId: "nonexistent-media-id"
      })
    ).rejects.toThrow(BadRequestException);
  });

  it("update() throws BadRequestException when featuredImageId does not exist in media_references", async () => {
    const existingPost = {
      id: "post-1",
      title: "Existing",
      slug: "existing",
      body: "original",
      status: "draft",
      summary: null,
      featuredImageId: null,
      isFeatured: false,
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(existingPost),
      save: vi.fn().mockResolvedValue(existingPost)
    };
    const mediaRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      mediaRepo as never,
      authorizationService
    );
    await expect(
      service.update("post-1", { featuredImageId: "nonexistent-media-id" })
    ).rejects.toThrow(BadRequestException);
  });

  it("create() succeeds when featuredImageId references an existing media record", async () => {
    const authorizationService = new AuthorizationService();
    const savedPost = {
      id: "post-new",
      title: "Image Post",
      slug: "image-post",
      body: "Body",
      status: "draft",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      create: vi.fn().mockReturnValue(savedPost),
      save: vi.fn().mockResolvedValue(savedPost),
      findOne: vi.fn().mockResolvedValue({ ...savedPost, postTags: [] })
    };
    const mediaRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue({ id: "media-123", filename: "photo.jpg" })
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      mediaRepo as never,
      authorizationService
    );
    await expect(
      service.create("user-1", {
        title: "Image Post",
        slug: "image-post",
        body: "Body",
        featuredImageId: "media-123"
      })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AC5: publishAt and toggleFeatured behavior
// ---------------------------------------------------------------------------

describe("BlogService.publishAt (scheduling) (AC5/AC2)", () => {
  it("publishAt() sets status=published with a future publishedAt", async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const post = {
      id: "post-1",
      status: "draft",
      publishedAt: null,
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValueOnce(post).mockResolvedValueOnce({
        ...post,
        status: "published",
        publishedAt: futureDate,
        postTags: []
      }),
      save: vi.fn().mockResolvedValue(post)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.publishAt("post-1", futureDate);
    expect(result.status).toBe("published");
    expect(result.publishedAt).toBe(futureDate);
  });

  it("publishAt() throws NotFoundException for unknown post id", async () => {
    const service = makeBlogService();
    await expect(service.publishAt("nonexistent", new Date())).rejects.toThrow(NotFoundException);
  });
});

describe("BlogService.toggleFeatured (pin/unpin) (AC5)", () => {
  it("toggleFeatured() flips isFeatured from false to true", async () => {
    const post = {
      id: "post-1",
      status: "published",
      isFeatured: false,
      publishedAt: new Date(),
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValueOnce(post).mockResolvedValueOnce({
        ...post,
        isFeatured: true,
        postTags: []
      }),
      save: vi.fn().mockResolvedValue(post)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.toggleFeatured("post-1");
    expect(result.isFeatured).toBe(true);
  });

  it("toggleFeatured() flips isFeatured from true to false", async () => {
    const post = {
      id: "post-1",
      status: "published",
      isFeatured: true,
      publishedAt: new Date(),
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValueOnce(post).mockResolvedValueOnce({
        ...post,
        isFeatured: false,
        postTags: []
      }),
      save: vi.fn().mockResolvedValue(post)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.toggleFeatured("post-1");
    expect(result.isFeatured).toBe(false);
  });

  it("toggleFeatured() throws NotFoundException for unknown post id", async () => {
    const service = makeBlogService();
    await expect(service.toggleFeatured("nonexistent")).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// AC1: createComment blocks on future-dated published post
// ---------------------------------------------------------------------------

describe("BlogService.createComment future-dated post guard (AC1)", () => {
  it("throws NotFoundException when post is published but publishedAt is in the future", async () => {
    const futureDatedPost = {
      id: "post-future",
      status: "published",
      publishedAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      title: "Future Post",
      slug: "future-post",
      body: "body",
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(futureDatedPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(futureDatedPost.id, "user-1", { body: "Comment on future post" })
    ).rejects.toThrow(NotFoundException);
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

  it("throws NotFoundException when post is not published (draft)", async () => {
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
    ).rejects.toThrow(NotFoundException);
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
  it("throws NotFoundException when post is unpublished", async () => {
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
    ).rejects.toThrow(NotFoundException);
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
// AC1: createComment rejects commentsLocked post
// ---------------------------------------------------------------------------

describe("BlogService.createComment commentsLocked guard (AC1)", () => {
  it("throws ForbiddenException when post.commentsLocked is true", async () => {
    const lockedPost = {
      id: "post-locked",
      status: "published",
      publishedAt: new Date(Date.now() - 1000),
      commentsLocked: true,
      title: "Locked Post",
      slug: "locked-post",
      body: "body",
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(lockedPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(lockedPost.id, "user-1", { body: "New comment on locked post" })
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows comment creation when commentsLocked is false", async () => {
    const unlockedPost = {
      id: "post-unlocked",
      status: "published",
      publishedAt: new Date(Date.now() - 1000),
      commentsLocked: false,
      title: "Unlocked Post",
      slug: "unlocked-post",
      body: "body",
      postTags: []
    };
    const savedComment = {
      id: "comment-new",
      postId: unlockedPost.id,
      authorUserId: "user-1",
      body: "Valid comment",
      status: "visible",
      parentId: null,
      mediaReferenceId: null,
      moderatedByUserId: null,
      moderatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(unlockedPost)
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
    await expect(
      service.createComment(unlockedPost.id, "user-1", { body: "Valid comment" })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AC1: createComment 1-level threading enforcement
// ---------------------------------------------------------------------------

describe("BlogService.createComment parentId 1-level nesting enforcement (AC1)", () => {
  const publishedPost = {
    id: "post-published",
    status: "published",
    publishedAt: new Date(Date.now() - 1000),
    commentsLocked: false,
    title: "Test Post",
    slug: "test-post",
    body: "body",
    postTags: []
  };

  it("throws BadRequestException when parentId references a comment that already has a parentId (depth > 1)", async () => {
    const authorizationService = new AuthorizationService();
    // Parent comment itself has a parentId — this is already a reply, so nesting would exceed 1 level.
    const alreadyReply = {
      id: "comment-already-reply",
      postId: publishedPost.id,
      parentId: "some-top-level-comment-id", // non-null — it IS already a reply
      body: "I am a reply",
      status: "visible"
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const commentRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(alreadyReply)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      commentRepo as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(publishedPost.id, "user-1", { body: "Deep reply", parentId: alreadyReply.id })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when parentId comment does not exist", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const commentRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null) // parent not found
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      commentRepo as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(publishedPost.id, "user-1", { body: "Reply", parentId: "nonexistent-parent" })
    ).rejects.toThrow(BadRequestException);
  });

  it("allows comment with a valid top-level parentId (parentId.parentId is null)", async () => {
    const authorizationService = new AuthorizationService();
    const topLevelParent = {
      id: "comment-top",
      postId: publishedPost.id,
      parentId: null, // true top-level — depth 0
      body: "Top level",
      status: "visible"
    };
    const savedReply = {
      id: "reply-new",
      postId: publishedPost.id,
      authorUserId: "user-1",
      body: "A valid reply",
      status: "visible",
      parentId: topLevelParent.id,
      mediaReferenceId: null,
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
      findOne: vi.fn().mockResolvedValue(topLevelParent),
      create: vi.fn().mockReturnValue(savedReply),
      save: vi.fn().mockResolvedValue(savedReply)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      commentRepo as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(publishedPost.id, "user-1", { body: "A valid reply", parentId: topLevelParent.id })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AC2: createComment imageId scope validation
// ---------------------------------------------------------------------------

describe("BlogService.createComment imageId scope validation (AC2)", () => {
  const publishedPost = {
    id: "post-pub",
    status: "published",
    publishedAt: new Date(Date.now() - 1000),
    commentsLocked: false,
    title: "Post",
    slug: "post",
    body: "body",
    postTags: []
  };

  it("throws BadRequestException when imageId does not exist in media_references", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const mediaRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null) // media record not found
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      mediaRepo as never,
      authorizationService
    );
    await expect(
      service.createComment(publishedPost.id, "user-1", { body: "Comment with image", imageId: "missing-media-id" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when imageId references a media record with wrong resourceType", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const wrongScopeMedia = {
      id: "media-wrong-scope",
      resourceType: "blog-post", // Not "blog-comment" — wrong scope
      filename: "photo.jpg"
    };
    const mediaRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(wrongScopeMedia)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      mediaRepo as never,
      authorizationService
    );
    await expect(
      service.createComment(publishedPost.id, "user-1", { body: "Comment with wrong scope image", imageId: wrongScopeMedia.id })
    ).rejects.toThrow(BadRequestException);
  });

  it("succeeds when imageId references a blog-comment-scoped media record", async () => {
    const authorizationService = new AuthorizationService();
    const savedComment = {
      id: "comment-with-img",
      postId: publishedPost.id,
      authorUserId: "user-1",
      body: "Comment with valid image",
      status: "visible",
      parentId: null,
      mediaReferenceId: "media-blog-comment",
      moderatedByUserId: null,
      moderatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const correctScopeMedia = {
      id: "media-blog-comment",
      resourceType: "blog-comment",
      filename: "comment-photo.jpg"
    };
    const mediaRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(correctScopeMedia)
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
      mediaRepo as never,
      authorizationService
    );
    const result = await service.createComment(publishedPost.id, "user-1", {
      body: "Comment with valid image",
      imageId: correctScopeMedia.id
    });
    expect(result.mediaReferenceId).toBe("media-blog-comment");
  });
});

// ---------------------------------------------------------------------------
// Oracle-parity: parentId rejection messages are uniform across both failure cases
// Both "not found" and "belongs to different post" must yield the same 400 message
// so callers cannot distinguish a nonexistent parent from a valid-but-foreign one.
// ---------------------------------------------------------------------------

describe("BlogService.createComment parentId oracle-parity: uniform 400 message (subtask-3)", () => {
  const EXPECTED_MESSAGE = "parentId is invalid.";
  const publishedPost = {
    id: "post-published",
    status: "published",
    publishedAt: new Date(Date.now() - 1000),
    commentsLocked: false,
    title: "Test Post",
    slug: "test-post",
    body: "body",
    postTags: []
  };

  it("nonexistent parentId yields 'parentId is invalid.' (same message as foreign-post case)", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const commentRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null) // parent comment not found
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      commentRepo as never,
      createMinimalRepository() as never,
      authorizationService
    );
    let caughtMessage = "";
    try {
      await service.createComment(publishedPost.id, "user-1", { body: "Reply", parentId: "nonexistent-parent-id" });
    } catch (err: unknown) {
      const e = err as { message?: string };
      caughtMessage = e.message ?? "";
    }
    expect(caughtMessage).toBe(EXPECTED_MESSAGE);
  });

  it("parentId belonging to a different post yields 'parentId is invalid.' (same message as nonexistent case)", async () => {
    const authorizationService = new AuthorizationService();
    const foreignParent = {
      id: "comment-from-other-post",
      postId: "other-post-id", // different from publishedPost.id
      parentId: null,
      body: "Foreign comment",
      status: "visible"
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const commentRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(foreignParent)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      commentRepo as never,
      createMinimalRepository() as never,
      authorizationService
    );
    let caughtMessage = "";
    try {
      await service.createComment(publishedPost.id, "user-1", { body: "Reply", parentId: foreignParent.id });
    } catch (err: unknown) {
      const e = err as { message?: string };
      caughtMessage = e.message ?? "";
    }
    expect(caughtMessage).toBe(EXPECTED_MESSAGE);
  });

  it("both parentId failure cases produce identical messages (oracle-parity assertion)", async () => {
    const authorizationService = new AuthorizationService();
    const foreignParent = {
      id: "foreign-comment",
      postId: "other-post-id",
      parentId: null,
      body: "Foreign",
      status: "visible"
    };

    const makeService = (commentRepoFindOneResult: unknown) => {
      const postRepo = {
        ...createMinimalRepository(),
        findOne: vi.fn().mockResolvedValue(publishedPost)
      };
      const commentRepo = {
        ...createMinimalRepository(),
        findOne: vi.fn().mockResolvedValue(commentRepoFindOneResult)
      };
      return new BlogService(
        postRepo as never,
        createMinimalRepository() as never,
        commentRepo as never,
        createMinimalRepository() as never,
        authorizationService
      );
    };

    const messages: string[] = [];
    for (const findOneResult of [null, foreignParent]) {
      const service = makeService(findOneResult);
      try {
        await service.createComment(publishedPost.id, "user-1", { body: "Reply", parentId: "some-parent-id" });
        messages.push("NO_THROW");
      } catch (err: unknown) {
        const e = err as { message?: string; name?: string };
        messages.push(`${e.name ?? "Unknown"}:${e.message ?? ""}`);
      }
    }
    // Both cases must produce identical exception class and message.
    const unique = new Set(messages);
    expect(unique.size).toBe(1);
    expect(messages[0]).toBe(`BadRequestException:${EXPECTED_MESSAGE}`);
  });
});

// ---------------------------------------------------------------------------
// Oracle-parity: imageId rejection messages are uniform across both failure cases
// Both "does not exist" and "wrong resourceType" must yield the same 400 message
// so callers cannot distinguish a nonexistent image from a valid-but-wrong-scope one.
// ---------------------------------------------------------------------------

describe("BlogService.createComment imageId oracle-parity: uniform 400 message (subtask-3)", () => {
  const EXPECTED_MESSAGE = "imageId is invalid.";
  const publishedPost = {
    id: "post-pub",
    status: "published",
    publishedAt: new Date(Date.now() - 1000),
    commentsLocked: false,
    title: "Post",
    slug: "post",
    body: "body",
    postTags: []
  };

  it("nonexistent imageId yields 'imageId is invalid.' (same message as wrong-scope case)", async () => {
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const mediaRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null) // media record not found
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      mediaRepo as never,
      authorizationService
    );
    let caughtMessage = "";
    try {
      await service.createComment(publishedPost.id, "user-1", { body: "Comment", imageId: "nonexistent-media-id" });
    } catch (err: unknown) {
      const e = err as { message?: string };
      caughtMessage = e.message ?? "";
    }
    expect(caughtMessage).toBe(EXPECTED_MESSAGE);
  });

  it("imageId with wrong resourceType yields 'imageId is invalid.' (same message as nonexistent case)", async () => {
    const authorizationService = new AuthorizationService();
    const wrongScopeMedia = {
      id: "media-wrong-scope",
      resourceType: "blog-post", // Not "blog-comment"
      filename: "photo.jpg"
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(publishedPost)
    };
    const mediaRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(wrongScopeMedia)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      mediaRepo as never,
      authorizationService
    );
    let caughtMessage = "";
    try {
      await service.createComment(publishedPost.id, "user-1", { body: "Comment", imageId: wrongScopeMedia.id });
    } catch (err: unknown) {
      const e = err as { message?: string };
      caughtMessage = e.message ?? "";
    }
    expect(caughtMessage).toBe(EXPECTED_MESSAGE);
  });

  it("both imageId failure cases produce identical messages (oracle-parity assertion)", async () => {
    const authorizationService = new AuthorizationService();
    const wrongScopeMedia = {
      id: "media-wrong",
      resourceType: "standalone-page",
      filename: "img.jpg"
    };

    const makeService = (mediaFindOneResult: unknown) => {
      const postRepo = {
        ...createMinimalRepository(),
        findOne: vi.fn().mockResolvedValue(publishedPost)
      };
      const mediaRepo = {
        ...createMinimalRepository(),
        findOne: vi.fn().mockResolvedValue(mediaFindOneResult)
      };
      return new BlogService(
        postRepo as never,
        createMinimalRepository() as never,
        createMinimalRepository() as never,
        mediaRepo as never,
        authorizationService
      );
    };

    const messages: string[] = [];
    for (const findOneResult of [null, wrongScopeMedia]) {
      const service = makeService(findOneResult);
      try {
        await service.createComment(publishedPost.id, "user-1", { body: "Comment", imageId: "some-image-id" });
        messages.push("NO_THROW");
      } catch (err: unknown) {
        const e = err as { message?: string; name?: string };
        messages.push(`${e.name ?? "Unknown"}:${e.message ?? ""}`);
      }
    }
    // Both cases must produce identical exception class and message.
    const unique = new Set(messages);
    expect(unique.size).toBe(1);
    expect(messages[0]).toBe(`BadRequestException:${EXPECTED_MESSAGE}`);
  });
});

// ---------------------------------------------------------------------------
// AC3: lockComments / unlockComments
// ---------------------------------------------------------------------------

describe("BlogService.lockComments and unlockComments (AC3)", () => {
  it("lockComments() sets commentsLocked=true and returns updated post", async () => {
    const post = {
      id: "post-1",
      status: "published",
      commentsLocked: false,
      publishedAt: new Date(Date.now() - 1000),
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const lockedPost = { ...post, commentsLocked: true, postTags: [] };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn()
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce(lockedPost),
      save: vi.fn().mockResolvedValue(lockedPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.lockComments("post-1");
    expect(result.commentsLocked).toBe(true);
  });

  it("unlockComments() sets commentsLocked=false and returns updated post", async () => {
    const post = {
      id: "post-1",
      status: "published",
      commentsLocked: true,
      publishedAt: new Date(Date.now() - 1000),
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const unlockedPost = { ...post, commentsLocked: false, postTags: [] };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn()
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce(unlockedPost),
      save: vi.fn().mockResolvedValue(unlockedPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.unlockComments("post-1");
    expect(result.commentsLocked).toBe(false);
  });

  it("lockComments() throws NotFoundException for unknown post id", async () => {
    const service = makeBlogService();
    await expect(service.lockComments("nonexistent")).rejects.toThrow(NotFoundException);
  });

  it("unlockComments() throws NotFoundException for unknown post id", async () => {
    const service = makeBlogService();
    await expect(service.unlockComments("nonexistent")).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// findVisibleComments — replies relation loaded
// ---------------------------------------------------------------------------

describe("BlogService.findVisibleComments replies relation (AC1)", () => {
  it("loads the replies relation so visible replies appear nested", async () => {
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
      relations: expect.arrayContaining(["replies"])
    }));
  });
});

// ---------------------------------------------------------------------------
// Slug auto-generation — no-slug path, collision (-2 suffix), empty fallback
// ---------------------------------------------------------------------------

describe("BlogService slug auto-generation", () => {
  // Shared helper: build a BlogService whose blogPostRepository.findOne returns
  // null (no existing slug collision) so the auto-derive path succeeds.
  const makeBlogServiceWithPostRepo = (postRepo: MinimalRepo): BlogService => {
    const authorizationService = new AuthorizationService();
    return new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
  };

  // AC: creating with no slug succeeds and produces a URL-safe slug from the title.
  it("create() with no slug auto-derives a URL-safe slug from the title", async () => {
    const savedPost = {
      id: "post-auto",
      title: "Hello World",
      slug: "hello-world",
      body: "body",
      status: "draft",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      // findOne: first call checks slug uniqueness (returns null = not taken),
      // second call is the reload after save.
      findOne: vi.fn()
        .mockResolvedValueOnce(null)        // slug "hello-world" not taken
        .mockResolvedValueOnce(savedPost),  // reload after save
      create: vi.fn().mockReturnValue(savedPost),
      save: vi.fn().mockResolvedValue(savedPost)
    };
    const service = makeBlogServiceWithPostRepo(postRepo);
    const result = await service.create("user-1", { title: "Hello World", body: "body" });
    // Slug must be URL-safe (lowercase alphanumeric with hyphens).
    expect(result.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(result.slug).toBe("hello-world");
  });

  // AC: creating with blank slug (empty string) triggers auto-generation.
  it("create() with blank slug string auto-derives from the title", async () => {
    const savedPost = {
      id: "post-blank",
      title: "My Post",
      slug: "my-post",
      body: "body",
      status: "draft",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn()
        .mockResolvedValueOnce(null)       // slug "my-post" not taken
        .mockResolvedValueOnce(savedPost), // reload
      create: vi.fn().mockReturnValue(savedPost),
      save: vi.fn().mockResolvedValue(savedPost)
    };
    const service = makeBlogServiceWithPostRepo(postRepo);
    const result = await service.create("user-1", { title: "My Post", slug: "", body: "body" });
    expect(result.slug).toBe("my-post");
  });

  // AC: when the base slug is already taken, a -2 numeric suffix is appended.
  it("create() appends -2 suffix when base slug is already in use", async () => {
    const savedPost = {
      id: "post-new",
      title: "Hello World",
      slug: "hello-world-2",
      body: "body",
      status: "draft",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn()
        .mockResolvedValueOnce({ id: "existing", slug: "hello-world" }) // base slug taken
        .mockResolvedValueOnce(null)         // "hello-world-2" not taken
        .mockResolvedValueOnce(savedPost),   // reload after save
      create: vi.fn().mockReturnValue(savedPost),
      save: vi.fn().mockResolvedValue(savedPost)
    };
    const service = makeBlogServiceWithPostRepo(postRepo);
    const result = await service.create("user-1", { title: "Hello World", body: "body" });
    expect(result.slug).toBe("hello-world-2");
  });

  // AC: titles that slugify to empty string fall back to "post".
  it("create() uses 'post' as fallback when title slugifies to empty string", async () => {
    const savedPost = {
      id: "post-fallback",
      title: "!!!",
      slug: "post",
      body: "body",
      status: "draft",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn()
        .mockResolvedValueOnce(null)          // "post" not taken
        .mockResolvedValueOnce(savedPost),    // reload
      create: vi.fn().mockReturnValue(savedPost),
      save: vi.fn().mockResolvedValue(savedPost)
    };
    const service = makeBlogServiceWithPostRepo(postRepo);
    const result = await service.create("user-1", { title: "!!!", body: "body" });
    expect(result.slug).toBe("post");
  });

  // AC: providing an explicit valid slug uses it unchanged.
  it("create() uses an explicit slug unchanged when it is valid", async () => {
    const savedPost = {
      id: "post-explicit",
      title: "Some Title",
      slug: "my-explicit-slug",
      body: "body",
      status: "draft",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      // findOne is only called once (reload after save) — no slug-uniqueness check
      // when an explicit slug is provided.
      findOne: vi.fn().mockResolvedValue(savedPost),
      create: vi.fn().mockReturnValue(savedPost),
      save: vi.fn().mockResolvedValue(savedPost)
    };
    const service = makeBlogServiceWithPostRepo(postRepo);
    const result = await service.create("user-1", { title: "Some Title", slug: "my-explicit-slug", body: "body" });
    expect(result.slug).toBe("my-explicit-slug");
  });

  // AC: providing an explicit invalid slug still throws BadRequestException.
  it("create() throws BadRequestException for an invalid explicit slug", async () => {
    const service = makeBlogService();
    await expect(
      service.create("user-1", { title: "Some Title", slug: "INVALID SLUG!", body: "body" })
    ).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// Oracle-parity: createComment produces identical NotFoundException for nonexistent,
// draft, unpublished, and future-scheduled posts (security invariant: AC closure).
// A caller with a known UUID must not be able to distinguish post existence from
// non-public visibility through the createComment path.
// ---------------------------------------------------------------------------

describe("BlogService.createComment oracle-parity: non-public posts indistinguishable from nonexistent", () => {
  const EXPECTED_MESSAGE = "Blog post not found.";
  const userId = "authenticated-user";
  const body = "Comment body";

  async function expectNotFoundException(postRepo: MinimalRepo): Promise<void> {
    const authorizationService = new AuthorizationService();
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    // Must throw NotFoundException (not ForbiddenException) so the HTTP status
    // and envelope message are identical to the truly-nonexistent-post case.
    await expect(
      service.createComment("some-post-uuid", userId, { body })
    ).rejects.toThrow(NotFoundException);
  }

  it("nonexistent post (null from repo) throws NotFoundException", async () => {
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null)
    };
    await expectNotFoundException(postRepo);
  });

  it("draft post throws NotFoundException (same as nonexistent)", async () => {
    const draftPost = {
      id: "some-post-uuid",
      status: "draft",
      publishedAt: null,
      title: "Draft",
      slug: "draft",
      body: "body",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(draftPost)
    };
    await expectNotFoundException(postRepo);
  });

  it("unpublished post throws NotFoundException (same as nonexistent)", async () => {
    const unpublishedPost = {
      id: "some-post-uuid",
      status: "unpublished",
      publishedAt: null,
      title: "Unpublished",
      slug: "unpublished",
      body: "body",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(unpublishedPost)
    };
    await expectNotFoundException(postRepo);
  });

  it("future-scheduled post throws NotFoundException (same as nonexistent)", async () => {
    const futurePost = {
      id: "some-post-uuid",
      status: "published",
      publishedAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour in the future
      title: "Future",
      slug: "future",
      body: "body",
      postTags: []
    };
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(futurePost)
    };
    await expectNotFoundException(postRepo);
  });

  it("all four cases throw NotFoundException with identical message", async () => {
    const cases = [
      null,
      { id: "some-post-uuid", status: "draft", publishedAt: null, title: "D", slug: "d", body: "b", postTags: [] },
      { id: "some-post-uuid", status: "unpublished", publishedAt: null, title: "U", slug: "u", body: "b", postTags: [] },
      { id: "some-post-uuid", status: "published", publishedAt: new Date(Date.now() + 3600_000), title: "F", slug: "f", body: "b", postTags: [] }
    ];
    const messages: string[] = [];
    for (const postValue of cases) {
      const authorizationService = new AuthorizationService();
      const postRepo = {
        ...createMinimalRepository(),
        findOne: vi.fn().mockResolvedValue(postValue)
      };
      const service = new BlogService(
        postRepo as never,
        createMinimalRepository() as never,
        createMinimalRepository() as never,
        createMinimalRepository() as never,
        authorizationService
      );
      try {
        await service.createComment("some-post-uuid", userId, { body });
        messages.push("NO_THROW");
      } catch (err: unknown) {
        const e = err as { message?: string; name?: string };
        messages.push(`${e.name ?? "Unknown"}:${e.message ?? ""}`);
      }
    }
    // Every case must produce the same error class and message.
    const unique = new Set(messages);
    expect(unique.size).toBe(1);
    expect(messages[0]).toBe(`NotFoundException:${EXPECTED_MESSAGE}`);
  });
});

// ---------------------------------------------------------------------------
// Regression: commentsLocked ForbiddenException is preserved on public posts.
// A locked PUBLIC post is legitimately visible; its 403 is not an oracle.
// ---------------------------------------------------------------------------

describe("BlogService.createComment commentsLocked ForbiddenException regression", () => {
  it("a locked public post throws ForbiddenException (not NotFoundException)", async () => {
    const lockedPublicPost = {
      id: "post-locked-public",
      status: "published",
      publishedAt: new Date(Date.now() - 60_000), // in the past — genuinely public
      commentsLocked: true,
      title: "Locked Public Post",
      slug: "locked-public-post",
      body: "body",
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(lockedPublicPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    await expect(
      service.createComment(lockedPublicPost.id, "user-1", { body: "Trying to comment on locked post" })
    ).rejects.toThrow(ForbiddenException);
    // Must specifically be ForbiddenException (not NotFoundException) — locked posts
    // are visible and their 403 is the correct, intentional response.
    await expect(
      service.createComment(lockedPublicPost.id, "user-1", { body: "Trying again" })
    ).rejects.not.toThrow(NotFoundException);
  });

  it("commentsLocked ForbiddenException message is 'Comments are locked on this post.'", async () => {
    const lockedPublicPost = {
      id: "post-locked-msg",
      status: "published",
      publishedAt: new Date(Date.now() - 60_000),
      commentsLocked: true,
      title: "Locked",
      slug: "locked",
      body: "body",
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(lockedPublicPost)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    let caughtMessage = "";
    try {
      await service.createComment(lockedPublicPost.id, "user-1", { body: "Comment" });
    } catch (err: unknown) {
      const e = err as { message?: string };
      caughtMessage = e.message ?? "";
    }
    expect(caughtMessage).toBe("Comments are locked on this post.");
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
