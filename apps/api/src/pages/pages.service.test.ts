import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { PagesService } from "./pages.service";
import type { PageRevisionEntity } from "./entities/page-revision.entity";
import type { StandalonePageEntity } from "./entities/standalone-page.entity";

// Minimal Repository stub — only the methods called by PagesService are needed.
type MinimalRepository<T> = {
  find: (opts?: unknown) => Promise<T[]>;
  findOne: (opts?: unknown) => Promise<T | null>;
};

const createMinimalRepository = <T>(): MinimalRepository<T> => ({
  find: async () => [],
  findOne: async () => null
});

const makePagesService = (): PagesService => {
  const authorizationService = new AuthorizationService();
  return new PagesService(
    createMinimalRepository<StandalonePageEntity>() as never,
    createMinimalRepository<PageRevisionEntity>() as never,
    authorizationService
  );
};

describe("PagesService.assertAdminManagementAccess", () => {
  // Acceptance criterion: PagesService.assertAdminManagementAccess() enforces
  // admin-only site-wide management by delegating to
  // AuthorizationService.hasGlobalRole('admin').

  it("allows the admin global role to manage standalone pages", () => {
    const service = makePagesService();
    // Should not throw for a user with the admin role.
    expect(() => service.assertAdminManagementAccess("admin")).not.toThrow();
  });

  it("throws ForbiddenException when the caller has the user role", () => {
    const service = makePagesService();
    expect(() => service.assertAdminManagementAccess("user")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when the caller has the moderator role", () => {
    const service = makePagesService();
    // Moderator is below admin — page management is admin-only.
    expect(() => service.assertAdminManagementAccess("moderator")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when the caller has no role (empty string)", () => {
    const service = makePagesService();
    expect(() => service.assertAdminManagementAccess("")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for an unrecognised role", () => {
    const service = makePagesService();
    expect(() => service.assertAdminManagementAccess("editor")).toThrow(ForbiddenException);
  });
});
