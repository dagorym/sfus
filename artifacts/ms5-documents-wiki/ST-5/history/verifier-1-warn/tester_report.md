# Tester Report — ST-5: Docs History / Diff / Rollback

## Status: PASS

## Scope

Validated the ST-5 implementation against all four acceptance criteria:
- AC1: GET /api/docs/:id/history
- AC2: GET /api/docs/:id/diff + static DocsService.computeLineDiff
- AC3: POST /api/docs/:id/rollback (non-destructive, transactional)
- AC4: Rollback gated by assertDocWriteAccess (staff-only, user-role gets 403)

## Test Files Modified

- `apps/api/src/docs/docs.service.test.ts` — added ~40 new tests for ST-5 surface
- `apps/api/src/docs/docs.controller.test.ts` — added ~50 new tests for ST-5 routes
- `apps/api/src/docs/docs.service.integration.test.ts` — added 3 DB-gated integration tests

## Test Results

### Unit Suite (`pnpm --filter @sfus/api run test`)

```
Test Files  33 passed | 3 skipped (36)
     Tests  1149 passed | 23 skipped (1172)
```

All 1149 unit tests pass. 23 tests skip cleanly (SFUS_DB_INTEGRATION=1 gate — expected).

### Integration Suite

Not run (SFUS_DB_INTEGRATION=1 not set in this environment). Integration tests
skip cleanly with the correct `describe.skipIf` guard. The new integration tests
are structured to run against the real DB when the flag is set.

### Typecheck

`pnpm --filter @sfus/api exec tsc -p tsconfig.json --noEmit` — clean (no output).

### Lint

`pnpm --filter @sfus/api run lint` — clean (no warnings, no errors).

## Acceptance Criteria Coverage

### AC1: GET /api/docs/:id/history

Service tests:
- Returns `{ revisions }` ordered by revisionNumber ASC for a readable page
- Empty revisions array when page has no revisions
- Maps each revision to DocsRevisionMetaShape (revisionNumber, author, editorUsername, summary, createdAt)
- Throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for nonexistent page (oracle parity)
- Throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for deleted page (oracle parity)
- Throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for non-readable page (members visibility)
- Error message is identical for all three non-readable paths (no oracle leak)

Controller tests:
- Returns `{ history }` from service delegation
- Propagates NotFoundException from service (oracle parity)
- Returns `{ history: { revisions: [] } }` for empty page

Integration tests (DB-gated):
- getPageHistory on deleted page throws PAGE_NOT_FOUND_MESSAGE (ST-5 AC1 oracle parity)
- getPageHistory returns revisions ordered by revisionNumber ASC

### AC2: GET /api/docs/:id/diff + static computeLineDiff

Static method tests (no DB required):
- Empty hunks for identical inputs
- Single added hunk when line is appended
- Single removed hunk when line is deleted
- removed + added hunks when middle line is replaced
- Single added hunk for empty fromLines (all added)
- Single removed hunk for empty toLines (all removed)
- Empty array for two empty inputs
- Deterministic — same inputs always same output
- Adjacent same-type ops merged into single hunk
- Hunk types are only 'unchanged', 'added', or 'removed'
- Fixed-input pinning: ['hello','world'] vs ['hello','universe']

Service getDiff tests:
- Throws BadRequestException when from === to (AC2: equal revisions)
- Throws BadRequestException for non-positive integer from/to
- Throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for nonexistent/deleted/non-readable pages (oracle parity)
- Throws NotFoundException when fromRevision is missing
- Throws NotFoundException when toRevision is missing
- Returns DocsDiffShape with fromRevisionNumber, toRevisionNumber, and hunks

Controller getDiff tests:
- Returns `{ diff }` from service delegation with parsed from/to
- Throws BadRequestException when from/to query param missing
- Throws BadRequestException for non-positive integer from/to strings
- Propagates NotFoundException from service (oracle parity)
- Propagates BadRequestException from service when from === to

### AC3: POST /api/docs/:id/rollback (non-destructive, transactional)

Service rollbackPage tests:
- Returns DocWriteResultShape with new revisionNumber > target's revisionNumber
- Creates a new revision with summary='Rolled back to revision N'
- Throws BadRequestException for non-positive revisionNumber
- Throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for nonexistent page
- Throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) for deleted page
- Throws NotFoundException(PAGE_NOT_FOUND_MESSAGE) when target revision not found
- New revision body equals target revision body (non-destructive)
- Calls em.save and em.update inside transaction (P10: transactional)

Controller rollbackPage tests:
- Returns `{ page }` from service delegation
- Delegates to rollbackPage with actorUserId, pageId, and body
- Throws BadRequestException for non-integer revisionNumber (body guard)
- Throws BadRequestException for non-number revisionNumber (string coercion guard)
- Propagates NotFoundException for nonexistent page
- Propagates NotFoundException for nonexistent target revision

Integration tests (DB-gated):
- rollbackPage creates new revision equal to target content (non-destructive proof)
- All prior revisions preserved after rollback (revision 1 and 2 still present when rev 3 created)
- current_revision_id updated to new rollback revision
- summary = "Rolled back to revision 1" on the new revision

### AC4: Rollback gated by assertDocWriteAccess (user-role gets 403)

Controller tests:
- calls assertDocWriteAccess with actor globalRole and 'site' BEFORE rollbackPage
- assertDocWriteAccess is called in correct order (before rollbackPage)
- ForbiddenException (403) when assertDocWriteAccess throws (user role)
- UnauthorizedException (401) when resolveSession throws (session required)

(No inline role check exists inside rollbackPage service method — the gate is entirely
in the controller, consistent with the AC4 contract and prior write routes.)

## Integration Test Note

SFUS_DB_INTEGRATION=1 was not set. The 3 new ST-5 integration tests are structured
with `describe.skipIf(!DB_INTEGRATION_ENABLED)` and skip cleanly alongside the existing
8 integration tests. The unit suite is unaffected.

## Test Commit

26009f9 — test(docs): add ST-5 history/diff/rollback unit and integration tests
