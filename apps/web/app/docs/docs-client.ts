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

/**
 * Lightweight write-result shape returned by POST /api/docs,
 * POST /api/docs/:id/revisions, PATCH /api/docs/:id, and
 * POST /api/docs/:id/rollback. Does NOT include lock, currentRevision,
 * breadcrumbs, or visibility — re-fetch via getDocPageByPath for those.
 */
export interface DocWriteResultShape {
  id: string;
  title: string;
  path: string;
  depth: number;
  parentId: string | null;
  currentRevisionId: string | null;
  revisionNumber: number;
  createdAt: string;
  updatedAt: string;
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

// ---------------------------------------------------------------------------
// Write routes — require a moderator/admin session cookie
// ---------------------------------------------------------------------------

export interface CreateDocPageInput {
  title: string;
  slug?: string;
  body: string;
  summary?: string;
  parentPath?: string;
}

export interface CreateDocPageResult {
  page: DocWriteResultShape;
}

/**
 * Creates a new doc page (POST /api/docs).
 *
 * Throws on any error, including 403 (not staff) and 409 (path collision).
 */
export async function createDocPage(input: CreateDocPageInput): Promise<DocWriteResultShape> {
  const response = await fetch(`${apiBase}/docs`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to create document."));
  }
  const data = (await response.json()) as CreateDocPageResult;
  return data.page;
}

export interface AddDocRevisionInput {
  title?: string;
  body: string;
  summary?: string;
}

export interface AddDocRevisionResult {
  page: DocWriteResultShape;
}

/**
 * Adds a new revision to an existing doc page (POST /api/docs/:id/revisions).
 *
 * Throws on any error, including 403 (not staff) and 409 (active foreign lock).
 */
export async function addDocRevision(pageId: string, input: AddDocRevisionInput): Promise<DocWriteResultShape> {
  const response = await fetch(`${apiBase}/docs/${encodeURIComponent(pageId)}/revisions`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as (ErrorEnvelope & { error?: { details?: LockConflictDetails } });
    if (response.status === 409) {
      const details = (payload as { error?: { details?: LockConflictDetails } })?.error?.details;
      if (details?.lockedByUserId) {
        throw Object.assign(
          new Error(extractErrorMessage(payload as ErrorEnvelope, "Document is locked by another user.")),
          { lockConflict: details }
        );
      }
    }
    throw new Error(extractErrorMessage(payload as ErrorEnvelope, "Failed to save revision."));
  }
  const data = (await response.json()) as AddDocRevisionResult;
  return data.page;
}

export interface RenameDocPageInput {
  title?: string;
  slug?: string;
}

/**
 * Renames a doc page's title and/or slug (PATCH /api/docs/:id).
 *
 * Throws on any error, including 403 (not staff) and 409 (active foreign lock).
 */
export async function renameDocPage(pageId: string, input: RenameDocPageInput): Promise<DocWriteResultShape> {
  const response = await fetch(`${apiBase}/docs/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to rename document."));
  }
  const data = (await response.json()) as { page: DocWriteResultShape };
  return data.page;
}

/** Lock-conflict details returned inside error.details on a 409 from lock routes. */
export interface LockConflictDetails {
  lockedByUserId: string;
  lockExpiresAt: string | null;
}

/** Extended error for lock conflicts — carries parsed holder metadata. */
export type LockConflictError = Error & { lockConflict: LockConflictDetails };

export function isLockConflictError(err: unknown): err is LockConflictError {
  return err instanceof Error && "lockConflict" in err;
}

/**
 * Acquires (or refreshes) the soft lock on a doc page (POST /api/docs/:id/lock).
 *
 * Returns updated lock state on success.
 * Throws a LockConflictError when a different, non-expired holder already holds the lock.
 */
export async function acquireDocLock(pageId: string): Promise<DocsLockState> {
  const response = await fetch(`${apiBase}/docs/${encodeURIComponent(pageId)}/lock`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" }
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as (ErrorEnvelope & { error?: { details?: LockConflictDetails } });
    if (response.status === 409) {
      const details = (payload as { error?: { details?: LockConflictDetails } })?.error?.details;
      if (details?.lockedByUserId) {
        const err = new Error(extractErrorMessage(payload as ErrorEnvelope, "Document is locked by another user.")) as LockConflictError;
        err.lockConflict = details;
        throw err;
      }
    }
    throw new Error(extractErrorMessage(payload as ErrorEnvelope, "Failed to acquire lock."));
  }
  const data = (await response.json()) as { lock: DocsLockState };
  return data.lock;
}

/**
 * Releases the soft lock on a doc page (DELETE /api/docs/:id/lock).
 *
 * Throws on any error, including 403 (not the holder and not staff override).
 */
export async function releaseDocLock(pageId: string): Promise<void> {
  const response = await fetch(`${apiBase}/docs/${encodeURIComponent(pageId)}/lock`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to release lock."));
  }
}

// ---------------------------------------------------------------------------
// History / diff / rollback routes (ST-5 server endpoints)
// ---------------------------------------------------------------------------

/** Metadata for a single revision in the history list. */
export interface DocsRevisionMetaShape {
  revisionNumber: number;
  author: { username: string; displayName: string | null } | null;
  editorUsername: string | null;
  summary: string | null;
  createdAt: string;
}

/** Full body of a single revision. */
export interface DocsSingleRevisionShape {
  revisionNumber: number;
  title: string;
  body: string;
  summary: string | null;
  author: { username: string; displayName: string | null } | null;
  editorUsername: string | null;
  createdAt: string;
}

/** A single diff hunk. */
export interface DocsDiffHunk {
  type: "unchanged" | "added" | "removed";
  lines: string[];
}

/** Response from GET /api/docs/:id/diff?from=&to=. */
export interface DocsDiffShape {
  fromRevisionNumber: number;
  toRevisionNumber: number;
  hunks: DocsDiffHunk[];
}

/**
 * Fetches the revision history metadata for a doc page.
 *
 * Returns null when the page is not found / not readable (404).
 * Throws on unexpected errors.
 */
export async function getDocHistory(pageId: string): Promise<DocsRevisionMetaShape[] | null> {
  const response = await fetch(
    `${apiBase}/docs/${encodeURIComponent(pageId)}/history`,
    { cache: "no-store" }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to load history."));
  }
  const data = (await response.json()) as { revisions: DocsRevisionMetaShape[] };
  return data.revisions;
}

/**
 * Fetches a single revision body by page ID and revision number.
 *
 * Returns null on 404.
 * Throws on unexpected errors.
 */
export async function getDocRevision(
  pageId: string,
  revisionNumber: number
): Promise<DocsSingleRevisionShape | null> {
  const response = await fetch(
    `${apiBase}/docs/${encodeURIComponent(pageId)}/revisions/${encodeURIComponent(String(revisionNumber))}`,
    { cache: "no-store" }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to load revision."));
  }
  const data = (await response.json()) as { revision: DocsSingleRevisionShape };
  return data.revision;
}

/**
 * Fetches the side-by-side diff between two revisions.
 *
 * Returns null on 404 (page not found / not readable).
 * Throws on 400 (size cap exceeded — surfaces a friendly message) or other errors.
 */
export async function getDocDiff(
  pageId: string,
  from: number,
  to: number
): Promise<DocsDiffShape | null> {
  const url = `${apiBase}/docs/${encodeURIComponent(pageId)}/diff?from=${encodeURIComponent(String(from))}&to=${encodeURIComponent(String(to))}`;
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 404) return null;
  if (response.status === 400) {
    throw new Error(
      "This diff is unavailable because one or more revisions are too large to compare."
    );
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to load diff."));
  }
  const data = (await response.json()) as DocsDiffShape;
  return data;
}

/**
 * Rolls back a doc page to the given revision number (POST /api/docs/:id/rollback).
 *
 * Creates a new highest-numbered revision equal in content to the target.
 * Requires a moderator/admin session.
 * Throws on any error (403 if not staff, 409 if locked by another user, etc.).
 */
export async function rollbackDocPage(
  pageId: string,
  revisionNumber: number
): Promise<DocWriteResultShape> {
  const response = await fetch(
    `${apiBase}/docs/${encodeURIComponent(pageId)}/rollback`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revisionNumber })
    }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorEnvelope;
    throw new Error(extractErrorMessage(payload, "Failed to roll back document."));
  }
  const data = (await response.json()) as { page: DocWriteResultShape };
  return data.page;
}
