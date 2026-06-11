/**
 * Source-contract tests for the RecentDocActivity component.
 *
 * Uses the source-audit pattern (reading source files and asserting on their
 * content) consistent with public-shell.spec.ts, recent-forum-activity.spec.ts,
 * and other specs in this workspace.
 *
 * Acceptance criteria covered:
 *  AC1 - RecentDocActivity is a 'use client' component
 *  AC2 - Loading state, empty state, and error state are present
 *  AC3 - Edits rendered link to /docs/<edit.path>; shows title and editor meta
 *  AC4 - Error state is non-fatal (no throw)
 *  AC5 - key is edit.pageId
 *  AC6 - No dangerouslySetInnerHTML; all text is React text nodes
 *  AC7 - Fetches from getRecentDocEdits in docs-client
 *  AC8 - "Browse the wiki ->" link target is /docs in page.tsx
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

async function readWebFile(relativePath: string): Promise<string> {
  return readFile(path.join(webRoot, relativePath), "utf8");
}

describe("RecentDocActivity component source contracts", () => {
  it("is declared as a client component (AC1)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toMatch(/^["']use client["']/);
  });

  it("imports getRecentDocEdits from docs-client (AC7)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toContain("getRecentDocEdits");
    expect(source).toContain("docs-client");
  });

  it("imports DocsRecentEditShape type from docs-client (AC7)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toContain("DocsRecentEditShape");
  });

  it("shows loading state while fetching (AC2)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toContain("Loading recent document activity");
  });

  it("shows empty state when no edits are returned (AC2)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toContain("No document activity yet.");
    expect(source).toContain("edits.length === 0");
  });

  it("shows non-fatal error state on fetch failure (AC2, AC4)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toContain("Could not load recent document activity.");
    // Error is caught — catch() sets state rather than re-throwing
    expect(source).toContain(".catch(");
    expect(source).toContain("setError(");
  });

  it("checks error state before edits null state (AC2 — error renders before loading/empty checks)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    const errorCheckIdx = source.indexOf("error !== null");
    const editsNullIdx = source.indexOf("edits === null");
    expect(errorCheckIdx).toBeGreaterThan(-1);
    expect(editsNullIdx).toBeGreaterThan(-1);
    expect(errorCheckIdx).toBeLessThan(editsNullIdx);
  });

  it("uses useState for edits and error state, and useEffect for fetching (AC2)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toContain("useState");
    expect(source).toContain("useEffect");
  });

  it("calls getRecentDocEdits with limit 5 (AC7)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toContain("getRecentDocEdits(5)");
  });

  it("renders edit titles as links to /docs/<edit.path> (AC3)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    // Link href includes /docs/ prefix and edit.path
    expect(source).toContain("/docs/");
    expect(source).toContain("edit.path");
    // Title is rendered as a text node inside the link
    expect(source).toContain("edit.title");
  });

  it("uses edit.pageId as the list item key (AC5)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toContain("key={edit.pageId}");
  });

  it("renders editor name in meta (AC3)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    // Handles both displayName and username fallback
    expect(source).toContain("edit.editor");
    expect(source).toContain("displayName");
    expect(source).toContain("username");
    // Falls back gracefully when editor is null
    expect(source).toContain("Unknown editor");
  });

  it("renders editedAt date in meta (AC3)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).toContain("edit.editedAt");
    expect(source).toContain("toLocaleDateString");
  });

  it("does not use dangerouslySetInnerHTML (AC6)", async () => {
    const source = await readWebFile("components/recent-doc-activity.tsx");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("includes a Browse the wiki link pointing to /docs in page.tsx (AC8)", async () => {
    const pageSource = await readWebFile("app/page.tsx");
    expect(pageSource).toContain("RecentDocActivity");
    // The "Browse the wiki" link must be present alongside RecentDocActivity
    expect(pageSource).toContain("Browse the wiki");
    expect(pageSource).toContain('href="/docs"');
  });

  it("docs-client exports DocsRecentEditShape type and getRecentDocEdits function (AC7)", async () => {
    const clientSource = await readWebFile("app/docs/docs-client.ts");
    expect(clientSource).toContain("DocsRecentEditShape");
    expect(clientSource).toContain("getRecentDocEdits");
    // Must call /docs/recent endpoint
    expect(clientSource).toContain("/docs/recent");
    // Must not require credentials (public endpoint)
    const fnStart = clientSource.indexOf("export async function getRecentDocEdits");
    const fnEnd = clientSource.indexOf("\n}", fnStart);
    const fnBody = clientSource.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('credentials: "include"');
  });

  it("page.tsx has Browse-the-wiki primary CTA and Documents wiki highlight card (AC2, AC8)", async () => {
    const pageSource = await readWebFile("app/page.tsx");
    // Primary CTA text
    expect(pageSource).toContain("Browse the wiki");
    // Documents wiki highlight card exists in the highlights grid
    expect(pageSource).toContain("Documents wiki");
    // Documents wiki entry is present in the explore section and appears before Forums
    const docsIdx = pageSource.indexOf("browse the hierarchical wiki");
    const forumsIdx = pageSource.indexOf("browse boards and join the discussion");
    expect(docsIdx).toBeGreaterThan(-1);
    expect(forumsIdx).toBeGreaterThan(-1);
    expect(docsIdx).toBeLessThan(forumsIdx);
  });
});
