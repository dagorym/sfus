import { ForbiddenException, Injectable } from "@nestjs/common";

import type {
  AuthorizationDecision,
  AuthorizationDecisionInput,
  GlobalRole,
  ResourceVisibility
} from "./authorization.types";

const roleRank: Record<GlobalRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2
};

const actionRank = {
  read: 0,
  write: 1,
  admin: 2
} as const;

const aclRank: Record<string, number> = {
  viewer: actionRank.read,
  editor: actionRank.write,
  owner: actionRank.admin
};

@Injectable()
export class AuthorizationService {
  hasGlobalRole(globalRole: string | null | undefined, requiredRole: GlobalRole): boolean {
    if (!globalRole) {
      return false;
    }
    const actorRank = roleRank[globalRole as GlobalRole];
    const minimumRank = roleRank[requiredRole];
    if (actorRank === undefined) {
      return false;
    }
    return actorRank >= minimumRank;
  }

  evaluate(input: AuthorizationDecisionInput): AuthorizationDecision {
    const { actor, resource, action } = input;
    const aclRoles = input.aclRoles || [];

    if (this.hasGlobalRole(actor.globalRole, "admin")) {
      return { allowed: true, reason: "global-admin" };
    }

    if (this.hasGlobalRole(actor.globalRole, "moderator") && this.canModeratorOverride(resource.visibility, action)) {
      return { allowed: true, reason: "global-moderator" };
    }

    if (action === "read" && (resource.visibility === "public" || resource.visibility === "unlisted")) {
      return { allowed: true, reason: "visibility-open" };
    }

    if (!actor.userId) {
      return { allowed: false, reason: "authentication-required" };
    }

    if (resource.ownerUserId && actor.userId === resource.ownerUserId) {
      return { allowed: true, reason: "resource-owner" };
    }

    if (this.hasAclRole(aclRoles, action)) {
      return { allowed: true, reason: "acl-grant" };
    }

    if (action === "read") {
      if (resource.visibility === "members") {
        return { allowed: true, reason: "member-visibility" };
      }
      if (resource.visibility === "project-only" && resource.projectId && actor.projectIds?.includes(resource.projectId)) {
        return { allowed: true, reason: "project-visibility" };
      }
    }

    return { allowed: false, reason: "access-denied" };
  }

  assertAllowed(input: AuthorizationDecisionInput): void {
    const decision = this.evaluate(input);
    if (!decision.allowed) {
      throw new ForbiddenException(`Authorization denied: ${decision.reason}.`);
    }
  }

  private canModeratorOverride(visibility: ResourceVisibility, action: AuthorizationDecisionInput["action"]): boolean {
    if (action === "admin") {
      return false;
    }
    return visibility !== "private";
  }

  private hasAclRole(roles: string[], requiredAction: AuthorizationDecisionInput["action"]): boolean {
    const requiredRank = actionRank[requiredAction];
    return roles.some((role) => {
      const rank = aclRank[role] ?? -1;
      return rank >= requiredRank;
    });
  }
}
