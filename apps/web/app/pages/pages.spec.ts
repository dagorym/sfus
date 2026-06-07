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
  it("exports listPublishedPages without credentials (public index, AC1 published-only public read)", async () => {
    // AC1: the public list endpoint must not forward session cookies — it is
    // guest-accessible and must never require authentication.
    const source = await readAppFile("app/pages/pages-client.ts");
    expect(source).toContain("export async function listPublishedPages");
    // Extract the function body — ends before the next export
    const fnStart = source.indexOf("export async function listPublishedPages");
    const fnEnd = source.indexOf("\nexport ", fnStart + 1);
    const fnBody = fnEnd === -1 ? source.slice(fnStart) : source.slice(fnStart, fnEnd);
    // Must not carry session credentials
    expect(fnBody).not.toContain('credentials: "include"');
  });

  it("listPublishedPages() uses apiBase/pages endpoint (correct endpoint, AC1)", async () => {
    // AC1: the public list must hit GET /pages — no /admin prefix.
    const source = await readAppFile("app/pages/pages-client.ts");
    const fnStart = source.indexOf("export async function listPublishedPages");
    const fnEnd = source.indexOf("\nexport ", fnStart + 1);
    const fnBody = fnEnd === -1 ? source.slice(fnStart) : source.slice(fnStart, fnEnd);
    // Must fetch from ${apiBase}/pages (not /admin/pages)
    expect(fnBody).toContain("`${apiBase}/pages`");
    expect(fnBody).not.toContain("/admin/pages");
  });

  it("listPublishedPages() returns pages array from { pages } envelope (payload shape, AC2)", async () => {
    // AC2: the response envelope is { pages: PageSummary[] }; the function must
    // unwrap data.pages and return it, not the whole envelope.
    const source = await readAppFile("app/pages/pages-client.ts");
    const fnStart = source.indexOf("export async function listPublishedPages");
    const fnEnd = source.indexOf("\nexport ", fnStart + 1);
    const fnBody = fnEnd === -1 ? source.slice(fnStart) : source.slice(fnStart, fnEnd);
    expect(fnBody).toContain("data.pages");
  });

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

// ---------------------------------------------------------------------------
// Public /pages index route — app/pages/page.tsx (subtask-6 AC3)
// ---------------------------------------------------------------------------

describe("Public /pages index route source contracts (AC3)", () => {
  // AC3: The /pages route must render the published list as links; no draft content exposed.

  it("file exists and imports listPublishedPages (AC3 — route file present)", async () => {
    // AC3: The index route must exist and use the public list client function.
    const source = await readAppFile("app/pages/page.tsx");
    expect(source).toBeTruthy();
    expect(source).toContain("listPublishedPages");
    expect(source).toContain('from "./pages-client"');
  });

  it("renders Link elements to /pages/<slug> for each published page (AC3)", async () => {
    // AC3: Each published page must be rendered as a navigable link.
    const source = await readAppFile("app/pages/page.tsx");
    expect(source).toContain("Link");
    expect(source).toContain("/pages/");
    // Slug must be URI-encoded before embedding in the href
    expect(source).toContain("encodeURIComponent(page.slug)");
  });

  it("has an empty state when no pages are published (AC3 — empty state renders cleanly)", async () => {
    // AC3: When no pages exist the UI must render gracefully without crashing.
    const source = await readAppFile("app/pages/page.tsx");
    // Empty-state message rather than a crash or blank output
    expect(source).toContain("No pages have been published yet");
  });

  it("has a loading state while pages are being fetched (AC3 — loading state)", async () => {
    // AC3: A loading indication prevents a jarring blank screen before data arrives.
    const source = await readAppFile("app/pages/page.tsx");
    expect(source).toContain("Loading");
  });

  it("has an error state when the fetch fails (AC3 — error state)", async () => {
    // AC3: Network failures must not crash the route; an error message must render.
    const source = await readAppFile("app/pages/page.tsx");
    expect(source).toContain("Unable to load pages");
  });

  it("does not call any admin or authenticated endpoint (AC3 — no credential leakage)", async () => {
    // AC3: The index route is a public surface; it must never call admin helpers
    // or forward session credentials.
    const source = await readAppFile("app/pages/page.tsx");
    expect(source).not.toContain("adminListAllPages");
    expect(source).not.toContain("credentials");
  });

  it("uses 'use client' directive (AC3 — client component for dynamic fetch)", async () => {
    // AC3: The route performs a client-side fetch after mount, so it must be a
    // client component.
    const source = await readAppFile("app/pages/page.tsx");
    expect(source).toContain('"use client"');
  });
});

// ---------------------------------------------------------------------------
// PagesController.listPublished — Swagger and response shape (subtask-6 AC2, AC4, AC5)
// ---------------------------------------------------------------------------

describe("PagesController.listPublished source contracts (AC2, AC4, AC5)", () => {
  it("has a @Get() decorator with no path param (AC4 — bare /pages route)", async () => {
    // AC4: The list endpoint must respond to GET /pages, not GET /pages/:something.
    const source = await readAppFile("../../apps/api/src/pages/pages.controller.ts");
    // @Get() with no argument registers the bare /pages GET route.
    expect(source).toContain("@Get()");
    // The @Get() with no argument must appear in the same decorator block as listPublished.
    // Search up to 500 chars to accommodate intermediate decorator lines.
    const getIdx = source.indexOf("@Get()");
    const afterGet = source.slice(getIdx, getIdx + 500);
    expect(afterGet).toContain("listPublished");
  });

  it("has @ApiOperation on listPublished (AC5 — Swagger documented)", async () => {
    // AC5: The new endpoint must appear in the Swagger spec.
    const source = await readAppFile("../../apps/api/src/pages/pages.controller.ts");
    expect(source).toContain("@ApiOperation");
    // The ApiOperation summary must mention the public list intent
    const opIdx = source.indexOf("@ApiOperation");
    const opBlock = source.slice(opIdx, opIdx + 200);
    expect(opBlock.toLowerCase()).toContain("published");
  });

  it("has @ApiOkResponse on listPublished (AC5 — Swagger response documented)", async () => {
    // AC5: Swagger must also document the 200 response shape.
    const source = await readAppFile("../../apps/api/src/pages/pages.controller.ts");
    expect(source).toContain("@ApiOkResponse");
  });

  it("toSummary helper returns only slug, title, updatedAt — no body field (AC2)", async () => {
    // AC2: The payload must contain only index fields; body is absent to prevent
    // expensive body-loading on the list surface.
    const source = await readAppFile("../../apps/api/src/pages/pages.controller.ts");
    // toSummary function must map to slug/title/updatedAt
    expect(source).toContain("toSummary");
    const fnIdx = source.indexOf("function toSummary");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnEnd = source.indexOf("}", fnIdx);
    const fnBody = source.slice(fnIdx, fnEnd + 1);
    expect(fnBody).toContain("slug");
    expect(fnBody).toContain("title");
    expect(fnBody).toContain("updatedAt");
    // body must not appear in the summary shape
    expect(fnBody).not.toContain("body:");
  });

  it("PageSummary interface contains slug, title, updatedAt — no body (AC2)", async () => {
    // AC2: The declared interface confirms the payload contract — body and revision
    // data must be absent from the index shape.
    const source = await readAppFile("../../apps/api/src/pages/pages.controller.ts");
    expect(source).toContain("interface PageSummary");
    const ifaceIdx = source.indexOf("interface PageSummary");
    const ifaceEnd = source.indexOf("}", ifaceIdx);
    const ifaceBody = source.slice(ifaceIdx, ifaceEnd + 1);
    expect(ifaceBody).toContain("slug");
    expect(ifaceBody).toContain("title");
    expect(ifaceBody).toContain("updatedAt");
    // body must not be declared in the index interface
    expect(ifaceBody).not.toContain("body");
  });
});

// ---------------------------------------------------------------------------
// PagesService.findPublished — operator-pinned query contract (subtask-6 AC1, AC4)
// ---------------------------------------------------------------------------

describe("PagesService.findPublished source contracts (AC1, AC4)", () => {
  // These tests pin the query used by findPublished() so any regression that
  // would expose draft pages through the public endpoint is caught immediately.

  it("queries with status='published' (AC1 — drafts never appear)", async () => {
    // AC1: only published pages must be returned; the where clause is the gate.
    // Bound the function body from the method signature to the next async method.
    const source = await readAppFile("../../apps/api/src/pages/pages.service.ts");
    const fnIdx = source.indexOf("async findPublished()");
    expect(fnIdx).toBeGreaterThan(-1);
    const nextFnIdx = source.indexOf("async findPublishedBySlug", fnIdx + 1);
    const fnBody = nextFnIdx === -1 ? source.slice(fnIdx) : source.slice(fnIdx, nextFnIdx);
    expect(fnBody).toContain('"published"');
    expect(fnBody).toContain("status");
  });

  it("orders results by title ASC (AC4 — deterministic ordering)", async () => {
    // AC4: Title ascending ordering makes the list deterministic across DB calls.
    // Search from the function start to the next async method declaration so we
    // capture the full multi-line body including the order clause.
    const source = await readAppFile("../../apps/api/src/pages/pages.service.ts");
    const fnIdx = source.indexOf("async findPublished()");
    expect(fnIdx).toBeGreaterThan(-1);
    // Find the end of the function by looking for the next method signature
    const nextFnIdx = source.indexOf("async findPublishedBySlug", fnIdx + 1);
    const fnBody = nextFnIdx === -1 ? source.slice(fnIdx) : source.slice(fnIdx, nextFnIdx);
    expect(fnBody).toContain("title");
    expect(fnBody).toContain("ASC");
  });

  it("does not include draft or unpublished pages (AC1 — shared predicate pinned)", async () => {
    // AC1 operator pin: the where clause must specify 'published' and must not
    // contain 'draft' or 'unpublished' — those statuses must be excluded.
    const source = await readAppFile("../../apps/api/src/pages/pages.service.ts");
    const fnIdx = source.indexOf("async findPublished()");
    const nextFnIdx = source.indexOf("async findPublishedBySlug", fnIdx + 1);
    const fnBody = nextFnIdx === -1 ? source.slice(fnIdx) : source.slice(fnIdx, nextFnIdx);
    expect(fnBody).not.toContain('"draft"');
    expect(fnBody).not.toContain('"unpublished"');
  });
});
