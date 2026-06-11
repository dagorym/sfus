Verifier Report

Scope reviewed:
- Milestone 4 ST17 — Web: public profile page + avatar upload & display. Files reviewed: apps/web/app/users/[username]/page.tsx (profileProjection, fetchPublicProfile, UserProfilePage), apps/web/app/profile/page.tsx (avatar upload/replace/remove via ImageUpload + setAvatar/removeAvatar), apps/web/components/user-avatar.tsx (resolveAvatarSrc, deriveInitials, UserAvatar), apps/web/app/auth-client.ts (setAvatar/removeAvatar functions), apps/web/components/mention-autocomplete.tsx (UserAvatar reuse). Server-side cross-check (read-only): apps/api/src/users/users.service.ts (findPublicProfile five-field allowlist, setAvatar/removeAvatar enforcement), apps/api/src/users/users.types.ts (PublicProfileShape). Tests: apps/web/components/user-avatar.spec.ts (16), apps/web/app/users/users-profile.spec.ts (12), apps/web/components/mention-autocomplete.spec.ts (24). Docs: docs/features/web-shell.md, docs/features/auth.md. Security stage result: PASS with 2 forwarded NOTEs (no blocking).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md (ST17, lines 446-464)

Convention files considered:
- AGENTS.md
- CLAUDE.md
- .myteam/verifier/role.md

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/web/components/user-avatar.tsx:71-77 - resolveAvatarSrc has no scheme/prefix check (forwarded from security review — N1)
  Not exploitable as built: every avatarSrc originates from the ST14 findPublicProfile and suggest endpoints which build the URL from a UUID FK via MEDIA_URL_PREFIX. profileProjection coerces non-string/blank avatar to null. An <img src> sink does not execute a javascript: scheme in modern browsers. This is a defense-in-depth gap, not a live defect. Optional hardening: assert the path begins with the gated /api/media/ prefix and return null otherwise.
- apps/web/components/mention-autocomplete.spec.ts:1-246 - Source-contract test pattern, no jsdom harness (forwarded from security review — N2)
  The mention-autocomplete and public-profile tests use the established source-audit pattern (reading source file text and asserting on content), consistent with authoring-components.spec.ts and blog.spec.ts. No DOM test environment (jsdom/@testing-library) is available in this workspace. The two highest-value security invariants — the five-field allowlist (profileProjection) and the broken-image/error degradation (resolveAvatarSrc) — are isolated in pure functions and covered by non-vacuous behavioral unit tests that fail on regression. This is a known repo-wide constraint, not an ST17-specific gap, and the pattern is judged adequate.

Test sufficiency assessment:
- SUFFICIENT. vitest run --root apps/web -> 12 files, 407 tests PASS (user-avatar.spec.ts 16, users-profile.spec.ts 12, mention-autocomplete.spec.ts 24). All 52 ST17-related specs are non-vacuous: profileProjection tests confirm the 5-key allowlist and regression on extra keys; resolveAvatarSrc tests confirm null/error degradation invariant; deriveInitials tests cover multi-word, single-token, fallback, and empty-input edge cases. Source-contract tests for the JSX layer are consistent with the established repo pattern (authoring-components.spec.ts, blog.spec.ts). No ST16 regression: forums.spec.ts 51 tests PASS.

Documentation accuracy assessment:
- ACCURATE. docs/features/web-shell.md: route map /users/<username> entry correctly lists the 5 permitted fields, references UserAvatar, and documents the profile avatar upload/replace/remove flow, initials fallback, security contract (gated path only), and encodeURIComponent convention — all verified against the implementation. docs/features/auth.md: ST17 section documents the public profile page (profileProjection, 5 fields), avatar upload/replace/remove, client-UX-only control, and cross-references the ST15 enforcement contract. Auth.md API table for /api/users/:username and PUT/DELETE /api/users/me/avatar matches the server implementation. All 5 allowlist fields (username, displayName, avatar, bio, joinDate) match both users.types.ts PublicProfileShape and profileProjection. No inaccurate field listed, no duplication or contradiction between the two doc files for ST17 content.

Artifacts written:
- artifacts/milestone-4-forums/ST17/verifier_report.md
- artifacts/milestone-4-forums/ST17/verifier_result.json

Verdict:
- PASS
