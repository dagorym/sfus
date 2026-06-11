/**
 * Source-contract tests for the /docs/[...path] page (DocsPageView).
 *
 * Uses the source-audit pattern (reading source files and asserting on their
 * content), consistent with blog.spec.ts and forums.spec.ts in this workspace.
 * No DOM test environment is available.
 *
 * Acceptance criteria covered:
 *  AC1 - /docs/<path> renders page with breadcrumb trail and sanitized Markdown
 *  AC2 - Non-staff/anonymous visitor sees no edit/lock/history affordances;
 *         staff session sees them (hasGlobalRole client gate)
 *  AC3 - Nonexistent/gated path renders the not-found state (no oracle distinction)
 *  AC4 - Route file exports only default; lint/build pass
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
// AC1: /docs/[...path] — basic structure and Markdown rendering
// ---------------------------------------------------------------------------

describe("DocsPageView (app/docs/[...path]/page.tsx) — structure and rendering (AC1)", () => {
  it("is a 'use client' component", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain('"use client"');
  });

  it("imports getDocPageByPath from docs-client", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("getDocPageByPath");
    expect(source).toContain('from "../docs-client"');
  });

  it("uses useParams to get catch-all path segments", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("useParams");
    expect(source).toContain('from "next/navigation"');
  });

  it("joins path segments with '/' to form the full API path", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain('join("/")');
  });

  it("renders page title in an h1", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("page.title");
    expect(source).toContain("<h1");
  });

  it("renders page content through MarkdownRenderer (never raw dangerouslySetInnerHTML on body)", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("MarkdownRenderer");
    expect(source).toContain('from "../../../components/markdown-renderer"');
    expect(source).not.toContain("dangerouslySetInnerHTML={{ __html: page.currentRevision.body }}");
  });

  it("renders body via MarkdownRenderer using currentRevision.body", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("<MarkdownRenderer content={page.currentRevision.body}");
  });

  it("renders revision summary when present", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("page.currentRevision.summary");
  });

  it("shows 'no content' message when currentRevision is null", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("no content yet");
  });

  it("renders revision number and author information", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("page.currentRevision.revisionNumber");
    expect(source).toContain("page.currentRevision.author");
  });

  it("shows loading state while data is being fetched", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("Loading");
  });

  it("shows error state with role=alert when fetch fails", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain('role="alert"');
    expect(source).toContain("Unable to load this document");
  });
});

// ---------------------------------------------------------------------------
// AC1: Breadcrumb trail
// ---------------------------------------------------------------------------

describe("DocsPageView (app/docs/[...path]/page.tsx) — breadcrumb trail (AC1)", () => {
  it("renders a breadcrumb nav with aria-label='Breadcrumb'", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain('aria-label="Breadcrumb"');
    expect(source).toContain("<nav");
  });

  it("breadcrumb nav contains an ordered list (ol)", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("<ol");
  });

  it("breadcrumb trail includes a 'Documents' root link to /docs", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain('href="/docs"');
    expect(source).toContain("Documents");
  });

  it("breadcrumb trail renders ancestor crumbs from page.breadcrumbs", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("page.breadcrumbs");
    expect(source).toContain("crumb.title");
    expect(source).toContain("crumb.path");
  });

  it("current page has aria-current='page' in the breadcrumb trail", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain('aria-current="page"');
    expect(source).toContain("page.title");
  });

  it("ancestor breadcrumb links target /docs/<crumb.path>", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("/docs/${crumb.path}");
  });
});

// ---------------------------------------------------------------------------
// AC2: Staff vs non-staff affordances
// ---------------------------------------------------------------------------

describe("DocsPageView (app/docs/[...path]/page.tsx) — staff affordances (AC2)", () => {
  it("imports readSession and hasGlobalRole from auth-client", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("readSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('from "../../auth-client"');
  });

  it("derives isStaff using hasGlobalRole with 'moderator' role", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"moderator"');
    expect(source).toContain("isStaff");
  });

  it("Edit link points to /docs/<path>/edit (staff-only)", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("/edit");
    expect(source).toContain("Edit");
  });

  it("History link points to /docs/<path>/history (staff-only)", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("/history");
    expect(source).toContain("History");
  });

  it("staff affordances block is conditional on isStaff", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    const staffBlockStart = source.indexOf("isStaff ?");
    expect(staffBlockStart).toBeGreaterThan(-1);
    // Edit link must appear after the isStaff conditional
    const editLinkIdx = source.lastIndexOf("Edit");
    expect(editLinkIdx).toBeGreaterThan(staffBlockStart);
  });

  it("non-staff conditional renders null (no edit/history for non-staff)", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("isStaff ?");
    const staffBlock = source.slice(source.lastIndexOf("isStaff ?"));
    expect(staffBlock).toContain(": null");
  });

  it("Acquire lock affordance is rendered for staff when page is not locked", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("Acquire lock");
  });

  it("Acquire lock affordance is conditionally hidden when page is already locked", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    // Acquire lock is only shown when !isLocked
    expect(source).toContain("!isLocked");
    expect(source).toContain("Acquire lock");
  });
});

// ---------------------------------------------------------------------------
// AC2: Lock banner visible to all when page is locked
// ---------------------------------------------------------------------------

describe("DocsPageView (app/docs/[...path]/page.tsx) — lock state indicator (AC2)", () => {
  it("computes isLocked from lock.isLocked, lockExpiresAt, and expiry date comparison", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("page.lock.isLocked");
    expect(source).toContain("page.lock.lockExpiresAt");
    expect(source).toContain("new Date(");
    expect(source).toContain("isLocked");
  });

  it("lockBanner is rendered for all users (not gated by isStaff) when isLocked", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("lockBanner");
    expect(source).toContain("locked");
    // Lock banner must appear outside (before) the isStaff affordance block
    const lockBannerIdx = source.indexOf("lockBanner");
    const staffBlockIdx = source.lastIndexOf("isStaff ?");
    expect(lockBannerIdx).toBeLessThan(staffBlockIdx);
  });

  it("lockBanner has role=status for screen readers", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain('role="status"');
  });

  it("lockBanner shows a lock expiry time when lockExpiresAt is set", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("page.lock.lockExpiresAt");
    expect(source).toContain("Expires");
  });
});

// ---------------------------------------------------------------------------
// AC3: Not-found state — no oracle distinction
// ---------------------------------------------------------------------------

describe("DocsPageView (app/docs/[...path]/page.tsx) — not-found state (AC3)", () => {
  it("renders not-found state when API returns null (page does not exist or is gated)", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("page === null");
    expect(source).toContain("Document not found");
  });

  it("not-found message does NOT distinguish between missing and access-denied (no oracle distinction)", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    // The not-found path uses a single message that covers both existence and visibility
    const notFoundBlock = source.slice(
      source.indexOf("page === null"),
      source.indexOf("// ------------------------------------------------------------------\n  // Page view")
    );
    expect(notFoundBlock).toContain("does not exist or is not publicly accessible");
    // Must NOT reveal whether the page exists
    expect(notFoundBlock).not.toContain("You do not have permission");
    expect(notFoundBlock).not.toContain("access denied");
  });

  it("not-found state includes a Back to Documents link (/docs)", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    const notFoundBlock = source.slice(
      source.indexOf("page === null"),
      source.indexOf("// ------------------------------------------------------------------\n  // Page view")
    );
    expect(notFoundBlock).toContain('href="/docs"');
    expect(notFoundBlock).toContain("Back to Documents");
  });
});

// ---------------------------------------------------------------------------
// AC4: Route file exports — only default export
// ---------------------------------------------------------------------------

describe("DocsPageView (app/docs/[...path]/page.tsx) — export constraints (AC4)", () => {
  it("exports a default function (DocsPageView)", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).toContain("export default function DocsPageView");
  });

  it("does not export non-allowlisted App Router named exports", async () => {
    const source = await readAppFile("app/docs/[...path]/page.tsx");
    expect(source).not.toContain("export const metadata");
    expect(source).not.toContain("export async function generateMetadata");
    expect(source).not.toContain("export const revalidate");
    expect(source).not.toContain("export const dynamic");
    expect(source).not.toContain("export const generateStaticParams");
  });
});
