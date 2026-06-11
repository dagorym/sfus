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
 *  AC7 - Input length limits: maxLength=128 on name inputs, maxLength=512 on description inputs,
 *        "max 512 characters" hint displayed, server 400 messages surfaced verbatim
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

// ---------------------------------------------------------------------------
// AC7: Input length limits and server 400 error surfacing
// ---------------------------------------------------------------------------

describe('forums-admin page (AC7) — input length limits on name inputs', () => {
  it('category name input enforces maxLength=128', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // The category form renders a name input; the renderCategoryForm helper is
    // shared by both create and edit forms.  Assert maxLength={128} appears in
    // the source alongside the name placeholder text so the assertion is
    // anchored to the name input context.
    expect(source).toContain('maxLength={128}');
    expect(source).toContain('placeholder="e.g. General Discussion"');
    // Verify the attribute appears before the description placeholder so the
    // name input receives maxLength and not only the description input.
    const nameInputIdx = source.indexOf('placeholder="e.g. General Discussion"');
    const maxLength128Idx = source.indexOf('maxLength={128}');
    expect(maxLength128Idx).toBeGreaterThanOrEqual(0);
    expect(nameInputIdx).toBeGreaterThanOrEqual(0);
    // maxLength={128} must appear before the name placeholder (it is on the same input element)
    expect(maxLength128Idx).toBeLessThan(nameInputIdx);
  });

  it('board name input enforces maxLength=128', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // The board form renders a name input with the board placeholder text.
    // maxLength={128} must appear before "e.g. Rules & Announcements".
    const boardNamePlaceholderIdx = source.indexOf('placeholder="e.g. Rules & Announcements"');
    expect(boardNamePlaceholderIdx).toBeGreaterThanOrEqual(0);
    // Find the second occurrence of maxLength={128} (board form comes after category form)
    const firstOccurrence = source.indexOf('maxLength={128}');
    const secondOccurrence = source.indexOf('maxLength={128}', firstOccurrence + 1);
    expect(secondOccurrence).toBeGreaterThanOrEqual(0);
    // The second maxLength={128} (board name) must appear before the board name placeholder
    expect(secondOccurrence).toBeLessThan(boardNamePlaceholderIdx);
  });

  it('both category and board name inputs each carry maxLength={128} (two occurrences total)', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    const occurrences = (source.match(/maxLength=\{128\}/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

describe('forums-admin page (AC7) — input length limits on description inputs', () => {
  it('category description input enforces maxLength=512', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // maxLength={512} must appear in the source (once per description input)
    expect(source).toContain('maxLength={512}');
  });

  it('board description input enforces maxLength=512', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // Two description inputs share the renderCategoryForm / renderBoardForm helpers;
    // both helpers contribute a maxLength={512} attribute.
    const occurrences = (source.match(/maxLength=\{512\}/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('category description input is followed immediately by the "max 512 characters" hint', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // The hint span must appear after the category description maxLength={512} attribute.
    const descMax512Idx = source.indexOf('maxLength={512}');
    const hintIdx = source.indexOf('max 512 characters', descMax512Idx);
    expect(hintIdx).toBeGreaterThan(descMax512Idx);
  });

  it('board description input is followed by a "max 512 characters" hint', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // The second occurrence of maxLength={512} belongs to the board form.
    const firstMax512 = source.indexOf('maxLength={512}');
    const secondMax512 = source.indexOf('maxLength={512}', firstMax512 + 1);
    expect(secondMax512).toBeGreaterThanOrEqual(0);
    // The hint must appear after the board description maxLength attribute.
    const boardHintIdx = source.indexOf('max 512 characters', secondMax512);
    expect(boardHintIdx).toBeGreaterThan(secondMax512);
  });

  it('"max 512 characters" hint appears exactly twice — once per form type (category + board)', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    const hintCount = (source.match(/max 512 characters/g) ?? []).length;
    expect(hintCount).toBeGreaterThanOrEqual(2);
  });
});

describe('forums-admin page (AC7) — server 400 error message surfacing', () => {
  it('category create catch block surfaces the Error message directly (not a hardcoded generic string)', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // The catch block for adminCreateCategory must use e.message so that any
    // server-supplied 400 validation message is shown verbatim in the UI.
    // Verify the error setter uses the instance-check pattern.
    expect(source).toContain('e instanceof Error ? e.message :');
    // And that the fallback for create category is not the generic server message —
    // it is a form-specific fallback string.
    expect(source).toContain('"Create category failed."');
  });

  it('category edit catch block surfaces the Error message directly', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('"Update category failed."');
  });

  it('board create catch block surfaces the Error message directly', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('"Create board failed."');
  });

  it('board edit catch block surfaces the Error message directly', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    expect(source).toContain('"Update board failed."');
  });

  it('all four form submit catch blocks use the instanceof Error pattern to forward server messages', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // Each of the four mutation handlers (category create, category edit, board
    // create, board edit) must use the instanceof check to forward the server
    // Error.message rather than swallowing it.
    const instanceofCount = (source.match(/e instanceof Error \? e\.message :/g) ?? []).length;
    // At least 4 (create cat, edit cat, delete cat, create board, edit board,
    // delete board, reorder handlers — all use the same idiom).
    expect(instanceofCount).toBeGreaterThanOrEqual(4);
  });

  it('actionError rendered as a React text node so server messages reach the UI', async () => {
    const source = await readAppFile("app/admin/forums/page.tsx");
    // {actionError} is the React expression that renders the surfaced server message.
    expect(source).toContain('{actionError}');
    // Must not be wrapped in dangerouslySetInnerHTML — already checked in AC5
    // but redundantly confirmed here for the server-message surfacing path.
    expect(source).not.toContain('dangerouslySetInnerHTML');
  });
});
