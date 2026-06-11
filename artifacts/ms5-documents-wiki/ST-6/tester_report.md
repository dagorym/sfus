# Tester Report — ST-6 Remediation Pass 1

**Stage**: Tester  
**Branch**: ms5-st6-tester-20260611  
**Substantive commit**: 9481932  
**Date**: 2026-06-11  
**Result**: PASS — all validations green

---

## Scope

Remediation pass 1 addressed three findings from the Verifier-1 FAIL:

| Finding | Severity | Description |
|---------|----------|-------------|
| BLOCKING-1 | BLOCKING | JsonExceptionFilter did not forward `details` from HttpException body to `error.details` in JSON response |
| BLOCKING-2 | BLOCKING | `acquireLock` controller returned nested `{ result: { pageId, lock } }` instead of flat `{ pageId, lock }` |
| WARNING-1 | WARNING | `softDeletePage` ran un-transactionally; in-transaction lock check (AC6 integration guarantee) was missing |

---

## Test work performed

### BLOCKING-1 — JsonExceptionFilter HTTP-layer tests (new file)

Created `apps/api/src/common/filters/json-exception.filter.test.ts` with 11 tests:

1. `emits error.details.lockedByUserId and error.details.lockExpiresAt when ConflictException body carries a details object (AC2)`
2. `statusCode in error envelope matches HTTP status 409 for ConflictException (AC2)`
3. `does NOT include error.details when ConflictException has no details field (plain message body)`
4. `does NOT include error.details when ConflictException body is an object without a details key`
5. `does NOT include error.details when NotFoundException body has no details key`
6. `emits correct status and message for a plain NotFoundException`
7. `includes request envelope with correlationId, method, path, and timestamp fields`
8. `returns 500 for a plain Error (not an HttpException)`
9. `does NOT include error.details for a plain Error`
10. `returns 500 for a thrown non-Error value (e.g. a plain string)`
11. `passes through details object for a custom HttpException subclass with details (generic test)`

**All 11 pass.**

### BLOCKING-2 — acquireLock flat shape

Pre-existing controller test at `src/docs/docs.controller.test.ts` line 1215 already asserts the flat `{ pageId, lock: DocsLockState }` shape. No additional test work needed; confirmed passing.

### WARNING-1 — softDeletePage in-transaction lock check

The implementer updated the AC6 test (`softDeletePage throws 409 when page is locked by another user`) to use the transaction-manager pattern. Confirmed passing.

**Regression fix**: The WARNING-1 fix (wrapping `softDeletePage` in `manager.transaction`) caused 8 pre-existing ST-4 tests to fail because `makeSoftDeleteDocsService` provided `manager: undefined`. Updated the helper and two inline test stubs to supply a proper `manager.transaction` mock. All 8 tests restored to passing.

**Lint fix**: Two pre-existing lint errors in `docs.service.test.ts` were corrected as part of the test file edits:
- Line ~2390: replaced `require("@nestjs/common")` with the already-imported `ConflictException`
- Line ~2727: removed unused `lastRevSpy` variable

---

## Validation results

| Check | Result |
|-------|--------|
| `pnpm --filter @sfus/api test` | 1287 passed, 0 failed, 30 skipped |
| `pnpm --filter @sfus/api run lint` | PASS (0 errors, 0 warnings) |
| `pnpm --filter @sfus/api run typecheck` | PASS |
| `pnpm --filter @sfus/api run build` | PASS |

Test suite baseline before tester work: 1276 passed (from prior run). After: 1287 passed (+11 from new filter tests; +0 net regression).

---

## Files changed

| File | Type | Change |
|------|------|--------|
| `apps/api/src/common/filters/json-exception.filter.test.ts` | New | 11 HTTP-layer tests for JsonExceptionFilter |
| `apps/api/src/docs/docs.service.test.ts` | Modified | Updated `makeSoftDeleteDocsService` and two inline stubs to use `manager.transaction`; fixed 2 lint errors |

---

## Handoff

Ready for Documenter. See `documenter_prompt.txt` for instructions.
