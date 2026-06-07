import crypto from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, LessThanOrEqual, Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { BlogPostEntity } from "../blog/entities/blog-post.entity";
import { RESERVED_PAGE_SLUGS } from "../pages/pages.service";
import { StandalonePageEntity } from "../pages/entities/standalone-page.entity";
import { NavigationItemEntity, NavigationLinkType, NavigationVisibility, navigationLinkTypes, navigationVisibilities } from "./entities/navigation-item.entity";

export interface CreateNavigationItemInput {
  label: string;
  url: string;
  linkType?: NavigationLinkType;
  visibility?: NavigationVisibility;
  sortOrder?: number;
  parentId?: string | null;
}

export interface UpdateNavigationItemInput {
  label?: string;
  url?: string;
  linkType?: NavigationLinkType;
  visibility?: NavigationVisibility;
  sortOrder?: number;
  isActive?: boolean;
  parentId?: string | null;
}

/**
 * NavigationService enforces admin-only site-wide management of navigation items.
 *
 * All create/edit/delete/reorder actions require the caller to hold the global
 * "admin" role — this is the Milestone 3 locked decision for site-wide
 * navigation management.
 *
 * Public read access is limited to active items, and visibility filtering
 * ensures authenticated-only items are not surfaced to guests.
 */
@Injectable()
export class NavigationService {
  constructor(
    @InjectRepository(NavigationItemEntity)
    private readonly navigationItemRepository: Repository<NavigationItemEntity>,
    @InjectRepository(BlogPostEntity)
    private readonly blogPostRepository: Repository<BlogPostEntity>,
    @InjectRepository(StandalonePageEntity)
    private readonly standalonePageRepository: Repository<StandalonePageEntity>,
    private readonly authorizationService: AuthorizationService
  ) {}

  /**
   * Asserts that the actor holds the global admin role for site-wide
   * navigation management actions (create, edit, delete, reorder).
   */
  assertAdminManagementAccess(actorGlobalRole: string): void {
    if (!this.authorizationService.hasGlobalRole(actorGlobalRole, "admin")) {
      throw new ForbiddenException("Navigation management requires the admin role.");
    }
  }

  /**
   * Returns top-level navigation items visible to guests (visibility "public"),
   * ordered by sort_order. Includes one level of active, public children.
   *
   * Children are filtered to only include active items with visibility "public".
   * Any top-level item whose linked internal blog post or standalone page target
   * is not publicly visible is omitted — preventing leakage of unpublished content.
   * This includes items using the canonical top-level /<slug> route in addition
   * to the explicit /blog/<slug> and /pages/<slug> routes.
   *
   * This method is safe for public/guest access. Callers for authenticated
   * users should use findForAuthenticatedUser() instead.
   */
  async findPublic(): Promise<NavigationItemEntity[]> {
    const items = await this.navigationItemRepository.find({
      where: { parentId: IsNull(), isActive: true, visibility: "public" },
      order: { sortOrder: "ASC" },
      relations: ["children"]
    });

    const filtered: NavigationItemEntity[] = [];
    for (const item of items) {
      // Filter children: only active children with visibility "public"
      item.children = (item.children ?? []).filter(
        (child) => child.isActive && child.visibility === "public"
      );
      // Filter children by linked-target publication status
      item.children = await this.filterByLinkedTargetVisibility(item.children);
      // Check whether this top-level item's own linked target is publicly visible
      if (await this.isLinkedTargetPubliclyVisible(item)) {
        filtered.push(item);
      }
    }
    return filtered;
  }

  /**
   * Returns all active top-level navigation items visible to authenticated
   * users (visibility "public" or "authenticated"), ordered by sort_order.
   * Includes one level of active, non-admin children.
   *
   * Items with visibility "admin" are excluded from non-admin results.
   * Children are filtered to only include active items with non-admin visibility.
   * Requires the caller's globalRole to distinguish admin vs. non-admin users.
   *
   * Non-admin callers receive the same linked-target publication filtering as
   * the public endpoint: any top-level item or child whose internal link targets
   * an unpublished standalone page or blog post is omitted. Admin callers receive
   * all items without linked-target filtering, preserving their staging and
   * nav-management view.
   *
   * Safe for authenticated users (requires a valid session at the controller level).
   */
  async findForAuthenticatedUser(actorGlobalRole: string): Promise<NavigationItemEntity[]> {
    const isAdmin = this.authorizationService.hasGlobalRole(actorGlobalRole, "admin");
    const items = await this.navigationItemRepository.find({
      where: { parentId: IsNull(), isActive: true },
      order: { sortOrder: "ASC" },
      relations: ["children"]
    });

    const filtered: NavigationItemEntity[] = [];
    for (const item of items) {
      // Admin-only top-level items are excluded for non-admin users
      if (!isAdmin && item.visibility === "admin") continue;
      // Filter children: active children with non-admin visibility (or all if admin)
      item.children = (item.children ?? []).filter((child) => {
        if (!child.isActive) return false;
        if (!isAdmin && child.visibility === "admin") return false;
        return true;
      });
      // Non-admin callers: apply the same linked-target publication filtering
      // as the public endpoint so unpublished-target items are not disclosed
      // to self-registered users via metadata (slug/label existence).
      if (!isAdmin) {
        item.children = await this.filterByLinkedTargetVisibility(item.children);
        if (!(await this.isLinkedTargetPubliclyVisible(item))) continue;
      }
      filtered.push(item);
    }
    return filtered;
  }

  /**
   * Returns all navigation items (all statuses) for admin management.
   * Top-level items ordered by sort_order; children included.
   */
  async findAll(): Promise<NavigationItemEntity[]> {
    return this.navigationItemRepository.find({
      where: { parentId: IsNull() },
      order: { sortOrder: "ASC" },
      relations: ["children"]
    });
  }

  /**
   * Creates a new navigation item. For child items, validates that the parent
   * exists and is itself a top-level item (1-level nesting only).
   */
  async create(input: CreateNavigationItemInput): Promise<NavigationItemEntity> {
    this.validateLabel(input.label);
    const effectiveLinkType = input.linkType ?? "internal";
    this.validateUrl(input.url, effectiveLinkType);
    if (input.linkType !== undefined) {
      this.validateLinkType(input.linkType);
    }
    if (input.visibility !== undefined) {
      this.validateVisibility(input.visibility);
    }
    if (input.parentId) {
      await this.assertValidParent(input.parentId);
    }

    const item = this.navigationItemRepository.create({
      id: crypto.randomUUID(),
      label: input.label,
      url: input.url,
      linkType: input.linkType ?? "internal",
      visibility: input.visibility ?? "public",
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
      parentId: input.parentId ?? null
    });
    return this.navigationItemRepository.save(item);
  }

  /**
   * Updates a navigation item. Validates parent-child depth constraint when
   * parentId changes.
   */
  async update(id: string, input: UpdateNavigationItemInput): Promise<NavigationItemEntity> {
    const item = await this.findByIdOrThrow(id);

    if (input.label !== undefined) {
      this.validateLabel(input.label);
      item.label = input.label;
    }
    if (input.url !== undefined) {
      const effectiveLinkType = input.linkType ?? item.linkType;
      this.validateUrl(input.url, effectiveLinkType);
      item.url = input.url;
    }
    if (input.linkType !== undefined) {
      this.validateLinkType(input.linkType);
      item.linkType = input.linkType;
    }
    if (input.visibility !== undefined) {
      this.validateVisibility(input.visibility);
      item.visibility = input.visibility;
    }
    if (input.sortOrder !== undefined) {
      item.sortOrder = input.sortOrder;
    }
    if (input.isActive !== undefined) {
      item.isActive = input.isActive;
    }
    if (input.parentId !== undefined) {
      if (input.parentId) {
        await this.assertValidParent(input.parentId);
        // Cannot make a top-level item (which has children) into a child item.
        if (item.parentId === null) {
          const childCount = await this.navigationItemRepository.count({ where: { parentId: id } });
          if (childCount > 0) {
            throw new BadRequestException("Cannot nest an item that has children. Reassign or delete its children first.");
          }
        }
      }
      item.parentId = input.parentId;
    }

    return this.navigationItemRepository.save(item);
  }

  /**
   * Deletes a navigation item by id. Child items are removed via CASCADE.
   */
  async delete(id: string): Promise<void> {
    const item = await this.findByIdOrThrow(id);
    await this.navigationItemRepository.remove(item);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findByIdOrThrow(id: string): Promise<NavigationItemEntity> {
    const item = await this.navigationItemRepository.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException("Navigation item not found.");
    }
    return item;
  }

  /**
   * Asserts that the target parent exists and is itself a top-level item,
   * enforcing the 1-level nesting constraint.
   */
  private async assertValidParent(parentId: string): Promise<void> {
    const parent = await this.navigationItemRepository.findOne({ where: { id: parentId } });
    if (!parent) {
      throw new BadRequestException("Parent navigation item not found.");
    }
    if (parent.parentId !== null) {
      throw new BadRequestException("Nesting is limited to one level. The specified parent is already a child item.");
    }
  }

  private validateLabel(label: string): void {
    if (typeof label !== "string" || !label.trim()) {
      throw new BadRequestException("label is required.");
    }
    if (label.length > 128) {
      throw new BadRequestException("label must be 128 characters or fewer.");
    }
  }

  /**
   * Validates a navigation-item URL.
   *
   * For internal items the URL must begin with a single '/' (i.e. a root-relative
   * path). Protocol-relative URLs starting with '//' are rejected. This rule is
   * prospective-only: existing rows are not affected — the same posture used for
   * reserved-slug enforcement.
   *
   * External items are validated only for presence and maximum length.
   */
  private validateUrl(url: string, linkType: NavigationLinkType = "internal"): void {
    if (typeof url !== "string" || !url.trim()) {
      throw new BadRequestException("url is required.");
    }
    if (url.length > 512) {
      throw new BadRequestException("url must be 512 characters or fewer.");
    }
    if (linkType === "internal" && (!url.startsWith("/") || url.startsWith("//"))) {
      throw new BadRequestException("Internal navigation item URLs must begin with a single '/' (e.g. '/about').");
    }
  }

  private validateLinkType(linkType: string): void {
    if (!(navigationLinkTypes as readonly string[]).includes(linkType)) {
      throw new BadRequestException(`linkType must be one of: ${navigationLinkTypes.join(", ")}.`);
    }
  }

  private validateVisibility(visibility: string): void {
    if (!(navigationVisibilities as readonly string[]).includes(visibility)) {
      throw new BadRequestException(`visibility must be one of: ${navigationVisibilities.join(", ")}.`);
    }
  }

  /**
   * Filters a list of navigation items by checking whether each item's linked
   * internal blog post or standalone page target is publicly visible.
   * Items with linkType "external" or with static-route URLs are kept as-is.
   * See isLinkedTargetPubliclyVisible for the full resolution rules.
   */
  private async filterByLinkedTargetVisibility(items: NavigationItemEntity[]): Promise<NavigationItemEntity[]> {
    const result: NavigationItemEntity[] = [];
    for (const item of items) {
      if (await this.isLinkedTargetPubliclyVisible(item)) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Returns true if the item's linked target is publicly visible.
   * External links always pass. Internal links are checked against the
   * blog post and standalone page tables:
   *   - /blog/<slug> → must be status=published AND publishedAt<=now
   *   - /pages/<slug> → must be status=published
   *   - /<slug> (single-segment, non-reserved path) → resolved against
   *     standalone_pages; must be status=published. Slugs in the
   *     RESERVED_PAGE_SLUGS denylist are treated as static routes and
   *     are always shown.
   * Internal links to any other path (static routes) are kept as-is (return true).
   */
  private async isLinkedTargetPubliclyVisible(item: NavigationItemEntity): Promise<boolean> {
    if (item.linkType !== "internal") {
      return true;
    }
    const now = new Date();
    // Match /blog/<slug>
    const blogMatch = /^\/blog\/([^/]+)\/?$/.exec(item.url);
    if (blogMatch) {
      const slug = blogMatch[1];
      const post = await this.blogPostRepository.findOne({
        where: { slug, status: "published", publishedAt: LessThanOrEqual(now) }
      });
      return post !== null;
    }
    // Match /pages/<slug>
    const pagesMatch = /^\/pages\/([^/]+)\/?$/.exec(item.url);
    if (pagesMatch) {
      const slug = pagesMatch[1];
      const page = await this.standalonePageRepository.findOne({
        where: { slug, status: "published" }
      });
      return page !== null;
    }
    // Match /<slug> — single-segment, non-reserved top-level path
    const topLevelMatch = /^\/([^/]+)\/?$/.exec(item.url);
    if (topLevelMatch) {
      const slug = topLevelMatch[1];
      // Reserved slugs are static routes; always visible
      if (RESERVED_PAGE_SLUGS.has(slug)) {
        return true;
      }
      // Non-reserved single-segment paths resolve against standalone_pages
      const page = await this.standalonePageRepository.findOne({
        where: { slug, status: "published" }
      });
      return page !== null;
    }
    // Non-blog/page internal links (static routes) are always shown
    return true;
  }
}
