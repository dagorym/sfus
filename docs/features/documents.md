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
  display order. Each ancestor is routed through `isPagePubliclyReadable`; if an ancestor
  fails (non-readable, project-scoped, deleted, or members/private), the chain is truncated
  at that point — that ancestor and all shallower ancestors are omitted. This prevents
  id/title leakage of gated ancestors (oracle parity: gated === absent).
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
| `lock` | `DocsLockState` | Always present; reflects current lock state (see [Soft locking](#soft-locking)) |
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

## Write API

Both write routes require an active session (401 without one) and moderator or admin
global role (403 for `user` role). Both are rate-limited via `ThrottleGuard`.

### Authentication and authorization

`DocsService.assertDocWriteAccess(actorGlobalRole, scopeTypeOrPage)` is the **single
authorization gate** for all Documents write operations. No inline role checks exist at
call sites.

- For `scopeType='site'` the actor must have at least the `moderator` global role
  (`AuthorizationService.hasGlobalRole`). `user`-role and unauthenticated callers receive
  `403`.
- The method accepts either a `DocsPageEntity` or a bare scope-type string, so call sites
  remain unchanged when future project-scope rules are added inside the method.

Session resolution happens before `assertDocWriteAccess` is called: a missing or invalid
session throws `401` before the role gate is evaluated.

### Oracle parity on write paths

`addRevision` returns the same `404` (`PAGE_NOT_FOUND_MESSAGE`) for nonexistent or deleted
pages that the read paths return. There is no separate `403` vs `404` distinction for
write-path lookups.

### POST /api/docs — create a new wiki page

Creates a new page with revision #1 and sets `current_revision_id` in a single
transaction (P10 atomicity). A mid-sequence failure leaves no orphaned page row and no
dangling pointer.

Throttle label: `doc-page-create`.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | 1–255 chars |
| `slug` | string | no | Optional. URL slug (`[a-z0-9-]` only, 1–255 chars when provided). When omitted or blank, auto-derived from the title: lowercased, non-alphanumeric runs replaced with a single hyphen, leading/trailing hyphens stripped; falls back to `"page"` when no alphanumeric characters remain. Collision-safe: a numeric suffix (`-2`, `-3`, …) is appended when the derived path already exists in this scope (checked inside the transaction). Explicit slugs are validated and return `409` on collision. |
| `body` | string | yes | Markdown content (may be empty) |
| `summary` | string | no | Edit summary for revision #1 |
| `parentPath` | string | no | Full path of the parent page |
| `parentId` | string (UUID) | no | UUID of the parent page (alternative to `parentPath`) |

**Response:** `201` with `{ page: DocWriteResultShape }`.

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Invalid explicit slug or title; or parent specified but does not exist |
| 401 | No active session |
| 403 | Actor does not have moderator or admin role |
| 409 | Explicit slug collision — a page with the same full path already exists in this scope (auto-derived slugs avoid this via numeric suffixing) |
| 429 | Rate limit exceeded |

### POST /api/docs/:id/revisions — append a revision to an existing page

Appends a new revision, bumps `revision_number`, and updates `current_revision_id`,
`title`, and `updated_at` in a single transaction.

Throttle label: `doc-page-edit`.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | 1–255 chars |
| `body` | string | yes | Full Markdown body for this revision |
| `summary` | string | no | Edit summary |

**Response:** `201` with `{ page: DocWriteResultShape }`.

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Invalid title |
| 401 | No active session |
| 403 | Actor does not have moderator or admin role |
| 404 | Page not found or deleted (oracle parity — same message as read 404) |
| 429 | Rate limit exceeded |

### PATCH /api/docs/:id — rename a page (slug and/or title)

Renames a page's slug and/or title within the same parent. At least one of `slug` or
`title` must be provided.

- **Slug change:** the page's `path` and `path_hash`, plus every descendant's `path` and
  `path_hash`, are rewritten in a single transaction (atomic subtree path rewrite).
- **Title-only change:** no `path` or `path_hash` values are touched.
- **Cross-parent move / reparent** is **not** implemented and is deferred to a future
  milestone.

Throttle label: `doc-page-edit`.

**Request body (`RenameDocPageInput`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | one of slug/title required | New URL slug (1–255 chars, `[a-z0-9-]` only) |
| `title` | string | one of slug/title required | New page title (1–255 chars) |

**Response:** `200` with `{ page: DocWriteResultShape }`.

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Invalid slug or title; or neither `slug` nor `title` provided |
| 401 | No active session |
| 403 | Actor does not have moderator or admin role |
| 404 | Page not found or deleted (oracle parity) |
| 409 | New path collides with an existing page in this scope |
| 429 | Rate limit exceeded |

### DELETE /api/docs/:id — soft-delete a page

Soft-deletes a page by setting its `status` to `'deleted'`. Revision rows are preserved.
The page disappears from all public reads immediately (oracle parity: deleted === nonexistent).

The entire operation (page lookup, foreign-lock check, child count check, and status
update) runs inside a single database transaction. This ensures that a concurrent acquire
cannot race past the lock check between the read and the write.

- **Foreign-lock guard:** a `409 ConflictException` is thrown when the page is actively
  locked by a different non-expired holder. The response uses `error.details` with
  `lockedByUserId` and `lockExpiresAt` (same shape as the POST lock 409 — see above).
  Staff-role actors (admin/moderator) are never blocked by a foreign lock.
- **Children guard:** a `409 ConflictException` is thrown when the page has any children
  with `status='published'`. Children must be deleted or moved before the parent can be
  deleted.
- **Revisions:** all existing revision rows are retained; only `status` is updated.

Throttle label: `doc-page-edit`.

**Response:** `204 No Content` on success.

**Error responses:**

| Status | Condition |
|---|---|
| 401 | No active session |
| 403 | Actor does not have moderator or admin role |
| 404 | Page not found or already deleted |
| 409 | Page is actively locked by a different non-expired holder; or page has non-deleted children |
| 429 | Rate limit exceeded |

### DocWriteResultShape (write response)

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | Page UUID |
| `title` | string | |
| `path` | string | Derived full slash-joined path |
| `depth` | number | 0 = root |
| `parentId` | `string \| null` | |
| `currentRevisionId` | `string \| null` | Points to the latest revision |
| `revisionNumber` | number | Revision number of the newly created revision |
| `createdAt` | Date | |
| `updatedAt` | Date | |

### Slug and title validation

`validateSlug` enforces: non-empty string, 1–255 chars, pattern `[a-z0-9-]` only.
Called only when the caller supplies an explicit slug on create or rename; auto-derived slugs bypass this validator.
`validateTitle` enforces: non-empty string, 1–255 chars.
Both throw `400 BadRequestException` on failure.

### Parent resolution

`resolveParent` is the shared helper used by `createPage` when a `parentId` or
`parentPath` is provided. Both branches filter `status='published'`, so soft-deleted
pages are rejected as invalid parents — a `400 BadRequestException` is thrown with
`"Parent page does not exist."` when the resolved parent is absent or deleted.

### Module wiring

`DocsModule.register(environment)` imports `AuthModule.register(environment)` and
`ThrottleModule.register(environment)` in addition to the `AuthorizationModule` already
present from ST-2. This wires session resolution and rate limiting into the module
without requiring changes to the app-level module imports.

## Revision history, diff, and rollback

### Overview

Three read endpoints and one write endpoint expose the full revision lifecycle. The three
read endpoints (`history`, `revisions/:revisionNumber`, `diff`) are unauthenticated — oracle
parity applies: a non-readable, deleted, or nonexistent page returns the same `404` with
`PAGE_NOT_FOUND_MESSAGE` as all other read paths. The write endpoint (`rollback`) is
staff-gated by `assertDocWriteAccess` (moderator or admin; `user`-role → `403`).

### GET /api/docs/:id/history — ordered revision metadata

Returns ordered metadata for all revisions of a wiki page.

- Revisions are ordered by `revision_number ASC`.
- Oracle parity (P12): a non-readable, deleted, or nonexistent page returns `404` with
  `PAGE_NOT_FOUND_MESSAGE`. No authentication required.

**Response shape** (`{ history: DocsHistoryShape }`):

`DocsHistoryShape.revisions` is an array of `DocsRevisionMetaShape`:

| Field | Type | Notes |
|---|---|---|
| `revisionNumber` | number | 1-based revision counter |
| `author` | `DocsAuthorShape \| null` | Original author of this revision |
| `editorUsername` | `string \| null` | Actor who saved this revision; `null` if same as author |
| `summary` | `string \| null` | Edit summary text |
| `createdAt` | Date | Revision creation timestamp |

**Error responses:**

| Status | Condition |
|---|---|
| 404 | Page not found, deleted, or not publicly accessible (oracle parity) |

### GET /api/docs/:id/revisions/:revisionNumber — single revision body

Returns the full body of a specific revision.

- `revisionNumber` must be a positive integer (1-based); invalid values return `400`.
- Oracle parity (P12): page not found/deleted/non-readable, or a missing revision number, all
  return `404` with `PAGE_NOT_FOUND_MESSAGE`. No authentication required.

**Response shape** (`{ revision: DocsSingleRevisionShape }`):

| Field | Type | Notes |
|---|---|---|
| `revisionNumber` | number | |
| `title` | string | Page title at the time of this revision |
| `body` | string | Full Markdown body |
| `summary` | `string \| null` | Edit summary |
| `author` | `DocsAuthorShape \| null` | |
| `editorUsername` | `string \| null` | |
| `createdAt` | Date | |

**Error responses:**

| Status | Condition |
|---|---|
| 400 | `revisionNumber` is not a positive integer |
| 404 | Page or revision not found (oracle parity) |

### GET /api/docs/:id/diff?from=&to= — deterministic line-level diff

Returns a server-computed, deterministic line-level diff between two revisions.

- Both `from` and `to` query parameters are required and must be positive integers.
- `from` and `to` must be different revision numbers; equal values return `400`.
- **DoS size guard:** before allocating the O(m×n) LCS table, each revision body is
  checked against two hard limits (constants exported from `docs.types.ts`):
  - `DOCS_DIFF_MAX_BODY_BYTES` = 512,000 bytes (512 KB) per revision body
    (checked with `Buffer.byteLength`, UTF-8 encoded).
  - `DOCS_DIFF_MAX_LINES` = 5,000 lines per revision body (after `body.split("\n")`).
  Either limit exceeded returns `400 BadRequestException` with a message naming the
  violated limit. The guard fires on this unauthenticated public endpoint because the
  LCS diff is O(m×n) in both time and memory.
- The diff is computed server-side using the LCS (longest common subsequence) algorithm
  in `DocsService.computeLineDiff(fromLines, toLines)`. This is a `static` method so tests
  can pin its output against fixed inputs deterministically (P3).
- Lines are split on `"\n"`; empty trailing lines from the split are included
  (consistent trailing-newline handling).
- Oracle parity (P12): page not found/deleted/non-readable, or a missing revision, returns
  `404` with `PAGE_NOT_FOUND_MESSAGE`. No authentication required.

**Response shape** (`{ diff: DocsDiffShape }`):

| Field | Type | Notes |
|---|---|---|
| `fromRevisionNumber` | number | The `from` revision number |
| `toRevisionNumber` | number | The `to` revision number |
| `hunks` | `DocsDiffHunk[]` | Ordered diff hunks |

`DocsDiffHunk` fields:

| Field | Type | Notes |
|---|---|---|
| `type` | `"unchanged" \| "added" \| "removed"` | Hunk classification |
| `lines` | `string[]` | Text lines in this hunk (no trailing newline per line) |

Adjacent lines of the same type are merged into a single hunk.

**Error responses:**

| Status | Condition |
|---|---|
| 400 | `from` or `to` missing, not a positive integer, or `from === to`; or either revision body exceeds `DOCS_DIFF_MAX_BODY_BYTES` (512 KB) or `DOCS_DIFF_MAX_LINES` (5,000 lines) |
| 404 | Page or either revision not found (oracle parity) |

### POST /api/docs/:id/rollback — non-destructive rollback

Creates a new highest-numbered revision whose content equals the target revision, then
updates `current_revision_id`. The target and all intermediate revisions are preserved
(non-destructive, AC3).

- Requires an active session (`401` without one) and moderator or admin role
  (`403` for `user`-role via `assertDocWriteAccess`).
- The rollback is transactional (P10): the new revision insert and the `current_revision_id`
  pointer update are written inside a single `manager.transaction`. A failure leaves no
  dangling pointer.
- The new revision is assigned `summary = "Rolled back to revision N"`.
- Throttle label: `doc-page-edit`.

**Request body (`DocRollbackInput`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| `revisionNumber` | number | yes | Positive integer; revision to roll back to |

**Response:** `201` with `{ page: DocWriteResultShape }` reflecting the new rollback revision.

**Error responses:**

| Status | Condition |
|---|---|
| 400 | `revisionNumber` is not a positive integer |
| 401 | No active session |
| 403 | Actor does not have moderator or admin role |
| 404 | Page not found or deleted; or target revision not found |
| 429 | Rate limit exceeded |

## Soft locking

### Overview

The soft-lock subsystem allows a staff member (moderator or admin) to acquire an exclusive
editing lock on a wiki page for a configurable TTL. The lock is advisory: it blocks other
non-staff users from write paths when a non-expired foreign lock exists, but it does not
prevent reads.

### Lock lifecycle

- **Acquire** (`POST /api/docs/:id/lock`): sets the lock on the page for the actor. If the
  actor already holds the lock, the expiry is refreshed (same TTL from now).
- **Release** (`DELETE /api/docs/:id/lock`): clears the lock fields. Idempotent — no error
  when the page is already unlocked or the lock has expired.
- **Expiry:** when `lockExpiresAt <= now` the lock is treated as free; expired lock fields
  are not cleaned up until the next acquire or release. No background job is needed.

### POST /api/docs/:id/lock — acquire or refresh the soft lock

Acquires or refreshes the soft lock on a wiki page.

Authorization: moderator or admin only (`assertDocWriteAccess` with `scopeType='site'`).

Throttle label: `doc-page-edit`.

**Response:** `200` with `{ pageId, lock: DocsLockState }` containing the new lock state.

`DocsLockResultShape` fields:

| Field | Type | Notes |
|---|---|---|
| `pageId` | string (UUID) | |
| `lock` | `DocsLockState` | New lock state immediately after acquire/refresh |

**Error responses:**

| Status | Condition |
|---|---|
| 401 | No active session |
| 403 | Actor does not have moderator or admin role |
| 404 | Page not found or deleted |
| 409 | Page locked by a different non-expired holder (response body includes holder metadata — see below) |
| 429 | Rate limit exceeded |

**409 conflict body:** when a non-expired foreign lock blocks acquisition, the response
uses the standard error envelope with `DocsLockConflictInfo` under `error.details`:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "This page is currently locked by another user.",
    "statusCode": 409,
    "details": {
      "lockedByUserId": "<holder-user-uuid>",
      "lockExpiresAt": "<ISO 8601 timestamp>"
    }
  },
  "request": { ... }
}
```

| Field | Type | Notes |
|---|---|---|
| `error.details.lockedByUserId` | string (UUID) | UUID of the current lock holder |
| `error.details.lockExpiresAt` | Date (ISO 8601) | Expiry time of the current lock |

**Staff override:** actors with admin or moderator role can always acquire or release any
lock, even a non-expired foreign lock.

### DELETE /api/docs/:id/lock — release the soft lock

Releases the soft lock on a wiki page.

Authorization: moderator or admin only (`assertDocWriteAccess`). Additionally, a non-holder,
non-staff actor receives `403` (see below).

Throttle label: `doc-page-edit`.

**Response:** `204 No Content` on success. Idempotent when the page is not locked or the
lock has expired.

**Error responses:**

| Status | Condition |
|---|---|
| 401 | No active session |
| 403 | Actor does not have moderator or admin role; or actor is not the lock holder and does not have staff role |
| 404 | Page not found or deleted |
| 429 | Rate limit exceeded |

### Lock checks on write paths

`DocsService.assertNotForeignLocked(page, actorUserId, actorGlobalRole)` is called inside
the transaction of every mutating operation:

- `addRevision` (edit)
- `renamePage` (rename)
- `softDeletePage` (delete)
- `rollbackPage` (rollback)

When an active foreign lock exists, each of these paths throws `409 ConflictException`
with `DocsLockConflictInfo` holder metadata surfaced under `error.details` (same envelope
shape as the POST lock 409 — see above).

An **expired lock** (lockExpiresAt ≤ now) is treated as free: `assertNotForeignLocked`
returns without error and the write proceeds. Actors with admin or moderator role are never
blocked by a foreign lock (staff override).

### DocsLockState (read response field)

Every `GET /api/docs/*path` response includes `lock: DocsLockState` in the `DocsPageShape`:

| Field | Type | Notes |
|---|---|---|
| `isLocked` | boolean | `true` only when an active, non-expired lock exists |
| `lockedByUserId` | `string \| null` | UUID of the lock holder; `null` when not locked |
| `lockedAt` | `Date \| null` | Time the lock was last acquired/refreshed; `null` when not locked |
| `lockExpiresAt` | `Date \| null` | Expiry time; `null` when not locked |

When the lock has expired, `isLocked` is `false` and all other fields are `null`.

### Lock TTL configuration

The TTL is read from `DOCS_LOCK_TTL_MINUTES` (see [launch.md](../operations/launch.md)).
The resolved value is injected as `DocsConfig.lockTtlMinutes` via the `DOCS_CONFIG` token in
`DocsModule`. The TTL is applied as milliseconds (`lockTtlMinutes × 60 × 1000`) when writing
`lockExpiresAt`.

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
| `DOCS_DIFF_MAX_BODY_BYTES` | `512000` (512 KB) | Max revision body size (UTF-8 bytes) accepted by the diff endpoint; exceeded → 400 |
| `DOCS_DIFF_MAX_LINES` | `5000` | Max revision body line count accepted by the diff endpoint; exceeded → 400 |
| `DOCS_LOCK_TTL_MINUTES_DEFAULT` | `30` | Default soft-lock TTL when `DOCS_LOCK_TTL_MINUTES` env var is absent or invalid |

## Web surface

The public web surface for the Documents wiki lives in `apps/web/app/docs/`.

### Routes

| Route | Access | Component |
|---|---|---|
| `/docs` | public | `DocsIndexPage` (`apps/web/app/docs/page.tsx`) |
| `/docs/<path>` | public (catch-all) | `DocsPageView` (`apps/web/app/docs/[...path]/page.tsx`) |
| `/docs/new` | staff-gated | `DocsNewPage` (`apps/web/app/docs/new/page.tsx`) |
| `/docs/edit/<path>` | staff-gated | `DocsEditPage` (`apps/web/app/docs/edit/[...path]/page.tsx`) |
| `/docs/history/<path>` | public (catch-all) | `DocsHistoryPage` (`apps/web/app/docs/history/[...path]/page.tsx`) |

The edit and history routes use a leading static segment before the catch-all
(`/docs/edit/<path>` and `/docs/history/<path>`). App Router forbids a static segment
after a catch-all, so the prefix must come before the path catch-all.

### DocsIndexPage (`/docs`)

Fetches the site root page tree via `getDocPageTree()` and displays a flat list of pages
with links to `/docs/<path>`. Anonymous and non-staff visitors see a read-only list.
Staff (moderator/admin — via `hasGlobalRole(session.user, "moderator")`) see a
"Create page" affordance linking to `/docs/new`.
Loading and error states are handled in-page; an empty tree renders a "No pages have been
published yet." message.

### DocsPageView (`/docs/<path>`)

Resolves the full slash-joined path from the Next.js catch-all parameter (`params.path`),
fetches the page via `getDocPageByPath(fullPath)`, and renders:

- A breadcrumb trail (`<nav aria-label="Breadcrumb">`) ordered root → immediate parent →
  current page, using `page.breadcrumbs` from the API response.
- The current revision body via the shared `MarkdownRenderer` component.
- A lock indicator banner when `page.lock.isLocked` is `true` and `lockExpiresAt` is in
  the future (visible to all visitors).

Staff (moderator/admin) see Edit, "Acquire lock", and History affordances as a
client-side defense-in-depth gate. Edit and "Acquire lock" link to `/docs/edit/<path>`;
History links to `/docs/history/<path>`. The API is the real enforcement boundary.

**Not-found state:** when `getDocPageByPath` returns `null` (a `404` from the API), the
page renders "Document not found." without distinguishing existence from visibility
(oracle parity — mirrors the API's P12 contract).

### DocsNewPage (`/docs/new`) — ST-8

`apps/web/app/docs/new/page.tsx`

Creates a new wiki page. Client-side gate requires a session with `moderator` or `admin`
global role — unauthenticated visitors are redirected to login; non-staff see an access
denied message. The server (`assertDocWriteAccess`) is the authoritative gate; the client
check is defense-in-depth only.

- Accepts an optional `?parentPath=` query parameter so the new page can be placed under
  an existing node.
- Slug field is optional; when left blank the server derives it from the title.
- Uses the shared `MarkdownEditor` component for the body field.
- On success, navigates to the newly created page at `/docs/<path>`.

### DocsEditPage (`/docs/edit/<path>`) — ST-8

`apps/web/app/docs/edit/[...path]/page.tsx`

Edits an existing wiki page. Same client-side staff gate as `DocsNewPage`.

On load, the page is fetched by path and the form fields (title, slug, body, summary) are
seeded from the current revision. The editor uses the shared `MarkdownEditor` component.

**Rename:** if the title or slug changed from the loaded values, a PATCH
(`renameDocPage`) is sent before the revision is saved. Changing the slug rewrites the
page URL and all descendant paths.

**Save:** adds a new revision via `addDocRevision` (POST `/api/docs/:id/revisions`). After
a successful save — and after any preceding rename — the editor re-fetches the full page
via `getDocPageByPath` (GET `/api/docs/<path>`), so `lock`, `breadcrumbs`, and
`currentRevision` are always populated from the authoritative read endpoint. The write
endpoints return only the lightweight `DocWriteResultShape`, which does not include those
fields.

**Lock UX:**

- A "Acquire lock" / "Release lock" button is always visible on the edit form.
- When the lock is held by the current user a "Lock held" indicator is shown.
- A lock indicator banner appears when the page is actively locked by someone else
  (read from `page.lock.{isLocked, lockExpiresAt}`).
- A 409 conflict from either lock-acquire or save surfaces a banner showing the holder
  user ID and expiry time (read from `error.details.{lockedByUserId, lockExpiresAt}` per
  the API contract).
- The Save button is disabled while a foreign active lock is detected on the loaded page.
  The server still enforces the lock — a forced save attempt returns 409.

### DocsHistoryPage (`/docs/history/<path>`) — ST-9

`apps/web/app/docs/history/[...path]/page.tsx`

Revision history, side-by-side diff, and rollback for a wiki page.

On load, the page resolves the full path to its page ID via `getDocPageByPath`, then
fetches the full revision history via `getDocHistory`. Revision metadata includes author
or editor display name, edit summary, and timestamp.

**Not-found state:** when `getDocPageByPath` returns `null`, the page renders
"Document not found." without distinguishing existence from visibility (oracle parity).

**Side-by-side diff:** above the history list a "Compare Revisions" panel lets the user
pick a "From (older)" and "To (newer)" revision via dropdowns. The diff is fetched via
`getDocDiff` and rendered as a side-by-side table with line numbers; hunks are coloured
by type (added, removed, unchanged). When two or more revisions are present, the page
pre-selects the two most recent. When both selectors resolve to the same revision number,
the diff is still fetched and the API returns an appropriate response.

**Diff size cap:** when the server returns `400` because a revision body exceeds
`DOCS_DIFF_MAX_BODY_BYTES` (512 KB) or `DOCS_DIFF_MAX_LINES` (5,000 lines), the UI
shows a friendly "too large to compare" message rather than crashing.

**Rollback affordance (staff only):** each revision row shows a "Roll back" button for
moderators and admins (tested via `hasGlobalRole(session.user, "moderator")`). Clicking
it calls `rollbackDocPage`, which posts to `POST /api/docs/:id/rollback`. Rollback is
non-destructive: the server creates a new highest-numbered revision and preserves all
existing revisions. After a successful rollback the page is re-fetched via
`getDocPageByPath` (GET `/api/docs/<path>`) to repopulate the full `DocsPageShape`
(including `lock`, `breadcrumbs`, and `currentRevision`), then the history list is
reloaded and the diff selectors are updated to show the rolled-back result. Non-staff users see the history and
diff but no rollback button. The server is the authoritative authorization boundary;
client gating is defense-in-depth only.

### docs-client.ts

`apps/web/app/docs/docs-client.ts` provides public read helpers and staff write helpers.

**Read helpers (no session required):**

| Function | API endpoint | Notes |
|---|---|---|
| `getDocPageTree(parentPath?)` | `GET /api/docs` or `GET /api/docs?parentPath=` | Returns `DocsTreeItem[] \| null`; null on 404 |
| `getDocPageByPath(path)` | `GET /api/docs/<path>` | Returns `DocsPageShape \| null`; null on 404 |
| `getRecentDocEdits(limit?)` | `GET /api/docs/recent` | Returns `DocsRecentEditShape[]`; never null |
| `getDocHistory(pageId)` | `GET /api/docs/:id/history` | Returns `DocsRevisionMetaShape[] \| null`; null on 404 |
| `getDocRevision(pageId, revisionNumber)` | `GET /api/docs/:id/revisions/:revisionNumber` | Returns `DocsSingleRevisionShape \| null`; null on 404 |
| `getDocDiff(pageId, from, to)` | `GET /api/docs/:id/diff?from=&to=` | Returns `DocsDiffShape \| null`; null on 404; throws on 400 (size cap) with a friendly message |

All six use the shared error-envelope read pattern (`payload.error.message` →
`payload.message` → fallback string).

**Write helpers (moderator/admin session required):**

| Function | API endpoint | Notes |
|---|---|---|
| `createDocPage(input)` | `POST /api/docs` | Throws on 403 (not staff) or 409 (path collision) |
| `addDocRevision(pageId, input)` | `POST /api/docs/:id/revisions` | Returns `DocWriteResultShape`; throws `LockConflictError` on 409 with holder details |
| `renameDocPage(pageId, input)` | `PATCH /api/docs/:id` | Returns `DocWriteResultShape`; throws on 403, 409 |
| `acquireDocLock(pageId)` | `POST /api/docs/:id/lock` | Throws `LockConflictError` on 409 with holder details |
| `releaseDocLock(pageId)` | `DELETE /api/docs/:id/lock` | Throws on 403 |
| `rollbackDocPage(pageId, revisionNumber)` | `POST /api/docs/:id/rollback` | Returns `DocWriteResultShape`; throws on 403, 404, 409 |

**Lock-conflict error handling:** `acquireDocLock` and `addDocRevision` parse a `409`
response and throw a `LockConflictError` (an `Error` with `lockConflict:
LockConflictDetails` attached). Callers test with `isLockConflictError(err)` to surface
`err.lockConflict.{lockedByUserId, lockExpiresAt}` in the UI.

## Route ordering note

`GET /api/docs/recent`, the ST-5 routes (`GET /:id/history`,
`GET /:id/revisions/:revisionNumber`, `GET /:id/diff`, `POST /:id/rollback`), and the
ST-6 lock routes (`POST /:id/lock`, `DELETE /:id/lock`) are all registered **before**
`GET /api/docs/*path` in `DocsController`. This ordering is required: literal and
parameterised routes must be declared before the `*path` catch-all so NestJS resolves
them correctly rather than treating their path segments as wiki paths.
