import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { BlogService } from "./blog.service";
import type { BlogCommentEntity } from "./entities/blog-comment.entity";
import type { BlogPostEntity } from "./entities/blog-post.entity";

// Minimal Repository stub — only the methods called by BlogService are needed.
type MinimalRepository<T> = {
  find: (opts?: unknown) => Promise<T[]>;
  findOne: (opts?: unknown) => Promise<T | null>;
};

const createMinimalRepository = <T>(): MinimalRepository<T> => ({
  find: async () => [],
  findOne: async () => null
});

const makeBlogService = (): BlogService => {
  const authorizationService = new AuthorizationService();
  return new BlogService(
    createMinimalRepository<BlogPostEntity>() as never,
    createMinimalRepository<BlogCommentEntity>() as never,
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
