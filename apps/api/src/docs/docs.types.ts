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

/** Default soft-lock TTL in minutes (overridden by DOCS_LOCK_TTL_MINUTES env var in ST-6). */
export const DOCS_LOCK_TTL_MINUTES_DEFAULT = 30;
