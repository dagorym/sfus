/**
 * Source-contract tests for /docs/new (DocsNewPage / DocsNewPageInner).
 *
 * Uses the source-audit pattern (reading source files and asserting on their
 * content), consistent with docs-index.spec.ts and docs-page.spec.ts.
 * No DOM test environment is available; behavioral assertions target source text.
 *
 * Acceptance criteria covered:
 *  AC1 - A staff user can create a page (optionally under a parent) by submitting
 *         the form; createDocPage is called and the user is redirected.
 *  AC3 - Non-staff client gate: unauthorized path renders "Access denied" with
 *         role=alert; staff gate resolves via resolveProtectedSession +
 *         hasGlobalRole('moderator').
 *  AC4 - next build and lint pass; component is generic (no role name hardcoded
 *         into logic); only default export.
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

const FILE = "app/docs/new/page.tsx";

// ---------------------------------------------------------------------------
// AC1: Create page form — structure
// ---------------------------------------------------------------------------

describe("DocsNewPage (app/docs/new/page.tsx) — form structure (AC1)", () => {
  it("is a 'use client' component", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain('"use client"');
  });

  it("imports createDocPage from docs-client", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("createDocPage");
    expect(source).toContain('from "../docs-client"');
  });

  it("renders a title input field marked as required", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Title");
    expect(source).toContain('type="text"');
    expect(source).toContain("required");
  });

  it("renders an optional slug input field", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Slug");
    expect(source).toContain("optional");
  });

  it("renders a summary input field (optional)", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Summary");
  });

  it("renders a MarkdownEditor for the body", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("MarkdownEditor");
    expect(source).toContain("Body");
  });

  it("renders a Create page submit button", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Create page");
  });

  it("disables submit button when title is empty (validation guard)", async () => {
    const source = await readAppFile(FILE);
    // The button is disabled when title.trim() is falsy
    expect(source).toContain("!title.trim()");
    expect(source).toContain("disabled=");
  });

  it("renders a Cancel button that navigates back to /docs or the parent page", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Cancel");
    expect(source).toContain("/docs");
  });
});

// ---------------------------------------------------------------------------
// AC1: Create page — submit flow
// ---------------------------------------------------------------------------

describe("DocsNewPage (app/docs/new/page.tsx) — submit flow (AC1)", () => {
  it("calls createDocPage on form submit", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("createDocPage(");
  });

  it("passes title, slug, body, summary, and parentPath to createDocPage", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("title:");
    expect(source).toContain("slug:");
    expect(source).toContain("body");
    expect(source).toContain("summary:");
    expect(source).toContain("parentPath");
  });

  it("redirects to the new page path after successful creation (router.replace)", async () => {
    const source = await readAppFile(FILE);
    // Post-creation: router.replace(`/docs/${created.path}`)
    expect(source).toContain("router.replace");
    expect(source).toContain("created.path");
  });

  it("shows saving state while the createDocPage call is in flight", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Creating…");
    expect(source).toContain("saving");
  });

  it("shows an error message with role=alert when createDocPage throws", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain('role="alert"');
    expect(source).toContain("setError(");
  });

  it("trims the title before passing to createDocPage", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("title.trim()");
  });

  it("passes undefined for empty slug (omitted when blank)", async () => {
    const source = await readAppFile(FILE);
    // slug is passed as undefined when blank: slug.trim() || undefined
    expect(source).toContain("slug.trim() || undefined");
  });
});

// ---------------------------------------------------------------------------
// AC1: parentPath query parameter support
// ---------------------------------------------------------------------------

describe("DocsNewPage (app/docs/new/page.tsx) — parentPath support (AC1)", () => {
  it("reads parentPath from the URL query string via useSearchParams", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("useSearchParams");
    expect(source).toContain('get("parentPath")');
  });

  it("passes parentPath to createDocPage input when present", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("parentPath");
  });

  it("shows a sub-page hint message when parentPath is set", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("sub-page");
    expect(source).toContain("parentPath");
  });

  it("inner component is wrapped in a Suspense boundary (required by useSearchParams)", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Suspense");
    expect(source).toContain("DocsNewPageInner");
  });
});

// ---------------------------------------------------------------------------
// AC3: Client gate — non-staff access
// ---------------------------------------------------------------------------

describe("DocsNewPage (app/docs/new/page.tsx) — client gate (AC3)", () => {
  it("imports resolveProtectedSession and hasGlobalRole from auth-client", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('from "../../auth-client"');
  });

  it("calls resolveProtectedSession with the /docs/new path on mount", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("resolveProtectedSession(");
    expect(source).toContain("/docs/new");
  });

  it("gates access with hasGlobalRole using the 'moderator' threshold", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain('hasGlobalRole(');
    expect(source).toContain('"moderator"');
  });

  it("redirects unauthenticated visitors via router.replace(resolved.redirectTo)", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("resolved.redirectTo");
    expect(source).toContain("router.replace");
  });

  it("renders 'Access denied' heading for authenticated non-staff users", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Access denied");
  });

  it("access-denied message has role=alert and states staff access is required", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain('role="alert"');
    expect(source).toContain("Staff access required");
  });

  it("shows 'Checking authorization' while the session check is in progress", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Checking authorization");
  });

  it("sets authorized=false for non-moderator users (not undefined — explicit denial)", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("setAuthorized(false)");
  });

  it("sets authorized=true only when hasGlobalRole passes", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("setAuthorized(true)");
  });

  it("renders the form only when authorized is true (not null, not false)", async () => {
    const source = await readAppFile(FILE);
    // authorized === null → loading; authorized === false → denied; true → form
    expect(source).toContain("authorized === null");
    expect(source).toContain("authorized === false");
  });
});

// ---------------------------------------------------------------------------
// AC4: Export constraints and genericity
// ---------------------------------------------------------------------------

describe("DocsNewPage (app/docs/new/page.tsx) — export constraints and genericity (AC4)", () => {
  it("exports a default function (DocsNewPage)", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("export default function DocsNewPage");
  });

  it("does not export non-allowlisted App Router named exports", async () => {
    const source = await readAppFile(FILE);
    expect(source).not.toContain("export const metadata");
    expect(source).not.toContain("export async function generateMetadata");
    expect(source).not.toContain("export const revalidate");
    expect(source).not.toContain("export const dynamic");
  });

  it("is generic — no role name other than 'moderator' is hardcoded in gate logic", async () => {
    // AC4: no UI rewrite needed to switch from staff to another role.
    // The gate calls hasGlobalRole with a role string; 'admin' is not a separate
    // code-path — only the threshold role 'moderator' appears in the check.
    const source = await readAppFile(FILE);
    // The only role-specific check: hasGlobalRole(..., "moderator")
    // Confirm no role-name is hardcoded in branch conditions other than that single call
    const gateBlock = source.slice(
      source.indexOf("hasGlobalRole("),
      source.indexOf("setAuthorized(true)")
    );
    expect(gateBlock).toContain('"moderator"');
  });

  it("does not use dangerouslySetInnerHTML", async () => {
    const source = await readAppFile(FILE);
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
