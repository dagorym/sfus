/**
 * Unit tests for the history/diff/rollback helpers in docs-client.ts (ST-9).
 *
 * Uses the source-audit pattern (reading source files, mock-fetch for behavioral
 * tests) consistent with docs-client.spec.ts.
 *
 * Acceptance criteria covered:
 *  AC1 - getDocHistory fetches revision metadata; returns null on 404.
 *  AC2 - getDocDiff fetches diff; 400 surfaces friendly size-cap message;
 *         returns null on 404.
 *  AC3 - rollbackDocPage sends POST with revisionNumber; requires credentials.
 *  AC4 - lint/build pass; all helpers present and correctly named.
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
// AC1: getDocHistory — fetch revision history metadata
// ---------------------------------------------------------------------------

describe("docs-client.ts — getDocHistory (AC1)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function getDocHistory");
  });

  it("fetches from /api/docs/:id/history endpoint", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocHistory");
    expect(block).toContain("/history");
    expect(block).toContain("encodeURIComponent(pageId)");
    expect(block).toContain("apiBase");
  });

  it("returns null on 404 (page not found / not readable)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocHistory");
    expect(block).toContain("status === 404");
    expect(block).toContain("return null");
  });

  it("throws on unexpected errors using extractErrorMessage", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocHistory");
    expect(block).toContain("throw new Error");
    expect(block).toContain("extractErrorMessage");
  });

  it("returns revisions array from the response envelope (data.revisions)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocHistory");
    expect(block).toContain("data.revisions");
  });

  it("uses no-store cache policy (always fresh history)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocHistory");
    expect(block).toContain('cache: "no-store"');
  });

  it("exports DocsRevisionMetaShape interface with revisionNumber, author, editorUsername, summary, createdAt", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocsRevisionMetaShape");
    expect(source).toContain("revisionNumber:");
    expect(source).toContain("author:");
    expect(source).toContain("editorUsername:");
    expect(source).toContain("summary:");
    expect(source).toContain("createdAt:");
  });
});

// ---------------------------------------------------------------------------
// AC1: getDocHistory — behavioral (mock-fetch)
// ---------------------------------------------------------------------------

describe("docs-client.ts — getDocHistory behavioral (AC1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when the API responds with 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 404,
      ok: false,
      json: async () => ({ error: { message: "Not found" } }),
    })));
    const { getDocHistory } = await import("./docs-client");
    const result = await getDocHistory("page-uuid");
    expect(result).toBeNull();
  });

  it("returns the revisions array on success", async () => {
    const revisions = [
      { revisionNumber: 1, author: { username: "alice", displayName: "Alice" }, editorUsername: null, summary: "Initial", createdAt: "2026-01-01T00:00:00Z" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ revisions }),
    })));
    const { getDocHistory } = await import("./docs-client");
    const result = await getDocHistory("page-uuid");
    expect(result).toEqual(revisions);
  });

  it("throws on unexpected error responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 500,
      ok: false,
      json: async () => ({ error: { message: "Internal error" } }),
    })));
    const { getDocHistory } = await import("./docs-client");
    await expect(getDocHistory("page-uuid")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC1: getDocRevision — fetch single revision body
// ---------------------------------------------------------------------------

describe("docs-client.ts — getDocRevision (AC1)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function getDocRevision");
  });

  it("fetches from /api/docs/:id/revisions/:revisionNumber", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocRevision");
    expect(block).toContain("/revisions/");
    expect(block).toContain("encodeURIComponent(pageId)");
    expect(block).toContain("encodeURIComponent(String(revisionNumber))");
  });

  it("returns null on 404", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocRevision");
    expect(block).toContain("status === 404");
    expect(block).toContain("return null");
  });

  it("returns revision body from the response envelope (data.revision)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocRevision");
    expect(block).toContain("data.revision");
  });

  it("throws on unexpected errors using extractErrorMessage", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocRevision");
    expect(block).toContain("throw new Error");
    expect(block).toContain("extractErrorMessage");
  });

  it("exports DocsSingleRevisionShape with revisionNumber, title, body, summary, author, editorUsername, createdAt", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocsSingleRevisionShape");
    expect(source).toContain("revisionNumber:");
    expect(source).toContain("title:");
    expect(source).toContain("body:");
    expect(source).toContain("summary:");
    expect(source).toContain("author:");
    expect(source).toContain("editorUsername:");
    expect(source).toContain("createdAt:");
  });
});

// ---------------------------------------------------------------------------
// AC2: getDocDiff — fetch side-by-side diff, 400 size-cap, 404 null
// ---------------------------------------------------------------------------

describe("docs-client.ts — getDocDiff (AC2)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function getDocDiff");
  });

  it("fetches from /api/docs/:id/diff?from=&to=", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocDiff");
    expect(block).toContain("/diff?");
    expect(block).toContain("from=");
    expect(block).toContain("to=");
    expect(block).toContain("encodeURIComponent(pageId)");
  });

  it("returns null on 404 (page not found / not readable)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocDiff");
    expect(block).toContain("status === 404");
    expect(block).toContain("return null");
  });

  it("throws a friendly error message on 400 (size cap exceeded)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocDiff");
    expect(block).toContain("status === 400");
    expect(block).toContain("throw new Error");
    // Must surface a recognizable friendly message for the size-cap case
    expect(block).toContain("too large to compare");
  });

  it("throws on unexpected errors using extractErrorMessage", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "getDocDiff");
    expect(block).toContain("throw new Error");
    expect(block).toContain("extractErrorMessage");
  });

  it("exports DocsDiffShape with fromRevisionNumber, toRevisionNumber, and hunks", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocsDiffShape");
    expect(source).toContain("fromRevisionNumber:");
    expect(source).toContain("toRevisionNumber:");
    expect(source).toContain("hunks:");
  });

  it("exports DocsDiffHunk with type ('unchanged'|'added'|'removed') and lines", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export interface DocsDiffHunk");
    expect(source).toContain('"unchanged"');
    expect(source).toContain('"added"');
    expect(source).toContain('"removed"');
    expect(source).toContain("lines: string[]");
  });
});

// ---------------------------------------------------------------------------
// AC2: getDocDiff — behavioral (mock-fetch)
// ---------------------------------------------------------------------------

describe("docs-client.ts — getDocDiff behavioral (AC2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when the API responds with 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 404,
      ok: false,
      json: async () => ({ error: { message: "Not found" } }),
    })));
    const { getDocDiff } = await import("./docs-client");
    const result = await getDocDiff("page-uuid", 1, 2);
    expect(result).toBeNull();
  });

  it("throws a 'too large to compare' error on 400 (size cap)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 400,
      ok: false,
      json: async () => ({ error: { message: "Diff size exceeds limit." } }),
    })));
    const { getDocDiff } = await import("./docs-client");
    await expect(getDocDiff("page-uuid", 1, 2)).rejects.toThrow(/too large to compare/i);
  });

  it("400 with no API message still surfaces the friendly fallback message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 400,
      ok: false,
      json: async () => null,
    })));
    const { getDocDiff } = await import("./docs-client");
    await expect(getDocDiff("page-uuid", 1, 2)).rejects.toThrow(/too large to compare/i);
  });

  it("returns the diff shape on success", async () => {
    const diffResult = {
      fromRevisionNumber: 1,
      toRevisionNumber: 2,
      hunks: [{ type: "added", lines: ["new line"] }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => diffResult,
    })));
    const { getDocDiff } = await import("./docs-client");
    const result = await getDocDiff("page-uuid", 1, 2);
    expect(result).toEqual(diffResult);
  });
});

// ---------------------------------------------------------------------------
// AC3: rollbackDocPage — POST with credentials and revisionNumber
// ---------------------------------------------------------------------------

describe("docs-client.ts — rollbackDocPage (AC3)", () => {
  it("is exported as an async function", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    expect(source).toContain("export async function rollbackDocPage");
  });

  it("sends a POST request to /api/docs/:id/rollback", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "rollbackDocPage");
    expect(block).toContain('method: "POST"');
    expect(block).toContain("/rollback");
    expect(block).toContain("encodeURIComponent(pageId)");
  });

  it("includes credentials header (moderator/admin session required)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "rollbackDocPage");
    expect(block).toContain('credentials: "include"');
  });

  it("sends revisionNumber in the JSON request body", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "rollbackDocPage");
    expect(block).toContain("JSON.stringify");
    expect(block).toContain("revisionNumber");
  });

  it("returns the updated page from the response envelope (data.page)", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "rollbackDocPage");
    expect(block).toContain("data.page");
  });

  it("throws on any error response using extractErrorMessage", async () => {
    const source = await readAppFile("app/docs/docs-client.ts");
    const block = extractFn(source, "rollbackDocPage");
    expect(block).toContain("throw new Error");
    expect(block).toContain("extractErrorMessage");
  });
});

// ---------------------------------------------------------------------------
// AC3: rollbackDocPage — behavioral (mock-fetch)
// ---------------------------------------------------------------------------

describe("docs-client.ts — rollbackDocPage behavioral (AC3)", () => {
  let capturedRequest: { url: string; options?: RequestInit } | undefined;

  const mockPage = {
    id: "page-uuid", title: "My Doc", path: "my-doc", depth: 0,
    parentId: null, visibility: "public", breadcrumbs: [],
    currentRevision: null,
    lock: { isLocked: false, lockedByUserId: null, lockedAt: null, lockExpiresAt: null },
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    capturedRequest = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the rollback endpoint with the revision number in the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      capturedRequest = { url, options };
      return {
        status: 200,
        ok: true,
        json: async () => ({ page: mockPage }),
      };
    }));
    const { rollbackDocPage } = await import("./docs-client");
    await rollbackDocPage("page-uuid", 3);

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.url).toContain("/docs/page-uuid/rollback");
    expect(capturedRequest?.options?.method).toBe("POST");
    const body = JSON.parse(capturedRequest?.options?.body as string);
    expect(body.revisionNumber).toBe(3);
  });

  it("returns the updated page on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ page: mockPage }),
    })));
    const { rollbackDocPage } = await import("./docs-client");
    const result = await rollbackDocPage("page-uuid", 3);
    expect(result).toEqual(mockPage);
  });

  it("throws when the server returns 403 (not staff)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      status: 403,
      ok: false,
      json: async () => ({ error: { message: "Forbidden" } }),
    })));
    const { rollbackDocPage } = await import("./docs-client");
    await expect(rollbackDocPage("page-uuid", 3)).rejects.toThrow(/Forbidden/);
  });
});
