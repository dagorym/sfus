/**
 * Unit tests for the docs API client helpers (docs-client.ts).
 *
 * Uses the source-audit pattern consistent with the rest of the web test suite.
 *
 * Acceptance criteria covered:
 *  AC1 - Error envelope extraction: payload?.error?.message || payload?.message || fallback
 *  AC4 - lint/build pass; no non-allowlisted exports
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

/** Extract a function body from source, bounded by the next export keyword. */
function extractFn(source: string, fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}`);
  if (start === -1) throw new Error(`Function ${fnName} not found in source`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

// ---------------------------------------------------------------------------
// AC1: Error envelope extraction — three-part chain in all client functions
// ---------------------------------------------------------------------------

describe("docs-client.ts — error envelope extraction (AC1)", () => {
  const functionsWithErrors = [
    "getDocPageTree",
    "getDocPageByPath",
    "getRecentDocEdits",
  ];

  it.each(functionsWithErrors)(
    "%s delegates error extraction to the shared extractErrorMessage helper",
    async (fnName) => {
      const source = await readAppFile("app/docs/docs-client.ts");
      const block = extractFn(source, fnName);
      // Functions use the shared helper rather than inlining the chain
      expect(block).toContain("extractErrorMessage");
    }
  );

  it.each(functionsWithErrors)(
    "%s calls extractErrorMessage with the payload and a non-empty fallback string",
    async (fnName) => {
      const source = await readAppFile("app/docs/docs-client.ts");
      const block = extractFn(source, fnName);
      // Each function passes a domain-specific fallback message
      expect(block).toContain("extractErrorMessage(payload,");
    }
  );

  it("extractErrorMessage helper reads payload.error?.message before payload.message (envelope first)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    // Helper is defined before the exported functions — slice to it
    const helperBlock = source.slice(
      source.indexOf("function extractErrorMessage"),
      source.indexOf("\nexport async function")
    );
    // The three-part chain: payload.error?.message || payload.message || fallback
    expect(helperBlock).toContain("payload.error?.message");
    expect(helperBlock).toContain("payload.message");
    // Falls back to a caller-supplied fallback string
    expect(helperBlock).toContain("fallback");
  });

  it("extractErrorMessage helper uses the three-part || chain in order", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const helperBlock = source.slice(
      source.indexOf("function extractErrorMessage"),
      source.indexOf("\nexport async function")
    );
    // The chain must appear in the correct order: error.message first, then message, then fallback
    const chain = helperBlock.match(/payload\.error\?\.message\s*\|\|\s*payload\.message\s*\|\|\s*fallback/s);
    expect(chain).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Exported function shapes and return-type contracts
// ---------------------------------------------------------------------------

describe("docs-client.ts — getDocPageTree (AC1)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function getDocPageTree");
  });

  it("returns null on 404 (parentPath not found)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageTree");
    expect(block).toContain("status === 404");
    expect(block).toContain("return null");
  });

  it("throws on unexpected errors", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageTree");
    expect(block).toContain("throw new Error");
  });

  it("returns the pages array from the response shape", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageTree");
    expect(block).toContain("data.pages");
  });

  it("fetches from /api/docs endpoint", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageTree");
    expect(block).toContain("/docs");
    expect(block).toContain("apiBase");
  });

  it("uses no-store cache policy (always fresh data)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageTree");
    expect(block).toContain('cache: "no-store"');
  });
});

describe("docs-client.ts — getDocPageByPath (AC1)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function getDocPageByPath");
  });

  it("returns null on 404 (page not found or not publicly accessible)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageByPath");
    expect(block).toContain("status === 404");
    expect(block).toContain("return null");
  });

  it("throws on unexpected errors", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageByPath");
    expect(block).toContain("throw new Error");
  });

  it("returns the page from the response shape", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageByPath");
    expect(block).toContain("data.page");
  });

  it("URL-encodes the path when fetching", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageByPath");
    expect(block).toContain("encodeURIComponent");
  });

  it("uses no-store cache policy (always fresh data)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageByPath");
    expect(block).toContain('cache: "no-store"');
  });
});

describe("docs-client.ts — getRecentDocEdits (AC1)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function getRecentDocEdits");
  });

  it("never returns null (returns empty array when no edits)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getRecentDocEdits");
    // No null return path — throws on error, returns array on success
    expect(block).not.toContain("return null");
  });

  it("throws on unexpected errors", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getRecentDocEdits");
    expect(block).toContain("throw new Error");
  });

  it("returns the docs array from the response shape", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getRecentDocEdits");
    expect(block).toContain("data.docs");
  });

  it("fetches from /api/docs/recent endpoint", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getRecentDocEdits");
    expect(block).toContain("/docs/recent");
  });

  it("accepts an optional limit parameter that is appended to the query string", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getRecentDocEdits");
    expect(block).toContain("limit");
    expect(block).toContain("limit=");
  });
});

// ---------------------------------------------------------------------------
// AC1: Type shape contracts for exported interfaces
// ---------------------------------------------------------------------------

describe("docs-client.ts — exported type shapes (AC1)", () => {
  it("exports DocsTreeItem with hasChildren field", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocsTreeItem");
    expect(source).toContain("hasChildren: boolean");
  });

  it("exports DocsPageShape with breadcrumbs and lock fields", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocsPageShape");
    expect(source).toContain("breadcrumbs:");
    expect(source).toContain("lock:");
  });

  it("exports DocsLockState with isLocked, lockedAt, and lockExpiresAt", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocsLockState");
    expect(source).toContain("isLocked: boolean");
    expect(source).toContain("lockedAt: string | null");
    expect(source).toContain("lockExpiresAt: string | null");
  });

  it("exports DocsRecentEditShape with pageId, title, path, editor, and editedAt", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocsRecentEditShape");
    expect(source).toContain("pageId:");
    expect(source).toContain("title:");
    expect(source).toContain("path:");
    expect(source).toContain("editor:");
    expect(source).toContain("editedAt:");
  });

  it("exports DocsBreadcrumbItem with id, title, and path", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocsBreadcrumbItem");
    expect(source).toContain("id: string");
    expect(source).toContain("title: string");
    expect(source).toContain("path: string");
  });
});

// ---------------------------------------------------------------------------
// AC4: Module-level contracts
// ---------------------------------------------------------------------------

describe("docs-client.ts — module-level contracts (AC4)", () => {
  it("uses NEXT_PUBLIC_API_BASE_PATH for all requests", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain('process.env.NEXT_PUBLIC_API_BASE_PATH || "/api"');
    expect(source).toContain("`${apiBase}/docs");
  });

  it("public read routes do not require credentials (no credentials:include)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    // getDocPageTree and getDocPageByPath are public — no session required
    const treeBlock = extractFn(source, "getDocPageTree");
    const pathBlock = extractFn(source, "getDocPageByPath");
    expect(treeBlock).not.toContain('credentials: "include"');
    expect(pathBlock).not.toContain('credentials: "include"');
  });
});
