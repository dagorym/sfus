/**
 * Docs API client helpers for the public Documents wiki surface.
 *
 * Public routes (getDocPageTree, getDocPageByPath) need no session cookie.
 * Write routes (createDocPage, addDocRevision, renameDocPage, softDeleteDocPage,
 * acquireDocLock, releaseDocLock) require a session cookie and moderator/admin
 * role on the server side.
 *
 * Error envelope: every error handler reads payload.error.message first, then
 * payload.message, then falls back to a generic message (P7 shared pattern).
 */

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

// ---------------------------------------------------------------------------
// Shared error-envelope type
// ---------------------------------------------------------------------------

type ErrorEnvelope = { error?: { message?: string }; message?: string } | null;

function extractErrorMessage(payload: ErrorEnvelope, fallback: string): string {
  if (!payload) return fallback;
  return payload.error?.message || payload.message || fallback;
}

// ---------------------------------------------------------------------------
// Response shapes (mirrored from API types)
// ---------------------------------------------------------------------------

export interface DocsAuthorShape {
  username: string;
  displayName: string | null;
}

export interface DocsBreadcrumbItem {
  id: string;
  title: string;
  path: string;
}

export interface DocsRevisionShape {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  revisionNumber: number;
  author: DocsAuthorShape | null;
  editorUsername: string | null;
  createdAt: string;
}

export interface DocsLockState {
  isLocked: boolean;
  lockedByUserId: string | null;
  lockedAt: string | null;
  lockExpiresAt: string | null;
}

/** Full page response shape from GET /api/docs/*path. */
export interface DocsPageShape {
  id: string;
  title: string;
  path: string;
  depth: number;
  parentId: string | null;
  visibility: string;
  breadcrumbs: DocsBreadcrumbItem[];
  currentRevision: DocsRevisionShape | null;
  lock: DocsLockState;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight tree item from GET /api/docs. */
export interface DocsTreeItem {
  id: string;
  title: string;
  path: string;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Recent-edit item from GET /api/docs/recent. */
export interface DocsRecentEditShape {
  pageId: string;
  title: string;
  path: string;
  editor: DocsAuthorShape | null;
  editedAt: string;
}

// ---------------------------------------------------------------------------
// Public read routes — no session required
// ---------------------------------------------------------------------------

/**
 * Fetches the site page tree: top-level pages when parentPath is omitted,
 * or direct children of the specified parent path.
 *
 * Returns null when the parentPath is not found (404).
 * Throws on unexpected errors.
 */
export async function getDocPageTree(parentPath?: string): Promise<DocsTreeItem[] | null> {
  const url = parentPath
    ? `${apiBase}/docs?parentPath=${encodeURIComponent(parentPath)}`
    : `${apiBase}/docs`;
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to load documents."));
  }
  const data = (await response.json()) as { pages: DocsTreeItem[] };
  return data.pages;
}

/**
 * Fetches a published doc page by its full path.
 *
 * Returns null when the page is not found or not publicly accessible (404).
 * Throws on unexpected errors.
 */
export async function getDocPageByPath(path: string): Promise<DocsPageShape | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${apiBase}/docs/${encodedPath}`, {
    cache: "no-store"
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to load document."));
  }
  const data = (await response.json()) as { page: DocsPageShape };
  return data.page;
}

/**
 * Fetches recent publicly-readable site-doc edits for the landing-page feed.
 *
 * Never returns null — an empty list is returned when there are no edits.
 * Throws on unexpected errors.
 */
export async function getRecentDocEdits(limit?: number): Promise<DocsRecentEditShape[]> {
  const url = limit !== undefined
    ? `${apiBase}/docs/recent?limit=${encodeURIComponent(String(limit))}`
    : `${apiBase}/docs/recent`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to load recent document activity."));
  }
  const data = (await response.json()) as { docs: DocsRecentEditShape[] };
  return data.docs;
}
