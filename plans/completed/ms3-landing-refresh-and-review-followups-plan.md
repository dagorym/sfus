# Milestone 3 Landing Refresh And Review Follow-ups Plan

## Planner Activation
- Requested agent: `planner`
- Repository instruction source: `AGENTS.md` plus `.myteam` role/skill content loaded through `myteam`.
- Base branch: `ms3-claude` (current branch) — the in-flight Milestone 3 build to continue from.
- Workflow obligations being followed:
  - Stay in planning mode only; do not write implementation code.
  - Resolve material design decisions with the user before decomposition (done — see Resolved Decisions).
  - Decompose into ordered, implementation-ready subtasks with dependencies, acceptance criteria, and documentation impact.
  - Provide a launch-ready Implementer prompt per subtask.
  - Write the final plan to a unique markdown file under `plans/`.
- In-cycle planner action already performed: the Milestone 3 deferred-scope items flagged by the reviewer were appended to `docs/deferred-tasks.md` during this planning cycle (per `AGENTS.md`, that register is edited only during planning), satisfying reviewer follow-up C5. No implementer subtask is needed for it.

## Overview
Milestone 3 is implemented on `ms3-claude` and the final reviewer pass returned **CONDITIONAL PASS** (`artifacts/ms3-completion-and-copilot-port/final-review/reviewer_report.md`). This plan finishes Milestone 3 by combining a user-facing landing refresh with the reviewer's remaining follow-ups. It has four threads:

1. **Auth error-message accuracy.** The register page maps any API `>= 500` response to a misleading "Registration is unavailable while local prerequisites are incomplete… migrations have been run" message, and the login page collapses every failure into "Sign-in failed." Both should distinguish a *service-unavailable* condition (network failure or `5xx`) from *credential/validation* errors (`4xx`). This recently caused a real misdiagnosis: a crashed API surfaced as a "database/migrations" problem.
2. **Landing page Milestone 3 refresh.** `apps/web/app/page.tsx` is a static server component whose copy still describes "Milestone 2." Replace it with Milestone 3 messaging, add a recent-posts blog feed, and add a "What's new in Milestone 3" section that surfaces the blog, standalone pages, navigation, comments, and media. This is grounded in the design source of truth, which calls for a "blog-style front page" that "surfaces what's new" (`star_frontiers_rpg_website_design.md` §1, §3).
3. **Publication-leakage fixes (reviewer WARNINGs).** Navigation publication filtering does not cover standalone pages linked by their canonical top-level route (e.g. `/about`), and the blog `listComments` UUID-fallback does not enforce the full public-visibility predicate, so a future-scheduled post addressed by UUID returns `200` instead of `404`.
4. **Robustness + documentation accuracy (reviewer NOTEs/WARNINGs).** Harden media serving against a vanished-file race, and correct the stale `navigation_items` migration attribution in `docs/README.md`.
5. **Optional blog-post slug.** Specifying a slug when creating a blog post should be optional; when omitted, the system generates a unique slug from the post title.
6. **Standalone page creation is broken (confirmed bug).** Creating a page returns a generic "Failed to create page." Two stacked defects: (a) `PagesService.create` saves the `page_revisions` child row before the parent `standalone_pages` row, violating the `fk_page_revisions_page_id` foreign key (HTTP 500); (b) the admin pages/blog API clients read the error message from top-level `payload.message`, but the API error envelope nests it under `payload.error.message`, so the real server message is never surfaced.

Sample content (a standalone page, a blog post, and the supplied Twitter image) will **not** be seeded by code. Per the user's decision, that content is created manually through the existing admin authoring UI; this plan only ensures the homepage feed and links degrade gracefully until it exists.

### Confirmed repository context
- The web app fetches content **client-side via the relative `/api` base**; the blog list page (`apps/web/app/blog/page.tsx`) is a `"use client"` component using `listPublishedPosts()` from `apps/web/app/blog/blog-client.ts`. Public `GET /api/blog` returns `{ posts: BlogPostSummary[] }` with `title`, `slug`, `summary`, `publishedAt`, `featuredImageId`, and `tags` — sufficient for a homepage feed.
- The landing page `apps/web/app/page.tsx` is a static server component with hardcoded "Milestone 2" strings in a `highlights` array, the hero copy, and two `metaCard`s.
- The register page (`apps/web/app/register/page.tsx`) `describeRegistrationError` maps `statusCode >= 500` to `registrationSetupErrorMessage` (the misleading text) and otherwise falls back to "Registration failed." The login client (`apps/web/app/login/login-client.tsx`) catches all failures and shows "Sign-in failed. Verify your credentials and try again." with no status inspection.
- Navigation publication filtering lives in `apps/api/src/navigation/navigation.service.ts` (reviewer cites lines ~306–331) and recognizes only `/blog/<slug>` and `/pages/<slug>` link URLs.
- Blog `listComments` UUID-fallback lives in `apps/api/src/blog/blog.controller.ts` (reviewer cites lines ~246–247) and checks only `status === 'published'`, not `publishedAt <= now`. Public visibility elsewhere uses `status = published AND publishedAt <= now` (LessThanOrEqual) in `apps/api/src/blog/blog.service.ts`.
- Media serving in `apps/api/src/media/media.controller.ts` (reviewer cites line ~149) pipes `fs.createReadStream(media.filePath)` with no stream `error` handler after the service's existence check (TOCTOU).
- `PagesService.create` (`apps/api/src/pages/pages.service.ts:119-157`) saves the revision (`revisionRepository.save`) before the page (`pageRepository.save`), so the `page_revisions.page_id` FK references a not-yet-inserted `standalone_pages` row. Confirmed against the running API logs: `QueryFailedError: Cannot add or update a child row: a foreign key constraint fails (fk_page_revisions_page_id)`, HTTP 500. The `update` path is unaffected because the page already exists. `standalone_pages.current_revision_id` is nullable, so the correct order is page-first (null revision) → revision → set `current_revision_id`, ideally in a transaction. Unit tests miss this because repositories are mocked.
- The API error envelope from `JsonExceptionFilter` is `{ error: { code, message, statusCode }, request: {...} }`. `apps/web/app/pages/pages-client.ts` and `apps/web/app/blog/blog-client.ts` read `payload?.message` (always undefined) rather than `payload?.error?.message`, so admin create/update failures always show the generic fallback text instead of the real server message. The register/login pages already read `payload.error.message` correctly.
- Blog post creation (`apps/api/src/blog/**`, `apps/web/app/admin/blog/new/page.tsx`, `apps/web/app/blog/blog-client.ts`) currently requires a non-empty `slug` (the create parser rejects a missing/blank slug); `blog_posts.slug` has a unique constraint.
- `docs/README.md` (reviewer cites line ~429) still attributes `navigation_items` to the deleted migration `1748736000001-navigation-items.ts`; the table is now created by `1748736000000-milestone-three-content-foundation.ts`.
- There is **no public index route for standalone pages** — only `GET /api/pages/:slug` (single page) and the top-level `/<slug>` catch-all. Admin promotion is DB-only (`users.global_role`), and admin authoring screens (`/admin/blog`, `/admin/pages`, `/admin/navigation`) already exist with inline image upload and a markdown editor.

### Likely implementation surfaces
- `apps/web/app/register/page.tsx`, `apps/web/app/login/login-client.tsx`
- `apps/web/app/page.tsx`, `apps/web/app/page.module.css`, a new client feed component under `apps/web/components/**`
- `apps/api/src/navigation/**`, `apps/api/src/blog/**`, `apps/api/src/media/**`
- `docs/README.md`

## Resolved Decisions
All material design/scope decisions were resolved with the user before decomposition.

| # | Decision | Resolution |
|---|---|---|
| Base | Branch to build on | `ms3-claude` (current branch) |
| D1 | Sample page/post/image seeding | **No code seeding.** User creates the page, post, and image upload manually through the existing admin authoring UI; the homepage feed/links must degrade gracefully until content exists. |
| D2 | Seed content author/owner | N/A — no automated seeding. (Both real accounts were promoted to `admin` out-of-band to enable manual authoring.) |
| D3 | Reviewer follow-ups to include | **Everything, including optional hardening:** nav top-level publication-leak fix, `listComments` future-scheduled `404` fix, media read-stream hardening, blog scheduling-visibility test tightening, deferred-scope recording (done in-cycle), and the `docs/README.md` migration-attribution correction. |
| D4 | Homepage surface scope | **Refreshed MS3 copy + recent-posts feed + "What's new in MS3" section** linking to the blog, the standalone page (convention slug), and navigation. |
| D5 | Homepage standalone-page link target | **Convention slug `/about`.** The homepage links to `/about`; the user creates and publishes a standalone page with slug `about`. The link is static and may 404 until that page is published (accepted). |
| D6 | Auth-fix scope and copy | Update **both** register and login. Distinguish service-unavailable (network failure or HTTP `>= 500`) → a clear "service temporarily unavailable" message — from credential/validation errors (`4xx`), which keep their specific copy. The misleading `registrationSetupErrorMessage` text is removed. |
| D7 | Recent-posts feed size/sourcing | Latest **3** published posts, fetched client-side via the existing `listPublishedPosts()` (relative `/api`), mirroring the blog list page; loading/empty/error states handled. |
| D8 | Optional-slug collision handling | When a blog-post slug is omitted, generate it from the title (lowercase, hyphenated, URL-safe). On collision with an existing slug, append an incrementing numeric suffix (`-2`, `-3`, …) until unique. An explicitly supplied slug is still validated and used as-is. Scope is **blog posts only** (the user's request); standalone pages keep their required slug. |
| D9 | Page-create bug root cause | Confirmed via running-API logs: FK insert-ordering in `PagesService.create` (HTTP 500) plus admin-client error-message field mismatch. Fix both; no schema change. |

## Subtasks

### Subtask 1: Auth error-message disambiguation (register + login)
- Stable ID: `subtask-1`
- Security review required: no (user-facing error copy; the only security-adjacent concern is not leaking internal detail — keep messages generic).
- Dependencies: none.
- Scope:
  - In `apps/web/app/register/page.tsx`, change `describeRegistrationError` so that an HTTP `>= 500` status and a network/transport failure (fetch throws, no status) both produce a single clear service-unavailable message (e.g. "The service is temporarily unavailable. Please try again in a moment."). Remove the misleading `registrationSetupErrorMessage` ("…local prerequisites are incomplete…run migrations") wording. Keep the `409` duplicate-account message and the `400` invalid-input message unchanged.
  - In `apps/web/app/login/login-client.tsx`, inspect the login response status instead of collapsing all failures: `400`/`401` (and other `4xx`) keep the existing credential message ("Sign-in failed. Verify your credentials and try again."); HTTP `>= 500` and network/transport failures show the same service-unavailable message. Preserve the existing MFA-challenge and onboarding redirect behavior and the MFA-path error copy.
- Acceptance criteria:
  - When the API responds `500`/`503`, the register page shows the service-unavailable message and never the removed "prerequisites/migrations" text.
  - When the API is unreachable (network/transport failure), both the register and login pages show the service-unavailable message.
  - Register still shows the duplicate-account message on `409` and the invalid-input message on `400`.
  - Login still shows the credential message on `400`/`401`, and HTTP `>= 500` from login shows the service-unavailable message.
  - Existing MFA-challenge, onboarding, and success-redirect flows are unchanged.
- Documentation Impact: none expected (user-facing copy only). If `docs/README.md` or `docs/website-launch-guide.md` documents the auth error strings, the downstream Documenter stage should align them.

### Subtask 2: Landing page Milestone 3 refresh + recent-posts feed + "What's new" section
- Stable ID: `subtask-2`
- Security review required: no.
- Dependencies: none (uses the existing public `GET /api/blog`).
- Scope:
  - Rewrite the landing copy in `apps/web/app/page.tsx` (and adjust `apps/web/app/page.module.css` as needed) to describe Milestone 3 instead of Milestone 2: replace the `highlights` entries and hero/`metaCard` text so they describe the blog, standalone pages, media, navigation, and comments rather than the Milestone 2 foundation.
  - Add a recent-posts blog feed: a new `"use client"` feed component (e.g. `apps/web/components/recent-posts-feed.tsx`) that calls `listPublishedPosts()`, renders the latest 3 published posts (title linking to `/blog/<slug>`, summary, published date), and handles loading, empty ("No posts yet"), and error states gracefully. Keep the landing page a server component and embed the client feed component within it.
  - Add a "What's new in Milestone 3" section with a link to the blog index (`/blog`), a link to the standalone page at the convention slug `/about`, and copy/links that surface navigation and comments. The blog index link and feed must render correctly even when zero posts are published.
- Acceptance criteria:
  - The landing page contains no remaining "Milestone 2" references; copy describes Milestone 3 capabilities.
  - The homepage renders a recent-posts feed of up to 3 published posts, each linking to its `/blog/<slug>` detail page; with zero published posts it shows a graceful empty state and the page still renders; on fetch failure it shows a non-fatal error state without breaking the page.
  - The homepage includes a visible link to `/blog` and a visible link to `/about`, plus copy surfacing navigation and comments.
  - The landing page builds and lints clean and renders without runtime errors.
- Documentation Impact: `docs/README.md` — update any description of the public landing/home experience to reflect the Milestone 3 content, the recent-posts feed, and the `/about` convention link (handled by the downstream Documenter stage).

### Subtask 3: Navigation publication-leak fix for top-level page links
- Stable ID: `subtask-3`
- Security review required: yes (publication leakage of unpublished standalone pages through public navigation).
- Dependencies: none functionally; see Dependency Ordering for shared-doc serialization with subtasks 4 and 5.
- Scope:
  - Extend `apps/api/src/navigation/navigation.service.ts` linked-target publication filtering so that an internal nav item whose URL is a single-segment, non-reserved path (e.g. `/about`) is resolved against `standalone_pages` (published-only) before being treated as a static route; omit the entry from public navigation when the linked page is not publicly visible. Preserve the existing `/blog/<slug>` and `/pages/<slug>` filtering and the safe `[]` fallback. Align the method JSDoc with the new behavior.
  - As part of this subtask's deliverable, correct `docs/README.md` so the `navigation_items` schema section attributes the table to `1748736000000-milestone-three-content-foundation.ts` and drops the reference to the deleted `1748736000001-navigation-items.ts` migration (reviewer follow-up C6).
- Acceptance criteria:
  - A public navigation request omits any internal nav item that links — by `/pages/<slug>` **or** by the canonical top-level `/<slug>` route — to a standalone page that is not published; published-page links and external/static links continue to render.
  - Reserved/static single-segment routes (per the existing reserved-slug denylist) are not misclassified as page links and continue to render.
  - The safe `[]` fallback and existing `/blog/<slug>` filtering behavior are preserved.
  - `docs/README.md` attributes `navigation_items` to the consolidated MS3 migration with no reference to the deleted migration file.
- Documentation Impact: `docs/README.md` navigation section (publication-aware filtering now covers top-level page links) and the `navigation_items` migration attribution correction above.

### Subtask 4: Blog `listComments` future-scheduled visibility fix
- Stable ID: `subtask-4`
- Security review required: yes (publication leakage / public-surface consistency for scheduled posts).
- Dependencies: none functionally; see Dependency Ordering for shared-doc serialization with subtasks 3 and 5.
- Scope:
  - Make the `listComments` UUID-fallback in `apps/api/src/blog/blog.controller.ts` (and any supporting `apps/api/src/blog/blog.service.ts` lookup) enforce the full public-visibility predicate `status = published AND publishedAt <= now`, so a future-scheduled post addressed by its UUID returns `404` like every other public surface, rather than `200` with an empty comments payload. Reuse the existing visibility predicate used by `findPublished`/`findPublishedBySlug` rather than duplicating logic.
- Acceptance criteria:
  - `GET /api/blog/:postId/comments` for a future-scheduled (published-but-`publishedAt` in the future) post addressed by UUID returns `404`.
  - Comment listing for genuinely public (published and due) posts is unchanged, by slug and by UUID.
  - Draft/unpublished posts continue to return `404` on this route.
- Documentation Impact: `docs/README.md` blog/comments section — note that the comment-listing route enforces the same scheduled-post visibility invariant as all other public surfaces (downstream Documenter stage).

### Subtask 5: Media serving read-stream hardening
- Stable ID: `subtask-5`
- Security review required: no (robustness/availability hardening; not a leakage vector since the path is server-resolved).
- Dependencies: none functionally; see Dependency Ordering for shared-doc serialization with subtasks 3 and 4.
- Scope:
  - In `apps/api/src/media/media.controller.ts`, attach an `error` handler to the `fs.createReadStream(...)` used by the image-serving route so that a file which disappears between the service's existence check and stream open results in a controlled `404` (or a clean error response) instead of an unhandled stream error / dangling response. Do not change the path-resolution or content-type behavior.
- Acceptance criteria:
  - If the resolved media file is missing at stream time, the serving route returns a controlled `404`/clean error response with no unhandled-stream crash or hung connection.
  - Normal image serving (existing, present files) is unchanged: correct bytes, content type, and status.
- Documentation Impact: `docs/README.md` media section may note the hardened failure mode (downstream Documenter stage); no contract change.

### Subtask 6: Optional blog-post slug with auto-generation from title
- Stable ID: `subtask-6`
- Security review required: no.
- Dependencies: none functionally; serialize with `subtask-4` (shared `apps/api/src/blog/**`) and with the shared-doc group — see Dependency Ordering.
- Scope:
  - Make `slug` optional on blog-post creation in the API (`apps/api/src/blog/**`): when the slug is omitted or blank, derive it from the title — lowercased, non-alphanumeric runs collapsed to single hyphens, trimmed of leading/trailing hyphens, URL-safe. Guarantee uniqueness against existing `blog_posts.slug` values by appending an incrementing numeric suffix (`-2`, `-3`, …) on collision. An explicitly provided slug is validated and used unchanged (existing behavior).
  - Update the blog admin create form `apps/web/app/admin/blog/new/page.tsx` so the slug field is optional (not `required`), with helper text that it is auto-generated from the title when left blank. Update `apps/web/app/blog/blog-client.ts` so `CreateBlogPostInput.slug` is optional.
  - While editing `apps/web/app/blog/blog-client.ts`, also correct its admin error parsing to read `payload?.error?.message` (the actual API envelope) instead of `payload?.message`, so blog admin failures surface the real server message.
- Acceptance criteria:
  - Creating a blog post with no slug succeeds and produces a unique, URL-safe slug derived from the title; the post is retrievable at that slug.
  - Two posts created from titles that slugify identically both succeed and receive distinct slugs (second gets a numeric suffix).
  - Creating a blog post with an explicit slug behaves exactly as before (validated and used as-is).
  - The blog admin create form accepts an empty slug and indicates auto-generation; an API error during blog admin actions shows the real server message rather than only a generic fallback.
- Documentation Impact: `docs/README.md` blog section — document that slug is optional on create and auto-generated from the title with collision-suffixing (downstream Documenter stage).

### Subtask 7: Fix standalone page creation (FK insert-ordering) and surface admin API errors
- Stable ID: `subtask-7`
- Security review required: no (correctness/availability fix; no trust-boundary or authorization change).
- Dependencies: none functionally; serialize with the shared-doc group if it edits `docs/README.md` — see Dependency Ordering.
- Scope:
  - Fix `PagesService.create` in `apps/api/src/pages/pages.service.ts` so the parent `standalone_pages` row is persisted before the `page_revisions` row that references it, then set `current_revision_id` — eliminating the `fk_page_revisions_page_id` foreign-key violation. Wrap the multi-row create in a single transaction so a partial failure cannot leave an orphaned page or revision. Preserve the existing return shape and revision-numbering behavior; do not change the schema.
  - Correct the admin error parsing in `apps/web/app/pages/pages-client.ts` to read `payload?.error?.message` (the actual `JsonExceptionFilter` envelope) instead of `payload?.message`, so page admin create/update failures surface the real server message instead of only the generic fallback.
- Acceptance criteria:
  - Creating a standalone page via `POST /api/pages/admin/pages` with valid title/slug/body succeeds (HTTP 2xx), persists the page and its revision 1, and sets `current_revision_id`; no foreign-key error occurs.
  - A create failure cannot leave an orphaned `standalone_pages` row without its revision or vice versa (transactional).
  - Page admin create/update error responses surface the real server message in the UI rather than only a generic fallback.
  - Existing page update, publish, unpublish, revision, and restore behavior is unchanged.
- Documentation Impact: none required beyond accuracy; if `docs/README.md` describes the page-create flow, the downstream Documenter stage should keep it accurate.

## Acceptance Criteria (feature-level)
This feature is complete when all of the following hold:
- Register and login distinguish service-unavailable (network/`5xx`) from credential/validation (`4xx`) errors, and the misleading "prerequisites/migrations" register text is gone.
- The landing page describes Milestone 3, shows a graceful recent-posts feed (latest 3) that works with zero or many posts, and links to `/blog` and `/about` while surfacing navigation and comments.
- Public navigation never exposes a nav entry that links to an unpublished standalone page, whether linked by `/pages/<slug>` or by its top-level `/<slug>` route, with the safe `[]` fallback preserved.
- `GET /api/blog/:postId/comments` returns `404` for a future-scheduled post addressed by UUID, consistent with every other public surface.
- Media serving fails closed to a controlled `404` when a file vanishes at stream time, with normal serving unchanged.
- Blog posts can be created without a slug; one is auto-generated from the title and is unique, with explicit slugs still honored.
- Standalone page creation succeeds (no foreign-key error) and is transactional, and admin page/blog API errors surface the real server message in the UI.
- `docs/deferred-tasks.md` records the remaining Milestone 3 deferred scope (done in-cycle), and `docs/README.md` no longer references the deleted `navigation_items` migration.

## Documentation Impact (Overall)
- `docs/deferred-tasks.md`: remaining MS3 deferred-scope items recorded during this planning cycle (SEO, reports/moderation queue, per-user editor preference + unified media-library picker, full WCAG 2.1 AA sweep, true WYSIWYG, comment rate-limiting/anti-spam). **Already applied** — not an implementer deliverable.
- `docs/README.md`: navigation publication-aware filtering now covers top-level page links; `navigation_items` migration attribution corrected; comment-listing scheduled-visibility invariant; landing/home experience description; optional media failure-mode note.
- No `docs/website-launch-guide.md` change is expected unless it documents the changed auth error strings.

## Deferred Scope (recorded in `docs/deferred-tasks.md`)
Recorded in-cycle (reviewer follow-up C5); listed here for traceability:
- SEO: OpenGraph/meta tags, sitemaps, canonical URLs.
- Reports / moderation queue for arbitrary objects.
- Per-user editor-mode preference and a unified media-library picker with drag-and-drop.
- Full WCAG 2.1 AA accessibility sweep.
- True WYSIWYG editing surface.
- Comment rate-limiting / anti-spam.

## Dependency Ordering
- No subtask is a functional prerequisite of another; all seven change disjoint behavior.
- Shared-file serialization (`docs/README.md`): `subtask-3`, `subtask-4`, `subtask-5`, and `subtask-6` each edit `docs/README.md`. To avoid merge contention they should run **serially in the order 3 → 4 → 5 → 6** (or have their `docs/README.md` edits coordinated by the Coordinator). `subtask-7` may also touch `docs/README.md`; if so, place it after `subtask-6` in the same serial chain.
- Shared-module serialization (`apps/api/src/blog/**`): `subtask-4` and `subtask-6` both edit the blog module; the 3 → 4 → 5 → 6 order already serializes them.

Parallelization notes:
- Web-only group `{subtask-1, subtask-2}` touches disjoint files (`register`/`login` vs `page.tsx`/`page.module.css`/new feed component) and is safely parallelizable with each other.
- `subtask-7` (pages module + `pages-client.ts`) shares no code files with the other subtasks and is parallelizable with the web group and the API serial chain, except for any `docs/README.md` edit (coordinate as above).
- The web group and the API serial chain `{subtask-3 → subtask-4 → subtask-5 → subtask-6}` are otherwise independent and may run concurrently.

## Risks And Mitigations
1. Changing the register copy breaks the source-contract test `apps/web/app/public-shell.spec.ts`, which asserts the old message text.
   - Mitigation: this is expected; the downstream Tester stage updates the assertion to the new service-unavailable copy. `public-shell.spec.ts` is tester-owned and is not in any implementer allowed-file list.
2. The `/about` homepage link 404s until the user creates and publishes a standalone page with slug `about`.
   - Mitigation: accepted per decision D5; the link is intentionally static and the feed/empty states keep the page functional regardless.
3. Single-segment internal path resolution in navigation could misclassify a legitimate static route as a page link (or vice versa).
   - Mitigation: resolve only non-reserved single-segment paths against `standalone_pages`, reuse the existing reserved-slug denylist, and require tests for both a published top-level page link (renders) and an unpublished one (omitted).
4. The `listComments` visibility fix could over-restrict and 404 genuinely public posts.
   - Mitigation: reuse the exact `status = published AND publishedAt <= now` predicate already used by the public list/detail paths; require regression tests for published-and-due (by slug and UUID) plus future-scheduled (404).
5. Web content feed depends on client-side fetch and the API being reachable.
   - Mitigation: the feed degrades to a non-fatal error/empty state and the rest of the landing page renders independently.
6. Auto-generated blog slugs could collide or produce empty/degenerate slugs (e.g. a title with no alphanumeric characters).
   - Mitigation: enforce uniqueness with a numeric suffix and fall back to a safe non-empty default when the title slugifies to empty; require tests for the collision and empty-slugify cases.
7. The page-create fix is validated only by mocked unit tests (which already pass despite the real FK violation).
   - Mitigation: require an integration-style test that exercises `PagesService.create` against a real (or in-memory equivalent) schema with the foreign key enforced, asserting a page and its revision are persisted with no FK error; verify a real create round-trip against the running stack.

## Output Artifact Path
- `plans/ms3-landing-refresh-and-review-followups-plan.md`

## Implementer Prompts

### Subtask 1: Auth error-message disambiguation (register + login)
```text
Your role is 'implementer'. Your task is as follows:
On the ms3-claude branch, make the register and login pages distinguish a service-unavailable condition (network/transport failure, or an HTTP status >= 500) from credential/validation errors (4xx), so a crashed or unreachable API no longer surfaces as a misleading "database/migrations" problem.

Do the following:
- In apps/web/app/register/page.tsx, update describeRegistrationError so that an HTTP status >= 500 AND a network/transport failure (fetch throws with no status) both yield one clear service-unavailable message, e.g. "The service is temporarily unavailable. Please try again in a moment." Remove the misleading registrationSetupErrorMessage wording ("…local prerequisites are incomplete…run migrations"). Keep the existing 409 duplicate-account message and 400 invalid-input message exactly as they are.
- In apps/web/app/login/login-client.tsx, stop collapsing all failures into one string: inspect the login response status. For 400/401 (and other 4xx), keep the existing credential message ("Sign-in failed. Verify your credentials and try again."). For HTTP status >= 500 and for network/transport failures, show the same service-unavailable message used by the register page. Preserve the existing MFA-challenge handling, onboarding redirect, success redirect, and MFA-path error copy.

Allowed files:
- `apps/web/app/register/page.tsx`
- `apps/web/app/login/login-client.tsx`

Implementation-outcome acceptance criteria:
- A 500/503 API response on register shows the service-unavailable message and never the removed prerequisites/migrations text.
- A network/transport failure on register and on login shows the service-unavailable message.
- Register still shows the duplicate-account message on 409 and the invalid-input message on 400.
- Login still shows the credential message on 400/401, and an HTTP status >= 500 on login shows the service-unavailable message.
- MFA-challenge, onboarding, and success-redirect flows are unchanged.

Validation guidance:
- Run the web build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- The source-contract test apps/web/app/public-shell.spec.ts asserts the old register message text and will need updating to the new service-unavailable copy; that file is tester-owned. Tester-owned tests live under apps/web/app/**/*.spec.ts.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-landing-refresh-and-review-followups/subtask-1/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 2: Landing page Milestone 3 refresh + recent-posts feed + "What's new" section
```text
Your role is 'implementer'. Your task is as follows:
On the ms3-claude branch, refresh the public landing page to describe Milestone 3 and surface the new content, following the existing client-side content-fetch pattern (relative /api base, as in apps/web/app/blog/page.tsx).

Do the following:
- Rewrite the landing copy in apps/web/app/page.tsx (adjusting apps/web/app/page.module.css as needed) so the hero, the highlights array, and the metaCards describe Milestone 3 capabilities (blog, standalone pages, media, navigation, threaded comments) instead of the Milestone 2 foundation. Remove all "Milestone 2" references.
- Add a recent-posts blog feed as a new "use client" component (e.g. apps/web/components/recent-posts-feed.tsx) that calls listPublishedPosts() from apps/web/app/blog/blog-client.ts, renders the latest 3 published posts (title linking to /blog/<slug>, summary, published date), and gracefully handles loading, empty ("No posts yet"), and error states. Keep apps/web/app/page.tsx a server component and embed the client feed component inside it.
- Add a "What's new in Milestone 3" section containing a visible link to the blog index (/blog), a visible link to the standalone page at the convention slug /about, and copy/links that surface navigation and comments. The page, the feed, and the /blog link must render correctly even when zero posts are published. Note: /about is a static convention link that may 404 until an admin publishes a standalone page with slug "about" — this is intended.

Allowed files:
- `apps/web/app/page.tsx`
- `apps/web/app/page.module.css`
- `apps/web/components/recent-posts-feed.tsx`
- `apps/web/components/*.module.css`

Implementation-outcome acceptance criteria:
- The landing page has no remaining "Milestone 2" references and describes Milestone 3 capabilities.
- The homepage renders a recent-posts feed of up to 3 published posts, each linking to its /blog/<slug> detail page; with zero posts it shows a graceful empty state and the page still renders; on fetch failure it shows a non-fatal error state.
- The homepage shows a visible link to /blog and a visible link to /about, plus copy surfacing navigation and comments.
- The landing page builds and lints clean and renders without runtime errors.

Validation guidance:
- Run the web build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- Tester-owned web tests live under apps/web/app/**/*.spec.ts and apps/web/components/**/*.spec.ts; the landing/home source-contract spec (apps/web/app/public-shell.spec.ts) may need updates for the new Milestone 3 copy and feed.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-landing-refresh-and-review-followups/subtask-2/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 3: Navigation publication-leak fix for top-level page links
```text
Your role is 'implementer'. Your task is as follows:
On the ms3-claude branch, close a publication-leakage edge case in navigation filtering. This subtask is security-sensitive (unpublished standalone pages must not leak through public navigation) and will receive specialist Security review.

Do the following:
- In apps/api/src/navigation/navigation.service.ts, extend the linked-target publication filtering so that an internal nav item whose URL is a single-segment, non-reserved path (e.g. /about) is resolved against standalone_pages (published-only) before being treated as a static route, and the entry is omitted from public navigation when its linked page is not publicly visible. Preserve the existing /blog/<slug> and /pages/<slug> publication filtering, the reserved-slug denylist behavior, and the safe [] fallback. Update the method JSDoc to match the new behavior.
- Correct docs/README.md so the navigation_items schema section attributes the table to 1748736000000-milestone-three-content-foundation.ts and removes the reference to the deleted 1748736000001-navigation-items.ts migration.

Allowed files:
- `apps/api/src/navigation/**`
- `docs/README.md`

Implementation-outcome acceptance criteria:
- A public navigation response omits any internal nav item linking to an unpublished standalone page, whether linked by /pages/<slug> or by the canonical top-level /<slug> route; published-page links and external/static links still render.
- Reserved/static single-segment routes (per the existing reserved-slug denylist) are not misclassified as page links.
- The safe [] fallback and existing /blog/<slug> filtering behavior are preserved.
- docs/README.md attributes navigation_items to the consolidated MS3 migration with no reference to the deleted migration file.

Validation guidance:
- Run the API build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- Tester-owned tests live under apps/api/src/navigation/*.test.ts; add coverage for a published top-level page link (renders) and an unpublished top-level page link (omitted).

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-landing-refresh-and-review-followups/subtask-3/` if workflow artifacts are required.
- This subtask is marked security-review-required; expect a specialist Security stage.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 4: Blog listComments future-scheduled visibility fix
```text
Your role is 'implementer'. Your task is as follows:
On the ms3-claude branch, make the public comment-listing route enforce the same scheduled-post visibility invariant as every other public surface. This subtask is security-sensitive (publication leakage / public-surface consistency) and will receive specialist Security review.

Do the following:
- In apps/api/src/blog/blog.controller.ts (and any supporting lookup in apps/api/src/blog/blog.service.ts), make the listComments UUID-fallback enforce the full public-visibility predicate status = published AND publishedAt <= now, so a future-scheduled post addressed by its UUID returns 404 instead of 200 with an empty comments payload. Reuse the existing visibility predicate used by findPublished/findPublishedBySlug rather than duplicating the logic.

Allowed files:
- `apps/api/src/blog/**`
- `docs/README.md`

Implementation-outcome acceptance criteria:
- GET /api/blog/:postId/comments for a future-scheduled (published but publishedAt in the future) post addressed by UUID returns 404.
- Comment listing for genuinely public (published and due) posts is unchanged, both by slug and by UUID.
- Draft/unpublished posts continue to return 404 on this route.

Validation guidance:
- Run the API build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- Tester-owned tests live under apps/api/src/blog/*.test.ts; add a regression test for the id-fallback future-scheduled case (expect 404), and tighten the findPublished/findPublishedBySlug assertions so they verify the LessThanOrEqual(now) publishedAt constraint, not only the status filter.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-landing-refresh-and-review-followups/subtask-4/` if workflow artifacts are required.
- This subtask is marked security-review-required; expect a specialist Security stage.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 5: Media serving read-stream hardening
```text
Your role is 'implementer'. Your task is as follows:
On the ms3-claude branch, harden the media image-serving route against a vanished-file race (TOCTOU) so it fails closed cleanly.

Do the following:
- In apps/api/src/media/media.controller.ts, attach an error handler to the fs.createReadStream(...) used by the image-serving route so that a file which disappears between the service's existence check and stream open results in a controlled 404 (or a clean error response) instead of an unhandled stream error or a dangling/hung response. Do not change the path-resolution, content-type, or authorization behavior.

Allowed files:
- `apps/api/src/media/**`
- `docs/README.md`

Implementation-outcome acceptance criteria:
- If the resolved media file is missing at stream time, the serving route returns a controlled 404 / clean error response with no unhandled-stream crash and no hung connection.
- Normal image serving for existing files is unchanged: correct bytes, content type, and status.

Validation guidance:
- Run the API build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- Tester-owned tests live under apps/api/src/media/*.test.ts; add coverage for the vanished-file-at-stream-time path returning a controlled 404 if feasible.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-landing-refresh-and-review-followups/subtask-5/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 6: Optional blog-post slug with auto-generation from title
```text
Your role is 'implementer'. Your task is as follows:
On the ms3-claude branch, make the blog-post slug optional on creation and auto-generate it from the title when omitted.

Do the following:
- In apps/api/src/blog/** (the create DTO/parser and service), make slug optional on blog-post creation. When the slug is omitted or blank, derive it from the title: lowercase, collapse non-alphanumeric runs to single hyphens, trim leading/trailing hyphens, and ensure it is URL-safe. Guarantee uniqueness against existing blog_posts.slug values by appending an incrementing numeric suffix (-2, -3, …) until unique. If the title slugifies to empty, fall back to a safe non-empty default before applying the uniqueness suffix. An explicitly provided slug must still be validated and used unchanged.
- In apps/web/app/admin/blog/new/page.tsx, make the slug input optional (remove the required constraint) and add helper text that it is auto-generated from the title when left blank.
- In apps/web/app/blog/blog-client.ts, change CreateBlogPostInput.slug to optional, and correct the admin error parsing to read payload?.error?.message (the actual API error envelope) instead of payload?.message so blog admin failures surface the real server message.

Allowed files:
- `apps/api/src/blog/**`
- `apps/web/app/admin/blog/new/page.tsx`
- `apps/web/app/blog/blog-client.ts`
- `docs/README.md`

Implementation-outcome acceptance criteria:
- Creating a blog post with no slug succeeds and produces a unique, URL-safe slug derived from the title; the post is retrievable at that slug.
- Two posts whose titles slugify identically both succeed with distinct slugs (the second gets a numeric suffix).
- Creating a blog post with an explicit slug is validated and used unchanged (existing behavior).
- The blog admin create form accepts an empty slug and indicates auto-generation; blog admin API errors surface the real server message rather than only a generic fallback.

Validation guidance:
- Run the API and web build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- Tester-owned tests live under apps/api/src/blog/*.test.ts and apps/web/app/**/*.spec.ts; add coverage for slug auto-generation, the identical-title collision case, and the empty-slugify fallback.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-landing-refresh-and-review-followups/subtask-6/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 7: Fix standalone page creation (FK insert-ordering) and surface admin API errors
```text
Your role is 'implementer'. Your task is as follows:
On the ms3-claude branch, fix the broken standalone-page creation flow. Creating a page currently returns HTTP 500 with a foreign-key violation (QueryFailedError: Cannot add or update a child row: fk_page_revisions_page_id) because PagesService.create saves the page_revisions child before the parent standalone_pages row, and the admin UI masks the real error.

Do the following:
- In apps/api/src/pages/pages.service.ts, fix create() so the parent standalone_pages row is persisted before the page_revisions row that references it, then set the page's current_revision_id. Wrap the multi-row create in a single transaction so a partial failure cannot orphan a page or a revision. Preserve the existing return shape and revision-numbering behavior. Do not change the database schema.
- In apps/web/app/pages/pages-client.ts, correct the admin error parsing to read payload?.error?.message (the actual JsonExceptionFilter envelope) instead of payload?.message, so page admin create/update failures surface the real server message.

Allowed files:
- `apps/api/src/pages/**`
- `apps/web/app/pages/pages-client.ts`
- `docs/README.md`

Implementation-outcome acceptance criteria:
- POST /api/pages/admin/pages with valid title/slug/body succeeds (HTTP 2xx), persists the page and revision 1, and sets current_revision_id, with no foreign-key error.
- A create failure is transactional: no orphaned standalone_pages row without its revision, or vice versa.
- Page admin create/update error responses surface the real server message in the UI rather than only a generic fallback.
- Existing page update, publish, unpublish, revision listing, and restore behavior is unchanged.

Validation guidance:
- Run the API and web build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- Tester-owned tests live under apps/api/src/pages/*.test.ts; add an integration-style test that exercises create() against a schema with the foreign key enforced (not fully mocked repositories), asserting the page and its revision persist with no FK error.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-landing-refresh-and-review-followups/subtask-7/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```
