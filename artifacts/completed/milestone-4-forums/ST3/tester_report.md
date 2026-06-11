# Tester Report — ST3: Leak-Proof Public Read API

## Task
ST3: leak-proof public read API for forum categories & boards.

## Testing scope
- Subtask: ST3 (milestone-4-forums)
- Branch: ms4-st3-tester-20260608
- Test files modified: `apps/api/src/forums/forums.service.test.ts`, `apps/api/src/forums/forums.controller.test.ts`
- Test commit: `2952886`

## Acceptance Criteria Validated

| Criterion | Status |
|-----------|--------|
| Listing returns only site, publicly-readable boards; project-scoped or non-readable absent from output AND counts | PASS |
| Board detail for hidden/nonexistent board returns 404 with a message identical to the nonexistent case (oracle parity) | PASS |
| Every visibility decision calls evaluate()/assertAllowed() — no inline re-derived predicates | PASS |

## Test Results

```
Test Files  27 passed | 1 skipped (28)
     Tests  660 passed | 2 skipped (662)
  Start at  04:02:58
  Duration  3.67s
```

forums.service.test.ts: 70 tests passed
forums.controller.test.ts: 54 tests passed

Typecheck: 0 errors
Lint: 0 warnings

## New Tests Added

### forums.service.test.ts (16 new tests)

**isBoardPubliclyReadable predicate tests:**
- `{scopeType:'project'}` returns false WITHOUT calling evaluate() (short-circuit — evaluate spy not called)
- `{scopeType:'site',visibility:'public'}` calls evaluate() and returns true
- `{scopeType:'site',visibility:'unlisted'}` calls evaluate() and returns true
- `{scopeType:'site',visibility:'private'}` calls evaluate() and returns false
- `{scopeType:'site',visibility:'members'}` returns false
- `{scopeType:'site',visibility:'project-only'}` returns false

**listPublicCategories leak tests:**
- project-scoped board (scopeType='project') is ABSENT from listing (board count is 0)
- boards with visibility='members', 'private', 'project-only' are each ABSENT
- site/public board APPEARS in listing
- site/unlisted board APPEARS in listing (passes evaluate for read)
- public board shape excludes scopeType, projectId, categoryId

**getPublicBoard oracle parity tests:**
- nonexistent id throws NotFoundException with message === BOARD_NOT_FOUND_MESSAGE
- project-scoped board throws NotFoundException with IDENTICAL message
- visibility='members' board throws NotFoundException with IDENTICAL message
- site/public board returns shape WITHOUT scopeType, projectId, categoryId

### forums.controller.test.ts (4 new tests)

**ST3 public routes:**
- listPublicCategories returns { categories } from service; resolveSession NOT called
- getPublicBoard returns { board } from service; resolveSession NOT called
- getPublicBoard propagates NotFoundException unchanged (2 assertions in one test)

## Test Validity Notes
- All new tests exercise behavior and response assertions (exception types, message equality, returned object shapes).
- No brittle source-text-slice assertions introduced in ST3 tests.
- All existing tests preserved.

## Commands Run
1. `pnpm --dir <worktree> install --frozen-lockfile`
2. `vitest run --root <worktree>/apps/api`
3. `pnpm --dir <worktree> typecheck`
4. `pnpm --dir <worktree> lint`
