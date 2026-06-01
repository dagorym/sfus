import crypto from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
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
   * ordered by sort_order. Includes one level of active children.
   *
   * This method is safe for public/guest access. Callers for authenticated
   * users should use findForAuthenticatedUser() instead.
   */
  async findPublic(): Promise<NavigationItemEntity[]> {
    return this.navigationItemRepository.find({
      where: { parentId: IsNull(), isActive: true, visibility: "public" },
      order: { sortOrder: "ASC" },
      relations: ["children"]
    });
  }

  /**
   * Returns all active top-level navigation items (both public and
   * authenticated-visibility), ordered by sort_order. Includes one level of
   * active children. Safe for authenticated users.
   */
  async findForAuthenticatedUser(): Promise<NavigationItemEntity[]> {
    return this.navigationItemRepository.find({
      where: { parentId: IsNull(), isActive: true },
      order: { sortOrder: "ASC" },
      relations: ["children"]
    });
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
    this.validateUrl(input.url);
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
      this.validateUrl(input.url);
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

  private validateUrl(url: string): void {
    if (typeof url !== "string" || !url.trim()) {
      throw new BadRequestException("url is required.");
    }
    if (url.length > 512) {
      throw new BadRequestException("url must be 512 characters or fewer.");
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
}
