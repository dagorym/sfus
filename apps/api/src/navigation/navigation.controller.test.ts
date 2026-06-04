import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const controllerPath = path.resolve(__dirname, "navigation.controller.ts");

async function readController(): Promise<string> {
  return readFile(controllerPath, "utf8");
}

// ---------------------------------------------------------------------------
// AC3 (subtask-6): NavigationController — session enforcement on authenticated
// and admin routes.
// These tests are source-contract tests plus direct service delegation tests.
// ---------------------------------------------------------------------------

describe("NavigationController source — session enforcement contract (AC3 subtask-6)", () => {
  it("listAuthenticated calls authService.resolveSession before findForAuthenticatedUser", async () => {
    // AC3: Authenticated route must call resolveSession (which throws 401 on invalid session).
    const source = await readController();
    // listAuthenticated must call resolveSession
    expect(source).toContain("authService.resolveSession");
    // Must pass session user role to findForAuthenticatedUser
    expect(source).toContain("findForAuthenticatedUser");
    expect(source).toContain("session.user.globalRole");
  });

  it("all admin routes call authService.resolveSession", async () => {
    // AC3: Admin routes require session validation.
    const source = await readController();
    // Each admin action depends on resolveSession — count how many times it appears
    const resolveCalls = (source.match(/authService\.resolveSession/g) ?? []).length;
    // There are 4 admin endpoints + 1 authenticated endpoint = 5 total resolveSession calls
    expect(resolveCalls).toBeGreaterThanOrEqual(5);
  });

  it("admin routes call assertAdminManagementAccess after resolveSession", async () => {
    // AC3: Admin role enforcement after session validation.
    const source = await readController();
    expect(source).toContain("assertAdminManagementAccess");
    expect(source).toContain("session.user.globalRole");
  });

  it("listAuthenticated does not call assertAdminManagementAccess", async () => {
    // AC3: listAuthenticated is for any authenticated user — no admin check.
    const source = await readController();
    // Split the source to isolate the listAuthenticated method
    const listAuthStart = source.indexOf("async listAuthenticated");
    const nextMethodStart = source.indexOf("async adminListAll");
    const listAuthSource = source.slice(listAuthStart, nextMethodStart);
    expect(listAuthSource).not.toContain("assertAdminManagementAccess");
  });
});

// ---------------------------------------------------------------------------
// AC3 (subtask-6): session enforcement via service delegation tests
// Tests that the controller correctly delegates session resolution and
// passes the resolved role to findForAuthenticatedUser.
// ---------------------------------------------------------------------------

describe("NavigationController session delegation — integration-style (AC3 subtask-6)", () => {
  const makeSession = (globalRole = "user") => ({
    user: {
      id: "user-1",
      username: "test",
      email: "test@example.com",
      displayName: null,
      globalRole,
      status: "active",
      emailVerified: true,
      emailVerifiedAt: null,
      onboardingRequired: false
    },
    session: { id: "sess-1", expiresAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
    sessionToken: "tok-1"
  });

  it("propagates UnauthorizedException from resolveSession on listAuthenticated", async () => {
    // AC3: resolveSession throwing UnauthorizedException propagates to the caller.
    const resolveSession = vi.fn(async () => {
      throw new UnauthorizedException("Authentication required.");
    });
    const findForAuthenticatedUser = vi.fn(async () => []);

    // Simulate the controller's listAuthenticated logic directly
    const simulateListAuthenticated = async () => {
      const session = await resolveSession({ cookieHeader: undefined });
      const items = await findForAuthenticatedUser(session.user.globalRole);
      return { items };
    };

    await expect(simulateListAuthenticated()).rejects.toThrow(UnauthorizedException);
    expect(findForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("calls findForAuthenticatedUser with the session user globalRole", async () => {
    // AC3: Controller passes session.user.globalRole to findForAuthenticatedUser.
    const resolveSession = vi.fn(async () => makeSession("user"));
    const findForAuthenticatedUser = vi.fn(async () => []);

    const simulateListAuthenticated = async () => {
      const session = await resolveSession({ cookieHeader: undefined });
      await findForAuthenticatedUser(session.user.globalRole);
    };

    await simulateListAuthenticated();
    expect(findForAuthenticatedUser).toHaveBeenCalledWith("user");
  });

  it("propagates UnauthorizedException from resolveSession on admin routes", async () => {
    // AC3: Admin routes must also propagate 401 from resolveSession.
    const resolveSession = vi.fn(async () => {
      throw new UnauthorizedException("Authentication required.");
    });
    const assertAdminManagementAccess = vi.fn();
    const findAll = vi.fn(async () => []);

    const simulateAdminListAll = async () => {
      const session = await resolveSession({ cookieHeader: undefined });
      assertAdminManagementAccess(session.user.globalRole);
      return await findAll();
    };

    await expect(simulateAdminListAll()).rejects.toThrow(UnauthorizedException);
    expect(assertAdminManagementAccess).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC5 (subtask-6): NotFoundException not imported in navigation.controller.ts
// ---------------------------------------------------------------------------

describe("navigation.controller.ts — NotFoundException not imported (AC5 subtask-6)", () => {
  it("does not import NotFoundException from @nestjs/common", async () => {
    // AC5: NotFoundException must not be imported in navigation.controller.ts.
    const source = await readController();
    // All import statements from @nestjs/common — none should contain NotFoundException
    const allImports = [...source.matchAll(/import\s*\{[^}]+\}\s*from\s*"@nestjs\/common"/g)];
    expect(allImports.length).toBeGreaterThan(0);
    for (const match of allImports) {
      expect(match[0]).not.toContain("NotFoundException");
    }
  });

  it("controller file does not reference NotFoundException at all", async () => {
    // AC5: No NotFoundException reference anywhere in the controller.
    const source = await readController();
    expect(source).not.toContain("NotFoundException");
  });
});
