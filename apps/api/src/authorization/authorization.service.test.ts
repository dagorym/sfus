import { describe, expect, it } from "vitest";

import { AuthorizationService } from "./authorization.service";

describe("AuthorizationService", () => {
  const service = new AuthorizationService();

  it("allows admin global role for all actions", () => {
    expect(
      service.evaluate({
        actor: { userId: "user-1", globalRole: "admin" },
        resource: {
          resourceType: "content-item",
          resourceId: "resource-1",
          ownerUserId: "user-2",
          visibility: "private"
        },
        action: "admin"
      })
    ).toMatchObject({ allowed: true, reason: "global-admin" });
  });

  it("supports open visibility for anonymous reads", () => {
    expect(
      service.evaluate({
        actor: { userId: null, globalRole: "user" },
        resource: {
          resourceType: "content-item",
          resourceId: "resource-1",
          visibility: "public"
        },
        action: "read"
      })
    ).toMatchObject({ allowed: true, reason: "visibility-open" });
  });

  it("requires authentication for non-open resources", () => {
    expect(
      service.evaluate({
        actor: { userId: null, globalRole: "user" },
        resource: {
          resourceType: "content-item",
          resourceId: "resource-1",
          visibility: "members"
        },
        action: "read"
      })
    ).toMatchObject({ allowed: false, reason: "authentication-required" });
  });

  it("supports ACL roles and project scoped decisions", () => {
    expect(
      service.evaluate({
        actor: { userId: "user-3", globalRole: "user" },
        resource: {
          resourceType: "content-item",
          resourceId: "resource-1",
          ownerUserId: "user-2",
          visibility: "private"
        },
        action: "write",
        aclRoles: ["editor"]
      })
    ).toMatchObject({ allowed: true, reason: "acl-grant" });

    expect(
      service.evaluate({
        actor: { userId: "user-3", globalRole: "user", projectIds: ["project-7"] },
        resource: {
          resourceType: "content-item",
          resourceId: "resource-1",
          visibility: "project-only",
          projectId: "project-7"
        },
        action: "read"
      })
    ).toMatchObject({ allowed: true, reason: "project-visibility" });
  });
});
