# Milestone 3 Implementation Comparison — `ms3-claude` vs `ms3-copilot`

**Author:** Reviewer agent
**Date:** 2026-06-01
**Governing plan:** `plans/milestone-three-blog-standalone-pages-and-admin-navigation-plan.md`
**Full-design reference:** `plans/sfus-implementation-plan.md` (§ "Milestone 3: Blog, Standalone Pages, And Admin Navigation")
**Output artifact:** `artifacts/ms3-comparison-v1.md`

> **Branch-name note.** The request referenced two branches as `ms3-codex` and
> `mdx-claude`. Those exact names do not exist in this repository. With the
> user's confirmation, this report compares the two complete Milestone 3
> implementations that branch from (or adjacent to) `main`'s HEAD:
> - **`ms3-claude`** = the "mdx-claude" build (branches from `main` HEAD `684630c`; full
>   coordinator workflow, subtasks 1–6, self-verdict **CONDITIONAL PASS**).
> - **`ms3-copilot`** = the "ms3-codex" build (branches from `743ea2d`, `main`'s
>   parent; full coordinator workflow, subtasks 1–6, self-verdict **FAIL**).

---

## 1. Executive summary

Both branches implement the same six-subtask plan and both produce a structurally
complete backend for blog, standalone pages, navigation, and comments with
admin-only authorization built on the Milestone 2 foundation. They diverge sharply
on the two highest-risk acceptance criteria of the milestone — **shared image
upload** and **admin-managed navigation rendering** — and they make opposite
trade-offs, so neither is a clean pass on its own.

| | `ms3-claude` ("mdx-claude") | `ms3-copilot` ("ms3-codex") |
|---|---|---|
| Self-assessed final verdict | **CONDITIONAL PASS** | **FAIL** |
| Independent re-assessment (this report) | **CONDITIONAL PASS** (closer to done) | **FAIL** (larger functional hole) |
| Image upload endpoint | ✅ Real `POST /api/media/upload` (auth + MIME + size) | ❌ None — no controller/route at all |
| Image **serving** | ❌ No `GET /media/:id`, images 404 | ❌ No serving + no upload |
| Image upload UI | ⚠️ Real `ImageUpload` component, but wired only into the comment form | ❌ Raw media-ID text inputs only |
| Server-side body sanitization | ⚠️ Comments only (posts/pages render-time only) | ✅ Blog + pages + comments (custom regex) |
| Nav one-level dropdown children rendered | ❌ Not rendered in shell | ✅ Rendered (one level) |
| Nav public API hides unpublished/hidden children | ❌ `findPublic` leaks children | ✅ Publication-aware filtering |
| Nav fallback safety | ✅ Falls back to `[]` (no content links) | ❌ Hardcoded `/about,/rules,/contact` can leak unpublished pages |
| Automated tests (live run) | **275 pass / 0 fail** (173 API + 102 web) | **97 pass / 0 fail** (85 API + 12 web) |
| Code organization | Clean controller+service split per module | Monolithic "fat services" (~700–930 LOC) with duplicated session/auth helpers |
| Docs updated | Heavy (`README` +381, launch +137) | Light (`README` +28, launch +37) |
| Subtask verifier verdicts | 1–5 PASS, 6 CONDITIONAL PASS | All 6 PASS (missed the blocking upload gap) |

**Bottom line / recommendation: proceed with `ms3-claude`.** It is materially closer
to a complete, releasable Milestone 3: it has a real upload pipeline, a real shared
editor/renderer/upload component set, far stronger test coverage, and thorough docs.
Its known gaps (image serving route, wiring the upload widget into admin editors,
server-side post/page sanitization, navigation child rendering + API filtering) are
**additive, well-understood fixes**. `ms3-copilot` ships two genuinely better pieces
— navigation child rendering and publication-aware nav filtering, plus uniform
server-side sanitization — but its missing image-upload pipeline is a from-scratch
build, its services carry significant duplication, and its test coverage is roughly
a third of `ms3-claude`'s. The best of `ms3-copilot`'s navigation work should be
ported onto `ms3-claude` (see §8). Detailed reasoning follows.

---

## 2. Scope and method

- Read the governing MS3 plan and the Milestone 3 section of the full design plan
  to extract the binding acceptance criteria (six workstreams; milestone-level ACs
  in plan lines 166–179).
- Checked out each branch into a dedicated worktree and performed a read-only deep
  code review of every MS3 surface (API modules: blog, pages, navigation, media,
  content; web public + admin routes; shared components).
- **Ran the test suites live in each worktree** (`pnpm install` + vitest) to obtain
  objective pass/fail counts rather than relying on reported numbers.
- Read every subtask `verifier_report.md` (1–6) and the top-level `reviewer_report.md`
  on both branches.
- Independently verified the most consequential claims directly against source
  (e.g. media controller route list, static-serving bootstrap, sanitizer call
  sites, navigation child rendering).

All file:line citations below were confirmed against the branch worktrees.

---

## 3. Requirement-by-requirement comparison

Milestone-level acceptance criteria from the plan (lines 166–179), mapped to each build.

### 3.1 Blog posts (create/edit/schedule/publish/unpublish, tags, featured image, public routes)
- **`ms3-claude`** — Full lifecycle in `blog.service.ts` (create/publish/unpublish/
  schedule/delete); public `findPublished`/`findPublishedBySlug` correctly hide
  drafts/scheduled/unpublished; tags via join entity; strict slug regex; admin auth
  via `assertAdminManagementAccess` on all 8 admin routes; admin edit UI exposes
  publish/unpublish/schedule. No auto-publish cron (scheduled posts do not auto-flip;
  documented).
- **`ms3-copilot`** — Equivalent lifecycle in `blog.service.ts` (931 LOC). Notably
  **scheduled posts auto-appear once `scheduledFor <= now`** via `isPubliclyVisible`
  (time-based, no cron) — a slightly more complete scheduling semantic than
  `ms3-claude`. Tags normalized/deduped (max 20); strict slug uniqueness; admin auth
  on every op.
- **Verdict:** Both satisfy the blog AC. `ms3-copilot` has marginally better
  scheduled-visibility semantics; `ms3-claude` has cleaner code and far more tests.

### 3.2 Blog comments (public read, member create, moderator/admin moderation)
- **`ms3-claude`** — Public read returns only `visible`; create requires a resolved
  session and a *published* parent (`createComment` throws for non-published);
  moderation gated by `assertModerationAccess` (moderator+admin), records
  `moderatedByUserId`/`moderatedAt`. Minor: `resolvePostId` falls back to any-status
  before the published guard (guard still blocks).
- **`ms3-copilot`** — Equivalent: public `visible`-only read on published posts;
  `assertAuthenticatedCanCreateComment`; moderation via
  `assertModeratorCanModerateComments`; controller tests assert the authz wiring.
- **Verdict:** Both satisfy the comment AC.

### 3.3 Shared Markdown/WYSIWYG editor + sanitization
- **`ms3-claude`** — Real shared React components: `MarkdownEditor` (write/preview
  tabs) + `MarkdownRenderer` (purpose-built converter that **strips all raw HTML**,
  escapes text, allow-lists URLs) reused across blog, pages, and comments. Server
  sanitizer `markdown-sanitizer.ts` exists. **Gap:** server-side `validateMarkdownBody`/
  `normalizeMarkdownBody` is called for **comments only**; blog post and page bodies are
  persisted raw (`blog.service.ts:138,172`; `pages.service.ts:107,159,226` — file does
  not even import the sanitizer). Render-time stripping still prevents XSS, and post/page
  authoring is admin-only, so it is not exploitable, but it contradicts the documented
  contract (`docs/README.md:149`).
- **`ms3-copilot`** — No editor library and **no shared React editor component**;
  editing uses a plain `<textarea>` + mode toggle. Sanitization is a **custom regex
  renderer** (`content/authoring-workflow.ts`, 213 LOC) applied on the read path to
  **blog, pages, AND comments** (uniform — better than `ms3-claude` here). **But** there
  are **two divergent sanitizer implementations** (API 213 LOC vs a weaker web 113 LOC
  copy) and the public routes render `bodyRenderedHtml` via `dangerouslySetInnerHTML`,
  trusting the regex sanitizer fully — a latent XSS surface (no vetted library).
- **Verdict:** `ms3-claude` has the real reusable editor surface the plan asked for and
  a safer renderer (strips HTML rather than trusting a regex), but inconsistent server
  sanitization. `ms3-copilot` has uniform server sanitization but no shared editor
  component and a riskier `dangerouslySetInnerHTML` render path with duplicated logic.

### 3.4 Shared image upload (blog posts, pages, comments) — **the decisive criterion**
- **`ms3-claude`** — ✅ **Real endpoint** `POST /api/media/upload`
  (`media.controller.ts:46`): `FileInterceptor`/memory storage, 20 MB cap, session
  required (401 otherwise), MIME allow-list + size validation, `resourceType` restricted
  to the three content types, filename sanitized. ✅ **Real `ImageUpload` component**
  (`multipart/form-data`, `credentials:include`, 401 handling). **Two real defects:**
  (1) **No serving route** — the service returns `url: /api/media/${id}`
  (`media.service.ts:92`) but the controller exposes *only* `POST /upload` and there is
  **no `GET /media/:id` and no static-file serving** in the API bootstrap, so uploaded
  images **404 and cannot be displayed** (uncaught by every report on the branch).
  (2) The `ImageUpload` widget is wired **only into the public comment form** — neither
  the blog admin editor nor the pages admin editor uses it, and `featuredImageId` has no
  upload UI.
- **`ms3-copilot`** — ❌ **No upload pipeline whatsoever.** `media.module.ts` declares
  only `MediaService` (no controller); `media.service.ts` (91 LOC) is *pure validation
  helpers* that are **never injected anywhere**, never write a file, and never persist a
  `media_references` row. The admin and comment UIs accept a **raw media-reference ID as
  a plain text input**. Because no row can ever be created, **any non-empty media id
  fails** server-side existence checks — the only working path is leaving it blank.
- **Verdict:** **Both fail the end-to-end image-upload AC**, but `ms3-claude` is far
  closer: upload + validation + a real client widget already exist; finishing the
  feature means adding a `GET` serving route and wiring the existing widget into the two
  admin editors. `ms3-copilot` needs the entire pipeline built from nothing. This single
  criterion is the primary driver of the FAIL vs CONDITIONAL PASS split and of the
  recommendation.

### 3.5 Versioned standalone pages + public routes
- **`ms3-claude`** — Append-only revisions on every create/update/restore; `restoreRevision`
  creates a *new* revision (full audit trail); admin revision-list + restore routes; public
  route returns only published; scope-disciplined (no block-builder/wiki); deferrals recorded.
  Minor inefficiency: body resolved by scanning the full revision list per fetch.
- **`ms3-copilot`** — Equivalent append-only model; immutable restore ("Restored from
  revision N"); public catch-all `app/[slug]/page.tsx` renders published pages, 404
  message otherwise; scope-disciplined. Minor: `@Get(":slug")` declared before admin
  routes (latent ordering smell, not currently triggered).
- **Verdict:** Both satisfy the pages AC with good revision discipline.

### 3.6 Admin-managed navigation + shell replacement — **the second decisive criterion**
- **`ms3-claude`** — Hardcoded nav replaced by data from `NavigationService`; one-level
  nesting enforced server-side; admin CRUD for children exists. **Two gaps:** (1) the
  shell (`navigation.tsx`) renders **only top-level items** — `item.children` is never
  rendered, so the one-level dropdown capability is **invisible to users** (carried as
  the subtask-6 CONDITIONAL PASS). (2) `findPublic` loads children with **no isActive/
  visibility filter** (`navigation.service.ts:65`), so hidden/authenticated-only children
  can be returned to guests via the public API (currently masked only because the shell
  doesn't render them). **Strength:** the fallback is safe — on API error the shell falls
  back to `[]` (no content links leak).
- **`ms3-copilot`** — ✅ **Renders top-level + one dropdown level** of children
  (`navigation.tsx:154–193`). ✅ **Publication-aware public API**: `filterItemsForVisibility`
  + `isLinkedInternalTargetVisible` drop disabled/visibility-mismatched items *and* items
  whose linked blog post / standalone page is not publicly visible. **Gap:** the
  **fallback is unsafe** — when `/api/navigation` is missing/empty/invalid the shell
  shows **hardcoded `/about`, `/rules`, `/contact`** links (no static routes exist for
  these; they resolve through the `[slug]` catch-all), which can point at draft/unpublished
  pages — defeating the safe-fallback requirement (reviewer WARNING).
- **Verdict:** **`ms3-copilot` is clearly better on the core navigation AC** (children
  actually render; the public API is publication-aware). `ms3-claude` is better only on
  fallback safety. This is the strongest argument for porting `ms3-copilot`'s navigation
  work onto `ms3-claude`.

### 3.7 Scope discipline, deferrals, documentation
- **`ms3-claude`** — Heavy docs (`README` +381, launch +137) covering routes, schema,
  env, lifecycle; deferrals present. **Doc-accuracy defect:** README claims all MS3 write
  paths sanitize bodies server-side (false for posts/pages).
- **`ms3-copilot`** — Light docs (`README` +28, launch +37). **Doc-accuracy defect:** the
  launch guide documents the media-upload workflow as delivered (it is not).
- **Verdict:** `ms3-claude` documents far more, but both have a doc-vs-reality drift that
  must be corrected.

---

## 4. Architecture & code quality

**`ms3-claude`** — Idiomatic NestJS: a thin controller + focused service per module
(blog 384, pages 267, navigation 236, media 143). Consistent authorization pattern
(`resolveSession` → `assert*Access`) across modules. Real, reusable React component set
(`markdown-editor`, `markdown-renderer`, `image-upload`). The renderer's strip-all-HTML
approach is a defensible XSS posture. Overall the most maintainable and extensible base
for Milestones 4–11.

**`ms3-copilot`** — "Fat service" style: `blog.service.ts` 931, `navigation.service.ts`
699, `pages.service.ts` 680. Each service re-implements session/auth resolution
(`resolveActor`, `hashSessionToken`, `extractSessionToken`, `addMinutes`) and input
normalization — **copy-pasted across three services** — and there are two divergent
`authoring-workflow` sanitizer implementations (API vs web). This is the main
maintainability liability and a consistency risk (server vs client sanitizers can drift).
Offsetting strengths: per-area CSS modules for admin styling, a catch-all `[slug]` public
route, an `app.module.test.ts` wiring test, and controller-level tests.

---

## 5. Test coverage (live results)

| | `ms3-claude` | `ms3-copilot` |
|---|---|---|
| API tests | **173 pass / 0 fail** (13 files) | **85 pass / 0 fail** (17 files) |
| Web tests | **102 pass / 0 fail** (5 files) | **12 pass / 0 fail** (3 files) |
| **Total** | **275 / 0** | **97 / 0** |
| Controller-layer tests | Fewer (service-heavy) | Yes (blog/pages/navigation controllers) |
| Integration/wiring test | No | `app.module.test.ts` (mocks all modules) |
| Web test style | Source-contract (`toContain` on file text) | Source-contract (`toContain` on file text) |

Both suites are green, but **both web suites are source-string contract tests** (they
assert that files contain certain imports/strings), not behavioral/DOM tests. That is why
the functional gaps on both branches pass undetected — e.g. `ms3-claude`'s dead image
URL and missing child rendering, and `ms3-copilot`'s unusable upload UI and fallback
leak. `ms3-claude` has ~3× the API coverage; `ms3-copilot` adds controller and module-
wiring tests `ms3-claude` lacks. Net: `ms3-claude` is substantially better tested, but
neither has behavioral frontend coverage.

---

## 6. What each build has that the other lacks

**`ms3-claude` has, `ms3-copilot` lacks:**
- A real image-upload **endpoint** (`POST /api/media/upload`) with auth + MIME + size
  validation.
- A real **`ImageUpload` React component** (multipart, credentialed, 401-aware).
- Real shared **`MarkdownEditor` + `MarkdownRenderer`** components (vs textarea + helpers).
- ~3× the automated API test coverage (173 vs 85) and far more web tests (102 vs 12).
- Extensive documentation (README +381 vs +28; launch +137 vs +37).
- A **safe navigation fallback** (`[]` on error — no content-link leak).
- Cleaner, controller+service-separated modules with no cross-service duplication.

**`ms3-copilot` has, `ms3-claude` lacks:**
- **Rendered one-level dropdown navigation children** in the shell (the plan AC
  `ms3-claude` left incomplete).
- **Publication-aware public navigation filtering** (hides disabled/visibility-mismatched
  items *and* nav entries whose linked content is unpublished) — `ms3-claude` leaks
  children via `findPublic`.
- **Uniform server-side body sanitization** across blog, pages, and comments
  (`ms3-claude` sanitizes comments only on the server).
- **Controller-layer tests** and an `app.module` wiring test.
- **CSS-module-based admin styling** and a **catch-all `[slug]`** public page route.
- Slightly more complete **time-based scheduled-post visibility** (auto-appears at
  `scheduledFor`).

---

## 7. Consolidated defect register

### `ms3-claude` (CONDITIONAL PASS) — remaining defects
1. **Image serving missing (functional break, previously uncaught):** no `GET /media/:id`
   and no static serving; uploaded images 404. `media.service.ts:92` advertises a URL the
   API cannot serve.
2. **Upload widget not wired into admin editors:** `ImageUpload` is used only on the
   comment form; blog/page `featuredImageId` has no upload UI.
3. **Server-side sanitization inconsistent:** posts/pages persisted raw; only comments
   call `validateMarkdownBody` — contradicts `docs/README.md:149`.
4. **Navigation children not rendered** in the shell (`navigation.tsx`).
5. **`findPublic` leaks nav children** (no isActive/visibility filter) —
   `navigation.service.ts:65`.
6. **Doc drift:** README overstates server-side sanitization coverage.
7. Minor: unused `NotFoundException` import (`navigation.controller.ts:9`); duplicate DOM
   id `image-upload-input`; per-fetch full-revision scan for page body; `resolvePostId`
   any-status fallback; reserved slug "admin" not blocked for pages.

### `ms3-copilot` (FAIL) — remaining defects
1. **Image upload pipeline entirely absent (BLOCKING):** no controller/route, service is
   unused validation helpers, UIs take raw IDs that can never resolve. The image-upload
   AC is non-functional end to end.
2. **Unsafe navigation fallback:** hardcoded `/about,/rules,/contact` can surface
   unpublished/nonexistent standalone pages when `/api/navigation` is unavailable.
3. **Significant duplication:** session/auth resolution + input normalizers copy-pasted
   across 3 services; two divergent sanitizer implementations (API vs web).
4. **Custom regex sanitizer + `dangerouslySetInnerHTML`** on all public render paths —
   latent XSS surface, no vetted library.
5. **Shallow web tests / low total coverage** (97 vs 275) that miss the two reviewer
   findings.
6. **Verification blind spot:** all six subtask verifiers returned PASS with no findings;
   subtask-2 even affirmed "authorized image uploads" as delivered — the blocking gap was
   only caught by the final reviewer.
7. **Doc drift:** launch guide documents uploads as delivered.
8. Minor: `@Get(":slug")` declared before admin routes (latent ordering smell).

---

## 8. Work required to complete full Milestone 3

The following is the union of work needed to reach a true milestone pass. Items are
labelled by how they apply to the recommended path (build on `ms3-claude`).

**A. Image upload — finish the pipeline (highest priority).** On `ms3-claude`:
   1. Add an authenticated `GET /api/media/:id` (or static-serving) route so uploaded
      images are retrievable; align it with the `url` the service returns.
   2. Wire the existing `ImageUpload` component into the **blog admin editor** and
      **pages admin editor** for `featuredImageId`, and render featured images on public
      blog/page views.
   3. Fix the duplicate `image-upload-input` DOM id so multiple widgets coexist.
   4. Add behavioral tests for upload → persist → retrieve → render.
   *(If building on `ms3-copilot` instead, this entire pipeline must be built from
   scratch — endpoint, persistence, serving, and UI.)*

**B. Navigation — port `ms3-copilot`'s strengths onto `ms3-claude`.**
   1. Render one level of dropdown children in `navigation.tsx` (adopt `ms3-copilot`'s
      `navDropdown` approach).
   2. Add isActive/visibility filtering of children in `NavigationService.findPublic`
      (and publication-aware filtering of linked internal targets, as `ms3-copilot` does).
   3. Keep `ms3-claude`'s safe `[]` fallback (do **not** adopt `ms3-copilot`'s hardcoded
      `/about,/rules,/contact` fallback); if any fallback content links are desired, make
      them publication-aware.
   4. Add tests for child rendering and child visibility filtering.

**C. Sanitization — make server-side enforcement uniform.**
   1. Route blog post create/update and page create/update/restore bodies through
      `validateMarkdownBody`/`normalizeMarkdownBody` (defense-in-depth, matching comments).
   2. Add tests rejecting unsafe post/page bodies.
   3. Reconcile docs with actual behavior.

**D. Documentation accuracy.** Correct the README sanitization claim (`ms3-claude`) and,
   if any `ms3-copilot` material is ported, ensure upload/nav docs match reality.

**E. Test depth (both).** Add at least minimal **behavioral** frontend tests (render +
   interaction) so future regressions in rendering/fallback/upload are caught — the
   current source-contract style misses functional breaks on both branches.

**F. Minor cleanups.** Remove the unused `NotFoundException` import; block reserved page
   slugs; tidy the per-fetch revision scan; confirm scheduled-post visibility semantics
   are intentional (consider adopting `ms3-copilot`'s time-based auto-visibility).

**Out of scope (correctly deferred by both):** arbitrary file attachments, page
block-builder UI, navigation depth > 1, project-scoped authoring policy, wiki/documents
(Milestone 5). Both branches recorded these in `docs/deferred-tasks.md`.

---

## 9. Final value judgement

**Recommendation: adopt `ms3-claude` as the base and port `ms3-copilot`'s navigation
implementation (child rendering + publication-aware filtering) onto it.**

Rationale:
- **`ms3-claude` is closer to a real, releasable milestone.** Its remaining work is
  *additive and bounded*: a serving route, two UI wirings, server-side sanitization
  parity, and navigation child rendering. `ms3-copilot`'s central gap (no image-upload
  pipeline at all) is *foundational* and must be built from nothing.
- **`ms3-claude` is the better long-term foundation** for Milestones 4–11: clean
  module separation, reusable editor/renderer/upload components, no cross-service
  duplication, ~3× the API test coverage, and far more complete documentation.
- **`ms3-copilot`'s genuine wins are localized and portable.** Its navigation rendering
  and publication-aware filtering are exactly the pieces `ms3-claude` is missing, and
  they transplant cleanly. Its uniform server-side sanitization is a one-function change
  to replicate on `ms3-claude`.
- **Risk posture:** `ms3-claude`'s headline upload "feature" is partially broken (no
  serving route), which is a real caveat — but a single endpoint plus two UI wirings
  closes it, versus building the whole pipeline on `ms3-copilot`. `ms3-copilot` also
  carries a harder-to-retire maintainability debt (triplicated session logic, dual
  sanitizers, `dangerouslySetInnerHTML` on a custom regex).

**If the priority were strictly navigation correctness**, `ms3-copilot` is ahead; but it
loses on the upload AC, test depth, code health, and docs — the larger share of the
milestone. The recommended hybrid (ship `ms3-claude`, graft `ms3-copilot`'s nav) yields
the most complete Milestone 3 for the least remaining effort.

**Overall outcome of this comparison:** `ms3-claude` — **CONDITIONAL PASS, recommended to
proceed** (complete items A–F before declaring Milestone 3 done). `ms3-copilot` —
**FAIL as-is**, valuable as a navigation reference and for its uniform sanitization
approach.

---

### Appendix: key evidence locations
- Upload endpoint present / serving absent: `apps/api/src/media/media.controller.ts:46`
  (only `@Post("upload")`); no GET/static serving in `apps/api/src/index.ts` /
  `app.module.ts`; URL advertised at `apps/api/src/media/media.service.ts:92` *(ms3-claude)*.
- Upload pipeline absent: `apps/api/src/media/media.module.ts` (no controller),
  `media.service.ts` (helpers only, never injected); raw-ID inputs at
  `apps/web/app/app/blog/page.tsx:344`, `app/app/pages/page.tsx:398`,
  `app/blog/[slug]/page.tsx:285` *(ms3-copilot)*.
- Sanitizer call sites: comments only at `blog.service.ts:290`; posts raw at
  `blog.service.ts:138,172`; pages raw at `pages.service.ts:107,159,226` *(ms3-claude)*.
  Uniform render-path sanitize via `content/authoring-workflow.ts` *(ms3-copilot)*.
- Navigation children: not rendered (`navigation.tsx`), `findPublic` unfiltered
  (`navigation.service.ts:65`) *(ms3-claude)*; rendered (`navigation.tsx:154–193`),
  filtered (`navigation.service.ts:217–292`), unsafe fallback (`navigation.tsx:18–26`)
  *(ms3-copilot)*.
- Test runs (live): 173 API + 102 web = 275 *(ms3-claude)*; 85 API + 12 web = 97
  *(ms3-copilot)*.
