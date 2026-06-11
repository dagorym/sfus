Security Review Report

Scope reviewed:
- Specialist security review of ST1 of the forums-listing-enhancements-and-fixes plan, scoped to the public forums data-isolation boundary of the recent-topics feed (ForumsService.listRecentTopics, GET /api/forums/recent).
- Reviewed only the ST1 change set on this branch via `git diff main...HEAD`: apps/api/src/forums/forums.service.ts (listRecentTopics orderBy change + comment corrections), apps/api/src/forums/forums.service.test.ts (NULLS-literal regression assertions), apps/api/src/forums/forums.service.integration.test.ts (new opt-in MySQL-backed dialect regression spec), and docs/features/forums.md (ordering + defense-in-depth note).
- Cross-checked the surrounding (unchanged) visibility gate isBoardPubliclyReadable and the sibling listTopics ordering path to confirm no dialect literal or widening leaked elsewhere.
- Validation run: forums.service.test.ts 150/150 pass; `pnpm lint` clean; `pnpm typecheck` clean (dependencies installed + esbuild rebuilt in the worktree first).

Why specialist review was triggered:
- Plan decision P1 marks ST1 for specialist Security review because it touches the public forums data-isolation boundary: the recent feed must only ever surface activity from PUBLIC, site-scoped boards.
- The change (a) removed a PostgreSQL-only `NULLS LAST` ORDER BY literal that caused a MySQL 1064 parse error (HTTP 500), and (b) re-frames the recent-feed query's public-board-id predicate as an explicit defense-in-depth layer alongside the isBoardPubliclyReadable allow-list. Both touch a query path that, if widened, could leak existence/count/authorship/timing of non-public, members-only, or project-scoped board activity to anonymous callers.

Acceptance criteria / plan reference:
- plans/forums-listing-enhancements-and-fixes-plan.md — ST1 section (lines ~129-201) and Planner decisions P1/P2/P4.
- Task-supplied security acceptance criteria: no dialect/injectable SQL literal remains; the recent-feed query returns exactly the same topic set for any actor (tightening, never widening); non-public/members-only/project-scoped boards and soft-deleted topics remain excluded; empty-list path leaks nothing; no oracle/enumeration leak; tests do not weaken or bypass visibility checks.

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.service.ts:845 - The `where("topic.boardId IN (:...boardIds)")` defense-in-depth predicate already existed in main; ST1's only non-comment executable change is removing the third `"NULLS LAST"` argument from .orderBy(). The 'added a defense-in-depth predicate' framing is, in code terms, a comment/documentation clarification of a pre-existing predicate, not a new SQL predicate.
  This is the strongest possible security outcome for the no-widening criterion: the visibility-relevant SQL (allow-list filter, boardId IN bound predicate, deletedAt IS NULL, empty-list short-circuit, public-safe output shape) is byte-for-byte identical to main, so it is structurally impossible for ST1 to have widened visibility. Recorded for Verifier/Reviewer accuracy of the change narrative; no action required.
- apps/api/src/forums/forums.service.integration.test.ts:73 - The new MySQL-backed integration spec is a dialect/positive-path regression guard (executes listRecentTopics without a 1064 error and confirms an inserted public-board topic appears, for both non-null and all-null lastPostAt). It does not add a MySQL-backed negative visibility case (e.g. a members/private or project-scoped board's topic being excluded).
  Not a defect: the visibility-exclusion oracle is covered at the mocked-unit level (the untouched AC2 'excludes non-public boards' suite) and the visibility code is unchanged by ST1, so DB-level negative coverage is not required to discharge ST1. Logged as an informational opportunity for future hardening, not a blocker.

Test sufficiency assessment:
- SUFFICIENT for the security-sensitive behavior of ST1.
- Unit suite forums.service.test.ts: 150/150 pass. The diff only (a) updates the prior ordering assertion from a 3-arg .orderBy(...,"NULLS LAST") to the 2-arg form, and (b) adds a positive regression guard asserting orderBy/addOrderBy are each called exactly once with exactly two arguments (third arg undefined) — catching any reintroduction of a NULLS LAST/FIRST NullsOrder literal at the mocked-unit level.
- The pre-existing visibility-exclusion coverage (CO5 AC2 'excludes non-public boards', empty-list/no-public-activity, public-safe shape) is untouched and was not weakened or bypassed by the diff.
- New integration spec forums.service.integration.test.ts is opt-in gated by SFUS_DB_INTEGRATION=1 and skips cleanly otherwise (default `test` gate unaffected). It instantiates the real ForumsService with a real AuthorizationService and real repositories against a genuinely public site-scoped board — it does not stub or bypass isBoardPubliclyReadable. This is the correct dialect-level regression guard for the 1064 defect.
- Residual gap is non-blocking (see NOTE on integration negative coverage).

Documentation / operational guidance assessment:
- SUFFICIENT.
- docs/features/forums.md now states the sort order as `lastPostAt DESC` then `createdAt DESC`, explicitly notes MySQL orders NULLs last natively under DESC, and explains that `NULLS LAST` is a PostgreSQL extension that causes a MySQL 1064 parse error — accurately capturing the root cause and the fix.
- The doc adds an explicit Defense-in-depth bullet describing the boardId IN (...) predicate as supplementing the isBoardPubliclyReadable allow-list (both gates must pass), and retains the oracle-parity statement that the no-public-boards path returns [] without issuing a query so callers cannot infer excluded boards/topics.
- In-code comments at ~lines 806 and 837-840 were corrected to match (removing the stale '(NULLS LAST)' wording). No operational/runbook gap relevant to this change.

Artifacts written:
- artifacts/forums-listing-enhancements-and-fixes/ST1/security_report.md
- artifacts/forums-listing-enhancements-and-fixes/ST1/security_result.json

Outcome:
- PASS
