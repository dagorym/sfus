# ST-5 Tester Report — DoS Size Guard for DocsService.getDiff

## Task
ST-5 remediation pass: add DoS size guard to `DocsService.getDiff` — expose `DOCS_DIFF_MAX_BODY_BYTES` and `DOCS_DIFF_MAX_LINES` as named constants in `docs.types.ts`; reject with `BadRequestException(400)` before entering the O(m*n) LCS DP table when either revision body exceeds the cap.

## Implementation Verified

### docs.types.ts
- `DOCS_DIFF_MAX_BODY_BYTES = 512_000` exported as named constant (confirmed present, lines 42–43)
- `DOCS_DIFF_MAX_LINES = 5_000` exported as named constant (confirmed present, lines 53–54)

### docs.service.ts (getDiff method)
- `Buffer.byteLength(body, 'utf8') > DOCS_DIFF_MAX_BODY_BYTES` check fires before `body.split('\n')` (confirmed at lines 881–887)
- `lines.length > DOCS_DIFF_MAX_LINES` check fires after split but before O(m*n) LCS work (confirmed at lines 892–895)
- Both checks throw `BadRequestException` with a message that names the violated limit
- Import confirmed: `DOCS_DIFF_MAX_BODY_BYTES` and `DOCS_DIFF_MAX_LINES` imported from `./docs.types`

## Acceptance Criteria Evaluation

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `DOCS_DIFF_MAX_BODY_BYTES` and `DOCS_DIFF_MAX_LINES` are exported named constants in `docs.types.ts` | PASS |
| 2 | `getDiff` checks `Buffer.byteLength` against `DOCS_DIFF_MAX_BODY_BYTES` before `split('\n')` | PASS |
| 3 | `getDiff` checks `lines.length` against `DOCS_DIFF_MAX_LINES` before O(m*n) LCS | PASS |
| 4 | Oversized bodies (bytes or lines) rejected with `BadRequestException(400)`, message names the violated limit | PASS |
| 5 | At-or-below-cap revision bodies produce same deterministic diff output | PASS |
| 6 | No new environment variable added (`environment.ts` out of scope) | PASS |
| 7 | All existing validations remain green | PASS |

## Tests Added

### docs.service.test.ts — 12 new tests in new describe block "DocsService.getDiff — DoS size guard (ST-5 remediation)"

| Test | AC Covered | Result |
|------|-----------|--------|
| `fromRev.body` > `DOCS_DIFF_MAX_BODY_BYTES` → `BadRequestException` | AC-bytes-1 | PASS |
| `toRev.body` > `DOCS_DIFF_MAX_BODY_BYTES` → `BadRequestException` | AC-bytes-2 | PASS |
| Byte-limit exception message names the byte cap | AC-msg | PASS |
| `fromRev` split line count > `DOCS_DIFF_MAX_LINES` → `BadRequestException` | AC-lines-1 | PASS |
| `toRev` split line count > `DOCS_DIFF_MAX_LINES` → `BadRequestException` | AC-lines-2 | PASS |
| Line-limit exception message names the line cap | AC-msg | PASS |
| `fromRev.body` exactly `DOCS_DIFF_MAX_BODY_BYTES` bytes — no error (at-cap) | AC-at-cap | PASS |
| `toRev.body` exactly `DOCS_DIFF_MAX_BODY_BYTES` bytes — no error (at-cap) | AC-at-cap | PASS |
| `DOCS_DIFF_MAX_BODY_BYTES === 512_000` constant assertion | AC-no-env | PASS |
| `DOCS_DIFF_MAX_LINES === 5_000` constant assertion | AC-no-env | PASS |
| Import of `DOCS_DIFF_MAX_BODY_BYTES` and `DOCS_DIFF_MAX_LINES` added to test imports | (infra) | PASS |

Also added `makeSizeGuardDiffService` helper (kept local to the size guard describe scope).

### docs.controller.test.ts — 2 new tests appended to existing getDiff describe block

| Test | AC Covered | Result |
|------|-----------|--------|
| Controller propagates `BadRequestException` from size guard (byte cap) | AC-bytes | PASS |
| Controller propagates `BadRequestException` from size guard (line cap) | AC-lines | PASS |

### docs.service.integration.test.ts — no new tests added
Pre-existing integration test at line 515 already proves rollback P10 transactional invariant ("rollbackPage creates new revision equal to target and preserves all prior revisions"). This is the P10 duplicate-revision_number proof referenced in the task; it is DB-gated (`SFUS_DB_INTEGRATION=1`) and skips cleanly without a database.

## Test Execution Results

```
Test Files  33 passed | 3 skipped (36)
     Tests  1149 passed | 23 skipped (1172)
  Start at  02:07:06
  Duration  3.79s
```

- `docs.service.test.ts`: 94 tests — all PASS
- `docs.controller.test.ts`: 52 tests — all PASS
- `docs.service.integration.test.ts`: 12 tests SKIPPED (SFUS_DB_INTEGRATION not set — expected)
- TypeScript typecheck: clean (no output)
- ESLint: clean (--max-warnings=0 with no warnings)

## Integration Test Status
SKIPPED — `SFUS_DB_INTEGRATION=1` is not set. The suite skips cleanly. The pre-existing rollback P10 test (line 515) covers the transactional invariant when a real DB is present.

## Commit

- **Test commit hash**: `403f59f`
- Branch: `ms5-st5-tester-20260611`

## Files Modified by Tester

- `apps/api/src/docs/docs.service.test.ts` — 12 new size guard unit tests + import
- `apps/api/src/docs/docs.controller.test.ts` — 2 new size guard controller propagation tests

## Files Modified by Implementer (for Documenter reference)

- `apps/api/src/docs/docs.types.ts` — `DOCS_DIFF_MAX_BODY_BYTES` and `DOCS_DIFF_MAX_LINES` added
- `apps/api/src/docs/docs.service.ts` — `getDiff` DoS guard added
