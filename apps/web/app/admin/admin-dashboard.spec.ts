/**
 * Source-contract tests for the admin dashboard landing page (/admin).
 *
 * Uses the established source-audit pattern (reading source files and
 * asserting on their content), consistent with forums-admin.spec.ts
 * and public-shell.spec.ts in this workspace.
 *
 * Acceptance criteria covered:
 *  AC1 - /admin is gated: uses resolveProtectedSession + hasGlobalRole("admin");
 *        redirects unauthenticated users; surfaces "Admin access required" for non-admin.
 *  AC2 - Dashboard renders labelled links with short descriptions to
 *        /admin/blog, /admin/pages, /admin/navigation, /admin/forums, and /docs
 *        (Documents). Includes ST-10: Documents card at /docs.
 *  AC3 - Styling reuses apps/web/app/auth-shell.module.css (no new CSS file).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "../../");

async function readAppFile(relativePath: string): Promise<string> {
  return readFile(path.join(appRoot, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// AC1: Auth gate — resolveProtectedSession + hasGlobalRole("admin")
// ---------------------------------------------------------------------------

describe("admin-dashboard page (AC1) — auth gate", () => {
  it('is a "use client" component (client component required for auth gate)', async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source.trimStart()).toMatch(/^"use client"/);
  });

  it("imports resolveProtectedSession and hasGlobalRole from auth-client", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('from "../auth-client"');
  });

  it('calls resolveProtectedSession with "/admin"', async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain('resolveProtectedSession("/admin")');
  });

  it("redirects unauthenticated users via router.replace(resolved.redirectTo)", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain("if (resolved.redirectTo) router.replace(resolved.redirectTo)");
  });

  it('checks hasGlobalRole(resolved.session.user, "admin") and gates dashboard render', async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain('hasGlobalRole(resolved.session.user, "admin")');
  });

  it('sets error state with "Admin access required" message for non-admin sessions', async () => {
    const source = await readAppFile("app/admin/page.tsx");
    // AC1 requires the exact message "Admin access required" (with or without trailing dot)
    expect(source).toMatch(/Admin access required/);
  });

  it("renders the error panel from state, not dangerouslySetInnerHTML", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    // error state is rendered via JSX expression
    expect(source).toContain("{error}");
  });
});

// ---------------------------------------------------------------------------
// AC2: Dashboard links — all four sections with labels and descriptions
// ---------------------------------------------------------------------------

describe("admin-dashboard page (AC2) — section links", () => {
  it("links to /admin/blog", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain('"/admin/blog"');
  });

  it("links to /admin/pages", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain('"/admin/pages"');
  });

  it("links to /admin/navigation", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain('"/admin/navigation"');
  });

  it("links to /admin/forums", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain('"/admin/forums"');
  });

  it("links to /docs (Documents)", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain('"/docs"');
  });

  it("labels the Blog section", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toMatch(/label.*Blog|Blog.*label/s);
  });

  it("labels the Pages section", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toMatch(/label.*Pages|Pages.*label/s);
  });

  it("labels the Navigation section", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toMatch(/label.*Navigation|Navigation.*label/s);
  });

  it("labels the Forums section", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toMatch(/label.*Forums|Forums.*label/s);
  });

  it("labels the Documents section", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toMatch(/label.*Documents|Documents.*label/s);
  });

  it("includes a short description for each section (description field present)", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    const descriptionCount = (source.match(/description:/g) ?? []).length;
    // Five sections each with a description property (Blog, Pages, Navigation, Forums, Documents)
    expect(descriptionCount).toBeGreaterThanOrEqual(5);
  });

  it("Documents section description mentions wiki pages and relevant actions", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    // Must mention wiki pages and at least one management action (create/edit/lock/roll back)
    expect(source).toMatch(/wiki pages/i);
    expect(source).toMatch(/create|edit|lock|roll back/i);
  });

  it("renders sections via a map over an adminSections array", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain("adminSections");
    expect(source).toContain(".map(");
  });

  it("uses Next.js Link for each section link", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain("import Link from");
    expect(source).toContain("<Link");
  });
});

// ---------------------------------------------------------------------------
// AC3: Styling reuses auth-shell.module.css
// ---------------------------------------------------------------------------

describe("admin-dashboard page (AC3) — styling reuse", () => {
  it("imports from auth-shell.module.css (no new CSS file)", async () => {
    const source = await readAppFile("app/admin/page.tsx");
    expect(source).toContain("auth-shell.module.css");
    expect(source).toContain("import styles from");
  });
});
