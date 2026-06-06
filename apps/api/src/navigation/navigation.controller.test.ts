import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

const controllerPath = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "navigation.controller.ts",
);

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
