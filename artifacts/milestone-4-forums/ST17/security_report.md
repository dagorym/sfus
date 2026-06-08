Security Review Report

Scope reviewed:
- Milestone 4 subtask ST17 — web public profile page (/users/<username>) + avatar upload/replace/remove in /profile + shared UserAvatar display component (public profile, ST16 forum bylines, mention-autocomplete).
- Implementation files: apps/web/app/users/[username]/page.tsx (profileProjection), apps/web/app/profile/page.tsx (avatar control), apps/web/components/user-avatar.tsx (resolveAvatarSrc/deriveInitials/UserAvatar), apps/web/app/auth-client.ts (setAvatar/removeAvatar), apps/web/components/mention-autocomplete.tsx.
- Tests: apps/web/app/users/users-profile.spec.ts (12), apps/web/components/user-avatar.spec.ts (16), apps/web/components/mention-autocomplete.spec.ts (24).
- Server boundary cross-checked (unchanged by ST17): apps/api/src/users/users.controller.ts + users.service.ts (ST15 setAvatar/removeAvatar ownership enforcement; ST14 findPublicProfile five-field allowlist).
- Docs cross-checked: docs/features/web-shell.md (route map + UserAvatar security note), docs/features/auth.md.

Why specialist review was triggered:
- Plan marks ST17 'Security review: required' — the surface renders user-supplied avatar images plus profile PII and depends on a gated media serve path.
- Primary risks: PII leakage beyond the permitted public-profile fields; XSS/injection via avatar src or username; un-gated/raw storage URL leakage; a client-only control with no server enforcement on avatar bind/remove.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST17 (lines 446-464). ACs: public profile renders only the five permitted fields; member can upload/replace/remove avatar with no-avatar fallback (no broken image); web lint + typecheck pass; web tests execute behavior.
- Outcome semantics supplied by the ST17 coordinator framing (PASS / CONDITIONAL PASS / FAIL).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/web/components/user-avatar.tsx:71-77 - resolveAvatarSrc returns avatarSrc verbatim with no scheme/prefix validation; it trusts callers to pass only the gated /api/media/<id> path.
  Not exploitable as built: every avatarSrc value originates server-side (ST14 findPublicProfile and the suggest endpoint build `/api/media/<avatarMediaId>` from a UUID FK — never user free-text), and profileProjection coerces non-string/blank avatar to null. An <img src> sink also does not execute a `javascript:` scheme in modern browsers. The src is structurally constrained today, so this is a residual defense-in-depth gap rather than a live defect. Optional hardening: have resolveAvatarSrc assert the value starts with the API media prefix and otherwise return null. Forward to the verifier as a non-blocking observation.
- apps/web/components/mention-autocomplete.spec.ts:1-246 - ST17 has no jsdom/RTL harness; security-relevant behaviors are proven by (a) behavioral unit tests over extracted PURE functions (profileProjection, resolveAvatarSrc, deriveInitials) and (b) source-contract assertions for the JSX-bound rendering (no dangerouslySetInnerHTML, encodeURIComponent links, plain-text username insertion).
  Judged ADEQUATE for the security invariants in scope. The two highest-value invariants — the five-field allowlist and the broken-image/error degradation to initials — are isolated in pure functions and covered by non-vacuous unit tests that fail on regression (extra PII keys dropped; hasError -> null fallback; blank/non-string avatar -> null). The remaining JSX behaviors (text-node rendering, encoded links) are inherently render-time and are pinned by source-contract tests consistent with the repo's existing pattern (authoring-components.spec.ts, blog.spec.ts). The residual limitation is that source-contract tests assert on file text rather than executing the render; this is a known repo-wide constraint, not an ST17-specific gap, and does not undermine the security conclusion.

Test sufficiency assessment:
- ADEQUATE for the in-scope security invariants. Web matrix run worktree-locally: vitest run --root apps/web -> 12 files, 407 tests PASS (incl. user-avatar.spec.ts 16, users-profile.spec.ts 12, mention-autocomplete.spec.ts 24).
- profileProjection tests prove the five-field allowlist: extra keys (email, globalRole, status, id, passwordHash) are dropped; missing required username/joinDate -> null (no partial render); non-string/blank avatar -> null.
- resolveAvatarSrc tests prove the error/missing degradation invariant: null avatar -> null, empty-string -> null, hasError=true -> null (no broken image, no raw URL retained on error).
- mention-autocomplete + suggestUsers contract tests confirm data minimization (username/displayName/avatarUrl only; no email/id/globalRole/passwordHash), encodeURIComponent on the suggest query, plain-text @username insertion, and no dangerouslySetInnerHTML.
- Byline link encoding is pinned: post/topic author links use /users/${encodeURIComponent(...)}. No jsdom harness exists in this workspace; pure-function unit tests + source-contract tests cover the security-relevant behaviors that cannot be executed without a DOM.

Documentation / operational guidance assessment:
- ADEQUATE. docs/features/web-shell.md documents the /users/<username> route (five fields only), the /profile avatar upload/replace/remove flow, the UserAvatar component and its fallback, and states the security contract: avatarSrc must always be the gated /api/media/<id> path, the client control is UX-only with ST15 server-side enforcement, and /users/<username> links are encodeURIComponent-encoded.
- docs/features/auth.md carries the ST15 avatar self-service API enforcement contract that web-shell.md links to. No operational/runbook gap for this UI change.

Artifacts written:
- artifacts/milestone-4-forums/ST17/security_report.md
- artifacts/milestone-4-forums/ST17/security_result.json

Outcome:
- PASS
