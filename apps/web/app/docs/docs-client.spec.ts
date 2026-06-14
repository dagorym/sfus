/**
 * Unit tests for the docs API client helpers (docs-client.ts).
 *
 * Uses the source-audit pattern consistent with the rest of the web test suite.
 *
 * Acceptance criteria covered:
 *  AC1 - Error envelope extraction: payload?.error?.message || payload?.message || fallback
 *  AC1 (new) - getDocPageByPath uses literal '/' separators for multi-segment paths
 *  AC2 - Single-segment root-level paths continue to work
 *  AC3 - Reserved characters within a path segment are percent-encoded
 *  AC4 - lint/build pass; no non-allowlisted exports
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("uses per-segment encodeURIComponent (split/map/join) for path encoding", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageByPath");
    // The fix: path.split("/").map(encodeURIComponent).join("/")
    // Must use split + map(encodeURIComponent) + join, NOT a bare encodeURIComponent(path)
    expect(block).toContain('split("/")');
    expect(block).toContain("map(encodeURIComponent)");
    expect(block).toContain('join("/")');
  });

  it("uses no-store cache policy (always fresh data)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocPageByPath");
    expect(block).toContain('cache: "no-store"');
  });
});

// ---------------------------------------------------------------------------
// AC1/AC2/AC3: getDocPageByPath — behavioral URL-encoding tests (mock-fetch)
//
// These tests mock globalThis.fetch and assert on the actual URL passed to it.
// They replace the prior source-text-only "encodeURIComponent" assertion that
// allowed the %2F-encoding bug to pass undetected.
// ---------------------------------------------------------------------------

describe("docs-client.ts — getDocPageByPath URL encoding (AC1/AC2/AC3)", () => {
  let capturedUrl: string | undefined;

  // Minimal page response shape to satisfy the happy path
  const mockPage = {
    page: {
      id: "1", title: "Test", path: "test", depth: 0,
      parentId: null, visibility: "public", breadcrumbs: [],
      currentRevision: null,
      lock: { isLocked: false, lockedByUserId: null, lockedAt: null, lockExpiresAt: null },
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    },
  };

  beforeEach(() => {
    capturedUrl = undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      capturedUrl = url;
      return {
        status: 200,
        ok: true,
        json: async () => mockPage,
      };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC1: multi-segment path uses literal '/' separators (not %2F)", async () => {
    // Import dynamically after stub is in place so Node's module cache does not matter —
    // the function itself calls globalThis.fetch at runtime, which is already stubbed.
    const { getDocPageByPath } = await import("./docs-client");
    await getDocPageByPath("getting-started/installation");
    expect(capturedUrl).toBeDefined();
    // Literal slash must be present between segments
    expect(capturedUrl).toContain("getting-started/installation");
    // The %2F encoding (wrong) must NOT appear
    expect(capturedUrl).not.toContain("%2F");
  });

  it("AC2: single-segment root-level path is fetched without modification", async () => {
    const { getDocPageByPath } = await import("./docs-client");
    await getDocPageByPath("introduction");
    expect(capturedUrl).toBeDefined();
    expect(capturedUrl).toContain("/docs/introduction");
    expect(capturedUrl).not.toContain("%2F");
  });

  it("AC3: reserved characters within a single segment are percent-encoded", async () => {
    const { getDocPageByPath } = await import("./docs-client");
    await getDocPageByPath("my page?v=1");
    expect(capturedUrl).toBeDefined();
    // Space and '?' inside the segment must be encoded
    expect(capturedUrl).toContain("my%20page%3Fv%3D1");
    // No literal space or '?' in the segment
    expect(capturedUrl).not.toMatch(/\/my page/);
  });

  it("AC3: reserved characters within a segment of a nested path are encoded, slashes preserved", async () => {
    const { getDocPageByPath } = await import("./docs-client");
    await getDocPageByPath("section one/sub page?v=2");
    expect(capturedUrl).toBeDefined();
    // Segments encoded individually; the '/' between them is a literal slash
    expect(capturedUrl).toContain("section%20one/sub%20page%3Fv%3D2");
    expect(capturedUrl).not.toContain("%2F");
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

// ---------------------------------------------------------------------------
// ST-8 Write helpers — createDocPage, addDocRevision, renameDocPage (AC1)
// ---------------------------------------------------------------------------

describe("docs-client.ts — createDocPage write helper (ST-8/AC1)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function createDocPage");
  });

  it("sends a POST request to /api/docs", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "createDocPage");
    expect(block).toContain('method: "POST"');
    expect(block).toContain("`${apiBase}/docs`");
  });

  it("includes credentials and content-type header (session-authenticated route)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "createDocPage");
    expect(block).toContain('credentials: "include"');
    expect(block).toContain('"content-type": "application/json"');
  });

  it("serializes the input as JSON in the request body", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "createDocPage");
    expect(block).toContain("JSON.stringify(input)");
  });

  it("returns the page from the response envelope (data.page)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "createDocPage");
    expect(block).toContain("data.page");
  });

  it("throws on any error response using extractErrorMessage", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "createDocPage");
    expect(block).toContain("throw new Error");
    expect(block).toContain("extractErrorMessage");
  });
});

describe("docs-client.ts — addDocRevision write helper (ST-8/AC1)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function addDocRevision");
  });

  it("sends a POST request to /api/docs/:id/revisions", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "addDocRevision");
    expect(block).toContain('method: "POST"');
    expect(block).toContain("/revisions");
    expect(block).toContain("encodeURIComponent(pageId)");
  });

  it("includes credentials and content-type header", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "addDocRevision");
    expect(block).toContain('credentials: "include"');
    expect(block).toContain('"content-type": "application/json"');
  });

  it("returns the updated page from the response envelope (data.page)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "addDocRevision");
    expect(block).toContain("data.page");
  });

  it("throws a LockConflictError on 409 when error.details contains lockedByUserId", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "addDocRevision");
    expect(block).toContain("status === 409");
    expect(block).toContain("lockedByUserId");
    expect(block).toContain("lockConflict");
  });

  it("attaches lock conflict details to the thrown error object", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "addDocRevision");
    // The error is augmented with { lockConflict: details }
    expect(block).toContain("lockConflict: details");
  });
});

describe("docs-client.ts — renameDocPage write helper (ST-8/AC1)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function renameDocPage");
  });

  it("sends a PATCH request to /api/docs/:id", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "renameDocPage");
    expect(block).toContain('method: "PATCH"');
    expect(block).toContain("encodeURIComponent(pageId)");
  });

  it("includes credentials and content-type header", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "renameDocPage");
    expect(block).toContain('credentials: "include"');
    expect(block).toContain('"content-type": "application/json"');
  });

  it("returns the renamed page from the response envelope (data.page)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "renameDocPage");
    expect(block).toContain("data.page");
  });

  it("throws on any error response using extractErrorMessage", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "renameDocPage");
    expect(block).toContain("throw new Error");
    expect(block).toContain("extractErrorMessage");
  });
});

// ---------------------------------------------------------------------------
// ST-8 Lock helpers — acquireDocLock, releaseDocLock (AC2)
// ---------------------------------------------------------------------------

describe("docs-client.ts — acquireDocLock write helper (ST-8/AC2)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function acquireDocLock");
  });

  it("sends a POST request to /api/docs/:id/lock", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "acquireDocLock");
    expect(block).toContain('method: "POST"');
    expect(block).toContain("/lock");
    expect(block).toContain("encodeURIComponent(pageId)");
  });

  it("includes credentials header (authenticated route)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "acquireDocLock");
    expect(block).toContain('credentials: "include"');
  });

  it("returns the updated lock state from the response envelope (data.lock)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "acquireDocLock");
    expect(block).toContain("data.lock");
  });

  it("throws a LockConflictError on 409 with holder details from error.details", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "acquireDocLock");
    expect(block).toContain("status === 409");
    expect(block).toContain("lockedByUserId");
    // error object augmented with .lockConflict
    expect(block).toContain("lockConflict");
  });

  it("throws a plain Error for non-409 failures", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "acquireDocLock");
    expect(block).toContain("throw new Error");
    expect(block).toContain("extractErrorMessage");
  });
});

describe("docs-client.ts — releaseDocLock write helper (ST-8/AC2)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function releaseDocLock");
  });

  it("sends a DELETE request to /api/docs/:id/lock", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "releaseDocLock");
    expect(block).toContain('method: "DELETE"');
    expect(block).toContain("/lock");
    expect(block).toContain("encodeURIComponent(pageId)");
  });

  it("includes credentials header", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "releaseDocLock");
    expect(block).toContain('credentials: "include"');
  });

  it("throws on any error response using extractErrorMessage", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "releaseDocLock");
    expect(block).toContain("throw new Error");
    expect(block).toContain("extractErrorMessage");
  });
});

// ---------------------------------------------------------------------------
// ST-8 LockConflictError type helpers (AC2)
// ---------------------------------------------------------------------------

describe("docs-client.ts — LockConflictError helpers (ST-8/AC2)", () => {
  it("exports the LockConflictDetails interface with lockedByUserId and lockExpiresAt", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface LockConflictDetails");
    expect(source).toContain("lockedByUserId: string");
    expect(source).toContain("lockExpiresAt: string | null");
  });

  it("exports LockConflictError type as Error & { lockConflict: LockConflictDetails }", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export type LockConflictError");
    expect(source).toContain("lockConflict: LockConflictDetails");
  });

  it("exports isLockConflictError type guard that checks lockConflict property", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export function isLockConflictError");
    expect(source).toContain('"lockConflict" in err');
  });

  it("isLockConflictError returns false for plain Errors without lockConflict", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = source.slice(
      source.indexOf("export function isLockConflictError"),
      source.indexOf("\n\n/**\n * Acquires")
    );
    expect(block).toContain("err instanceof Error");
    expect(block).toContain('"lockConflict" in err');
  });

  // Behavioral test: isLockConflictError at runtime
  it("isLockConflictError returns true for an error with lockConflict attached", async () => {
    const { isLockConflictError } = await import("./docs-client");
    const err = Object.assign(new Error("locked"), {
      lockConflict: { lockedByUserId: "user-123", lockExpiresAt: null }
    });
    expect(isLockConflictError(err)).toBe(true);
  });

  it("isLockConflictError returns false for a plain Error", async () => {
    const { isLockConflictError } = await import("./docs-client");
    expect(isLockConflictError(new Error("plain error"))).toBe(false);
  });

  it("isLockConflictError returns false for non-Error values", async () => {
    const { isLockConflictError } = await import("./docs-client");
    expect(isLockConflictError("string")).toBe(false);
    expect(isLockConflictError(null)).toBe(false);
    expect(isLockConflictError(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ST-8 Write helpers: multi-segment path encoding for pageId routes (AC1)
// ---------------------------------------------------------------------------

describe("docs-client.ts — write helpers use encodeURIComponent on pageId (ST-8/AC1)", () => {
  const writeHelpers = [
    "addDocRevision",
    "renameDocPage",
    "acquireDocLock",
    "releaseDocLock",
  ];

  it.each(writeHelpers)(
    "%s encodes pageId with encodeURIComponent before constructing the URL",
    async (fnName) => {
      const source = await readAppFile("app/docs/docs-client.ts");
      const block = extractFn(source, fnName);
      expect(block).toContain("encodeURIComponent(pageId)");
    }
  );
});

// ---------------------------------------------------------------------------
// AC1 (e): DocWriteResultShape — required fields and excluded fields
// ---------------------------------------------------------------------------

describe("docs-client.ts — DocWriteResultShape interface (AC1/e)", () => {
  it("exports DocWriteResultShape as an interface", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocWriteResultShape");
  });

  it("includes id field (string)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).toContain("id: string");
  });

  it("includes title field (string)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).toContain("title: string");
  });

  it("includes path field (string)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).toContain("path: string");
  });

  it("includes depth field", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).toContain("depth:");
  });

  it("includes parentId field (nullable)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).toContain("parentId:");
  });

  it("includes currentRevisionId field", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).toContain("currentRevisionId:");
  });

  it("includes revisionNumber field", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).toContain("revisionNumber:");
  });

  it("includes createdAt and updatedAt fields (string dates)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).toContain("createdAt: string");
    expect(ifaceBlock).toContain("updatedAt: string");
  });

  it("does NOT include lock field (full-page-only field)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    // The write result shape deliberately omits lock
    expect(ifaceBlock).not.toContain("lock:");
  });

  it("does NOT include currentRevision field (full-page-only field)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).not.toContain("currentRevision:");
  });

  it("does NOT include breadcrumbs field (full-page-only field)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).not.toContain("breadcrumbs:");
  });

  it("does NOT include visibility field (full-page-only field)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const ifaceBlock = source.slice(
      source.indexOf("export interface DocWriteResultShape"),
      source.indexOf("/** Full page response shape")
    );
    expect(ifaceBlock).not.toContain("visibility:");
  });
});

// ---------------------------------------------------------------------------
// AC2 (f): Write helpers typed to return DocWriteResultShape
// ---------------------------------------------------------------------------

describe("docs-client.ts — write helpers return DocWriteResultShape (AC2/f)", () => {
  const writeHelperReturnTypes = [
    "addDocRevision",
    "renameDocPage",
    "rollbackDocPage",
    "createDocPage",
  ];

  it.each(writeHelperReturnTypes)(
    "%s declares return type Promise<DocWriteResultShape>",
    async (fnName) => {
      const source = await readAppFile("app/docs/docs-client.ts");
      const block = extractFn(source, fnName);
      expect(block).toContain("Promise<DocWriteResultShape>");
    }
  );

  it("addDocRevision returns data.page typed as DocWriteResultShape (not DocsPageShape)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "addDocRevision");
    // The result envelope uses DocWriteResultShape, not DocsPageShape
    expect(block).toContain("DocWriteResultShape");
    expect(block).toContain("data.page");
  });

  it("rollbackDocPage is exported as an async function returning DocWriteResultShape", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function rollbackDocPage");
    const block = extractFn(source, "rollbackDocPage");
    expect(block).toContain("Promise<DocWriteResultShape>");
  });
});
