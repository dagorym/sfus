# Tester Report — ST6: Forum Moderation Controls (pin/lock/move)

## Testing Scope

**Subtask:** ST6 — Forum moderation controls (pin/unpin/lock/unlock/move)
**Branch:** ms4-st6-tester-20260608 (worktree from implementer branch ms4-st6-implementer-20260608, commit 026fbbd)
**Test files modified:**
- `apps/api/src/forums/forums.service.test.ts`
- `apps/api/src/forums/forums.controller.test.ts`

## Acceptance Criteria Validated

All four ST6 ACs confirmed by the new test scenarios:

**AC1: Moderation access gate — 401/403 fires before any data op (all six endpoints)**
- 401 gate: `assertModeration401FiresBeforeData` helper verifies `setPinned`/`setLocked`/`moveTopic` NOT called when `resolveSession` rejects.
- 403 gate: `assertModeration403FiresBeforeData` helper verifies data spy NOT called when `assertModerationAccess` throws.
- Covered for: pin, unpin, lock, unlock, move (all six endpoints — note move has the 400 input guard that fires BEFORE auth).

**AC2: setPinned/setLocked persist correctly; ModeratedTopicShape includes audit columns**
- `setPinned(true)` → `isPinned=true`, save called; `setPinned(false)` → `isPinned=false`, save called.
- `setLocked(true)` → `isLocked=true`, `lockedByUserId=actorUserId`, `lockedAt` is a Date instance.
- `setLocked(false)` → `isLocked=false`, `lockedByUserId=null`, `lockedAt=null`.
- `moveTopic` to valid board → `boardId` updated, `movedByUserId=actorUserId`, `movedAt` is a Date instance.
- `ModeratedTopicShape` contains `isLocked`, `boardId`, `lockedByUserId`, `lockedAt`, `movedByUserId`, `movedAt`.

**AC3: Lock integration — after setLocked(true), createPost returns 403 for non-privileged user**
- Lock integration test: topic locked via `setLocked(true)`, then `createPost` on locked topic → `ForbiddenException`; post `save` NOT called.

**AC4: moveTopic cross-scope leak prevention**
- Project-scoped destination board → `NotFoundException` with `BOARD_NOT_FOUND_MESSAGE`; `topicSaveSpy` NOT called.
- Site-scoped non-publicly-readable destination (visibility='members') → `NotFoundException`; `topicSaveSpy` NOT called; `evaluate()` spy confirmed called on destination.
- Nonexistent destination board → `NotFoundException` with `BOARD_NOT_FOUND_MESSAGE`; save NOT called.
- Valid move to readable site board → succeeds, `boardId` updated, `movedByUserId`/`movedAt` set.

**AC5 (Input Guard):** malformed `destinationBoardId` (undefined, empty string, 42, {}) → `BadRequestException` (400), NOT 500/TypeError; `moveTopic` service method NOT called.

**AC6 (Contract):** Six moderation endpoints carry correct Swagger response decorators, verified via `Reflect.getMetadata('swagger/apiResponse', handler)`:
- pin/unpin/lock/unlock: 401, 403, 404 confirmed.
- move: 400, 401, 403, 404 confirmed.

## Test Results

### Commands Run
```
npx --prefix /home/tstephen/repos/worktrees/ms4-st6-tester-20260608 vitest run \
  --root /home/tstephen/repos/worktrees/ms4-st6-tester-20260608/apps/api
pnpm --dir /home/tstephen/repos/worktrees/ms4-st6-tester-20260608 typecheck
pnpm --dir /home/tstephen/repos/worktrees/ms4-st6-tester-20260608 lint
```

### Final Results
```
Test Files  27 passed | 1 skipped (28)
     Tests  765 passed | 2 skipped (767)
Start at  06:12:10
Duration  3.34s
```

Typecheck: 0 errors.
Lint: 0 errors.

### Forums Test Files Executed (confirmed present in run)
- `src/forums/forums.controller.test.ts` (96 tests — +35 ST6 tests added)
- `src/forums/forums.service.test.ts` (133 tests — +33 ST6 tests added)
- `src/forums/forums-entities.test.ts` (9 tests)
- `src/forums/forums.module.test.ts` (3 tests)

## Test Commit

Commit hash: `b4a3ef6`
Message: `test(forums): add ST6 moderation control tests (pin/unpin/lock/unlock/move)`

## Assumptions

- Test directories inferred from repository conventions (colocated `*.test.ts` in `apps/api/src/forums/`).
- Shared artifact directory `artifacts/milestone-4-forums/ST6` taken from task prompt (repository-root-relative).
- Validation command `vitest run --root apps/api` used as specified in the coordinator procedural note.
- `reflect-metadata` import added to `forums.controller.test.ts` to enable `Reflect.getMetadata` for decorator metadata assertions. This is an existing dependency, not a new one.
