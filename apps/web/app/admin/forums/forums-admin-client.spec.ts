/**
 * Source-contract tests for the admin forums API client.
 *
 * Uses the established source-audit pattern (reading source files and asserting
 * on their content), consistent with blog.spec.ts and forums.spec.ts in this
 * workspace.
 *
 * Acceptance criteria covered:
 *  AC1 - All 6 admin category endpoints are exported with correct method/URL/body mapping
 *  AC2 - All 6 admin board endpoints are exported with correct method/URL/body mapping
 *  AC3 - All functions include credentials:include (admin session required)
 *  AC4 - Response envelopes are parsed ({ category } / { categories } / { board } / { boards })
 *  AC5 - Error envelope convention: payload?.error?.message || payload?.message || <fallback>
 *  AC6 - Types include scopeType and visibility vocabularies
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "../../../");

async function readAppFile(relativePath: string): Promise<string> {
  return readFile(path.join(appRoot, relativePath), "utf8");
}

/**
 * Helper: extract a function body from forums-admin-client.ts source by bounding
 * it between the named export and the next export keyword.
 */
function extractFn(source: string, fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}`);
  if (start === -1) throw new Error(`Function ${fnName} not found in source`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

// ---------------------------------------------------------------------------
// AC1: Admin category endpoints
// ---------------------------------------------------------------------------

describe("forums-admin-client.ts — admin category endpoints (AC1)", () => {
  it("exports adminListCategories targeting GET /forums/admin/categories with credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminListCategories");
    const block = extractFn(source, "adminListCategories");
    expect(block).toContain("/forums/admin/categories");
    expect(block).not.toContain("method:");
    expect(block).toContain('credentials: "include"');
  });

  it("exports adminGetCategory targeting GET /forums/admin/categories/:id with credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminGetCategory");
    const block = extractFn(source, "adminGetCategory");
    expect(block).toContain("/forums/admin/categories/");
    expect(block).toContain("encodeURIComponent(id)");
    expect(block).toContain('credentials: "include"');
  });

  it("exports adminCreateCategory targeting POST /forums/admin/categories with body and credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminCreateCategory");
    const block = extractFn(source, "adminCreateCategory");
    expect(block).toContain("/forums/admin/categories");
    expect(block).toContain('"POST"');
    expect(block).toContain('credentials: "include"');
    expect(block).toContain("JSON.stringify(input)");
    expect(block).toContain('"content-type": "application/json"');
  });

  it("exports adminUpdateCategory targeting PATCH /forums/admin/categories/:id with body and credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminUpdateCategory");
    const block = extractFn(source, "adminUpdateCategory");
    expect(block).toContain("/forums/admin/categories/");
    expect(block).toContain("encodeURIComponent(id)");
    expect(block).toContain('"PATCH"');
    expect(block).toContain('credentials: "include"');
    expect(block).toContain("JSON.stringify(input)");
  });

  it("exports adminDeleteCategory targeting DELETE /forums/admin/categories/:id with credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminDeleteCategory");
    const block = extractFn(source, "adminDeleteCategory");
    expect(block).toContain("/forums/admin/categories/");
    expect(block).toContain("encodeURIComponent(id)");
    expect(block).toContain('"DELETE"');
    expect(block).toContain('credentials: "include"');
  });

  it("exports adminReorderCategories targeting PUT /forums/admin/categories/reorder with body and credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminReorderCategories");
    const block = extractFn(source, "adminReorderCategories");
    expect(block).toContain("/forums/admin/categories/reorder");
    expect(block).toContain('"PUT"');
    expect(block).toContain('credentials: "include"');
    expect(block).toContain("JSON.stringify(input)");
  });
});

// ---------------------------------------------------------------------------
// AC2: Admin board endpoints
// ---------------------------------------------------------------------------

describe("forums-admin-client.ts — admin board endpoints (AC2)", () => {
  it("exports adminListBoards targeting GET /forums/admin/categories/:categoryId/boards with credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminListBoards");
    const block = extractFn(source, "adminListBoards");
    expect(block).toContain("/forums/admin/categories/");
    expect(block).toContain("encodeURIComponent(categoryId)");
    expect(block).toContain("/boards");
    expect(block).toContain('credentials: "include"');
  });

  it("exports adminGetBoard targeting GET /forums/admin/boards/:id with credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminGetBoard");
    const block = extractFn(source, "adminGetBoard");
    expect(block).toContain("/forums/admin/boards/");
    expect(block).toContain("encodeURIComponent(id)");
    expect(block).toContain('credentials: "include"');
  });

  it("exports adminCreateBoard targeting POST /forums/admin/boards with body and credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminCreateBoard");
    const block = extractFn(source, "adminCreateBoard");
    expect(block).toContain("/forums/admin/boards");
    expect(block).toContain('"POST"');
    expect(block).toContain('credentials: "include"');
    expect(block).toContain("JSON.stringify(input)");
    expect(block).toContain('"content-type": "application/json"');
  });

  it("exports adminUpdateBoard targeting PATCH /forums/admin/boards/:id with body and credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminUpdateBoard");
    const block = extractFn(source, "adminUpdateBoard");
    expect(block).toContain("/forums/admin/boards/");
    expect(block).toContain("encodeURIComponent(id)");
    expect(block).toContain('"PATCH"');
    expect(block).toContain('credentials: "include"');
    expect(block).toContain("JSON.stringify(input)");
  });

  it("exports adminDeleteBoard targeting DELETE /forums/admin/boards/:id with credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminDeleteBoard");
    const block = extractFn(source, "adminDeleteBoard");
    expect(block).toContain("/forums/admin/boards/");
    expect(block).toContain("encodeURIComponent(id)");
    expect(block).toContain('"DELETE"');
    expect(block).toContain('credentials: "include"');
  });

  it("exports adminReorderBoards targeting PUT /forums/admin/categories/:categoryId/boards/reorder with body and credentials", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export async function adminReorderBoards");
    const block = extractFn(source, "adminReorderBoards");
    expect(block).toContain("/forums/admin/categories/");
    expect(block).toContain("encodeURIComponent(categoryId)");
    expect(block).toContain("/boards/reorder");
    expect(block).toContain('"PUT"');
    expect(block).toContain('credentials: "include"');
    expect(block).toContain("JSON.stringify(input)");
  });
});

// ---------------------------------------------------------------------------
// AC3: credentials:include on every function
// ---------------------------------------------------------------------------

describe("forums-admin-client.ts — credentials:include on all admin functions (AC3)", () => {
  const allAdminFunctions = [
    "adminListCategories",
    "adminGetCategory",
    "adminCreateCategory",
    "adminUpdateCategory",
    "adminDeleteCategory",
    "adminReorderCategories",
    "adminListBoards",
    "adminGetBoard",
    "adminCreateBoard",
    "adminUpdateBoard",
    "adminDeleteBoard",
    "adminReorderBoards"
  ];

  it.each(allAdminFunctions)("%s includes credentials:include", async (fnName) => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, fnName);
    expect(block).toContain('credentials: "include"');
  });
});

// ---------------------------------------------------------------------------
// AC4: Response envelope parsing
// ---------------------------------------------------------------------------

describe("forums-admin-client.ts — response envelope parsing (AC4)", () => {
  it("adminListCategories parses { categories } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminListCategories");
    expect(block).toContain("{ categories:");
    expect(block).toContain("data.categories");
  });

  it("adminGetCategory parses { category } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminGetCategory");
    expect(block).toContain("{ category:");
    expect(block).toContain("data.category");
  });

  it("adminCreateCategory parses { category } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminCreateCategory");
    expect(block).toContain("{ category:");
    expect(block).toContain("data.category");
  });

  it("adminUpdateCategory parses { category } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminUpdateCategory");
    expect(block).toContain("{ category:");
    expect(block).toContain("data.category");
  });

  it("adminReorderCategories parses { categories } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminReorderCategories");
    expect(block).toContain("{ categories:");
    expect(block).toContain("data.categories");
  });

  it("adminListBoards parses { boards } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminListBoards");
    expect(block).toContain("{ boards:");
    expect(block).toContain("data.boards");
  });

  it("adminGetBoard parses { board } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminGetBoard");
    expect(block).toContain("{ board:");
    expect(block).toContain("data.board");
  });

  it("adminCreateBoard parses { board } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminCreateBoard");
    expect(block).toContain("{ board:");
    expect(block).toContain("data.board");
  });

  it("adminUpdateBoard parses { board } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminUpdateBoard");
    expect(block).toContain("{ board:");
    expect(block).toContain("data.board");
  });

  it("adminReorderBoards parses { boards } envelope", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const block = extractFn(source, "adminReorderBoards");
    expect(block).toContain("{ boards:");
    expect(block).toContain("data.boards");
  });
});

// ---------------------------------------------------------------------------
// AC5: Error envelope convention — all functions
// ---------------------------------------------------------------------------

describe("forums-admin-client.ts — error envelope chain on all functions (AC5)", () => {
  const errorFunctions = [
    "adminListCategories",
    "adminGetCategory",
    "adminCreateCategory",
    "adminUpdateCategory",
    "adminDeleteCategory",
    "adminReorderCategories",
    "adminListBoards",
    "adminGetBoard",
    "adminCreateBoard",
    "adminUpdateBoard",
    "adminDeleteBoard",
    "adminReorderBoards"
  ];

  it.each(errorFunctions)(
    "%s reads payload?.error?.message before payload?.message (envelope first)",
    async (fnName) => {
      const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
      const block = extractFn(source, fnName);
      expect(block).toContain("payload?.error?.message");
      expect(block).toContain("payload?.message");
    }
  );

  it.each(errorFunctions)(
    "%s uses the three-part || chain: error.message || message || <fallback>",
    async (fnName) => {
      const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
      const block = extractFn(source, fnName);
      const chain = block.match(/payload\?\.error\?\.message\s*\|\|\s*payload\?\.message\s*\|\|/s);
      expect(chain).not.toBeNull();
    }
  );

  it.each(errorFunctions)(
    "%s type annotation includes error?: { message?: string } (envelope type)",
    async (fnName) => {
      const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
      const block = extractFn(source, fnName);
      expect(block).toContain("error?:");
      expect(block).toContain("message?:");
    }
  );
});

// ---------------------------------------------------------------------------
// AC6: Type definitions and vocabulary
// ---------------------------------------------------------------------------

describe("forums-admin-client.ts — type definitions (AC6)", () => {
  it("exports ForumBoardScopeType with site and project values", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export type ForumBoardScopeType");
    expect(source).toContain('"site"');
    expect(source).toContain('"project"');
  });

  it("exports ForumBoardVisibility with all five vocabulary values", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export type ForumBoardVisibility");
    expect(source).toContain('"public"');
    expect(source).toContain('"unlisted"');
    expect(source).toContain('"members"');
    expect(source).toContain('"project-only"');
    expect(source).toContain('"private"');
  });

  it("AdminBoardShape includes scopeType, visibility, and projectId fields", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const interfaceStart = source.indexOf("export interface AdminBoardShape");
    expect(interfaceStart).toBeGreaterThan(-1);
    const interfaceEnd = source.indexOf("}", interfaceStart);
    const interfaceText = source.slice(interfaceStart, interfaceEnd + 1);
    expect(interfaceText).toContain("scopeType:");
    expect(interfaceText).toContain("visibility:");
    expect(interfaceText).toContain("projectId:");
    expect(interfaceText).toContain("categoryId:");
  });

  it("AdminCategoryShape includes boards[] relation", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const interfaceStart = source.indexOf("export interface AdminCategoryShape");
    expect(interfaceStart).toBeGreaterThan(-1);
    const interfaceEnd = source.indexOf("}", interfaceStart);
    const interfaceText = source.slice(interfaceStart, interfaceEnd + 1);
    expect(interfaceText).toContain("boards:");
    expect(interfaceText).toContain("AdminBoardShape[]");
  });

  it("CreateBoardInput includes scopeType and visibility optional fields", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    const interfaceStart = source.indexOf("export interface CreateBoardInput");
    expect(interfaceStart).toBeGreaterThan(-1);
    const interfaceEnd = source.indexOf("}", interfaceStart);
    const interfaceText = source.slice(interfaceStart, interfaceEnd + 1);
    expect(interfaceText).toContain("scopeType?:");
    expect(interfaceText).toContain("visibility?:");
    expect(interfaceText).toContain("categoryId:");
    expect(interfaceText).toContain("projectId?:");
  });

  it("uses NEXT_PUBLIC_API_BASE_PATH for all requests (consistent routing)", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain('process.env.NEXT_PUBLIC_API_BASE_PATH || "/api"');
    expect(source).toContain("`${apiBase}/forums/admin/");
  });

  it("ReorderCategoriesInput includes orderedIds field", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export interface ReorderCategoriesInput");
    expect(source).toContain("orderedIds:");
  });

  it("ReorderBoardsInput includes orderedIds field", async () => {
    const source = await readAppFile("app/admin/forums/forums-admin-client.ts");
    expect(source).toContain("export interface ReorderBoardsInput");
    expect(source).toContain("orderedIds:");
  });
});
