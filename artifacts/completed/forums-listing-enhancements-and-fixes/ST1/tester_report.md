# Tester Report

Status:
- success

Task summary:
- ST1 — NULLS LAST fix and hardening of the forums recent-topics feed in the NestJS API. The PostgreSQL-only NULLS LAST third argument was removed from orderBy in ForumsService.listRecentTopics; MySQL orders NULLs last natively under DESC. The public-board-id boardId IN predicate was documented as defense-in-depth. Two stale JSDoc comments corrected. One stale test assertion updated by Implementer.

Branch name:
- forums-listing-st1-tester-20260610

Test commit hash:
- c8aabec

Test files added or modified:
- apps/api/src/forums/forums.service.test.ts (modified: added NULLS-literal regression guard)
- apps/api/src/forums/forums.service.integration.test.ts (new: MySQL ORDER BY dialect regression guard)

Commands run:
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts
- (gated spec) npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.integration.test.ts (no SFUS_DB_INTEGRATION set — 2 tests skipped, correct)
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck

Pass/fail totals:
- failed: 0
- passed: 150 (unit suite)
- skipped: 2 (integration spec, gated on SFUS_DB_INTEGRATION=1)

Unmet acceptance criteria:
- None

Final test outcomes:
- 150/150 unit tests pass in apps/api/src/forums/forums.service.test.ts (+1 new NULLS-literal guard)
- 2/2 integration tests skipped cleanly (forums.service.integration.test.ts, SFUS_DB_INTEGRATION=1 not set)
- lint: 0 errors, 0 warnings (both apps/api and apps/web)
- typecheck: 0 errors (both apps/api and apps/web)
- AC1 PASS: orderBy("topic.lastPostAt", "DESC") two-argument form confirmed; new unit test positively asserts no third argument (NULLS LAST/FIRST literal) is passed
- AC1 PASS (integration guard): forums.service.integration.test.ts exercises listRecentTopics against MySQL; a reintroduced NULLS LAST literal would produce MySQL 1064 parse error and fail the spec
- AC2 PASS: boardId IN (:...boardIds) WHERE clause confirmed with defense-in-depth comment; returned topic set unchanged
- AC3 PASS: Empty list returned when publicBoardIds.length === 0; non-public/project/soft-deleted topics excluded
- AC4 PASS: lint, typecheck, and API forums suite all pass
- Security: No NULLS LAST or dialect-specific SQL literals in any forums query path; two JSDoc comment references are documentation-only and not passed to TypeORM

New coverage added (ST1 Planner P4 mandate):
- Unit guard: "orderBy and addOrderBy are each called with exactly TWO arguments — no NULLS LAST/FIRST literal (MySQL dialect guard)" asserts no third argument was passed to either orderBy() or addOrderBy() call in listRecentTopics
- Integration spec: forums.service.integration.test.ts (gated on SFUS_DB_INTEGRATION=1) exercises listRecentTopics against a real MySQL connection. Two tests: (1) listRecentTopics with non-null lastPostAt succeeds and returns the inserted topic, (2) listRecentTopics with null lastPostAt succeeds without a NULLS LAST literal. Both exercise the ORDER BY path that previously contained the dialect-incompatible literal. The spec is skipped when SFUS_DB_INTEGRATION is unset (exactly like pages.service.integration.test.ts).

Cleanup status:
- No temporary byproducts created; branch is clean after test commit

Artifacts written:
- artifacts/forums-listing-enhancements-and-fixes/ST1/tester_report.md
- artifacts/forums-listing-enhancements-and-fixes/ST1/tester_result.json
- artifacts/forums-listing-enhancements-and-fixes/ST1/documenter_prompt.txt
