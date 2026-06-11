# Milestone 5 — Documents Wiki (Implementation Plan)

## Overview

Milestone 5 delivers the site-wide Documents/wiki system from the design document
(`star_frontiers_rpg_website_design.md` §5.5): a hierarchical, slug-pathed page tree with
breadcrumbs, per-edit revisions with a side-by-side diff and rollback, soft locking to
reduce edit collisions, and image embeds via the existing media pipeline. It is built on
the existing auth, authorization, media, and Markdown-editor foundations and ships
deployable as a standalone content system.

Per your direction, the wiki authoring experience lives in the **public `/docs` area** and
is built generically with a members-edit end state in mind, but for Milestone 5 every
write/create/edit/lock/rollback action is **gated to moderator/admin** through a single
scope-aware authorization seam (`assertDocWriteAccess`). Non-staff users get a read-only
`/docs` surface. The seam, plus `scope_type`/`scope_id` columns, are shaped so a future
**project** scope (Milestones 7/8) can plug in project-role rules and the project-creator's
owner-only-vs-members authoring choice — exactly the way Forums already prepared
project-scoped boards. No project docs are created or exposed in this milestone.

This plan also folds in four attached work streams you requested: the two optional Forums
last-activity cleanups from the forums-listing review, the admin-dashboard link for the new
content, and the final landing-page refresh from Milestone 4 to Milestone 5.

## Source of truth and references

- Design: `star_frontiers_rpg_website_design.md` §5.5 (Documents wiki), §7 schema
  (`docs_pages`, `docs_revisions`), §8 API (`/api/docs/*`), Appendix UX (breadcrumbs,
  side-by-side diff).
- Closest existing analog: the Pages feature
  (`apps/api/src/pages/entities/{standalone-page,page-revision}.entity.ts`,
  `pages.service.ts`) for the revision + current-revision + rollback pattern.
- Scope/visibility/authz pattern to mirror: Forums
  (`apps/api/src/forums/forums.service.ts` — `scope_type` site/project,
  `AuthorizationService.evaluate()` routing, project rows excluded from the public index).
- Conventions: `docs/development/api-conventions.md` (error envelope, migrations registry,
  throttle), `docs/development/testing.md` (validation matrix),
  `docs/development/agent-retrospective-patterns.md` (P1–P12 prevention).

## Resolved design decisions (confirmed with the user)

1. **Editor** — Wiki ships on the existing `MarkdownEditor` (write/preview). The deferred
   WYSIWYG adoption, per-user editor-mode preference, and unified media-library picker stay
   deferred to a later dedicated editor pass (re-deferral recorded in
   `docs/deferred-tasks.md`, 2026-06-10).
2. **Attachments** — Image embeds via the existing image-only media API only. Arbitrary
   file attachments remain Milestone 6 scope.
3. **Soft lock / watchers** — Functional soft lock (acquire-on-edit, TTL expiry, release,
   staff override). Per-page watchers/notifications are deferred to Milestone 10; Milestone 5
   leaves only a clean model/API extension point.
4. **Edit rights** — Public-area authoring UI, but write actions gated to moderator/admin
   for site-scoped docs via a scope-aware `assertDocWriteAccess` seam. The future runtime
   roles/permissions system that turns this into configurable role-based editing is recorded
   as the new **Milestone 5.5** register entry (after M5, before M6).

## Assumptions (repository-grounded, not user decisions)

- **Stored representation is Markdown only**, rendered through the existing shared
  `MarkdownRenderer` + `markdown-sanitizer` (same as Pages/Blog). The design's `body_html`
  column is satisfied by the render pipeline rather than a stored HTML column, to stay
  consistent with every existing content type. *(Bounded inference from the Pages pattern.)*
- **Full-path lookup uses a hash index.** `docs_pages.path` (materialized slash-joined path)
  can exceed the MySQL 5.7.44 utf8mb4 unique-index prefix limit, so uniqueness and the
  `GET /api/docs/*path` catch-all resolve through a `path_hash char(64)` column unique per
  `(scope_type, scope_id)`. *(Bounded inference from the locked MySQL 5.7.44 constraint.)*
- **Cross-parent move/reparent is out of scope** for Milestone 5 (create, content-edit,
  rename within the same parent with descendant path rewrite, soft-delete, lock, and
  rollback are in). Subtree reparenting is recorded as a deferred docs-enhancement item.
- **Plan-level artifact directory** is `artifacts/ms5-documents-wiki/`, with one
  subdirectory per subtask id.

## Subtasks

All subtask ids are stable. Security-marked subtasks carry the exact marker
`Security review: required` in both the subtask and its implementer prompt; the Coordinator
keys the specialist Security stage off that marker.

### ST-1 — Documents schema, entities, migration, and module registration
- **Goal:** Establish the data foundation and module skeleton for the wiki with no behavior
  yet exposed.
- **Scope:**
  - `DocsPageEntity` (`docs_pages`): `id char(36)` PK; `scope_type varchar(32)` default
    `site`; `scope_id char(36)` nullable; `title varchar(255)`; `slug varchar(255)`;
    `path varchar(1024)`; `path_hash char(64)`; `parent_id char(36)` nullable;
    `depth int unsigned` default 0; `visibility varchar(32)` default `public` (reuses the
    `resourceVisibilities` vocabulary for future project scope); `status varchar(32)`
    default `published` (`published`/`deleted` soft-delete); soft-lock columns
    `is_locked tinyint` default 0, `locked_by_user_id char(36)` nullable,
    `locked_at datetime(3)` nullable, `lock_expires_at datetime(3)` nullable;
    `current_revision_id char(36)` nullable; `created_by_user_id char(36)`;
    `created_at`/`updated_at datetime(3)`.
  - `DocsRevisionEntity` (`docs_revisions`): `id char(36)` PK; `page_id char(36)`;
    `author_user_id char(36)`; `editor_user_id char(36)` nullable; `title varchar(255)`;
    `body mediumtext`; `summary varchar(512)` nullable; `revision_number int unsigned`;
    `created_at datetime(3)`. Mirror `PageRevisionEntity` shape.
  - Migration `1781308800000-milestone-five-documents-foundation.ts`
    (`MilestoneFiveDocumentsFoundation1781308800000`) creating both tables with:
    unique `(scope_type, scope_id, path_hash)`; index `(parent_id)`;
    index `(scope_type, scope_id, status)`; unique `(page_id, revision_number)`;
    index `(page_id, created_at)`; FK `docs_revisions.page_id → docs_pages.id` CASCADE,
    `current_revision_id → docs_revisions.id` SET NULL (created without TypeORM duplicating
    it, per the Pages `createForeignKeyConstraints: false` pattern), author/editor/creator
    FKs to `users` (RESTRICT / SET NULL). All schema MySQL 5.7.44 + utf8mb4 compatible.
  - `docs.types.ts` (scope-type and status constants, lock constants).
  - `DocsModule` skeleton importing `TypeOrmModule.forFeature([...])` (no providers yet).
  - Register both entities in `database.config.ts` `reviewedEntityClasses`; import and add
    the migration to `reviewedMigrationClasses`; add the migration name to the
    `reviewedMigrationNames` expectation in `database.config.test.ts` (registry mirror — an
    implementer-owned bookkeeping update, not behavioral test authoring; prevents the
    forums-listing green-suite regression, P2/P7); wire `DocsModule.register(environment)`
    into `app.module.ts`.
- **Acceptance criteria:**
  1. Both entities compile and are registered in `reviewedEntityClasses`; the new migration
     is imported and present in `reviewedMigrationClasses`.
  2. `database.config.test.ts`'s `reviewedMigrationNames` expectation includes
     `MilestoneFiveDocumentsFoundation1781308800000`, and the full `@sfus/api` suite stays
     green.
  3. The migration creates both tables and all listed indexes/FKs, is MySQL 5.7.44 +
     utf8mb4 compatible, and is forward-only (no destructive down-path assumptions beyond
     the standard drop).
  4. `DocsModule` is registered in `app.module.ts` and the API boots and builds (`tsc`)
     with no new routes yet.
- **Dependencies:** none (first subtask).
- **Documentation Impact:** No feature-doc change yet; the new migration must be added to
  the "Current set" list in `docs/development/api-conventions.md` by the Documenter stage.

### ST-2 — Documents read API (path resolution, tree, breadcrumbs, recent feed)
- **Goal:** Expose read access to the wiki with leak-proof visibility.
- **Scope:** `DocsService` + `DocsController` (added to `DocsModule`). Endpoints:
  `GET /api/docs/*path` (catch-all: resolve a page by full path via `path_hash`, return the
  current revision body + breadcrumb ancestry); `GET /api/docs` (site root tree/index, or
  children of a `?parentPath=`); `GET /api/docs/recent?limit=` (recent publicly-readable
  site-scope, non-deleted document edits for the landing feed). All visibility decisions
  routed through `AuthorizationService.evaluate()` for the requesting actor (anonymous for
  public). Only `scope_type='site'`, `status='published'`, publicly-readable pages appear in
  unauthenticated reads; project-scoped pages are excluded from every site index (mirror
  `ForumsService` `isBoardPubliclyReadable`). Gated/nonexistent pages return an identical
  `404` (oracle parity, P12) — no 403 vs 404 distinction, uniform message.
- **Acceptance criteria:**
  1. `GET /api/docs/*path` resolves a published site page by full path and returns its
     current revision content plus an ordered breadcrumb ancestry array.
  2. A nonexistent path, a `deleted` page, and a non-publicly-readable page all return the
     same `404` class and message (oracle parity), asserted by operator-pinned predicate.
  3. `GET /api/docs` returns the site page tree/children with no project-scoped pages ever
     present.
  4. `GET /api/docs/recent` returns recent published site-doc edits (page title, path,
     editor, timestamp), excludes deleted/non-readable/project pages, and respects `limit`.
  5. Every read path routes visibility through `AuthorizationService.evaluate()` with no
     inline re-derived predicate.
- **Security review: required** (new publishable read paths; visibility + oracle parity,
  P12).
- **Dependencies:** ST-1.
- **Documentation Impact:** New `docs/features/documents.md` read-contract section + routing
  table row (`docs/README.md`) — Documenter stage.

### ST-3 — Documents write API (create, edit, authorization seam, validation)
- **Goal:** Staff-gated page creation and content editing with atomic page+revision writes.
- **Scope:** Extend `DocsService`/`DocsController`. Endpoints: `POST /api/docs` (create a
  page under an optional `parentPath`/`parentId`, derive `path`/`path_hash`/`depth`, create
  revision #1, set `current_revision_id`); `POST /api/docs/:id/revisions` (edit: append a new
  revision, bump `revision_number`, update `current_revision_id`, `title`, `updated_at`).
  Implement the scope-aware `assertDocWriteAccess(actor, page|scopeType)` seam: for
  `scope_type='site'` require moderator/admin (`AuthorizationService.hasGlobalRole`); the
  seam is structured (documented signature + a single call site per write path) so a future
  project scope can branch to project-role rules without touching call sites. Slug/path/title
  validation (slug charset, length caps, parent existence, no path-hash collision). Both
  multi-row writes (page + revision, or revision + page pointer update) wrapped in
  `repository.manager.transaction` (P10). Throttle: attach the existing `ThrottleGuard` to the
  write routes (consistency with other member-write endpoints; cheap and future-proofs member
  editing).
- **Acceptance criteria:**
  1. A moderator/admin can create a page (with and without a parent) and the response exposes
     the derived `path` and revision #1; a `user`-role and anonymous caller receive `403`
     from `assertDocWriteAccess`.
  2. A moderator/admin can edit a page, producing revision #2 with an incremented
     `revision_number` and an updated `current_revision_id`.
  3. Page creation and the edit pointer-update are transactional: an injected mid-sequence
     failure leaves no orphaned page row and no dangling `current_revision_id` (proven by a
     schema-enforced integration test, not a mock — P3/P10).
  4. Duplicate full path (same scope) is rejected deterministically; invalid slug/title and
     a missing parent are rejected with clear validation errors.
  5. `assertDocWriteAccess` is the single authorization gate for every write path, with no
     inline role check duplicated at call sites.
- **Security review: required** (write authorization seam; trust boundary).
- **Dependencies:** ST-1, ST-2.
- **Documentation Impact:** `docs/features/documents.md` write/authorization contract;
  cross-link the authorization gate from `docs/features/authorization.md` — Documenter stage.

### ST-4 — Documents tree management (rename with subtree path rewrite, soft-delete)
- **Goal:** Staff management of page identity and removal without breaking the tree.
- **Scope:** Extend `DocsService`/`DocsController`. `PATCH /api/docs/:id` (rename: change
  `slug` and/or `title` within the same parent; when the slug changes, recompute this page's
  `path`/`path_hash` and **transactionally rewrite every descendant's** `path`/`path_hash`);
  `DELETE /api/docs/:id` (soft-delete: set `status='deleted'`; blocked with a clear `409`
  when the page has any non-deleted children, so the tree is never orphaned). Both gated by
  `assertDocWriteAccess`. Cross-parent move/reparent is explicitly out of scope (deferred).
- **Acceptance criteria:**
  1. Renaming a page's slug rewrites its own and all descendants' `path`/`path_hash` in a
     single transaction; a mid-rewrite failure leaves all paths at their pre-rename values
     (schema-enforced proof, P10).
  2. Renaming only the title does not alter any `path`/`path_hash`.
  3. Soft-deleting a leaf page sets `status='deleted'` and removes it from all public reads
     (ST-2) while preserving its revisions.
  4. Soft-deleting a page that has non-deleted children is rejected with `409` and a clear
     message; no partial state results.
  5. All tree-management routes are gated by `assertDocWriteAccess` (staff-only for site
     scope).
- **Security review: required** (authorization + path-rewrite integrity / leak surface).
- **Dependencies:** ST-3.
- **Documentation Impact:** `docs/features/documents.md` management section (rename/delete
  rules, move deferral) — Documenter stage.

### ST-5 — Documents revision history, side-by-side diff, and rollback
- **Goal:** Deliver the design's "revision with diff and rollback".
- **Scope:** Extend `DocsService`/`DocsController`. `GET /api/docs/:id/history` (ordered
  revision metadata: number, author/editor, summary, timestamp — gated by the page's read
  visibility); `GET /api/docs/:id/revisions/:revisionNumber` (a single revision's body, read
  gated); `GET /api/docs/:id/diff?from=&to=` (server-computed deterministic line-level diff
  structure between two revisions — testable hunks, P3); `POST /api/docs/:id/rollback`
  `{ revisionNumber }` (creates a **new** revision whose content equals the target — never
  destructive — updates `current_revision_id`, gated by `assertDocWriteAccess`). History and
  revision/diff reads of a non-readable page return the same `404` as ST-2 (oracle parity).
- **Acceptance criteria:**
  1. `GET /api/docs/:id/history` returns revisions in deterministic order with author/editor,
     summary, and timestamp; history of a non-readable page returns `404` parity.
  2. `GET /api/docs/:id/diff` returns a deterministic line-level diff between two revisions
     (added/removed/unchanged hunks), asserted against fixed inputs.
  3. Rollback to an earlier revision creates a new highest-numbered revision equal in content
     to the target and updates `current_revision_id`; the target and intermediate revisions
     are preserved (non-destructive).
  4. Rollback is gated by `assertDocWriteAccess` (staff-only for site scope); a `user`-role
     caller receives `403`.
- **Security review: required** (rollback write + history/diff read visibility).
- **Dependencies:** ST-3 (uses ST-4 only if present; no hard dependency).
- **Documentation Impact:** `docs/features/documents.md` revisions/diff/rollback section —
  Documenter stage.

### ST-6 — Documents soft-lock (acquire, TTL expiry, release, staff override)
- **Goal:** Reduce edit collisions with an advisory soft lock and wire it into write paths.
- **Scope:** Extend `DocsService`/`DocsController`. `POST /api/docs/:id/lock` (acquire/refresh:
  set `is_locked`, `locked_by_user_id`, `locked_at`, `lock_expires_at = now +
  DOCS_LOCK_TTL_MINUTES`; if held by a different, non-expired holder return `409` with holder
  metadata; the same holder refreshes); `DELETE /api/docs/:id/lock` (release by the holder, or
  override by admin/moderator). Wire a lock check into the ST-3/ST-4/ST-5 write paths (edit,
  rename, delete, rollback): an active foreign lock blocks the write with `409` unless the
  actor is the lock holder or an admin override. Expired locks are treated as free. Add the
  `DOCS_LOCK_TTL_MINUTES` env var (validated in `apps/api/src/config/environment.ts`, sensible
  default, range-checked) and surface lock state on page read responses. Acquire/release are
  gated by `assertDocWriteAccess`.
- **Acceptance criteria:**
  1. A staff actor can acquire a lock; a second staff actor acquiring the same active lock
     receives `409` with holder metadata; the original holder can refresh.
  2. A lock past `lock_expires_at` is treated as free and can be acquired by anyone with write
     access.
  3. An active foreign lock blocks edit/rename/delete/rollback with `409`; the holder and an
     admin override succeed.
  4. The holder can release; an admin/moderator can override-release another's lock.
  5. `DOCS_LOCK_TTL_MINUTES` is validated at startup (fails fast when invalid) and documented;
     page reads expose current lock state.
- **Dependencies:** ST-3, ST-4, ST-5.
- **Documentation Impact:** `docs/features/documents.md` locking section; new env var row in
  `docs/operations/launch.md` — Documenter stage.

### ST-7 — Public docs browse and render surface (web)
- **Goal:** Read-only public wiki surface with the tree and breadcrumbs.
- **Scope:** New `apps/web/app/docs/page.tsx` (site index/tree), `apps/web/app/docs/[...path]/page.tsx`
  (catch-all page view with breadcrumbs), and a `docs-client.ts` API helper (reads through
  the shared error-envelope pattern, P7). Render the current revision via the shared
  `MarkdownRenderer`. Show edit/manage affordances only when the resolved session holds
  moderator/admin (read-only otherwise). App Router route files keep only allowed exports
  (P5); shared helpers live in sibling modules.
- **Acceptance criteria:**
  1. `/docs` renders the site page tree; `/docs/<path>` renders a page with a correct
     breadcrumb trail and sanitized Markdown.
  2. A non-staff/anonymous visitor sees no create/edit/lock affordances; a staff session
     sees them.
  3. A nonexistent/gated path renders the standard not-found experience (no existence
     oracle).
  4. The web production build (`next build`) and lint pass; route files export only allowed
     App Router fields.
- **Dependencies:** ST-2.
- **Documentation Impact:** Route-map + landing references in `docs/features/web-shell.md`;
  new routes noted in `docs/features/documents.md` — Documenter stage.

### ST-8 — Docs authoring surface (web, staff-gated, in the public area)
- **Goal:** Create/edit pages and manage the soft lock from the public `/docs` area, gated
  to staff, built so enabling member editing later is a gate change only.
- **Scope:** New-page and edit forms under `apps/web/app/docs/` (reusing the shared
  `MarkdownEditor`), wired to ST-3/ST-4/ST-6 endpoints; lock acquire/release UX with a lock
  indicator and holder/expiry messaging; client-side gating that hides authoring UI from
  non-staff (defense-in-depth only — the API is the real gate). Extends `docs-client.ts`.
- **Acceptance criteria:**
  1. A staff user can create a page (optionally under a parent) and edit an existing page,
     producing a new revision, entirely from `/docs`.
  2. Acquiring a lock shows a clear indicator; editing while another holds an active lock
     surfaces the `409` holder/expiry message; release works.
  3. A non-staff user cannot reach the authoring UI, and a forced API call still fails at the
     server gate (verified, not assumed).
  4. `next build` and lint pass; authoring components are generic enough that switching the
     server gate to members-edit needs no UI rewrite.
- **Dependencies:** ST-3, ST-6, ST-7.
- **Documentation Impact:** Authoring how-to additions in
  `docs/guides/content-management.md`; `docs/features/documents.md` UI notes — Documenter
  stage.

### ST-9 — Docs revision history, side-by-side diff, and rollback UI (web)
- **Goal:** Surface history/diff/rollback in the public `/docs` area.
- **Scope:** A history view listing revisions, a **side-by-side** diff view rendering the
  ST-5 diff structure, and a staff-gated rollback action. Extends `docs-client.ts` and the
  `/docs` route group.
- **Acceptance criteria:**
  1. The history view lists revisions with author/editor, summary, and timestamp for a
     readable page.
  2. The diff view renders the two selected revisions side by side using the server diff
     structure (added/removed/unchanged clearly distinguished).
  3. A staff user can roll back to a selected revision and sees the new current revision; a
     non-staff user has no rollback affordance and is blocked at the API.
  4. `next build` and lint pass.
- **Dependencies:** ST-5, ST-7.
- **Documentation Impact:** `docs/features/documents.md` history/diff UI; `content-management.md`
  rollback how-to — Documenter stage.

### ST-10 — Admin dashboard: Documents management link
- **Goal:** Give admins a dashboard entry point to the new content.
- **Scope:** Add a `Documents` entry to `adminSections` in `apps/web/app/admin/page.tsx`
  linking to `/docs` (where staff create/manage/lock/rollback inline), with a description
  consistent with the existing entries.
- **Acceptance criteria:**
  1. The admin dashboard shows a `Documents` card linking to `/docs` with an accurate
     description.
  2. `next build` and lint pass.
- **Dependencies:** ST-7.
- **Documentation Impact:** `docs/features/web-shell.md` admin route map; admin how-to in
  `docs/guides/content-management.md` — Documenter stage.

### ST-11 — Forums last-activity cleanup (optional review follow-ups)
- **Goal:** Resolve the two optional cleanups recorded in
  `artifacts/completed/forums-listing-enhancements-and-fixes/reviewer_result.json`.
- **Scope:** In `ForumsService.listPublicCategories`/`getBoard`, derive each board's
  `lastPost` reply timestamp from the latest **non-deleted** reply (consistent with the
  existing author resolution) rather than `topic.lastPostAt`, so a soft-deleted latest reply
  cannot leave a stale last-activity date; and resolve the always-null, unused
  `TopicLastActivity.at` field by either populating it with the resolved reply timestamp or
  removing the field and tightening its JSDoc. Pick the populate-or-remove option that keeps
  callers and types consistent, and apply it across every call site (P7).
- **Acceptance criteria:**
  1. Board `lastPost` activity reflects the latest non-deleted reply; a soft-deleted latest
     reply no longer drives the displayed last-activity date.
  2. `TopicLastActivity.at` is either consistently populated with the resolved timestamp or
     removed with its JSDoc tightened — no remaining always-null field — and no call site or
     type references a removed field.
  3. The full `@sfus/api` suite stays green.
- **Dependencies:** none — independent of the docs chain (touches only Forums files).
- **Documentation Impact:** Update `docs/features/forums.md` only if the documented
  last-activity behavior changes — Documenter stage.

### ST-12 — Landing page refresh to Milestone 5 (final)
- **Goal:** Surface the new wiki content and move the landing copy from Milestone 4 to
  Milestone 5, as done for prior milestones.
- **Scope:** Update `apps/web/app/page.tsx` (+ `page.module.css` as needed): rewrite hero,
  highlights, "What's new", "Explore the site", and "Current content scope" copy from
  Milestone 4 to Milestone 5; add a wiki highlight and a `/docs` explore link; add a
  **Recent document activity** surface (a new `RecentDocActivity` component mirroring
  `RecentForumActivity`, consuming `GET /api/docs/recent` from ST-2) in the "What's new"
  section. Keep route files free of non-allowlisted exports (P5).
- **Acceptance criteria:**
  1. The landing hero, highlights, what's-new, explore, and scope text describe Milestone 5
     (Documents wiki) instead of Milestone 4, with no stale "Milestone 4" labels remaining.
  2. A `/docs` explore link and a wiki highlight are present.
  3. `RecentDocActivity` renders recent published document edits from `GET /api/docs/recent`,
     with empty/loading/error states consistent with the existing recent-activity components.
  4. `next build` and lint pass.
- **Dependencies:** ST-2 (recent endpoint) and ST-7 (the `/docs` route exists). Sequenced
  last per the request that the landing update is the final work.
- **Documentation Impact:** `docs/features/web-shell.md` landing-page section — Documenter
  stage.

## Dependency Ordering

Default execution is sequential. Cross-workspace independence is noted where a Coordinator
may safely overlap.

- **Backend chain (serial, shared `docs.service.ts`/`docs.controller.ts`):**
  ST-1 → ST-2 → ST-3 → ST-4 → ST-5 → ST-6.
- **Web chain:** ST-7 (needs ST-2) → ST-8 (needs ST-3, ST-6, ST-7) → ST-9 (needs ST-5,
  ST-7). ST-7 touches only `apps/web` files, so a Coordinator may overlap it with backend
  ST-3–ST-6 once ST-2 has merged (no file overlap); the conservative default is serial.
- **ST-10** (admin link) needs ST-7.
- **ST-11** (Forums cleanup) is **independent and parallelizable** with the entire docs
  chain — it touches only Forums files (`forums.service.ts`, forum types) and shares nothing
  with the docs work. It may run at any point.
- **ST-12** (landing) needs ST-2 and ST-7 and is intentionally **last**.
- **Parallelizable set:** ST-11 alongside any docs subtask. All docs subtasks that share
  `docs.service.ts`/`docs.controller.ts` (ST-2 through ST-6) and the shared web `/docs`
  group (ST-7 through ST-9, ST-12) are **serial** because they overlap materially.

## Documentation Impact (overall)

- **New feature doc:** `docs/features/documents.md` (read/write/authorization contract,
  visibility + oracle parity, revisions/diff/rollback, soft-lock, env var) plus a new row in
  the `docs/README.md` routing table.
- **`docs/development/api-conventions.md`:** add
  `MilestoneFiveDocumentsFoundation1781308800000` to the reviewed-migration "Current set".
- **`docs/operations/launch.md`:** add the `DOCS_LOCK_TTL_MINUTES` env-variable row.
- **`docs/features/web-shell.md`:** new `/docs` routes, admin link, landing-page change.
- **`docs/features/authorization.md`:** cross-link the `assertDocWriteAccess` site-docs gate.
- **`docs/guides/content-management.md`:** admin/staff how-to for creating, editing, locking,
  and rolling back wiki pages.
- **`docs/features/forums.md`:** only if ST-11 changes documented last-activity behavior.
- Docs describe current state only (no milestone/subtask history) per the routing-table
  "Writing documentation" rules; the Documenter stage verifies every claim against code (P1).

## Risks and mitigations

1. **Visibility leaks / existence oracles (P12)** — every read path (ST-2, ST-5) routes
   through `AuthorizationService.evaluate()` and returns `404` parity for gated/nonexistent
   pages; security review is required on ST-2/ST-3/ST-4/ST-5.
2. **Non-atomic multi-row writes (P10)** — page+revision creation, rename subtree path
   rewrite, and rollback are transactional, each proven by a schema-enforced integration
   test rather than a mock (P3).
3. **MySQL 5.7.44 index-prefix limit** — full-path uniqueness/lookup uses `path_hash`, not a
   long `path` unique index.
4. **Toolchain split-brain (P4/P5)** — API subtasks must pass the `tsc` build (CommonJS /
   NodeNext: no `import.meta`, `__dirname` for fixtures); web subtasks must pass `next build`
   (App Router export allowlist), not just `next dev` + vitest.
5. **Plan-requirement traceability (P2)** — every locked decision above maps to at least one
   subtask AC; the scope-aware `assertDocWriteAccess` seam requirement is restated in each
   write-path prompt so no downstream agent must read another subtask's report.
6. **Partial-breadth fixes (P7)** — the ST-11 `TopicLastActivity.at` change and any
   API/web mirrors must be applied at every call site, asserted by absence of the old
   pattern.

## Implementer Prompts

Each prompt is launch-ready: the Coordinator passes it through with only procedural wrapper
instructions. Replace `<plan-branch>` with the active coordination branch. The shared
plan-level artifact directory is `artifacts/ms5-documents-wiki/`.

### ST-1 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-1 — the Documents/wiki schema, entities, migration, and module registration for
Milestone 5. Continue past preflight and into implementation when no blocking input is
missing.

Allowed files (create/edit only these):
- apps/api/src/docs/entities/docs-page.entity.ts (new)
- apps/api/src/docs/entities/docs-revision.entity.ts (new)
- apps/api/src/docs/docs.types.ts (new)
- apps/api/src/docs/docs.module.ts (new)
- apps/api/src/database/migrations/1781308800000-milestone-five-documents-foundation.ts (new)
- apps/api/src/database/database.config.ts
- apps/api/src/database/database.config.test.ts (reviewedMigrationNames registry expectation ONLY)
- apps/api/src/app.module.ts

Task:
- Create DocsPageEntity (docs_pages) and DocsRevisionEntity (docs_revisions) with the columns,
  indexes, and foreign keys specified in the ST-1 plan section, mirroring the Pages
  entity/revision pattern (including current_revision_id via createForeignKeyConstraints:
  false). Use char(36) ids, datetime(3), utf8mb4; keep everything MySQL 5.7.44 compatible.
  Full-path uniqueness/lookup uses path_hash char(64) unique per (scope_type, scope_id), NOT a
  long path unique index.
- Add docs.types.ts with the scope-type, status, and lock constants.
- Add a DocsModule skeleton that imports TypeOrmModule.forFeature([DocsPageEntity,
  DocsRevisionEntity]) with no providers/controllers yet.
- Author the migration MilestoneFiveDocumentsFoundation1781308800000 creating both tables and
  all listed indexes/FKs.
- Register both entities in reviewedEntityClasses; import and add the migration to
  reviewedMigrationClasses in database.config.ts; add the migration name to the
  reviewedMigrationNames expectation in database.config.test.ts; wire
  DocsModule.register(environment) into app.module.ts.

Acceptance criteria: as listed for ST-1 in plans/ms5-documents-wiki-plan.md (entities
registered; migration registered and named in the test expectation with the suite green;
tables/indexes/FKs created and MySQL 5.7.44 + utf8mb4 compatible; API boots and tsc-builds with
DocsModule registered and no new routes).

Validation (run all, scoped to your change, before reporting success; never report a command
you did not run):
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck
- npx --yes pnpm@10.0.0 test
- the API tsc build (CommonJS/NodeNext: no import.meta; resolve any fixture paths with
  __dirname, never process.cwd()).

Tester handoff: API specs are colocated *.test.ts under apps/api/src/docs/ and
apps/api/src/database/; the tester owns new behavioral specs. Do not author behavioral test
suites yourself beyond the reviewedMigrationNames registry expectation update.

Artifacts: write your report to artifacts/ms5-documents-wiki/ST-1/ using
repository-root-relative paths.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-2 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-2 — the Documents read API (path resolution, tree, breadcrumbs, recent feed) for
Milestone 5. Continue past preflight and into implementation when no blocking input is
missing.

Security review: required.

Allowed files (create/edit only these):
- apps/api/src/docs/docs.service.ts (new)
- apps/api/src/docs/docs.controller.ts (new)
- apps/api/src/docs/docs.module.ts (add DocsService provider + DocsController)
- apps/api/src/docs/docs.types.ts (extend if needed)

Task:
- Implement GET /api/docs/*path (resolve a page by full path via path_hash; return its current
  revision body plus an ordered breadcrumb ancestry), GET /api/docs (site root tree / children
  of ?parentPath=), and GET /api/docs/recent?limit= (recent publicly-readable, site-scope,
  non-deleted document edits: page title, path, editor, timestamp).
- Route EVERY visibility decision through AuthorizationService.evaluate() (anonymous actor for
  public reads); never re-derive a partial predicate inline. Exclude all scope_type='project'
  pages from every site index (mirror ForumsService.isBoardPubliclyReadable). Only
  status='published', publicly-readable site pages appear in unauthenticated reads.
- Gated and nonexistent pages must return an IDENTICAL 404 class and message (oracle parity,
  P12) — no 403 vs 404 distinction and no message that distinguishes hidden from nonexistent.

Acceptance criteria: as listed for ST-2 in plans/ms5-documents-wiki-plan.md.

Validation (run all, scoped to your change): lint, typecheck, test, and the API tsc build, per
docs/development/testing.md. Report only commands you actually ran.

Tester handoff: colocated apps/api/src/docs/docs.service.test.ts and
apps/api/src/docs/docs.controller.test.ts. The tester adds oracle-parity tests (identical
class + message across nonexistent/deleted/non-readable) and operator-pinned predicate
assertions — leave that behavioral suite work to the tester; wire the code so those assertions
can pass.

Artifacts: artifacts/ms5-documents-wiki/ST-2/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-3 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-3 — the Documents write API (create, edit, the assertDocWriteAccess seam, and
validation) for Milestone 5. Continue past preflight and into implementation when no blocking
input is missing.

Security review: required.

Allowed files (create/edit only these):
- apps/api/src/docs/docs.service.ts
- apps/api/src/docs/docs.controller.ts
- apps/api/src/docs/docs.types.ts
- apps/api/src/docs/docs.module.ts (wire ThrottleModule/AuthorizationModule deps as needed)

Task:
- Implement POST /api/docs (create a page under an optional parentPath/parentId; derive
  path/path_hash/depth; create revision #1; set current_revision_id) and
  POST /api/docs/:id/revisions (edit: append a new revision, bump revision_number, update
  current_revision_id/title/updated_at).
- Implement the scope-aware seam assertDocWriteAccess(actor, page|scopeType): for
  scope_type='site' require moderator/admin via AuthorizationService.hasGlobalRole. This seam
  MUST be the single authorization gate for every write path (no inline role checks duplicated
  at call sites), and its signature/branch point must be structured so a future project scope
  can add project-role rules without changing call sites.
- Validate slug charset/length, title length, parent existence, and reject path_hash
  collisions deterministically.
- Wrap every multi-row write (page + revision, revision + pointer update) in
  repository.manager.transaction so a mid-sequence failure leaves no orphaned page row and no
  dangling current_revision_id (P10).
- Attach the existing ThrottleGuard to the write routes.

Acceptance criteria: as listed for ST-3 in plans/ms5-documents-wiki-plan.md.

Validation (run all, scoped to your change): lint, typecheck, test, and the API tsc build. The
atomicity AC requires a schema-enforced (DB-gated) integration proof, not a mock — coordinate
the integration spec location with the tester (apps/api/src/docs/docs.service.integration.test.ts,
gated on SFUS_DB_INTEGRATION=1, skipping cleanly when unset, mirroring the Pages integration
spec). Report only commands you actually ran.

Tester handoff: colocated apps/api/src/docs/*.test.ts plus the opt-in integration spec above.
The tester owns the behavioral and integration suites; ensure the code makes the transactional
and 403-gate assertions provable.

Artifacts: artifacts/ms5-documents-wiki/ST-3/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-4 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-4 — Documents tree management (rename with subtree path rewrite, and staff
soft-delete) for Milestone 5. Continue past preflight and into implementation when no blocking
input is missing.

Security review: required.

Allowed files (create/edit only these):
- apps/api/src/docs/docs.service.ts
- apps/api/src/docs/docs.controller.ts
- apps/api/src/docs/docs.types.ts

Task:
- Implement PATCH /api/docs/:id (rename slug and/or title within the same parent; when the
  slug changes, recompute this page's path/path_hash and TRANSACTIONALLY rewrite every
  descendant's path/path_hash) and DELETE /api/docs/:id (soft-delete: set status='deleted';
  reject with 409 when the page has any non-deleted children).
- Both routes go through the assertDocWriteAccess seam from ST-3 (staff-only for site scope) —
  do not duplicate the role check inline.
- Cross-parent move/reparent is OUT OF SCOPE (deferred); do not implement it.

Acceptance criteria: as listed for ST-4 in plans/ms5-documents-wiki-plan.md (atomic
subtree path rewrite with rollback-on-failure proof; title-only rename leaves paths
unchanged; leaf soft-delete preserves revisions and disappears from public reads;
delete-with-children rejected with 409; all routes staff-gated).

Validation (run all, scoped to your change): lint, typecheck, test, and the API tsc build. The
transactional path-rewrite AC requires a schema-enforced integration proof (extend the docs
integration spec with the tester). Report only commands you actually ran.

Tester handoff: colocated apps/api/src/docs/*.test.ts plus the integration spec. Leave the
behavioral/integration suites to the tester; make the atomicity and 409 assertions provable.

Artifacts: artifacts/ms5-documents-wiki/ST-4/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-5 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-5 — Documents revision history, side-by-side diff, and rollback for Milestone 5.
Continue past preflight and into implementation when no blocking input is missing.

Security review: required.

Allowed files (create/edit only these):
- apps/api/src/docs/docs.service.ts
- apps/api/src/docs/docs.controller.ts
- apps/api/src/docs/docs.types.ts

Task:
- Implement GET /api/docs/:id/history (ordered revision metadata: number, author/editor,
  summary, timestamp), GET /api/docs/:id/revisions/:revisionNumber (a single revision body),
  GET /api/docs/:id/diff?from=&to= (a server-computed DETERMINISTIC line-level diff structure
  of added/removed/unchanged hunks), and POST /api/docs/:id/rollback { revisionNumber } (create
  a NEW highest-numbered revision whose content equals the target — never destructive — and
  update current_revision_id).
- History, single-revision, and diff reads of a non-readable page must return the SAME 404 as
  ST-2 (oracle parity). Rollback goes through the assertDocWriteAccess seam (staff-only for
  site scope).

Acceptance criteria: as listed for ST-5 in plans/ms5-documents-wiki-plan.md.

Validation (run all, scoped to your change): lint, typecheck, test, and the API tsc build.
Report only commands you actually ran.

Tester handoff: colocated apps/api/src/docs/*.test.ts. The tester pins the diff output against
fixed inputs and asserts rollback is non-destructive and the 404 parity on history/diff reads —
make those provable; leave the behavioral suite to the tester.

Artifacts: artifacts/ms5-documents-wiki/ST-5/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-6 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-6 — the Documents soft-lock (acquire, TTL expiry, release, staff override) and
wire it into the write paths for Milestone 5. Continue past preflight and into implementation
when no blocking input is missing.

Allowed files (create/edit only these):
- apps/api/src/docs/docs.service.ts
- apps/api/src/docs/docs.controller.ts
- apps/api/src/docs/docs.types.ts
- apps/api/src/config/environment.ts (add and validate DOCS_LOCK_TTL_MINUTES)

Task:
- Implement POST /api/docs/:id/lock (acquire/refresh: set is_locked, locked_by_user_id,
  locked_at, lock_expires_at = now + DOCS_LOCK_TTL_MINUTES; a different non-expired holder gets
  409 with holder metadata; the same holder refreshes) and DELETE /api/docs/:id/lock (release
  by holder, or override by admin/moderator).
- Wire a lock check into the ST-3/ST-4/ST-5 write paths (edit, rename, delete, rollback): an
  active foreign lock blocks the write with 409 unless the actor is the holder or an admin
  override; an expired lock is treated as free.
- Add DOCS_LOCK_TTL_MINUTES to environment.ts with a sensible default and range check (fail
  fast on invalid). Surface current lock state on page read responses. Acquire/release go
  through assertDocWriteAccess.

Acceptance criteria: as listed for ST-6 in plans/ms5-documents-wiki-plan.md.

Validation (run all, scoped to your change): lint, typecheck, test, and the API tsc build.
Report only commands you actually ran.

Tester handoff: colocated apps/api/src/docs/*.test.ts and apps/api/src/config/environment.test.ts
for the new env var. Leave the behavioral suite to the tester; make the 409-on-foreign-lock,
expiry-is-free, and override behaviors provable.

Artifacts: artifacts/ms5-documents-wiki/ST-6/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-7 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-7 — the public Documents browse/render surface (web) for Milestone 5. Continue
past preflight and into implementation when no blocking input is missing.

Allowed files (create/edit only these):
- apps/web/app/docs/page.tsx (new)
- apps/web/app/docs/[...path]/page.tsx (new)
- apps/web/app/docs/docs-client.ts (new)
- apps/web/app/docs/docs.module.css (new, if styling is needed)

Task:
- Build /docs (site page tree/index) and /docs/<path> (catch-all page view with a breadcrumb
  trail), reading through docs-client.ts using the shared error-envelope read pattern
  (payload.error.message first, then payload.message, then a generic fallback). Render the
  current revision via the shared MarkdownRenderer.
- Show create/edit/lock affordances ONLY when the resolved session holds moderator/admin
  (read-only otherwise). Treat client gating as defense-in-depth; the API is the real gate.
- Keep App Router route files free of non-allowlisted exports (only default + allowed fields);
  put shared helpers in sibling modules (docs-client.ts).

Acceptance criteria: as listed for ST-7 in plans/ms5-documents-wiki-plan.md.

Validation (run all, scoped to your change): lint and the production web build
(npx --yes pnpm@10.0.0 --filter @sfus/web exec next build) — validate with next build, not just
next dev + vitest, so App Router export constraints and production type-checking are enforced
(P5). Report only commands you actually ran.

Tester handoff: web specs are *.spec.ts under apps/web/app/docs/. The tester writes
behavioral specs that execute rendering/visibility behavior (not source-text greps); leave that
suite to the tester.

Artifacts: artifacts/ms5-documents-wiki/ST-7/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-8 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-8 — the staff-gated Documents authoring surface in the public /docs area for
Milestone 5. Continue past preflight and into implementation when no blocking input is missing.

Allowed files (create/edit only these):
- apps/web/app/docs/new/page.tsx (new)
- apps/web/app/docs/[...path]/edit/page.tsx (new)
- apps/web/app/docs/docs-client.ts (extend)
- apps/web/app/docs/docs.module.css (extend)

Task:
- Build new-page and edit forms (reusing the shared MarkdownEditor) wired to the ST-3 create /
  edit, ST-4 rename, and ST-6 lock endpoints, all from the public /docs area. Add lock
  acquire/release UX with a lock indicator and holder/expiry messaging surfaced from the 409.
- Gate the authoring UI to moderator/admin sessions client-side (defense-in-depth only); the
  server gate is authoritative. Build the components generically so flipping the server gate
  to members-edit later needs no UI rewrite.
- Keep route files free of non-allowlisted App Router exports (P5).

Acceptance criteria: as listed for ST-8 in plans/ms5-documents-wiki-plan.md, including
that a forced API call by a non-staff user still fails at the server gate (verify, do not
assume).

Validation (run all, scoped to your change): lint and next build (P5). Report only commands you
actually ran.

Tester handoff: *.spec.ts under apps/web/app/docs/. The tester writes behavioral specs that
execute the authoring/lock flows; leave that suite to the tester.

Artifacts: artifacts/ms5-documents-wiki/ST-8/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-9 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-9 — the Documents revision history, side-by-side diff, and rollback UI (web) for
Milestone 5. Continue past preflight and into implementation when no blocking input is missing.

Allowed files (create/edit only these):
- apps/web/app/docs/[...path]/history/page.tsx (new)
- apps/web/app/docs/docs-client.ts (extend)
- apps/web/app/docs/docs.module.css (extend)

Task:
- Build a history view (revision list with author/editor, summary, timestamp), a SIDE-BY-SIDE
  diff view rendering the ST-5 server diff structure (added/removed/unchanged clearly
  distinguished), and a staff-gated rollback action wired to POST /api/docs/:id/rollback.
- Non-staff users get no rollback affordance and are blocked at the API. Read through
  docs-client.ts with the shared error-envelope pattern. Keep route files free of
  non-allowlisted exports (P5).

Acceptance criteria: as listed for ST-9 in plans/ms5-documents-wiki-plan.md.

Validation (run all, scoped to your change): lint and next build (P5). Report only commands you
actually ran.

Tester handoff: *.spec.ts under apps/web/app/docs/. The tester writes behavioral specs for the
history/diff/rollback flows; leave that suite to the tester.

Artifacts: artifacts/ms5-documents-wiki/ST-9/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-10 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-10 — add the Documents management link to the admin dashboard for Milestone 5.
Continue past preflight and into implementation when no blocking input is missing.

Allowed files (create/edit only these):
- apps/web/app/admin/page.tsx

Task:
- Add a Documents entry to the adminSections array linking to /docs, with a description
  consistent in tone/format with the existing Blog/Pages/Navigation/Forums entries (staff
  create, edit, lock, and roll back wiki pages in the public /docs area).

Acceptance criteria: as listed for ST-10 in plans/ms5-documents-wiki-plan.md.

Validation (run all, scoped to your change): lint and next build (P5). Report only commands you
actually ran.

Tester handoff: apps/web/app/admin/admin-dashboard.spec.ts. The tester updates the admin
dashboard spec to cover the new link; leave that behavioral spec to the tester.

Artifacts: artifacts/ms5-documents-wiki/ST-10/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-11 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-11 — the two optional Forums last-activity cleanups from the forums-listing
review. Continue past preflight and into implementation when no blocking input is missing.

Allowed files (create/edit only these):
- apps/api/src/forums/forums.service.ts
- apps/api/src/forums/forums.types.ts

Task:
- In ForumsService.listPublicCategories and getBoard, derive each board's lastPost reply
  timestamp from the latest NON-DELETED reply (consistent with the existing author
  resolution) instead of topic.lastPostAt, so a soft-deleted latest reply cannot leave a
  stale last-activity date.
- Resolve the always-null, unused TopicLastActivity.at field: either populate it with the
  resolved reply timestamp OR remove the field and tighten its JSDoc. Choose the option that
  keeps callers and types consistent, and apply it at EVERY call site and type reference
  (grep for all usages first; state the count in your report — P7).

Acceptance criteria: as listed for ST-11 in plans/ms5-documents-wiki-plan.md.

Validation (run all, scoped to your change): lint, typecheck, test, and the API tsc build.
Report only commands you actually ran.

Tester handoff: apps/api/src/forums/*.test.ts. The tester adds/updates specs proving the
non-deleted-reply derivation and the absence of any remaining always-null field; leave that
behavioral suite to the tester.

Artifacts: artifacts/ms5-documents-wiki/ST-11/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST-12 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement ST-12 — refresh the landing page from Milestone 4 to Milestone 5 and surface the new
wiki content. This is the final subtask. Continue past preflight and into implementation when
no blocking input is missing.

Allowed files (create/edit only these):
- apps/web/app/page.tsx
- apps/web/app/page.module.css
- apps/web/components/recent-doc-activity.tsx (new)
- apps/web/components/recent-doc-activity.module.css (new)

Task:
- Rewrite the hero, highlights, "What's new", "Explore the site", and "Current content scope"
  copy from Milestone 4 to Milestone 5 (Documents wiki); remove every stale "Milestone 4"
  label. Add a wiki highlight and a /docs explore link.
- Add a RecentDocActivity component mirroring RecentForumActivity that consumes
  GET /api/docs/recent (from ST-2) and renders recent published document edits, with
  empty/loading/error states consistent with the existing recent-activity components. Place it
  in the "What's new" section.
- Keep route files free of non-allowlisted App Router exports (P5).

Acceptance criteria: as listed for ST-12 in plans/ms5-documents-wiki-plan.md.

Validation (run all, scoped to your change): lint and next build (P5). Report only commands you
actually ran.

Tester handoff: apps/web/app/public-shell.spec.ts and a colocated
apps/web/components/recent-doc-activity.spec.ts. The tester writes behavioral specs (executing
rendering, not source-text greps); leave that suite to the tester.

Artifacts: artifacts/ms5-documents-wiki/ST-12/ (repository-root-relative).

Do not report success unless all required artifacts exist and all changes are committed.
```

## Output Artifact Path

This plan is written to `plans/ms5-documents-wiki-plan.md` (repository-root-relative).
The plan-level coordination artifact directory is `artifacts/ms5-documents-wiki/`,
with one subdirectory per subtask id (`ST-1` … `ST-12`).
