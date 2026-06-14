/**
 * Source-contract tests for the /docs/history/[...path] page (DocsHistoryPage).
 *
 * Uses the source-audit pattern (reading source files and asserting on their
 * content), consistent with docs-page.spec.ts and docs-edit-page.spec.ts.
 *
 * Acceptance criteria covered:
 *  AC1 - History view lists revisions with author/editor, summary, and timestamp.
 *  AC2 - Diff view renders side-by-side (added/removed/unchanged clearly
 *         distinguished; line-number gutters present).
 *  AC3 - Staff users see rollback buttons; non-staff users see no rollback
 *         affordance (client gate via hasGlobalRole 'moderator').
 *  AC4 - lint/build pass.
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

const PAGE_FILE = "app/docs/history/[...path]/page.tsx";

// ---------------------------------------------------------------------------
// AC1: History list — revisions with author/editor, summary, timestamp
// ---------------------------------------------------------------------------

describe("DocsHistoryPage — revision history list (AC1)", () => {
  it("is a 'use client' component", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain('"use client"');
  });

  it("exports a default function (DocsHistoryPage)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("export default function DocsHistoryPage");
  });

  it("imports getDocHistory from docs-client", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("getDocHistory");
    expect(source).toContain('from "../../docs-client"');
  });

  it("renders revision numbers for each revision", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("rev.revisionNumber");
  });

  it("renders author display name (editorUsername fallback to author name)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("rev.editorUsername");
    expect(source).toContain("rev.author");
  });

  it("renders a timestamp for each revision using createdAt", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("rev.createdAt");
    expect(source).toContain("toLocaleString");
  });

  it("renders revision summary when present", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("rev.summary");
  });

  it("renders the history list as an ordered list (ol)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("<ol");
  });

  it("shows 'No revisions recorded' when the history list is empty", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("No revisions recorded");
  });

  it("shows loading state while history is being fetched", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("Loading");
  });

  it("shows a not-found state when the page is null (404)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("page === null");
    expect(source).toContain("Document not found");
  });

  it("includes a Back to document link to /docs/<path>", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("/docs/${fullPath}");
    expect(source).toContain("Back to document");
  });

  it("shows an error state with role=alert when load fails", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain('role="alert"');
  });
});

// ---------------------------------------------------------------------------
// AC2: Side-by-side diff renderer
// ---------------------------------------------------------------------------

describe("DocsHistoryPage — side-by-side diff renderer (AC2)", () => {
  it("imports getDocDiff from docs-client", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("getDocDiff");
  });

  it("renders a diff table with aria-label 'Side-by-side diff'", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain('"Side-by-side diff"');
  });

  it("applies a CSS class for removed lines (red left side)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("diffLineRemoved");
  });

  it("applies a CSS class for added lines (green right side)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("diffLineAdded");
  });

  it("applies a CSS class for unchanged lines (muted both sides)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("diffLineUnchanged");
  });

  it("renders line-number gutters using diffLineGutter CSS class", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("diffLineGutter");
  });

  it("renders null line numbers for added lines on the left (removed-side gutter empty)", async () => {
    const source = await readAppFile(PAGE_FILE);
    // added lines have leftLineNum null
    expect(source).toContain("leftLineNum={null}");
  });

  it("renders null line numbers for removed lines on the right (added-side gutter empty)", async () => {
    const source = await readAppFile(PAGE_FILE);
    // removed lines have rightLineNum null
    expect(source).toContain("rightLineNum={null}");
  });

  it("handles hunk type 'unchanged', 'added', and 'removed'", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain('"unchanged"');
    expect(source).toContain('"added"');
    expect(source).toContain('"removed"');
  });

  it("shows revision column headers (fromLabel, toLabel) in diff table header row", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("fromLabel");
    expect(source).toContain("toLabel");
    expect(source).toContain("<thead");
  });

  it("shows 'No differences' message when hunks array is empty (identical revisions)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("No differences");
    expect(source).toContain("identical");
  });

  it("shows 'too large to compare' friendly error when diff endpoint returns size-cap error", async () => {
    const source = await readAppFile(PAGE_FILE);
    // The page stores diffError state and renders it
    expect(source).toContain("diffError");
  });

  it("shows loading indicator while diff is being fetched", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("diffLoading");
    expect(source).toContain("Loading diff");
  });
});

// ---------------------------------------------------------------------------
// AC2: Diff selectors auto-populate to (latest-1, latest) on initial load
// ---------------------------------------------------------------------------

describe("DocsHistoryPage — diff selector auto-population (AC2)", () => {
  it("tracks fromRev and toRev state", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("fromRev");
    expect(source).toContain("toRev");
    expect(source).toContain("setFromRev");
    expect(source).toContain("setToRev");
  });

  it("auto-selects (latest-1, latest) when >= 2 revisions exist on load", async () => {
    const source = await readAppFile(PAGE_FILE);
    // Initial-load pre-selection logic: sorted and second-to-last assigned to fromRev
    expect(source).toContain("hist.length >= 2");
    expect(source).toContain("sorted[sorted.length - 2].revisionNumber");
    expect(source).toContain("sorted[sorted.length - 1].revisionNumber");
  });

  it("renders From and To selector controls (diff-from, diff-to)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain('id="diff-from"');
    expect(source).toContain('id="diff-to"');
  });

  it("selects are disabled when only one revision exists", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("sortedHistory.length < 2");
    expect(source).toContain("disabled=");
  });

  it("shows 'Only one revision exists' when less than 2 revisions exist", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("Only one revision exists");
  });
});

// ---------------------------------------------------------------------------
// AC3: Staff rollback affordance — client gate via hasGlobalRole('moderator')
// ---------------------------------------------------------------------------

describe("DocsHistoryPage — rollback affordance: staff vs non-staff (AC3)", () => {
  it("imports readSession and hasGlobalRole from auth-client", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("readSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('from "../../../auth-client"');
  });

  it("derives isStaff using hasGlobalRole with 'moderator' role (client gate)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"moderator"');
    expect(source).toContain("isStaff");
  });

  it("renders rollback buttons only inside an isStaff conditional", async () => {
    const source = await readAppFile(PAGE_FILE);
    // Roll back button must appear only within the isStaff branch
    const isStaffIdx = source.lastIndexOf("isStaff ?");
    expect(isStaffIdx).toBeGreaterThan(-1);
    const rollBackIdx = source.indexOf("Roll back", isStaffIdx);
    expect(rollBackIdx).toBeGreaterThan(isStaffIdx);
  });

  it("rollback button conditional is gated to null for non-staff (isStaff ? ... : null)", async () => {
    const source = await readAppFile(PAGE_FILE);
    // The roll-back button JSX must be followed by a null fallback
    const buttonSection = source.slice(source.lastIndexOf("isStaff ?"));
    expect(buttonSection).toContain(": null");
  });

  it("rollback button has aria-label referencing the revision number", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("aria-label");
    expect(source).toContain("Roll back to revision");
  });

  it("imports rollbackDocPage from docs-client", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("rollbackDocPage");
  });

  it("shows rollback success message with the new revision number after rollback", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("rollbackSuccess");
    expect(source).toContain("Rolled back to revision");
    expect(source).toContain("New revision");
  });

  it("shows rollback error message with role=alert when rollback fails", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("rollbackError");
    // Error must be shown with accessibility role
    const alertIdx = source.indexOf('role="alert"');
    expect(alertIdx).toBeGreaterThan(-1);
  });

  it("reloads history and updates diff selectors to (rolled-back-rev, new-rev) after successful rollback", async () => {
    const source = await readAppFile(PAGE_FILE);
    // After rollback, getDocHistory is called again and fromRev/toRev are updated
    const rollbackFn = source.slice(source.indexOf("const handleRollback"));
    expect(rollbackFn).toContain("getDocHistory");
    expect(rollbackFn).toContain("setFromRev(revisionNumber)");
    expect(rollbackFn).toContain("setToRev(");
  });

  it("rollback button shows 'Rolling back…' label while the operation is in progress", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("Rolling back");
    expect(source).toContain("rollingBack");
  });
});

// ---------------------------------------------------------------------------
// AC4: Module-level constraints
// ---------------------------------------------------------------------------

describe("DocsHistoryPage — module-level constraints (AC4)", () => {
  it("does not export non-allowlisted App Router named exports", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).not.toContain("export const metadata");
    expect(source).not.toContain("export async function generateMetadata");
    expect(source).not.toContain("export const revalidate");
    expect(source).not.toContain("export const dynamic");
    expect(source).not.toContain("export const generateStaticParams");
  });

  it("uses useParams to get catch-all path segments", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain("useParams");
    expect(source).toContain('from "next/navigation"');
  });

  it("joins path segments with '/' to form the full API path", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain('join("/")');
  });

  it("imports styles from docs.module.css (shared styles)", async () => {
    const source = await readAppFile(PAGE_FILE);
    expect(source).toContain('from "../../docs.module.css"');
  });
});

// ---------------------------------------------------------------------------
// AC6 (d): handleRollback re-fetches full page via getDocPageByPath
//
// Crash regression: rollbackDocPage returns a partial DocWriteResultShape
// (no .lock / .currentRevision / .breadcrumbs). If handleRollback called
// setPage with that partial result, render code accessing page.lock.isLocked
// would crash. The fix re-fetches the full page first.
// ---------------------------------------------------------------------------

describe("DocsHistoryPage — rollback re-fetches full page via getDocPageByPath (AC6/d)", () => {
  it("handleRollback calls getDocPageByPath after rollbackDocPage (not setPage with partial result)", async () => {
    const source = await readAppFile(PAGE_FILE);
    const rollbackFn = source.slice(source.indexOf("const handleRollback"));
    // getDocPageByPath must be called inside handleRollback (the re-fetch step)
    expect(rollbackFn).toContain("getDocPageByPath(");
  });

  it("handleRollback passes the path from writeResult to getDocPageByPath (finalPath pattern)", async () => {
    const source = await readAppFile(PAGE_FILE);
    const rollbackFn = source.slice(source.indexOf("const handleRollback"));
    // The path is derived from the write result, not from the stale page state
    expect(rollbackFn).toContain("writeResult.path");
    expect(rollbackFn).toContain("finalPath");
    expect(rollbackFn).toContain("getDocPageByPath(finalPath)");
  });

  it("calls setPage with the result of getDocPageByPath (full DocsPageShape), not write result", async () => {
    const source = await readAppFile(PAGE_FILE);
    const rollbackFn = source.slice(source.indexOf("const handleRollback"));
    // setPage must be called with refreshed (full page), never with writeResult
    expect(rollbackFn).toContain("setPage(refreshed)");
    expect(rollbackFn).not.toMatch(/setPage\(writeResult\)/);
  });

  it("imports getDocPageByPath from docs-client (used in both page-load and rollback)", async () => {
    const source = await readAppFile(PAGE_FILE);
    // getDocPageByPath is imported for use in rollback re-fetch
    expect(source).toContain("getDocPageByPath");
    expect(source).toContain('from "../../docs-client"');
  });

  it("rollbackDocPage is imported from docs-client and called with page.id and revisionNumber", async () => {
    const source = await readAppFile(PAGE_FILE);
    const rollbackFn = source.slice(source.indexOf("const handleRollback"));
    expect(rollbackFn).toContain("rollbackDocPage(page.id, revisionNumber)");
  });

  it("DocWriteResultShape is referenced as the return type of rollbackDocPage call (not DocsPageShape)", async () => {
    const source = await readAppFile(PAGE_FILE);
    // The rollback write result variable stores a DocWriteResultShape
    const rollbackFn = source.slice(source.indexOf("const handleRollback"));
    // The variable holding the write result is assigned from rollbackDocPage (not cast to DocsPageShape)
    expect(rollbackFn).toContain("writeResult");
    expect(rollbackFn).toContain("rollbackDocPage");
    // Must NOT call setPage(writeResult) — that's the crash pattern
    expect(rollbackFn).not.toMatch(/setPage\(writeResult\)/);
  });

  it("rollback still reloads history (getDocHistory) after re-fetching the page", async () => {
    const source = await readAppFile(PAGE_FILE);
    const rollbackFn = source.slice(source.indexOf("const handleRollback"));
    // After re-fetching full page, history is also reloaded
    expect(rollbackFn).toContain("getDocHistory");
  });
});
