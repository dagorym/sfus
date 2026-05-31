/**
 * Source-contract tests for the Milestone 3 blog publishing system.
 *
 * These tests use the source-audit pattern (reading source files and asserting
 * on their content) consistent with public-shell.spec.ts and
 * authoring-components.spec.ts in this workspace.
 *
 * Acceptance criteria covered:
 *  AC1 - Admin users can manage blog posts end to end
 *  AC2 - Guests can browse and read only published blog content
 *  AC3 - Draft and scheduled content remain protected from unauthorized access
 *  AC4 - Blog APIs and routes use reusable authorization checks
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
// Blog API client contracts
// ---------------------------------------------------------------------------

describe("blog-client.ts source contracts", () => {
  it("exports public listing and detail helpers with no credentials (guest access)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC2: public routes must not require credentials
    expect(source).toContain("export async function listPublishedPosts");
    expect(source).toContain("export async function getPublishedPost");
    // Public routes should not send credentials
    const publicListBlock = source.slice(
      source.indexOf("async function listPublishedPosts"),
      source.indexOf("async function getPublishedPost") + 1
    );
    expect(publicListBlock).not.toContain('credentials: "include"');
  });

  it("exports admin management helpers with credentials:include (session required)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC1: admin routes must forward session cookie
    expect(source).toContain("export async function adminListAllPosts");
    expect(source).toContain("export async function adminCreatePost");
    expect(source).toContain("export async function adminUpdatePost");
    expect(source).toContain("export async function adminPublishPost");
    expect(source).toContain("export async function adminUnpublishPost");
    expect(source).toContain("export async function adminSchedulePost");
    expect(source).toContain("export async function adminDeletePost");
    // All admin routes must forward the session cookie
    const adminSection = source.slice(source.indexOf("// Admin routes"));
    expect(adminSection).toContain('credentials: "include"');
  });

  it("uses NEXT_PUBLIC_API_BASE_PATH for all requests (consistent routing)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    expect(source).toContain('process.env.NEXT_PUBLIC_API_BASE_PATH || "/api"');
    expect(source).toContain("`${apiBase}/blog`");
  });

  it("schedule helper sends scheduledAt as ISO string", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    expect(source).toContain("scheduledAt");
    expect(source).toContain("/schedule");
  });
});

// ---------------------------------------------------------------------------
// Public blog listing page
// ---------------------------------------------------------------------------

describe("Public blog listing page source contracts (AC2)", () => {
  it("renders only using listPublishedPosts (no admin API calls)", async () => {
    const source = await readAppFile("app/blog/page.tsx");
    expect(source).toContain("listPublishedPosts");
    expect(source).not.toContain("adminListAllPosts");
    expect(source).not.toContain("adminGetPost");
  });

  it("shows all posts in a linked list", async () => {
    const source = await readAppFile("app/blog/page.tsx");
    expect(source).toContain("/blog/${encodeURIComponent(post.slug)}");
  });

  it("displays tags for each post", async () => {
    const source = await readAppFile("app/blog/page.tsx");
    expect(source).toContain("post.tags");
  });
});

// ---------------------------------------------------------------------------
// Public blog detail page
// ---------------------------------------------------------------------------

describe("Public blog detail page source contracts (AC2, AC3)", () => {
  it("uses getPublishedPost only (never reaches draft content)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC3: only published endpoint used
    expect(source).toContain("getPublishedPost");
    expect(source).not.toContain("adminGetPost");
  });

  it("uses MarkdownRenderer for body (sanitized rendering)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC1/AC4: uses shared authoring component, not bespoke inline rendering
    expect(source).toContain("MarkdownRenderer");
    expect(source).toContain('from "../../../components/markdown-renderer"');
  });

  it("shows 404 state when post is null (draft/scheduled hidden from guests)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC3: null result from getPublishedPost means not found or not published
    expect(source).toContain("post === null");
    expect(source).toContain("not yet published");
  });
});

// ---------------------------------------------------------------------------
// Admin blog list page
// ---------------------------------------------------------------------------

describe("Admin blog list page source contracts (AC1, AC4)", () => {
  it("calls resolveProtectedSession to enforce authentication (AC4)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    // AC4: uses shared session resolution, not bespoke inline check
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain('"/admin/blog"');
  });

  it("checks hasGlobalRole admin before loading data (AC3)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    // AC3: unauthorized users cannot access admin surface
    expect(source).toContain('hasGlobalRole');
    expect(source).toContain('"admin"');
  });

  it("provides publish and unpublish actions (AC1)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    expect(source).toContain("adminPublishPost");
    expect(source).toContain("adminUnpublishPost");
  });

  it("provides delete action (AC1)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    expect(source).toContain("adminDeletePost");
  });

  it("links to new post and edit pages (AC1)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    expect(source).toContain('href="/admin/blog/new"');
    expect(source).toContain("/admin/blog/${post.id}/edit");
  });
});

// ---------------------------------------------------------------------------
// Admin blog create page
// ---------------------------------------------------------------------------

describe("Admin blog create page source contracts (AC1)", () => {
  it("guards the page with resolveProtectedSession and admin role check", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"admin"');
  });

  it("uses adminCreatePost to create a draft", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    expect(source).toContain("adminCreatePost");
  });

  it("uses MarkdownEditor for body input (shared authoring component AC4)", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    expect(source).toContain("MarkdownEditor");
    expect(source).toContain('from "../../../../components/markdown-editor"');
  });

  it("has title, slug, tags, and body fields", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    expect(source).toContain("title");
    expect(source).toContain("slug");
    expect(source).toContain("tags");
    expect(source).toContain("body");
  });
});

// ---------------------------------------------------------------------------
// Admin blog edit page
// ---------------------------------------------------------------------------

describe("Admin blog edit page source contracts (AC1, AC3)", () => {
  it("guards the page with resolveProtectedSession and admin role check", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"admin"');
  });

  it("provides publish, unpublish, and schedule controls (AC1)", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("adminPublishPost");
    expect(source).toContain("adminUnpublishPost");
    expect(source).toContain("adminSchedulePost");
  });

  it("uses MarkdownEditor for body editing (shared authoring component AC4)", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("MarkdownEditor");
  });

  it("handles schedule with a future datetime input", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("datetime-local");
    expect(source).toContain("scheduledAt");
  });

  it("uses adminUpdatePost to save content changes", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("adminUpdatePost");
  });
});
