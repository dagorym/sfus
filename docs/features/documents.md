# Documents (Wiki)

Site-wide hierarchical wiki system: a page tree with breadcrumbs, per-edit revisions,
soft locking, and image embeds via the existing media pipeline. All write actions are
gated to moderator/admin for site-scoped pages.

**Code:** `apps/api/src/docs/`
**Related:** [authorization](authorization.md) for the authorization gate ·
[development/api-conventions](../development/api-conventions.md) for the error envelope

## Overview

The Documents subsystem organises wiki pages into a hierarchical tree:

- **Site scope** (`scopeType='site'`) — site-wide pages accessible to all visitors
  when `visibility='public'`. This is the only active scope; project-scoped pages are
  forward-scaffolding for later milestones.
- **Revisions** — every save creates an immutable `DocsRevisionEntity` row;
  `current_revision_id` on the page points to the latest.
- **Path hash** — the unique index `(scope_type, scope_id, path_hash)` uses a SHA-256
  hash of `scopeType:scopeId:path` to work around the MySQL 5.7.44 utf8mb4 prefix-length
  limit on `path varchar(1024)` columns.

## Visibility and security contract

### Oracle parity (P12)

A **non-publicly-readable page, a deleted page, and a nonexistent path all return the
same `404`** response. The error message is always `DocsService.PAGE_NOT_FOUND_MESSAGE`
(`'Document page not found.'`). Callers cannot distinguish existence from access denial.

This rule applies to every read path: page-by-path, tree/children, and recent feed.

### Scope exclusion

Project-scoped pages (`scopeType='project'`) are **always excluded** from every site
index and every public read. Only `scopeType='site'` pages with `status='published'` and
a publicly-readable visibility appear in unauthenticated reads.

### Authorization routing

Every visibility decision is routed through `AuthorizationService.evaluate()` with an
anonymous actor (no `userId`, empty `globalRole` string). No inline re-derived predicates
exist at any call site.

`DocsService.isPagePubliclyReadable(page)` is the shared gate:

1. Rejects any page where `scopeType !== 'site'`.
2. Calls `AuthorizationService.evaluate({ actor: anonymousActor, resource: { resourceType: 'docs_page', ... }, action: 'read' })`.

## Public read API

All three endpoints are unauthenticated. No session or auth header is required.

### GET /api/docs/\*path — resolve a page by full path

Returns the page's current revision body plus an ordered breadcrumb ancestry array.

- **Path resolution:** the full slash-joined path (e.g. `getting-started/installation`) is
  normalized (trim, strip leading/trailing slashes) then hashed via
  `DocsService.computePathHash('site', null, path)` for the indexed lookup.
- **Breadcrumbs:** ancestors from the shallowest (root) to the immediate parent, in that
  display order. Non-readable ancestors are included; the breadcrumb is navigational.
- **Oracle parity:** nonexistent, deleted, and non-readable pages all return `404` with
  `PAGE_NOT_FOUND_MESSAGE`.

**Response shape** (`{ page: DocsPageShape }`):

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `title` | string | |
| `path` | string | Materialized slash-joined path |
| `depth` | number | 0 = root |
| `parentId` | `string \| null` | |
| `visibility` | `DocsVisibility` | |
| `breadcrumbs` | `DocsBreadcrumbItem[]` | Ordered root → immediate parent |
| `currentRevision` | `DocsRevisionShape \| null` | |
| `createdAt` | Date | |
| `updatedAt` | Date | |

`DocsRevisionShape` fields: `id`, `title`, `body`, `summary`, `revisionNumber`,
`author` (`{ username, displayName }`), `editorUsername`, `createdAt`.

`DocsBreadcrumbItem` fields: `id`, `title`, `path`.

### GET /api/docs — site root tree / children of ?parentPath=

Returns the direct children of the site root (when `parentPath` is omitted) or the
direct children of the specified parent path.

- Only site-scoped, `status='published'`, publicly-readable pages are included.
- Pages are ordered alphabetically by title (ASC).
- When `parentPath` is provided and the parent does not exist or is not publicly readable,
  the endpoint returns `404` with `PAGE_NOT_FOUND_MESSAGE` (oracle parity).

**Response shape** (`{ pages: DocsTreeItem[] }`):

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `title` | string | |
| `path` | string | |
| `depth` | number | |
| `parentId` | `string \| null` | |
| `hasChildren` | boolean | Always `false` in the current implementation; populated by later milestones |
| `createdAt` | Date | |
| `updatedAt` | Date | |

### GET /api/docs/recent?limit= — recent published site-doc edits

Returns recent publicly-readable site-doc edits for use by the landing-page activity feed.

- **Default limit:** 5. **Maximum limit:** 20. Clamps any value below 1 to 1.
- Ordered most-recently-edited first (by `revision.createdAt DESC`).
- Non-readable, deleted, and project-scoped pages are excluded — no oracle leak.
- Returns a stable empty array when no public activity exists.

**Response shape** (`{ docs: DocsRecentEditShape[] }`):

| Field | Type | Notes |
|---|---|---|
| `pageId` | string (UUID) | |
| `title` | string | |
| `path` | string | |
| `editor` | `{ username, displayName } \| null` | Last editor; falls back to original author |
| `editedAt` | Date | Revision `createdAt` |

## Shared utilities

### DocsService.computePathHash(scopeType, scopeId, path)

Public method used by both the read layer (ST-2) and the write layer (ST-3+) to produce
the SHA-256 hash stored in `path_hash`. Input format: `${scopeType}:${scopeId ?? ''}:${path}`.

### DocsService constants

| Constant | Value | Purpose |
|---|---|---|
| `PAGE_NOT_FOUND_MESSAGE` | `'Document page not found.'` | Oracle-parity error message for all gated 404 reads |
| `RECENT_DOCS_DEFAULT_LIMIT` | `5` | Default recent-feed page count |
| `RECENT_DOCS_MAX_LIMIT` | `20` | Hard cap on recent-feed page count |

## Route ordering note

`GET /api/docs/recent` is registered **before** `GET /api/docs/*path` in
`DocsController`. This ordering is required: the literal `recent` route must be declared
first so NestJS resolves `GET /docs/recent` as the recent-feed handler rather than
treating `recent` as a path segment for the catch-all.
