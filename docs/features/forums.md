# Forums

Forum categories, boards, topics, and posts — admin management (ST2), public read (ST3), member topic creation (ST4), member post creation with threaded replies (ST5), moderator/admin moderation controls (ST6), and throttle + link-limit enforcement on member create routes (ST9).

**Code:** `apps/api/src/forums/`
**Related:** [authorization](authorization.md) for the admin gate · [development/api-conventions](../development/api-conventions.md) for the error envelope

## Overview

The forums subsystem organises discussion into a three-level hierarchy:

- **Category** — a named group with an ordered list of boards.
- **Board** — a named discussion area within a category, with scope, visibility, and optional project association.
- **Topic** — a discussion thread within a board, authored by a member. Created via an authenticated POST; listed via a public paginated GET.

All admin management endpoints are under `/api/forums/admin/...` and require an active session with the global `admin` role.

## Authorization gate

Every admin endpoint calls, in order:

1. `AuthService.resolveSession()` — resolves the `sfus_session` cookie to an active session. Throws `401` when no valid session exists.
2. `ForumsService.assertAdminManagementAccess(actorGlobalRole)` — calls `AuthorizationService.hasGlobalRole(role, "admin")`. Throws `403` when the session role is insufficient.

Both checks happen before any data operation. A non-admin authenticated user gets a `403`, not a data error.

## Board scoping and visibility model

### scopeType

| Value | Meaning |
|---|---|
| `site` | Standard site-wide board (default). Active in M4. |
| `project` | Project-scoped board. Persisted as forward-scaffolding for M7/M8; no project data is associated yet. |

`scopeType` defaults to `site` when omitted on create.

### visibility

| Value | Meaning |
|---|---|
| `public` | Visible to all visitors (default). |
| `unlisted` | Accessible by direct URL but not listed. |
| `members` | Visible to any authenticated member. |
| `project-only` | Visible only to project members (meaningful at M7/M8). |
| `private` | Visible only to admins. |

`visibility` defaults to `public` when omitted on create.

Both `scopeType` and `visibility` are validated on create and update; any value outside the allowed vocabulary returns `400`.

### projectId

`projectId` is a nullable string stored without a foreign-key constraint. This is intentional forward-scaffolding: the projects table does not exist in M4. When projects land (M7/M8), add `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE` to the board table. Until then, `projectId` is stored as-is and has no referential integrity.

## Public read API routes

Two unauthenticated endpoints expose forum structure to anonymous visitors. No session or auth header is required.

### Leak-prevention contract

- The index returns **only** boards with `scopeType='site'` **and** a visibility that passes `AuthorizationService.evaluate()` for an anonymous actor (no userId, empty role string).
- Project-scoped boards and boards whose visibility is not publicly readable are excluded from both the board list **and** any board counts — they are invisible to the index.
- `GET /forums/boards/:id` returns `404` for both nonexistent boards and boards that exist but are hidden (wrong scope or non-public visibility). **The error message is identical in both cases** (`ForumsService.BOARD_NOT_FOUND_MESSAGE`) so callers cannot infer existence (oracle parity, P12).
- Every visibility decision is routed through `AuthorizationService.evaluate()` — no inline re-derived predicates.

### Response shapes (public)

`PublicBoardShape` — fields returned per board from both public routes:

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `name` | string | |
| `slug` | string | |
| `description` | `string \| null` | |
| `sortOrder` | number | |
| `visibility` | `ForumBoardVisibility` | |
| `createdAt` | Date | |
| `updatedAt` | Date | |

Stripped from the public shape (internal-only): `scopeType`, `projectId`, `categoryId`.

`PublicCategoryShape` — fields returned per category from `GET /forums/categories`:

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `name` | string | |
| `slug` | string | |
| `description` | `string \| null` | |
| `sortOrder` | number | |
| `boards` | `PublicBoardShape[]` | Publicly-readable site boards only. |
| `createdAt` | Date | |
| `updatedAt` | Date | |

### Routes

| Method | Path | Auth | Status | Notes |
|---|---|---|---|---|
| GET | `/api/forums/categories` | None | 200 | `{ categories }` ordered by `sortOrder ASC`. Each category includes only site-scoped, publicly-readable boards. |
| GET | `/api/forums/boards/:id` | None | 200 / 404 | `{ board }` as `PublicBoardShape`. `404` for both nonexistent and non-publicly-accessible boards (identical message). |
| GET | `/api/forums/boards/:boardId/topics` | None | 200 / 404 | `PaginatedTopicsShape`. `404` for both nonexistent and non-publicly-accessible boards (identical message). |
| POST | `/api/forums/boards/:boardId/topics` | Session cookie | 201 / 400 / 401 / 404 / 429 | `{ topic }` as `PublicTopicShape`. Requires active session (401). Board must be publicly readable (404). Body must pass Markdown safety validation (400). Link cap exceeded returns 400. Rate limit exceeded returns 429 (new-account tier active). |
| GET | `/api/forums/topics/:topicId/posts` | None | 200 / 404 | `PaginatedPostsShape`. `404` when board or topic is nonexistent, hidden, or soft-deleted (identical message). |
| POST | `/api/forums/topics/:topicId/posts` | Session cookie | 201 / 400 / 401 / 403 / 404 / 429 | `{ post }` as `PublicPostShape`. Requires active session (401). Board+topic must be publicly readable and topic non-deleted (404). Locked topic returns 403. Unsafe Markdown or invalid `parentId` returns 400. Link cap exceeded returns 400. Rate limit exceeded returns 429 (new-account tier active). |

## Topic routes (ST4)

### Member-authenticated topic creation

`POST /api/forums/boards/:boardId/topics`

Requires an active session cookie (`sfus_session`). The controller resolves the session first and throws `401` before any service call if the session is missing or invalid.

**Request body:**

```json
{ "title": "string", "body": "string (Markdown)" }
```

**Validation and security order (all happen before persistence):**

1. `AuthService.resolveSession()` — throws `401` if no active session.
2. `exceedsLinkLimit(body, maxLinksPerPost)` — rejects bodies containing more links than the configured cap with `400` (see [api-conventions](../development/api-conventions.md#per-post-link-limit)).
3. `ThrottleService.checkRequest()` — enforces per-user rate limit. Supplies `userCreatedAt` (fetched via `UsersService.findById`) so the new-account tier is active; new accounts are subject to stricter limits during `THROTTLE_NEW_ACCOUNT_WINDOW_MS`. Over-limit requests return `429` (see [api-conventions](../development/api-conventions.md#rate-limiting-and-anti-spam)).
4. Board lookup + visibility gate — nonexistent or non-publicly-readable board returns `404` with `ForumsService.TOPIC_NOT_FOUND_MESSAGE` (oracle parity, P12).
5. Title type guard — missing or non-string `title` returns `400`. Title content validation — empty or too-long title returns `400`.
6. Body type guard — missing or non-string `body` returns `400`. `normalizeMarkdownBody(body)` — normalizes whitespace/structure.
7. `validateMarkdownBody(normalizedBody)` — rejects unsafe content (e.g. `<script>`, `javascript:` links) with `400` **before any DB write**.

**Response (201):** `{ topic: PublicTopicShape }`

**Error contract:**

| Status | Condition |
|---|---|
| 400 | Missing or non-string title or body, empty title, title too long, unsafe Markdown in body, or body exceeds link cap |
| 401 | No active session |
| 404 | Board not found or not publicly readable (identical message in both cases) |
| 429 | Rate limit exceeded (per-user; new-account tier stricter for recently created accounts) |

### Public paginated topic list

`GET /api/forums/boards/:boardId/topics`

No authentication required. Returns topics for any board that passes the same public visibility predicate as the board read routes.

**Query parameters:**

| Parameter | Default | Constraints | Notes |
|---|---|---|---|
| `page` | `1` | ≥ 1; clamped to 1 | 1-indexed page number |
| `pageSize` | `20` | 1–100; clamped to 100 | Number of topics per page |

**Sort order (deterministic):**

1. `isPinned DESC` — pinned topics always appear first.
2. `lastPostAt DESC` — most recently active topics next (nulls sort last).
3. `createdAt DESC` — tie-break by creation time.

Only non-deleted topics (`deletedAt IS NULL`) are returned.

**Response (200):** `PaginatedTopicsShape`

```typescript
{
  topics: PublicTopicShape[];
  total: number;   // total matching topic count (for stable pagination)
  page: number;    // resolved page (after clamping)
  pageSize: number; // resolved pageSize (after clamping)
}
```

**Error contract:**

| Status | Condition |
|---|---|
| 404 | Board not found or not publicly readable (identical message in both cases) |

### Topic response shapes

`PublicAuthorShape` — author sub-object embedded in every topic response. Internal fields (`id`, `email`, `globalRole`, `status`) are stripped.

| Field | Type | Notes |
|---|---|---|
| `username` | string | |
| `displayName` | `string \| null` | |

`PublicTopicShape` — fields returned per topic. Internal-only fields are stripped: `authorUserId` (FK), `boardId` (implicit from URL), `isLocked`, `movedByUserId`, `movedAt`, `lockedByUserId`, `lockedAt`, `deletedAt`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `title` | string | |
| `slug` | string | Derived from title at create time |
| `body` | string | Normalized Markdown |
| `isPinned` | boolean | |
| `replyCount` | number | Count of non-deleted replies |
| `lastPostAt` | `Date \| null` | Set on first reply; null for topics with no replies |
| `author` | `PublicAuthorShape` | `username` and `displayName` only |
| `createdAt` | Date | |
| `updatedAt` | Date | |

### Oracle parity for topic routes (P12)

Both topic routes use `ForumsService.TOPIC_NOT_FOUND_MESSAGE` (`"Forum topic not found."`) for `404` responses regardless of whether the board is nonexistent or exists but is not publicly readable. The error message is **identical in both cases** so callers cannot infer board existence from topic-route error messages. This mirrors the same pattern on board routes (`ForumsService.BOARD_NOT_FOUND_MESSAGE`).

### Markdown safety contract

Topic body content is processed in two steps before any DB write:

1. **`normalizeMarkdownBody`** — trims and normalizes whitespace.
2. **`validateMarkdownBody`** — rejects content containing unsafe constructs (raw HTML script tags, `javascript:` protocol links, and other XSS vectors). Returns `{ safe: boolean, reason?: string }`. A `safe: false` result throws `BadRequestException(400)` immediately; the topic is never persisted.

## Admin API routes

All under `/api/forums`. All admin routes require `401`/`403` gate as described above.

### Category management

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/api/forums/admin/categories` | 200 | `{ categories }` ordered by `sortOrder ASC`. Each category includes its boards. |
| GET | `/api/forums/admin/categories/:id` | 200 / 404 | `{ category }` with boards; `404` unknown id. |
| POST | `/api/forums/admin/categories` | 201 / 400 | `{ category }`. Body: `{ name, slug, description?, sortOrder? }`. `400` empty name/slug or invalid slug format. |
| PATCH | `/api/forums/admin/categories/:id` | 200 / 400 / 404 | Partial update. Same field validation as create. |
| DELETE | `/api/forums/admin/categories/:id` | 204 / 400 / 404 | `400` if the category still has boards (must delete or move boards first). |
| PUT | `/api/forums/admin/categories/reorder` | 200 / 400 | Body: `{ orderedIds: string[] }`. All existing category ids must be present; position in the array becomes `sortOrder` (0-indexed). `400` on count or id mismatch. Returns `{ categories }` in new order. |

### Board management

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/api/forums/admin/categories/:categoryId/boards` | 200 / 404 | `{ boards }` ordered by `sortOrder ASC`; `404` unknown categoryId. |
| GET | `/api/forums/admin/boards/:id` | 200 / 404 | `{ board }`; `404` unknown id. |
| POST | `/api/forums/admin/boards` | 201 / 400 / 404 | `{ board }`. Body: `{ categoryId, name, slug, description?, sortOrder?, scopeType?, visibility?, projectId? }`. `400` invalid input or unrecognised scopeType/visibility. `404` unknown categoryId. |
| PATCH | `/api/forums/admin/boards/:id` | 200 / 400 / 404 | Partial update. Same validation as create for supplied fields. `404` board or (when categoryId is supplied) category not found. |
| DELETE | `/api/forums/admin/boards/:id` | 204 / 404 | `404` unknown id. |
| PUT | `/api/forums/admin/categories/:categoryId/boards/reorder` | 200 / 400 / 404 | Body: `{ orderedIds: string[] }`. All board ids in the category must be present; position becomes `sortOrder` (0-indexed). `400` on count or id mismatch. `404` unknown categoryId. Returns `{ boards }` in new order. |

## Reorder contract

Both `reorderCategories` and `reorderBoards` are fully deterministic:

- The caller supplies the complete ordered list of ids.
- The position of each id in the array (0-indexed) becomes that item's new `sortOrder`.
- If `orderedIds.length` does not equal the number of existing items, or if any id in `orderedIds` is not present in the existing set, the service throws `400` and no sortOrder values are changed.
- The response always returns all items in the new sortOrder order.

## Validation rules

- **name:** must be a non-empty string after trimming.
- **slug:** must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` after trimming. Slugs are unique at the DB level (`uq_forum_categories_slug`, `uq_forum_boards_slug`); duplicate slugs produce a DB constraint error (not explicitly caught — callers see the raw error in development; production logs will surface it).
- **scopeType:** must be `site` or `project`. Invalid values return `400`.
- **visibility:** must be one of `public`, `unlisted`, `members`, `project-only`, `private`. Invalid values return `400`.
- **deleteCategory:** the category must have no boards. Returns `400` with a message directing the caller to delete or move boards first.

## Swagger / JSDoc

All 11 admin endpoints are annotated with `@ApiOperation`, `@Api*Response` decorators documenting the `401`/`403`/`400`/`404` contract. The controller file header and each handler JSDoc block document the full error contract inline.

## Post routes (ST5)

### Member-authenticated post creation

`POST /api/forums/topics/:topicId/posts`

Requires an active session cookie (`sfus_session`). The controller resolves the session first and throws `401` before any service call if the session is missing or invalid.

**Request body:**

```json
{ "body": "string (Markdown)", "parentId": "string (optional)", "quotedPostId": "string (optional)" }
```

**Validation and security order (all happen before persistence):**

1. `AuthService.resolveSession()` — throws `401` if no active session.
2. `exceedsLinkLimit(body, maxLinksPerPost)` — rejects bodies containing more links than the configured cap with `400` (see [api-conventions](../development/api-conventions.md#per-post-link-limit)).
3. `ThrottleService.checkRequest()` — enforces per-user rate limit. Supplies `userCreatedAt` (fetched via `UsersService.findById`) so the new-account tier is active; new accounts are subject to stricter limits during `THROTTLE_NEW_ACCOUNT_WINDOW_MS`. Over-limit requests return `429` (see [api-conventions](../development/api-conventions.md#rate-limiting-and-anti-spam)).
4. Board + topic lookup + visibility gate — the topic's board must exist and be publicly readable, and the topic must exist and be non-deleted. All failure cases return `404` with `ForumsService.TOPIC_NOT_FOUND_MESSAGE` (oracle parity, P12): nonexistent board, hidden board, nonexistent topic, soft-deleted topic.
5. Locked topic gate — if `topic.isLocked` is true, throws `403` with `"This topic is locked. New posts are not allowed."`.
6. Body type guard — missing or non-string `body` returns `400`.
7. `normalizeMarkdownBody(body)` — normalizes whitespace/structure.
8. `validateMarkdownBody(normalizedBody)` — rejects unsafe content (e.g. `<script>`, `javascript:` links) with `400` **before any DB write**.
9. `parentId` threading validation — if `parentId` is provided, it must reference a **top-level post** (`parentId IS NULL`) on the **same topic** (`topicId` matches), and must not be soft-deleted. Any violation (nonexistent, different topic, reply-to-a-reply) returns a uniform `400 "parentId is invalid."` with **no existence oracle** — callers cannot infer whether the parent exists in another topic.
10. `quotedPostId` — accepted as a soft-reference (no FK enforcement). Rendering is handled by the web layer (ST16).

After persistence, the topic's `replyCount` is incremented by 1 and `lastPostAt` is updated to the current time.

**Response (201):** `{ post: PublicPostShape }`

**Error contract:**

| Status | Condition |
|---|---|
| 400 | Missing or non-string body, unsafe Markdown in body, invalid `parentId` (uniform message, no existence oracle), or body exceeds link cap |
| 401 | No active session |
| 403 | Topic is locked (`"This topic is locked. New posts are not allowed."`) |
| 404 | Board or topic not found, board not publicly readable, or topic soft-deleted (identical message in all cases) |
| 429 | Rate limit exceeded (per-user; new-account tier stricter for recently created accounts) |

### Public paginated post list

`GET /api/forums/topics/:topicId/posts`

No authentication required. Returns posts for any topic whose board passes the same public visibility predicate as the board read routes, and whose topic is not soft-deleted.

**Query parameters:**

| Parameter | Default | Constraints | Notes |
|---|---|---|---|
| `page` | `1` | ≥ 1; clamped to 1 | 1-indexed page number |
| `pageSize` | `20` | 1–100; clamped to 100 | Number of posts per page |

**Sort order (deterministic, oldest-first):**

`createdAt ASC`, then `id ASC` as tie-break. This produces a flat oldest-first list consistent with the threading requirement.

Only non-deleted posts (`deletedAt IS NULL`) are returned.

**Response (200):** `PaginatedPostsShape`

```typescript
{
  posts: PublicPostShape[];
  total: number;   // total matching post count (for stable pagination)
  page: number;    // resolved page (after clamping)
  pageSize: number; // resolved pageSize (after clamping)
}
```

**Error contract:**

| Status | Condition |
|---|---|
| 404 | Board or topic not found, board not publicly readable, or topic soft-deleted (identical message in all cases) |

### Post response shapes

`PublicPostShape` — fields returned per post. Internal-only fields are stripped: `authorUserId` (FK), `topicId` (implicit from URL), `deletedAt`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `body` | string | Normalized Markdown |
| `parentId` | `string \| null` | `null` for top-level posts; id of the parent post for replies |
| `quotedPostId` | `string \| null` | Soft-reference to a quoted post; rendering handled by web layer (ST16) |
| `author` | `PublicAuthorShape` | `username` and `displayName` only (same shape as on topics) |
| `createdAt` | Date | |
| `updatedAt` | Date | |

### Oracle parity for post routes (P12)

All `404` responses on post routes use `ForumsService.TOPIC_NOT_FOUND_MESSAGE` (`"Forum topic not found."`), regardless of whether the board is nonexistent, the board is hidden, the topic is nonexistent, or the topic is soft-deleted. The error message is **identical in all cases** so callers cannot infer existence or visibility of boards or topics from post-route error messages. This mirrors the same pattern on board routes and topic routes.

### One-level threading constraint

`parentId` enforces a strict one-level threading model. A parent post must:
- exist and not be soft-deleted,
- belong to the **same topic** as the new post, and
- itself be a top-level post (`parentId IS NULL`).

Violations of any of these conditions produce the same `400 "parentId is invalid."` response. There is **no existence oracle**: callers cannot determine whether a given `parentId` exists in another topic by observing the error.

## Moderation (ST6)

Moderators and admins can pin, lock, and move topics through six `PATCH` endpoints under `/api/forums/moderation/topics/:topicId/...`. All endpoints enforce the same two-step gate, then perform the data operation.

### Authorization gate

Every moderation endpoint calls, in order:

1. `AuthService.resolveSession()` — resolves the `sfus_session` cookie. Throws `401` when no valid session exists.
2. `ForumsService.assertModerationAccess(actorGlobalRole)` — calls `AuthorizationService.hasGlobalRole(role, "moderator")`. Accepts both `moderator` and `admin` (the authorization service's `hasGlobalRole` check is hierarchy-aware). Throws `403` when the session role is insufficient.

Both checks happen before any data operation. An unauthenticated caller gets `401`; an authenticated non-moderator gets `403`.

This gate mirrors `BlogService.assertModerationAccess` — same semantics, no weaker check.

### Moderation endpoint routes

| Method | Path | Status | Notes |
|---|---|---|---|
| PATCH | `/api/forums/moderation/topics/:topicId/pin` | 200 / 401 / 403 / 404 | Pin the topic. Returns `{ topic: ModeratedTopicShape }` with `isPinned=true`. |
| PATCH | `/api/forums/moderation/topics/:topicId/unpin` | 200 / 401 / 403 / 404 | Unpin the topic. Returns `{ topic: ModeratedTopicShape }` with `isPinned=false`. |
| PATCH | `/api/forums/moderation/topics/:topicId/lock` | 200 / 401 / 403 / 404 | Lock the topic. Records `lockedByUserId` and `lockedAt`. Returns `{ topic: ModeratedTopicShape }`. |
| PATCH | `/api/forums/moderation/topics/:topicId/unlock` | 200 / 401 / 403 / 404 | Unlock the topic. Clears `lockedByUserId` and `lockedAt`. Returns `{ topic: ModeratedTopicShape }`. |
| PATCH | `/api/forums/moderation/topics/:topicId/move` | 200 / 400 / 401 / 403 / 404 | Move topic to a different board. Body: `{ destinationBoardId }`. Returns `{ topic: ModeratedTopicShape }`. |

All moderation routes return `404` with `ForumsService.TOPIC_NOT_FOUND_MESSAGE` for nonexistent or non-publicly-accessible topics (oracle parity, P12).

### Pin semantics

Pinning/unpinning persists `topic.isPinned`. The public topic list sort order (`isPinned DESC, lastPostAt DESC, createdAt DESC`) means pinned topics always appear first in `GET /api/forums/boards/:boardId/topics`. There are no `pinnedByUserId` or `pinnedAt` audit columns — only the final state is stored.

### Lock semantics

Locking persists `topic.isLocked`, `topic.lockedByUserId`, and `topic.lockedAt`. Unlocking sets `isLocked=false` and clears both audit columns to `null`.

A locked topic blocks new posts for non-privileged users. The existing `POST /api/forums/topics/:topicId/posts` endpoint (ST5 `createPost`) enforces this: it checks `topic.isLocked` before persistence and throws `403 "This topic is locked. New posts are not allowed."` for any non-privileged caller. Moderators and admins (who have already passed `assertModerationAccess`) are not blocked by this check in the sense that the moderation endpoints themselves do not go through `createPost`.

### Move contract and cross-scope leak prevention

`PATCH .../move` accepts `{ destinationBoardId: string }` in the request body.

The destination board is **re-validated through `AuthorizationService.evaluate()`** (via `isBoardPubliclyReadable`) before the move is persisted. This ensures:

- A move into a **project-scoped board** is rejected with `404`.
- A move into a **non-publicly-readable board** (e.g. `members`, `private`, `unlisted`) is rejected with `404`.
- A move into a **nonexistent board** returns `404` (oracle parity: indistinguishable from non-readable).
- A **malformed `destinationBoardId`** (missing, non-string, or empty string) returns `400 "destinationBoardId must be a non-empty string."` — never a 500.

The `404` message on a rejected destination uses `ForumsService.BOARD_NOT_FOUND_MESSAGE` — the same message as a truly nonexistent board — so callers cannot infer whether a given board id exists but is restricted.

After a successful move, `movedByUserId` and `movedAt` are recorded on the topic. If the topic is already on the requested destination board, the operation is a no-op (returns the current state, no audit update).

### `ModeratedTopicShape` response shape

All six moderation endpoints return `{ topic: ModeratedTopicShape }`. This shape is a moderation-enriched view of the topic, including state and audit columns not present in `PublicTopicShape`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `title` | string | |
| `slug` | string | |
| `isPinned` | boolean | |
| `isLocked` | boolean | |
| `boardId` | string (UUID) | Current board (updated after a move) |
| `lockedByUserId` | `string \| null` | Moderator who locked; null when unlocked |
| `lockedAt` | `Date \| null` | Lock timestamp; null when unlocked |
| `movedByUserId` | `string \| null` | Moderator who last moved the topic; null if never moved |
| `movedAt` | `Date \| null` | Move timestamp; null if never moved |
| `replyCount` | number | |
| `lastPostAt` | `Date \| null` | |
| `createdAt` | Date | |
| `updatedAt` | Date | |

Author details are not included in `ModeratedTopicShape` (moderation responses do not need them). This shape is returned only to callers who have passed `assertModerationAccess`.

### Swagger / JSDoc

All six moderation endpoints have `@ApiOperation`, `@Api*Response` decorators documenting the full `400`/`401`/`403`/`404` contract. Controller JSDoc blocks on each handler document the security contract inline.
