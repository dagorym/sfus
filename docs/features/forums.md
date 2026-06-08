# Forums

Forum categories and boards — admin management and public read API. Topics, posts, and moderation are covered in later subtasks (ST4–ST6).

**Code:** `apps/api/src/forums/`
**Related:** [authorization](authorization.md) for the admin gate · [development/api-conventions](../development/api-conventions.md) for the error envelope

## Overview

The forums subsystem organises discussion into a two-level hierarchy:

- **Category** — a named group with an ordered list of boards.
- **Board** — a named discussion area within a category, with scope, visibility, and optional project association.

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

## Planned extensions

The following surfaces are not yet implemented and are not documented here:

- **ST4–ST6** — Topics, posts, and moderation.
