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

  // ---------------------------------------------------------------------------
  // Hardened internal URL validation (deferred-cleanup subtask-7)
  // ---------------------------------------------------------------------------

  it("accepts '/about' as a valid internal URL on create", async () => {
    // AC: '/about' must be accepted as a valid internal URL.
    const saved = {
      id: "item-1",
      label: "About",
      url: "/about",
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
    await expect(service.create({ label: "About", url: "/about" })).resolves.toBeDefined();
  });

  it("rejects a protocol-relative URL '//' as an internal item on create", async () => {
    // AC: '//' starts with '/' but then starts with '//' — must be rejected.
    const service = makeNavigationService();
    await expect(service.create({ label: "Bad", url: "//" })).rejects.toThrow(BadRequestException);
  });

  it("rejects a protocol-relative URL '//evil.com' as an internal item on create", async () => {
    // AC: '//evil.com' is a protocol-relative URL — rejected as internal item.
    const service = makeNavigationService();
    await expect(service.create({ label: "Bad", url: "//evil.com" })).rejects.toThrow(BadRequestException);
  });

  it("rejects a relative URL 'about' (no leading slash) as an internal item on create", async () => {
    // AC: 'about' does not start with '/' — rejected as internal item.
    const service = makeNavigationService();
    await expect(service.create({ label: "About", url: "about" })).rejects.toThrow(BadRequestException);
  });

  it("rejects 'http://example.com' as an internal item on create", async () => {
    // AC: 'http://example.com' does not start with '/' — rejected as internal item.
    const service = makeNavigationService();
    await expect(service.create({ label: "External", url: "http://example.com" })).rejects.toThrow(BadRequestException);
  });

  it("accepts 'http://example.com' as an external item on create (external validation unchanged)", async () => {
    // AC: External item validation is unchanged — 'http://example.com' passes as external.
    const saved = {
      id: "item-ext",
      label: "External",
      url: "http://example.com",
      linkType: "external",
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
    await expect(service.create({ label: "External", url: "http://example.com", linkType: "external" })).resolves.toBeDefined();
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
// Hardened internal URL validation on update (deferred-cleanup subtask-7)
// ---------------------------------------------------------------------------

describe("NavigationService.update — hardened internal URL validation (subtask-7)", () => {
  const baseItem = {
    id: "item-1",
    parentId: null,
    label: "Nav Link",
    url: "/path",
    linkType: "internal" as const,
    visibility: "public",
    sortOrder: 0,
    isActive: true,
    children: [],
    createdAt: new Date(),
    updatedAt: new Date()
  } as unknown as NavigationItemEntity;

  it("accepts '/about' as an updated internal URL", async () => {
    // AC: '/about' is valid as an internal URL on update.
    const updated = { ...baseItem, url: "/about" };
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue({ ...baseItem }),
      save: vi.fn().mockResolvedValue(updated)
    });
    const result = await service.update("item-1", { url: "/about" });
    expect(result.url).toBe("/about");
  });

  it("rejects '//' as an internal URL on update", async () => {
    // AC: '//' is rejected on update when linkType remains internal.
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue({ ...baseItem })
    });
    await expect(service.update("item-1", { url: "//" })).rejects.toThrow(BadRequestException);
  });

  it("rejects '//evil.com' as an internal URL on update", async () => {
    // AC: '//evil.com' is rejected on update for an internal item.
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue({ ...baseItem })
    });
    await expect(service.update("item-1", { url: "//evil.com" })).rejects.toThrow(BadRequestException);
  });

  it("rejects 'about' (no leading slash) as an internal URL on update", async () => {
    // AC: 'about' lacks a leading '/' — rejected on update for an internal item.
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue({ ...baseItem })
    });
    await expect(service.update("item-1", { url: "about" })).rejects.toThrow(BadRequestException);
  });

  it("accepts 'http://example.com' when simultaneously switching to linkType=external on update", async () => {
    // AC: Simultaneous linkType+url changes use the incoming linkType — 'http://example.com'
    // is valid when linkType is updated to 'external' in the same call.
    const updated = { ...baseItem, url: "http://example.com", linkType: "external" as const };
    const service = makeNavigationService({
      findOne: vi.fn().mockResolvedValue({ ...baseItem }),
      save: vi.fn().mockResolvedValue(updated)
    });
    const result = await service.update("item-1", { url: "http://example.com", linkType: "external" });
    expect(result.url).toBe("http://example.com");
    expect(result.linkType).toBe("external");
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

  it("renders a bare /pages nav item as a static route regardless of standalone-page publication state", async () => {
    // AC: 'pages' is now in RESERVED_PAGE_SLUGS so a nav item with url='/pages' must always
    // be included in the public response without consulting the standalone_pages table.
    // This pins the always-rendered static-route behavior for the bare /pages path.
    const item = makePublicItem({ url: "/pages", linkType: "internal" });
    const pageRepoFindOne = vi.fn(); // must NOT be called for reserved slugs
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: pageRepoFindOne }
    );
    const result = await service.findPublic();
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/pages");
    // The standalone_pages table must not be consulted for a reserved slug.
    expect(pageRepoFindOne).not.toHaveBeenCalled();
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
    // URLs use reserved slugs (multi-segment or RESERVED_PAGE_SLUGS) so they pass
    // the publication filter without requiring page/blog mocks (behavior under test
    // is the visibility filter, not the publication filter).
    const adminChild = makePublicItem({ id: "child-admin", parentId: "parent", label: "Manage", url: "/admin/manage", visibility: "admin" });
    const publicChild = makePublicItem({ id: "child-pub", parentId: "parent", label: "View", url: "/app", visibility: "public" });
    const parent = makePublicItem({ id: "parent", url: "/app", visibility: "public", children: [adminChild, publicChild] });
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
    // URLs use reserved slugs so they pass the publication filter without additional mocks
    // (behavior under test is isActive filtering, not publication filtering).
    const inactiveChild = makePublicItem({ id: "child-inactive", parentId: "parent", label: "Gone", url: "/blog", isActive: false });
    const activeChild = makePublicItem({ id: "child-active", parentId: "parent", label: "Active", url: "/app", isActive: true });
    const parent = makePublicItem({ id: "parent", url: "/app", visibility: "public", children: [inactiveChild, activeChild] });
    const service = makeNavigationService({
      find: vi.fn().mockResolvedValue([parent])
    });
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(1);
    expect(result[0].children.map((c) => c.id)).not.toContain("child-inactive");
    expect(result[0].children.map((c) => c.id)).toContain("child-active");
  });
});

// ---------------------------------------------------------------------------
// AC1 (ms3-review-closeout subtask-7): findForAuthenticatedUser — non-admin
//   publication filtering mirrors findPublic
// ---------------------------------------------------------------------------

describe("NavigationService.findForAuthenticatedUser — non-admin publication filtering", () => {
  it("omits a non-admin top-level item whose linked blog post is unpublished", async () => {
    // AC1: Non-admin users must not see nav items linking to unpublished blog posts —
    // identical publication guard to the public endpoint.
    const item = makePublicItem({ id: "blog-item", url: "/blog/draft-post", visibility: "public" });
    const blogFindOne = vi.fn().mockResolvedValue(null); // no published post found
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      { findOne: blogFindOne }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(0);
  });

  it("includes a non-admin top-level item whose linked blog post is published and publishedAt<=now", async () => {
    // AC1: Published blog post target must be visible to non-admin authenticated users.
    const item = makePublicItem({ id: "blog-item", url: "/blog/published-post", visibility: "public" });
    const mockPost = { slug: "published-post", status: "published", publishedAt: new Date(Date.now() - 1000) };
    const blogFindOne = vi.fn().mockResolvedValue(mockPost);
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      { findOne: blogFindOne }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/blog/published-post");
  });

  it("pins blog publication predicate: blogPost findOne must be called with status='published'", async () => {
    // Security pin: a regression dropping the status condition on the blog query must not
    // silently pass — we assert the findOne call included the status='published' predicate.
    const item = makePublicItem({ id: "blog-item", url: "/blog/some-post", visibility: "public" });
    const mockPost = { slug: "some-post", status: "published", publishedAt: new Date(Date.now() - 1000) };
    const blogFindOne = vi.fn().mockResolvedValue(mockPost);
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      { findOne: blogFindOne }
    );
    await service.findForAuthenticatedUser("user");
    expect(blogFindOne).toHaveBeenCalled();
    const callArg = blogFindOne.mock.calls[0][0] as { where?: { status?: string; slug?: string; publishedAt?: unknown } };
    expect(callArg?.where?.status).toBe("published");
    expect(callArg?.where?.slug).toBe("some-post");
    // publishedAt must be a TypeORM LessThanOrEqual FindOperator, not just a Date or plain object.
    // Key-presence or typeof alone would not distinguish LessThanOrEqual from a plain equality filter.
    const publishedAtOperator = callArg?.where?.publishedAt as { type?: string };
    expect(publishedAtOperator).toHaveProperty("type");
    expect(publishedAtOperator.type).toBe("lessThanOrEqual");
  });

  it("omits a non-admin top-level item whose linked standalone page is unpublished", async () => {
    // AC1: Non-admin users must not see nav items linking to unpublished standalone pages.
    const item = makePublicItem({ id: "page-item", url: "/pages/draft-page", visibility: "public" });
    const pageFindOne = vi.fn().mockResolvedValue(null); // no published page found
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: pageFindOne }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(0);
  });

  it("includes a non-admin top-level item whose linked standalone page is published", async () => {
    // AC1: Published standalone page target must be visible to non-admin authenticated users.
    const item = makePublicItem({ id: "page-item", url: "/pages/about", visibility: "public" });
    const mockPage = { slug: "about", status: "published" };
    const pageFindOne = vi.fn().mockResolvedValue(mockPage);
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: pageFindOne }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/pages/about");
  });

  it("pins standalone page publication predicate: pageFindOne must be called with status='published'", async () => {
    // Security pin: a regression dropping the status condition on the page query must not
    // silently pass — we assert the findOne call included the status='published' predicate.
    const item = makePublicItem({ id: "page-item", url: "/pages/some-page", visibility: "public" });
    const mockPage = { slug: "some-page", status: "published" };
    const pageFindOne = vi.fn().mockResolvedValue(mockPage);
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: pageFindOne }
    );
    await service.findForAuthenticatedUser("user");
    expect(pageFindOne).toHaveBeenCalled();
    const callArg = pageFindOne.mock.calls[0][0] as { where?: { status?: string; slug?: string } };
    expect(callArg?.where?.status).toBe("published");
    expect(callArg?.where?.slug).toBe("some-page");
  });

  it("omits a non-admin top-level item linking to an unpublished page via canonical top-level route (/<slug>)", async () => {
    // AC1: /<slug> canonical route to an unpublished standalone page must be omitted
    // for non-admin authenticated users, matching the public endpoint behavior.
    const item = makePublicItem({ id: "canonical-item", url: "/about", visibility: "public" });
    const pageFindOne = vi.fn().mockResolvedValue(null); // no published page found for slug "about"
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: pageFindOne }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(0);
  });

  it("includes a non-admin top-level item linking to a published page via canonical top-level route (/<slug>)", async () => {
    // AC1: /<slug> canonical route must appear for non-admin authenticated users when the
    // standalone page is published.
    const item = makePublicItem({ id: "canonical-item", url: "/about", visibility: "public" });
    const mockPage = { slug: "about", status: "published" };
    const pageFindOne = vi.fn().mockResolvedValue(mockPage);
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: pageFindOne }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/about");
  });

  it("keeps external-link items regardless of publication status for non-admin users", async () => {
    // AC1: External links always pass the filter for non-admin authenticated users.
    const item = makePublicItem({ id: "ext-item", url: "https://example.com", linkType: "external", visibility: "public" });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://example.com");
  });

  it("keeps reserved single-segment slugs always visible for non-admin users", async () => {
    // AC1: Reserved top-level slugs (RESERVED_PAGE_SLUGS) are treated as static
    // routes and always pass the visibility filter for non-admin authenticated users.
    const item = makePublicItem({ id: "reserved-item", url: "/profile", linkType: "internal", visibility: "public" });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/profile");
  });

  it("admin users see all items regardless of publication state (no publication filtering for admin)", async () => {
    // AC2: Admin callers bypass publication filtering — unpublished-target items remain visible.
    const item = makePublicItem({ id: "blog-item", url: "/blog/draft-post", visibility: "public" });
    const blogFindOne = vi.fn().mockResolvedValue(null); // would be filtered for non-admin
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      { findOne: blogFindOne }
    );
    const result = await service.findForAuthenticatedUser("admin");
    // Admin bypasses publication filtering — item must appear
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/blog/draft-post");
    // Confirm the blog repo was NOT consulted for admin (publication filter skipped)
    expect(blogFindOne).not.toHaveBeenCalled();
  });

  it("admin users see all items even when standalone page target is unpublished", async () => {
    // AC2: Admin bypass applies to standalone page targets too.
    const item = makePublicItem({ id: "page-item", url: "/pages/draft-page", visibility: "public" });
    const pageFindOne = vi.fn().mockResolvedValue(null); // would be filtered for non-admin
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: pageFindOne }
    );
    const result = await service.findForAuthenticatedUser("admin");
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("/pages/draft-page");
    expect(pageFindOne).not.toHaveBeenCalled();
  });

  it("filters children publication state for non-admin users (child blog link to unpublished post omitted)", async () => {
    // AC1: Child items with unpublished blog post links must be omitted for non-admin users.
    const draftChild = makePublicItem({ id: "child-draft", parentId: "parent", url: "/blog/draft-post", isActive: true, visibility: "public" });
    const publishedChild = makePublicItem({ id: "child-pub", parentId: "parent", url: "/blog/published-post", isActive: true, visibility: "public" });
    const parent = makePublicItem({ id: "parent", url: "/app", visibility: "public", children: [draftChild, publishedChild] });
    const publishedPost = { slug: "published-post", status: "published", publishedAt: new Date(Date.now() - 1000) };
    const blogFindOne = vi.fn().mockImplementation((opts: { where?: { slug?: string } }) => {
      if (opts?.where?.slug === "published-post") return Promise.resolve(publishedPost);
      return Promise.resolve(null); // draft-post returns null
    });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([parent]) },
      { findOne: blogFindOne }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(1);
    expect(result[0].children.map((c) => c.id)).not.toContain("child-draft");
    expect(result[0].children.map((c) => c.id)).toContain("child-pub");
  });

  it("admin children publication filtering skipped — admin sees children regardless of publication state", async () => {
    // AC2: Admin bypass applies to children as well — unpublished-target children remain visible.
    const draftChild = makePublicItem({ id: "child-draft", parentId: "parent", url: "/blog/draft-post", isActive: true, visibility: "public" });
    const parent = makePublicItem({ id: "parent", url: "/app", visibility: "public", children: [draftChild] });
    const blogFindOne = vi.fn().mockResolvedValue(null); // would filter draft for non-admin
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([parent]) },
      { findOne: blogFindOne }
    );
    const result = await service.findForAuthenticatedUser("admin");
    expect(result).toHaveLength(1);
    expect(result[0].children.map((c) => c.id)).toContain("child-draft");
    expect(blogFindOne).not.toHaveBeenCalled();
  });

  it("authenticated-only items (visibility=authenticated) are included for non-admin users with published targets", async () => {
    // AC1: Items with visibility=authenticated that point to published targets must appear
    // for non-admin authenticated users (visibility-only filter is not the same as publication filter).
    const item = makePublicItem({ id: "auth-item", url: "/pages/member-page", visibility: "authenticated" });
    const mockPage = { slug: "member-page", status: "published" };
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: vi.fn().mockResolvedValue(mockPage) }
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("auth-item");
  });

  it("authenticated-only items (visibility=authenticated) are omitted when target is unpublished for non-admin users", async () => {
    // Security: non-admin callers must not learn existence of unpublished content even
    // through authenticated-visibility nav items — publication filtering applies regardless of visibility.
    const item = makePublicItem({ id: "auth-item", url: "/pages/member-draft", visibility: "authenticated" });
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([item]) },
      undefined,
      { findOne: vi.fn().mockResolvedValue(null) } // no published page
    );
    const result = await service.findForAuthenticatedUser("user");
    expect(result).toHaveLength(0);
  });

  it("moderator role is treated as non-admin and receives publication filtering (subtask-7)", async () => {
    // AC (tester subtask-7): moderator is below admin — publication filtering must apply,
    // and admin-visibility items must be excluded, matching the 'user' role behavior.
    const adminItem = makePublicItem({ id: "admin-item", url: "/admin", visibility: "admin", label: "Admin" });
    const draftBlogItem = makePublicItem({ id: "draft-item", url: "/blog/draft-post", visibility: "public" });
    const blogFindOne = vi.fn().mockResolvedValue(null); // draft — no published post
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([adminItem, draftBlogItem]) },
      { findOne: blogFindOne }
    );
    const result = await service.findForAuthenticatedUser("moderator");
    // Admin-visibility item must be excluded for moderator
    expect(result.map((i) => i.id)).not.toContain("admin-item");
    // Draft-target item must be excluded by publication filtering for moderator
    expect(result.map((i) => i.id)).not.toContain("draft-item");
  });

  it("all children filtered out by publication state but parent is still visible (edge case, subtask-7)", async () => {
    // Edge case: when all of a top-level item's children are filtered out by publication
    // filtering, the parent itself must still appear if its own target is publicly visible.
    const draftChild = makePublicItem({
      id: "child-draft",
      parentId: "parent",
      url: "/blog/draft-child",
      isActive: true,
      visibility: "public"
    });
    const parent = makePublicItem({
      id: "parent",
      url: "/app",  // reserved slug — parent passes publication filter without mock
      visibility: "public",
      children: [draftChild]
    });
    const blogFindOne = vi.fn().mockResolvedValue(null); // child's blog post is draft
    const service = makeNavigationService(
      { find: vi.fn().mockResolvedValue([parent]) },
      { findOne: blogFindOne }
    );
    const result = await service.findForAuthenticatedUser("user");
    // Parent must still appear even though all children were filtered
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("parent");
    // Children array must be empty after filtering
    expect(result[0].children).toHaveLength(0);
  });
});
