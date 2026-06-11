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
| `topicCount` | number | Count of non-deleted topics in the board. |
| `postCount` | number | Count of non-deleted topics (opening posts) plus non-deleted replies. |
| `lastPost` | `BoardLastPostShape \| null` | Most-recent activity across the board's topics; `null` when the board has no topics. |
| `createdAt` | Date | |
| `updatedAt` | Date | |

Stripped from the public shape (internal-only): `scopeType`, `projectId`, `categoryId`.

`BoardLastPostShape` — the most-recent-activity stub embedded in `lastPost`:

| Field | Type | Notes |
|---|---|---|
| `at` | string (ISO-8601) | Timestamp of the latest activity. For a real reply (`isReply=true` in the primitive), this is the reply's `createdAt`. For an opening-post fallback (`isReply=false`), this is the topic's `createdAt`. |
| `author` | `{ username: string; displayName: string \| null }` | Author of that activity post. |

**Aggregate stats semantics (ST3):**

- `topicCount` counts non-deleted topics (`deletedAt IS NULL`) in the board. Soft-deleted topics are excluded.
- `postCount` equals `topicCount` (one opening post per topic) plus the count of non-deleted replies (`deletedAt IS NULL`). Soft-deleted replies are excluded.
- `lastPost` is resolved via the ST2 `resolveTopicLastActivity` primitive: for each topic, the latest non-deleted reply's author and timestamp are used when a reply exists; otherwise the opening-post author and `createdAt` are used as a fallback. The board-level `lastPost` is the entry with the most-recent effective timestamp across all of the board's non-deleted topics. Returns `null` when the board has no topics.
- Boards with `scopeType != 'site'` (project-scoped) and boards whose visibility is not publicly readable are excluded from all counts — they are invisible to both listing and aggregate queries.

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
| GET | `/api/forums/recent` | None | 200 | `{ topics: RecentTopicShape[] }` ordered most-recently-active first. Returns a stable empty list when no public activity exists. |

## Recent topics feed (CO5)

### `GET /api/forums/recent`

No authentication required. Returns the most-recently-active publicly-visible topics across the site, for use by the landing-page activity feed.

**Web client consumer (CO6):** `listRecentTopics(opts?)` in `apps/web/app/forums/forums-client.ts` wraps this endpoint. `RecentTopicItem` and `RecentTopicBoardStub` are the corresponding client-side types. `apps/web/components/recent-forum-activity.tsx` (`RecentForumActivity`) is the landing-page display component that calls `listRecentTopics({ limit: 5 })` and renders the result.

**Query parameters:**

| Parameter | Default | Constraints | Notes |
|---|---|---|---|
| `limit` | `5` | 1–20; hard-capped at 20 | Maximum number of topics to return. Non-numeric or non-finite values (e.g. `abc`, empty string, `NaN`, `Infinity`) coerce to the default (5) and never produce an error. |

**Sort order:** `lastPostAt DESC` then `createdAt DESC`. MySQL places NULL values last natively under DESC ordering; no `NULLS LAST` literal is used (it is a PostgreSQL extension that causes a MySQL 1064 parse error).

Only non-deleted topics (`deletedAt IS NULL`) from site-scoped, publicly-readable boards are returned.

**Response (200):** `{ topics: RecentTopicShape[] }`

#### `RecentTopicShape`

Public-safe minimal shape. All internal-only fields are stripped: `authorUserId`, `boardId` FK, `isLocked`, `isPinned`, `movedByUserId`, `movedAt`, `lockedByUserId`, `lockedAt`, `deletedAt`, `body`, `replyCount`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `title` | string | |
| `slug` | string | |
| `board` | `RecentTopicBoardStub` | Board name and slug only (no `id`, `categoryId`, `visibility`, etc.) |
| `author` | `PublicAuthorShape` | `username` and `displayName` only |
| `lastPostAt` | `Date \| null` | `null` for topics with no replies |
| `createdAt` | Date | |

`RecentTopicBoardStub` — `{ name: string; slug: string }`.

#### Visibility filtering and oracle safety (P12)

- All publicly-readable boards are determined by fetching all boards and filtering through `isBoardPubliclyReadable`, which routes every visibility decision through `AuthorizationService.evaluate()` with an anonymous actor. No inline re-derived predicate.
- Topics in non-publicly-readable boards (`members`, `private`) and project-scoped boards are excluded.
- When no publicly-readable boards exist, the service returns `[]` immediately **without** issuing a topic query. Callers receive a uniform empty list — they cannot infer the existence of any excluded boards or topics from the response (oracle parity, P12).
- **Defense-in-depth:** the topic query additionally carries a `boardId IN (...)` predicate derived from the same public-board allow-list. This supplements the allow-list filter; both gates must pass for a topic to be returned.

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
| `author` | `PublicAuthorShape` | `username` and `displayName` only; opening-post author |
| `lastPostAuthor` | `PublicAuthorShape \| null` | Author of the most recent non-deleted reply; `null` when the topic has no non-deleted replies (i.e. `replyCount === 0` or all replies are soft-deleted). Resolved in a single batched query per page — no N+1 lookup. |
| `createdAt` | Date | |
| `updatedAt` | Date | |

`TopicLastActivity` — a per-topic descriptor produced by the primitive below.

| Field | Type | Notes |
|---|---|---|
| `author` | `PublicAuthorShape` | Reply author when `isReply` is true; opening-post author when `isReply` is false |
| `at` | `Date \| null` | `createdAt` of the latest non-deleted reply when `isReply` is true; `null` when the fallback is the opening post |
| `isReply` | boolean | `true` when the last activity is a real non-deleted reply; `false` when the activity falls back to the opening post |

`resolveTopicLastActivity` (primitive) — accepts a list of topic IDs and an `openingAuthors` map (topicId → `PublicAuthorShape`) and returns `Map<topicId, TopicLastActivity | null>`. Issues a single grouped SQL query (no window functions) to find the latest non-deleted post per topic, joined to the `users` table. When no non-deleted reply exists for a topic, falls back to the matching entry in `openingAuthors` and sets `isReply: false`. Returns `null` only when neither a reply nor an opening-author entry is available. Intended for direct consumption by ST3 board-level aggregation, which needs the `isReply` flag to distinguish a real reply from an opening-post fallback.

`resolveTopicLastActivityAuthors` (wrapper) — accepts the same arguments and delegates to `resolveTopicLastActivity`, then maps each result to `PublicAuthorShape | null`: `isReply: true` entries yield the reply author; `isReply: false` (opening-post fallback) entries yield `null`. This is the ST2 contract for `listTopics`: `lastPostAuthor` is `null` whenever the topic has no non-deleted replies, regardless of the opening post. ST3 should call `resolveTopicLastActivity` directly to obtain the full descriptor including the fallback author and `isReply` flag.

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
| POST | `/api/forums/admin/categories` | 201 / 400 | `{ category }`. Body: `{ name, slug, description?, sortOrder? }`. `400` empty name/slug, invalid slug format, name > 128 chars, or description > 512 chars. |
| PATCH | `/api/forums/admin/categories/:id` | 200 / 400 / 404 | Partial update. Same field validation as create; only supplied fields are validated (omitted `description` is not checked). |
| DELETE | `/api/forums/admin/categories/:id` | 204 / 400 / 404 | `400` if the category still has boards (must delete or move boards first). |
| PUT | `/api/forums/admin/categories/reorder` | 200 / 400 | Body: `{ orderedIds: string[] }`. All existing category ids must be present; position in the array becomes `sortOrder` (0-indexed). `400` on count or id mismatch. Returns `{ categories }` in new order. |

### Board management

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/api/forums/admin/categories/:categoryId/boards` | 200 / 404 | `{ boards }` ordered by `sortOrder ASC`; `404` unknown categoryId. |
| GET | `/api/forums/admin/boards/:id` | 200 / 404 | `{ board }`; `404` unknown id. |
| POST | `/api/forums/admin/boards` | 201 / 400 / 404 | `{ board }`. Body: `{ categoryId, name, slug, description?, sortOrder?, scopeType?, visibility?, projectId? }`. `400` invalid input, unrecognised scopeType/visibility, name > 128 chars, or description > 512 chars. `404` unknown categoryId. |
| PATCH | `/api/forums/admin/boards/:id` | 200 / 400 / 404 | Partial update. Same validation as create for supplied fields; omitted `description` is not validated. `404` board or (when categoryId is supplied) category not found. |
| DELETE | `/api/forums/admin/boards/:id` | 204 / 404 | `404` unknown id. |
| PUT | `/api/forums/admin/categories/:categoryId/boards/reorder` | 200 / 400 / 404 | Body: `{ orderedIds: string[] }`. All board ids in the category must be present; position becomes `sortOrder` (0-indexed). `400` on count or id mismatch. `404` unknown categoryId. Returns `{ boards }` in new order. |

## Reorder contract

Both `reorderCategories` and `reorderBoards` are fully deterministic:

- The caller supplies the complete ordered list of ids.
- The position of each id in the array (0-indexed) becomes that item's new `sortOrder`.
- If `orderedIds.length` does not equal the number of existing items, or if any id in `orderedIds` is not present in the existing set, the service throws `400` and no sortOrder values are changed.
- The response always returns all items in the new sortOrder order.

## Validation rules

- **name:** must be a non-empty string after trimming. Maximum length is **128 characters**; exceeding this returns `400` (`"Category name must be 128 characters or fewer."` / `"Board name must be 128 characters or fewer."`).
- **description:** optional. Maximum length is **512 characters**; exceeding this returns `400` (`"Description must be 512 characters or fewer."`). `null` and `undefined` are accepted and skip validation (partial updates never validate an omitted description).
- **slug:** must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` after trimming. Slugs are unique at the DB level (`uq_forum_categories_slug`, `uq_forum_boards_slug`); duplicate slugs produce a DB constraint error (not explicitly caught — callers see the raw error in development; production logs will surface it).
- **scopeType:** must be `site` or `project`. Invalid values return `400`.
- **visibility:** must be one of `public`, `unlisted`, `members`, `project-only`, `private`. Invalid values return `400`.
- **deleteCategory:** the category must have no boards. Returns `400` with a message directing the caller to delete or move boards first.

The length constants are exported from `forums.types.ts` as `FORUM_DESCRIPTION_MAX_LENGTH` (512) and `FORUM_NAME_MAX_LENGTH` (128). These limits are enforced by `ForumsService.assertFieldLengthValid()` before any DB write in `createCategory`, `updateCategory`, `createBoard`, and `updateBoard`.

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

Moderators and admins can pin, lock, and move topics through five `PATCH` endpoints under `/api/forums/moderation/topics/:topicId/...`. All endpoints enforce the same two-step gate, then perform the data operation.

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
- A move into a **non-publicly-readable board** (e.g. `members`, `private`) is rejected with `404`. (Site-scoped `unlisted` boards are publicly readable and are valid move targets.)
- A move into a **nonexistent board** returns `404` (oracle parity: indistinguishable from non-readable).
- A **malformed `destinationBoardId`** (missing, non-string, or empty string) returns `400 "destinationBoardId must be a non-empty string."` — never a 500.

The `404` message on a rejected destination uses `ForumsService.BOARD_NOT_FOUND_MESSAGE` — the same message as a truly nonexistent board — so callers cannot infer whether a given board id exists but is restricted.

After a successful move, `movedByUserId` and `movedAt` are recorded on the topic. If the topic is already on the requested destination board, the operation is a no-op (returns the current state, no audit update).

### `ModeratedTopicShape` response shape

All five moderation endpoints return `{ topic: ModeratedTopicShape }`. This shape is a moderation-enriched view of the topic, including state and audit columns not present in `PublicTopicShape`.

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

All five moderation endpoints have `@ApiOperation`, `@Api*Response` decorators documenting the full `400`/`401`/`403`/`404` contract. Controller JSDoc blocks on each handler document the security contract inline.

## Admin web management surface (CO9)

The admin forums management page at `/admin/forums` (`apps/web/app/admin/forums/page.tsx`) provides a full CRUD and reorder interface for forum categories and boards. It is a Next.js App Router client component that consumes the typed API client from `apps/web/app/admin/forums/forums-admin-client.ts` (CO8).

### Access control

On mount the page calls `resolveProtectedSession('/admin/forums')`. If no active session exists the user is redirected (via the resolved `redirectTo` path). After a session is resolved, `hasGlobalRole(session.user, 'admin')` is checked client-side; non-admin sessions see "Admin access required." and no data is fetched. The server enforces the same gate independently on every API call — client-side gating is for UX only.

### Initial load

`adminListCategories()` is called once on mount. It fetches `GET /api/forums/admin/categories` and returns all categories with their boards in `sortOrder ASC` order. The page renders each category as a card containing a board table.

### Category management

| Action | Trigger | Notes |
|---|---|---|
| Create | **New category** button | Requires name and slug (client validates before calling API). Optional description and sort order. Success message: "Category created." |
| Edit | **Edit** button on category card | Inline form pre-populated from current values. Success message: "Category updated." |
| Delete | **Delete** button on category card | Client checks `boardCount > 0` first and shows "Cannot delete this category because it still has boards." without calling the API. If the API returns a 400 matching `/board\|must be empty\|not empty/i`, the same friendly message is shown. Confirm dialog required. Success message: "Category deleted." |
| Reorder (up) | **↑** arrow on category card | Calls `adminReorderCategories` with the complete ordered id list after swapping the category one position earlier. Disabled at the top position. |
| Reorder (down) | **↓** arrow on category card | Calls `adminReorderCategories` after swapping the category one position later. Disabled at the last position. |

### Board management

Each category card renders a board table with Edit, Delete, and reorder arrows per row, plus an **+ Add board** button that expands an inline create form.

| Action | Trigger | Notes |
|---|---|---|
| Create | **+ Add board** button | Requires name and slug. Optional description, sort order, scopeType (`site`\|`project`), visibility (all five values), projectId. Success message: "Board created." |
| Edit | **Edit** button on board row | Inline form pre-populated from current values (all board fields). Success message: "Board updated." |
| Delete | **Delete** button on board row | Confirm dialog required. Success message: "Board deleted." |
| Reorder (up/down) | **↑** / **↓** arrows on board row | Calls `adminReorderBoards(categoryId, { orderedIds })` with siblings from the same category. |

### Error and success feedback

All API errors are caught and surfaced via `actionError` state rendered as a `<p className={styles.error}>`. All success confirmations are rendered as `<p className={styles.status}>`. Both states are cleared at the start of every action. No `dangerouslySetInnerHTML` is used — all user-supplied text renders as React text nodes. The page reuses `auth-shell.module.css` for layout (`panel`, `title`, `eyebrow`, `action`, `secondaryAction`, `error`, `status`).

### Security boundary note

All CRUD and reorder operations are enforced by the API's `assertAdminManagementAccess` gate (see [Authorization gate](#authorization-gate) above). The client-side role check at page load and the `boardCount > 0` pre-check are UX conveniences; the API returns `403` and `400` respectively if those checks are bypassed.

## Web Surfaces (ST16)

The forum web layer lives entirely in `apps/web/app/forums/` with supporting components in `apps/web/components/`. All pages are Next.js App Router client components.

### Route map

| Route | Access | Notes |
|---|---|---|
| `/forums` | public | Category/board index. Lists all site-scoped publicly-readable boards, grouped by category. Data from `GET /api/forums/categories` only. |
| `/forums/[boardSlug]` | public | Board view. Paginated topic list (20 per page). Pinned topics sort first; locked topics show a "Locked" badge. |
| `/forums/[boardSlug]/[topicSlug]` | public | Topic view. Paginated posts (20 per page, oldest-first), rendered via `MarkdownRenderer`. Reply form for authenticated members; locked-topic notice when locked. |
| `/forums/[boardSlug]/new-topic` | session | Create-topic form. Requires active session; guests are redirected to `/login?next=<path>`. |

Board and topic slugs are resolved by fetching the public category listing and matching on slug client-side. The board `id` (UUID) is used for all API calls.

### What each page renders

**Forum index (`page.tsx`)** — calls `listCategories()` (wraps `GET /api/forums/categories`). Renders categories as sections, each containing a semantic `<table>` of boards with four columns: Board (name linked to `/forums/<slug>`, optional description), Topics, Posts, and Last Post. Topics and Posts values come directly from `board.topicCount` and `board.postCount`; no client-side recomputation. Last Post shows the absolute date via `toLocaleDateString()` and a profile link (`displayName ?? username`, username `encodeURIComponent`-encoded) pointing to `/users/<username>`; "No posts yet" when `board.lastPost` is `null`. Non-site or non-public boards never appear (filtered by the API). Empty states: "Unable to load forum categories." (error), "Loading…", "No forum boards are available yet."

**Board view (`[boardSlug]/page.tsx`)** — resolves the board from the category listing, then calls `listTopics(boardId, { page, pageSize: 20 })`. Renders a paginated topic list. Each row shows pinned/locked badges, author, reply count, and last-post date. Authenticated members see a `+ New Topic` link; unauthenticated visitors see `Sign in to create a topic` linking to `/login?next=<board>/new-topic`.

**Topic view (`[boardSlug]/[topicSlug]/page.tsx`)** — resolves the board and topic, then calls `listPosts(topicId, { page, pageSize: 20 })`. Renders topic body and each post body through `MarkdownRenderer`. Provides a quote affordance (Quote button) and a reply form with `MentionAutocomplete` and `ImageUpload`. Moderator controls are shown to moderator/admin sessions (client-gated; API is the enforcement boundary).

**New-topic form (`[boardSlug]/new-topic/page.tsx`)** — calls `resolveProtectedSession()` on mount; redirects guests to `/login?next=<form path>`. Renders a title input, a `MentionAutocomplete` textarea for the body, an optional MarkdownEditor preview toggle, and an `ImageUpload` widget. Submits to `POST /api/forums/boards/:boardId/topics`.

### Sanitized-Markdown render contract

All user-authored content (topic bodies and post bodies) renders exclusively through `MarkdownRenderer`. Raw HTML is never injected via `dangerouslySetInnerHTML`. The `MarkdownRenderer` component:

- strips all raw HTML tags (`<...>`),
- rejects `javascript:`, `data:`, and any non-http(s)/relative URL scheme (sanitizeUrl),
- rejects URLs containing `"`, `'`, `<`, or `>` to prevent HTML attribute breakout (sanitizeUrl XSS hardening — `&` is allowed as a legal query-parameter delimiter),
- renders `@username` text as HTML-escaped plain text — it does **not** auto-linkify inline `@mentions` (inline mention auto-linking is deferred to M10).

The API also validates body content server-side before persistence (`validateMarkdownBody`), providing defense in depth. The web layer's `MarkdownRenderer` is an additional client-side safety layer applied on display.

### @mention autocomplete and author bylines

The `MentionAutocomplete` component (`apps/web/components/mention-autocomplete.tsx`) wraps a textarea and watches for `@` followed by a valid username prefix (`[a-zA-Z0-9_-]{0,30}`). When triggered:

1. A debounced call is made to `GET /api/users/suggest?q=<prefix>` (the ST14 session-gated suggest endpoint; see [auth.md § User discovery API](auth.md#user-discovery-api-st14)).
2. A dropdown lists matching active users with username and optional displayName.
3. Selecting a suggestion inserts `@username ` (plain text, not HTML) at the cursor.
4. Arrow keys, Enter/Tab, and Escape provide keyboard accessibility.

`@username` text inserted into a post or topic body is stored as plain Markdown and rendered by `MarkdownRenderer` as HTML-escaped plain text. `MarkdownRenderer` does **not** auto-linkify inline `@username` mentions — inline mention linking is deferred to M10.

**Author bylines** (below each post and in the topic header) link the author's username to `/users/<encodeURIComponent(username)>` using a JSX `<Link>` component. This is the only place where a username appears as a clickable link to the public profile page. No server-side mention resolution is performed; the `/users/<username>` profile page is owned by ST17.

Autocomplete calls the suggest endpoint only; it never performs a full user listing or leaks fields beyond `username`, `displayName`, and `avatarUrl`. If the session is missing or the endpoint is unavailable, the dropdown degrades gracefully (no suggestions shown, typing continues normally).

### Quote affordance

Each rendered post has a **Quote** button. Clicking it:

1. Prefixes the quoted post body (each line prepended with `> `) into the reply textarea.
2. Sets `quotedPost` state so the reply form shows the original post for reference.
3. When the reply is submitted, `quotedPostId` is passed to `POST /api/forums/topics/:topicId/posts`.

A quoted post within the same loaded page is resolved from the already-fetched post list and rendered via `MarkdownRenderer`. If the quoted post is on a different page or has been deleted, the block shows "(Referenced post is not available on this page.)" — no additional fetch is made.

### Locked-topic UX

When `topic.isLocked` is true:

- The reply form is completely hidden.
- A `<p role="status">` notice is shown: "This topic is locked. No new replies can be posted."
- The `Sign in to reply` affordance is also hidden (no point directing guests to sign in).
- The `isLocked` field is **not** returned by the API in `PublicTopicShape` (it is stripped server-side; see topic response shapes above). The web client derives initial lock state as `topic.isLocked ?? false`; after a moderator performs a lock/unlock action the component merges the `isLocked` value from the resulting `ModeratedTopicShape` into local state.

The API enforces the lock at the post-create endpoint (`POST /api/forums/topics/:topicId/posts` returns `403` for locked topics). The web layer hides the form for UX only.

### Guest sign-in affordance

Pages that require a session provide a visible sign-in link that preserves the current path as `?next=`:

- Board view: `Sign in to create a topic` → `/login?next=<board>/new-topic`
- Topic view: `Sign in to reply` → `/login?next=<topic path>`
- New-topic form: `resolveProtectedSession()` redirects guests directly to `/login?next=<form path>`

The `?next=` parameter value is always URL-encoded. The login page validates the `next` parameter (must start with `/`, not `//` — open-redirect guard).

### Moderator-only controls (client-gated)

When the session user has global role `moderator` or `admin` (`hasGlobalRole(session.user, "moderator")`), the topic view renders a moderation bar with:

- **Pin / Unpin** — calls `PATCH /api/forums/moderation/topics/:topicId/pin` or `/unpin`.
- **Lock / Unlock** — calls `PATCH /api/forums/moderation/topics/:topicId/lock` or `/unlock`.
- **Move…** — expands a form to enter a destination board UUID, then calls `PATCH /api/forums/moderation/topics/:topicId/move`.

The moderation bar is absent for regular member sessions and for unauthenticated visitors. **The ST6 API endpoints are the real enforcement boundary** — these buttons call the ST6 moderation API, which independently enforces `401`/`403` on every request. Client-side gating is for UX only.

See [Moderation (ST6)](#moderation-st6) for the full server-side contract and `ModeratedTopicShape` definition.

### @username mention and autocomplete

See the subsection above ("@mention autocomplete and author bylines") for the full contract. The suggest endpoint is documented in [auth.md § User discovery API](auth.md#user-discovery-api-st14).
