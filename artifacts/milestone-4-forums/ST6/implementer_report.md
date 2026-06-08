# Implementer Report — ST6: Forum Moderation Controls (pin/lock/move)

## Task

Milestone 4 subtask ST6: add moderator/admin endpoints to pin/unpin and lock/unlock topics, and
to move a topic to another readable board, behind `assertModerationAccess` (moderator|admin).

## Status

SUCCESS

## Branch

`ms4-st6-implementer-20260608`

## Implementation Commit

`026fbbd`

## Changed Files

- `apps/api/src/forums/forums.service.ts`
- `apps/api/src/forums/forums.controller.ts`
- `apps/api/src/forums/forums.types.ts`

## What Was Implemented

### `forums.service.ts`

1. **`assertModerationAccess(actorGlobalRole: string): void`** — mirrors `BlogService.assertModerationAccess`
   exactly: calls `authorizationService.hasGlobalRole(role, "moderator")` (which returns true for
   moderator and admin due to the role hierarchy), throws `ForbiddenException` (403) otherwise.
   Must be called after `resolveSession` (which throws 401 for no-session) so the gate always
   fires 401 → 403 before any data op.

2. **`setPinned(actorUserId, topicId, pin): Promise<ModeratedTopicShape>`** — pin/unpin a topic.
   Looks up the topic with board relation, enforces oracle-parity 404 (nonexistent == non-readable
   via `isBoardPubliclyReadable`), sets `isPinned`, saves, returns `ModeratedTopicShape`.

3. **`setLocked(actorUserId, topicId, lock): Promise<ModeratedTopicShape>`** — lock/unlock a topic.
   Same lookup/oracle-parity gate. When locking: sets `isLocked=true`, records `lockedByUserId`
   and `lockedAt` (audit). When unlocking: sets `isLocked=false`, clears audit fields.
   ST5's `createPost` already checks `topic.isLocked` and throws 403 thread-locked — this toggle
   makes that check effective (lock blocks new posts for non-privileged users).

4. **`moveTopic(actorUserId, topicId, destinationBoardId): Promise<ModeratedTopicShape>`** — move topic.
   - Input guard: `destinationBoardId` must be a non-empty string (400 if missing/non-string, not 500).
   - Source topic gate (oracle parity 404).
   - No-op if source == destination.
   - Destination board gate: loads the board and calls `isBoardPubliclyReadable(destBoard)` which
     internally calls `evaluate()` — a project-scoped or non-publicly-readable destination returns
     404 (oracle parity; cross-scope leak prevention per P12 and plan requirement).
   - Persists `boardId`, `movedByUserId`, `movedAt` (audit).

5. **`toModeratedTopicShape(topic): ModeratedTopicShape`** — private mapper returning the
   moderation-enriched shape (includes `isLocked`, `boardId`, audit columns) returned only to
   moderators/admins.

### `forums.types.ts`

Added:
- `ModeratedTopicShape` — moderation-enriched topic response including `isLocked`, `boardId`,
  `lockedByUserId`, `lockedAt`, `movedByUserId`, `movedAt`, `isPinned`, `replyCount`, etc.
- `MoveTopicInput` — `{ destinationBoardId: string }`.

### `forums.controller.ts`

Six new PATCH endpoints under `/forums/moderation/topics/:topicId/{pin,unpin,lock,unlock,move}`:

All six follow the exact security pattern:
1. `resolveSession` → 401 (no session)
2. `assertModerationAccess` → 403 (non-moderator/admin)
3. Service call → data operation

Move endpoint has an additional controller-level input guard: if `body?.destinationBoardId` is not
a non-empty string, returns 400 before the auth calls. (The service also guards, so 400 fires
even if the controller guard were absent — defence in depth.)

Swagger/JSDoc added for all six endpoints documenting the full status contract (400/401/403/404).

## Security Properties

- **401/403 before data op**: session gate (`resolveSession`) fires before the access gate
  (`assertModerationAccess`), which fires before any repository call. All six endpoints verified.
- **Cross-scope move leak (P12)**: `moveTopic` re-validates the destination board through
  `isBoardPubliclyReadable` which calls `evaluate()` on the anonymous actor. A project-scoped
  or non-publicly-readable destination returns 404 — cannot be used to leak a topic into
  a restricted scope.
- **Oracle parity**: source topic 404 is the same message for nonexistent and non-readable topics.
  Destination board 404 is the same message for nonexistent and non-readable boards.
- **Lock semantic**: `setLocked(true)` sets `topic.isLocked = true`. ST5's `createPost` already
  returns `403 thread-locked` when `topic.isLocked` is true — the toggle makes the lock effective.
- **No global ValidationPipe**: malformed `destinationBoardId` is guarded explicitly (400, not 500).

## Validation Results

Commands run:
- `pnpm --dir <worktree> install --frozen-lockfile` — success
- `pnpm --dir <worktree> typecheck` — PASS (0 errors)
- `pnpm --dir <worktree> lint` — PASS (0 warnings)
- `vitest run --root apps/api` — PASS: 709 tests passed, 2 skipped; forums tests included:
  - `forums.controller.test.ts`: 61 tests
  - `forums.service.test.ts`: 112 tests
- `pnpm --dir apps/api typecheck` — PASS (0 errors, API-only build)

## Artifact Directory

`artifacts/milestone-4-forums/ST6/`
