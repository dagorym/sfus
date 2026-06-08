Security Review Report

Scope reviewed:
- Pass-2 (re-review) of Milestone 4 ST12: self-service `avatar` media upload resourceType + tighter avatar size cap, after a Security-driven remediation of the two pass-1 (CONDITIONAL PASS) non-security regressions.
- Remediation commit reviewed: 5cb22bd 'fix(ST12): add avatarUploadMaxSizeBytes to test fixtures and env seed files' — 7 files changed, 8 insertions, 0 deletions; NO surface/production code touched.
- Surface re-confirmed unchanged: apps/api/src/media/media.service.ts (avatar in ALLOWED_RESOURCE_TYPES; assertValidMagicBytes runs unconditionally before resourceType branching; assertValidFileSize applies avatarUploadMaxSizeBytes for avatar; avatar/ storage-key prefix; ownerUserId persisted from session), apps/api/src/media/media.controller.ts (avatar NOT in ADMIN_ONLY_RESOURCE_TYPES; resolveSession 401 gate; admin gate on blog-post/standalone-page intact; ownerUserId = session.user.id), apps/api/src/config/environment.ts (MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES range-validated 1024-2097152, fail-closed).
- Validations run from this worktree after pnpm install --frozen-lockfile (node_modules was absent): root lint (PASS, clean), root typecheck both apps (PASS, 0 errors), apps/api typecheck (PASS, 0 errors), root test (PASS — API 536 passed + 2 skipped = 538, web 293 passed = 829 total, 0 failures), root build both apps (PASS — api tsc Done, web compiled successfully).
- P7 breadth sweep performed across apps/api/src for every fixture that builds a media env object or env-string set.

Why specialist review was triggered:
- Plan Risk R7 (Avatar upload abuse / ownership confusion): ST12 opens a NEW self-service upload surface — any authenticated (non-admin) session may upload an avatar, unlike the admin-gated blog-post/standalone-page surfaces. A second security pass must confirm the surface remained secure and the remediation did not relax any control or alter feature behavior.
- Pattern P7 (partial-breadth fixes): pass-1 flagged the new required env field added to the type but missing from sibling fixtures (causing 4 typecheck errors + 6 test failures). This pass must confirm the breadth fix is COMPLETE (not partial again) and that the fail-closed env seed gap is closed.
- Policy: this is the SECOND security pass; a FAIL here stops the subtask for a user decision, so the verdict must be precise. A red typecheck/test suite or a fail-closed boot footgun is treated as a real, merge-blocking gap even though it is not an avatar-surface exploit.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST12 (lines 348-364) and Risk R7 (lines 580-582).
- docs/features/media.md — avatar resourceType + self-service auth + dual size limits + magic-byte/SVG-exclusion.
- docs/operations/launch.md — MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES env var (range 1024-2097152, recommended 1048576).
- Pass-1 artifacts preserved at artifacts/milestone-4-forums/ST12/history/security-1-regression/ (CONDITIONAL PASS: 0 blocking, 2 warning, 3 note).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/common/throttle/throttle-env.test.ts, apps/api/src/auth/auth.controller.test.ts, apps/api/src/auth/auth.service.test.ts, apps/api/src/database/database.config.test.ts, apps/api/src/health/readiness.service.test.ts - RESOLVED — pass-1 WARNING (a) partial-breadth (P7) miss is fully fixed. The 5 affected sibling fixtures now set the now-required field/var, and the typecheck + full test suite are green.
  All 5 fixtures were updated additively: the 4 media-env object literals (auth.controller.test.ts:13, auth.service.test.ts:105, database.config.test.ts:17, readiness.service.test.ts:13) now include avatarUploadMaxSizeBytes: 1048576, and the throttle-env.test.ts env-string helper (line 40) now sets MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES: '1048576'. P7 BREADTH SWEEP (complete, not partial): every `media: {` object literal in apps/api/src (8 total = the environment.ts type def + environment.ts return + 6 fixtures) carries avatarUploadMaxSizeBytes, and all 3 env-string fixtures (environment.test.ts, throttle-env.test.ts, plus environment.test.ts inline override cases) carry MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES. The two remaining environment references (forums.module.test.ts and index.test.ts) build the env via `as never` casts or a mocked loadEnvironment returning state.environment, so they are not type-checked against the full shape and correctly need no change. Verified results from this worktree: apps/api typecheck 0 errors; root typecheck 0 errors both apps; full suite 829 pass (536 API + 2 skipped, 293 web), 0 failures — the previously failing 6 tests now pass.
- apps/api/.env, apps/api/.env.example - RESOLVED — pass-1 WARNING (b) fail-closed seed gap is fixed. Both tracked env files now declare MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES=1048576, eliminating the boot-crash footgun.
  environment.ts fails closed (throws when MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES is missing/invalid), so an environment seeded from the tracked files previously crashed at startup. apps/api/.env:41 and apps/api/.env.example:37 now both set the var to 1048576, which is inside the validated range (1024-2097152) and matches the docs/operations/launch.md and docs/features/media.md recommendation, so a fresh boot from the seed files succeeds. The desirable fail-closed validation itself was not weakened — only the missing seed value was supplied.
- apps/api/src/media/media.controller.ts:39-107 - Avatar upload authorization is unchanged and correct: 401 without a session, any active session may upload an avatar (self-service), and the admin gate on blog-post/standalone-page is intact.
  resolveSession is awaited first and throws 401 for missing/inactive/revoked/expired sessions. avatar is correctly absent from ADMIN_ONLY_RESOURCE_TYPES = [blog-post, standalone-page] (line 39), so avatar is self-service while the admin gate (lines 100-107) still rejects non-admins for blog-post/standalone-page with 403. The remediation did not touch this file. Tests confirm: avatar 401-no-session (media.controller.test.ts:184), non-admin avatar success (195), admin avatar success (208), and non-admin blog-post/standalone-page 403 (110, 122) — all green.
- apps/api/src/media/media.service.ts:66-197 - ST11 magic-byte verification + SVG exclusion still apply to avatar, and the tighter avatar size cap is enforced. Unchanged by the remediation.
  There is exactly one upload path (uploadImage); assertValidMagicBytes (line 73) runs unconditionally before any resourceType branching, so no resourceType — including avatar — can bypass the content check. SVG (image/svg+xml) is excluded from both the MIME allow-list and the magic-byte signatures. assertValidFileSize (lines 180-189) applies avatarUploadMaxSizeBytes for resourceType 'avatar' and the general uploadMaxSizeBytes otherwise. Storage key is `${resourceType}/${uuid}${ext}` from a fixed allow-list + server-generated UUID + fixed MIME->ext map (no user-controlled path component). Tests confirm avatar/ prefix (service.test.ts:412), oversized-avatar 400 (422), polyglot-avatar 400 (433), SVG-avatar 400 (445), and that the general cap (not the avatar cap) applies to non-avatar types (183-189) — all green.
- apps/api/src/media/media.service.ts:86-96 - ownerUserId is still recorded from the session on the media_references row, supplying what ST15 needs for avatar-ownership enforcement. ST12 itself creates no ownership-confusion risk.
  uploadImage persists ownerUserId (controller passes session.user.id at media.controller.ts:110). ST12 does NOT bind an avatar to any user (that is ST15). The downstream obligation ST15 MUST uphold (plan ST15 ACs, lines 401-414): set-avatar must verify the supplied media id has resourceType='avatar' AND ownerUserId === the caller before setting users.avatar_media_id, else a user could claim another user's media as their avatar. This is forwarded to ST15, unchanged from pass-1.
- (git) commit 5cb22bd - No new issues introduced by the remediation. The change set is purely additive (8 insertions, 0 deletions) and touches only test fixtures + tracked env seed files; no production/surface code, no control, and no feature behavior was altered.
  git show --stat 5cb22bd confirms the only files changed are apps/api/.env, apps/api/.env.example, and 5 *.test.ts fixtures. The diff adds exactly the new field (avatarUploadMaxSizeBytes: 1048576), the new env string (MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES=1048576), and one documenting comment in .env.example. media.service.ts, media.controller.ts, and environment.ts are byte-for-byte unchanged vs the pass-1 implementation that was already assessed secure (0 blocking).

Test sufficiency assessment:
- Avatar-surface security behavior remains well covered and now passes: media.controller.test.ts adds avatar 401-no-session, non-admin self-service success, and admin success, alongside the intact non-admin blog-post/standalone-page 403 cases; media.service.test.ts adds avatar/ prefix, oversized-avatar 400, polyglot-avatar 400, SVG-avatar 400, and a test confirming the GENERAL cap (not the avatar cap) applies to non-avatar types; environment.test.ts adds missing/below-min/above-max/boundary validation for MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES.
- The pass-1 regression is fully resolved: from this worktree apps/api typecheck reports 0 errors and the full suite reports 829 pass (536 API + 2 skipped, 293 web) with 0 failures. The 6 previously failing tests now pass. The suite is green, so the role's 'absence of green tests is a real gap' constraint is satisfied.

Documentation / operational guidance assessment:
- docs/features/media.md correctly documents the avatar resourceType, self-service auth (any active session for blog-comment/avatar; admin for blog-post/standalone-page), dual size limits including MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES (range 1024-2097152, recommended 1048576), and that magic-byte verification + SVG exclusion apply to avatar.
- docs/operations/launch.md correctly documents MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES.
- Pass-1 documentation gap is now closed: the git-tracked seed env files (apps/api/.env, apps/api/.env.example) declare the new required var, so operators following the env contract no longer hit a fail-closed startup crash.

Artifacts written:
- artifacts/milestone-4-forums/ST12/security_report.md
- artifacts/milestone-4-forums/ST12/security_result.json

Outcome:
- PASS
