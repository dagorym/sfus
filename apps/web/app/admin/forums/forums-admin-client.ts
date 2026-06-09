/**
 * Admin forums API client helpers.
 *
 * All routes in this module target the admin management surface and require an
 * active session with the global "admin" role. Session cookies are forwarded
 * automatically via credentials:include on every request.
 *
 * Response envelopes follow the API convention:
 *   single resource  → { category } or { board }
 *   list resource    → { categories } or { boards }
 *
 * Errors are parsed via the standard three-part chain:
 *   payload?.error?.message || payload?.message || <fallback>
 * matching the JsonExceptionFilter envelope from the API layer.
 */

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

// ---------------------------------------------------------------------------
// Vocabulary types — mirror the API entity vocabularies
// ---------------------------------------------------------------------------

/** Scope type for a forum board. 'site' is the only active type in M4. */
export type ForumBoardScopeType = "site" | "project";

/** Visibility vocabulary for a forum board. */
export type ForumBoardVisibility =
  | "public"
  | "unlisted"
  | "members"
  | "project-only"
  | "private";

// ---------------------------------------------------------------------------
// Admin entity shapes — mirror the API entity fields returned to admin callers
// ---------------------------------------------------------------------------

/**
 * Admin board shape returned from the admin management endpoints.
 * Includes all entity fields including internal ones (categoryId, scopeType,
 * projectId) that are omitted from the public-facing board shape.
 */
export interface AdminBoardShape {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  scopeType: ForumBoardScopeType;
  projectId: string | null;
  visibility: ForumBoardVisibility;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin category shape returned from the admin management endpoints.
 * Includes all entity fields plus the boards relation.
 */
export interface AdminCategoryShape {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  boards: AdminBoardShape[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Input types — mirror the API DTOs for create/update operations
// ---------------------------------------------------------------------------

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string | null;
  sortOrder?: number;
}

export interface ReorderCategoriesInput {
  /** Ordered list of category ids; all existing ids must be present. */
  orderedIds: string[];
}

export interface CreateBoardInput {
  categoryId: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
  /** Defaults to 'site' when omitted. */
  scopeType?: ForumBoardScopeType;
  visibility?: ForumBoardVisibility;
  /** Forward-scaffolding for project-scoped boards (M7/M8). Nullable. */
  projectId?: string | null;
}

export interface UpdateBoardInput {
  categoryId?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  sortOrder?: number;
  scopeType?: ForumBoardScopeType;
  visibility?: ForumBoardVisibility;
  projectId?: string | null;
}

export interface ReorderBoardsInput {
  /** Ordered list of board ids within the category; all board ids in the category must be present. */
  orderedIds: string[];
}

// ---------------------------------------------------------------------------
// Admin category endpoints — require active session + admin global role
// ---------------------------------------------------------------------------

/**
 * List all forum categories with their boards.
 * GET /api/forums/admin/categories
 */
export async function adminListCategories(): Promise<AdminCategoryShape[]> {
  const response = await fetch(`${apiBase}/forums/admin/categories`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load forum categories.");
  }
  const data = (await response.json()) as { categories: AdminCategoryShape[] };
  return data.categories;
}

/**
 * Get a single forum category by id.
 * GET /api/forums/admin/categories/:id
 */
export async function adminGetCategory(id: string): Promise<AdminCategoryShape> {
  const response = await fetch(`${apiBase}/forums/admin/categories/${encodeURIComponent(id)}`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load forum category.");
  }
  const data = (await response.json()) as { category: AdminCategoryShape };
  return data.category;
}

/**
 * Create a new forum category.
 * POST /api/forums/admin/categories
 */
export async function adminCreateCategory(input: CreateCategoryInput): Promise<AdminCategoryShape> {
  const response = await fetch(`${apiBase}/forums/admin/categories`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to create forum category.");
  }
  const data = (await response.json()) as { category: AdminCategoryShape };
  return data.category;
}

/**
 * Update an existing forum category.
 * PATCH /api/forums/admin/categories/:id
 */
export async function adminUpdateCategory(
  id: string,
  input: UpdateCategoryInput
): Promise<AdminCategoryShape> {
  const response = await fetch(`${apiBase}/forums/admin/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to update forum category.");
  }
  const data = (await response.json()) as { category: AdminCategoryShape };
  return data.category;
}

/**
 * Delete a forum category. The category must have no boards.
 * DELETE /api/forums/admin/categories/:id
 */
export async function adminDeleteCategory(id: string): Promise<void> {
  const response = await fetch(`${apiBase}/forums/admin/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to delete forum category.");
  }
}

/**
 * Reorder all forum categories.
 * All existing category ids must appear in orderedIds; position becomes sortOrder (0-indexed).
 * PUT /api/forums/admin/categories/reorder
 */
export async function adminReorderCategories(
  input: ReorderCategoriesInput
): Promise<AdminCategoryShape[]> {
  const response = await fetch(`${apiBase}/forums/admin/categories/reorder`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to reorder forum categories.");
  }
  const data = (await response.json()) as { categories: AdminCategoryShape[] };
  return data.categories;
}

// ---------------------------------------------------------------------------
// Admin board endpoints — require active session + admin global role
// ---------------------------------------------------------------------------

/**
 * List all boards in a category.
 * GET /api/forums/admin/categories/:categoryId/boards
 */
export async function adminListBoards(categoryId: string): Promise<AdminBoardShape[]> {
  const response = await fetch(
    `${apiBase}/forums/admin/categories/${encodeURIComponent(categoryId)}/boards`,
    {
      credentials: "include",
      cache: "no-store"
    }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load forum boards.");
  }
  const data = (await response.json()) as { boards: AdminBoardShape[] };
  return data.boards;
}

/**
 * Get a single forum board by id.
 * GET /api/forums/admin/boards/:id
 */
export async function adminGetBoard(id: string): Promise<AdminBoardShape> {
  const response = await fetch(`${apiBase}/forums/admin/boards/${encodeURIComponent(id)}`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load forum board.");
  }
  const data = (await response.json()) as { board: AdminBoardShape };
  return data.board;
}

/**
 * Create a new forum board.
 * scopeType: 'site' | 'project' (default 'site')
 * visibility: 'public' | 'unlisted' | 'members' | 'project-only' | 'private' (default 'public')
 * POST /api/forums/admin/boards
 */
export async function adminCreateBoard(input: CreateBoardInput): Promise<AdminBoardShape> {
  const response = await fetch(`${apiBase}/forums/admin/boards`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to create forum board.");
  }
  const data = (await response.json()) as { board: AdminBoardShape };
  return data.board;
}

/**
 * Update an existing forum board.
 * PATCH /api/forums/admin/boards/:id
 */
export async function adminUpdateBoard(
  id: string,
  input: UpdateBoardInput
): Promise<AdminBoardShape> {
  const response = await fetch(`${apiBase}/forums/admin/boards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to update forum board.");
  }
  const data = (await response.json()) as { board: AdminBoardShape };
  return data.board;
}

/**
 * Delete a forum board.
 * DELETE /api/forums/admin/boards/:id
 */
export async function adminDeleteBoard(id: string): Promise<void> {
  const response = await fetch(`${apiBase}/forums/admin/boards/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to delete forum board.");
  }
}

/**
 * Reorder boards within a category.
 * All board ids in the category must appear in orderedIds; position becomes sortOrder (0-indexed).
 * PUT /api/forums/admin/categories/:categoryId/boards/reorder
 */
export async function adminReorderBoards(
  categoryId: string,
  input: ReorderBoardsInput
): Promise<AdminBoardShape[]> {
  const response = await fetch(
    `${apiBase}/forums/admin/categories/${encodeURIComponent(categoryId)}/boards/reorder`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to reorder forum boards.");
  }
  const data = (await response.json()) as { boards: AdminBoardShape[] };
  return data.boards;
}
