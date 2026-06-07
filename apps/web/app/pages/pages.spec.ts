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

// ---------------------------------------------------------------------------
// Top-level standalone page catch-all route (AC1 — top-level paths)
// ---------------------------------------------------------------------------

describe("Top-level catch-all page route source contracts (AC1)", () => {
  // AC1: Published standalone pages must render at top-level paths (e.g. /about).
  // The catch-all app/[slug]/page.tsx implements this.

  it("exists as the top-level dynamic segment route", async () => {
    // AC1: route file must be present at the top-level app/[slug] location
    const source = await readAppFile("app/[slug]/page.tsx");
    expect(source).toBeTruthy();
  });

  it("uses getPublishedPage only (never exposes draft content, AC2)", async () => {
    const source = await readAppFile("app/[slug]/page.tsx");
    // AC2: public surface must only call the published-only endpoint
    expect(source).toContain("getPublishedPage");
    expect(source).not.toContain("adminGetPage");
    expect(source).not.toContain("adminListAllPages");
  });

  it("uses MarkdownRenderer for body rendering (sanitized output, AC4)", async () => {
    const source = await readAppFile("app/[slug]/page.tsx");
    expect(source).toContain("MarkdownRenderer");
  });

  it("renders featured media image when featuredMediaId is present (AC4)", async () => {
    const source = await readAppFile("app/[slug]/page.tsx");
    // AC4: featured image must be rendered via the media API endpoint
    expect(source).toContain("featuredMediaId");
    expect(source).toContain("/media/");
  });

  it("defines a RESERVED_SLUGS set mirroring the server-side list (AC1)", async () => {
    const source = await readAppFile("app/[slug]/page.tsx");
    // AC1: client-side reserved slug guard must be present
    expect(source).toContain("RESERVED_SLUGS");
    expect(source).toContain('"admin"');
    expect(source).toContain('"blog"');
    expect(source).toContain('"login"');
  });

  it("includes 'pages' in RESERVED_SLUGS to mirror the API-side eleven-entry list (pass-2 parity fix)", async () => {
    const source = await readAppFile("app/[slug]/page.tsx");
    // AC: 'pages' must appear in RESERVED_SLUGS so a bare /pages request is
    // short-circuited by the web catch-all guard without querying the API.
    // This entry was added in ms3-review-closeout pass-2 to close the web/API
    // mirror divergence identified by the specialist security review.
    // The full eleven-entry set expected on both sides:
    // admin, api, app, blog, login, pages, register, onboarding, profile, settings, health
    expect(source).toContain('"pages"');
    // Confirm the RESERVED_SLUGS declaration containing 'pages' is present
    const reservedStart = source.indexOf("RESERVED_SLUGS");
    expect(reservedStart).toBeGreaterThan(-1);
    const reservedBlock = source.slice(reservedStart, source.indexOf(");", reservedStart) + 2);
    expect(reservedBlock).toContain('"pages"');
    // Verify all eleven entries are present in the set declaration
    const elevenEntries = ["admin", "api", "app", "blog", "login", "pages", "register", "onboarding", "profile", "settings", "health"];
    for (const entry of elevenEntries) {
      expect(reservedBlock, `RESERVED_SLUGS must contain "${entry}"`).toContain(`"${entry}"`);
    }
  });

  it("returns a not-found state for reserved slugs without querying the API (AC1)", async () => {
    const source = await readAppFile("app/[slug]/page.tsx");
    // AC1: reserved slug interception must happen before any API call
    expect(source).toContain("isReserved");
    expect(source).toContain("not published");
  });

  it("imports from pages-client (consistent client contract, AC1)", async () => {
    const source = await readAppFile("app/[slug]/page.tsx");
    expect(source).toContain("pages-client");
  });

  it("does not reference block-builder or wiki constructs (AC5)", async () => {
    const source = await readAppFile("app/[slug]/page.tsx");
    expect(source.toLowerCase()).not.toContain("blockbuilder");
    expect(source.toLowerCase()).not.toContain("block-builder");
    expect(source.toLowerCase()).not.toContain("wiki");
  });
});

// ---------------------------------------------------------------------------
// Enriched admin authoring — ImageUpload, summary, changeNote (AC3, AC4)
// ---------------------------------------------------------------------------

describe("Admin pages create enriched authoring contracts (AC3, AC4)", () => {
  // AC3: Every page creation must support summary and featuredMediaId.
  // AC4: Featured media must be uploadable via ImageUpload component.

  it("imports ImageUpload for featured image upload on create (AC4)", async () => {
    const source = await readAppFile("app/admin/pages/new/page.tsx");
    expect(source).toContain("ImageUpload");
    expect(source).toContain("image-upload");
  });

  it("has a summary input field on the create form (AC3)", async () => {
    const source = await readAppFile("app/admin/pages/new/page.tsx");
    expect(source).toContain("summary");
    expect(source).toContain("Summary");
  });

  it("passes featuredMediaId in the create request payload (AC4)", async () => {
    const source = await readAppFile("app/admin/pages/new/page.tsx");
    expect(source).toContain("featuredMediaId");
    expect(source).toContain("adminCreatePage");
  });
});

describe("Admin pages edit enriched authoring contracts (AC3, AC4)", () => {
  // AC3: Every edit must capture changeNote and summary for durable revision metadata.
  // AC4: Featured media must be uploadable via ImageUpload.

  it("imports ImageUpload for featured image upload on edit (AC4)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    expect(source).toContain("ImageUpload");
    expect(source).toContain("image-upload");
  });

  it("has a changeNote input field on the edit form (AC3)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    // AC3: changeNote must be captured per edit and sent with the revision
    expect(source).toContain("changeNote");
    expect(source).toContain("Change note");
  });

  it("has a summary input field on the edit form (AC3)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    expect(source).toContain("summary");
    expect(source).toContain("Summary");
  });

  it("passes changeNote and featuredMediaId in the update request payload (AC3, AC4)", async () => {
    const source = await readAppFile("app/admin/pages/[id]/edit/page.tsx");
    expect(source).toContain("changeNote");
    expect(source).toContain("featuredMediaId");
    expect(source).toContain("adminUpdatePage");
  });
});

// ---------------------------------------------------------------------------
// Envelope error-chain source contracts — all admin call sites in pages-client
//
// These tests pin the payload?.error?.message || payload?.message || <fallback>
// chain at every admin call site so a regression to payload?.message-only cannot
// ship silently. The API's JsonExceptionFilter envelope is:
//   { error: { code, message, statusCode }, request: {...} }
// Without payload?.error?.message first, every API-layer error collapses to
// the hard-coded generic fallback.
// ---------------------------------------------------------------------------

/**
 * Helper: extract a function body from pages-client.ts source by bounding it
 * between the named export and the next export keyword (or end of file).
 */
function extractPagesFn(source: string, fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}`);
  if (start === -1) throw new Error(`Function ${fnName} not found in source`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

describe("pages-client.ts envelope error chain — all admin call sites", () => {
  // Regression guard: every admin function must use the three-part
  // payload?.error?.message || payload?.message || <fallback> chain.
  // A payload?.message-only read (the old, broken pattern) will fail because
  // payload?.error?.message would be absent.

  const adminFunctions = [
    "adminListAllPages",
    "adminGetPage",
    "adminCreatePage",
    "adminUpdatePage",
    "adminPublishPage",
    "adminUnpublishPage",
    "adminListRevisions",
    "adminRestoreRevision",
  ];

  it.each(adminFunctions)(
    "%s reads payload?.error?.message before payload?.message (envelope first)",
    async (fnName) => {
      const source = await readAppFile("app/pages/pages-client.ts");
      const block = extractPagesFn(source, fnName);
      // Must contain the envelope shape read
      expect(block).toContain("payload?.error?.message");
      // Must also include the legacy fallback
      expect(block).toContain("payload?.message");
    }
  );

  it.each(adminFunctions)(
    "%s uses the three-part || chain: error.message || message || <fallback>",
    async (fnName) => {
      const source = await readAppFile("app/pages/pages-client.ts");
      const block = extractPagesFn(source, fnName);
      // The full chain must appear in the error branch
      const chain = block.match(/payload\?\.error\?\.message\s*\|\|\s*payload\?\.message\s*\|\|/s);
      expect(chain).not.toBeNull();
    }
  );

  it.each(adminFunctions)(
    "%s type annotation includes error?: { message?: string } (envelope type)",
    async (fnName) => {
      const source = await readAppFile("app/pages/pages-client.ts");
      const block = extractPagesFn(source, fnName);
      // The cast must include the envelope error sub-object
      expect(block).toContain("error?:");
      expect(block).toContain("message?:");
    }
  );
});
