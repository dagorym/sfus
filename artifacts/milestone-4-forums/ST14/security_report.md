Security Review Report

Scope reviewed:
- Specialist security review of Milestone 4 subtask ST14 — username suggest endpoint (GET /users/suggest?q=) and minimal public profile API (GET /users/:username).
- Change set vs base ms4: apps/api/src/users/users.controller.ts (suggest + getPublicProfile), users.service.ts (suggestByPrefix, findPublicProfile, escapeLikePrefix), users.types.ts (UserSuggestItem, UserSuggestResponse, PublicProfileShape), users.module.ts (dynamic register wiring AuthModule + ThrottleModule), app.module.ts (UsersModule.register), plus ST14 tests and docs/features/auth.md.
- Centered on plan Risk R3: username enumeration via suggest/profile and public PII exposure.
- Severity scheme: BLOCKING = blocking; WARNING = CONCERN (forward, non-blocking); NOTE = INFO.

Why specialist review was triggered:
- Plan marks ST14 Security review: required (plans/milestone-4-forums-plan.md line 397).
- Risk R3 (line 571): Username enumeration via suggest/profile + public PII exposure; mitigation = session-gate + throttle + minimal fields + uniform 404.
- agent-retrospective-patterns.md P12 (existence oracles): gated/nonexistent lookups must be byte-identical 404, uniform message — the dominant concern for the profile endpoint.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST14 (lines 380-399), Risk R3 (line 571), D6 (line 101).
- docs/features/auth.md — public profile + suggest endpoint + exposed-field allowlist (updated in this change set).
- docs/development/agent-retrospective-patterns.md — P12 (lines 200-221).

Findings

BLOCKING
- None

WARNING
- apps/api/src/users/users.service.ts:40-56 - CONCERN (non-blocking, forward): an authenticated caller can still enumerate the active-username space via repeated prefix queries (a, b, ..., aa, ab, ...), bounded only by the throttle and the 10-result cap.
  The session-gate + per-identity throttle (new-account tier active) + cap raise the cost of full enumeration but do not eliminate it. This matches the plan's intended/accepted R3 mitigation for M4 (usernames are inherently semi-public: forum bylines, @-mentions). No additional control is required for M4; record as accepted residual and revisit only if username harvesting becomes a concern (e.g., add per-identity daily quota or noise). Not blocking.

NOTE
- apps/api/src/users/users.service.test.ts:62-148 - INFO: escapeLikePrefix (the %/_/\ wildcard-neutralizer) has no direct unit test asserting that q='%' / q='_' / q='\' are escaped before being placed in the LIKE pattern.
  The escaping logic is present and correct by inspection (regex replaces %, _, \ with a backslash-prefixed form; MySQL's default LIKE escape is backslash), and TypeORM Like() binds the value as a parameter so there is no SQL injection. Coverage is only indirect. A focused regression test (e.g. assert the Like operand for q='a%b' equals 'a\%b%') would lock the behavior. Not blocking.
- apps/api/src/users/users.service.ts:54,84 - INFO: avatar/avatarUrl is constructed as /api/media/<avatar_media_id> directly from the stored column; ST14 exposes no write path, so an attacker cannot point a profile at an arbitrary media id of another resourceType through this change set.
  Exposing the URL leaks nothing beyond the already-public avatar image (GET /api/media/:id serves any stored image reference; all four allowed resourceTypes are public-serveable). The integrity guarantee that avatar_media_id only ever references a resourceType='avatar' upload owned by the user is the responsibility of the set/remove-avatar API (ST15), which is out of ST14 scope. Flag forward so ST15 security review confirms avatar_media_id cannot be bound to a foreign/non-avatar media id.
- apps/api/src/users/users.controller.ts:85,134 - INFO: @Get('suggest') is declared before @Get(':username'), so /users/suggest resolves to the suggest handler. A user literally named 'suggest' would be shadowed (its public profile unreachable).
  This is an availability/correctness quirk, not a security oracle — it does not leak existence or PII. Acceptable for M4; could be hardened later by reserving the 'suggest' username at registration or moving suggest under a distinct path segment. Not blocking.

Test sufficiency assessment:
- Matrix GREEN from this worktree: vitest run --root apps/api src/users/users.controller.test.ts src/users/users.service.test.ts => 2 files / 37 tests passed; pnpm typecheck clean (apps/api + apps/web); pnpm lint clean (--max-warnings=0).
- Suggest security ACs covered: 400 before auth/DB (q non-string/missing; authService + suggestByPrefix NOT called); 401 when resolveSession rejects (suggestByPrefix NOT called); 429 when checkRequest throws (suggestByPrefix NOT called) and checkRequest invoked with userId + non-null userCreatedAt (new-account tier); field allowlist (exactly 3 keys username/displayName/avatarUrl; email/globalRole/status/id/bio/createdAt absent) at both controller and service layers; active-only (where status:'active' asserted on the find call); cap (take=10 asserted); avatar /api/media/<id>-or-null.
- Profile security ACs covered: exactly-5-field allowlist (username/displayName/avatar/bio/joinDate; email/globalRole/status/id/sessions/passwordAuthenticators absent) at controller and service; P12 enumeration parity — nonexistent and inactive both 404 and BYTE-IDENTICAL message asserted (expect(msgNonexistent).toBe(msgInactive)); service asserts findOne where:{username,status:'active'} so inactive == nonexistent == null; avatar resolution; 400 on empty/whitespace username.
- Gap (non-blocking): no direct escapeLikePrefix unit test (INFO finding above). Timing/shape side channels: both 404 paths share one code path (single findOne -> null -> NotFoundException), so message/shape/status are identical and no DB-presence timing oracle is introduced by the controller logic.

Documentation / operational guidance assessment:
- docs/features/auth.md updated accurately and sufficiently: documents both routes in the API table; the suggest field allowlist (username/displayName/avatarUrl) with explicit 'never includes email/globalRole/status/id'; the profile 5-field allowlist; LIKE escaping (%, _, \); session-gate + throttle; and — critically — the P12 enumeration-parity contract stating nonexistent and inactive both return 404 'User not found.' with an identical message in both cases.
- docs/features/forums.md cross-links the suggest endpoint. No operational/runbook gap for M4; throttle env contract is already documented from ST8/ST9. No documentation changes required as a result of this review.

Artifacts written:
- artifacts/milestone-4-forums/ST14/security_report.md
- artifacts/milestone-4-forums/ST14/security_result.json

Outcome:
- CONDITIONAL PASS
