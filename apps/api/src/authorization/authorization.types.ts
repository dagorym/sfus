export const globalRoles = ["user", "moderator", "admin"] as const;
export type GlobalRole = (typeof globalRoles)[number];

export const resourceVisibilities = ["public", "unlisted", "members", "project-only", "private"] as const;
export type ResourceVisibility = (typeof resourceVisibilities)[number];

export const authorizationActions = ["read", "write", "admin"] as const;
export type AuthorizationAction = (typeof authorizationActions)[number];

export interface AuthorizationActor {
  userId: string | null;
  globalRole: string;
  projectIds?: string[];
}

export interface AuthorizationResource {
  resourceType: string;
  resourceId: string;
  ownerUserId?: string | null;
  visibility: ResourceVisibility;
  projectId?: string | null;
}

export interface AuthorizationDecisionInput {
  actor: AuthorizationActor;
  resource: AuthorizationResource;
  action: AuthorizationAction;
  aclRoles?: string[];
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
}
