/**
 * Source-contract tests for the Milestone 3 standalone pages system.
 *
 * These tests use the source-audit pattern (reading source files and asserting
 * on their content) consistent with blog.spec.ts, public-shell.spec.ts, and
 * authoring-components.spec.ts in this workspace.
 *
 * Acceptance criteria covered:
 *  AC1 - Admin users can manage standalone pages end to end through authenticated admin screens
 *  AC2 - Every standalone-page edit creates durable revision history with metadata to inspect and restore
 *  AC3 - Guests can read only published standalone pages through stable public routes
 *  AC4 - Implementation does not introduce block-builder, wiki hierarchy, or broader documents/wiki behavior
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
// Pages API client contracts
// ---------------------------------------------------------------------------

describe("pages-client.ts source contracts", () => {
  it("exports getPublishedPage without credentials (guest access, AC3)", async () => {
    const source = await readAppFile("app/pages/pages-client.ts");
    // AC3: public route must not require credentials
    expect(source).toContain("export async function getPublishedPage");
    const publicBlock = source.slice(
      source.indexOf("async function getPublishedPage"),
      source.indexOf("// Admin routes")
    );
    expect(publicBlock).not.toContain('credentials: "include"');
  });

  it("exports admin management helpers with credentials:include (session required, AC1)", async () => {
    const source = await readAppFile("app/pages/pages-client.ts");
    // AC1: all admin routes must forward session cookie
    expect(source).toContain("export async function adminListAllPages");
    expect(source).toContain("export async function adminGetPage");
    expect(source).toContain("export async function adminCreatePage");
    expect(source).toContain("export async function adminUpdatePage");
    expect(source).toContain("export async function adminPublishPage");
    expect(source).toContain("export async function adminUnpublishPage");
    const adminSection = source.slice(source.indexOf("// Admin routes"));
    expect(adminSection).toContain('credentials: "include"');
  });

  it("exports revision management helpers with credentials:include (admin required, AC2)", async () => {
    const source = await readAppFile("app/pages/pages-client.ts");
    // AC2: revision history and restore are admin-only surfaces
    expect(source).toContain("export async function adminListRevisions");
    expect(source).toContain("export async function adminRestoreRevision");
    const adminSection = source.slice(source.indexOf("// Admin routes"));
    expect(adminSection).toContain('credentials: "include"');
  });

  it("uses NEXT_PUBLIC_API_BASE_PATH for all requests (consistent routing)", async () => {
    const source = await readAppFile("app/pages/pages-client.ts");
    expect(source).toContain('process.env.NEXT_PUBLIC_API_BASE_PATH || "/api"');
    expect(source).toContain("`${apiBase}/pages/");
  });

  it("does not reference block-builder, wiki, or document constructs (AC4)", async () => {
    const source = await readAppFile("app/pages/pages-client.ts");
    // AC4: scope guard — none of these concepts should appear
    expect(source.toLowerCase()).not.toContain("blockbuilder");
    expect(source.toLowerCase()).not.toContain("block-builder");
    expect(source.toLowerCase()).not.toContain("wiki");
    expect(source.toLowerCase()).not.toContain("document-tree");
  });
});

// ---------------------------------------------------------------------------
// Public standalone page route
// ---------------------------------------------------------------------------

describe("Public standalone page source contracts (AC3)", () => {
  it("uses getPublishedPage only (never exposes draft content)", async () => {
    const source = await readAppFile("app/pages/[slug]/page.tsx");
    // AC3: only published endpoint used
    expect(source).toContain("getPublishedPage");
    expect(source).not.toContain("adminGetPage");
    expect(source).not.toContain("adminListAllPages");
  });

  it("renders a 404 state when the page is null (draft pages hidden from guests, AC3)", async () => {
    const source = await readAppFile("app/pages/[slug]/page.tsx");
    // AC3: null result means not found or not published
    expect(source).toContain("page === null");
    expect(source).toContain("not published");
  });

  it("uses MarkdownRenderer for body (sanitized rendering, AC3)", async () => {
    const source = await readAppFile("app/pages/[slug]/page.tsx");
    expect(source).toContain("MarkdownRenderer");
    expect(source).toContain('from "../../../components/markdown-renderer"');
  });

  it("does not import MarkdownEditor (read-only public surface, AC3)", async () => {
    const source = await readAppFile("app/pages/[slug]/page.tsx");
    // AC3: public page must not expose editing UI
    expect(source).not.toContain("MarkdownEditor");
    expect(source).not.toContain("adminUpdatePage");
  });
});

// ---------------------------------------------------------------------------
// Admin standalone pages list page
// ---------------------------------------------------------------------------

describe("Admin pages list source contracts (AC1)", () => {
  it("calls resolveProtectedSession to enforce authentication (AC1)", async () => {
    const source = await readAppFile("app/admin/pages/page.tsx");
    // AC1: uses shared session resolution matching blog pattern
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain('"/admin/pages"');
  });

  it("checks hasGlobalRole admin before loading data (AC1)", async () => {
    const source = await readAppFile("app/admin/pages/page.tsx");
    // AC1: unauthorized users cannot access admin surface
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"admin"');
  });

  it("provides publish and unpublish actions inline (AC1)", async () => {
    const source = await readAppFile("app/admin/pages/page.tsx");
    expect(source).toContain("adminPublishPage");
    expect(source).toContain("adminUnpublishPage");
  });

  it("links to new page and edit pages (AC1)", async () => {
    const source = await readAppFile("app/admin/pages/page.tsx");
    expect(source).toContain('href="/admin/pages/new"');
    expect(source).toContain("/admin/pages/${page.id}/edit");
  });

  it("does not reference block-builder or wiki constructs (AC4)", async () => {
    const source = await readAppFile("app/admin/pages/page.tsx");
    expect(source.toLowerCase()).not.toContain("blockbuilder");
    expect(source.toLowerCase()).not.toContain("block-builder");
    expect(source.toLowerCase()).not.toContain("wiki");
  });
});

// ---------------------------------------------------------------------------
// Admin standalone pages create page
// ---------------------------------------------------------------------------

describe("Admin pages create source contracts (AC1)", () => {
  it("guards the page with resolveProtectedSession and admin role check (AC1)", async () => {
    const source = await readAppFile("app/admin/pages/new/page.tsx");
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"admin"');
  });

  it("uses adminCreatePage to create a draft (AC1)", async () => {
    const source = await readAppFile("app/admin/pages/new/page.tsx");
    expect(source).toContain("adminCreatePage");
  });

  it("uses MarkdownEditor for body input (shared authoring component, AC1)", async () => {
    const source = await readAppFile("app/admin/pages/new/page.tsx");
    expect(source).toContain("MarkdownEditor");
    expect(source).toContain('from "../../../../components/markdown-editor"');
  });

  it("has title, slug, and body fields (AC1)", async () => {
    const source = await readAppFile("app/admin/pages/new/page.tsx");
    expect(source).toContain("title");
    expect(source).toContain("slug");
    expect(source).toContain("body");
  });

  it("does not reference block-builder or wiki constructs (AC4)", async () => {
    const source = await readAppFile("app/admin/pages/new/page.tsx");
    expect(source.toLowerCase()).not.toContain("blockbuilder");
    expect(source.toLowerCase()).not.toContain("block-builder");
    expect(source.toLowerCase()).not.toContain("wiki");
  });
});

// ---------------------------------------------------------------------------
// Admin standalone pages edit page (revision history and restore)
// ---------------------------------------------------------------------------

describe("Admin pages edit source contracts (AC1, AC2)", () => {
  it("guards the page with resolveProtectedSession and admin role check (AC1)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"admin"');
  });

  it("provides publish and unpublish controls (AC1)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    expect(source).toContain("adminPublishPage");
    expect(source).toContain("adminUnpublishPage");
  });

  it("loads and displays the revision history panel (AC2)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    // AC2: revision list must be fetched and presented to the admin
    expect(source).toContain("adminListRevisions");
    expect(source).toContain("Revision History");
    expect(source).toContain("revisionNumber");
  });

  it("offers a restore action for prior revisions (AC2)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    // AC2: restore action must be present
    expect(source).toContain("adminRestoreRevision");
    expect(source).toContain("Restore");
  });

  it("offers a preview action for prior revisions (AC2)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    // AC2: preview helps admin inspect prior revision content
    expect(source).toContain("Preview");
    expect(source).toContain("MarkdownRenderer");
  });

  it("uses adminUpdatePage to save content changes (AC1, AC2)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    expect(source).toContain("adminUpdatePage");
  });

  it("uses MarkdownEditor for body editing (shared authoring component, AC1)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    expect(source).toContain("MarkdownEditor");
    expect(source).toContain('from "../../../../../components/markdown-editor"');
  });

  it("does not reference block-builder or wiki constructs (AC4)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    expect(source.toLowerCase()).not.toContain("blockbuilder");
    expect(source.toLowerCase()).not.toContain("block-builder");
    expect(source.toLowerCase()).not.toContain("wiki");
  });
});
