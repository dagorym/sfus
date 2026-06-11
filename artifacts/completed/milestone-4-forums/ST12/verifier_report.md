Verifier Report

Scope reviewed:
- Milestone 4 ST12: self-service avatar media upload resourceType + tighter avatar size cap. Combined implementer, tester, documenter, and two security passes (pass-2 PASS) reviewed. Changed files: apps/api/src/media/media.service.ts, media.controller.ts, apps/api/src/config/environment.ts, apps/api/.env, apps/api/.env.example, apps/api/src/media/media.service.test.ts, media.controller.test.ts, environment.test.ts, 5 sibling fixture files (pass-2 remediation), docs/features/media.md, docs/operations/launch.md, plus artifacts/milestone-4-forums/ST12/ artifact files.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST12 (lines 348-364) and Risk R7 (lines 580-582). Convention files: docs/features/media.md, docs/operations/launch.md, docs/development/api-conventions.md, AGENTS.md.

Convention files considered:
- AGENTS.md
- docs/features/media.md
- docs/operations/launch.md
- docs/development/api-conventions.md

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/media/media.service.ts:180 - assertValidFileSize resourceType parameter typed as string | undefined rather than AllowedResourceType | undefined.
  The runtime comparison is a strict equality check against the literal 'avatar' and is correct. Type precision is a style nit with no delivery risk.
- apps/api/src/media/media.controller.ts:39 - ADMIN_ONLY_RESOURCE_TYPES list is maintained by hand and not derived from a type-level set.
  No immediate risk (current list is correct — avatar is absent). Future resource-type additions require a manual update to this list. Informational only.
- plans/milestone-4-forums-plan.md:401-414 - ST15 avatar-ownership obligation is out of scope for ST12 but confirmed forwarded.
  ST12 records ownerUserId from session.user.id on every media upload including avatar. ST15 MUST verify resourceType='avatar' AND ownerUserId===caller before binding a media id to a user profile. Forwarded per security report. No ST12 gap.

Test sufficiency assessment:
- Coverage is thorough and non-vacuous. media.controller.test.ts: avatar 401-no-session, non-admin self-service success, admin avatar success, existing non-admin blog-post/standalone-page 403 cases intact. media.service.test.ts: avatar/ prefix, oversized-avatar 400 (1 byte over cap), polyglot avatar 400, SVG avatar 400, general-cap-not-avatar-cap for non-avatar types. environment.test.ts: missing, below-min (1023), above-max (2097153), and boundary (1024 and 2097152) validations for MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES. Independently re-run from fresh worktree: typecheck 0 errors (both apps/api and root), 829 tests pass (536 API + 2 skipped, 293 web), 0 failures, lint clean, API tsc build passes.

Documentation accuracy assessment:
- docs/features/media.md accurately documents the avatar resourceType, self-service auth model (any active session for blog-comment/avatar; admin for blog-post/standalone-page), dual size limits with MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES (range 1024-2097152, recommended 1048576), magic-byte verification + SVG exclusion applying to avatar, and avatar/ storage prefix. docs/operations/launch.md correctly documents MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES with default and range. Both tracked seed env files (apps/api/.env and apps/api/.env.example) declare the required var at 1048576. No stale text, no duplication.

Artifacts written:
- artifacts/milestone-4-forums/ST12/verifier_report.md
- artifacts/milestone-4-forums/ST12/verifier_result.json

Verdict:
- PASS
