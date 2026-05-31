import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { BlogService } from "./blog.service";

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
      scheduledAt: null,
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
      authorizationService
    );
    const result = await service.publish("post-1");
    expect(result.status).toBe("published");
    expect(result.publishedAt).not.toBeNull();
  });

  it("unpublish() sets status to unpublished", async () => {
    const post = {
      id: "post-1",
      status: "published",
      publishedAt: new Date(),
      scheduledAt: null,
      postTags: []
    };
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValueOnce(post).mockResolvedValueOnce({ ...post, status: "unpublished", postTags: [] }),
      save: vi.fn().mockResolvedValue(post)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.unpublish("post-1");
    expect(result.status).toBe("unpublished");
  });

  it("schedule() sets status to scheduled and records scheduledAt", async () => {
    const post = {
      id: "post-1",
      status: "draft",
      publishedAt: null,
      scheduledAt: null,
      postTags: []
    };
    const futureDate = new Date(Date.now() + 60_000);
    const authorizationService = new AuthorizationService();
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValueOnce(post).mockResolvedValueOnce({ ...post, status: "scheduled", scheduledAt: futureDate, postTags: [] }),
      save: vi.fn().mockResolvedValue(post)
    };
    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    const result = await service.schedule("post-1", futureDate);
    expect(result.status).toBe("scheduled");
    expect(result.scheduledAt).toEqual(futureDate);
  });

  it("schedule() rejects a past scheduledAt", async () => {
    const service = makeBlogService();
    const pastDate = new Date(Date.now() - 1000);
    await expect(service.schedule("post-1", pastDate)).rejects.toThrow(BadRequestException);
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

  it("findPublished() only queries for status=published (public-route filtering)", async () => {
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
      authorizationService
    );
    await service.findPublished();
    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "published" })
    }));
  });

  it("findPublishedBySlug() only queries for status=published (public-route filtering)", async () => {
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
      authorizationService
    );
    await service.findPublishedBySlug("my-post");
    expect(findOneSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ slug: "my-post", status: "published" })
    }));
  });
});
