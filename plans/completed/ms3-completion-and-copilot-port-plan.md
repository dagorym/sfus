# Milestone 3 Completion And `ms3-copilot` Port Plan

## Planner Activation
- Requested agent: `planner`
- Repository instruction source: `AGENTS.md` plus `.myteam` role/skill content loaded through `myteam`
- Base branch: `ms3-claude` (current branch) — confirmed as the build to continue from.
- Workflow obligations being followed:
  - Stay in planning mode only; do not write implementation code.
  - Resolve material design decisions with the user before decomposition (done — see Resolved Decisions).
  - Decompose into ordered, implementation-ready subtasks with dependencies, acceptance criteria, and documentation impact.
  - Provide a launch-ready Implementer prompt per subtask.
  - Write the final plan to a unique markdown file under `plans/`.

## Overview
Milestone 3 is implemented on `ms3-claude` and self-assessed **CONDITIONAL PASS**, but it is not yet deployable. This plan completes Milestone 3 against the binding design source of truth (`star_frontiers_rpg_website_design.md`, referenced by `plans/sfus-implementation-plan.md` § "Milestone 3") by:

1. Closing the gaps the two comparison reviews (`artifacts/ms3-comparison-v1.md`, `artifacts/ms3-comparison-v2.md`) and the branch reviewer reports identified on `ms3-claude`.
2. Porting the genuinely better pieces of `ms3-copilot` (navigation child rendering + publication-aware filtering, role-aware media upload scope, due-time scheduled visibility, richer page-revision metadata, persisted comment media references).
3. Fixing the boot-blocking `multer` packaging defect and the missing durable media storage volume so the app actually launches and serves uploaded images.
4. Adding the design-required MS3 behaviors that were never built (1-level threaded comments, comment-thread lock + post pin/feature, image alt-text), while explicitly deferring later-phase scope per the design's own roadmap.

The milestone is complete when the app boots cleanly, uploaded images persist and render, blog/pages/comments/navigation behave per the design, and unpublished content cannot leak through any public route, API, or navigation path.

### Confirmed repository context
- `ms3-claude` is based on current `main`; it has a real `POST /api/media/upload`, reusable `MarkdownEditor`/`MarkdownRenderer`/`ImageUpload` components, clean per-module controller+service separation, and ~275 passing tests.
- The API container currently **fails to boot**: `media.controller.ts` does `require("multer")` at runtime, but `multer` is not a declared dependency in `apps/api/package.json`; under pnpm's non-hoisted layout the production image cannot resolve it (`Error: Cannot find module 'multer'`).
- `MEDIA_STORAGE_PATH` is wired in `apps/api/.env.example` and the launch guide, but **no durable storage volume** is mounted in `cicd/docker/compose.dev.yml` or `compose.prod.yml`; uploads would be lost on container restart (design §14 requires a `storage-volume`).
- There is **no Redis** in this stack (the design assumes Redis for rate limits).
- MS3 is pre-release on a feature branch, so the MS3 migration may be amended in place; dev databases will be dropped and recreated.

### Likely implementation surfaces
- `apps/api/src/{blog,pages,navigation,media}/**`, `apps/api/src/database/migrations/**`, `apps/api/src/database/database.config.ts`, `apps/api/package.json`
- `apps/web/app/{blog,pages,admin,navigation}/**`, `apps/web/app/[slug]/**` (new top-level page route), `apps/web/components/{image-upload,markdown-renderer,navigation}.tsx`
- `cicd/docker/compose.dev.yml`, `cicd/docker/compose.prod.yml`
- `docs/README.md`, `docs/website-launch-guide.md`, `docs/deferred-tasks.md`, `docs/architecture/**`

## Resolved Decisions
All material design/security decisions were resolved with the user before decomposition.

| # | Decision | Resolution |
|---|---|---|
| Base | Build to continue from | `ms3-claude` (current branch); port good parts of `ms3-copilot` |
| N1 | Nav child rendering | Port — render top-level + one dropdown level (keyboard-accessible) |
| N2 | Nav public filtering | Full — filter children by `isActive`/`visibility` **and** hide entries whose linked blog/page target is unpublished |
| N3 | Nav external links | Port — render external `linkType` with proper `target`/`rel` |
| M1 | Upload authorization | Role-aware — admin for `blog-post` & `standalone-page`; authenticated for `blog-comment` |
| S1 | Scheduling model | Collapse status to `draft`/`published` + single `publishedAt` (may be future); public iff `published AND publishedAt<=now`; publish-now sets `publishedAt=now`; unpublish→`draft`; admin shows "scheduled" label; query-time, no background job |
| P2 | Standalone-page routing | Top-level (`/about`) via a root catch-all evaluated last + a reserved-slug denylist |
| P1 | Page-revision metadata | Full — `summary`, `change_note`, `editor_user_id`, `featured_media_id` |
| C1 | Comment media | Persist a structured comment media reference + usage-scope check |
| — | Media serving | Public `GET /api/media/:id` streaming, path-safe (resolve by `storageKey`), image-only |
| A1 | Preview API | No server-side preview endpoints — client-side preview only |
| A2 | Blog summary | Add a blog `summary`/excerpt field |
| — | WYSIWYG | Scope to "Markdown write + live preview"; defer true WYSIWYG |
| — | Migration strategy | Amend the existing MS3 migration(s) in place; dev DBs dropped/recreated |
| — | Threaded comments | Include — 1-level threading (`parentId`) |
| — | Comment moderation | Include — lock-thread (disable commenting) **and** post pin/feature |
| — | Image alt-text | Include — capture + require alt text on upload/embed |
| — | Later-phase scope | Defer all (see Deferred Scope) per the design's roadmap |

## Workstreams
1. Schema/domain-model normalization (single source of truth migration + entities).
2. Media pipeline completion: dependency fix, serving, role-aware scope, alt-text, durable storage.
3. Blog publishing: scheduling model, summary, sanitization, featured image, pin/feature.
4. Comments: persisted media reference, 1-level threading, lock-thread, moderation.
5. Standalone pages: top-level routing, reserved slugs, enriched revisions, featured media, sanitization.
6. Navigation: child rendering, external links, publication-aware filtering, endpoint authz, safe fallback.

## Subtasks

### Subtask 1: Schema and domain-model normalization
- Stable ID: `subtask-1`
- Security review required: no (schema/entity only; behavioral enforcement and its security review live in subtasks 2–6).
- Dependencies: existing `ms3-claude` MS3 foundation.
- Scope:
  - Amend the existing MS3 migration(s) in place (do not add incremental migrations) so the schema is the single source of truth, MySQL 5.7.44 compatible:
    - Blog posts: collapse the status enum to `draft`/`published` (remove `scheduled`); keep a single nullable `published_at` that may hold a future time; add `summary`; add a pinned/featured boolean (e.g. `is_featured`); add `comments_locked` boolean.
    - Blog comments: add a nullable self-referencing `parent_id` (one-level threading) and a nullable `media_reference_id` FK to `media_references`.
    - Page revisions: add `summary`, `change_note`, `editor_user_id`, and `featured_media_id`.
  - Update the corresponding TypeORM entities, DTOs, and shared types to match; remove any remaining `scheduled` status value/usage at the type level.
  - Remove the stale, unregistered `apps/api/src/database/migrations/1748736000001-navigation-items.ts` (it duplicates navigation-table creation and is not registered) and reconcile `database.config.ts` migration registration so there is no dead/unregistered migration.
  - Update unit tests that directly reference the changed model so the suite compiles and passes (deeper coverage is the Tester stage's responsibility).
- Acceptance criteria:
  - The amended MS3 migration reflects all of the above, runs cleanly on a fresh MySQL 5.7.44-compatible database (`migration:run`/`migration:show` succeed), and contains no `scheduled` status value.
  - Entities/DTOs/types compile against the normalized model with no lingering `scheduled` references.
  - The duplicate navigation migration is gone and migration registration in `database.config.ts` is internally consistent.
  - Directly-affected unit tests are updated and the API suite is green.
- Documentation Impact:
  - Update `docs/README.md` schema/entity surfaces and `docs/website-launch-guide.md` to note the normalized scheduling model and that dev databases must be dropped and recreated to pick up the amended migration.

### Subtask 2: Media pipeline completion and durable storage
- Stable ID: `subtask-2`
- Security review required: yes (untrusted file upload, path traversal, public serving, role-scoped authorization).
- Dependencies: `subtask-1`.
- Scope:
  - Declare `multer` as a direct dependency and `@types/multer` as a devDependency in `apps/api/package.json`; replace the fragile runtime `require("multer")` with a normal import where practical; verify the API container boots and `migration:run` works inside the container (this is the reported `Cannot find module 'multer'` failure).
  - Add a public `GET /api/media/:id` route that streams the stored file from configured storage, resolving the file from the stored `storageKey` (path-traversal-safe; never from user-supplied paths), serving only allowed image content, and aligned with the `url` `MediaService` returns.
  - Enforce role-aware upload scope (port `ms3-copilot`'s `assertCanUploadImageForScope` semantics): `blog-post` and `standalone-page` uploads require admin; `blog-comment` uploads require an authenticated user; unauthenticated uploads are rejected.
  - Add alt-text capture to the `ImageUpload` component and emit the alt text into the inserted Markdown image syntax; ensure `MarkdownRenderer` renders the alt attribute.
  - Fix the duplicate `image-upload-input` DOM id so multiple upload widgets coexist on one page.
  - Add a durable storage volume for `MEDIA_STORAGE_PATH` in `cicd/docker/compose.dev.yml` and `cicd/docker/compose.prod.yml`, and ensure `MEDIA_STORAGE_PATH` points at the mounted path (design §14 `storage-volume`).
- Acceptance criteria:
  - The API container starts without the `multer` `MODULE_NOT_FOUND` error, `multer` is a declared dependency, and migrations run inside the container.
  - Uploaded images are retrievable via `GET /api/media/:id` and render in content; the served path is resolved safely from `storageKey` with no path traversal; only allowed image content is served.
  - Upload authorization is role-scoped: non-admins cannot upload for `blog-post`/`standalone-page`; authenticated users can upload for `blog-comment`; unauthenticated uploads return 401.
  - `ImageUpload` captures alt text and inserts it into the Markdown image; multiple `ImageUpload` widgets on a page have unique ids.
  - Uploaded files persist across container restarts via the configured storage volume in both dev and prod compose.
- Documentation Impact:
  - Document the serving route, role-scoped upload policy, alt-text behavior, and the storage-volume/env wiring in `docs/README.md` and `docs/website-launch-guide.md`.

### Subtask 3: Blog publishing — scheduling, summary, sanitization, featured image, pin/feature
- Stable ID: `subtask-3`
- Security review required: yes (publish-state leakage and server-side post-body sanitization).
- Dependencies: `subtask-1`, `subtask-2`.
- Scope:
  - Implement query-time public visibility: a post is public iff `status=published AND publishedAt<=now`. Publish-now sets `publishedAt` to the current time; publish-at-future sets `publishedAt` to the chosen future time; unpublish returns the post to `draft` and hides it. No background job.
  - In the admin list, label published posts whose `publishedAt` is in the future as "scheduled / goes live at <time>".
  - Add the blog `summary` to create/edit flows and use it in public listings/meta.
  - Route blog post create/update bodies through `validateMarkdownBody`/`normalizeMarkdownBody` (server-side sanitization parity with comments).
  - Wire `ImageUpload` into the blog admin editor for the featured image; render the featured image on public blog list/detail; validate `featuredImageId` references existing media.
  - Implement pin/feature: a pinned/featured post surfaces first in the public listing; only authorized admins may toggle it.
- Acceptance criteria:
  - A future-dated published post is hidden from public routes until `publishedAt<=now`, then becomes visible with no manual action or background job; drafts and unpublished posts are never public.
  - Publish-now sets `publishedAt` to the current time; unpublish returns the post to `draft` and hides it; the admin UI labels published-future posts as scheduled.
  - Blog post bodies are sanitized/normalized server-side on create and update; unsafe bodies are rejected or neutralized.
  - Featured images upload via `ImageUpload` in the admin editor and render on public blog views; `featuredImageId` is validated against existing media.
  - A post can be pinned/featured and surfaces first in the public listing; only admins can toggle it; `summary` is editable and shown in listings/meta.
- Documentation Impact:
  - Update `docs/README.md` and `docs/website-launch-guide.md` for the normalized scheduling model, server-side post sanitization, featured-image flow, pin/feature, and summary.

### Subtask 4: Comments — persisted media reference, 1-level threading, lock-thread, moderation
- Stable ID: `subtask-4`
- Security review required: yes (public user-generated content, untrusted input, moderation authorization, media usage scope).
- Dependencies: `subtask-1`, `subtask-2`, `subtask-3`.
- Scope:
  - Persist the comment media reference (`mediaReferenceId`) with a usage-scope check (the referenced media must be `blog-comment`-scoped); stop dropping the incoming `imageId`.
  - Implement 1-level threaded comments: `parentId` permits exactly one level of replies (reject nesting deeper than one level); render a threaded reply UI.
  - Implement comment-thread locking: moderators/admins can lock a post's comments (`commentsLocked`); when locked, comment creation is rejected; reflect lock state in the UI.
  - Preserve and confirm: public read returns only visible comments on published posts; authenticated members can create comments on eligible published, unlocked posts; moderators/admins can remove/hide comments; comment bodies are validated server-side.
- Acceptance criteria:
  - Guests read visible comments on published posts; authenticated members create comments on eligible published, unlocked posts; replies nest at most one level and deeper nesting is rejected.
  - A comment image upload persists a structured comment media reference validated as `blog-comment`-scoped; the previously dangling `imageId` is no longer dropped.
  - Moderators/admins can lock a post's comment thread (blocking new comments) and remove/hide comments through explicit authorized flows.
  - Comment creation and rendering use the shared sanitization model and never expose unpublished parent content.
- Documentation Impact:
  - Document 1-level threading, persisted comment media references, comment-thread locking, and moderation rules in `docs/README.md` and `docs/website-launch-guide.md`.

### Subtask 5: Standalone pages — top-level routing, reserved slugs, enriched revisions, featured media, sanitization
- Stable ID: `subtask-5`
- Security review required: yes (public-visibility leakage, route-collision/reserved-slug safety, server-side body sanitization).
- Dependencies: `subtask-1`, `subtask-2`.
- Scope:
  - Serve published standalone pages at top-level routes (e.g. `/about`, `/rules`, `/contact`) via a root catch-all evaluated **after** all reserved/static routes; add and enforce a reserved-slug denylist (at minimum `admin`, `api`, `app`, `blog`, `login`, `register`, `onboarding`, `profile`, `settings`, `health`) on page create/edit and at routing time.
  - Use the enriched page-revision metadata: capture `summary` and `change_note` on edit, record `editor_user_id`, and support `featured_media_id`.
  - Wire `ImageUpload` into the page admin editor for the featured media; render the featured image on the public page; route page bodies through `validateMarkdownBody`/`normalizeMarkdownBody` on create/update/restore.
  - Fix the per-fetch full-revision scan so the current page body is resolved efficiently rather than by scanning the entire revision list on every fetch.
  - Maintain scope discipline: no block-builder UI/schema, no wiki hierarchy.
- Acceptance criteria:
  - Published standalone pages render at top-level paths; the root catch-all is evaluated last and never shadows existing or reserved routes; reserved slugs are rejected on create/edit.
  - Only published pages are public; draft/unpublished revisions remain protected.
  - Every edit creates a durable revision capturing summary, change note, editor user, and featured media; restore creates a new revision (audit trail preserved).
  - Page bodies are sanitized/normalized server-side on create/update/restore; featured media uploads via `ImageUpload` and renders publicly; current-body resolution no longer scans the full revision list per fetch.
  - No block-builder or wiki behavior is introduced.
- Documentation Impact:
  - Update `docs/README.md` and `docs/website-launch-guide.md` route inventory for top-level pages, the reserved-slug list, and the enriched revision metadata; confirm block-builder/wiki deferrals in `docs/deferred-tasks.md`.

### Subtask 6: Navigation — child rendering, external links, publication-aware filtering, endpoint authz, safe fallback
- Stable ID: `subtask-6`
- Security review required: yes (publication leakage, endpoint authorization, visibility enforcement).
- Dependencies: `subtask-1`, `subtask-3`, `subtask-5` (publication-aware linked-target checks require the real published blog and top-level page routes).
- Scope:
  - Render top-level items plus one dropdown level of children in the shell (`navigation.tsx`), keyboard-accessible (focusable triggers, appropriate ARIA, escape/blur to close); keep `ms3-claude`'s safe `[]` fallback on API error and do **not** adopt `ms3-copilot`'s hardcoded `/about,/rules,/contact` fallback.
  - Add external-link handling: `linkType=external` renders a proper external href with appropriate `target`/`rel`.
  - Implement publication-aware filtering in `NavigationService.findPublic`: filter children by `isActive`/`visibility` and omit any nav entry whose linked internal blog/page target is not publicly visible.
  - Fix the authenticated navigation endpoint: require a valid authenticated session; distinguish authenticated vs admin visibility so admin-only items are not returned to ordinary members; apply the same `isActive`/`visibility` child filtering there.
  - Remove the unused `NotFoundException` import in `navigation.controller.ts`.
- Acceptance criteria:
  - The shell renders one level of dropdown children, keyboard-accessible; external links render with correct `target`/`rel`; internal links resolve to implemented routes.
  - The public nav API filters children by `isActive`/`visibility` and omits entries whose linked blog/page target is not publicly visible; no unpublished or hidden destination leaks to guests.
  - The authenticated nav endpoint requires a valid session and never returns admin-only items to non-admins; its children are visibility-filtered.
  - On nav API error/empty/invalid response, the shell falls back to no content links (`[]`) — never to hardcoded routes that could point at unpublished pages.
  - The unused import is removed and lint passes.
- Documentation Impact:
  - Update `docs/README.md` and `docs/website-launch-guide.md` for navigation data ownership, visibility rules, external-link handling, authenticated-endpoint authorization, and fallback behavior.

## Acceptance Criteria (Milestone-level)
Milestone 3 is complete and deployable when all of the following hold:
- The API container boots cleanly (no `multer` error) and migrations run inside the container.
- Uploaded images persist across restarts and render on public blog posts, standalone pages, and comments; serving is path-safe and image-only; uploads are role-scoped (admin for posts/pages, authenticated for comments); images carry alt text.
- Blog posts support draft/published with `publishedAt`-driven query-time visibility (future-dated posts auto-appear at their time, no job), summary, tags, featured image, server-side sanitization, and pin/feature ordering; drafts/unpublished/future posts never leak publicly.
- Blog comments are publicly readable, authenticated-member writable on eligible published unlocked posts, 1-level threaded, image-capable via persisted media references, and moderator/admin moderatable including thread lock.
- Standalone pages render at top-level routes with a reserved-slug guard, durable enriched revisions with restore, featured media, server-side sanitization, and published-only public visibility; no block-builder/wiki scope.
- Admin-managed navigation renders top-level + one dropdown level (keyboard-accessible), handles internal and external links, filters children and linked targets by publication/visibility, authenticates the authenticated endpoint, keeps a safe `[]` fallback, and never leaks unpublished/admin-only destinations.
- Authorization, sanitization, scheduling, and media behavior are documented accurately (no doc-vs-reality drift), and deferred scope is recorded in `docs/deferred-tasks.md`.

## Documentation Impact (Overall)
- `docs/README.md`: normalized blog scheduling model; uniform server-side sanitization coverage; media serving route + role-scoped upload policy + alt-text; comment threading/lock/media references; top-level standalone page routing + reserved slugs + enriched revisions; navigation child rendering, external links, publication-aware filtering, and endpoint authz.
- `docs/website-launch-guide.md`: media storage volume + `MEDIA_STORAGE_PATH` wiring; dev-DB recreation due to amended migration; updated route inventory (top-level pages); public-content verification steps.
- `docs/deferred-tasks.md`: record the deferred-scope items below.
- `docs/architecture/**`: update or add a content-model/media decision record if the implementation introduces one.

## Deferred Scope (record in `docs/deferred-tasks.md`)
Deferred per the design's own roadmap phasing; not required for MS3 deployability:
- SEO: OpenGraph/meta tags, sitemaps, canonical URLs (design §12; roadmap Phase 5).
- Reports / moderation queue for arbitrary objects (design §13; forums-era).
- Per-user editor mode preference (`user_settings.content_prefs`) and a unified media-library picker / drag-and-drop (design §10).
- Full WCAG 2.1 AA accessibility sweep beyond keyboard-accessible navigation (design §11.1; roadmap Phase 5).
- True WYSIWYG editing surface (kept as Markdown write + live preview for MS3).
- Comment rate-limiting / anti-spam (design phases rate-limits to Phase 5 and forum anti-spam to Milestone 4; no Redis in the current stack).
- Previously recorded MS3 deferrals remain deferred: arbitrary file attachments, page block-builder UI, navigation depth > 1, project-scoped authoring policy, and the wiki/documents feature set (Milestone 5).

## Dependency Ordering
- Must happen first:
  - `subtask-1` (schema is the foundation for all behavior changes; it owns the single amended migration, so no other subtask edits the migration).
- Shared infrastructure path:
  - `subtask-2` depends on `subtask-1`.
- Content-system path:
  - `subtask-3` depends on `subtask-1`, `subtask-2`.
  - `subtask-4` depends on `subtask-1`, `subtask-2`, `subtask-3`.
  - `subtask-5` depends on `subtask-1`, `subtask-2`.
- Navigation path:
  - `subtask-6` depends on `subtask-1`, `subtask-3`, `subtask-5`.

Parallelization notes:
- `subtask-3` and `subtask-5` both depend only on `{subtask-1, subtask-2}` and touch different modules (`blog` vs `pages`), so they are plausibly parallelizable. The safe default is serial; run them in parallel only under staffing pressure, because both touch the shared docs and reuse the same `ImageUpload`/sanitization integration pattern.
- `subtask-4` must follow `subtask-3` (comments depend on the final blog publish/visibility and route contracts).
- `subtask-6` must follow both `subtask-3` and `subtask-5` so publication-aware nav target validation can target real published blog and top-level page routes.

## Risks And Mitigations
1. Amending the MS3 migration breaks existing dev databases.
   - Mitigation: this is intended (pre-release); document the drop/recreate step in the launch guide and keep the migration MySQL 5.7.44 compatible.
2. The `multer`/serving fix passes unit tests but the container still fails at runtime.
   - Mitigation: make container boot + in-container `migration:run` + an upload→serve round trip an explicit acceptance check in `subtask-2`, not just unit-level assertions.
3. Top-level page catch-all shadows existing or future routes.
   - Mitigation: evaluate the catch-all last, enforce a reserved-slug denylist on create/edit and at routing, and add tests for reserved-slug rejection and route precedence.
4. Publish-state or visibility leakage through blog routes, page routes, or navigation linked targets.
   - Mitigation: centralize publish/visibility checks in backend query paths; make unpublished-leakage an explicit acceptance criterion for subtasks 3, 5, and 6; keep the safe `[]` nav fallback.
5. Existing web tests are source-contract (string-match) and miss functional breaks (dead image URLs, unrendered nav children, fallback leaks).
   - Mitigation: each subtask's validation guidance calls for behavioral coverage of the new/fixed behavior (upload→serve→render, child rendering, scheduled visibility, fallback), which the downstream Tester stage deepens.
6. Role-scoped upload and lock/moderation authorization drift from the Milestone 2 model.
   - Mitigation: build all new authorization on the existing `AuthService`/authorization primitives; mark the upload, comment, page, and navigation subtasks for specialist Security review.

## Output Artifact Path
- `plans/ms3-completion-and-copilot-port-plan.md`

## Implementer Prompts

### Subtask 1: Schema and domain-model normalization
```text
Your role is 'implementer'. Your task is as follows:
Normalize the Milestone 3 persistence model on the ms3-claude branch by amending the existing MS3 migration(s) in place (do NOT add incremental migrations) and updating the matching entities, DTOs, and shared types. MS3 is pre-release, so the schema is the single source of truth and dev databases will be dropped and recreated.

Make these schema changes, keeping MySQL 5.7.44 compatibility:
- Blog posts: collapse the status enum to draft/published (remove the scheduled value); keep a single nullable published_at that may hold a future time; add summary; add a pinned/featured boolean (e.g. is_featured); add comments_locked boolean.
- Blog comments: add a nullable self-referencing parent_id (one-level threading) and a nullable media_reference_id FK to media_references.
- Page revisions: add summary, change_note, editor_user_id, and featured_media_id.
Remove the stale, unregistered migration apps/api/src/database/migrations/1748736000001-navigation-items.ts (it duplicates navigation-table creation and is not registered) and reconcile apps/api/src/database/database.config.ts so migration registration is consistent with no dead/unregistered migration. Update entities, DTOs, and types to match and remove any remaining scheduled status value/usage at the type level. Update unit tests that directly reference the changed model so the suite compiles and passes; do not build new feature behavior here (that lands in later subtasks).

Allowed files:
- `apps/api/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- The amended MS3 migration reflects all the schema changes above, runs cleanly on a fresh MySQL 5.7.44-compatible database (migration:run and migration:show succeed), and contains no scheduled status value.
- Entities, DTOs, and types compile against the normalized model with no lingering scheduled references.
- The duplicate navigation migration is removed and database.config.ts migration registration is internally consistent.
- Directly-affected API unit tests are updated and the API test suite is green.

Validation guidance:
- Run the API build, lint, typecheck, test, and migration commands per docs/website-launch-guide.md, including migration:run/migration:show against a disposable MySQL 5.7-compatible database.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts`.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-completion-and-copilot-port/subtask-1/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 2: Media pipeline completion and durable storage
```text
Your role is 'implementer'. Your task is as follows:
Complete the Milestone 3 media pipeline on ms3-claude so the app boots and uploaded images persist, serve, and are role-scoped. This subtask is security-sensitive (untrusted file upload, path traversal, public serving, authorization) and will receive specialist Security review.

Do the following:
- Declare multer as a direct dependency and @types/multer as a devDependency in apps/api/package.json; replace the runtime require("multer") in media.controller.ts with a normal import where practical; verify the API container boots (the current failure is Error: Cannot find module 'multer') and that migration:run works inside the container.
- Add a public GET /api/media/:id route that streams the stored file from configured storage, resolving the file from the stored storageKey (path-traversal-safe; never from user-supplied paths), serving only allowed image content, and aligned with the url MediaService returns.
- Enforce role-aware upload scope: blog-post and standalone-page uploads require admin; blog-comment uploads require an authenticated user; unauthenticated uploads are rejected (401).
- Add alt-text capture to the ImageUpload component and emit it into the inserted Markdown image syntax; ensure MarkdownRenderer renders the alt attribute. Fix the duplicate image-upload-input DOM id so multiple widgets coexist on one page.
- Add a durable storage volume for MEDIA_STORAGE_PATH in cicd/docker/compose.dev.yml and cicd/docker/compose.prod.yml, and ensure MEDIA_STORAGE_PATH points at the mounted path.

Allowed files:
- `apps/api/**`
- `apps/web/components/image-upload.tsx`
- `apps/web/components/markdown-renderer.tsx`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `cicd/docker/compose.dev.yml`
- `cicd/docker/compose.prod.yml`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- The API container starts without the multer MODULE_NOT_FOUND error, multer is a declared dependency, and migrations run inside the container.
- Uploaded images are retrievable via GET /api/media/:id and render in content; the served path is resolved safely from storageKey with no path traversal; only allowed image content is served.
- Upload authorization is role-scoped: non-admins cannot upload for blog-post/standalone-page; authenticated users can upload for blog-comment; unauthenticated uploads return 401.
- ImageUpload captures alt text and inserts it into the Markdown image; multiple ImageUpload widgets on a page have unique ids.
- Uploaded files persist across container restarts via the configured storage volume in both dev and prod compose.

Validation guidance:
- Run the API and web build, lint, typecheck, and test commands per docs/website-launch-guide.md.
- Validate container boot and an upload→serve round trip, not only unit-level assertions; add tests for role-scoped upload authorization, path-safe serving, missing-media, and MIME/size rejection.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-completion-and-copilot-port/subtask-2/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 3: Blog publishing — scheduling, summary, sanitization, featured image, pin/feature
```text
Your role is 'implementer'. Your task is as follows:
Complete the Milestone 3 blog publishing behavior on ms3-claude. This subtask is security-sensitive (publish-state leakage and server-side sanitization) and will receive specialist Security review.

Do the following:
- Implement query-time public visibility: a post is public iff status=published AND publishedAt<=now. Publish-now sets publishedAt to the current time; publish-at-future sets publishedAt to the chosen future time; unpublish returns the post to draft and hides it. Do not add a background job.
- In the admin list, label published posts whose publishedAt is in the future as "scheduled / goes live at <time>".
- Add the blog summary to create/edit flows and use it in public listings/meta.
- Route blog post create/update bodies through validateMarkdownBody/normalizeMarkdownBody for server-side sanitization parity with comments.
- Wire ImageUpload into the blog admin editor for the featured image; render the featured image on public blog list/detail; validate featuredImageId references existing media.
- Implement pin/feature: a pinned/featured post surfaces first in the public listing; only authorized admins may toggle it.

Allowed files:
- `apps/api/**`
- `apps/web/app/admin/blog/**`
- `apps/web/app/blog/**`
- `apps/web/components/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- A future-dated published post is hidden from public routes until publishedAt<=now, then becomes visible with no manual action or background job; drafts and unpublished posts are never public.
- Publish-now sets publishedAt to the current time; unpublish returns the post to draft and hides it; the admin UI labels published-future posts as scheduled.
- Blog post bodies are sanitized/normalized server-side on create and update; unsafe bodies are rejected or neutralized.
- Featured images upload via ImageUpload in the admin editor and render on public blog views; featuredImageId is validated against existing media.
- A post can be pinned/featured and surfaces first in the public listing; only admins can toggle it; summary is editable and shown in listings/meta.

Validation guidance:
- Run the web and API build, lint, typecheck, and test commands per docs/website-launch-guide.md.
- Add or update automated tests for publishedAt-driven visibility (including future-dated and unpublished cases), server-side post sanitization, featured-image rendering, and pin/feature ordering.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-completion-and-copilot-port/subtask-3/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 4: Comments — persisted media reference, 1-level threading, lock-thread, moderation
```text
Your role is 'implementer'. Your task is as follows:
Complete the Milestone 3 blog comment behavior on ms3-claude. This subtask is security-sensitive (public user-generated content, untrusted input, moderation authorization, media usage scope) and will receive specialist Security review.

Do the following:
- Persist the comment media reference (mediaReferenceId) with a usage-scope check (the referenced media must be blog-comment-scoped); stop dropping the incoming imageId.
- Implement 1-level threaded comments: parentId permits exactly one level of replies (reject nesting deeper than one level); render a threaded reply UI.
- Implement comment-thread locking: moderators/admins can lock a post's comments (commentsLocked); when locked, comment creation is rejected; reflect lock state in the UI.
- Preserve and confirm: public read returns only visible comments on published posts; authenticated members can create comments on eligible published, unlocked posts; moderators/admins can remove/hide comments; comment bodies are validated server-side.

Allowed files:
- `apps/api/**`
- `apps/web/app/blog/**`
- `apps/web/components/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- Guests read visible comments on published posts; authenticated members create comments on eligible published, unlocked posts; replies nest at most one level and deeper nesting is rejected.
- A comment image upload persists a structured comment media reference validated as blog-comment-scoped; the previously dangling imageId is no longer dropped.
- Moderators/admins can lock a post's comment thread (blocking new comments) and remove/hide comments through explicit authorized flows.
- Comment creation and rendering use the shared sanitization model and never expose unpublished parent content.

Validation guidance:
- Run the web and API build, lint, typecheck, and test commands per docs/website-launch-guide.md.
- Add or update automated tests for one-level threading enforcement, comment media-reference scope validation, thread-lock enforcement, moderation authorization, and unpublished-parent protection.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-completion-and-copilot-port/subtask-4/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 5: Standalone pages — top-level routing, reserved slugs, enriched revisions, featured media, sanitization
```text
Your role is 'implementer'. Your task is as follows:
Complete the Milestone 3 standalone-page behavior on ms3-claude. This subtask is security-sensitive (public-visibility leakage, route-collision/reserved-slug safety, server-side sanitization) and will receive specialist Security review.

Do the following:
- Serve published standalone pages at top-level routes (e.g. /about, /rules, /contact) via a root catch-all evaluated AFTER all reserved/static routes; add and enforce a reserved-slug denylist (at minimum admin, api, app, blog, login, register, onboarding, profile, settings, health) on page create/edit and at routing time.
- Use the enriched page-revision metadata: capture summary and change_note on edit, record editor_user_id, and support featured_media_id.
- Wire ImageUpload into the page admin editor for the featured media; render the featured image on the public page; route page bodies through validateMarkdownBody/normalizeMarkdownBody on create/update/restore.
- Fix the per-fetch full-revision scan so the current page body is resolved efficiently rather than by scanning the entire revision list on every fetch.
- Maintain scope discipline: no block-builder UI/schema and no wiki hierarchy.

Allowed files:
- `apps/api/**`
- `apps/web/app/**`
- `apps/web/components/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/deferred-tasks.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- Published standalone pages render at top-level paths; the root catch-all is evaluated last and never shadows existing or reserved routes; reserved slugs are rejected on create/edit.
- Only published pages are public; draft/unpublished revisions remain protected.
- Every edit creates a durable revision capturing summary, change note, editor user, and featured media; restore creates a new revision (audit trail preserved).
- Page bodies are sanitized/normalized server-side on create/update/restore; featured media uploads via ImageUpload and renders publicly; current-body resolution no longer scans the full revision list per fetch.
- No block-builder or wiki behavior is introduced.

Validation guidance:
- Run the web and API build, lint, typecheck, and test commands per docs/website-launch-guide.md.
- Add or update automated tests for top-level routing and route precedence, reserved-slug rejection, published-only visibility, revision metadata + restore, and server-side page sanitization.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-completion-and-copilot-port/subtask-5/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 6: Navigation — child rendering, external links, publication-aware filtering, endpoint authz, safe fallback
```text
Your role is 'implementer'. Your task is as follows:
Complete the Milestone 3 admin-managed navigation behavior on ms3-claude. This subtask is security-sensitive (publication leakage, endpoint authorization, visibility enforcement) and will receive specialist Security review.

Do the following:
- Render top-level items plus one dropdown level of children in the shell (apps/web/components/navigation.tsx), keyboard-accessible (focusable triggers, appropriate ARIA, escape/blur to close). Keep ms3-claude's safe [] fallback on API error; do NOT adopt a hardcoded /about,/rules,/contact fallback.
- Add external-link handling: linkType=external renders a proper external href with appropriate target/rel.
- Implement publication-aware filtering in NavigationService.findPublic: filter children by isActive/visibility and omit any nav entry whose linked internal blog/page target is not publicly visible.
- Fix the authenticated navigation endpoint: require a valid authenticated session; distinguish authenticated vs admin visibility so admin-only items are not returned to ordinary members; apply the same isActive/visibility child filtering there.
- Remove the unused NotFoundException import in apps/api/src/navigation/navigation.controller.ts.

Allowed files:
- `apps/api/**`
- `apps/web/components/navigation.tsx`
- `apps/web/app/navigation/**`
- `apps/web/app/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- The shell renders one level of dropdown children, keyboard-accessible; external links render with correct target/rel; internal links resolve to implemented routes.
- The public nav API filters children by isActive/visibility and omits entries whose linked blog/page target is not publicly visible; no unpublished or hidden destination leaks to guests.
- The authenticated nav endpoint requires a valid session and never returns admin-only items to non-admins; its children are visibility-filtered.
- On nav API error/empty/invalid response, the shell falls back to no content links ([]) — never to hardcoded routes that could point at unpublished pages.
- The unused NotFoundException import is removed and lint passes.

Validation guidance:
- Run the web and API build, lint, typecheck, and test commands per docs/website-launch-guide.md.
- Add or update automated tests for child rendering, external-link handling, child isActive/visibility filtering, linked-target publication filtering, authenticated-endpoint session enforcement and admin-item exclusion, and safe-fallback behavior.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-completion-and-copilot-port/subtask-6/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```
