import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { NavigationService } from "./navigation.service";
import type { NavigationItemEntity } from "./entities/navigation-item.entity";

// Minimal Repository stub — only the methods called by NavigationService are needed.
type MinimalRepository<T> = {
  find: (opts?: unknown) => Promise<T[]>;
  findOne: (opts?: unknown) => Promise<T | null>;
  findOneBy?: (opts?: unknown) => Promise<T | null>;
  save: (entity: T) => Promise<T>;
  create: (partial?: unknown) => T;
  remove: (entity: T) => Promise<T>;
  count: (opts?: unknown) => Promise<number>;
};

const createMinimalRepository = <T>(): MinimalRepository<T> => ({
  find: async () => [],
  findOne: async () => null,
  save: async (e) => e,
  create: (partial) => ({ ...(partial as object) }) as T,
  remove: async (e) => e,
  count: async () => 0
});

const makeNavigationService = (
  repoOverrides?: Partial<MinimalRepository<NavigationItemEntity>>,
  blogRepoOverrides?: Partial<MinimalRepository<{ slug: string; status: string; publishedAt: Date | null }>>,
  pageRepoOverrides?: Partial<MinimalRepository<{ slug: string; status: string }>>
): NavigationService => {
  const authorizationService = new AuthorizationService();
  const repo = { ...createMinimalRepository<NavigationItemEntity>(), ...repoOverrides };
  const blogRepo = { ...createMinimalRepository<never>(), ...blogRepoOverrides };
  const pageRepo = { ...createMinimalRepository<never>(), ...pageRepoOverrides };
  return new NavigationService(
    repo as never,
    blogRepo as never,
    pageRepo as never,
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

// ---------------------------------------------------------------------------
// AC1: Nav items can be created via NavigationService.create()
// ---------------------------------------------------------------------------

describe("NavigationService.create", () => {
  it("creates a nav item with required fields and defaults", async () => {
    // AC1: POST /navigation/admin creates a nav item.
    const saved = {
      id: "item-1",
      label: "Home",
      url: "/",
      linkType: "internal",
      visibility: "public",
      sortOrder: 0,
      isActive: true,
      parentId: null,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as NavigationItemEntity;
    const service = makeNavigationService({
      create: vi.fn().mockReturnValue(saved),
      save: vi.fn().mockResolvedValue(saved)
    });
    const result = await service.create({ label: "Home", url: "/" });
    expect(result.label).toBe("Home");
    expect(result.url).toBe("/");
    expect(result.isActive).toBe(true);
  });

  it("throws BadRequestException for empty label", async () => {
    // AC1: Input validation — label is required.
    const service = makeNavigationService();
    await expect(service.create({ label: "   ", url: "/" })).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException for empty url", async () => {
    // AC1: Input validation — url is required.
    const service = makeNavigationService();
    await expect(service.create({ label: "Link", url: "  " })).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException for label exceeding 128 characters", async () => {
    // AC1: Input validation — label length.
    const service = makeNavigationService();
    await expect(service.create({ label: "x".repeat(129), url: "/path" })).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException for invalid linkType", async () => {
    // AC1: Input validation — linkType enum.
    const service = makeNavigationService();
    await expect(service.create({ label: "Link", url: "/path", linkType: "invalid" as never })).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException for invalid visibility", async () => {
    // AC1: Input validation — visibility enum.
    const service = makeNavigationService();
    await expect(service.create({ label: "Link", url: "/path", visibility: "secret" as never })).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// AC2: Nav structure supports 1-level nesting — assertValidParent enforcement
// ---------------------------------------------------------------------------

describe("NavigationService.create — 1-level nesting (AC2)", () => {
  it("creates a child item when parent is a valid top-level item", async () => {
    // AC2: Child items are allowed when parent has parentId === null.
    const parent = {
      id: "parent-1",
      parentId: null,
      label: "Parent",
      url: "/parent",
      linkType: "internal",
      visibility: "public",
      sortOrder: 0,
      isActive: true,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as NavigationItemEntity;
    const child = { ...parent, id: "child-1", parentId: "parent-1", label: "Child", url: "/child" } as NavigationItemEntity;
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue(parent),
      create: vi.fn().mockReturnValue(child),
      save: vi.fn().mockResolvedValue(child)
    });
    const result = await service.create({ label: "Child", url: "/child", parentId: "parent-1" });
    expect(result.parentId).toBe("parent-1");
  });

  it("throws BadRequestException when parent does not exist", async () => {
    // AC2: assertValidParent rejects missing parent.
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue(null)
    });
    await expect(service.create({ label: "Child", url: "/child", parentId: "nonexistent" })).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when trying to nest deeper than 1 level (parent is already a child)", async () => {
    // AC2: assertValidParent rejects a parent that itself has a parentId (grandchild nesting).
    const alreadyChild = {
      id: "child-1",
      parentId: "parent-1",  // this item is already a child — cannot be used as a parent
      label: "Child",
      url: "/child",
      linkType: "internal",
      visibility: "public",
      sortOrder: 0,
      isActive: true,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as NavigationItemEntity;
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue(alreadyChild)
    });
    await expect(service.create({ label: "Grandchild", url: "/gc", parentId: "child-1" })).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// AC1: Nav items can be updated (ordered, toggled visible/hidden)
// ---------------------------------------------------------------------------

describe("NavigationService.update — ordering and visibility (AC1)", () => {
  const baseItem = {
    id: "item-1",
    parentId: null,
    label: "Nav Link",
    url: "/path",
    linkType: "internal",
    visibility: "public",
    sortOrder: 5,
    isActive: true,
    children: [],
    createdAt: new Date(),
    updatedAt: new Date()
  } as unknown as NavigationItemEntity;

  it("toggles isActive from true to false (hide)", async () => {
    // AC1: PATCH /navigation/admin/:id can toggle visibility.
    const updated = { ...baseItem, isActive: false };
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue({ ...baseItem }),
      save: vi.fn().mockResolvedValue(updated)
    });
    const result = await service.update("item-1", { isActive: false });
    expect(result.isActive).toBe(false);
  });

  it("toggles isActive from false to true (show)", async () => {
    // AC1: PATCH /navigation/admin/:id can toggle back to visible.
    const hiddenItem = { ...baseItem, isActive: false };
    const updated = { ...hiddenItem, isActive: true };
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue({ ...hiddenItem }),
      save: vi.fn().mockResolvedValue(updated)
    });
    const result = await service.update("item-1", { isActive: true });
    expect(result.isActive).toBe(true);
  });

  it("updates sortOrder for reordering", async () => {
    // AC1: PATCH /navigation/admin/:id can change sortOrder.
    const updated = { ...baseItem, sortOrder: 10 };
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue({ ...baseItem }),
      save: vi.fn().mockResolvedValue(updated)
    });
    const result = await service.update("item-1", { sortOrder: 10 });
    expect(result.sortOrder).toBe(10);
  });

  it("throws NotFoundException for unknown item id", async () => {
    // AC1: Update requires item to exist.
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue(null)
    });
    await expect(service.update("nonexistent", { isActive: false })).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// AC2: Update prevents re-nesting a top-level item that has children
// ---------------------------------------------------------------------------

describe("NavigationService.update — 1-level nesting constraint on re-parent (AC2)", () => {
  it("throws BadRequestException when re-parenting a top-level item that has children", async () => {
    // AC2: Cannot reparent a top-level item that has children into a child slot.
    const topLevelWithChildren = {
      id: "item-1",
      parentId: null,
      label: "Parent",
      url: "/parent",
      linkType: "internal",
      visibility: "public",
      sortOrder: 0,
      isActive: true,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as NavigationItemEntity;
    const newParent = {
      id: "other-1",
      parentId: null,
      label: "Other Top",
      url: "/other",
      linkType: "internal",
      visibility: "public",
      sortOrder: 1,
      isActive: true,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as NavigationItemEntity;
    const service = makeNavigationService({
      findOne: vi.fn()
        .mockResolvedValueOnce(topLevelWithChildren)   // findByIdOrThrow
        .mockResolvedValueOnce(newParent),              // assertValidParent
      count: vi.fn().mockResolvedValue(2)               // has 2 children
    });
    await expect(service.update("item-1", { parentId: "other-1" })).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// AC1: Nav items can be deleted
// ---------------------------------------------------------------------------

describe("NavigationService.delete (AC1)", () => {
  it("deletes a nav item by id", async () => {
    // AC1: DELETE /navigation/admin/:id removes the item.
    const item = {
      id: "item-1",
      parentId: null,
      label: "Nav Link",
      url: "/path",
      linkType: "internal",
      visibility: "public",
      sortOrder: 0,
      isActive: true,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as NavigationItemEntity;
    const removeSpy = vi.fn().mockResolvedValue(item);
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue(item),
      remove: removeSpy
    });
    await expect(service.delete("item-1")).resolves.toBeUndefined();
    expect(removeSpy).toHaveBeenCalledWith(item);
  });

  it("throws NotFoundException for unknown item id", async () => {
    // AC1: Delete requires item to exist.
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue(null)
    });
    await expect(service.delete("nonexistent")).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// AC2 (subtask-6): findPublic — publication-aware filtering
// ---------------------------------------------------------------------------

const makePublicItem = (overrides: Partial<NavigationItemEntity> = {}): NavigationItemEntity =>
  ({
    id: "item-pub",
    parentId: null,
    label: "Blog",
    url: "/blog/some-post",
    linkType: "internal",
    visibility: "public",
    sortOrder: 0,
    isActive: true,
    children: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  } as NavigationItemEntity);

describe("NavigationService.findPublic — publication-aware filtering (AC2 subtask-6)", () => {
  it("returns a top-level item whose linked blog post is published and publishedAt<=now", async () => {
    // AC2: /blog/<slug> target must be status=published and publishedAt<=now to appear.
    const item = makePublicItem({ url: "/blog/published-post" });
    const mockPost = { slug: "published-post", status: "published", publishedAt: new Date(Date.now() - 1000) };
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      { findOne: vi.fn().mockResolvedValue(mockPost) }
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/blog/published-post");
  });

  it("omits a top-level item whose linked blog post is not published", async () => {
    // AC2: Unpublished blog post target must not leak to guests.
    const item = makePublicItem({ url: "/blog/draft-post" });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      { findOne: vi.fn().mockResolvedValue(null) }  // no published post found
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(0);
  });

  it("omits a top-level item whose linked standalone page is not published", async () => {
    // AC2: /pages/<slug> target must be status=published to appear.
    const item = makePublicItem({ url: "/pages/draft-page" });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: vi.fn().mockResolvedValue(null) }  // no published page found
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(0);
  });

  it("returns a top-level item whose linked standalone page is published", async () => {
    // AC2: Published /pages/<slug> target must be included.
    const item = makePublicItem({ url: "/pages/about" });
    const mockPage = { slug: "about", status: "published" };
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: vi.fn().mockResolvedValue(mockPage) }
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/pages/about");
  });

  it("keeps external-link items regardless of publication status", async () => {
    // AC2: External links always pass the filter — they have no linked internal target.
    const item = makePublicItem({ url: "https://example.com", linkType: "external" });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) }
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(1);
  });

  it("keeps reserved single-segment slugs (static routes) always visible", async () => {
    // AC2: Reserved top-level slugs (RESERVED_PAGE_SLUGS) are treated as static
    // routes and always pass the visibility filter without querying the page table.
    const item = makePublicItem({ url: "/app", linkType: "internal" });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) }
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(1);
  });

  it("omits a top-level item linking to an unpublished top-level page (/<slug> canonical route)", async () => {
    // New AC (subtask-3): /<slug> canonical route to an unpublished standalone page must be
    // omitted from public navigation — prevents draft-page leakage via top-level slug.
    const item = makePublicItem({ url: "/about", linkType: "internal" });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: vi.fn().mockResolvedValue(null) }  // no published page found for slug "about"
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(0);
  });

  it("includes a top-level item linking to a published top-level page (/<slug> canonical route)", async () => {
    // New AC (subtask-3): /<slug> canonical route must appear in public navigation when the
    // standalone page with that slug is published — published pages must not be hidden.
    const item = makePublicItem({ url: "/about", linkType: "internal" });
    const mockPage = { slug: "about", status: "published" };
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: vi.fn().mockResolvedValue(mockPage) }
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/about");
  });

  it("filters out inactive children from public results", async () => {
    // AC2: Children filtered to isActive=true + visibility=public.
    // Parent and active child use reserved slugs so they pass the publication filter as static routes.
    const activeChild = makePublicItem({ id: "child-a", parentId: "item-pub", label: "Active", url: "/blog", isActive: true });
    const inactiveChild = makePublicItem({ id: "child-b", parentId: "item-pub", label: "Inactive", url: "/health", isActive: false });
    const parent = makePublicItem({ url: "/app", children: [activeChild, inactiveChild] });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([parent]) }
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe("child-a");
  });

  it("filters out non-public children from public results", async () => {
    // AC2: Children with visibility != public are excluded from public results.
    // Parent and public child use reserved slugs so they pass the publication filter as static routes.
    const publicChild = makePublicItem({ id: "child-a", parentId: "item-pub", label: "Public", url: "/blog", visibility: "public" });
    const authChild = makePublicItem({ id: "child-b", parentId: "item-pub", label: "Auth", url: "/app", visibility: "authenticated" });
    const parent = makePublicItem({ url: "/app", children: [publicChild, authChild] });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([parent]) }
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe("child-a");
  });
});

// ---------------------------------------------------------------------------
// AC3 (subtask-6): findForAuthenticatedUser — admin visibility exclusion
// ---------------------------------------------------------------------------

describe("NavigationService.findForAuthenticatedUser — admin visibility exclusion (AC3 subtask-6)", () => {
  const adminItem = makePublicItem({ id: "admin-item", url: "/admin", visibility: "admin", label: "Admin" });
  const publicItem = makePublicItem({ id: "public-item", url: "/blog", visibility: "public", label: "Blog" });

  it("excludes admin-visibility top-level items for non-admin users", async () => {
    // AC3: admin-visibility items excluded for non-admin users.
    const service = makeNavigationService({
      find: vi.fn().mockResolvedValue([adminItem, publicItem])
    });
    const result = await service.findForAuthenticatedUser("user");
    expect(result.map((i) => i.id)).not.toContain("admin-item");
    expect(result.map((i) => i.id)).toContain("public-item");
  });

  it("includes admin-visibility top-level items for admin users", async () => {
    // AC3: Admin sees admin-visibility items.
    const service = makeNavigationService({
      find: vi.fn().mockResolvedValue([adminItem, publicItem])
    });
    const result = await service.findForAuthenticatedUser("admin");
    expect(result.map((i) => i.id)).toContain("admin-item");
    expect(result.map((i) => i.id)).toContain("public-item");
  });

  it("excludes admin-visibility children for non-admin users", async () => {
    // AC3: Children visibility-filtered for non-admin users.
    const adminChild = makePublicItem({ id: "child-admin", parentId: "parent", label: "Manage", url: "/admin/manage", visibility: "admin" });
    const publicChild = makePublicItem({ id: "child-pub", parentId: "parent", label: "View", url: "/view", visibility: "public" });
    const parent = makePublicItem({ id: "parent", url: "/section", visibility: "public", children: [adminChild, publicChild] });
    const service = makeNavigationService({
      find: vi.fn().mockResolvedValue([parent])
    });
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(1);
    expect(result[0].children.map((c) => c.id)).not.toContain("child-admin");
    expect(result[0].children.map((c) => c.id)).toContain("child-pub");
  });

  it("includes all children for admin users", async () => {
    // AC3: Admin users see admin-visibility children.
    const adminChild = makePublicItem({ id: "child-admin", parentId: "parent", label: "Manage", url: "/admin/manage", visibility: "admin" });
    const publicChild = makePublicItem({ id: "child-pub", parentId: "parent", label: "View", url: "/view", visibility: "public" });
    const parent = makePublicItem({ id: "parent", url: "/section", visibility: "public", children: [adminChild, publicChild] });
    const service = makeNavigationService({
      find: vi.fn().mockResolvedValue([parent])
    });
    const result = await service.findForAuthenticatedUser("admin");
    expect(result).toHaveLength(1);
    expect(result[0].children.map((c) => c.id)).toContain("child-admin");
    expect(result[0].children.map((c) => c.id)).toContain("child-pub");
  });

  it("excludes inactive children for all users", async () => {
    // AC3: Inactive children are always excluded.
    const inactiveChild = makePublicItem({ id: "child-inactive", parentId: "parent", label: "Gone", url: "/gone", isActive: false });
    const activeChild = makePublicItem({ id: "child-active", parentId: "parent", label: "Active", url: "/active", isActive: true });
    const parent = makePublicItem({ id: "parent", url: "/section", visibility: "public", children: [inactiveChild, activeChild] });
    const service = makeNavigationService({
      find: vi.fn().mockResolvedValue([parent])
    });
    const result = await service.findForAuthenticatedUser("user");
    expect(result[0].children.map((c) => c.id)).not.toContain("child-inactive");
    expect(result[0].children.map((c) => c.id)).toContain("child-active");
  });
});
