# Tester Report — ST12: Avatar Media Upload resourceType + Size Cap

## Testing Scope

**Subtask:** ST12 — self-service avatar media upload resourceType + size cap  
**Branch:** ms4-st12-tester-20260608  
**Status:** PASS

## Acceptance Criteria and Coverage

| # | Acceptance Criterion | Status | Test Location |
|---|---|---|---|
| 1 | POST /api/media/upload?resourceType=avatar succeeds for any active session (avatar not in ADMIN_ONLY_RESOURCE_TYPES) | PASS | media.controller.test.ts — "succeeds (200) when a non-admin user uploads for avatar (self-service)" |
| 2 | 401 returned when no session | PASS | media.controller.test.ts — "throws UnauthorizedException (401) when uploading avatar with no session" |
| 3 | Stores under avatar/ prefix (storageKey = resourceType + '/' + uuid + ext) | PASS | media.service.test.ts — "accepts a valid JPEG upload for resourceType avatar and stores under avatar/ prefix" |
| 4 | Rejects oversized avatars with 400 at the avatar cap (assertValidFileSize checks avatarUploadMaxSizeBytes) | PASS | media.service.test.ts — "rejects an avatar that exceeds the avatar size cap with 400" + assertValidFileSize avatar tests |
| 5 | Magic-byte verification (ST11) applies to avatar uploads via shared uploadImage path | PASS | media.service.test.ts — "rejects a polyglot avatar (valid MIME header, non-matching magic bytes) with 400" |
| 6 | SVG rejected — image/svg+xml not in allowedMimeTypes allow-list | PASS | media.service.test.ts — "rejects an SVG avatar upload (image/svg+xml not in allow-list)" |
| 7 | New MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES env var validated in environment.ts with range 1024–2097152 | PASS | environment.test.ts — three new tests for missing, below-min, above-max, and boundary values |

## New Tests Added

### `apps/api/src/media/media.service.test.ts`
- `assertValidFileSize` suite — 4 new avatar-specific tests:
  - Accepts avatar within the 1 MB cap
  - Rejects avatar one byte over the cap (non-vacuous: over avatar cap but under general 5 MB cap)
  - Rejects with meaningful "too large" error message
  - Applies general cap for non-avatar types; avatar cap for avatar (cap differentiation)
- `MediaService.uploadImage` suite — 4 new avatar tests:
  - Accepts valid JPEG for avatar, verifies `storageKey` matches `avatar/` prefix
  - Rejects oversized avatar (1 MB + 1 byte) with BadRequestException
  - Rejects polyglot avatar (PNG bytes declared as image/jpeg) with BadRequestException
  - Rejects SVG avatar (image/svg+xml) with BadRequestException

### `apps/api/src/media/media.controller.test.ts`
- `MediaController.uploadImage authorization` suite — 3 new avatar tests:
  - 401 for avatar upload with no session
  - 200 for non-admin user uploading avatar (self-service, non-vacuous)
  - 200 for admin user uploading avatar

### `apps/api/src/config/environment.test.ts`
- 4 new tests for `MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES`:
  - Throws when missing
  - Throws when below minimum (1023)
  - Throws when above maximum (2097153)
  - Accepts at boundary values (1024 and 2097152)

## Pre-existing Coverage Confirmed

- `assertValidResourceType` already included `avatar` in allowed types (line 165)
- `assertValidMagicBytes` tests already cover SVG bytes and polyglot detection
- `environment.test.ts` happy-path already included `avatarUploadMaxSizeBytes: 1048576`

## Commands Executed

```
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @sfus/api run build
```

## Test Results

- **API tests:** 521 passed, 2 skipped (integration tests gated by SFUS_DB_INTEGRATION=1)
- **Web tests:** 293 passed
- **Total:** 814 passed, 2 skipped, 0 failed
- **Lint:** Clean (0 warnings)
- **Typecheck:** Clean
- **Build:** Clean

## Test Commit

`fbb6d7caa2173737fd309c25d7d0a6c65e02ae83`

## Files Modified by Tester

- `apps/api/src/media/media.service.test.ts`
- `apps/api/src/media/media.controller.test.ts`
- `apps/api/src/config/environment.test.ts`

## Files Modified by Implementer (for reference)

- `apps/api/src/config/environment.ts`
- `apps/api/src/config/environment.test.ts`
- `apps/api/src/media/media.service.ts`
- `apps/api/src/media/media.controller.ts`
- `apps/api/src/media/media.service.test.ts`
