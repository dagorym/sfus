# Implementer Report — ST12

**Task:** ST12 — self-service avatar media upload resourceType + size cap  
**Branch:** ms4-st12-implementer-20260608  
**Commit:** ce9da0e  
**Status:** SUCCESS

## Summary

Added `avatar` to `ALLOWED_RESOURCE_TYPES` in `media.service.ts`. Avatar is NOT in `ADMIN_ONLY_RESOURCE_TYPES` in `media.controller.ts`, so any active session may upload for the `avatar` resourceType (self-service, like `blog-comment`). Unauthenticated requests return 401 via the existing `resolveSession` call.

Added `MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES` env var (`ApplicationEnvironment.media.avatarUploadMaxSizeBytes`) with validated range 1024–2097152 bytes. `assertValidFileSize` now accepts an optional `resourceType` parameter and applies the avatar-specific cap when `resourceType === 'avatar'`, the general cap otherwise.

ST11 magic-byte verification and SVG exclusion apply automatically through the shared `uploadImage` path — `assertValidMagicBytes` is called before `assertValidFileSize`. No duplication needed.

The `storageKey` for avatar uploads is `avatar/<uuid><ext>` via the existing resourceType prefix in `uploadImage`.

## Changed Files

- `apps/api/src/config/environment.ts` — Added `avatarUploadMaxSizeBytes` to `ApplicationEnvironment.media`; added `MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES` parsing (range 1024–2097152).
- `apps/api/src/config/environment.test.ts` — Added `MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES: "1048576"` to `createValidEnvironment()` fixture and the `toMatchObject` assertion to keep existing tests passing.
- `apps/api/src/media/media.service.ts` — Added `"avatar"` to `ALLOWED_RESOURCE_TYPES`; updated `assertValidFileSize` signature to `(sizeBytes: number, resourceType?: string)` with avatar-aware cap selection; updated `uploadImage` to pass `resourceType` to `assertValidFileSize`; updated JSDoc comment.
- `apps/api/src/media/media.controller.ts` — Updated JSDoc to reflect avatar; updated `@ApiOperation` summary.
- `apps/api/src/media/media.service.test.ts` — Added `avatarUploadMaxSizeBytes: 1 * 1024 * 1024` to `makeTestEnvironment()` fixture; updated `assertValidResourceType` test to include `"avatar"` in the allowed types list.

## Validations Run

- `pnpm lint` — passed
- `pnpm typecheck` — passed
- `pnpm test` — 521 API tests passed, 293 web tests passed
- `pnpm --filter @sfus/api run typecheck` — passed

## Acceptance Criteria Status

| Criterion | Status |
|---|---|
| avatar upload succeeds for any active session | PASS — avatar not in ADMIN_ONLY_RESOURCE_TYPES |
| 401 with no session | PASS — resolveSession throws UnauthorizedException |
| Stores under avatar/ prefix | PASS — storageKey = resourceType + '/' + uuid + ext |
| Rejects oversized avatars at the avatar cap | PASS — assertValidFileSize uses avatarUploadMaxSizeBytes for avatar |
| Magic-byte verification applies | PASS — shared assertValidMagicBytes called in uploadImage |
| SVG rejected | PASS — image/svg+xml not in allowedMimeTypes allow-list |
| MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES validated | PASS — parseInteger with range 1024–2097152 in environment.ts |

## Notes

- `MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES` must be added to `.env` files and docker-compose environments. Recommended default: `1048576` (1 MB).
- `docs/operations/launch.md` and `docs/features/media.md` updates are Documenter scope (ST12 Documentation Impact).
