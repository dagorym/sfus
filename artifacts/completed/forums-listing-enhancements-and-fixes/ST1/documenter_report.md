# Documenter Report — ST1

**Status:** PASS
**Branch:** forums-listing-st1-documenter-20260610
**Documentation commit:** 0ce1c336f88afc950387b7f707adda81d8c4562f
**Plan:** plans/forums-listing-enhancements-and-fixes-plan.md
**Comparison base:** main

## Task Summary

ST1 — NULLS LAST fix and hardening of the forums recent-topics feed in the NestJS API. The PostgreSQL-only `NULLS LAST` third argument was removed from `orderBy` in `ForumsService.listRecentTopics`; MySQL orders NULLs last natively under DESC. The public-board-id `boardId IN` predicate was documented as defense-in-depth. Two stale JSDoc comments corrected. One stale test assertion updated by Implementer.

## Documentation Changes

### docs/features/forums.md

Two targeted updates:

1. **Sort-order description** (Recent topics feed section, "Query parameters" block):
   - Old: `` **Sort order:** `lastPostAt DESC NULLS LAST`, then `createdAt DESC`. ``
   - New: `` **Sort order:** `lastPostAt DESC` then `createdAt DESC`. MySQL places NULL values last natively under DESC ordering; no `NULLS LAST` literal is used (it is a PostgreSQL extension that causes a MySQL 1064 parse error). ``

2. **Defense-in-depth bullet** (Visibility filtering and oracle safety section):
   - Added: `**Defense-in-depth:** the topic query additionally carries a \`boardId IN (...)\` predicate derived from the same public-board allow-list. This supplements the allow-list filter; both gates must pass for a topic to be returned.`

## No-Change Assessment

- `docs/development/testing.md` — no change needed; the integration test's opt-in gate is already documented inline in the test file header.
- `AGENTS.md` / `.myteam/` guidance files — no bootstrap or repository-wide runtime guidance changed.
- `docs/operations/` — no env variable or deployment changes.
- `docs/README.md` routing table — no new doc files added; no routing change required.

## Files Modified

**Documenter:** `docs/features/forums.md`
**Implementer:** `apps/api/src/forums/forums.service.ts`
**Tester:** `apps/api/src/forums/forums.service.test.ts`, `apps/api/src/forums/forums.service.integration.test.ts`

## Final Test Outcomes

150/150 unit tests pass; 2/2 integration tests skipped cleanly (SFUS_DB_INTEGRATION=1 not set); lint and typecheck clean.
