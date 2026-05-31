import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { NavigationService } from "./navigation.service";
import type { NavigationItemEntity } from "./entities/navigation-item.entity";

// Minimal Repository stub — only the methods called by NavigationService are needed.
type MinimalRepository<T> = {
  find: (opts?: unknown) => Promise<T[]>;
  findOne: (opts?: unknown) => Promise<T | null>;
};

const createMinimalRepository = <T>(): MinimalRepository<T> => ({
  find: async () => [],
  findOne: async () => null
});

const makeNavigationService = (): NavigationService => {
  const authorizationService = new AuthorizationService();
  return new NavigationService(
    createMinimalRepository<NavigationItemEntity>() as never,
    authorizationService
  );
};

describe("NavigationService.assertAdminManagementAccess", () => {
  // Acceptance criterion: NavigationService.assertAdminManagementAccess() enforces
  // admin-only site-wide management by delegating to
  // AuthorizationService.hasGlobalRole('admin').

  it("allows the admin global role to manage navigation items", () => {
    const service = makeNavigationService();
    // Should not throw for a user with the admin role.
    expect(() => service.assertAdminManagementAccess("admin")).not.toThrow();
  });

  it("throws ForbiddenException when the caller has the user role", () => {
    const service = makeNavigationService();
    expect(() => service.assertAdminManagementAccess("user")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when the caller has the moderator role", () => {
    const service = makeNavigationService();
    // Moderator is below admin — navigation management is admin-only.
    expect(() => service.assertAdminManagementAccess("moderator")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when the caller has no role (empty string)", () => {
    const service = makeNavigationService();
    expect(() => service.assertAdminManagementAccess("")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for an unrecognised role", () => {
    const service = makeNavigationService();
    expect(() => service.assertAdminManagementAccess("contributor")).toThrow(ForbiddenException);
  });
});
