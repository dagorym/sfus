/**
 * Source-contract tests for the admin forums management page.
 *
 * Uses the established source-audit pattern (reading source files and
 * asserting on their content), consistent with forums-admin-client.spec.ts
 * and public-shell.spec.ts in this workspace.
 *
 * Acceptance criteria covered:
 *  AC1 - /admin/forums is gated: uses resolveProtectedSession + hasGlobalRole("admin")
 *  AC2 - Lists all categories with boards via adminListCategories
 *  AC3 - Category CRUD: create/edit/delete/reorder; no-boards delete as friendly message
 *  AC4 - Board CRUD: create/edit/delete/reorder with full field set (scopeType, visibility)
 *  AC5 - No dangerouslySetInnerHTML; user text as React nodes; no direct encodeURIComponent
 *  AC6 - Errors surfaced via standard envelope as friendly messages
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

// ---------------------------------------------------------------------------
// AC1: Auth gate — resolveProtectedSession + hasGlobalRole("admin")
// ---------------------------------------------------------------------------

describe('forums-admin page (AC1) — auth gate', () => {
  it('imports and calls resolveProtectedSession with "/admin/forums"', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('resolveProtectedSession, hasGlobalRole');
    expect(source).toContain('from "../../auth-client"');
    expect(source).toContain('resolveProtectedSession("/admin/forums")');
  });

  it('checks hasGlobalRole(session.user, "admin") and sets loadError on denial', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('hasGlobalRole(resolved.session.user, "admin")');
    expect(source).toContain('setLoadError("Admin access required.")');
  });

  it('redirects unauthenticated users via router.replace(resolved.redirectTo)', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('if (resolved.redirectTo) router.replace(resolved.redirectTo)');
  });

  it('renders access denied section with loadError when not admin', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // loadError state is rendered to the user via a standard panel (not dangerouslySetInnerHTML)
    expect(source).toContain('if (loadError)');
    expect(source).toContain('{loadError}');
    expect(source).not.toContain('dangerouslySetInnerHTML');
  });

  it('uses "use client" directive (client component required for auth gate)', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source.trimStart()).toMatch(/^"use client"/);
  });
});

// ---------------------------------------------------------------------------
// AC2: Lists all categories with boards via adminListCategories
// ---------------------------------------------------------------------------

describe('forums-admin page (AC2) — lists categories with boards', () => {
  it('imports adminListCategories from forums-admin-client', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('adminListCategories');
    expect(source).toContain('from "./forums-admin-client"');
  });

  it('calls adminListCategories on initial load and stores result in categories state', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('const fetched = await adminListCategories()');
    expect(source).toContain('setCategories(fetched)');
    expect(source).toContain('useState<AdminCategoryShape[] | null>(null)');
  });

  it('renders a list of categories (categories.map)', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('categories.map((cat,');
  });

  it('renders boards for each category (cat.boards.map)', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('cat.boards.map((board,');
  });

  it('imports AdminCategoryShape and AdminBoardShape types', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('type AdminCategoryShape');
    expect(source).toContain('type AdminBoardShape');
  });

  it('refreshes categories after every mutation via refreshCategories helper', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('const refreshCategories = async ()');
    expect(source).toContain('const updated = await adminListCategories()');
    expect(source).toContain('setCategories(updated)');
  });
});

// ---------------------------------------------------------------------------
// AC3: Category CRUD + no-boards friendly delete message
// ---------------------------------------------------------------------------

describe('forums-admin page (AC3) — category CRUD', () => {
  it('imports and calls adminCreateCategory', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('adminCreateCategory');
    expect(source).toContain('await adminCreateCategory({');
  });

  it('imports and calls adminUpdateCategory', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('adminUpdateCategory');
    expect(source).toContain('await adminUpdateCategory(id, {');
  });

  it('imports and calls adminDeleteCategory', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('adminDeleteCategory');
    expect(source).toContain('await adminDeleteCategory(id)');
  });

  it('imports and calls adminReorderCategories with splice-based id ordering', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('adminReorderCategories');
    expect(source).toContain('await adminReorderCategories({ orderedIds: ordered })');
    // splice-based reorder
    expect(source).toContain('ordered.splice(idx, 1)');
    expect(source).toContain('orderedIds:');
  });

  it('performs proactive client-side boards.length check before delete', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('boardCount > 0');
    expect(source).toContain('Cannot delete this category because it still has boards');
  });

  it('catches 400 API responses with /board|must be empty|not empty/i regex for friendly delete message', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // The regex pattern for the boards-not-empty case
    expect(source).toContain('/board|must be empty|not empty/i');
    expect(source).toContain('Cannot delete this category because it still has boards');
  });

  it('category form accepts name, slug, description, and sortOrder fields', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('interface CategoryFormState');
    expect(source).toContain('name: string');
    expect(source).toContain('slug: string');
    expect(source).toContain('description: string');
    expect(source).toContain('sortOrder: string');
  });

  it('validates that category name and slug are required before create/edit', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('Category name and slug are required.');
  });

  it('move-up/move-down reorder uses splice to build orderedIds', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('handleCategoryMoveUp');
    expect(source).toContain('handleCategoryMoveDown');
    // splice is used in both move handlers
    const spliceCount = (source.match(/ordered\.splice\(/g) ?? []).length;
    expect(spliceCount).toBeGreaterThanOrEqual(4); // 2 per direction × 2 entity types
  });
});

// ---------------------------------------------------------------------------
// AC4: Board CRUD with full field set including scopeType and visibility
// ---------------------------------------------------------------------------

describe('forums-admin page (AC4) — board CRUD with full field set', () => {
  it('imports and calls adminCreateBoard', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('adminCreateBoard');
    expect(source).toContain('await adminCreateBoard({');
  });

  it('imports and calls adminUpdateBoard', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('adminUpdateBoard');
    expect(source).toContain('await adminUpdateBoard(id, {');
  });

  it('imports and calls adminDeleteBoard', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('adminDeleteBoard');
    expect(source).toContain('await adminDeleteBoard(id)');
  });

  it('imports and calls adminReorderBoards with categoryId and splice-based ordering', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('adminReorderBoards');
    expect(source).toContain('await adminReorderBoards(board.categoryId, { orderedIds: ordered })');
  });

  it('board create/edit form includes scopeType field with site and project options', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('scopeType: ForumBoardScopeType');
    expect(source).toContain('value="site"');
    expect(source).toContain('value="project"');
  });

  it('board create/edit form includes visibility field with all five vocabulary values', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('visibility: ForumBoardVisibility');
    expect(source).toContain('value="public"');
    expect(source).toContain('value="unlisted"');
    expect(source).toContain('value="members"');
    expect(source).toContain('value="project-only"');
    expect(source).toContain('value="private"');
  });

  it('board form includes projectId field', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('projectId: string');
    expect(source).toContain('projectId: boardCreateForm.projectId');
  });

  it('imports ForumBoardScopeType and ForumBoardVisibility types', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('type ForumBoardScopeType');
    expect(source).toContain('type ForumBoardVisibility');
  });

  it('board form validates name and slug are required', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('Board name and slug are required.');
  });

  it('board form includes name, slug, description, and sortOrder fields', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('interface BoardFormState');
    expect(source).toContain('categoryId: string');
    expect(source).toContain('name: string');
    expect(source).toContain('slug: string');
    expect(source).toContain('description: string');
    expect(source).toContain('sortOrder: string');
  });
});

// ---------------------------------------------------------------------------
// AC5: No dangerouslySetInnerHTML; user text as React nodes; no direct
//       encodeURIComponent in the page (handled by forums-admin-client)
// ---------------------------------------------------------------------------

describe('forums-admin page (AC5) — XSS safety', () => {
  it('does not contain dangerouslySetInnerHTML anywhere', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).not.toContain('dangerouslySetInnerHTML');
  });

  it('does not call encodeURIComponent directly (delegated to forums-admin-client)', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).not.toContain('encodeURIComponent(');
  });

  it('renders category name as a React text node (not innerHTML), not as HTML string', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // cat.name must appear as a JSX expression, not set as innerHTML
    expect(source).toContain('{cat.name}');
    expect(source).not.toContain('innerHTML');
  });

  it('renders board name as a React text node', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('{board.name}');
  });

  it('renders actionError and actionSuccess as React text nodes', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('{actionError}');
    expect(source).toContain('{actionSuccess}');
  });

  it('renders loadError as a React text node', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('{loadError}');
  });

  it('uses auth-shell.module.css (no new CSS file created)', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('from "../../auth-shell.module.css"');
    expect(source).toContain('import styles from');
  });
});

// ---------------------------------------------------------------------------
// AC6: Errors surfaced via standard envelope as friendly messages
// ---------------------------------------------------------------------------

describe('forums-admin page (AC6) — error surfacing', () => {
  it('captures errors from all CRUD operations and sets actionError state', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // All catch blocks should surface to setActionError
    const catchCount = (source.match(/setActionError\(/g) ?? []).length;
    // Expected: category create, edit, delete (×2), reorder up/down, board create, edit, delete, reorder up/down = at least 8
    expect(catchCount).toBeGreaterThanOrEqual(8);
  });

  it('uses Error instanceof check to extract message from caught errors', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('e instanceof Error ? e.message :');
  });

  it('clears feedback before each action via clearFeedback()', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('const clearFeedback = ()');
    expect(source).toContain('setActionError(null)');
    expect(source).toContain('setActionSuccess(null)');
    // clearFeedback called in multiple action handlers
    const clearCount = (source.match(/clearFeedback\(\)/g) ?? []).length;
    expect(clearCount).toBeGreaterThanOrEqual(5);
  });

  it('surfaces success feedback for category create, edit, and delete', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('setActionSuccess("Category created.")');
    expect(source).toContain('setActionSuccess("Category updated.")');
    expect(source).toContain('setActionSuccess("Category deleted.")');
  });

  it('surfaces success feedback for board create, edit, and delete', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('setActionSuccess("Board created.")');
    expect(source).toContain('setActionSuccess("Board updated.")');
    expect(source).toContain('setActionSuccess("Board deleted.")');
  });

  it('sets loadError on initial load failure with friendly message', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('setLoadError("Unable to load forums.")');
  });

  it('initialises actionError and actionSuccess as null and renders only when set', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('useState<string | null>(null)');
    // Conditional rendering
    expect(source).toContain('{actionError ?');
    expect(source).toContain('{actionSuccess ?');
  });
});
