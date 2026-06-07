# Standalone Pages

Versioned, admin-managed site pages (About, Rules, Contact, …) with revision history and
restore, published at both `/pages/:slug` and top-level `/:slug`.

**Code:** `apps/api/src/pages/`, `apps/web/app/pages/` (incl. `pages-client.ts`),
`apps/web/app/[slug]/page.tsx`, `apps/web/app/admin/pages/`
**Related:** [media](media.md) for sanitizer + featured media · [navigation](navigation.md)
mirrors the reserved-slug list · [guides/content-management](../guides/content-management.md)

Scope boundary: no block-builder UI, wiki hierarchy, or document namespaces — that is
Milestone 5 scope (see `docs/deferred-tasks.md`).

## API routes

All under `/api/pages`. Admin routes require the `sfus_session` cookie + `admin` global role
(`401`/`403`) via `PagesService.assertAdminManagementAccess()`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/pages/:slug` | — | `{ page: PageDetail }`; `404` unless `status = "published"` (the only public-visibility condition — `publishedAt` is informational) |
| GET | `/api/pages/admin/pages` | admin | all pages, all statuses |
| GET | `/api/pages/admin/pages/:id` | admin | by UUID; `404` unknown |
| POST | `/api/pages/admin/pages` | admin | `201`. Body `{ title, slug, body, summary?, changeNote?, featuredMediaId? }`; creates the page in `draft` + revision 1 |
| PATCH | `/api/pages/admin/pages/:id` | admin | partial update; **every update appends a new revision** |
| POST | `/api/pages/admin/pages/:id/publish` | admin | `status = published`, `publishedAt = now` |
| POST | `/api/pages/admin/pages/:id/unpublish` | admin | `status = unpublished` (kept distinct from `draft` — unlike blog posts) |
| GET | `/api/pages/admin/pages/:id/revisions` | admin | `{ revisions: RevisionDetail[] }`, revision number ascending |
| POST | `/api/pages/admin/pages/:id/restore/:revisionId` | admin | appends a new revision copying the source's title/body/summary/featuredMediaId with `changeNote = "Restored from revision <N>"`; never overwrites history |

## Status lifecycle

```
draft ──publish──▶ published ──unpublish──▶ unpublished ──publish──▶ published
```

`unpublish` sets the literal status `"unpublished"` (it does not return the page to draft).
The public route filters on `status = "published"` only.

## Revision contract

- Revision 1 is recorded at create with the initial title/body/summary/changeNote/
  featuredMediaId.
- Every update appends a revision (`revisionNumber` = current max + 1) and points
  `currentRevisionId` at it; `editorUserId` is set to the acting user on update and restore.
- `summary` and `featuredMediaId` returned on `PageDetail` come from the **current revision**.
- The create write sequence (insert page → insert revision 1 → set `currentRevisionId`) runs
  in a single DB transaction; a mid-create failure rolls back everything, so no orphaned rows
  and the slug is immediately reusable.
- When an update omits `body`, the current revision's body is reused (fetched by id) and
  passes through `normalizeMarkdownBody` only — no re-validation of already-stored content.
  Supplied bodies go through the full normalize → validate → `400`-on-unsafe pipeline
  (see [media](media.md)).

## Slug rules

- Format: `^[a-z0-9]+(?:-[a-z0-9]+)*$`; unique (`uq_standalone_pages_slug`); `400` on violation.
- **Reserved slugs** (`RESERVED_PAGE_SLUGS`, exported from `pages.service.ts`) are always
  rejected with `400`: `admin, api, app, blog, login, pages, register, onboarding, profile,
  settings, health`. They collide with Next.js routes or protected surfaces. The web catch-all
  route mirrors this list as defence-in-depth and short-circuits to not-found without calling
  the API.

## Response shapes

- `PageDetail`: `id, title, slug, body, status, publishedAt, currentRevisionId,
  createdByUserId, createdAt, updatedAt, summary, featuredMediaId`.
- `RevisionDetail`: `id, pageId, authorUserId, editorUserId, title, body, summary,
  changeNote, featuredMediaId, revisionNumber, createdAt`.

## Web surfaces

- `/:slug` — top-level catch-all (`apps/web/app/[slug]/page.tsx`). Evaluated after all static
  segments, so it never shadows real routes. Reserved slugs → not-found without an API call.
  Renders title, optional featured image (`GET /api/media/:featuredMediaId`), and body via
  `MarkdownRenderer`; "not published" message when the API returns nothing.
- `/pages/:slug` — secondary public view; same rendering, no reserved-slug short-circuit
  (delegates to the API).
- `/admin/pages`, `/admin/pages/new`, `/admin/pages/:id/edit` — admin management
  (client-gated via `resolveProtectedSession()` + `hasGlobalRole(user, "admin")`; API
  enforces). The editor includes Title/Slug/Summary/Featured Image/Body/Change Note plus a
  Revision History panel with inline Preview and Restore; the change-note field clears after
  each save.

`pages-client.ts` is the typed client: `getPublishedPage` (no credentials) plus
`adminListAllPages`, `adminGetPage`, `adminCreatePage`, `adminUpdatePage`, `adminPublishPage`,
`adminUnpublishPage`, `adminListRevisions`, `adminRestoreRevision` (all
`credentials: "include"`). Error extraction follows the shared envelope order (see
[api-conventions](../development/api-conventions.md)).
