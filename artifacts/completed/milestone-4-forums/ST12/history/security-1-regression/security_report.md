Security Review Report

Scope reviewed:
- Milestone 4 ST12: self-service `avatar` media upload resourceType + tighter avatar size cap.
- Change set reviewed vs base ms4: apps/api/src/media/media.service.ts (avatar in ALLOWED_RESOURCE_TYPES; assertValidFileSize(resourceType) applying avatarUploadMaxSizeBytes; avatar/ storage prefix), apps/api/src/media/media.controller.ts (avatar NOT in ADMIN_ONLY_RESOURCE_TYPES; 401-no-session path), apps/api/src/config/environment.ts (MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES validation, range 1024-2097152), plus tests and docs.
- Validations run from this worktree after pnpm install --frozen-lockfile: pnpm --dir apps/api run lint (PASS), run typecheck (FAIL - 4 errors), run test (FAIL - 6 of 538 tests).
- Five required concerns assessed: authorization, magic-byte+SVG, size cap/DoS, storage/path, ownership note.

Why specialist review was triggered:
- Plan Risk R7 (Avatar upload abuse / ownership confusion): ST12 opens a NEW self-service upload surface - any authenticated (non-admin) user may upload an avatar, unlike the admin-gated blog-post/standalone-page surfaces. New upload surfaces are abuse vectors and must be confirmed properly constrained.
- Pattern P7 (partial-breadth fixes): a guarantee (magic-byte/SVG exclusion, and now a required env field) applied at one site but missed at sibling sites. The review must confirm no resourceType bypasses the shared content check and that the new required field did not break sibling fixtures.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md - ST12 (lines 348-364) and Risk R7 (lines 580-582).
- docs/features/media.md - media upload contract (avatar resourceType + self-service auth + dual size limits).
- docs/development/agent-retrospective-patterns.md - P7 partial-breadth fixes (lines 126-142).

Findings

BLOCKING
- None

WARNING
- apps/api/src/common/throttle/throttle-env.test.ts:39-41 - ST12 added a NEW required env field (MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES) to loadEnvironment but did not update sibling environment fixtures, so the API test suite now fails (6 of 538 tests) and the API typecheck fails (4 errors).
  loadEnvironment fails closed (environment.ts:255-256 throws on any missing/invalid var). The throttle-env.test.ts base env helper (lines 39-41) sets MEDIA_UPLOAD_MAX_SIZE_BYTES but omits MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES, so 6 tests now throw 'MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES is required.' Separately, 4 fixtures that build the media env object omit the now-required avatarUploadMaxSizeBytes field, breaking typecheck: apps/api/src/auth/auth.controller.test.ts:11, apps/api/src/auth/auth.service.test.ts:103, apps/api/src/database/database.config.test.ts:15, apps/api/src/health/readiness.service.test.ts:11. Not a security hole in the avatar surface itself, but a verifier-blocking regression introduced by this change set: a red typecheck/test suite must not merge. Remediation: add MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES to the throttle-env.test.ts base env and avatarUploadMaxSizeBytes to the four media-env fixtures.
- apps/api/.env.example:29-37 - The git-tracked env contract files do not declare MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES. Because env validation fails closed, deploying/booting the API against these files as-is would crash at startup.
  apps/api/.env.example (lines 29-37) and apps/api/.env (line 40) both set MEDIA_UPLOAD_MAX_SIZE_BYTES but neither sets MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES. loadEnvironment requires it (environment.ts:203-208) and throws when absent, so any environment seeded from these tracked files fails to boot. This matches the known deploy-env-drift failure mode (post-milestone 'can't login/register' = crashed API from a missing env var). docs/operations/launch.md and docs/features/media.md were correctly updated to document the var, but the seed env files were not. Remediation: add MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES (recommended 1048576) to apps/api/.env.example and apps/api/.env. Fail-closed behavior itself is correct and desirable; the gap is the missing seed value.

NOTE
- apps/api/src/media/media.service.ts:86-96 - ST12 records the uploader as ownerUserId on the media_references row, which is exactly what ST15 needs for ownership enforcement. No ownership-confusion risk is created by ST12.
  uploadImage persists ownerUserId from session.user.id (controller media.controller.ts:109-110 passes session.user.id), and the entity indexes owner_user_id (media-reference.entity.ts:7,12). ST12 does NOT bind the avatar to any user (that is ST15). Expectation ST15 MUST uphold (per plan ST15 ACs, lines 401-414): the set-avatar API must verify the supplied media id both has resourceType='avatar' AND ownerUserId === the calling user before setting users.avatar_media_id, else a user could claim another user's uploaded media as their avatar.
- apps/api/src/media/media.controller.ts:57-74 - The avatar size cap is enforced in the service AFTER multer has buffered the full request body into memory (multer hard cap: 20 MB). The service-level avatar cap (<=2 MB) is applied after the buffer is read, and after MIME + magic-byte checks.
  This is pre-existing behavior for ALL resourceTypes (not introduced by ST12) and is bounded by multer's 20 MB request-size hard cap, so peak memory per upload is bounded and the abuse window is small. The avatar cap correctly rejects oversized avatars with 400 and is tighter than the general cap (avatar max 2 MB vs general default 5 MB / ceiling 20 MB). Order is MIME -> magic-byte -> size -> resourceType in uploadImage; all run before any disk write or DB insert, so no partial-write or persistence occurs for a rejected avatar. No new abuse window is introduced by ST12. Optional hardening (not required for ST12): set the multer per-request limit closer to the largest configured cap, or pass a resourceType-aware limit, to reject oversized avatar bodies before fully buffering.
- apps/api/src/media/media.service.ts:66-107 - Authorization, magic-byte/SVG exclusion, and storage-key construction for the avatar surface are all correctly constrained; no security defect found in the avatar upload path.
  AUTHORIZATION: media.controller.ts awaits authService.resolveSession first; resolveSession (auth.service.ts:555-593) throws 401 for missing/inactive/revoked/expired sessions, so avatar requires an ACTIVE session. avatar is correctly self-service (NOT in ADMIN_ONLY_RESOURCE_TYPES = [blog-post, standalone-page], media.controller.ts:39); the admin gate on blog-post/standalone-page is unchanged and avatar-self-service is the only authorization change. MAGIC-BYTE+SVG: there is exactly one upload path (uploadImage); assertValidMagicBytes runs unconditionally (media.service.ts:73) before any resourceType branching, so no resourceType (including avatar) can bypass it; SVG (image/svg+xml) is excluded from both the MIME allow-list and magic-byte signatures; tests confirm polyglot avatar -> 400 and SVG avatar -> 400. STORAGE/PATH: storageKey = `${resourceType}/${uuid}${ext}` where resourceType is from a fixed allow-list (validated in both controller and service), uuid is server-generated (randomUUID), and ext is from a fixed MIME->ext map; no user-controlled path component, no traversal; the serve path adds a storage-root containment check (media.service.ts:128-132). ENV FAIL-CLOSED: MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES is range-validated 1024-2097152 and missing/invalid values abort startup (environment.ts:255-256); environment.test.ts adds missing/below-min/above-max/boundary cases.

Test sufficiency assessment:
- Avatar-surface security behavior IS well covered: media.controller.test.ts adds avatar 401-no-session, non-admin self-service success, and admin success; media.service.test.ts adds avatar/ prefix, oversized-avatar -> 400, polyglot-avatar -> 400, SVG-avatar -> 400, and a test confirming the GENERAL cap (not the avatar cap) applies to non-avatar types; environment.test.ts adds missing/below-min/above-max/boundary validation for the avatar cap.
- However, the suite does NOT pass on this branch: 6 of 538 API tests fail and the API typecheck reports 4 errors, all because ST12 added a required env field without updating sibling environment fixtures (see WARNING findings). Per role policy, absence of green tests is treated as a real gap; the change set must restore a green typecheck + test suite before merge.

Documentation / operational guidance assessment:
- docs/features/media.md correctly documents the avatar resourceType, self-service auth, dual size limits, and that magic-byte/SVG exclusion applies to avatar.
- docs/operations/launch.md correctly documents MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES (range 1024-2097152, recommended 1048576).
- Gap: the git-tracked seed env files (apps/api/.env.example, apps/api/.env) were not updated with the new required var, so operators following the env contract files would hit a fail-closed startup crash (see WARNING finding).

Artifacts written:
- artifacts/milestone-4-forums/ST12/security_report.md
- artifacts/milestone-4-forums/ST12/security_result.json

Outcome:
- CONDITIONAL PASS
