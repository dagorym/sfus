/**
 * Source-contract tests for the /docs index page (DocsIndexPage).
 *
 * Uses the source-audit pattern (reading source files and asserting on their
 * content), consistent with blog.spec.ts and forums.spec.ts in this workspace.
 * No DOM test environment is available.
 *
 * Acceptance criteria covered:
 *  AC1 - /docs renders site page tree (DocsTreeItem list with links)
 *  AC2 - Non-staff/anonymous visitors see no create affordance; staff session sees
 *         "Create page" link (hasGlobalRole client gate)
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
// AC1: /docs page — page tree rendering
// ---------------------------------------------------------------------------

describe("DocsIndexPage (app/docs/page.tsx) — page tree rendering (AC1)", () => {
  it("is a 'use client' component", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain('"use client"');
  });

  it("imports getDocPageTree from docs-client", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain("getDocPageTree");
    expect(source).toContain('from "./docs-client"');
  });

  it("calls getDocPageTree (no parentPath arg) to populate the index", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain("getDocPageTree()");
  });

  it("renders page links under /docs/<path>", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain("/docs/${page.path}");
    expect(source).toContain("page.title");
  });

  it("shows empty-state message when no pages have been published", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain("No pages have been published yet");
  });

  it("shows loading state while data is being fetched", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain("Loading");
  });

  it("shows error state with role=alert when fetch fails", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain('role="alert"');
    expect(source).toContain("Unable to load the documents index");
  });

  it("renders hasChildren hint for pages that have sub-pages", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain("page.hasChildren");
    expect(source).toContain("Has sub-pages");
  });
});

// ---------------------------------------------------------------------------
// AC2: /docs page — staff vs non-staff affordances
// ---------------------------------------------------------------------------

describe("DocsIndexPage (app/docs/page.tsx) — staff affordances (AC2)", () => {
  it("imports readSession and hasGlobalRole from auth-client", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain("readSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('from "../auth-client"');
  });

  it("derives isStaff using hasGlobalRole with 'moderator' role", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"moderator"');
    expect(source).toContain("isStaff");
  });

  it("staff Create page link points to /docs/new", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain('href="/docs/new"');
    expect(source).toContain("Create page");
  });

  it("Create page link is rendered only when isStaff is true (conditional gate)", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    // The create link must be inside the isStaff conditional
    const staffBlockStart = source.indexOf("isStaff ?");
    expect(staffBlockStart).toBeGreaterThan(-1);
    // The /docs/new link must appear after the isStaff conditional
    const createLinkIdx = source.indexOf('href="/docs/new"');
    expect(createLinkIdx).toBeGreaterThan(staffBlockStart);
  });

  it("non-staff conditional renders null (no create affordance for non-staff)", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    // isStaff conditional: isStaff ? <create> : null
    expect(source).toContain("isStaff ?");
    // The else branch must be null (nothing rendered for non-staff)
    const staffBlock = source.slice(source.indexOf("isStaff ?"));
    expect(staffBlock).toContain(": null");
  });

  it("does NOT show create affordance unconditionally (not outside isStaff gate)", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    // Verify Create page link is only inside the staff conditional block
    const createLinkIdx = source.indexOf('href="/docs/new"');
    // There must be an isStaff conditional enclosing the create link
    const upToCreateLink = source.slice(0, createLinkIdx);
    expect(upToCreateLink).toContain("isStaff");
  });
});

// ---------------------------------------------------------------------------
// AC4: Route file exports — only default export
// ---------------------------------------------------------------------------

describe("DocsIndexPage (app/docs/page.tsx) — export constraints (AC4)", () => {
  it("exports a default function (DocsIndexPage)", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).toContain("export default function DocsIndexPage");
  });

  it("does not export non-allowlisted App Router named exports", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    // The App Router allowlist for page.tsx is only: default, metadata, generateMetadata,
    // generateStaticParams, revalidate, dynamic, dynamicParams, fetchCache, runtime, preferredRegion
    // This is a client component, so none of the above should be present either.
    expect(source).not.toContain("export const metadata");
    expect(source).not.toContain("export async function generateMetadata");
    expect(source).not.toContain("export const revalidate");
    expect(source).not.toContain("export const dynamic");
    expect(source).not.toContain("export const generateStaticParams");
  });

  it("does not use dangerouslySetInnerHTML (no raw HTML output in the index)", async () => {
    const source = await readAppFile("app/docs/page.tsx");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
