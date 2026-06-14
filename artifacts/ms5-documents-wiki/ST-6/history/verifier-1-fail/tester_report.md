# Tester Report

Status:
- success

Task summary:
- ST-6: Docs soft-lock — validated acquireLock, releaseLock, assertNotForeignLocked, lock endpoints (POST/DELETE /api/docs/:id/lock), toPageShape lock field, write-path guards, and DOCS_LOCK_TTL_MINUTES environment parsing. All 11 acceptance criteria covered. 252 unit tests pass; 15 integration tests skipped (DB not available).

Branch name:
- ms5-st6-tester-20260611

Test commit hash:
- 5a0d43b

Test files added or modified:
- apps/api/src/config/environment.test.ts
- apps/api/src/docs/docs.controller.test.ts
- apps/api/src/docs/docs.service.integration.test.ts
- apps/api/src/docs/docs.service.test.ts

Commands run:
- npx --prefix /home/tstephen/repos/worktrees/ms5-st6-tester-20260611 vitest run apps/api/src/docs/ apps/api/src/config/

Pass/fail totals:
- fail: 0
- pass: 252
- skip: 15
- total: 267

Unmet acceptance criteria:
- None

Final test outcomes:
- 252 tests pass, 0 failures, 15 skipped (integration tests gated by SFUS_DB_INTEGRATION=1)
- AC1 covered: acquireLock returns 200 with pageId+lock shape; re-acquire refreshes TTL
- AC2 covered: acquireLock returns 409 ConflictException for active foreign lock
- AC3 covered: releaseLock returns 204 for holder; idempotent when already unlocked
- AC4 covered: admin/moderator staff override releases any lock (204)
- AC5 covered: non-holder non-staff gets ForbiddenException (403)
- AC6 covered: addRevision/renamePage/softDeletePage/rollbackPage each call assertNotForeignLocked and yield 409 on active foreign lock
- AC7 covered: expired lock (lockExpiresAt <= now) is treated as free; write proceeds
- AC8 covered: admin/moderator roles bypass lock check (isActiveForeignLock returns false for staff)
- AC9 covered: DOCS_LOCK_TTL_MINUTES absent=30, valid range 1-1440 used, invalid/OOR=30+error
- AC10 covered: toPageShape includes lock field; active/inactive/null states verified
- AC11 covered: both lock endpoints call assertDocWriteAccess before acquireLock/releaseLock
- Integration tests: structured with describe.skipIf(!DB_INTEGRATION_ENABLED) block; SKIPPED (no DB)

Cleanup status:
- No byproduct files found outside test and artifact paths

Artifacts written:
- artifacts/ms5-documents-wiki/ST-6/tester_report.md
- artifacts/ms5-documents-wiki/ST-6/tester_result.json
- artifacts/ms5-documents-wiki/ST-6/documenter_prompt.txt
