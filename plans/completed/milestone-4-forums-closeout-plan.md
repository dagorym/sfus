# Milestone 4 Forums — Closeout Plan

> **Status:** IN PROGRESS. This plan covers (a) the non-blocking code/test follow-ups
> carried out of the Milestone 4 Forums final review
> (`artifacts/milestone-4-forums/reviewer_report.md`, CONDITIONAL PASS, 0 blocking) and
> (b) the MS4 landing-page refresh + the beginning of an admin dashboard, including a
> forums-management admin surface. Subtask identifiers `CO1`–`CO9` are defined here;
> any further additions continue at `CO10`.

## Feature restatement (engineering terms)

Two workstreams:

**A. Review follow-ups (each needs a real Implementer → … → Verifier cycle):**
- **CO1** — Link-limiter word-boundary guard for bare schemes (`mailto:`/`tel:`).
- **CO2** — Avatar-src gated-path prefix hardening (defense-in-depth).
- **CO3** — Export `escapeLikePrefix` for unit-testability + focused unit test.
- **CO4** — Cosmetic reconciliation of stale type-comments in `forums-client.ts`.

**B. MS4 surfacing — landing refresh + admin dashboard + forums admin:**
- **CO5** — New public "recent forum activity" API endpoint (for the landing feed).
- **CO6** — Landing page MS4 refresh: update all Milestone 3 copy → Milestone 4, add a
  forums CTA/highlight, and embed a live recent-forum-activity feed (mirrors the blog feed).
- **CO7** — Beginning of an admin dashboard: `/admin` index page + an admin-only "Admin"
  nav entry, linking the existing admin pages and the new forums admin page.
- **CO8** — Web forums-admin client (typed wrappers over the existing admin category/board
  endpoints).
- **CO9** — Admin forums management page (`/admin/forums`): full categories + boards CRUD.

The two already-applied, doc-only review follow-ups (forums.md "six → five" / `unlisted`
move-target correction, and the deferred-tasks register closure) were completed
interactively in the closeout's first pass and are **out of scope** for this plan.

## Confirmed repository facts

- `apps/api/src/common/throttle/link-limit.ts`: `scanBareUrls()` counts bare-scheme
  occurrences (`BARE_SCHEMES`) with only a `charBefore !== "("` guard (lines ~105–124),
  while the `www.` branch (lines ~130–144) uses `WORD_BOUNDARY_CHARS`
  (`{"", " ", "\t", "\n", "\r", ">", "(", "["}`). Markdown-link destinations are excluded
  separately via `skipPositions` from `scanMarkdownLinks()`. `THROTTLE_MAX_LINKS_PER_POST`
  is the enforced cap.
- `apps/web/components/user-avatar.tsx`: `resolveAvatarSrc(avatarSrc, hasError)`
  (lines 71–77) returns `avatarSrc` verbatim when truthy and `!hasError`; returns `null`
  (→ initials fallback) otherwise. No scheme/prefix check. The value originates server-side
  as the gated `/api/media/<id>` path.
- `apps/api/src/users/users.service.ts`: `escapeLikePrefix(q)` (line ~153) escapes LIKE
  specials (`%`, `_`, `\`) and is consumed by `suggestByPrefix()` as
  `Like(\`${escapeLikePrefix(q)}%\`)` (line ~102). It is **not exported** today.
- `apps/web/app/forums/forums-client.ts`: `PublicTopicShape.isLocked?` (line 56) carries a
  comment (line 55) asserting `isLocked` "is included on public topic shape from the API";
  `docs/features/forums.md` documents `isLocked` among the fields stripped from the public
  topic shape — a cosmetic comment/contract mismatch flagged by upstream ST5/ST16 verifiers.
- **Landing page** (`apps/web/app/page.tsx`): a server component whose copy says
  "Milestone 3" throughout (hero, a "Milestone 3 highlights" grid, a "What's new in
  Milestone 3" section embedding `<RecentPostsFeed />`, an explore list, a meta row). The
  blog is featured via a "Read the blog" CTA **and** the live `RecentPostsFeed` component
  (`apps/web/components/recent-posts-feed.tsx`), which fetches via `listPublishedPosts`
  from `apps/web/app/blog/blog-client.ts`.
- **Forums public API** has **no** global "recent activity" endpoint; reads are
  `GET /api/forums/categories`, `GET /api/forums/boards/:id`,
  `GET /api/forums/boards/:boardId/topics` (paginated, pinned-first then `lastPostAt DESC`),
  `GET /api/forums/topics/:topicId/posts`.
- **Forums admin API exists, fully, with no UI** (all admin-role-gated via
  `assertAdminManagementAccess`): categories `GET admin/categories`,
  `GET admin/categories/:id`, `POST admin/categories`, `PATCH admin/categories/:id`,
  `DELETE admin/categories/:id` (must have no boards), `PUT admin/categories/reorder`;
  boards `GET admin/categories/:categoryId/boards`, `GET admin/boards/:id`,
  `POST admin/boards`, `PATCH admin/boards/:id`, `DELETE admin/boards/:id`,
  `PUT admin/categories/:categoryId/boards/reorder`. Create-board vocab:
  `scopeType ∈ {site, project}` (default `site`), `visibility ∈ {public, unlisted, members,
  project-only, private}` (default `public`).
- **Admin web pattern**: each admin page is a `"use client"` page gated by
  `resolveProtectedSession("/admin/...")` + `hasGlobalRole(session.user, "admin")` (from
  `apps/web/app/auth-client.ts`), styled with `apps/web/app/auth-shell.module.css`. There is
  **no `apps/web/app/admin/page.tsx` (no dashboard)**, no admin layout, and **no admin link
  in `apps/web/components/navigation.tsx`** (nav shows App/Profile/Settings to members only).
  Existing admin pages: `/admin/blog`, `/admin/pages`, `/admin/navigation`.

## Assumptions

- Per-topic **moderation (pin/lock/move) remains on the topic view** where it already ships
  (ST6/ST16); the new admin forums page (CO9) manages **structure** (categories/boards), not
  per-topic moderation.
- The MS4 landing copy will be drafted by the implementer from the delivered MS4 feature set
  (forums, @mentions + public profiles, avatars, anti-spam/rate-limits) plus the existing
  blog/pages/navigation/media; no exact wording is mandated beyond the acceptance criteria.

## Resolved decisions

- **D1 — Review-pass test scope:** include the `escapeLikePrefix` unit test only; **no**
  jsdom web harness in this plan (existing web source-audit/pure-function test pattern stays).
- **D2 — Security stage (review follow-ups):** **both** CO1 and CO2 are
  `Security review: required`.
- **D3 — CO4:** delivered as its own lightweight subtask.
- **D4 — Landing forums block:** **both** a forums CTA/highlight **and** a live
  recent-forum-activity feed → requires a new public API endpoint (CO5) + a new feed
  component (CO6).
- **D5 — Forums admin scope:** **full** categories + boards CRUD
  (list/create/edit/delete/reorder for both).
- **D6 — Admin discoverability:** add an admin-only **"Admin" nav entry** plus the `/admin`
  dashboard page (CO7).
- **D7 — Security stage (workstream B):** CO5 (new public read path; visibility filtering)
  and CO9 (new admin web surface with destructive actions) are `Security review: required`;
  CO6/CO7/CO8 use the default cycle.

## Documentation Impact (overall)

- Review follow-ups (CO1–CO4): low; behavior-preserving or internal (see per-subtask).
- Workstream B: `docs/features/forums.md` (new public recent-activity endpoint + admin web
  management surface), `docs/features/web-shell.md` (landing refresh + admin dashboard + nav
  admin entry), and `docs/guides/content-management.md` (admin how-to: dashboard + managing
  forum categories/boards). The Documenter confirms exact targets and records "no change"
  where none applies.

---

## CO1 — Link-limiter word-boundary guard for bare schemes

**Scope:** In `scanBareUrls()`, guard bare-scheme counting with a leading word-boundary
check mirroring the `www.` branch, so scheme substrings inside larger words
(`hotel:`, `motel:`, an embedded `mailto:`) are not over-counted, while preserving the
existing markdown-link-destination exclusion.

**Allowed files (Implementer):**
- `apps/api/src/common/throttle/link-limit.ts`

(Regression tests are Tester-owned — see Tester guidance; not in the Implementer's
allowed-files list.)

**Acceptance criteria (implementation outcomes):**
1. A bare scheme from `BARE_SCHEMES` is counted only when the character immediately before
   it is a word boundary (per `WORD_BOUNDARY_CHARS`) **and** is not `"("` (the existing
   markdown-link-destination exclusion via `skipPositions` is preserved unchanged).
2. Scheme substrings mid-word are not counted: `"hotel:"`, `"motel:"`, and an embedded
   `"...mailto:..."` inside a larger word do not increment the link count.
3. Genuine bare-scheme URLs at a word boundary are still counted exactly once: e.g.
   `"mailto:user@example.com"` or `"tel:+15551234"` preceded by whitespace/start/bracket.
4. Markdown-link destinations using these schemes (e.g. `"[x](mailto:user@example.com)"`)
   are still counted exactly once — no double count, no `skipPositions` regression.
5. Change direction is fail-safe-preserving: it only reduces false positives and never
   permits exceeding `THROTTLE_MAX_LINKS_PER_POST`.
6. API typecheck, the API `tsc` build, lint (`--max-warnings=0`), and the throttle test
   suite pass.

**Validation guidance:** run the API validation set in `docs/development/testing.md` scoped
to this change — API typecheck, the API `tsc` build (NodeNext/CJS; no `import.meta`), lint
with `--max-warnings=0`, and `vitest run --root apps/api` (at least the throttle suite).

**Tester guidance:** add regression cases to
`apps/api/src/common/throttle/link-limit.test.ts` covering AC2–AC4 explicitly (negative:
`hotel:`/`motel:`/embedded `mailto:`; positive: boundary `mailto:`/`tel:`; markdown-link
single-count).

**Documentation Impact:** if any doc precisely describes which tokens count toward the
per-post link limit, add a one-line note that bare schemes are counted only at a word
boundary; otherwise no documentation change required (Documenter to confirm).

`Security review: required`

**Implementer Agent prompt:**

```
Your role is 'implementer'. Your task is as follows:

Add a leading word-boundary guard to the bare-scheme (mailto:, tel:, and any other
BARE_SCHEMES) counting branch of scanBareUrls() in
apps/api/src/common/throttle/link-limit.ts, mirroring the existing www. branch which
already guards on WORD_BOUNDARY_CHARS. Today the bare-scheme branch only checks
charBefore !== "(", so scheme substrings inside larger words (e.g. "hotel:", "motel:",
an embedded "mailto:") are over-counted toward the per-post link limit.

Allowed files:
- apps/api/src/common/throttle/link-limit.ts

Implement so that:
1. A bare scheme is counted only when the character immediately before it is in
   WORD_BOUNDARY_CHARS AND is not "(" (keep the existing markdown-link-destination
   exclusion via skipPositions exactly as-is).
2. "hotel:", "motel:", and an embedded "mailto:" inside a larger word are NOT counted.
3. A boundary-anchored "mailto:user@example.com" or "tel:+15551234" is still counted once.
4. A markdown link "[x](mailto:user@example.com)" is still counted exactly once (no
   double count, no skipPositions regression).
5. The change only reduces false positives; it must never allow exceeding
   THROTTLE_MAX_LINKS_PER_POST (fail-safe direction preserved).

Validation: run the API validation commands in docs/development/testing.md scoped to this
change — API typecheck, the API tsc build (the API compiles as NodeNext/CommonJS; do not
introduce import.meta), lint with --max-warnings=0, and vitest run --root apps/api (at
least the throttle suite). Report the exact commands you ran and their results; never
report a command you did not run.

Tester handoff: regression tests belong in
apps/api/src/common/throttle/link-limit.test.ts and must cover the negative cases
("hotel:"/"motel:"/embedded "mailto:") and positive cases (boundary mailto:/tel:,
single-counted markdown link).

Artifacts: write your implementer artifacts to
artifacts/milestone-4-forums-closeout/CO1/ (repository-root-relative).

This subtask is security-sensitive. Security review: required

Continue past preflight into the implementation in this same run when no blocking inputs
are missing.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## CO2 — Avatar-src gated-path prefix hardening

**Scope:** Harden `resolveAvatarSrc` to assert the gated `/api/media/` path prefix before
returning a src, falling back to `null` (initials) for anything else — defense-in-depth
even though the value is server-supplied.

**Allowed files (Implementer):**
- `apps/web/components/user-avatar.tsx`

(Spec coverage is Tester-owned — see Tester guidance.)

**Acceptance criteria (implementation outcomes):**
1. `resolveAvatarSrc` returns `null` (→ initials fallback) for any `avatarSrc` that does not
   begin with the gated prefix `/api/media/`, including `http://…`, `https://…`,
   protocol-relative `//…`, scheme URIs (`javascript:…`, `data:…`), and empty/whitespace.
2. `resolveAvatarSrc` returns the value unchanged for a valid gated path
   (e.g. `/api/media/<uuid>`) when `hasError` is `false`.
3. `resolveAvatarSrc` still returns `null` when `hasError` is `true` (existing behavior).
4. No change to initials derivation or to `UserAvatar` rendering for valid inputs.
5. Web typecheck, lint (`--max-warnings=0`), the user-avatar test suite, and the production
   `next build` pass.

**Validation guidance:** web typecheck, lint with `--max-warnings=0`,
`vitest run --root apps/web` (at least the user-avatar spec), **and the production
`next build`** — per the retrospective P5 pattern, `next build` is the only place App Router
export constraints and production type-checking are enforced; `next dev`/vitest do not catch
them.

**Tester guidance:** extend `apps/web/components/user-avatar.spec.ts` with the
prefix-rejection cases (AC1), the valid pass-through case (AC2), and the `hasError` case (AC3),
following the existing pure-function test pattern (no jsdom harness in this plan).

**Documentation Impact:** none expected — user-visible behavior for legitimate
server-supplied avatars is unchanged. Documenter to confirm and record "no change" if so.

`Security review: required`

**Implementer Agent prompt:**

```
Your role is 'implementer'. Your task is as follows:

Harden resolveAvatarSrc in apps/web/components/user-avatar.tsx so it asserts the gated
media path prefix before returning a src. Today it returns avatarSrc verbatim whenever the
value is truthy and hasError is false. Add a check that the value begins with "/api/media/"
and return null (which triggers the existing initials fallback) for anything that does not.

Allowed files:
- apps/web/components/user-avatar.tsx

Implement so that:
1. resolveAvatarSrc returns null for any avatarSrc not beginning with "/api/media/",
   including http://…, https://…, protocol-relative //…, scheme URIs (javascript:…,
   data:…), and empty/whitespace input.
2. A valid gated path (e.g. "/api/media/<uuid>") is returned unchanged when hasError is
   false.
3. null is still returned when hasError is true (preserve existing behavior).
4. Do not change initials derivation or any other UserAvatar rendering behavior for valid
   inputs.

Validation: web typecheck, lint with --max-warnings=0, vitest run --root apps/web (at
least the user-avatar spec), AND the production next build — next build is the only place
App Router export/type constraints are enforced (next dev and vitest do not catch them).
Report the exact commands you ran and their results; never report a command you did not run.

Tester handoff: coverage belongs in apps/web/components/user-avatar.spec.ts using the
existing pure-function test pattern (do NOT introduce a jsdom render harness in this
subtask). Cover the prefix-rejection cases, the valid pass-through case, and the hasError
case.

Artifacts: write your implementer artifacts to
artifacts/milestone-4-forums-closeout/CO2/ (repository-root-relative).

This subtask is security-sensitive. Security review: required

Continue past preflight into the implementation in this same run when no blocking inputs
are missing.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## CO3 — Export `escapeLikePrefix` for unit-testability + focused unit test

**Scope:** Export the existing `escapeLikePrefix` helper from `users.service.ts` (no
behavior change) so a focused unit test can assert its LIKE-escaping contract directly,
matching the repo's "exported for unit-testability" precedent.

**Allowed files (Implementer):**
- `apps/api/src/users/users.service.ts` (add named export only; no behavior change)

(The unit test is Tester-owned — see Tester guidance.)

**Acceptance criteria (implementation outcomes):**
1. `escapeLikePrefix` is a named export of `apps/api/src/users/users.service.ts`; its
   implementation and the `suggestByPrefix` call site (`Like(\`${escapeLikePrefix(q)}%\`)`)
   are otherwise unchanged.
2. The escaping contract is intact: `%`, `_`, and `\` are escaped in the prefix
   (e.g. `escapeLikePrefix("a%b")` yields the operand with `%` escaped), and plain prefixes
   pass through unchanged.
3. API typecheck, the API `tsc` build, lint (`--max-warnings=0`), and the users test suite
   pass.

**Validation guidance:** API typecheck, the API `tsc` build (NodeNext/CJS), lint with
`--max-warnings=0`, and `vitest run --root apps/api` (at least the users suite).

**Tester guidance:** add a focused unit test in
`apps/api/src/users/users.service.test.ts` asserting `escapeLikePrefix` output for `%`, `_`,
`\`, and a plain prefix.

**Documentation Impact:** none (internal export + test; no API/behavior change).

(No security marker — the helper already exists and is correct; this subtask only exports it
and adds coverage.)

**Implementer Agent prompt:**

```
Your role is 'implementer'. Your task is as follows:

Add a named export to the existing escapeLikePrefix helper in
apps/api/src/users/users.service.ts so it can be unit-tested directly (consistent with the
repo's "exported for unit-testability" precedent, e.g. resolveAvatarSrc and
profileProjection). Do not change its behavior or the suggestByPrefix call site.

Allowed files:
- apps/api/src/users/users.service.ts

Implement so that:
1. escapeLikePrefix becomes a named export of users.service.ts; the function body and the
   suggestByPrefix usage (Like(`${escapeLikePrefix(q)}%`)) are otherwise unchanged.
2. The escaping contract is preserved: %, _, and \ are escaped; plain prefixes pass
   through unchanged.

Validation: API typecheck, the API tsc build (NodeNext/CommonJS; no import.meta), lint with
--max-warnings=0, and vitest run --root apps/api (at least the users suite). Report the
exact commands you ran and their results; never report a command you did not run.

Tester handoff: add a focused unit test in apps/api/src/users/users.service.test.ts
asserting escapeLikePrefix output for inputs containing %, _, \, and a plain prefix
(e.g. escapeLikePrefix("a%b") escapes the %).

Artifacts: write your implementer artifacts to
artifacts/milestone-4-forums-closeout/CO3/ (repository-root-relative).

Continue past preflight into the implementation in this same run when no blocking inputs
are missing.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## CO4 — Reconcile stale type-comments in `forums-client.ts`

**Scope:** Comments-only cleanup of stale/inaccurate type-comments in the web forums
client, with zero change to runtime behavior, exported API, or TypeScript types.

**Allowed files (Implementer):**
- `apps/web/app/forums/forums-client.ts` (comment text only)

**Acceptance criteria (implementation outcomes):**
1. The `PublicTopicShape.isLocked` comment (`forums-client.ts:55`) is corrected so it no
   longer misstates the public-topic contract; it must be consistent with the actual
   `isLocked?: boolean` declaration and with `docs/features/forums.md`'s description of the
   public topic shape. Any other comment in the file that no longer matches the current
   types/return shapes is likewise corrected.
2. No change to any TypeScript type, interface, exported symbol, function signature, or
   runtime behavior — comments only.
3. Web typecheck, lint (`--max-warnings=0`), the forums spec suite, and the production
   `next build` pass, with behavior unchanged.

**Validation guidance:** web typecheck, lint with `--max-warnings=0`,
`vitest run --root apps/web` (at least the forums spec), and the production `next build`.

**Tester guidance:** no new tests are expected (comments-only); the existing forums spec
suite must remain green. State explicitly that behavior is unchanged.

**Documentation Impact:** none (source comments only).

(No security marker.)

**Implementer Agent prompt:**

```
Your role is 'implementer'. Your task is as follows:

Reconcile stale/inaccurate type-comments in apps/web/app/forums/forums-client.ts so the
comments match the actual TypeScript types and API behavior. This is a comments-only
cleanup: do NOT change any type, interface, exported symbol, signature, or runtime
behavior.

Allowed files:
- apps/web/app/forums/forums-client.ts

Implement so that:
1. The comment at forums-client.ts:55 about PublicTopicShape.isLocked is corrected so it no
   longer misstates the public-topic contract; make it consistent with the actual
   "isLocked?: boolean" declaration and with how docs/features/forums.md describes the
   public topic shape. Scan the rest of the file and correct any other comment that no
   longer matches the current types/return shapes.
2. Make no change to any TypeScript type, interface, exported symbol, function signature, or
   runtime behavior — comment text only.

Validation: web typecheck, lint with --max-warnings=0, vitest run --root apps/web (at least
the forums spec), and the production next build. Confirm behavior is unchanged. Report the
exact commands you ran and their results; never report a command you did not run.

Tester handoff: no new tests expected (comments-only); the existing forums spec suite must
stay green and behavior must be unchanged.

Artifacts: write your implementer artifacts to
artifacts/milestone-4-forums-closeout/CO4/ (repository-root-relative).

Continue past preflight into the implementation in this same run when no blocking inputs
are missing.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## CO5 — Public "recent forum activity" API endpoint

**Scope:** Add a public, unauthenticated GET endpoint returning the most-recently-active
public topics across the site, for the landing-page feed. It must surface **only** topics in
publicly-readable site boards, with visibility filtering routed through the shared
authorization predicate (no re-derived partial predicate), and must not leak the existence
of non-public or project-scoped boards/topics (P12 oracle safety).

**Allowed files (Implementer):**
- `apps/api/src/forums/forums.controller.ts`
- `apps/api/src/forums/forums.service.ts`
- `apps/api/src/forums/forums.types.ts`

(Controller/service tests are Tester-owned — see Tester guidance.)

**Acceptance criteria (implementation outcomes):**
1. A new public endpoint (e.g. `GET /api/forums/recent`) returns up to a small bounded
   number of topics (default 5, hard-capped, e.g. ≤ 20) ordered most-recently-active
   (`lastPostAt DESC`, then `createdAt DESC`), drawn **only** from publicly-readable site
   boards.
2. Topics in non-publicly-readable boards (`members`/`private`) and in project-scoped boards
   are excluded; visibility is decided through the existing shared predicate
   (`AuthorizationService.evaluate()` / `isBoardPubliclyReadable`), not a re-derived partial
   predicate. No endpoint behavior reveals the existence of excluded boards/topics.
3. The response uses a public-safe shape only (e.g. topic `title`, `slug`, board `name`+`slug`
   for linking, author `username`+`displayName`, `lastPostAt`/`createdAt`) — no internal-only
   fields (no `authorUserId`, lock/move audit columns, `deletedAt`), no email/role/PII.
4. The endpoint requires no authentication and returns a stable empty list when no public
   topics exist.
5. API typecheck, the API `tsc` build, lint (`--max-warnings=0`), and the forums suites pass.

**Validation guidance:** API typecheck, the API `tsc` build (NodeNext/CJS; no `import.meta`),
lint with `--max-warnings=0`, and `vitest run --root apps/api` (forums controller + service
suites).

**Tester guidance:** add controller + service tests in
`apps/api/src/forums/forums.controller.test.ts` and
`apps/api/src/forums/forums.service.test.ts` covering ordering, the bounded limit, the
public-safe shape, and — critically — exclusion of `members`/`private` and project-scoped
boards (oracle parity: excluded content never appears and is indistinguishable from "no
activity").

**Documentation Impact:** `docs/features/forums.md` — document the new public
recent-activity endpoint (route, response shape, visibility-filtering contract).

`Security review: required`

**Implementer Agent prompt:**

```
Your role is 'implementer'. Your task is as follows:

Add a public, unauthenticated endpoint that returns the most-recently-active public forum
topics across the site, for use by the landing-page activity feed. Suggested route:
GET /api/forums/recent.

Allowed files:
- apps/api/src/forums/forums.controller.ts
- apps/api/src/forums/forums.service.ts
- apps/api/src/forums/forums.types.ts

Implement so that:
1. The endpoint returns up to a small bounded number of topics (default 5; hard-cap the
   maximum, e.g. <= 20), ordered most-recently-active (lastPostAt DESC, then createdAt
   DESC), drawn ONLY from publicly-readable site boards.
2. Topics in non-publicly-readable boards (members/private) and in project-scoped boards
   are excluded. Decide visibility through the existing shared predicate
   (AuthorizationService.evaluate() / isBoardPubliclyReadable) — do NOT re-derive a partial
   predicate inline. No response behavior may reveal the existence of excluded
   boards/topics (uniform "no activity" — oracle safety, P12).
3. Return a public-safe shape only: e.g. topic title, slug, the board name + slug (for
   linking), author username + displayName, and lastPostAt/createdAt. Do NOT include
   internal-only fields (authorUserId, lock/move audit columns, deletedAt) or any
   email/role/PII. Add a corresponding type in forums.types.ts.
4. No authentication is required; return a stable empty list when there is no public
   activity.

Validation: API typecheck, the API tsc build (NodeNext/CommonJS; no import.meta), lint with
--max-warnings=0, and vitest run --root apps/api (forums controller + service suites).
Report the exact commands you ran and their results; never report a command you did not run.

Tester handoff: controller tests in apps/api/src/forums/forums.controller.test.ts and
service tests in apps/api/src/forums/forums.service.test.ts — cover ordering, the bounded
limit, the public-safe shape, and exclusion of members/private and project-scoped boards
(excluded content must never appear).

Artifacts: write your implementer artifacts to
artifacts/milestone-4-forums-closeout/CO5/ (repository-root-relative).

This subtask is security-sensitive. Security review: required

Continue past preflight into the implementation in this same run when no blocking inputs
are missing.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## CO6 — Landing page MS4 refresh + recent-forum-activity feed

**Scope:** Update the landing page to Milestone 4 (replacing all Milestone 3 copy), feature
the forums with a CTA + highlight card, and embed a live recent-forum-activity feed (a new
component mirroring `RecentPostsFeed`) backed by the CO5 endpoint.

**Allowed files (Implementer):**
- `apps/web/app/page.tsx`
- `apps/web/app/page.module.css`
- `apps/web/components/recent-forum-activity.tsx` (new)
- `apps/web/components/recent-forum-activity.module.css` (new)
- `apps/web/app/forums/forums-client.ts` (add a public recent-activity fetch function)

(Component spec is Tester-owned — see Tester guidance.)

**Acceptance criteria (implementation outcomes):**
1. Every "Milestone 3" reference on the landing page is updated to "Milestone 4", and the
   hero/intro + highlights + "current scope" copy reflect the MS4 feature set (forums,
   @mentions + public profiles, avatars, anti-spam/rate-limits) alongside the existing
   blog/pages/navigation/media. No "Milestone 3" text remains on the landing page.
2. A forums **primary CTA** (e.g. "Visit the forums" → `/forums`) is present, mirroring the
   blog CTA, plus a forums **highlight card** in the highlights grid and a forums entry in
   the explore list.
3. A new `RecentForumActivity` component renders the CO5 endpoint's data (via a new public
   client function in `forums-client.ts`) with graceful loading, empty ("No forum activity
   yet"), and error states, and a "View the forums →" link; it is embedded in the (renamed)
   "What's new in Milestone 4" section.
4. All rendered forum/user text is output as React text nodes (no `dangerouslySetInnerHTML`),
   and any links encode dynamic segments per the existing `encodeURIComponent` convention.
5. Web typecheck, lint (`--max-warnings=0`), the web suites, and the production `next build`
   pass.

**Validation guidance:** web typecheck, lint with `--max-warnings=0`,
`vitest run --root apps/web`, and the production `next build`.

**Tester guidance:** add `apps/web/components/recent-forum-activity.spec.ts` covering the
loading/empty/error/rendered states and the link target, following the existing
pure-function/source-audit web test pattern (no jsdom harness).

**Documentation Impact:** `docs/features/web-shell.md` — update the landing-page description
to reflect the MS4 refresh and the recent-forum-activity feed.

(No security marker — displays only data the CO5 endpoint already deems public; CTAs/links
are public.)

**Dependencies:** depends on **CO5** (endpoint). Shares
`apps/web/app/forums/forums-client.ts` with **CO4** → must not run concurrently with CO4
(sequence CO4 → CO6).

**Implementer Agent prompt:**

```
Your role is 'implementer'. Your task is as follows:

Refresh the landing page (apps/web/app/page.tsx) for Milestone 4 and feature the forums,
including a live recent-forum-activity feed.

Allowed files:
- apps/web/app/page.tsx
- apps/web/app/page.module.css
- apps/web/components/recent-forum-activity.tsx (new)
- apps/web/components/recent-forum-activity.module.css (new)
- apps/web/app/forums/forums-client.ts (add a public recent-activity fetch function only)

Context: the blog is currently featured via a "Read the blog" CTA and the live
RecentPostsFeed component (apps/web/components/recent-posts-feed.tsx, which fetches via
listPublishedPosts in apps/web/app/blog/blog-client.ts). Mirror that pattern for forums.
The new public "recent forum activity" endpoint is delivered by subtask CO5
(GET /api/forums/recent).

Implement so that:
1. Replace every "Milestone 3" reference on the landing page with "Milestone 4", and update
   the hero/intro, highlights, and "current scope" copy to reflect the MS4 feature set
   (forums, @mentions + public profiles, avatars, anti-spam/rate-limits) alongside the
   existing blog/pages/navigation/media. No "Milestone 3" text may remain.
2. Add a forums primary CTA ("Visit the forums" -> /forums) mirroring the blog CTA, a forums
   highlight card in the highlights grid, and a forums entry in the explore list.
3. Add a new RecentForumActivity component that fetches the CO5 endpoint via a new public
   function in apps/web/app/forums/forums-client.ts and renders graceful loading, empty
   ("No forum activity yet"), and error states plus a "View the forums ->" link. Embed it in
   the section, renamed to "What's new in Milestone 4".
4. Render all forum/user text as React text nodes (no dangerouslySetInnerHTML); encode
   dynamic link segments with encodeURIComponent per existing convention.

Validation: web typecheck, lint with --max-warnings=0, vitest run --root apps/web, and the
production next build. Report the exact commands you ran and their results; never report a
command you did not run.

Tester handoff: add apps/web/components/recent-forum-activity.spec.ts covering
loading/empty/error/rendered states and the link target, using the existing
pure-function/source-audit web test pattern (no jsdom harness).

Note: this subtask shares apps/web/app/forums/forums-client.ts with subtask CO4 and depends
on subtask CO5; do not run it concurrently with CO4, and assume the CO5 endpoint exists.

Artifacts: write your implementer artifacts to
artifacts/milestone-4-forums-closeout/CO6/ (repository-root-relative).

Continue past preflight into the implementation in this same run when no blocking inputs
are missing.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## CO7 — Admin dashboard index page + admin nav entry

**Scope:** Create the beginning of an admin dashboard at `/admin` linking the existing admin
pages and the new forums admin page, and add an admin-only "Admin" entry to the site
navigation so admins can discover it.

**Allowed files (Implementer):**
- `apps/web/app/admin/page.tsx` (new dashboard index)
- `apps/web/components/navigation.tsx` (add admin-only "Admin" entry)

(Specs are Tester-owned — see Tester guidance. Reuse `apps/web/app/auth-shell.module.css`
for styling; do not add a new stylesheet unless necessary.)

**Acceptance criteria (implementation outcomes):**
1. A new `/admin` page, gated with the existing admin pattern
   (`resolveProtectedSession("/admin")` + `hasGlobalRole(session.user, "admin")`):
   unauthenticated → redirect to login; authenticated non-admin → "Admin access required";
   admin → the dashboard.
2. The dashboard lists labelled links to `/admin/blog`, `/admin/pages`, `/admin/navigation`,
   and `/admin/forums` (each with a short description).
3. The site navigation renders an "Admin" entry linking to `/admin` **only** for admin-role
   sessions; it is absent for non-admin members and for anonymous/onboarding states.
4. Web typecheck, lint (`--max-warnings=0`), the web suites, and the production `next build`
   pass.

**Validation guidance:** web typecheck, lint with `--max-warnings=0`,
`vitest run --root apps/web`, and the production `next build`.

**Tester guidance:** extend `apps/web/components/navigation.spec.ts` to assert the "Admin"
entry appears only for admin-role sessions and is absent otherwise; add coverage for the
dashboard's gating + link set following the existing admin-page test pattern.

**Documentation Impact:** `docs/features/web-shell.md` (admin nav entry + dashboard) and
`docs/guides/content-management.md` (how admins reach the dashboard).

(No security marker — links + UX role-gating only; the server enforces every admin page.
The destructive surface is CO9, which is security-marked.)

**Dependencies:** depends on **CO9** (so the `/admin/forums` link resolves); sequence after
CO9. The links to the other three admin pages are already valid today.

**Implementer Agent prompt:**

```
Your role is 'implementer'. Your task is as follows:

Build the beginning of an admin dashboard and make it discoverable.

Allowed files:
- apps/web/app/admin/page.tsx (new)
- apps/web/components/navigation.tsx

Follow the existing admin-page pattern (see apps/web/app/admin/blog/page.tsx): a "use
client" page that calls resolveProtectedSession("/admin") and hasGlobalRole(session.user,
"admin") from apps/web/app/auth-client.ts, redirects to login when there is no session,
shows "Admin access required" for a non-admin session, and otherwise renders the dashboard.
Reuse apps/web/app/auth-shell.module.css for styling.

Implement so that:
1. /admin is gated exactly like the other admin pages (login redirect; non-admin denied;
   admin sees the dashboard).
2. The dashboard shows labelled links with short descriptions to /admin/blog, /admin/pages,
   /admin/navigation, and /admin/forums.
3. apps/web/components/navigation.tsx renders an "Admin" entry linking to /admin ONLY for
   admin-role sessions (use the same role check the app already uses); it must be absent for
   non-admin members and for anonymous/onboarding states.

Validation: web typecheck, lint with --max-warnings=0, vitest run --root apps/web, and the
production next build. Report the exact commands you ran and their results; never report a
command you did not run.

Tester handoff: extend apps/web/components/navigation.spec.ts to assert the Admin entry is
shown only for admin sessions and absent otherwise; add dashboard gating + link-set
coverage following the existing admin-page test pattern.

Note: the /admin/forums link target is delivered by subtask CO9; this subtask is sequenced
after CO9.

Artifacts: write your implementer artifacts to
artifacts/milestone-4-forums-closeout/CO7/ (repository-root-relative).

Continue past preflight into the implementation in this same run when no blocking inputs
are missing.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## CO8 — Web forums-admin client

**Scope:** Add a typed web client module wrapping the existing admin forums endpoints
(categories + boards), for the CO9 admin page to consume. No API change — the endpoints
already exist.

**Allowed files (Implementer):**
- `apps/web/app/admin/forums/forums-admin-client.ts` (new)

(Client spec is Tester-owned — see Tester guidance.)

**Acceptance criteria (implementation outcomes):**
1. The module exports typed functions for **all** admin category endpoints (list, get,
   create, update, delete, reorder) and **all** admin board endpoints (list, get, create,
   update, delete, reorder), each calling the corresponding `/api/forums/admin/...` route
   with credentials included.
2. Request/response types mirror the API contracts, including the create-board vocab
   (`scopeType ∈ {site, project}`, `visibility ∈ {public, unlisted, members, project-only,
   private}`).
3. Responses are parsed from the documented envelopes (e.g. `{ category }`,
   `{ categories }`, `{ board }`, `{ boards }`); errors are surfaced via the repo's standard
   client error-envelope convention (per `docs/development/api-conventions.md` and the
   existing `blog-client.ts` pattern), not raw/unwrapped.
4. Web typecheck, lint (`--max-warnings=0`), the web suites, and the production `next build`
   pass.

**Validation guidance:** web typecheck, lint with `--max-warnings=0`,
`vitest run --root apps/web`, and the production `next build`.

**Tester guidance:** add `apps/web/app/admin/forums/forums-admin-client.spec.ts` asserting
method/URL/body mapping for each function and the error-envelope handling, following the
existing web client test pattern (e.g. `blog.spec.ts`).

**Documentation Impact:** none (internal client module).

(No security marker — typed fetch wrappers over already-secured, already-reviewed admin
endpoints; the consuming surface CO9 carries the security review.)

**Implementer Agent prompt:**

```
Your role is 'implementer'. Your task is as follows:

Add a typed web client module that wraps the existing admin forums API endpoints, for the
admin forums page (subtask CO9) to consume. The API endpoints already exist; do not change
the API.

Allowed files:
- apps/web/app/admin/forums/forums-admin-client.ts (new)

Mirror the conventions of the existing web clients (apps/web/app/blog/blog-client.ts) and
docs/development/api-conventions.md.

Implement so that:
1. The module exports typed functions for ALL admin category endpoints (list, get, create,
   update, delete, reorder) and ALL admin board endpoints (list, get, create, update,
   delete, reorder), each calling the corresponding /api/forums/admin/... route with
   credentials included. The endpoints are:
   - GET admin/categories ; GET admin/categories/:id ; POST admin/categories ;
     PATCH admin/categories/:id ; DELETE admin/categories/:id ; PUT admin/categories/reorder
   - GET admin/categories/:categoryId/boards ; GET admin/boards/:id ; POST admin/boards ;
     PATCH admin/boards/:id ; DELETE admin/boards/:id ;
     PUT admin/categories/:categoryId/boards/reorder
2. Request/response types mirror the API contracts, including create-board vocab
   (scopeType in {site, project}; visibility in {public, unlisted, members, project-only,
   private}).
3. Parse the documented response envelopes ({ category } / { categories } / { board } /
   { boards }) and surface errors via the repo's standard client error-envelope convention
   (see api-conventions.md and blog-client.ts) — never raw/unwrapped.

Validation: web typecheck, lint with --max-warnings=0, vitest run --root apps/web, and the
production next build. Report the exact commands you ran and their results; never report a
command you did not run.

Tester handoff: add apps/web/app/admin/forums/forums-admin-client.spec.ts asserting
method/URL/body mapping for each function and error-envelope handling, following the
existing web client test pattern (e.g. blog.spec.ts).

Artifacts: write your implementer artifacts to
artifacts/milestone-4-forums-closeout/CO8/ (repository-root-relative).

Continue past preflight into the implementation in this same run when no blocking inputs
are missing.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## CO9 — Admin forums management page (`/admin/forums`)

**Scope:** Build the admin forums management page exposing full categories + boards CRUD,
consuming the CO8 client. Admin-role gated; the server remains the enforcement boundary.

**Allowed files (Implementer):**
- `apps/web/app/admin/forums/page.tsx` (new)
- `apps/web/app/admin/forums/forums-admin.module.css` (new; or reuse
  `apps/web/app/auth-shell.module.css`)

(Page spec is Tester-owned — see Tester guidance. Imports the CO8 client.)

**Acceptance criteria (implementation outcomes):**
1. A new `/admin/forums` page gated with the existing admin pattern
   (`resolveProtectedSession("/admin/forums")` + `hasGlobalRole(session.user, "admin")`):
   login redirect / non-admin denied / admin sees the page.
2. It lists all categories with their boards (admin list endpoints).
3. **Category management:** create (name, slug, description?, sortOrder?), edit, delete
   (the "category must have no boards" 400 is surfaced as a friendly message), and reorder.
4. **Board management:** create (categoryId, name, slug, description?, sortOrder?, scopeType
   [site|project], visibility [public|unlisted|members|project-only|private], projectId?),
   edit, delete, and reorder within a category.
5. The server is the enforcement boundary; all errors are surfaced via the standard envelope
   (friendly messages, no raw 500s leaking). All user-supplied text is rendered as React
   text nodes (no `dangerouslySetInnerHTML`); dynamic link/route segments use
   `encodeURIComponent`.
6. Web typecheck, lint (`--max-warnings=0`), the web suites, and the production `next build`
   pass.

**Validation guidance:** web typecheck, lint with `--max-warnings=0`,
`vitest run --root apps/web`, and the production `next build`.

**Tester guidance:** add `apps/web/app/admin/forums/forums-admin.spec.ts` covering
admin-gating (redirect/deny/allow), the category and board create/edit/delete/reorder flows,
the no-boards delete-rejection message, and error-envelope handling — following the existing
admin-page test pattern.

**Documentation Impact:** `docs/features/forums.md` (admin web management surface) and
`docs/guides/content-management.md` (how to manage forum categories/boards as admin).

`Security review: required`

**Dependencies:** depends on **CO8** (client module).

**Implementer Agent prompt:**

```
Your role is 'implementer'. Your task is as follows:

Build the admin forums management page exposing full categories + boards CRUD, consuming the
forums-admin client from subtask CO8. The admin API already exists and the server is the
enforcement boundary; this page is the admin UX over it.

Allowed files:
- apps/web/app/admin/forums/page.tsx (new)
- apps/web/app/admin/forums/forums-admin.module.css (new; or reuse
  apps/web/app/auth-shell.module.css)

Follow the existing admin-page pattern (apps/web/app/admin/blog/page.tsx): a "use client"
page gated by resolveProtectedSession("/admin/forums") and hasGlobalRole(session.user,
"admin") from apps/web/app/auth-client.ts.

Implement so that:
1. /admin/forums is gated exactly like the other admin pages (login redirect; non-admin
   denied; admin sees the page).
2. It lists all categories with their boards using the admin list functions from
   apps/web/app/admin/forums/forums-admin-client.ts (subtask CO8).
3. Category management: create (name, slug, description?, sortOrder?), edit, delete (surface
   the "category must have no boards" 400 as a friendly message), and reorder.
4. Board management: create (categoryId, name, slug, description?, sortOrder?, scopeType
   [site|project], visibility [public|unlisted|members|project-only|private], projectId?),
   edit, delete, and reorder within a category.
5. The server remains the enforcement boundary; surface all errors via the standard envelope
   (friendly messages; no raw 500s). Render all user-supplied text as React text nodes (no
   dangerouslySetInnerHTML); encode dynamic link/route segments with encodeURIComponent.

Validation: web typecheck, lint with --max-warnings=0, vitest run --root apps/web, and the
production next build. Report the exact commands you ran and their results; never report a
command you did not run.

Tester handoff: add apps/web/app/admin/forums/forums-admin.spec.ts covering admin gating
(redirect/deny/allow), category and board create/edit/delete/reorder flows, the no-boards
delete-rejection message, and error-envelope handling, following the existing admin-page
test pattern.

Note: this subtask depends on subtask CO8 (the forums-admin client module).

Artifacts: write your implementer artifacts to
artifacts/milestone-4-forums-closeout/CO9/ (repository-root-relative).

This subtask is security-sensitive. Security review: required

Continue past preflight into the implementation in this same run when no blocking inputs
are missing.

Do not report success unless all required artifacts exist and all changes are committed.
```

---

## Dependency Ordering and Parallelization

Two largely independent tracks plus the standalone review follow-ups.

- **Review follow-ups:** CO1 (API throttle), CO2 (web user-avatar), CO3 (API users.service)
  touch disjoint files and are mutually independent — parallelizable. **CO4** (web
  forums-client comments) shares `apps/web/app/forums/forums-client.ts` with **CO6**, so
  CO4 and CO6 must **not** run concurrently — sequence **CO4 → CO6**.
- **Track 1 — landing/feed:** **CO5 → CO6** (the feed needs the endpoint). CO5 is
  independent of everything except being CO6's prerequisite.
- **Track 2 — admin:** **CO8 → CO9 → CO7** (the page needs the client; the dashboard's
  `/admin/forums` link needs the page). CO5 and CO8 can start in parallel (different apps).
- **Security stages:** CO1, CO2, CO5, CO9 carry `Security review: required`; CO3, CO4, CO6,
  CO7, CO8 use the default Implementer → Tester → Documenter → Verifier cycle.
- **File-overlap summary (avoid concurrent edits):** CO4 ↔ CO6 share `forums-client.ts`
  (serialize). No other pair shares a file: CO8 uses a new `forums-admin-client.ts`; CO9 a
  new `/admin/forums/page.tsx`; CO7 touches `navigation.tsx` + new `/admin/page.tsx`; CO6
  touches the landing + a new feed component.

## Implementer Prompts

Each subtask's launch-ready Implementer Agent prompt is embedded in its own subtask section
above (CO1–CO9) inside a fenced block beginning
`Your role is 'implementer'. Your task is as follows:`. Those blocks are the canonical
Coordinator handoff text — pass them through verbatim (only procedural wrapper instructions
added). `Security review: required` appears in CO1, CO2, CO5, and CO9; the other subtasks
use the default cycle.

## Output Artifact Path

- Plan artifact (this file): `plans/milestone-4-forums-closeout-plan.md`.
- Coordinator execution artifacts: `artifacts/milestone-4-forums-closeout/<CO-id>/`
  (repository-root-relative), e.g. `artifacts/milestone-4-forums-closeout/CO1/` …
  `artifacts/milestone-4-forums-closeout/CO9/`.
