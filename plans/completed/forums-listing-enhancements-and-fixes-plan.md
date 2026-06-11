# Forums Listing Enhancements & Follow-up Fixes — Plan

> **Status:** READY FOR COORDINATION. Post-Milestone-4-closeout work. Two workstreams:
> (A) follow-ups carried out of `artifacts/milestone-4-forums-closeout/reviewer_report.md`
> (CONDITIONAL PASS), and (B) forum listing/display UI enhancements requested by the user.
> Subtask identifiers `ST1`–`ST7` are defined here; further additions continue at `ST8`.
> Plan-lifecycle bookkeeping for the *closeout* plan (flip to COMPLETE / relocate) is handled
> by the user manually and is **out of scope** for this plan.

## Feature restatement (engineering terms)

NestJS API + Next.js (App Router) web monorepo on MySQL 5.7 / TypeORM. Seven implementation
subtasks:

- **ST1** — Fix `GET /api/forums/recent` 500: remove the MySQL-invalid `NULLS LAST` ORDER BY
  clause, and (defense-in-depth) push the public-board predicate into the recent-feed query.
- **ST2** — Enrich the public topic-list shape with the **last-reply author**, resolved at
  query time; factor a reusable "topic last activity" primitive.
- **ST3** — Add per-board **Topics / Posts / Last Post** aggregates to the public categories
  response (reusing the ST2 primitive).
- **ST4** — Widen forum category/board `description` to `varchar(512)` via migration + add
  server-side length validation (description ≤512, name ≤128) returning friendly `400`s.
- **ST5** — Render the per-board **Topics / Posts / Last Post** columns on `/forums`.
- **ST6** — Reorganize the `/forums/[boardSlug]` topic list into 4 columns
  **Topic / Replies / Created / Last reply**.
- **ST7** — Surface the description length limit on the `/admin/forums` create/edit forms.

Item "Recent Forum Activity panel shows an error" is **fully resolved by ST1** (the panel
already renders loading/empty/list/error states correctly; once the endpoint stops returning
500 it displays normally) — no web change is needed for it.

## Confirmed repository facts

- DB dialect is **MySQL** (`apps/api/src/database/database.config.ts:69`, `type: "mysql"`);
  MySQL 5.7 with `STRICT_TRANS_TABLES` per the closeout reviewer addendum.
- `apps/api/src/forums/forums.service.ts:844` (`listRecentTopics`) is the **only** call passing
  the literal `"NULLS LAST"` to TypeORM's query builder. TypeORM does not emulate it on MySQL —
  it appends the literal, producing `ORDER BY topic.lastPostAt DESC NULLS LAST` → MySQL parse
  error (1064) → HTTP 500. `apps/web/components/recent-forum-activity.tsx` then shows
  "Could not load recent forum activity." for all callers regardless of auth.
- `apps/api/src/forums/forums.service.test.ts:2536` asserts
  `orderBy("topic.lastPostAt", "DESC", "NULLS LAST")` and mocks the query builder
  (`getMany` returns a fixed array), so no unit test exercises real MySQL — the dialect bug is
  invisible to the suite and the assertion **encodes** the bug.
- "Last post author" is **not stored**: `forum_topics` has `last_post_at` (nullable) but no
  `last_post_user_id`; `forum_topics.author` is only the **original** poster
  (`apps/api/src/forums/entities/forum-topic.entity.ts`). Replies live in `forum_posts`
  (`forum-post.entity.ts`) with `author_user_id`, `deleted_at`. A topic's "latest reply" must
  be resolved from `forum_posts` at query time.
- `forum_categories.description` and `forum_boards.description` are `varchar(255)` nullable
  (`forum-category.entity.ts:15`, `forum-board.entity.ts:42`); `name` is `varchar(128)` /
  `varchar(128)`. `ForumsService.create/update{Category,Board}` validate name/slug but **not**
  description/name length, so an over-255 description surfaces as a DB 500.
- Public profile pages exist at `/users/[username]`
  (`apps/web/app/users/[username]/page.tsx`), backed by `GET /api/users/:username`.
- Forums index (`apps/web/app/forums/page.tsx`) lists categories (section header) → boards
  (rows, name + description, link only). Board page (`apps/web/app/forums/[boardSlug]/page.tsx`)
  lists topics as `<li>` items with a "by {author} · {n} replies · Last post {date}" meta line.
  Both consume `apps/web/app/forums/forums-client.ts`; styles in `forums.module.css`.
- Latest existing migration timestamp is `1780892561355` (`...-user-bio-and-avatar.ts`),
  registered last in `reviewedMigrationClasses` (`database.config.ts`).
- Validation surface (`docs/development/testing.md`, `workspace.md`):
  `npx --yes pnpm@10.0.0 lint | typecheck | test`; single file via
  `npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run <path>` (web: `@sfus/web ... app/...`);
  MySQL integration tests gated on `SFUS_DB_INTEGRATION=1` (pattern:
  `apps/api/src/pages/pages.service.integration.test.ts`); full-stack `cicd/scripts/smoke-validate.sh`.

## Assumptions

- The recent-activity landing panel keeps showing the **original** topic author (current
  behavior); no request to change it. (Labeled assumption — not user-confirmed, but no change
  was requested.)
- Extending existing public endpoints' response shapes is backward-compatible because the web
  app is the only consumer.
- "Posts" counts opening posts (one per topic) **plus** non-deleted replies, excluding
  soft-deleted topics/posts (user-confirmed semantics).

## Resolved decisions

User-confirmed:
- **D1** — No naming flip; keep Category → Board → Topic everywhere (code, API, admin, docs).
- **D2** — Forums index columns are **per board** under the category header: **Topics** =
  non-deleted topics in the board; **Posts** = opening posts + non-deleted replies; **Last
  Post** = the board's latest activity (including opening posts), author profile-linked,
  absolute date, "No posts yet" when the board has no topics.
- **D3** — Board page is 4 columns Topic / Replies / Created / Last reply; both authors
  profile-linked; **last-reply author resolved at query time**; "Last reply" shows a **dash /
  "n/a"** when the topic has 0 replies; all dates **absolute**.
- **D4** — Description fix exactly as recorded in the closeout addendum: `varchar(512)` for
  category and board, server-side length validation, friendly `400`, admin form limit surfaced.
- **D5** — Include the recent-feed query hardening (defense-in-depth).
- **D6** — Visibility stays per board for now (revisit MS7/8); only the main-site public
  boards appear on the main forums page.

Planner decisions (user-blessed, P1–P5):
- **P1** — Specialist **Security review** on the API subtasks touching data isolation /
  untrusted input / migration: **ST1, ST2, ST3, ST4**. Web subtasks (ST5, ST6, ST7) consume
  already-public data and carry **security acceptance criteria** only (no specialist stage).
- **P2** — Items "recent-feed bug" + "recent-feed hardening" are combined into **ST1** (same
  method `listRecentTopics`).
- **P3** — Extend existing endpoints (`GET /forums/categories`, `GET /forums/boards/:id/topics`)
  rather than adding new endpoints.
- **P4** — In ST1 the implementer corrects the single stale `NULLS LAST` unit assertion so the
  suite is green; the **Tester** stage adds the MySQL-backed regression guard.
- **P5** — Admin limit UI = `maxlength` attribute + a visible "max 512 characters" hint; a live
  counter is optional (implementer's discretion).

## Documentation Impact (overall)

- `docs/features/forums.md` — recent-feed MySQL-compatible ordering + hardening note (ST1);
  topic-list shape gains `lastPostAuthor` (ST2); categories response gains per-board
  `topicCount` / `postCount` / `lastPost` (ST3); admin description/name length validation +
  512 limit (ST4).
- `docs/features/web-shell.md` — forums index per-board stat columns (ST5); board-page
  4-column topic list (ST6).
- `docs/guides/content-management.md` — admin description length limit + behavior (ST4/ST7).
- The Documenter confirms exact targets per subtask and records "no change" where none applies.

## Implementer Prompts

Each subtask below (ST1–ST7) embeds a launch-ready **Implementer Prompts** block (fenced),
beginning with `Your role is 'implementer'. Your task is as follows:` and carrying allowed
files, task, acceptance criteria, validation guidance, Tester handoff, the `Security review:
required` marker where applicable, artifact guidance, and the explicit completion gate. The
Coordinator can pass each block through without reinterpretation.

---

## ST1 — Recent-topics feed: remove MySQL-invalid `NULLS LAST` + harden visibility query

**Scope:** In `ForumsService.listRecentTopics`, remove the `"NULLS LAST"` third argument from
the `orderBy("topic.lastPostAt", "DESC", ...)` call (MySQL orders NULLs last under `DESC`
natively, preserving intended ordering), and as defense-in-depth add the public-board id
predicate into the query's `WHERE`/`JOIN` in addition to the existing allow-list. Correct the
stale "(NULLS LAST)" comments at ~806/837. Correct the single stale unit assertion so the suite
is green (Tester adds the real MySQL-backed guard).

**Allowed files:**
- `apps/api/src/forums/forums.service.ts`
- `apps/api/src/forums/forums.service.test.ts` *(narrow, justified: the one stale assertion at
  ~line 2536 encodes the removed `"NULLS LAST"` argument and otherwise reds the implementer's
  own validation gate; correct only that assertion — the Tester stage owns new coverage)*

**Acceptance criteria:**
- `GET /api/forums/recent` returns **200** (not 500) with topics ordered `lastPostAt DESC`
  (NULL `lastPostAt` naturally last under MySQL `DESC`) then `createdAt DESC`. No `NULLS LAST`
  (or other PostgreSQL-only) literal remains in any forums query.
- The recent-feed query constrains topics to public board ids in the `WHERE`/`JOIN`
  (defense-in-depth) **in addition to** the existing `isBoardPubliclyReadable` allow-list; the
  set of returned topics is unchanged.
- Oracle/visibility behavior preserved: stable empty list when there is no public activity;
  members/private/project-scoped boards and soft-deleted topics excluded.
- `forums.service.test.ts` no longer asserts a `"NULLS LAST"` argument; `lint`, `typecheck`,
  and the API test suite pass.

**Security review: required**

**Validation guidance:**
`npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts`,
then `npx --yes pnpm@10.0.0 lint` and `npx --yes pnpm@10.0.0 typecheck`.

**Tester guidance:** Tests live under `apps/api/src/forums/`. Add a **MySQL-backed** regression
guard that would catch a dialect-level `ORDER BY` failure for `GET /api/forums/recent` — either
an integration spec gated on `SFUS_DB_INTEGRATION=1` mirroring
`apps/api/src/pages/pages.service.integration.test.ts`, or a smoke assertion hitting the live
endpoint via `cicd/scripts/smoke-validate.sh`. Also replace the stale unit assertion with one
that asserts **no** nulls-ordering literal is passed to `orderBy`.

**Documentation Impact:** `docs/features/forums.md` — note the MySQL-compatible recent-feed
ordering and the defense-in-depth board-id predicate. Likely small; Documenter confirms.

**Implementer prompt:**

```
Your role is 'implementer'. Your task is as follows:

Fix and harden the forums recent-topics feed in the NestJS API.

Allowed files (do not modify anything else):
- apps/api/src/forums/forums.service.ts
- apps/api/src/forums/forums.service.test.ts  (ONLY to correct the single stale assertion
  described below; all new test coverage is the Tester's responsibility)

Task:
1. In ForumsService.listRecentTopics, remove the third argument "NULLS LAST" from
   .orderBy("topic.lastPostAt", "DESC", "NULLS LAST"). MySQL orders NULLs last under DESC
   natively, so .orderBy("topic.lastPostAt", "DESC") preserves the intended ordering
   (active topics first, never-replied topics after), then .addOrderBy("topic.createdAt","DESC").
2. As defense-in-depth, also constrain the query to the public board id allow-list inside the
   WHERE/JOIN (in addition to the existing isBoardPubliclyReadable-derived allow-list). The set
   of returned topics must not change.
3. Correct the stale "(NULLS LAST)" comments near the method (~lines 806 and 837) to match
   MySQL behavior.
4. In forums.service.test.ts, correct ONLY the single stale assertion (~line 2536) that expects
   orderBy to be called with "NULLS LAST", so the suite is green. Do not add new tests — the
   Tester stage owns the MySQL-backed regression guard.

Acceptance criteria:
- GET /api/forums/recent returns 200 with topics ordered lastPostAt DESC (NULLs last) then
  createdAt DESC; no NULLS LAST / PostgreSQL-only literal remains in any forums query.
- The recent-feed query carries the public-board-id predicate in WHERE/JOIN as a second layer
  on top of the allow-list; returned topics are unchanged.
- Oracle safety preserved: stable empty list with no public activity; non-public / project /
  soft-deleted excluded.
- lint, typecheck, and the API forums suite pass.

Validation:
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck

Tester handoff: API tests live under apps/api/src/forums/. Flag for the Tester that the dialect
bug is only catchable via a MySQL-backed test (SFUS_DB_INTEGRATION=1 integration spec like
apps/api/src/pages/pages.service.integration.test.ts, or a smoke assertion on
GET /api/forums/recent).

Security review: required

Artifacts: write your implementer report/result to the repository-root-relative shared
per-subtask artifact directory the Coordinator assigns for ST1 (e.g.
artifacts/forums-listing-enhancements-and-fixes/ST1/).

Continue past preflight into the implementation in the same run when no blocking input is
missing. Do not report success unless all required artifacts exist and all changes are committed.
```

---

## ST2 — Topic last-reply author enrichment + shared "last activity" primitive

**Scope:** Extend the public topic-list shape returned by `GET /api/forums/boards/:boardId/topics`
with `lastPostAuthor` (the author of the most recent **non-deleted** reply, or `null` when the
topic has no replies), resolved at query time. Factor a reusable "topic last activity"
resolver/primitive in `ForumsService` (latest non-deleted reply's author + timestamp, else the
opening post's author + `createdAt`) for reuse by ST3.

**Allowed files:**
- `apps/api/src/forums/forums.types.ts`
- `apps/api/src/forums/forums.service.ts`
- `apps/api/src/forums/forums.controller.ts` *(only if the response shape pass-through needs it)*

**Acceptance criteria:**
- Each item in `GET /api/forums/boards/:boardId/topics` includes
  `lastPostAuthor: { username: string; displayName: string | null } | null` — the author of the
  most recent **non-deleted** reply in that topic, or `null` when there are 0 non-deleted
  replies. All existing fields (`author`, `createdAt`, `replyCount`, `lastPostAt`, etc.) remain.
- Resolution happens at query time; soft-deleted posts are ignored (if the latest reply is
  soft-deleted, the next-latest non-deleted reply is used, else `null`). Board visibility is
  unchanged (non-readable/nonexistent boards still 404, oracle parity).
- A reusable "topic last activity" primitive exists in `ForumsService` and is used here and is
  consumable by ST3 (board-level aggregation).
- Resolution is correct for a full page of topics (a single grouped/joined query is preferred
  over per-topic N+1; correctness takes precedence over micro-optimization).
- `lint`, `typecheck`, and the API test suite pass.

**Security review: required**

**Validation guidance:**
`npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts`,
plus `lint` and `typecheck`.

**Tester guidance:** Under `apps/api/src/forums/` cover: `lastPostAuthor` present with replies,
`null` with none, latest reply soft-deleted falls back correctly, and that non-readable boards
still 404.

**Documentation Impact:** `docs/features/forums.md` — the public topic-list shape gains
`lastPostAuthor` (semantics + null case).

**Implementer prompt:**

```
Your role is 'implementer'. Your task is as follows:

Enrich the public forum topic-list API with the last-reply author, resolved at query time.

Allowed files (do not modify anything else):
- apps/api/src/forums/forums.types.ts
- apps/api/src/forums/forums.service.ts
- apps/api/src/forums/forums.controller.ts  (only if needed for shape pass-through)

Task:
1. Add lastPostAuthor: { username: string; displayName: string | null } | null to the public
   topic-list shape used by GET /api/forums/boards/:boardId/topics (in forums.types.ts).
2. In ForumsService.listTopics, resolve, at query time, the author of each topic's most recent
   NON-DELETED reply from forum_posts (ignore deleted_at IS NOT NULL). When a topic has no
   non-deleted replies, lastPostAuthor is null. Prefer a single grouped/joined resolution for
   the whole page over per-topic N+1; correctness first.
3. Factor a reusable "topic last activity" helper in ForumsService that returns, for a topic,
   the latest non-deleted reply's author + timestamp, else the opening post's author +
   createdAt. ST3 will reuse it for board-level aggregation, so keep it cohesive and exported
   within the service module as appropriate.
4. Do not change board visibility behavior: non-readable / nonexistent boards still return 404
   with the existing oracle-parity message.

Acceptance criteria:
- Topic items include lastPostAuthor (author of latest non-deleted reply, or null when none),
  alongside all existing fields.
- Soft-deleted posts are ignored when resolving lastPostAuthor.
- A reusable topic-last-activity primitive exists for ST3.
- lint, typecheck, and the API forums suite pass.

Validation:
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck

Tester handoff: API tests live under apps/api/src/forums/. Cover lastPostAuthor present/null,
soft-deleted-latest-reply fallback, and unchanged 404 visibility.

Security review: required

Artifacts: write your implementer report/result to the repository-root-relative shared
per-subtask artifact directory the Coordinator assigns for ST2 (e.g.
artifacts/forums-listing-enhancements-and-fixes/ST2/).

Continue past preflight into the implementation in the same run when no blocking input is
missing. Do not report success unless all required artifacts exist and all changes are committed.
```

---

## ST3 — Public categories response: per-board Topics / Posts / Last Post aggregates

**Scope:** Extend the `GET /api/forums/categories` response so each board carries `topicCount`,
`postCount`, and `lastPost`, computed over **public** boards only and excluding soft-deleted
rows, reusing the ST2 "topic last activity" primitive for the board's latest activity.

**Allowed files:**
- `apps/api/src/forums/forums.types.ts`
- `apps/api/src/forums/forums.service.ts`
- `apps/api/src/forums/forums.controller.ts` *(only if the response shape pass-through needs it)*

**Acceptance criteria:**
- Each board in `GET /api/forums/categories` includes:
  - `topicCount` — count of non-deleted topics in the board.
  - `postCount` — opening posts (one per non-deleted topic) **plus** non-deleted replies.
  - `lastPost: { at: string; author: { username: string; displayName: string | null } } | null`
    — the board's latest activity across its topics (including opening posts), `null` when the
    board has no topics. `author` is the last-reply author when the latest activity is a reply,
    else the original author (via the ST2 primitive).
- Counts and `lastPost` reflect **only public** boards/topics; soft-deleted topics/posts are
  excluded; no non-public or project-scoped board is counted or revealed (oracle safety).
- All existing fields in the categories response are unchanged.
- `lint`, `typecheck`, and the API test suite pass.

**Security review: required**

**Validation guidance:**
`npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts`,
plus `lint` and `typecheck`.

**Tester guidance:** Under `apps/api/src/forums/` cover: count correctness (topics, opening+reply
posts), soft-delete exclusion, non-public exclusion, empty-board `lastPost: null`, and
`lastPost` author/timestamp correctness.

**Documentation Impact:** `docs/features/forums.md` — categories response gains per-board
`topicCount` / `postCount` / `lastPost`.

**Implementer prompt:**

```
Your role is 'implementer'. Your task is as follows:

Add per-board aggregate stats to the public forum categories API.

Allowed files (do not modify anything else):
- apps/api/src/forums/forums.types.ts
- apps/api/src/forums/forums.service.ts
- apps/api/src/forums/forums.controller.ts  (only if needed for shape pass-through)

Task:
1. Extend the public board shape in the GET /api/forums/categories response (forums.types.ts)
   with: topicCount: number; postCount: number; lastPost: { at: string; author: { username:
   string; displayName: string | null } } | null.
2. In ForumsService.listPublicCategories, compute for each PUBLIC board:
   - topicCount = count of non-deleted topics in the board.
   - postCount = number of non-deleted topics (opening posts) + count of non-deleted replies in
     those topics.
   - lastPost = the board's latest activity across its topics using the ST2 topic-last-activity
     primitive (latest non-deleted reply author+time, else opening-post author+createdAt); take
     the max over the board's topics; null when the board has no topics.
3. Only public boards/topics may be counted or revealed; exclude soft-deleted topics and posts.
   Do not count or expose non-public or project-scoped boards.
4. Leave all existing categories-response fields unchanged.

Acceptance criteria:
- Each board carries topicCount, postCount, and lastPost (or null) as specified, public-only and
  soft-delete-excluded.
- lint, typecheck, and the API forums suite pass.

Validation:
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck

Tester handoff: API tests live under apps/api/src/forums/. Cover count correctness, soft-delete
and non-public exclusion, empty-board null lastPost, and lastPost author/timestamp.

Security review: required

Artifacts: write your implementer report/result to the repository-root-relative shared
per-subtask artifact directory the Coordinator assigns for ST3 (e.g.
artifacts/forums-listing-enhancements-and-fixes/ST3/).

Continue past preflight into the implementation in the same run when no blocking input is
missing. Do not report success unless all required artifacts exist and all changes are committed.
```

---

## ST4 — Forum description length: `varchar(512)` migration + create/update validation

**Scope:** New migration widening `forum_categories.description` and `forum_boards.description`
to `varchar(512)`; add server-side length validation in `create/update` for both category and
board (description ≤512, name ≤128) returning a friendly `BadRequestException` (HTTP 400) before
any DB write.

**Allowed files:**
- `apps/api/src/database/migrations/<timestamp>-forum-description-length.ts` *(new)*
- `apps/api/src/database/database.config.ts` *(register the new migration class + import)*
- `apps/api/src/forums/forums.service.ts`
- `apps/api/src/forums/forums.types.ts` *(optional: export `FORUM_DESCRIPTION_MAX_LENGTH=512` /
  `FORUM_NAME_MAX_LENGTH=128` constants)*

**Acceptance criteria:**
- A new migration widens **both** `forum_categories.description` and `forum_boards.description`
  to `varchar(512)`; `down` reverts to `varchar(255)`; the migration class is registered in
  `reviewedMigrationClasses` with a unique timestamp **strictly greater than `1780892561355`**.
- `createCategory`, `updateCategory`, `createBoard`, `updateBoard` reject `description` > 512 and
  `name` > 128 with a `BadRequestException` (400) and a clear message, **before** persistence;
  `update` validates only the fields actually provided.
- A 256–512-char description now persists successfully (no 500); a >512-char description returns
  **400, not 500**.
- `lint`, `typecheck`, and the API test suite pass.

**Security review: required**

**Validation guidance:**
`npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts`,
plus `lint` and `typecheck`. Migration apply/rollback can be exercised via the
`SFUS_DB_INTEGRATION` / `migration:run` path in `docs/development/testing.md` where a MySQL
service is available.

**Tester guidance:** Under `apps/api/src/forums/` add boundary tests (255 / 256 / 512 / 513-char
description; 128 / 129-char name) for **category and board**, **create and update**, asserting a
`BadRequestException` (not a DB error). Verify migration up/down where the gated MySQL path is
available.

**Documentation Impact:** `docs/features/forums.md` (admin create/update validation rules + 512
limit) and `docs/guides/content-management.md` (mention the limit in the admin how-to).

**Implementer prompt:**

```
Your role is 'implementer'. Your task is as follows:

Widen forum category/board description columns and add length validation in the NestJS API.

Allowed files (do not modify anything else):
- apps/api/src/database/migrations/<timestamp>-forum-description-length.ts  (new file)
- apps/api/src/database/database.config.ts
- apps/api/src/forums/forums.service.ts
- apps/api/src/forums/forums.types.ts  (optional, for length-limit constants)

Task:
1. Create a new TypeORM migration that ALTERs forum_categories.description and
   forum_boards.description from varchar(255) to varchar(512) (both nullable as today). Provide
   up() and down() (down reverts to varchar(255)). Use a unique migration timestamp STRICTLY
   GREATER than 1780892561355 (the current latest). Follow the existing migration file style in
   apps/api/src/database/migrations/.
2. Register the new migration class (import + add to reviewedMigrationClasses, keeping it last in
   chronological order) in apps/api/src/database/database.config.ts.
3. In ForumsService.createCategory, updateCategory, createBoard, updateBoard, validate BEFORE
   any DB write: description length <= 512 and name length <= 128. On violation throw
   BadRequestException with a clear, friendly message (e.g. "Description must be 512 characters
   or fewer."). On update, validate only the fields actually supplied. Optionally export
   FORUM_DESCRIPTION_MAX_LENGTH (512) and FORUM_NAME_MAX_LENGTH (128) constants and use them.

Acceptance criteria:
- Migration widens both description columns to varchar(512) with a working down(), registered
  with a timestamp > 1780892561355.
- create/update for category and board reject over-length description (>512) and name (>128) with
  a 400 BadRequestException before persistence; update validates only provided fields.
- A 256–512-char description persists (no 500); >512 returns 400, not 500.
- lint, typecheck, and the API forums suite pass.

Validation:
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck

Tester handoff: API tests live under apps/api/src/forums/. Cover boundary lengths (255/256/512/513
description; 128/129 name) for category and board, create and update, asserting BadRequestException
not a DB error; verify migration up/down on the gated MySQL path where available.

Security review: required

Artifacts: write your implementer report/result to the repository-root-relative shared
per-subtask artifact directory the Coordinator assigns for ST4 (e.g.
artifacts/forums-listing-enhancements-and-fixes/ST4/).

Continue past preflight into the implementation in the same run when no blocking input is
missing. Do not report success unless all required artifacts exist and all changes are committed.
```

---

## ST5 — `/forums` index: per-board Topics / Posts / Last Post columns

**Scope:** Render the per-board aggregate columns from ST3 on the forums index, under each
category header. (Depends on ST3.)

**Allowed files:**
- `apps/web/app/forums/forums-client.ts` *(extend `PublicBoardShape` / `PublicCategoryShape` with
  `topicCount` / `postCount` / `lastPost`; parse from the response)*
- `apps/web/app/forums/page.tsx`
- `apps/web/app/forums/forums.module.css`

**Acceptance criteria:**
- Each board row on `/forums` shows three columns: **Topics** (`topicCount`), **Posts**
  (`postCount`), and **Last Post** — an absolute date plus the author's display name (or
  username) linking to `/users/<username>`; the board shows **"No posts yet"** when `lastPost`
  is `null`.
- Values come from the extended `GET /api/forums/categories` response (ST3); no client-side
  recomputation of counts.
- Profile links use `encodeURIComponent` on the username; only public fields are rendered; no
  `dangerouslySetInnerHTML`.
- Existing category/board names and descriptions remain; the layout is accessible (semantic
  table or labeled columns).
- `lint`, `typecheck`, and the web test suite pass.

**Security acceptance criteria (no specialist stage):** render only public fields returned by the
API; encode usernames in profile links; introduce no raw-HTML rendering.

**Validation guidance:**
`npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/forums/forums.spec.ts`, plus
`lint` and `typecheck`.

**Tester guidance:** `apps/web/app/forums/forums.spec.ts` — columns render from the API shape,
last-post profile-link target + encoding, and the empty-board "No posts yet" fallback.

**Documentation Impact:** `docs/features/web-shell.md` — forums index now shows per-board stat
columns (and/or `forums.md`).

**Implementer prompt:**

```
Your role is 'implementer'. Your task is as follows:

Add per-board Topics / Posts / Last Post columns to the public forums index page.

Allowed files (do not modify anything else):
- apps/web/app/forums/forums-client.ts
- apps/web/app/forums/page.tsx
- apps/web/app/forums/forums.module.css

Task:
1. In forums-client.ts, extend the board/category shapes with topicCount: number; postCount:
   number; lastPost: { at: string; author: { username: string; displayName: string | null } } |
   null, matching the ST3 API response, and parse them.
2. In app/forums/page.tsx, render for each board row three columns: Topics (topicCount), Posts
   (postCount), and Last Post = an absolute date (toLocaleDateString) + the author's displayName
   ?? username, where the name links to /users/<encodeURIComponent(username)>. When lastPost is
   null, render "No posts yet". Keep the existing category headers and board name/description.
3. Style the columns in forums.module.css. Use a semantic table or clearly labeled columns;
   keep it accessible.

Acceptance criteria:
- Each board shows Topics, Posts, and Last Post (absolute date + profile-linked author), with
  "No posts yet" when lastPost is null; values come straight from the API (no client recompute).
- Usernames are encodeURIComponent-encoded in links; only public fields rendered; no
  dangerouslySetInnerHTML.
- lint, typecheck, and the web suite pass.

Validation:
- npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/forums/forums.spec.ts
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck

Tester handoff: web specs live in apps/web/app/forums/forums.spec.ts. Cover column rendering,
last-post link target/encoding, and the empty-board fallback.

(No specialist security stage. Security acceptance: render only public API fields, encode
usernames, no raw HTML.)

Artifacts: write your implementer report/result to the repository-root-relative shared
per-subtask artifact directory the Coordinator assigns for ST5 (e.g.
artifacts/forums-listing-enhancements-and-fixes/ST5/).

Continue past preflight into the implementation in the same run when no blocking input is
missing. Do not report success unless all required artifacts exist and all changes are committed.
```

---

## ST6 — `/forums/[boardSlug]`: 4-column topic list (Topic / Replies / Created / Last reply)

**Scope:** Reorganize the board page's topic list into 4 columns. (Depends on ST2; runs after
ST5 because it shares `forums-client.ts` and `forums.module.css`.)

**Allowed files:**
- `apps/web/app/forums/forums-client.ts` *(extend `PublicTopicShape` with `lastPostAuthor`; parse)*
- `apps/web/app/forums/[boardSlug]/page.tsx`
- `apps/web/app/forums/forums.module.css`

**Acceptance criteria:**
- The board topic list renders 4 columns:
  - **Topic** — the title link, preserving the existing **Pinned**/**Locked** badges.
  - **Replies** — `replyCount`.
  - **Created** — the original author's display name (or username) linking to
    `/users/<username>`, plus the absolute creation date.
  - **Last reply** — the `lastPostAuthor`'s display name (or username) linking to
    `/users/<username>`, plus the absolute `lastPostAt` date; renders a **dash / "n/a"** when
    `replyCount` is 0 / `lastPostAuthor` is `null`.
- Both author links use `encodeURIComponent`; dates are absolute; no `dangerouslySetInnerHTML`.
- Existing board-page behavior is preserved: pagination, the new-topic CTA / sign-in prompt,
  breadcrumb, moderator note, and the "No topics yet" empty state.
- `lint`, `typecheck`, and the web test suite pass.

**Security acceptance criteria (no specialist stage):** encode usernames; render only public
fields; no raw HTML.

**Validation guidance:**
`npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/forums/forums.spec.ts`, plus
`lint` and `typecheck`.

**Tester guidance:** `apps/web/app/forums/forums.spec.ts` — 4 columns present, profile-link
targets + encoding for both authors, the dash/"n/a" on 0 replies, and that pinned/locked badges
and pagination still render.

**Documentation Impact:** `docs/features/web-shell.md` — board-page 4-column topic list
(and/or `forums.md`).

**Implementer prompt:**

```
Your role is 'implementer'. Your task is as follows:

Reorganize the forum board page topic list into four columns.

Allowed files (do not modify anything else):
- apps/web/app/forums/forums-client.ts
- apps/web/app/forums/[boardSlug]/page.tsx
- apps/web/app/forums/forums.module.css

Task:
1. In forums-client.ts, extend PublicTopicShape with lastPostAuthor: { username: string;
   displayName: string | null } | null (matching ST2) and parse it.
2. In app/forums/[boardSlug]/page.tsx, replace the current per-topic meta line with a 4-column
   layout:
   - Topic: the existing title link, keeping the Pinned/Locked badges.
   - Replies: replyCount.
   - Created: (author.displayName ?? author.username) linking to
     /users/<encodeURIComponent(username)>, plus the absolute createdAt date (toLocaleDateString).
   - Last reply: (lastPostAuthor.displayName ?? lastPostAuthor.username) linking to the profile,
     plus the absolute lastPostAt date; render a dash / "n/a" when replyCount is 0 or
     lastPostAuthor is null.
3. Preserve pagination, the new-topic CTA / sign-in prompt, breadcrumb, moderator note, and the
   empty state. Style the columns in forums.module.css (semantic table or labeled columns).

Acceptance criteria:
- Four columns (Topic / Replies / Created / Last reply) as specified; both authors profile-linked
  and encodeURIComponent-encoded; absolute dates; dash/"n/a" when no replies; badges preserved.
- No dangerouslySetInnerHTML; only public fields rendered; existing board-page behaviors intact.
- lint, typecheck, and the web suite pass.

Validation:
- npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/forums/forums.spec.ts
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck

Tester handoff: web specs live in apps/web/app/forums/forums.spec.ts. Cover the 4 columns, both
profile-link targets/encoding, the dash on 0 replies, and preserved badges/pagination.

(No specialist security stage. Security acceptance: encode usernames, render only public fields,
no raw HTML.)

Artifacts: write your implementer report/result to the repository-root-relative shared
per-subtask artifact directory the Coordinator assigns for ST6 (e.g.
artifacts/forums-listing-enhancements-and-fixes/ST6/).

Continue past preflight into the implementation in the same run when no blocking input is
missing. Do not report success unless all required artifacts exist and all changes are committed.
```

---

## ST7 — `/admin/forums`: surface the description length limit on create/edit forms

**Scope:** Communicate and soft-enforce the new 512-char description limit (and the 128-char name
limit) on the admin category/board create and edit forms, and surface the server's friendly
validation message. (Depends on ST4.)

**Allowed files:**
- `apps/web/app/admin/forums/page.tsx`
- `apps/web/app/admin/forums/forums-admin-client.ts` *(only if needed to surface the server error
  message)*
- `apps/web/app/auth-shell.module.css` *(only if a style hook is genuinely required; this is
  shared admin chrome — keep any additions minimal, or prefer existing classes / inline styles)*

**Acceptance criteria:**
- The `/admin/forums` create **and** edit forms, for **category and board**, apply a 512-char
  `maxlength` to the description input and display the limit (a visible "max 512 characters" hint;
  a live counter is optional).
- Name inputs apply a 128-char `maxlength` (a hint is optional).
- When the server returns a `400` for an over-limit description or name, the form surfaces the
  server's friendly message (no generic "An unexpected error occurred").
- All other admin CRUD behavior and admin gating are unchanged.
- `lint`, `typecheck`, and the web test suite pass.

**Security acceptance criteria (no specialist stage):** client validation is UX-only — the server
(ST4) remains the enforcement boundary; do not weaken admin gating.

**Validation guidance:**
`npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/admin/forums/forums-admin.spec.ts`,
plus `lint` and `typecheck`.

**Tester guidance:** `apps/web/app/admin/forums/forums-admin.spec.ts` — `maxlength` present on
description/name inputs, the limit hint/counter renders, and a server-`400` message is surfaced
in the form.

**Documentation Impact:** `docs/guides/content-management.md` — admin description length limit and
behavior (and `docs/features/web-shell.md` if the admin surface is described there).

**Implementer prompt:**

```
Your role is 'implementer'. Your task is as follows:

Surface the forum description/name length limits on the /admin/forums create and edit forms.

Allowed files (do not modify anything else):
- apps/web/app/admin/forums/page.tsx
- apps/web/app/admin/forums/forums-admin-client.ts  (only if needed to surface server error text)
- apps/web/app/auth-shell.module.css  (only if a style hook is genuinely required; shared admin
  chrome — keep additions minimal or prefer existing classes / inline styles)

Task:
1. On the admin category AND board create and edit forms, add maxlength=512 to the description
   input and show the limit to the user (a visible "max 512 characters" hint; a live character
   counter is optional, your discretion). Add maxlength=128 to the name input (a hint is
   optional).
2. When the server responds 400 (over-limit description or name, from ST4), surface the server's
   friendly message in the form instead of a generic error. If forums-admin-client.ts already
   returns the server message, just render it; only modify the client if needed to expose it.
3. Do not change any other admin CRUD behavior or the admin gating.

Acceptance criteria:
- Description inputs (category + board, create + edit) enforce maxlength=512 and display the
  limit; name inputs enforce maxlength=128.
- Server 400 validation messages are surfaced in the form (no generic "unexpected error").
- Admin gating and other CRUD behavior unchanged.
- lint, typecheck, and the web suite pass.

Validation:
- npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/admin/forums/forums-admin.spec.ts
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck

Tester handoff: web specs live in apps/web/app/admin/forums/forums-admin.spec.ts. Cover maxlength
on description/name, the limit hint/counter, and a surfaced server-400 message.

(No specialist security stage. Security acceptance: client validation is UX-only; the server is
the enforcement boundary; admin gating unchanged.)

Artifacts: write your implementer report/result to the repository-root-relative shared
per-subtask artifact directory the Coordinator assigns for ST7 (e.g.
artifacts/forums-listing-enhancements-and-fixes/ST7/).

Continue past preflight into the implementation in the same run when no blocking input is
missing. Do not report success unless all required artifacts exist and all changes are committed.
```

---

## Dependency Ordering & parallelization

- **API chain (strictly sequential — all touch `forums.service.ts` / `forums.types.ts`):**
  **ST1 → ST2 → ST3 → ST4.** ST3 reuses the ST2 "topic last activity" primitive; ST2/ST3/ST4 all
  edit the same service/types files, so they cannot run in parallel.
- **Web (after their API dependency):**
  - **ST5** depends on **ST3**.
  - **ST6** depends on **ST2** but **must run after ST5** because it shares `forums-client.ts`
    and `forums.module.css` with ST5 (overlapping files → serial, not parallel).
  - **ST7** depends on **ST4** and touches only `apps/web/app/admin/forums/*` (plus, optionally,
    shared admin chrome CSS). It has **no file overlap with ST5/ST6**, so it *may* run in parallel
    with ST5/ST6 once ST4 is merged; conservatively it is ordered after them.
- **Recommended linear order:** **ST1, ST2, ST3, ST4, ST5, ST6, ST7.**
- No subtask is marked parallelizable by default; the only safe parallel opportunity is ST7
  alongside ST5/ST6 (distinct files), at the Coordinator's discretion.

## Output Artifact Path & Artifacts

- **Output Artifact Path (this plan):** `plans/forums-listing-enhancements-and-fixes-plan.md`
  (repository-root-relative).
- Per-subtask Coordinator/agent artifacts: `artifacts/forums-listing-enhancements-and-fixes/<ST#>/`
  (repository-root-relative), e.g. `implementer_report.md`, `tester_report.md`, etc.
