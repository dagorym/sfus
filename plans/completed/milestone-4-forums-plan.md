# Milestone 4 — Forums (Implementation Plan)

**Source of truth:** `star_frontiers_rpg_website_design.md` (§2 roles, §3 IA, §5.2 forums,
§9/§18 mentions & editors, §13 moderation/anti-spam, §14 security)
**Milestone definition:** `plans/sfus-implementation-plan.md` → "Milestone 4: Forums"
**Planner cycle date:** 2026-06-07

This plan is implementation-only and Coordinator-ready. The default downstream workflow
(Implementer → Tester → Documenter → Verifier, plus a specialist **Security** stage on
subtasks marked `Security review: required`, then a final Reviewer pass) is assumed; this plan
does **not** create subtasks for routine testing, documentation, verification, or review.

> **Decomposition note:** the work is intentionally split into many small, single-concern
> subtasks (18) rather than a few large ones, to reduce dropped-requirement (P2) and
> partial-breadth (P7) misses. Most splits do **not** add parallelism (siblings share a file
> and serialize) — the gain is atomicity and tightly-scoped security review.

---

## 1. Feature restatement (engineering terms)

Add a site-wide community discussion system to the existing NestJS API + Next.js web app:
a four-level hierarchy (Categories → Boards → Topics → Posts), member authoring through the
existing shared Markdown editor + image-upload pipeline, global moderator/admin moderation
controls (pin / lock / move), quoting, pagination, `@username` mentions with autocomplete and a
minimal public profile destination, **user avatars** (upload, store via the hardened media
pipeline, display on profiles/bylines/autocomplete), and a new server-side rate-limiting /
anti-spam layer that also protects existing blog-comment creation. Several in-flight
deferred-register fixes are folded in (incl. closing the media magic-byte security finding). The
milestone must stay independently deployable without projects, docs, downloads, characters,
search, or feeds.

## 2. Confirmed repository facts (verified this cycle)

- **Authorization is centralized.** `AuthorizationService.evaluate(input)` already decides
  `read|write|admin` over a generic resource with `resourceType, resourceId, ownerUserId,
  visibility, projectId` and an `acl-grant` path against `authorization_grants`
  (`docs/features/authorization.md`; `apps/api/src/authorization/`). Visibility enum is
  `public | unlisted | members | project-only | private`. New content must reuse this, not
  invent checks.
- **Per-feature gates pattern exists.** `assertAdminManagementAccess(role)` (admin) and
  `assertModerationAccess(role)` (moderator|admin) in `blog.service.ts` are the template;
  uniform error contract `401` no session / `403` insufficient role.
- **Shared content write path is fixed.** Every write path calls `normalizeMarkdownBody` then
  `validateMarkdownBody` (`apps/api/src/media/markdown-sanitizer.ts`) and rejects unsafe bodies
  with `400` before persistence (`docs/features/media.md`). Forums must use it too.
- **Media pipeline & resourceTypes.** `POST /api/media/upload?resourceType=<type>` with
  `type ∈ blog-post | standalone-page | blog-comment`; admin role for the first two, any
  session for `blog-comment`. Stored as `media_references` rows; served by `GET /api/media/:id`
  with path containment + MIME re-check. The pipeline validates the **client-supplied**
  content-type only (no byte sniffing today — deferred finding M2). `X-Content-Type-Options:
  nosniff` is on globally via helmet.
- **Shared editor + upload components exist.** `MarkdownEditor`, `MarkdownRenderer`,
  `ImageUpload` (`apps/web/components/`).
- **Visibility-predicate discipline is a hard, repeatedly-violated invariant.**
  `docs/development/agent-retrospective-patterns.md` P12: every lookup path must enforce the
  *full* predicate and gated lookups must be `404`-indistinguishable from nonexistent (no
  existence oracle). Blog uses `status='published' AND publishedAt<=now` at query time.
- **No Redis, no rate-limiting, no throttler today.** Redis is "deferred from Milestone 1"
  with **no named target milestone** (`docs/architecture/milestone-1-foundation-decisions.md`).
- **API runtime contract.** CommonJS/NodeNext (no `import.meta`); `index.ts` already sets
  `trust proxy = 1` and a helmet baseline (HSTS off, CSP off). Module wiring is dynamic
  `Module.register(environment)` in `app.module.ts`; entities + migrations are registered in
  `database/database.config.ts`; migrations live in `database/migrations/` (epoch-ms-prefixed).
- **Users module is minimal.** `UsersService.findById` only; `UserEntity` has
  `id, username, email, displayName, globalRole, status, emailVerifiedAt, createdAt,
  updatedAt`. **No `bio`, no avatar column; no public profile page** (`/profile` is self-only
  behind auth). Public blog comments deliberately strip author ids.
- **Validation commands** (`docs/development/testing.md`): `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, the API `tsc` build, `cicd/scripts/run-validations.sh`, `smoke-validate.sh`,
  and the opt-in `SFUS_DB_INTEGRATION=1` Pages integration spec.

## 3. Assumptions (labeled — not confirmed fact)

- **[Assumption]** M4 adds **both** `bio` and `avatar_media_id` to `users` (Decisions D6 + AV1)
  in a single reversible migration (ST13); `avatar_media_id` references a `media_references`
  row (matching how media references are linked elsewhere — DB FK only if consistent with the
  existing pattern).
- **[Assumption]** The self-service set/remove-avatar endpoint (ST15) lives on the
  settings/account surface (`apps/api/src/auth/` settings routes or `users.controller.ts`); the
  Implementer confirms the exact home against the existing profile/settings layout. It validates
  that the referenced `media_references` row has `resourceType = "avatar"` and is owned by the
  uploading user before persisting.
- **[Assumption]** Forum likely files: new `apps/api/src/forums/` module, new
  `apps/web/app/forums/` routes, a new `apps/api/src/common/throttle/` cross-cutting module, and
  a new `docs/features/forums.md`.
- **[Assumption]** New env vars (rate limits, avatar size cap) are validated in
  `apps/api/src/config/environment.ts` and documented in `docs/operations/launch.md`.
- **[Assumption]** Single-API-instance production topology makes in-process throttle storage
  correct for now (Decision D1).

## 4. Resolved design decisions (this planning cycle)

| ID | Decision | Resolution |
|---|---|---|
| D1 | Rate-limit infrastructure | **In-memory throttle with a pluggable storage seam.** No Redis now. Redis introduction remains unscheduled in the milestone plan — **user will run a separate designer pass** to place it; a register entry records the storage-swap follow-up and the unowned-introduction gap. |
| D2 | Anti-spam baseline | **Rate limits + per-post link limits + a stricter new-account tier**, all server-side. Captcha and bad-word list stay deferred to M11. |
| D3 | Blog comments | **Apply the new throttle to blog comment creation in M4** (closes the split register entry). |
| D4 | "Restricted" boards | **Project-scoped, not site-scoped.** M4 ships public site boards (guest-readable, member-writeable) **plus the project-ready scoping framework** (`scope_type` site/project, nullable `project_id`, `project-only` visibility routed through `evaluate()`, leak-proof exclusion of project boards from the main forum index). Restricted boards become reachable through projects at **M7/M8**. **No per-board per-user grants** in M4. *(Reinterprets the milestone's "restricted boards can be configured and browsed" line — flagged for the designer pass since it shapes M7/M8.)* |
| D5 | Moderators | **Global `moderator`/`admin` gates only** (reuse `assertModerationAccess`). Per-board moderators revisit after M8 project roles (register entry). |
| D6 | Mentions | **Autocomplete + render + minimal public profile.** Session-gated, throttled username-suggest endpoint returning username/display-name/avatar only; `@username` renders as a highlighted link to a new minimal public profile page `/users/<username>` (username, display name, avatar, bio, join date only). **No mention persistence and no notifications** in M4 (M10 scope; no retroactive backfill — explicit non-goal). Security-relevant. |
| D7 | Polls & split/merge | **Deferred** with register entries (future forums-enhancement pass). Pin/lock/move, quoting, mentions, pagination stay in scope. |
| D8 | Editor deferrals | Forums **reuse `MarkdownEditor` + `ImageUpload` as-is.** Register updates: WYSIWYG editor **re-targeted to Milestone 5 (Documents Wiki)** (off-the-shelf editor permitted); editor-mode-preference + media-library-picker entry **moves to M5** with it. |
| D9 | Folded-in deferred fixes | **All three:** (1) executed proxy-hop `request.ip` + helmet-header tests (with a supertest-class harness) → ST7; (2) blog explicit-slug duplicate-key → `409` → ST10; (3) `StandalonePageEntity.currentRevision` exercise → ST18. |
| AV1 | Avatar storage | **`users.avatar_media_id` → `media_references`**, reusing the hardened upload + `GET /api/media/:id` serve path; profile returns `/api/media/<id>`. *(Not the design doc's `avatar_url TEXT`.)* |
| AV2 | Avatar processing | **Store as-is** through the image MIME allow-list with a tighter avatar size cap. **No resize/crop/thumbnail.** Server-side image processing (design §15) deferred (register entry). |
| AV3 | Magic-byte verification | **Pulled into M4** at the shared media validation point so **all** image uploads get byte-signature verification — **closes finding M2**, avoids partial-breadth (P7). **SVG stays excluded.** → ST11 |

## 5. Explicit non-goals (this milestone)

Projects & project-scoped boards as a *usable* surface (framework only — M7/M8); polls;
topic split/merge; per-board moderators; captcha & bad-word filtering (M11); reports/moderation
queue (M11); mention **notifications** and any mention persistence/backfill (M10); search
indexing of forum content (M10); WYSIWYG editor and media-library picker (re-targeted to M5);
Redis (placement is the subject of a separate designer pass); **server-side avatar image
processing** (resize/crop/thumbnail/WebP — design §15, deferred; M4 stores uploads as-is with
MIME + size caps).

---

## 6. Workstreams

- **A. Forums domain** — schema, boards/categories (admin + public read), topics, posts,
  moderation (ST1–ST6).
- **B. Anti-abuse** — test harness + proxy/helmet tests, throttle module, enforcement wiring,
  blog-slug 409 (ST7–ST10).
- **C. Media** — magic-byte verification, avatar upload resourceType (ST11–ST12).
- **D. Identity** — users schema, suggest + public profile, set/remove-avatar (ST13–ST15).
- **E. Web** — forum browsing/authoring/moderation, profile + avatar UI (ST16–ST17).
- **F. Folded-in fix** — pages `currentRevision` exercise (ST18).

---

## 7. Subtasks

Each subtask lists scope, allowed files (likely — Implementer confirms before editing),
implementation-outcome acceptance criteria (AC), security flag, and documentation impact.

### ST1 — Forums data model, migration, and module scaffold
**Scope:** Create the `forums` module and TypeORM entities for `forum_categories`,
`forum_boards`, `forum_topics`, `forum_posts`; a forward migration creating those tables;
register the module + entities + migration. Bake in the **project-ready scoping framework**:
`forum_boards` carry `scope_type ENUM('site','project') NOT NULL DEFAULT 'site'`, nullable
`project_id` (no FK yet — projects arrive M7; document as forward-scaffolding), and a
`visibility` column using the existing visibility vocabulary. `deleted_at NULL` on topics/posts.
No endpoints beyond module registration. MySQL 5.7.44-compatible DDL only; utf8mb4; precision-3
`created_at`/`updated_at`.
**Allowed files (likely):** `apps/api/src/forums/forums.module.ts`,
`apps/api/src/forums/entities/{forum-category,forum-board,forum-topic,forum-post}.entity.ts`,
`apps/api/src/database/migrations/<epoch>-milestone-four-forums-foundation.ts`,
`apps/api/src/database/database.config.ts`, `apps/api/src/app.module.ts`.
**Acceptance criteria:**
- Entities compile and are added to `reviewedEntityClasses`; migration added to
  `reviewedMigrationClasses`, named consistently with existing migrations.
- `forum_boards` has `scope_type` (default `'site'`), nullable `project_id`, and `visibility`.
- Migration applies cleanly on a fresh MySQL 5.7.44 schema; `down()` drops tables FK-safely; no
  8.0-only syntax.
- `ForumsModule.register(environment)` follows the dynamic-module pattern and is imported by
  `AppModule`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the API `tsc` build pass.
**Security review:** not required (schema scaffold; no request surface).
**Documentation Impact:** none here (doc lands with the API surface in ST2–ST6).

### ST2 — Categories & boards: admin management (CRUD)
**Scope:** Admin CRUD for categories and boards (create/update/delete/reorder) behind
`assertAdminManagementAccess` (admin). Board create/update sets `scope_type`, `visibility`, and
(nullable) `project_id`. No public read here (ST3). Uniform gate error contract.
**Allowed files (likely):** `apps/api/src/forums/forums.controller.ts`,
`apps/api/src/forums/forums.service.ts`, `apps/api/src/forums/forums.types.ts`; Swagger/JSDoc on
new handlers.
**Acceptance criteria:**
- Admin endpoints enforce `401` (no session) / `403` (non-admin) **before any data op**.
- Create/update persist `scope_type`, `visibility`, `project_id`; reorder/position behavior is
  deterministic in the response.
- Invalid `scope_type`/`visibility` values are rejected `400`.
- Swagger/JSDoc match the real status contract (no stale text — P1).
**Security review: required** — admin gate + it writes the visibility/scope values the whole
forum security model keys off.
**Documentation Impact:** create `docs/features/forums.md` (admin board/category management +
the scoping/visibility model) and add its row to `docs/README.md`.

### ST3 — Boards & categories: leak-proof public read API
**Scope:** Public read API to list categories with their boards and to fetch a board.
**Critical:** the main-forum listing returns **only** `scope_type='site'` boards whose
visibility is publicly readable, routed through `AuthorizationService.evaluate()`; project or
non-readable boards must never appear in the list, its counts, or any board-detail lookup
reached from the main forum. A hidden/nonexistent board returns a uniform `404` (no oracle).
**Allowed files (likely):** `apps/api/src/forums/forums.controller.ts`,
`apps/api/src/forums/forums.service.ts`, `apps/api/src/forums/forums.types.ts`.
**Acceptance criteria:**
- Category/board listing returns only site, publicly-readable boards; a project-scoped or
  non-readable board is absent from output **and** counts.
- Board detail for a hidden/nonexistent board returns `404` with a message identical to the
  nonexistent case (oracle parity).
- Every visibility decision calls `evaluate()`/`assertAllowed()` — no inline re-derived
  predicates (so operator-pinned tests are feasible).
**Security review: required** — the dominant P12 surface (visibility filtering + oracle parity).
**Documentation Impact:** extend `docs/features/forums.md` (public read routes + response
shapes + leak-prevention contract).

### ST4 — Topics: create, paginated read, visibility, pinned ordering
**Scope:** Member-authenticated topic creation within a readable board; public paginated read of
topics in a board. Body through `normalizeMarkdownBody`→`validateMarkdownBody` (`400` unsafe).
Full board+topic visibility predicate on every path; gated/nonexistent lookups are
`404`-indistinguishable with uniform messages. Pinned topics sort first. Public topic shape
exposes author `username`/`displayName`, omits internal-only fields.
**Allowed files (likely):** `apps/api/src/forums/forums.controller.ts`,
`apps/api/src/forums/forums.service.ts`, `apps/api/src/forums/forums.types.ts`.
**Acceptance criteria:**
- Create topic requires an active session (`401`); writes to a non-readable/nonexistent board
  return `404` (uniform message).
- Topic list paginates with a deterministic order (e.g. `isPinned DESC, lastPostAt DESC`) and a
  stable page contract.
- Unsafe Markdown rejected `400` before persistence.
- Visibility checks use shared predicate helpers; public shape mapped server-side.
**Security review: required** — P12 visibility/oracle on new read+write paths.
**Documentation Impact:** extend `docs/features/forums.md` (topic routes, pagination, shapes).

### ST5 — Posts: create, threading, quoting, locked-topic, paginated read
**Scope:** Member-authenticated post (reply) creation within a readable, unlocked topic; public
paginated read of posts in a topic; quoting (accept a quoted-reference shape or
quote-as-Markdown; render in ST16). Threading is one level (a reply's parent must be a top-level
post on the same topic — mirror the blog-comment rule). Body sanitized. Locked topics reject new
posts (`403` thread-locked). Full visibility predicate; oracle parity.
**Allowed files (likely):** `apps/api/src/forums/forums.controller.ts`,
`apps/api/src/forums/forums.service.ts`, `apps/api/src/forums/forums.types.ts`.
**Acceptance criteria:**
- Create post requires an active session (`401`); writes to a non-readable/nonexistent
  board/topic return `404`; posting to a locked topic returns `403` thread-locked.
- Invalid `parentId` (nonexistent, different topic, or reply-to-a-reply) returns a uniform
  `400` (no existence oracle).
- Post list paginates deterministically (oldest-first within threading) with a stable contract.
- Unsafe Markdown rejected `400`; public shape exposes author `username`/`displayName`, omits
  internal-only fields.
**Security review: required** — P12 visibility/oracle + threading validation.
**Documentation Impact:** extend `docs/features/forums.md` (post routes, threading, quoting,
locked-topic contract).

### ST6 — Forum moderation controls (pin / lock / move)
**Scope:** Moderator/admin endpoints to pin/unpin and lock/unlock topics and to move a topic to
another readable board, behind `assertModerationAccess`. Moves re-validate the destination
board's scope/visibility through `evaluate()` so a move cannot leak a topic across visibility
scopes. Record who/when where supported.
**Allowed files (likely):** `apps/api/src/forums/forums.controller.ts`,
`apps/api/src/forums/forums.service.ts`, `apps/api/src/forums/forums.types.ts`.
**Acceptance criteria:**
- Pin/lock/move return `401` no session / `403` non-moderator **before any data op**; success
  persists and shows in subsequent reads.
- Lock blocks new posts for non-privileged users (consistent with blog comment-lock semantics).
- Move rejects a destination the actor cannot manage and a move that would change a topic's
  effective visibility scope without authorization (`403`/`400`); destination re-evaluated via
  `evaluate()`.
- Swagger/JSDoc reflect the real status contract.
**Security review: required** — privilege gate + cross-scope move leak risk.
**Documentation Impact:** extend `docs/features/forums.md` (moderation) and add an admin/mod
how-to pointer in `docs/guides/content-management.md`.

### ST7 — Supertest harness + executed proxy-hop & helmet tests (folded-in, D9-1)
**Scope:** Stand up a CommonJS-safe supertest-class HTTP harness for the API and deliver the two
long-open executed register tests: (a) a proxy-hop test proving `request.ip` resolves the
original client IP from `X-Forwarded-For` under `trust proxy=1`; (b) response-header assertions
for the helmet baseline (`X-Content-Type-Options: nosniff` present, `Strict-Transport-Security`
absent, no CSP header). The harness is reused by ST8/ST9 throttle tests.
**Allowed files (likely):** `apps/api/src/index.test.ts` (or a new harness test file), a shared
test-harness helper under `apps/api/src/`.
**Acceptance criteria:**
- Executed proxy-hop test asserts `request.ip` equals the injected `X-Forwarded-For` client
  address (not a mocked setter call).
- Executed helmet test asserts the three header conditions against a real HTTP response.
- Harness is reusable (exported helper) and CommonJS-safe (no `import.meta`); API `tsc` build
  passes.
**Security review: required** — trusted-proxy IP resolution is a security property; confirm the
test actually proves it (P3).
**Documentation Impact:** none (test infrastructure; no behavior change).

### ST8 — Throttle module (storage seam, new-account tier, link-limit)
**Scope:** A reusable cross-cutting throttle module: a guard/decorator (or service helper) keyed
by `(route-class, identity)` where identity is the session user id when present, else the
proxy-resolved client IP. Storage behind `IThrottleStore` (`hit(key, window) → {count,
resetAt}`) with an **in-memory implementation** wired now (the documented seam for a future
Redis store). A **stricter new-account tier** (young accounts by a configurable window get lower
limits) and a reusable **per-post link-count limiter** (counts URLs in a Markdown body, rejects
over a configurable max). Limits configurable via env vars validated in `environment.ts`. On
breach: `429` with a `JsonExceptionFilter`-shaped envelope + a `Retry-After`-style hint. No
route wiring here (ST9).
**Allowed files (likely):** `apps/api/src/common/throttle/` (`throttle.module.ts`,
`throttle.guard.ts`, `throttle.service.ts`, `throttle-store.ts`, `link-limit.ts`,
`throttle.types.ts`), `apps/api/src/config/environment.ts`,
`apps/api/src/config/config.constants.ts`, `apps/api/src/app.module.ts`; reuse the ST7 harness.
**Acceptance criteria:**
- Over-limit request → `429` envelope; under-limit passes through; identity prefers session user
  id, falls back to proxy-resolved IP; new-account-tier limits apply to young accounts.
- Link-count limiter rejects over-max bodies and accepts compliant ones.
- Storage accessed only through `IThrottleStore`; in-memory store wired by default; swapping the
  implementation needs no guard/route change (proven by a test double).
- New env vars validated in `environment.ts` (missing/invalid → startup failure consistent with
  existing handling); API `tsc` build passes.
**Security review: required** — anti-abuse control correctness + fail-closed behavior.
**Documentation Impact:** add a rate-limiting/anti-spam contract section to
`docs/development/api-conventions.md` and the new env vars to `docs/operations/launch.md`.

### ST9 — Enforce throttle on forum posting & blog comments
**Scope:** Apply the ST8 throttle + link-limit to forum **topic create** and **post create**
(ST4/ST5 routes) and to **blog comment creation** (`POST /api/blog/:postId/comments`), with the
new-account tier active.
**Allowed files (likely):** `apps/api/src/forums/forums.controller.ts` (apply
guard/decorator), `apps/api/src/blog/blog.controller.ts`; reuse the ST8 module + ST7 harness.
**Acceptance criteria:**
- Forum topic/post creation and blog comment creation are rate-limited (over-limit → `429`);
  normal usage unaffected; new-account tier demonstrably stricter.
- Link-over-limit bodies on the protected routes are rejected per the ST8 contract.
- No throttle logic duplicated — enforcement reuses the ST8 module at **every** protected site;
  enumerate the sites (count) in the report (P7).
**Security review: required** — the actual enforcement boundary, across two modules.
**Documentation Impact:** update `docs/features/blog.md` (comment rate-limit) and
`docs/features/forums.md` (posting limits); reference the `api-conventions.md` contract.

### ST10 — Blog explicit-slug duplicate-key → 409 (folded-in, D9-2)
**Scope:** Map duplicate-key errors on explicit (caller-supplied) blog slugs — `create()` with
an explicit slug and slug-changing `update()` — to a controlled `409` envelope. The auto-derived
path already retries→409; this closes the explicit path that still surfaces a raw 500.
**Allowed files (likely):** `apps/api/src/blog/blog.service.ts`.
**Acceptance criteria:**
- Explicit-slug create and slug-changing update on a colliding slug return a `409` envelope (not
  a 500); the auto-derived retry path behavior is unchanged.
**Security review:** not required (error-mapping robustness fix).
**Documentation Impact:** update `docs/features/blog.md` (explicit-slug 409 contract).

### ST11 — Media: magic-byte verification across image uploads (folded-in, AV3 / finding M2)
**Scope:** Add **magic-byte (content-sniffing) verification** at the shared media upload
validation point: read the file's leading bytes and reject (`400`) any file whose signature does
not match an allowed image type, even when the client-supplied content-type is allowed. Apply to
**every** image `resourceType` (P7). **SVG stays excluded.** Closes deferred finding M2. No
resizing/processing.
**Allowed files (likely):** `apps/api/src/media/media.service.ts`, a dedicated content-sniffing
helper under `apps/api/src/media/`, `apps/api/src/media/*` (types if needed).
**Acceptance criteria:**
- Validation rejects (`400`) a file whose magic bytes do not match an allowed image type even
  when the content-type header is allowed (polyglot rejected); applies to every image
  resourceType (state the count); SVG remains rejected.
- Compliant real images for each existing resourceType still upload and serve unchanged (no
  regression).
- API `tsc` build + full validation matrix pass.
**Security review: required** — closure of a real prior security finding; sniffing correctness.
**Documentation Impact:** update `docs/features/media.md` (magic-byte verification contract,
SVG-excluded note).

### ST12 — Media: self-service `avatar` upload resourceType + size cap
**Scope:** Add a new media upload `resourceType = "avatar"` whose write authorization is
**self-service** (any active session may upload its own avatar — like `blog-comment`, not
admin-gated), stored under an `avatar/` key prefix with a tighter avatar size cap (new config).
The `media_references` row created for an avatar is what ST15's set-avatar API validates against.
Depends on ST11 (shared `media.service.ts`).
**Allowed files (likely):** `apps/api/src/media/media.service.ts`,
`apps/api/src/media/media.controller.ts`, media `resourceType` enum location,
`apps/api/src/config/environment.ts` / `config.constants.ts` (avatar size cap).
**Acceptance criteria:**
- `POST /api/media/upload?resourceType=avatar` succeeds for any active session, `401`s with no
  session, stores under an `avatar/` prefix, rejects oversized avatars `400` at the avatar cap.
- The magic-byte verification from ST11 applies to avatar uploads too (SVG rejected).
- New config validated in `environment.ts` and documented in `launch.md`.
**Security review: required** — new self-service upload surface.
**Documentation Impact:** update `docs/features/media.md` (`avatar` resourceType + auth) and
`docs/operations/launch.md` (avatar size-cap env var).

### ST13 — Users schema: `bio` + `avatar_media_id`
**Scope:** Add `bio` and `avatar_media_id` columns to `users` in one reversible forward
migration; update + register the entity. `avatar_media_id` references a `media_references` row
(match existing media-reference linking). No endpoints here. Shares `database.config.ts` with
ST1 (sequence accordingly).
**Allowed files (likely):** `apps/api/src/users/entities/user.entity.ts`,
`apps/api/src/database/migrations/<epoch>-user-bio-and-avatar.ts`,
`apps/api/src/database/database.config.ts`.
**Acceptance criteria:**
- Migration applies cleanly on MySQL 5.7.44 and is reversible; entity updated and registered.
- `pnpm typecheck` + API `tsc` build pass.
**Security review:** not required (schema only).
**Documentation Impact:** none here (surfaced in ST14/ST15 docs).

### ST14 — Username suggest + minimal public profile API
**Scope:** (a) A **session-gated, throttled** username-suggest endpoint
(`GET /api/users/suggest?q=`) returning at most a small capped list of `{ username, displayName,
avatarUrl? }` for active users matching a prefix; no other fields; throttled via ST8; no
email/role/status leak. (b) A **minimal public profile** API for `/users/<username>` exposing
only `username, displayName, avatar, bio, joinDate` (avatar resolved to its `/api/media/<id>`
URL or null). Depends on ST13 (columns) + ST8 (throttle).
**Allowed files (likely):** `apps/api/src/users/users.controller.ts`,
`apps/api/src/users/users.service.ts`, `apps/api/src/users/users.types.ts`; reuse
`apps/api/src/common/throttle/*`.
**Acceptance criteria:**
- Suggest requires an active session (`401`), is throttled, returns only
  `username/displayName/avatarUrl`, caps result count, matches by prefix on active users only —
  no email/role/status in any field.
- Public profile returns exactly the five permitted fields for an existing active user and `404`
  for nonexistent/inactive (uniform — no enumeration via status); avatar is the `/api/media/<id>`
  URL or null.
**Security review: required** — username enumeration surface + public PII exposure.
**Documentation Impact:** extend `docs/features/auth.md` (public profile + suggest endpoint +
exposed-field list); cross-link from `forums.md`.

### ST15 — Set/remove-avatar API (ownership-enforced)
**Scope:** A self-service endpoint that accepts a `media_references` id, validates the row has
`resourceType = "avatar"` **and** is owned by the calling user, then sets `users.avatar_media_id`;
remove clears it. Depends on ST13 (column) + ST12 (`avatar` resourceType).
**Allowed files (likely):** the settings/account route file owning self-service profile
mutations (confirm location), `apps/api/src/users/users.service.ts`,
`apps/api/src/users/users.types.ts`; read-only reference to `MediaService`/`media_references`.
**Acceptance criteria:**
- Set-avatar rejects (`400`/`403`) a media id that does not exist, is not `resourceType='avatar'`,
  or is not owned by the caller; on success `avatar_media_id` persists and shows in the profile.
- Remove clears `avatar_media_id`.
- Requires an active session (`401` otherwise).
**Security review: required** — avatar-ownership enforcement (a foreign media id must not become
someone's avatar).
**Documentation Impact:** extend `docs/features/auth.md` (set/remove-avatar contract); note the
`avatar_media_id` field.

### ST16 — Web: forum browsing, authoring, mentions, moderation controls
**Scope:** Next.js App Router surfaces under `/forums`: category/board index (site boards only),
board view with paginated topics, topic view with paginated posts via `MarkdownRenderer`,
create-topic and reply forms reusing `MarkdownEditor` + `ImageUpload`, a quote-a-post
affordance, `@username` autocomplete in the editor (calls the ST14 suggest endpoint), rendered
`@username` as a link to `/users/<username>`, and moderator-only pin/lock/move controls
(client-gated via `resolveProtectedSession()` + `hasGlobalRole`; the API is the enforcement
boundary). Locked topics show a notice and hide the reply form. Keyboard-accessible.
**Allowed files (likely):** `apps/web/app/forums/` (`page.tsx`, `[boardSlug]/page.tsx`,
`[boardSlug]/[topicSlug]/page.tsx`, `forums-client.ts`, `*.module.css`),
`apps/web/components/` (a mention-autocomplete helper + any quote helper; reuse existing
editor/upload/renderer — do not fork), `apps/web/app/auth-client.ts` (read-only role mirror).
**Acceptance criteria:**
- Forum index shows only site boards; board/topic pages paginate and render sanitized Markdown
  (no raw HTML execution).
- Members can create topics and replies; guests see a sign-in affordance preserving `?next=`;
  locked topics hide the form with a notice.
- `@`-autocomplete queries the suggest endpoint and inserts the chosen handle; rendered
  `@username` links to the public profile.
- Moderator controls render only for moderator/admin sessions and call the ST6 API;
  non-privileged users never see them.
- Web lint + typecheck pass (no `no-img-element`/unused-import — P4); web tests execute behavior
  (P3). Depends on ST3, ST4, ST5, ST6, ST14.
**Security review: required** — renders user-authored content + mentions; verify the render path
and that the UI gate is not the only control.
**Documentation Impact:** extend `docs/features/forums.md` (web surfaces) and
`docs/features/web-shell.md` (route map); admin/mod how-to in `docs/guides/content-management.md`.

### ST17 — Web: public profile page + avatar upload & display
**Scope:** The public profile page `/users/<username>` (five permitted fields), an avatar upload
control in settings/profile using `ImageUpload` (`resourceType="avatar"`) wired to the ST15
set/remove-avatar API, and an avatar display component used on the public profile, on forum
topic/post author bylines, and in mention-autocomplete results, with a no-avatar fallback
(initials/placeholder).
**Allowed files (likely):** `apps/web/app/users/[username]/page.tsx`,
`apps/web/app/settings/page.tsx` (avatar control), `apps/web/app/profile/page.tsx` (own avatar —
confirm location), `apps/web/components/` (an avatar display component; reuse `ImageUpload`).
**Acceptance criteria:**
- The public profile page renders only the five permitted fields.
- A member can upload/replace and remove their avatar from settings/profile; the new avatar
  appears on their profile, forum bylines, and autocomplete results; users without an avatar get
  the fallback (no broken image).
- Web lint + typecheck pass; web tests execute behavior. Depends on ST12, ST14, ST15, and the
  byline display integrates with ST16's forum pages.
**Security review: required** — renders user-supplied avatar images + PII; verify the serve path.
**Documentation Impact:** extend `docs/features/web-shell.md` (route map: `/users/<username>`)
and `docs/features/auth.md` (profile/avatar web surface).

### ST18 — Exercise `StandalonePageEntity.currentRevision` relation (folded-in, D9-3)
**Scope:** Add a DB-gated relation-loading assertion (or a first product consumer) that loads a
`StandalonePageEntity` via `relations: ["currentRevision"]`, closing the register note that the
relation decorator exists but is never exercised. Prefer extending the opt-in
`pages.service.integration.test.ts` (DB-gated) or a thin service method — no schema change.
**Allowed files (likely):** `apps/api/src/pages/pages.service.ts`,
`apps/api/src/pages/entities/standalone-page.entity.ts` (refs),
`apps/api/src/pages/pages.service.integration.test.ts`.
**Acceptance criteria:**
- A test or product path loads a `StandalonePageEntity` with `currentRevision` populated and
  asserts the joined revision is the current one; runs (or skips cleanly) under
  `SFUS_DB_INTEGRATION` without breaking the default no-DB test pass.
- No schema change; `createForeignKeyConstraints: false` semantics preserved.
**Security review:** not required.
**Documentation Impact:** none (internal test/relation exercise). If a product consumer is
added, reflect it in `docs/features/pages.md`.

---

## 8. Dependency Ordering & parallelization

```
Forums:   ST1 ─▶ ST2 ─▶ ST3 ─▶ ST4 ─▶ ST5 ─▶ ST6 ──────────────────────┐
Anti-abuse:       ST7 ─▶ ST8 ─────────────▶ ST9                         │
                                ST10 (blog.service — near-independent)   │
Media:    ST11 ─▶ ST12                                                   │
Identity: ST13 ─▶ ST14 ───────────────────────────────────────────────┐│
          ST13 ─▶ ST15  (also needs ST12)                              ││
Web:                                                  ST16 ◀───────────┴┘
                                                      ST17 ◀── ST12,ST14,ST15
Folded:   ST18  (fully independent — parallel anytime)
```

- **Forum chain ST1→ST2→ST3→ST4→ST5→ST6** is strictly serial (siblings edit
  `forums.controller.ts`/`forums.service.ts`).
- **ST7→ST8→ST9**: harness before throttle (tests), throttle before wiring. ST8 shares
  `app.module.ts`/`environment.ts` with ST1 → after ST1. ST9 needs ST5 (post routes) + ST8.
- **ST10** is isolated to `blog.service.ts` but shares it with ST9's blog touch — sequence ST10
  vs ST9 (otherwise near-independent, parallel-eligible against the forum chain).
- **ST11→ST12**: same `media.service.ts`. ST12 is a prerequisite of ST15. ST11/ST12 are
  parallel-eligible against the forum chain (different module), with the `environment.ts` caveat
  vs ST8 (both touch config) → sequence those two.
- **ST13** (users schema) shares `database.config.ts` with ST1 → after ST1; foundational for
  ST14/ST15.
- **ST14** needs ST13 + ST8; **ST15** needs ST13 + ST12.
- **ST16** needs ST3–ST6 + ST14; **ST17** needs ST12 + ST14 + ST15 (and integrates byline
  display with ST16's pages).
- **ST18** is the only fully isolated subtask — safely parallel anytime.

**Recommended execution order:** ST1, ST13, ST7, ST11, ST8, ST12, ST2, ST3, ST4, ST5, ST6, ST9,
ST10, ST14, ST15, ST16, ST17 — with **ST18 in parallel** at any point, and ST7/ST11 pulled early
since they unblock ST8/ST12.

> Conservative-parallelism note: **ST18** is the only fully parallel-safe subtask. ST7, ST10,
> ST11 are *near*-independent (one shared file each with a single sibling) and can overlap the
> forum chain if the Coordinator sequences that one shared file. Everything else serializes on a
> shared file.

---

## 9. Overall Documentation Impact

- **New:** `docs/features/forums.md` (+ row in `docs/README.md` routing table).
- **Updated:** `docs/features/auth.md` (public profile + suggest + set-avatar + `bio`/
  `avatar_media_id`), `docs/features/blog.md` (comment rate-limit + explicit-slug 409),
  `docs/features/media.md` (`avatar` resourceType + magic-byte verification + SVG-excluded),
  `docs/features/web-shell.md` (route map: `/forums/*`, `/users/<username>`),
  `docs/development/api-conventions.md` (rate-limit / anti-spam contract),
  `docs/operations/launch.md` (new env vars incl. avatar size cap),
  `docs/guides/content-management.md` (forum admin/mod how-to).
- **Register (`docs/deferred-tasks.md`) — append/update during this planning cycle:**
  - Redis introduction is unscheduled in the milestone plan; throttle storage uses an in-memory
    `IThrottleStore` seam and should swap to Redis when introduced — **owning milestone to be
    fixed by a separate designer pass** (D1).
  - Captcha and bad-word/content-filter anti-spam remain deferred to M11 (D2).
  - Project-scoped (restricted) boards become reachable at M7/M8; M4 ships only the scoping
    framework (D4) — flag as input to the designer pass.
  - Per-board moderators revisit after M8 project roles (D5).
  - Polls deferred to a future forums-enhancement pass (D7).
  - Topic split/merge deferred to a future forums-enhancement pass (D7).
  - WYSIWYG editor **re-targeted to M5** (Documents Wiki); off-the-shelf editor permitted (D8).
  - Editor-mode preference + media-library picker **moved to M5** with the WYSIWYG work (D8).
  - Server-side avatar image processing (resize/crop/thumbnail/WebP, design §15) deferred — M4
    stores avatars as-is with MIME + size caps (AV2).
  - **Close on delivery:** magic-byte media finding M2 implemented in M4 (ST11) — remove the
    M6-suggested entry once delivered (AV3).
  - Remove/resolve the three folded-in entries once delivered: proxy/helmet executed tests
    (D9-1 / ST7), blog explicit-slug 409 (D9-2 / ST10), pages `currentRevision` exercise
    (D9-3 / ST18).

> Per policy the register is edited only during a planning cycle. The above is the planner's
> intended register delta for this cycle; the user/Coordinator applies it as part of accepting
> this plan.

---

## 10. Risks & mitigations

- **R1 — Visibility/oracle leaks (highest; P12).** Many new read paths. *Mitigation:*
  ST3/ST4/ST5/ST6 security-marked; all decisions route through `evaluate()`; ACs demand 404
  parity + operator-pinned predicate tests; main-forum index excludes project/non-readable
  boards from output **and** counts.
- **R2 — Throttle correctness / fail-open.** *Mitigation:* ST8 security-marked; ACs require
  fail-closed `429`, proxy-resolved IP fallback, proven storage seam; ST9 enumerates all wired
  sites (P7).
- **R3 — Username enumeration via suggest/profile.** *Mitigation:* ST14 security-marked;
  session-gate + throttle + minimal fields + uniform 404.
- **R4 — Shared-file merge churn** (`forums.service.ts`, `app.module.ts`, `database.config.ts`,
  `environment.ts`, `media.service.ts`, `blog.service.ts`). *Mitigation:* strict serialization;
  the recommended order front-loads shared-file edits; only ST18 is fully parallel.
- **R5 — Plan-requirement traceability (P2).** *Mitigation:* every decision D1–D9/AV1–AV3 maps
  to a subtask AC or a register entry; security markers are restated inside each prompt (P6).
- **R6 — Partial-breadth (P7).** *Mitigation:* ST9 (all throttle sites) and ST11 (all image
  resourceTypes) ACs require enumerating every site.
- **R7 — Avatar upload abuse / ownership confusion.** Self-service uploads + a mutable
  `avatar_media_id`. *Mitigation:* ST11 magic-byte + ST12 size cap/SVG-exclusion (security-
  marked); ST15 enforces `resourceType='avatar'` + caller-ownership (security-marked).
- **R8 — MySQL 5.7.44 compatibility.** *Mitigation:* ACs forbid 8.0-only DDL; migrations
  reversible and validated on a 5.7 schema (ST1, ST13).
- **R9 — toolchain split-brain (P4/P5).** *Mitigation:* ACs require the API `tsc` build + full
  matrix; the ST7 harness must be CommonJS-safe (no `import.meta`).

---

## 11. Implementer Prompts

> Each prompt is launch-ready for the Coordinator. Allowed-file lists are the planner's best
> bounded inference ("likely files"); the Implementer confirms exact paths before editing and
> may add a closely-adjacent file when clearly required, noting it in the report. Artifact
> directory: `artifacts/milestone-4-forums/<subtask-id>/` (repository-root-relative).

### ST1 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST1 — Forums data model, migration, and module scaffold. Source of
truth: star_frontiers_rpg_website_design.md (§5.2, §7), docs/development/api-conventions.md
(DB/migration conventions), plans/milestone-4-forums-plan.md (ST1). Continue past preflight into
implementation when no blocking input is missing.

Scope: Create a `forums` module and TypeORM entities for forum_categories, forum_boards,
forum_topics, forum_posts; a forward migration creating these tables; register module, entities,
and migration. On forum_boards bake in the project-ready scoping framework: scope_type
ENUM('site','project') NOT NULL DEFAULT 'site', a nullable project_id (no FK yet — document as
forward-scaffolding), and a visibility column using the existing visibility vocabulary
(public|unlisted|members|project-only|private). Add deleted_at NULL on topics and posts. No
request endpoints beyond module registration. MySQL 5.7.44-compatible DDL only (no 8.0-only
features); utf8mb4; precision-3 datetimes like existing entities.

Allowed files (confirm before editing; note any addition): apps/api/src/forums/forums.module.ts;
apps/api/src/forums/entities/forum-category.entity.ts, forum-board.entity.ts,
forum-topic.entity.ts, forum-post.entity.ts;
apps/api/src/database/migrations/<epoch-ms>-milestone-four-forums-foundation.ts;
apps/api/src/database/database.config.ts; apps/api/src/app.module.ts.

Acceptance criteria:
- Entities compile and are added to reviewedEntityClasses; migration added to
  reviewedMigrationClasses with a consistent name.
- forum_boards has scope_type (default 'site'), nullable project_id, and visibility columns.
- Migration applies cleanly on a fresh MySQL 5.7.44 schema; down() drops tables FK-safely; no
  8.0-only syntax.
- ForumsModule.register(environment) follows the dynamic-module pattern and is imported by
  AppModule.
- pnpm lint, pnpm typecheck, pnpm test, and the API tsc build pass.

Validation: run the commands in docs/development/testing.md scoped to your change. Report only
commands you actually ran.

Tester handoff: API specs colocated as apps/api/src/forums/*.test.ts. Artifacts under
artifacts/milestone-4-forums/ST1/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST2 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST2 — Categories & boards admin management (CRUD). Source of truth:
plans/milestone-4-forums-plan.md (ST2), docs/features/authorization.md (assertAdminManagementAccess
pattern). Depends on ST1. Continue past preflight into implementation when no blocking input is
missing.

Scope: Admin CRUD for categories and boards (create/update/delete/reorder) behind a
BlogService-style assertAdminManagementAccess (admin role). Board create/update sets scope_type,
visibility, and nullable project_id. No public read here (that is ST3). Uniform gate error
contract (401 no session / 403 non-admin).

Allowed files (confirm before editing): apps/api/src/forums/forums.controller.ts,
forums.service.ts, forums.types.ts; Swagger/JSDoc on new handlers.

Acceptance criteria:
- Admin endpoints enforce 401/403 before any data operation.
- Create/update persist scope_type, visibility, project_id; reorder/position is deterministic in
  the response.
- Invalid scope_type/visibility values are rejected 400.
- Swagger/JSDoc match the real status contract.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build (per docs/development/testing.md).
Report only commands you ran.

Tester handoff: API specs as apps/api/src/forums/*.test.ts. Artifacts under
artifacts/milestone-4-forums/ST2/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST3 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST3 — leak-proof public read API for categories & boards. Source of
truth: plans/milestone-4-forums-plan.md (ST3), docs/features/authorization.md,
docs/development/agent-retrospective-patterns.md (P1, P12). Depends on ST2. Continue past preflight
into implementation when no blocking input is missing.

Scope: Public read API to list categories with their boards and to fetch a single board. The
main-forum listing MUST return only scope_type='site' boards whose visibility is publicly
readable, routed through AuthorizationService.evaluate(); project-scoped or non-readable boards
must never appear in the list, its counts, or any board-detail lookup reached from the main forum.
A hidden/nonexistent board returns a uniform 404 (no existence oracle).

Allowed files (confirm before editing): apps/api/src/forums/forums.controller.ts,
forums.service.ts, forums.types.ts.

Acceptance criteria:
- Listing returns only site, publicly-readable boards; a project-scoped or non-readable board is
  absent from output AND counts.
- Board detail for a hidden/nonexistent board returns 404 with a message identical to the
  nonexistent case (oracle parity).
- Every visibility decision calls evaluate()/assertAllowed() — no inline re-derived predicates.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/forums/*.test.ts; include leak/oracle-parity tests.
Artifacts under artifacts/milestone-4-forums/ST3/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST4 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST4 — Topics: create, paginated read, visibility, pinned ordering.
Source of truth: plans/milestone-4-forums-plan.md (ST4), docs/features/media.md (sanitizer),
docs/development/agent-retrospective-patterns.md (P12). Depends on ST3. Continue past preflight
into implementation when no blocking input is missing.

Scope: Member-authenticated topic creation within a readable board; public paginated read of
topics in a board. Body through normalizeMarkdownBody then validateMarkdownBody (400 unsafe)
before persistence. Enforce the full board+topic visibility predicate via shared helpers on every
path; gated or nonexistent lookups are 404-indistinguishable with uniform messages. Pinned topics
sort first. Public topic shape exposes author username/displayName, omits internal-only fields.

Allowed files (confirm before editing): apps/api/src/forums/forums.controller.ts,
forums.service.ts, forums.types.ts.

Acceptance criteria:
- Create topic requires an active session (401); writes to a non-readable/nonexistent board
  return 404 (uniform message).
- Topic list paginates with a deterministic order (e.g. isPinned DESC, lastPostAt DESC) and a
  stable page contract.
- Unsafe Markdown rejected 400 before persistence.
- Visibility checks use shared predicate helpers; public shape mapped server-side.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/forums/*.test.ts; add oracle-parity and
operator-pinned predicate tests. Artifacts under artifacts/milestone-4-forums/ST4/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST5 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST5 — Posts: create, threading, quoting, locked-topic, paginated
read. Source of truth: plans/milestone-4-forums-plan.md (ST5), docs/features/blog.md (lock +
threading + oracle precedents), docs/features/media.md, agent-retrospective-patterns.md (P12).
Depends on ST4. Continue past preflight into implementation when no blocking input is missing.

Scope: Member-authenticated post (reply) creation within a readable, unlocked topic; public
paginated read of posts in a topic; quoting support (accept a quoted-reference shape or
quote-as-Markdown — rendering is the web subtask). Threading is one level (a reply's parent must
be a top-level post on the same topic; mirror the blog-comment rule). Body sanitized (400 unsafe).
Locked topics reject new posts with 403 thread-locked. Full visibility predicate; oracle parity.

Allowed files (confirm before editing): apps/api/src/forums/forums.controller.ts,
forums.service.ts, forums.types.ts.

Acceptance criteria:
- Create post requires an active session (401); writes to a non-readable/nonexistent board/topic
  return 404; posting to a locked topic returns 403 thread-locked.
- Invalid parentId (nonexistent, different topic, or reply-to-a-reply) returns a uniform 400 (no
  existence oracle).
- Post list paginates deterministically (oldest-first within threading) with a stable contract.
- Unsafe Markdown rejected 400; public shape exposes author username/displayName, omits
  internal-only fields.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/forums/*.test.ts; include oracle-parity and
threading-validation tests. Artifacts under artifacts/milestone-4-forums/ST5/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST6 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST6 — Forum moderation controls (pin/lock/move). Source of truth:
plans/milestone-4-forums-plan.md (ST6), docs/features/authorization.md (assertModerationAccess).
Depends on ST5. Continue past preflight into implementation when no blocking input is missing.

Scope: Moderator/admin endpoints to pin/unpin and lock/unlock topics and to move a topic to
another readable board, behind assertModerationAccess (moderator|admin). Moves re-validate the
destination board's scope/visibility through AuthorizationService.evaluate() so a move cannot leak
a topic across visibility scopes. Record who/when where the entity supports it.

Allowed files (confirm before editing): apps/api/src/forums/forums.controller.ts,
forums.service.ts, forums.types.ts.

Acceptance criteria:
- Pin/lock/move return 401 no session / 403 non-moderator before any data op; success persists
  and shows in subsequent reads.
- Lock blocks new posts for non-privileged users (consistent with blog comment-lock semantics).
- Move rejects a destination the actor cannot manage and a move that would change a topic's
  effective visibility scope without authorization (403/400); destination re-evaluated via
  evaluate().
- Swagger/JSDoc reflect the real status contract.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/forums/*.test.ts. Artifacts under
artifacts/milestone-4-forums/ST6/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST7 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST7 — a supertest-class HTTP harness plus the two folded-in executed
proxy-hop and helmet tests. Source of truth: plans/milestone-4-forums-plan.md (ST7),
docs/architecture/milestone-1-foundation-decisions.md (trusted-proxy decision),
docs/development/agent-retrospective-patterns.md (P3, P4, P5). Continue past preflight into
implementation when no blocking input is missing.

Scope: Stand up a CommonJS-safe supertest-class HTTP harness for the API and deliver two executed
tests: (a) a proxy-hop test proving request.ip resolves the original client IP from
X-Forwarded-For under trust proxy=1; (b) helmet baseline header assertions —
X-Content-Type-Options: nosniff present, Strict-Transport-Security absent, no CSP header. Export
the harness so ST8/ST9 can reuse it.

Allowed files (confirm before editing): apps/api/src/index.test.ts or a new harness test file; a
shared test-harness helper under apps/api/src/.

Acceptance criteria:
- Executed proxy-hop test asserts request.ip equals the injected X-Forwarded-For client address
  (not a mocked setter call).
- Executed helmet test asserts the three header conditions on a real HTTP response.
- Harness is a reusable exported helper and CommonJS-safe (no import.meta); API tsc build passes.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: the harness + these tests live under apps/api/src/. Artifacts under
artifacts/milestone-4-forums/ST7/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST8 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST8 — the rate-limit/throttle module. Source of truth:
plans/milestone-4-forums-plan.md (ST8), star_frontiers_rpg_website_design.md (§13, §14),
agent-retrospective-patterns.md (P4, P5). Depends on ST1 (shares app.module.ts/environment.ts) and
ST7 (harness for tests). Continue past preflight into implementation when no blocking input is
missing.

Scope: A reusable cross-cutting throttle module — a guard/decorator (or service helper) keyed by
(route-class, identity), where identity is the session user id when present, else the real client
IP (resolved by trust proxy=1). Storage behind IThrottleStore (hit(key, window) -> {count,
resetAt}) with an in-memory implementation wired now (the documented seam for a future Redis
store). A stricter new-account tier (young accounts by a configurable window get lower limits) and
a reusable per-post link-count limiter (counts URLs in a Markdown body; rejects over a
configurable max). All limits configurable via env vars validated in environment.ts. On breach:
429 with a JsonExceptionFilter-shaped envelope plus a Retry-After-style hint. No route wiring here
(that is ST9).

Allowed files (confirm before editing): apps/api/src/common/throttle/ (throttle.module.ts,
throttle.guard.ts, throttle.service.ts, throttle-store.ts, link-limit.ts, throttle.types.ts);
apps/api/src/config/environment.ts; apps/api/src/config/config.constants.ts;
apps/api/src/app.module.ts; reuse the ST7 harness.

Acceptance criteria:
- Over-limit request -> 429 envelope; under-limit passes through; identity prefers session user
  id, falls back to proxy-resolved IP; new-account-tier limits apply to young accounts.
- Link-count limiter rejects over-max bodies and accepts compliant ones.
- Storage accessed only through IThrottleStore; in-memory store wired by default; swapping the
  implementation needs no guard/route change (proven by a test double).
- New env vars validated in environment.ts (missing/invalid -> startup failure consistent with
  existing handling); API tsc build passes.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs under apps/api/src/common/throttle/*.test.ts. Artifacts under
artifacts/milestone-4-forums/ST8/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST9 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST9 — enforce the throttle on forum posting and blog comments.
Source of truth: plans/milestone-4-forums-plan.md (ST9), agent-retrospective-patterns.md (P7).
Depends on ST5 (forum write routes) and ST8 (throttle module). Continue past preflight into
implementation when no blocking input is missing.

Scope: Apply the ST8 throttle + link-limit to forum topic create and post create and to blog
comment creation (POST /api/blog/:postId/comments), with the new-account tier active.

Allowed files (confirm before editing): apps/api/src/forums/forums.controller.ts (apply
guard/decorator), apps/api/src/blog/blog.controller.ts; reuse the ST8 module and ST7 harness.

Acceptance criteria:
- Forum topic/post creation and blog comment creation are rate-limited (over-limit -> 429); normal
  usage unaffected; new-account tier demonstrably stricter.
- Link-over-limit bodies on the protected routes are rejected per the ST8 contract.
- No throttle logic duplicated — enforcement reuses the ST8 module at every protected site;
  enumerate the protected sites (count) in your report.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/forums/*.test.ts and apps/api/src/blog/*.test.ts
(over-limit/under-limit). Artifacts under artifacts/milestone-4-forums/ST9/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST10 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST10 — map blog explicit-slug duplicate-key errors to 409. Source of
truth: plans/milestone-4-forums-plan.md (ST10), docs/features/blog.md. Near-independent (touches
blog.service.ts — sequence relative to ST9's blog touch). Continue past preflight into
implementation when no blocking input is missing.

Scope: Map duplicate-key errors on explicit (caller-supplied) blog slugs — create() with an
explicit slug and slug-changing update() — to a controlled 409 envelope. The auto-derived path
already retries to 409; close the explicit path that still surfaces a raw 500.

Allowed files (confirm before editing): apps/api/src/blog/blog.service.ts.

Acceptance criteria:
- Explicit-slug create and slug-changing update on a colliding slug return a 409 envelope (not a
  500); the auto-derived retry path behavior is unchanged.

Security review: not required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/blog/*.test.ts (explicit-slug collision -> 409).
Artifacts under artifacts/milestone-4-forums/ST10/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST11 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST11 — magic-byte (content-sniffing) verification for all image
uploads. Source of truth: plans/milestone-4-forums-plan.md (ST11), docs/features/media.md, the
deferred-register finding M2, agent-retrospective-patterns.md (P7). Media module only; independent
of the forum/users chain. Continue past preflight into implementation when no blocking input is
missing.

Scope: Add magic-byte verification at the shared media upload validation point: read the file's
leading bytes and reject (400) any file whose signature does not match an allowed image type, even
when the client-supplied content-type is allowed. Apply to EVERY image resourceType
(blog-post/standalone-page/blog-comment, and avatar once ST12 lands) — enumerate them in your
report. Keep SVG excluded. No image resizing/processing.

Allowed files (confirm before editing): apps/api/src/media/media.service.ts; a dedicated
content-sniffing helper under apps/api/src/media/; media types if needed.

Acceptance criteria:
- Validation rejects (400) a file whose magic bytes do not match an allowed image type even when
  the content-type header is allowed (polyglot rejected); applies to every image resourceType
  (state the count); SVG remains rejected.
- Compliant real images for each existing resourceType still upload and serve unchanged.
- API tsc build and the full validation matrix pass.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/media/*.test.ts — test the format class (not one
fixture), SVG exclusion, and a no-regression upload per resourceType. Artifacts under
artifacts/milestone-4-forums/ST11/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST12 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST12 — self-service `avatar` media upload resourceType + size cap.
Source of truth: plans/milestone-4-forums-plan.md (ST12), docs/features/media.md. Depends on ST11
(shares media.service.ts). Continue past preflight into implementation when no blocking input is
missing.

Scope: Add a media upload resourceType 'avatar' whose write authorization is self-service (any
active session may upload its own avatar — like blog-comment, NOT admin-gated). Store under an
avatar/ key prefix with a tighter avatar size cap (new config). The magic-byte verification from
ST11 must apply to avatar uploads. No image resizing/processing.

Allowed files (confirm before editing): apps/api/src/media/media.service.ts, media.controller.ts,
the resourceType enum location; apps/api/src/config/environment.ts and config.constants.ts (avatar
size cap).

Acceptance criteria:
- POST /api/media/upload?resourceType=avatar succeeds for any active session, 401s with no
  session, stores under an avatar/ prefix, and rejects oversized avatars 400 at the avatar cap.
- Magic-byte verification (ST11) applies to avatar uploads; SVG rejected.
- New config validated in environment.ts and documented in launch.md.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/media/*.test.ts (avatar auth + size cap). Artifacts
under artifacts/milestone-4-forums/ST12/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST13 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST13 — add bio + avatar_media_id columns to users. Source of truth:
plans/milestone-4-forums-plan.md (ST13), star_frontiers_rpg_website_design.md (§4, §7),
docs/development/api-conventions.md (migration conventions). Shares database.config.ts with ST1
(sequence after ST1). Continue past preflight into implementation when no blocking input is
missing.

Scope: Add bio and avatar_media_id columns to users in one reversible forward migration; update
and register the entity. avatar_media_id references a media_references row (match how media
references are linked elsewhere in the codebase — DB FK only if consistent with that pattern). No
endpoints here.

Allowed files (confirm before editing): apps/api/src/users/entities/user.entity.ts;
apps/api/src/database/migrations/<epoch-ms>-user-bio-and-avatar.ts;
apps/api/src/database/database.config.ts.

Acceptance criteria:
- Migration applies cleanly on MySQL 5.7.44 and is reversible; entity updated and registered.
- pnpm typecheck and the API tsc build pass.

Security review: not required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: if a DB-gated assertion is added, keep it consistent with the existing
SFUS_DB_INTEGRATION gate. Artifacts under artifacts/milestone-4-forums/ST13/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST14 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST14 — username suggest endpoint + minimal public profile API.
Source of truth: plans/milestone-4-forums-plan.md (ST14), star_frontiers_rpg_website_design.md
(§4, §18), agent-retrospective-patterns.md (P12). Depends on ST13 (columns) and ST8 (throttle).
Continue past preflight into implementation when no blocking input is missing.

Scope:
(a) A session-gated, throttled username-suggest endpoint (e.g. GET /api/users/suggest?q=)
returning at most a small capped list of { username, displayName, avatarUrl? } for active users
matching a prefix — no other fields; throttled via ST8; never leak email/role/status.
(b) A minimal public profile API for /users/<username> exposing only username, displayName,
avatar, bio, joinDate (avatar resolved to its /api/media/<id> URL or null).

Allowed files (confirm before editing): apps/api/src/users/users.controller.ts, users.service.ts,
users.types.ts; reuse apps/api/src/common/throttle/*.

Acceptance criteria:
- Suggest requires an active session (401), is throttled, returns only username/displayName/
  avatarUrl, caps result count, matches by prefix on active users only — no email/role/status in
  any field.
- Public profile returns exactly the five permitted fields for an existing active user and 404 for
  nonexistent/inactive (uniform — no enumeration via status); avatar is the /api/media/<id> URL or
  null.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/users/*.test.ts (enumeration-parity + field-exposure).
Artifacts under artifacts/milestone-4-forums/ST14/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST15 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST15 — self-service set/remove-avatar API with ownership
enforcement. Source of truth: plans/milestone-4-forums-plan.md (ST15), docs/features/media.md.
Depends on ST13 (column) and ST12 (avatar resourceType). Continue past preflight into
implementation when no blocking input is missing.

Scope: A self-service endpoint that accepts a media_references id, validates the row has
resourceType='avatar' AND is owned by the calling user, then sets users.avatar_media_id; remove
clears it. Reject foreign/wrong-type/nonexistent ids with 400/403; require an active session.

Allowed files (confirm before editing): the settings/account route file owning self-service
profile mutations (confirm location), apps/api/src/users/users.service.ts, users.types.ts;
read-only reference to MediaService / media_references.

Acceptance criteria:
- Set-avatar rejects (400/403) a media id that does not exist, is not resourceType='avatar', or is
  not owned by the caller; on success avatar_media_id persists and shows in the profile.
- Remove clears avatar_media_id.
- Requires an active session (401 otherwise).

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: API specs as apps/api/src/users/*.test.ts (avatar-ownership enforcement).
Artifacts under artifacts/milestone-4-forums/ST15/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST16 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST16 — web forum browsing, authoring, mentions, and moderation
controls. Source of truth: plans/milestone-4-forums-plan.md (ST16), docs/features/web-shell.md,
docs/features/blog.md (comment-lock UX), docs/features/media.md (editor/renderer/upload),
agent-retrospective-patterns.md (P3, P4). Depends on ST3, ST4, ST5, ST6, ST14. Continue past
preflight into implementation when no blocking input is missing.

Scope: Next.js App Router surfaces under /forums — category/board index (site boards only), board
view with paginated topics, topic view with paginated posts via MarkdownRenderer, create-topic and
reply forms reusing MarkdownEditor + ImageUpload, a quote-a-post affordance, @username autocomplete
in the editor (calls the ST14 suggest endpoint), rendered @username as a link to /users/<username>,
and moderator-only pin/lock/move controls (client-gated via resolveProtectedSession() +
hasGlobalRole; the API is the enforcement boundary). Locked topics show a notice and hide the reply
form. Reuse existing editor/upload/renderer — do not fork. Keep keyboard-accessible.

Allowed files (confirm before editing): apps/web/app/forums/ (page.tsx, [boardSlug]/page.tsx,
[boardSlug]/[topicSlug]/page.tsx, forums-client.ts, *.module.css); apps/web/components/ (a
mention-autocomplete helper and any quote helper — reuse existing editor/upload/renderer);
apps/web/app/auth-client.ts (read-only role mirror).

Acceptance criteria:
- Forum index shows only site boards; board/topic pages paginate and render sanitized Markdown (no
  raw HTML execution).
- Members can create topics and replies; guests see a sign-in affordance preserving ?next=; locked
  topics hide the form with a notice.
- @-autocomplete queries the suggest endpoint and inserts the chosen handle; rendered @username
  links to the public profile.
- Moderator controls render only for moderator/admin sessions and call the ST6 API; non-privileged
  users never see them.
- Web lint and typecheck pass (no no-img-element/unused-import failures); web tests execute
  behavior rather than grepping source.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test (web specs via the web workspace filter). Report
only commands you ran.

Tester handoff: web specs as apps/web/app/forums/*.spec.ts and apps/web/components/*.spec.ts.
Artifacts under artifacts/milestone-4-forums/ST16/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST17 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST17 — public profile page + avatar upload & display web surfaces.
Source of truth: plans/milestone-4-forums-plan.md (ST17), docs/features/web-shell.md,
docs/features/media.md (ImageUpload), agent-retrospective-patterns.md (P3, P4). Depends on ST12,
ST14, ST15, and integrates the byline display with ST16's forum pages. Continue past preflight into
implementation when no blocking input is missing.

Scope: The public profile page /users/<username> (five permitted fields), an avatar upload control
in settings/profile using ImageUpload (resourceType="avatar") wired to the ST15 set/remove-avatar
API, and an avatar display component used on the public profile, on forum topic/post author
bylines, and in mention-autocomplete results, with a no-avatar fallback (initials/placeholder).

Allowed files (confirm before editing): apps/web/app/users/[username]/page.tsx;
apps/web/app/settings/page.tsx (avatar control); apps/web/app/profile/page.tsx (own avatar —
confirm location); apps/web/components/ (an avatar display component; reuse ImageUpload).

Acceptance criteria:
- The public profile page renders only the five permitted fields.
- A member can upload/replace and remove their avatar from settings/profile; the new avatar appears
  on their profile, forum bylines, and autocomplete results; users without an avatar get the
  fallback (no broken image).
- Web lint and typecheck pass; web tests execute behavior.

Security review: required.

Validation: pnpm lint, pnpm typecheck, pnpm test. Report only commands you ran.

Tester handoff: web specs as apps/web/app/users/*.spec.ts and apps/web/components/*.spec.ts.
Artifacts under artifacts/milestone-4-forums/ST17/.

Do not report success unless all required artifacts exist and all changes are committed.
```

### ST18 prompt
```text
Your role is 'implementer'. Your task is as follows:

Implement Milestone 4 subtask ST18 — exercise the StandalonePageEntity.currentRevision relation
(folded-in deferred-register fix). Source of truth: plans/milestone-4-forums-plan.md (ST18),
docs/features/pages.md, docs/development/testing.md (the SFUS_DB_INTEGRATION gate). Independent —
may run in parallel. Continue past preflight into implementation when no blocking input is missing.

Scope: Add a DB-gated relation-loading assertion (or a first product consumer) that loads a
StandalonePageEntity via relations: ["currentRevision"], closing the register note that the
relation decorator exists but is never exercised. Prefer extending the opt-in
pages.service.integration.test.ts (DB-gated) or a thin service method — no schema change.

Allowed files (confirm before editing): apps/api/src/pages/pages.service.ts;
apps/api/src/pages/entities/standalone-page.entity.ts (references);
apps/api/src/pages/pages.service.integration.test.ts.

Acceptance criteria:
- A test or product path loads a StandalonePageEntity with currentRevision populated and asserts
  the joined revision is the current one; runs (or skips cleanly) under SFUS_DB_INTEGRATION without
  breaking the default no-DB test pass.
- No schema change; createForeignKeyConstraints: false semantics preserved.

Security review: not required.

Validation: pnpm lint, pnpm typecheck, pnpm test, API tsc build. Report only commands you ran.

Tester handoff: keep the assertion in the pages integration spec (DB-gated) or add unit coverage
if a product consumer was introduced. Artifacts under artifacts/milestone-4-forums/ST18/.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## 12. Output Artifact Path

- **This plan artifact:** `plans/milestone-4-forums-plan.md` (repository-root-relative).
- **Coordinator/stage artifacts:** `artifacts/milestone-4-forums/<subtask-id>/` (e.g.
  `artifacts/milestone-4-forums/ST5/`), repository-root-relative, per the artifact-path
  convention.

## 13. Coordinator notes

- **Branch:** use a dedicated per-plan coordination branch (not `main`).
- **Security stages:** ST2, ST3, ST4, ST5, ST6, ST7, ST8, ST9, ST11, ST12, ST14, ST15, ST16,
  ST17 are `Security review: required` — run the specialist Security stage between Documenter and
  Verifier for each (P6). ST1, ST10, ST13, ST18 are not security-marked.
- **Register delta (§9):** apply the planner's intended `docs/deferred-tasks.md` updates as part
  of accepting this plan (register is editable only during a planning cycle).
- **Designer-pass dependencies:** the user is running a separate designer pass to place the Redis
  introduction (D1) and to confirm the project-scoped-boards framework's fit with M7/M8 (D4);
  surface ST1/ST8 outputs to that pass.
- **Final Reviewer** runs only after all subtasks complete and merge back.
```