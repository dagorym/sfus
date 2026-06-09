Security Review Report

Scope reviewed:
- Pass-2 specialist security re-review of subtask CO5 (Milestone 4 forums closeout, plans/milestone-4-forums-closeout-plan.md): the NEW public, unauthenticated read path GET /api/forums/recent (landing-page recent-topics feed).
- This is a remediation re-review. Pass 1 returned CONDITIONAL PASS with one WARNING: a non-finite ?limit (e.g. ?limit=abc, empty ?limit=) -> parseInt -> NaN -> Math.min/Math.max could not neutralize NaN -> qb.take(NaN) threw a TypeORMError -> HTTP 500 for an unauthenticated caller. Pass-1 report/result archived at artifacts/milestone-4-forums-closeout/CO5/history/verifier-1-warning/.
- Reviewed current branch state and the diff against ms4a base. Files in scope: apps/api/src/forums/forums.service.ts (the Number.isFinite limit-guard fix, listRecentTopics lines 812-863, shared isBoardPubliclyReadable predicate lines 370-385), apps/api/src/forums/forums.controller.ts (public listRecentTopics handler lines 175-205), apps/api/src/forums/forums.types.ts (RecentTopicShape/RecentTopicBoardStub/RecentTopicsQuery lines 242-281), apps/api/src/forums/forums.service.test.ts and forums.controller.test.ts (the 5 regression tests), docs/features/forums.md (route + visibility/oracle contract + new ?limit coercion note).
- Supporting evidence re-read: apps/api/src/authorization/authorization.service.ts (evaluate() for the anonymous actor). The remediation diff (post-archive) was confirmed to be EXACTLY the NaN guard: const rawLimit = query.limit; const safeLimit = Number.isFinite(rawLimit) ? rawLimit! : RECENT_TOPICS_DEFAULT_LIMIT; const limit = Math.min(MAX, Math.max(1, safeLimit)) — no other functional change to service, controller, or types.

Why specialist review was triggered:
- Planner marked CO5 'Security review: required' (decision D7): it adds a NEW public no-auth read path that surfaces forum content site-wide.
- Central risks per the plan: (1) authorization/visibility leak of non-public content; (2) an oracle (existence-disclosure, P12) of excluded boards/topics; (3) over-exposure of internal/PII fields; (4) input abuse / availability via the ?limit parameter; (5) soft-delete / project-scoped (cross-tenant) leakage.
- Pass-2 scope additionally requires confirming the pass-1 WARNING (non-finite ?limit -> 500) is resolved without a band-aid and without regressing any pass-1 PASS property.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-closeout-plan.md, section 'CO5 - Public recent forum activity API endpoint', acceptance criteria AC1-AC5 and the embedded Implementer prompt.
- P12 oracle-safety contract as established in docs/features/forums.md and the existing forums public-read surfaces (getPublicBoard / listTopics / listPosts use uniform messages and the shared isBoardPubliclyReadable predicate).
- Pass-1 archived report: artifacts/milestone-4-forums-closeout/CO5/history/verifier-1-warning/security_report.md (CONDITIONAL PASS, 0 blocking, 1 warning, 2 notes).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.service.ts:812-821 - RESOLVED (was the pass-1 WARNING). The non-finite ?limit -> qb.take(NaN) -> HTTP 500 defect is fixed by the exact guard described: const rawLimit = query.limit; const safeLimit = Number.isFinite(rawLimit) ? rawLimit! : RECENT_TOPICS_DEFAULT_LIMIT(5); const limit = Math.min(20, Math.max(1, safeLimit)).
  Number.isFinite is applied to the PARSED value (rawLimit), and the default (5) is applied BEFORE the [1,20] clamp — not a band-aid that misses an input class. Empirically verified the effective take() value is ALWAYS a finite integer in [1,20] for every input class: undefined (5), ''/whitespace -> NaN (5), 'abc' -> NaN (5), -3 (1), 0 (1), 3.9 (3), 999999 (20), 0x10 (1), '12abc' (12), 7 (7), 20 (20), direct NaN (5), Infinity (5), -Infinity (5), 3.7 (3.7, finite, not reachable over the wire because the controller parseInt(_,10) truncates to integer first). qb.take(NaN) is unreachable; the unauthenticated 500 is eliminated. The controller's parseInt(limit,10) still produces NaN for malformed input but that NaN is now neutralized by the service guard.
- apps/api/src/forums/forums.service.ts:832-833 - RESOLVED (pass-1 NOTE). The weak oracle the pass-1 NaN->500 path created (500 when >=1 public board exists, 200 {topics:[]} when none) is gone: with the guard, every input now returns 200 regardless of whether any public board exists. The early-return [] path (publicBoardIds.length === 0) is unchanged.
  The remaining distinguishable signal that mattered for P12 — excluded (members/private/project-scoped) content being indistinguishable from 'no public activity' — is preserved: excluded content never appears and the empty list is uniform. The only fact ever derivable (existence of >=1 public site board) is already openly disclosed by GET /api/forums/categories, so no new disclosure.
- apps/api/src/forums/forums.service.ts:838-847 - UNCHANGED pass-1 NOTE (not introduced by the fix, optional). leftJoinAndSelect('topic.author','author') and leftJoinAndSelect('topic.board','board') hydrate the full UserEntity (incl. email/globalRole/status) and ForumBoardEntity (incl. scopeType/projectId/visibility) into memory; the explicit per-field RecentTopicShape mapper then emits only username/displayName and board name/slug, so no sensitive column reaches the wire.
  No leak: the field-by-field mapper (not an entity spread) is the same hardening pattern used by toTopicShape/toBoardShape, and the CO5 tests assert absence of email/globalRole/id/authorUserId/boardId/isLocked/isPinned/body/replyCount/deletedAt/updatedAt and board.id/board.visibility. Purely optional future cleanup: narrow the JOINs to leftJoin + explicit addSelect of only the needed columns so sensitive columns are never read into memory. Non-blocking; forwarded to the Verifier as informational. The remediation did not change this code.

Test sufficiency assessment:
- SUFFICIENT. Grounding command run: npx pnpm@10.0.0 -C /home/tstephen/repos/worktrees/ms4a-CO5-security-20260608 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts src/forums/forums.controller.test.ts -> 2 files passed, 267 tests passed (149 service + 118 controller), 0 failed (up from pass-1's 262: 146+116, confirming the 5 new regression tests are present and green). (First attempt failed only because the worktree had no installed node_modules; ran pnpm install --frozen-lockfile, then the suites passed.)
- Targeted run: ... exec vitest run <both forums suites> -t 'malformed' -> 9 tests passed, 258 skipped, 0 failed. This includes the 5 CO5 regression tests (3 service: limit NaN/Infinity/-Infinity each resolves without throwing and asserts take() received a finite integer == 5; 2 controller: ?limit=abc and ?limit= each returns 200 {topics:[]} without throwing and delegates {limit: NaN} to the service).
- Coverage division is correct and complete: the controller regression tests mock the service (NaN-tolerance is service-layer logic) and prove the controller does not throw before delegating and passes the exact parseInt result (NaN); the SERVICE regression tests exercise the real listRecentTopics with a stubbed chainable QueryBuilder and prove take() is called with a finite integer (no take(NaN) -> 500). Together they exercise the 200/no-500 contract end to end.
- Pass-1 core-property coverage remains intact: default limit 5 / in-range / hard-cap 20; ordering lastPostAt DESC NULLS LAST then createdAt DESC; exclusion of members/private/project-scoped boards with createQueryBuilder asserted NOT called (no oracle); WHERE IN includes only public board ids; deletedAt IS NULL andWhere; early-return [] for no-boards / all-boards-excluded; public-safe RecentTopicShape with explicit absence assertions for email/globalRole/id/authorUserId/boardId/isLocked/isPinned/body/replyCount/deletedAt/updatedAt and board.id/board.visibility; lastPostAt null pass-through.

Documentation / operational guidance assessment:
- SUFFICIENT. docs/features/forums.md was updated (commit 27e50bb) to note the ?limit coercion behavior: 'Non-numeric or non-finite values (e.g. abc, empty string, NaN, Infinity) coerce to the default (5) and never produce an error.' This closes the pass-1 documentation recommendation and makes the 'always returns a stable list' guarantee accurate.
- Controller JSDoc (forums.controller.ts:175-199) and service JSDoc (forums.service.ts:789-815) accurately document the public route, the public-safe shape, the visibility/oracle (P12) contract, ordering, default/hard-cap limits, and the new NaN-guard rationale (service comment lines 813-815).
- The forums.md route table documents GET /forums/recent, its visibility/oracle contract (excluded boards never appear; uniform empty list), default 5 / hard cap 20, and the sort order — consistent with the implementation.

Artifacts written:
- artifacts/milestone-4-forums-closeout/CO5/security_report.md
- artifacts/milestone-4-forums-closeout/CO5/security_result.json

Outcome:
- PASS
