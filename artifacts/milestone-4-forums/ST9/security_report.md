Security Review Report

Scope reviewed:
- Milestone 4 subtask ST9 — the anti-abuse ENFORCEMENT boundary applying the ST8 throttle + link-limit to forum topic create, forum post create, and blog comment create, across the forums and blog modules.
- Change set reviewed (commit 9575004 vs base ms4): apps/api/src/forums/forums.controller.ts (throttle+link-limit on createTopic, createPost); apps/api/src/blog/blog.controller.ts (throttle+link-limit on createComment); apps/api/src/forums/forums.module.ts and blog.module.ts (ThrottleModule + UsersModule imports); apps/api/src/common/throttle/throttle.module.ts (added THROTTLE_CONFIG to module exports); plus the tester ST9 enforcement specs (commit dd2afcd).
- Reused ST8 surfaces inspected (read-only): common/throttle/throttle.service.ts, link-limit.ts, throttle-store.ts, throttle.types.ts, and users/users.service.ts + user.entity.ts for the new-account-tier createdAt source.

Why specialist review was triggered:
- Plan marks ST9 'Security review: required — the actual enforcement boundary, across two modules.'
- Risk R2 — Throttle correctness / fail-open: ACs require fail-closed 429, proxy-resolved IP fallback, proven storage seam; ST9 must preserve ST8's fail-closed behavior at the wiring layer.
- Risk R6 / retrospective P7 — Partial-breadth: every protected member-create site must actually be wired; enforcement must reuse the ST8 module at every site (no duplicated/divergent throttle logic).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST9 (lines 302-316), ST8 (276-301), Risk R2 (568-570), Risk R6 (578-579).
- docs/development/agent-retrospective-patterns.md — P7 (partial-breadth fixes).
- ST9 acceptance criteria: forum topic/post + blog comment create rate-limited (over-limit 429); new-account tier demonstrably stricter; link-over-limit bodies rejected; no throttle logic duplicated — enumerate every protected site.

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.controller.ts:258 - Link-limit (400) runs before the throttle (429) and before the resource existence/visibility gate. Benign: the link-limit is a body-only anti-abuse rejection that leaks no resource-existence information and does not weaken the throttle.
  An over-link-body request returns a deterministic 400 without consuming a throttle slot. This is acceptable — the 400 is itself an anti-abuse rejection, is identical regardless of target resource (no existence oracle), and legitimate-shaped over-volume traffic still hits the throttle. No remediation required; recorded for awareness.
- apps/api/src/common/throttle/throttle.types.ts:61 - THROTTLE_CONFIG is defined in throttle.types.ts and only ADDED to ThrottleModule's exports list in ST9 (the task brief described it as 'exported from throttle.module.ts'). Functionally correct — the module re-exports the token so feature modules can inject ThrottleConfig.
  No security impact. Noted only to keep the change-set description accurate: the ST9 module edit is a one-line addition of THROTTLE_CONFIG to the existing exports array, enabling the forums/blog controllers to @Inject(THROTTLE_CONFIG).

Test sufficiency assessment:
- STRONG and non-vacuous. Validation run from this worktree: vitest run --root apps/api src/forums/forums.controller.test.ts src/blog/blog.controller.test.ts => 150/150 passed (2 files). pnpm typecheck => clean (apps/api, apps/web). pnpm lint => clean (eslint --max-warnings=0, both apps).
- All THREE protected sites covered with dedicated ST9 specs (forum-topic-create, forum-post-create, blog-comment-create): over-limit -> 429 AND persistence (createTopic/createPost/createComment) asserted not.toHaveBeenCalled() (fail-closed: no write on breach); under-limit pass-through; link-over-limit -> 400 with persistence asserted not called.
- Ordering proven: when resolveSession rejects (no session), checkRequest is asserted not.toHaveBeenCalled() at all three sites — the 401 auth gate fires strictly before the throttle.
- Identity/tier wiring proven: checkRequest asserted to receive userId AND a non-null userCreatedAt sourced from usersService.findById; an explicit 'VACUOUS if userCreatedAt is null' test demonstrates that with null createdAt the stricter tier is inactive (3 requests pass at maxHits=10) while a young real createdAt is throttled at newAccountMaxHits=2 — proving the createdAt wiring is load-bearing.
- New-account-tier tests are driven through the REAL ThrottleService + InMemoryThrottleStore (not a mock), confirming enforcement reuses the ST8 module rather than a reimplemented/divergent throttle.

Documentation / operational guidance assessment:
- Adequate. ST9 documenter pass updated docs/features/blog.md (comment rate-limit), docs/features/forums.md (posting limits), and docs/development/api-conventions.md (anti-spam contract reference). Controller JSDoc accurately describes the throttle + new-account tier + link-cap behavior and the 401-before-throttle ordering.
- Env-var contract for throttle limits (windowMs, maxHits, newAccountMaxHits, newAccountWindowMs, maxLinksPerPost) is owned by ST8 (environment.ts + launch.md) and unchanged by ST9; no operational gap introduced.

Artifacts written:
- artifacts/milestone-4-forums/ST9/security_report.md
- artifacts/milestone-4-forums/ST9/security_result.json

Outcome:
- PASS

---

## Detailed concern-by-concern analysis

### 1. Breadth / no gap (R6 / P7) — PASS

Enumerated EVERY write route in both controllers (grep of @Post/@Put/@Patch/@Delete). The
non-privileged, any-authenticated-member content-create sites are exactly THREE, and all three
are wired to the throttle + link-limit:

1. `POST /forums/boards/:boardId/topics` → `createTopic` — forums.controller.ts:251-276. Throttle
   label `forum-topic-create`; `exceedsLinkLimit` at :260; `throttleService.checkRequest` at :268.
2. `POST /forums/topics/:topicId/posts` → `createPost` — forums.controller.ts:358-383. Throttle
   label `forum-post-create`; `exceedsLinkLimit` at :367; `checkRequest` at :375.
3. `POST /blog/:postId/comments` → `createComment` — blog.controller.ts:289-315. Throttle label
   `blog-comment-create`; `exceedsLinkLimit` at :298; `checkRequest` at :305.

All OTHER write routes are `admin/*` (admin role via `assertAdminManagementAccess`) or
`moderation/*` (moderator/admin via `assertModerationAccess`) — privileged staff routes,
correctly OUT of scope for member anti-abuse throttling per the plan. No member-create write path
is missed within ST9's scope (forums + blog). Media uploads (R7) and auth (login/register) are
separate subtasks/risks outside ST9's defined boundary.

No throttle logic is duplicated. Both controllers import and call the ST8 `ThrottleService`,
`exceedsLinkLimit`, and `ThrottleConfig` from `common/throttle/*` — there is no reimplemented or
divergent throttle/link-count code. The tier and counter logic live solely in ST8's
`ThrottleService` + `InMemoryThrottleStore`.

### 2. Fail-closed (R2) — PASS

`ThrottleService.checkRequest` (throttle.service.ts:64-97) calls `this.store.hit(...)` with NO
try/catch and throws `HttpException(429)` on breach. Neither controller wraps `checkRequest` (or
the preceding `usersService.findById`) in a try/catch — any exception (a throttle-store error, a
DB error resolving the user, or the 429) propagates to the NestJS exception layer and DENIES the
request. The throttle/link-limit run BEFORE the persistence call (`forumsService.createTopic` /
`createPost` / `blogService.createComment`), so an over-limit (429) or over-link (400) request
NEVER reaches a create/save. Confirmed at the test level: every over-limit and over-link spec
asserts the persistence spy `not.toHaveBeenCalled()`. Fail-closed is preserved.

### 3. Identity — PASS

Identity resolution lives in ST8 (`throttle.service.ts:69`): `const identity = userId ?? request.ip
?? "unknown"` — session user id preferred, else `request.ip` (proxy-resolved under the ST7
`trust proxy=1` decision). X-Forwarded-For is NEVER parsed directly. The new-account tier uses the
AUTHENTICATED user's REAL server-side `createdAt`: each controller calls
`usersService.findById(session.user.id)` (users.service.ts:14-16 → `usersRepository.findOne`) and
passes `userEntity?.createdAt`. This is the DB-backed `UserEntity.createdAt` (user.entity.ts:44),
NOT a client-supplied value — a client cannot claim an old account to obtain laxer limits. The
`session.user.id` itself comes from `authService.resolveSession`, not from the request body.

### 4. Ordering — PASS

Order in all three handlers: (a) 401 `resolveSession` first; (b) body-only link-limit (400);
(c) throttle (429); (d) resource existence/visibility/lock gates (404/403) inside the service
layer (`forums.service.createPost` enforces locked-topic 403 at :667, 404 oracle-parity at :663;
blog comment path resolves published-only post → 404). The throttle does NOT introduce a pre-auth
existence oracle: it runs strictly after the 401 gate, and the throttle key is
`(routeLabel, userId)` — it does not depend on the target resource id or its existence/visibility,
so a 429 carries no information about whether the board/topic/post exists or is readable.
Under-limit traffic falls through to the identical pre-existing 401/403/404 contracts, which are
unchanged. Tests assert `checkRequest` is not reached when the session is missing (401-before-
throttle) at all three sites.

### 5. New-account tier non-vacuous — PASS

The tier is active and the wiring is load-bearing. `ThrottleService` activates the stricter tier
only when `userId && userCreatedAt && (Date.now() - userCreatedAt < newAccountWindowMs)`
(throttle.service.ts:74-79). The controllers supply the real `createdAt`. The tester includes an
explicit "VACUOUS if userCreatedAt is null" spec at every relevant site: with `createdAt: null`
the tier is inactive and a young-pattern request stream passes under `maxHits`, while the SAME
stream with a real young `createdAt` is throttled at `newAccountMaxHits`. This proves the test
would fail (young account would NOT be stricter) if `createdAt` were null — i.e. the wiring is
real, not decorative.

### 6. Link-limit — PASS

`exceedsLinkLimit(body, maxLinksPerPost)` is applied to each protected body before persistence and
rejects over-limit with 400 (forums.controller.ts:260, :367; blog.controller.ts:298). It uses the
ST8 ReDoS-safe linear scanner: link-limit.ts uses only `indexOf`-based O(n) scanning with a hard
`MAX_SCAN_BYTES` (256 KB) cap and NO regex with unbounded repetition on attacker-controlled input
(link-limit.ts:17, :163-171). No regression — ST9 imports and reuses the existing scanner
unchanged.

## Validation matrix (commands actually run, from this worktree)

- `pnpm --dir <worktree> install --frozen-lockfile` → OK (lockfile up to date; argon2/sharp/esbuild
  build scripts ignored but already-built — tests/typecheck/lint all succeeded).
- `pnpm exec vitest run --root apps/api src/forums/forums.controller.test.ts
  src/blog/blog.controller.test.ts` → **150/150 passed** (2 files: forums 111, blog 39).
- `pnpm typecheck` → **clean** (apps/api + apps/web, `tsc --noEmit`).
- `pnpm lint` → **clean** (eslint `--max-warnings=0`, apps/api + apps/web).

Matrix is fully GREEN.

## Overall outcome: PASS

All three protected member-create sites are wired to the reused ST8 throttle + link-limit;
enforcement fails closed (no persistence on 429/400, exceptions propagate); identity prefers the
session user id with proxy-resolved IP fallback and never trusts client X-Forwarded-For or a
client-supplied createdAt; the auth/visibility ordering and the existing 401/403/404 contracts are
intact with no new existence oracle; the new-account tier is active and proven non-vacuous; and the
link-limit reuses the ReDoS-safe linear scanner. Two NOTE-level (INFO) observations are recorded
above; neither is blocking. No BLOCKING or WARNING findings.
