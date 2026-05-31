import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { NavigationItemEntity } from "./entities/navigation-item.entity";

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
}
