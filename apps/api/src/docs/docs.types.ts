// ---------------------------------------------------------------------------
// Injection token
// ---------------------------------------------------------------------------

/** Injection token for the resolved docs configuration object. */
export const DOCS_CONFIG = "DOCS_CONFIG";

/** Shape of the resolved docs configuration. */
export interface DocsConfig {
  /** Soft-lock TTL in minutes (from DOCS_LOCK_TTL_MINUTES env var). */
  lockTtlMinutes: number;
}

// ---------------------------------------------------------------------------
// Docs scope-type vocabulary
// ---------------------------------------------------------------------------

export const docsScopeTypes = ["site", "project"] as const;
export type DocsScopeType = (typeof docsScopeTypes)[number];

// ---------------------------------------------------------------------------
// Docs page status vocabulary
// ---------------------------------------------------------------------------

/** Page lifecycle states. 'deleted' is a soft-delete; rows are never hard-removed. */
export const docsPageStatuses = ["published", "deleted"] as const;
export type DocsPageStatus = (typeof docsPageStatuses)[number];

// ---------------------------------------------------------------------------
// Docs visibility vocabulary (reuses the site-wide resource-visibility set)
// ---------------------------------------------------------------------------

export const docsVisibilities = ["public", "unlisted", "members", "private"] as const;
export type DocsVisibility = (typeof docsVisibilities)[number];

// ---------------------------------------------------------------------------
// Lock constants
// ---------------------------------------------------------------------------

/** Default soft-lock TTL in minutes (overridden by DOCS_LOCK_TTL_MINUTES env var). */
export const DOCS_LOCK_TTL_MINUTES_DEFAULT = 30;

// ---------------------------------------------------------------------------
// Lock shapes (ST-6)
// ---------------------------------------------------------------------------

/**
 * Current lock state surfaced on page read responses.
 * If the page is not locked (or the lock has expired), all fields except
 * `isLocked` are null.
 */
export interface DocsLockState {
  isLocked: boolean;
  lockedByUserId: string | null;
  lockedAt: Date | null;
  lockExpiresAt: Date | null;
}

/**
 * Response shape for POST /api/docs/:id/lock.
 * Returns the new lock state for the page.
 */
export interface DocsLockResultShape {
  pageId: string;
  lock: DocsLockState;
}

/**
 * Holder metadata included in 409 responses when a non-expired foreign lock
 * prevents acquiring the lock.
 */
export interface DocsLockConflictInfo {
  lockedByUserId: string;
  lockExpiresAt: Date;
}

// ---------------------------------------------------------------------------
// Diff size limits (ST-5 security: DoS guard for O(m·n) LCS computation)
// ---------------------------------------------------------------------------

/**
 * Maximum allowed byte length of a single revision body accepted by the diff
 * endpoint (GET /api/docs/:id/diff). Bodies exceeding this threshold cause a
 * 400 BadRequestException before the O(m·n) LCS table is allocated.
 *
 * Chosen to be well below the MEDIUMTEXT ceiling (~16 MB) while still
 * accommodating normal wiki pages (typical pages are well under 1 MB).
 */
export const DOCS_DIFF_MAX_BODY_BYTES = 512_000; // 512 KB per revision body

/**
 * Maximum allowed line count of a single revision body accepted by the diff
 * endpoint. Bodies with more lines cause a 400 BadRequestException before the
 * O(m·n) LCS table is allocated.
 *
 * Caps the DP table at ~25 billion cells in the worst case
 * (5 000 × 5 000 = 25 000 000), which is the safe upper bound for a
 * synchronous in-process diff.
 */
export const DOCS_DIFF_MAX_LINES = 5_000; // lines per revision body

// ---------------------------------------------------------------------------
// Read API shapes (ST-2)
// ---------------------------------------------------------------------------

/** Public author stub exposed in read responses. */
export interface DocsAuthorShape {
  username: string;
  displayName: string | null;
}

/** Breadcrumb item: a single ancestor in the page's ancestry chain. */
export interface DocsBreadcrumbItem {
  id: string;
  title: string;
  path: string;
}

/** Current-revision stub included in page read responses. */
export interface DocsRevisionShape {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  revisionNumber: number;
  author: DocsAuthorShape | null;
  /** Username of the editor (last saved-by user), or null if same as original author. */
  editorUsername: string | null;
  createdAt: Date;
}

/** Full page response shape returned by GET /api/docs/*path. */
export interface DocsPageShape {
  id: string;
  title: string;
  path: string;
  depth: number;
  parentId: string | null;
  visibility: DocsVisibility;
  breadcrumbs: DocsBreadcrumbItem[];
  currentRevision: DocsRevisionShape | null;
  /** Current lock state. Always present; reflects whether the page is actively locked. */
  lock: DocsLockState;
  createdAt: Date;
  updatedAt: Date;
}

/** Lightweight tree item returned by GET /api/docs (index/children). */
export interface DocsTreeItem {
  id: string;
  title: string;
  path: string;
  depth: number;
  parentId: string | null;
  /** Whether this page has any published, publicly-readable children. */
  hasChildren: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Recent-edit item returned by GET /api/docs/recent. */
export interface DocsRecentEditShape {
  pageId: string;
  title: string;
  path: string;
  editor: DocsAuthorShape | null;
  editedAt: Date;
}

/** Query parameters for the recent-edits feed. */
export interface DocsRecentQuery {
  limit?: number;
}

// ---------------------------------------------------------------------------
// Write API shapes (ST-3)
// ---------------------------------------------------------------------------

/** Input for POST /api/docs — create a new docs page. */
export interface CreateDocPageInput {
  /** Page title (1–255 chars). */
  title: string;
  /**
   * URL slug (1–255 chars, a-z 0-9 hyphen only). Optional — when omitted or blank
   * the server auto-derives a slug from the title (lowercase, non-alphanumeric runs
   * replaced with hyphens, leading/trailing hyphens stripped). If the derived slug
   * collides with an existing path, a numeric suffix ("-2", "-3", …) is appended
   * until the path is unique.
   */
  slug?: string;
  /** Initial Markdown body (may be empty string). */
  body: string;
  /** Optional edit summary for revision #1. */
  summary?: string;
  /** Optional full path of the parent page (resolved to parentId). */
  parentPath?: string;
  /** Optional UUID of the parent page (alternative to parentPath). */
  parentId?: string;
}

/** Input for POST /api/docs/:id/revisions — append a new revision to a page. */
export interface AddDocRevisionInput {
  /** Updated page title (1–255 chars). */
  title: string;
  /** Full Markdown body for this revision. */
  body: string;
  /** Optional edit summary. */
  summary?: string;
}

/**
 * Input for PATCH /api/docs/:id — rename a page within the same parent.
 *
 * At least one of `slug` or `title` must be provided.
 * Cross-parent move/reparent is OUT OF SCOPE (deferred).
 */
export interface RenameDocPageInput {
  /**
   * New URL slug (1–255 chars, a-z 0-9 hyphen only).
   * When changed, the page's path/path_hash and ALL descendants' paths are
   * rewritten in a single transaction (subtree path rewrite, AC1).
   */
  slug?: string;
  /** New page title (1–255 chars). If slug is unchanged, only the title is updated (AC2). */
  title?: string;
}

/** Response shape for page-write operations (create / add revision). */
export interface DocWriteResultShape {
  id: string;
  title: string;
  path: string;
  depth: number;
  parentId: string | null;
  currentRevisionId: string | null;
  revisionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// History / diff / rollback shapes (ST-5)
// ---------------------------------------------------------------------------

/** Metadata for a single revision in the history list. */
export interface DocsRevisionMetaShape {
  revisionNumber: number;
  author: DocsAuthorShape | null;
  /** Editor username (the actor who saved this revision), or null if same as author. */
  editorUsername: string | null;
  summary: string | null;
  createdAt: Date;
}

/** Response shape for GET /api/docs/:id/history. */
export interface DocsHistoryShape {
  revisions: DocsRevisionMetaShape[];
}

/** A single revision body returned by GET /api/docs/:id/revisions/:revisionNumber. */
export interface DocsSingleRevisionShape {
  revisionNumber: number;
  title: string;
  body: string;
  summary: string | null;
  author: DocsAuthorShape | null;
  editorUsername: string | null;
  createdAt: Date;
}

/**
 * A single hunk in a line-level diff.
 *
 * type:
 *   "unchanged" — lines present in both revisions
 *   "added"     — lines only in the "to" revision
 *   "removed"   — lines only in the "from" revision
 *
 * lines: the text content of each line in this hunk (without trailing newline).
 */
export interface DocsDiffHunk {
  type: "unchanged" | "added" | "removed";
  lines: string[];
}

/** Response shape for GET /api/docs/:id/diff?from=&to=. */
export interface DocsDiffShape {
  fromRevisionNumber: number;
  toRevisionNumber: number;
  hunks: DocsDiffHunk[];
}

/** Input for POST /api/docs/:id/rollback. */
export interface DocRollbackInput {
  /** Revision number of the target revision to roll back to. */
  revisionNumber: number;
}
