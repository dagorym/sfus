# ST15 — Implementer Report: Set/Remove-Avatar API with Ownership Enforcement

## Summary

Implemented the self-service set/remove-avatar API (ST15) adding two endpoints
to `UsersController`:

- `PUT /users/me/avatar` — binds a `media_references` id as the caller's avatar
- `DELETE /users/me/avatar` — clears the caller's `avatar_media_id`

## Route Home

**`apps/api/src/users/users.controller.ts`** — confirmed as the correct home.
ST14 already established `UsersController` as the self-service user-profile
surface. Adding avatar endpoints here avoids introducing a `MediaReferenceEntity`
dependency into `AuthService` (which would be out of scope and would require
auth.module.ts changes). The `PATCH /auth/profile` / `GET /auth/settings`
surface in `auth.controller.ts` is owned by `AuthService` and not appropriate
for this media-ownership validation logic.

## Changed Files

| File | Change |
|------|--------|
| `apps/api/src/users/users.controller.ts` | Added `PUT me/avatar` and `DELETE me/avatar` endpoints (ST15) |
| `apps/api/src/users/users.service.ts` | Added `setAvatar()` and `removeAvatar()` methods; injected `MediaReferenceEntity` repository |
| `apps/api/src/users/users.types.ts` | Added `SetAvatarBody`, `SetAvatarResponse`, `RemoveAvatarResponse` types |
| `apps/api/src/users/users.module.ts` | Added `MediaReferenceEntity` to `TypeOrmModule.forFeature` (static + dynamic forms) — required adjacent file per P7 |
| `apps/api/src/users/users.service.test.ts` | Updated 14 existing ST14 test fixtures to pass second arg to `new UsersService()` after constructor change (P7) |

## Security Implementation

### Set-avatar ownership enforcement

`UsersService.setAvatar(callerId, mediaId)` performs a single repository query
filtering on all three ownership conditions simultaneously:

```
WHERE id = mediaId AND resourceType = 'avatar' AND ownerUserId = callerId
```

This provides **oracle parity**: a uniform `ForbiddenException` with the same
message is thrown for all three not-allowed cases:
- Media id does not exist
- Media id exists but `resourceType !== 'avatar'`
- Media id exists and is avatar-type but belongs to a different user

A caller cannot determine from the error response whether a foreign media id
exists at all.

### Request handling order

```
SET: 400 (malformed body) → 401 (no session) → 403 (not-allowed media) → persist
DEL: 401 (no session) → clear
```

### Remove avatar

`removeAvatar()` calls `usersRepository.update({ id: callerId }, { avatarMediaId: null })`,
which is a safe in-place clear requiring only a valid session.

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| Set-avatar rejects (400) missing/non-string mediaId | ✓ 400 guard before session check |
| Set-avatar rejects (403) nonexistent media id | ✓ Uniform ForbiddenException |
| Set-avatar rejects (403) wrong resourceType | ✓ Uniform ForbiddenException |
| Set-avatar rejects (403) foreign owner's media id | ✓ Uniform ForbiddenException (key security requirement) |
| Set-avatar success: avatar_media_id persists | ✓ `usersRepository.update()` called; avatarUrl returned |
| Set-avatar shows in profile (ST14) | ✓ avatar_media_id → `/api/media/<id>` in `findPublicProfile` |
| Remove clears avatar_media_id | ✓ Update to null |
| Session required (401 otherwise) | ✓ `authService.resolveSession()` called first in both handlers |
| Foreign media id must not become someone's avatar | ✓ ownerUserId === callerId enforced in single WHERE clause |

## Validation Results

Commands run:
- `pnpm --dir <worktree> install --frozen-lockfile` — OK
- `pnpm --dir <worktree> typecheck` — PASS (0 errors)
- `pnpm --dir <worktree> lint` — PASS (0 warnings)
- `vitest run --root apps/api` — PASS (832 tests, 2 skipped)
- API `tsc -p tsconfig.json --noEmit` — PASS (0 errors)

## Implementation Commit

`ddf22c1`

## Artifact Directory

`artifacts/milestone-4-forums/ST15/`
