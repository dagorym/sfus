/**
 * Source-contract tests for /docs/edit/[...path] (DocsEditPage).
 *
 * Uses the source-audit pattern (reading source files and asserting on their
 * content), consistent with docs-index.spec.ts and docs-page.spec.ts.
 * No DOM test environment is available; behavioral assertions target source text.
 *
 * Acceptance criteria covered:
 *  AC1 - A staff user can edit an existing page (add revision) and optionally
 *         rename (title/slug change triggers PATCH before POST /revisions).
 *  AC2 - Lock acquire/release UX: lock-held indicator; 409 conflict surfaces
 *         holder ID and expiry from error.details via isLockConflictError;
 *         release clears the lock state.
 *  AC3 - Non-staff client gate renders "Access denied" with role=alert; gate
 *         uses resolveProtectedSession + hasGlobalRole('moderator').
 *  AC4 - next build and lint pass; component is generic; only default export.
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

const FILE = "app/docs/edit/[...path]/page.tsx";

// ---------------------------------------------------------------------------
// AC1: Edit page — form structure and page load
// ---------------------------------------------------------------------------

describe("DocsEditPage (app/docs/edit/[...path]/page.tsx) — structure and page load (AC1)", () => {
  it("is a 'use client' component", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain('"use client"');
  });

  it("imports getDocPageByPath and addDocRevision from docs-client", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("getDocPageByPath");
    expect(source).toContain("addDocRevision");
    expect(source).toContain('from "../../docs-client"');
  });

  it("uses useParams to get catch-all path segments", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("useParams");
    expect(source).toContain('from "next/navigation"');
  });

  it("joins path segments with '/' to construct the full API path", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain('join("/")');
  });

  it("seeds title, slug, and body from the loaded page on mount", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("fetched.title");
    expect(source).toContain("fetched.currentRevision");
    expect(source).toContain("setTitle(");
    expect(source).toContain("setBody(");
  });

  it("renders a title input field marked as required", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Title");
    expect(source).toContain('type="text"');
    expect(source).toContain("required");
  });

  it("renders a slug input field with a URL-impact hint", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Slug");
    expect(source).toContain("rewrites the URL");
  });

  it("renders a MarkdownEditor for the body field", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("MarkdownEditor");
  });

  it("renders a Save revision submit button", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Save revision");
  });

  it("renders a Cancel button that navigates back to the page", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Cancel");
    expect(source).toContain("/docs");
  });

  it("shows loading state while doc is being fetched", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Loading document");
  });

  it("shows error state with role=alert when document is not found or fetch fails", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain('role="alert"');
    expect(source).toContain("Document not found");
  });

  it("shows save-success confirmation message after successful revision save", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Revision saved successfully");
    expect(source).toContain("saveSuccess");
  });
});

// ---------------------------------------------------------------------------
// AC1: Edit page — save (add revision) and rename flow
// ---------------------------------------------------------------------------

describe("DocsEditPage (app/docs/edit/[...path]/page.tsx) — save and rename flow (AC1)", () => {
  it("calls addDocRevision (POST /revisions) on save", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("addDocRevision(");
  });

  it("passes pageId and body (with optional title and summary) to addDocRevision", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("page.id");
    expect(source).toContain("body");
    expect(source).toContain("title:");
    expect(source).toContain("summary:");
  });

  it("imports renameDocPage from docs-client for optional rename", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("renameDocPage");
  });

  it("calls renameDocPage (PATCH) only when title or slug changed from original values", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("titleChanged");
    expect(source).toContain("slugChanged");
    expect(source).toContain("renameDocPage(");
  });

  it("stores original title and slug baselines to detect rename-eligible changes", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("originalTitle");
    expect(source).toContain("originalSlug");
    expect(source).toContain("setOriginalTitle");
    expect(source).toContain("setOriginalSlug");
  });

  it("updates originalTitle and originalSlug after a successful rename", async () => {
    const source = await readAppFile(FILE);
    // After a successful rename, the originals are updated so re-submit doesn't re-patch
    const handleSubmitBlock = source.slice(
      source.indexOf("const handleSubmit"),
      source.indexOf("// ------------------------------------------------------------------\n  // Render: loading")
    );
    expect(handleSubmitBlock).toContain("setOriginalTitle(");
    expect(handleSubmitBlock).toContain("setOriginalSlug(");
  });

  it("shows saving state while the save call is in flight", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Saving…");
    expect(source).toContain("saving");
  });

  it("disables the save button while saving", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("disabled={saving");
  });
});

// ---------------------------------------------------------------------------
// AC2: Lock acquire/release UX
// ---------------------------------------------------------------------------

describe("DocsEditPage (app/docs/edit/[...path]/page.tsx) — lock acquire UX (AC2)", () => {
  it("imports acquireDocLock from docs-client", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("acquireDocLock");
    expect(source).toContain('from "../../docs-client"');
  });

  it("renders an 'Acquire lock' button when no lock is held", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Acquire lock");
  });

  it("shows a 'Lock held' indicator when lockHeld is true (aria-live for screen readers)", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Lock held");
    expect(source).toContain("lockHeld");
    expect(source).toContain('aria-live="polite"');
  });

  it("shows 'Acquiring…' label on the button while the acquire call is in flight", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Acquiring…");
    expect(source).toContain("lockWorking");
  });

  it("transitions to showing 'Release lock' button after lock is acquired (lockHeld state)", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Release lock");
    expect(source).toContain("lockHeld ?");
  });

  it("calls acquireDocLock with the page's id", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("acquireDocLock(page.id)");
  });

  it("sets lockHeld=true after a successful acquireDocLock call", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("setLockHeld(true)");
  });
});

describe("DocsEditPage (app/docs/edit/[...path]/page.tsx) — lock release UX (AC2)", () => {
  it("imports releaseDocLock from docs-client", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("releaseDocLock");
  });

  it("calls releaseDocLock with the page's id when Release lock is triggered", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("releaseDocLock(page.id)");
  });

  it("sets lockHeld=false after a successful release", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("setLockHeld(false)");
  });

  it("shows 'Releasing…' label on the button while the release call is in flight", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Releasing…");
  });
});

// ---------------------------------------------------------------------------
// AC2: 409 lock-conflict messaging — holder ID and expiry from error.details
// ---------------------------------------------------------------------------

describe("DocsEditPage (app/docs/edit/[...path]/page.tsx) — 409 lock-conflict messaging (AC2)", () => {
  it("imports isLockConflictError and LockConflictDetails from docs-client", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("isLockConflictError");
    expect(source).toContain("LockConflictDetails");
  });

  it("calls isLockConflictError on errors from acquireDocLock and addDocRevision", async () => {
    const source = await readAppFile(FILE);
    // Must appear at least twice — once in handleAcquireLock and once in handleSubmit
    const occurrences = source.split("isLockConflictError(").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("stores lockConflict from err.lockConflict in state when a 409 conflict is returned", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("err.lockConflict");
    expect(source).toContain("setLockConflict(");
  });

  it("renders a lockBanner with role=alert when lockConflict is set", async () => {
    const source = await readAppFile(FILE);
    // Lock conflict details are surfaced in a separate banner from the acquire-state banner
    expect(source).toContain("lockConflict");
    expect(source).toContain('role="alert"');
    expect(source).toContain("lockBanner");
  });

  it("displays the holder's user ID (lockedByUserId) in the conflict message", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("lockConflict.lockedByUserId");
  });

  it("displays lock expiry time (lockExpiresAt) from the conflict details when present", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("lockConflict.lockExpiresAt");
    expect(source).toContain("Expires");
  });

  it("clears lockConflict state when a lock is successfully acquired or released", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("setLockConflict(null)");
  });
});

// ---------------------------------------------------------------------------
// AC2: Foreign-lock indicator (locked by someone else on page load)
// ---------------------------------------------------------------------------

describe("DocsEditPage (app/docs/edit/[...path]/page.tsx) — foreign lock indicator (AC2)", () => {
  it("computes activeForeignLock from lock state to detect non-expired foreign holders", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("activeForeignLock");
    expect(source).toContain("lock.isLocked");
    expect(source).toContain("lockExpiresAt");
    expect(source).toContain("new Date(");
  });

  it("disables the Save revision button when a foreign lock is active", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("foreignLock");
    // The submit button is disabled={saving || foreignLock}
    expect(source).toContain("disabled={saving || foreignLock}");
  });

  it("renders a lockBanner with role=status for the foreign-lock state", async () => {
    const source = await readAppFile(FILE);
    // The foreign-lock banner uses role="status" (informational, not an action error)
    const bannerBlock = source.slice(
      source.indexOf("foreignLock &&"),
      source.indexOf("lockConflict ?")
    );
    expect(bannerBlock).toContain('role="status"');
    expect(bannerBlock).toContain("locked by another user");
  });

  it("shows the foreign lock's expiry time when page.lock.lockExpiresAt is set", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("page.lock.lockExpiresAt");
    expect(source).toContain("Lock expires");
  });
});

// ---------------------------------------------------------------------------
// AC3: Client gate — non-staff access
// ---------------------------------------------------------------------------

describe("DocsEditPage (app/docs/edit/[...path]/page.tsx) — client gate (AC3)", () => {
  it("imports resolveProtectedSession and hasGlobalRole from auth-client", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('from "../../../auth-client"');
  });

  it("calls resolveProtectedSession with the /docs/edit/<path> URL on mount", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("resolveProtectedSession(");
    expect(source).toContain("/docs/edit/");
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

  it("access-denied message has role=alert and states staff access is required to edit", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain('role="alert"');
    expect(source).toContain("Staff access required to edit");
  });

  it("shows 'Checking authorization' while the session check is in progress", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("Checking authorization");
  });

  it("sets authorized=false for non-moderator users", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("setAuthorized(false)");
  });

  it("sets authorized=true only when hasGlobalRole passes", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("setAuthorized(true)");
  });
});

// ---------------------------------------------------------------------------
// AC4: Export constraints and genericity
// ---------------------------------------------------------------------------

describe("DocsEditPage (app/docs/edit/[...path]/page.tsx) — export constraints and genericity (AC4)", () => {
  it("exports a default function (DocsEditPage)", async () => {
    const source = await readAppFile(FILE);
    expect(source).toContain("export default function DocsEditPage");
  });

  it("does not export non-allowlisted App Router named exports", async () => {
    const source = await readAppFile(FILE);
    expect(source).not.toContain("export const metadata");
    expect(source).not.toContain("export async function generateMetadata");
    expect(source).not.toContain("export const revalidate");
    expect(source).not.toContain("export const dynamic");
  });

  it("is generic — gate logic uses only the 'moderator' threshold check (no role names in conditions)", async () => {
    const source = await readAppFile(FILE);
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
