Security Review Report

Scope reviewed:
- Specialist security review of Milestone 4 subtask ST15 - self-service set/remove-avatar API with ownership enforcement (Risk R7).
- Change set vs base ST14 (76e938b..026db26): apps/api/src/users/users.controller.ts (PUT/DELETE /users/me/avatar), users.service.ts (setAvatar/removeAvatar), users.types.ts (SetAvatar/RemoveAvatar DTOs), users.module.ts (MediaReferenceEntity wiring), plus users.controller.test.ts and users.service.test.ts. Read-only cross-reference: media-reference.entity.ts, user.entity.ts, media.controller.ts (ST12 upload), auth.service.ts (resolveSession), migrations (owner_user_id NOT NULL).
- Centered on R7: a foreign media id must not become someone's avatar. Verified ownership enforcement, oracle parity (P12), auth gating, input guard, ST12/ST14 consistency, and removal scoping.

Why specialist review was triggered:
- Plan marks ST15 'Security review: required' - avatar-ownership enforcement (plans/milestone-4-forums-plan.md line 413).
- Risk register R7 - Avatar upload abuse / ownership confusion: self-service uploads + a mutable avatar_media_id; ST15 must enforce resourceType='avatar' + caller-ownership (plan lines 580-582).
- Security-stage subtask per plan line 1260 (ST15 listed among security stages).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md ST15 (lines 401-416) + Risk R7 (lines 580-582).
- docs/development/agent-retrospective-patterns.md P12 (existence-oracle parity, lines 200-221).
- docs/features/auth.md (set/remove-avatar contract), docs/features/media.md (avatar upload resourceType).
- ST15 acceptance criteria: reject (400/403) nonexistent / non-avatar / foreign-owned media; persist + reflect in profile on success; remove clears field; 401 when no session.

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/users/users.service.ts:56-75 - INFO - Ownership predicate (R7) is correctly enforced as a single parameterized findOne WHERE clause requiring id = mediaId AND resourceType = 'avatar' AND ownerUserId = callerId. Nonexistent, wrong-type (blog-post/standalone-page/blog-comment), and foreign-owner ids all return null and raise ForbiddenException; binding only occurs on a matching row.
  Cannot be bypassed: TypeORM parameterizes all three values (no SQL/injection gap); equality match on a server-derived callerId leaves no case/whitespace trick; owner_user_id is char(36) NOT NULL with a FK CASCADE to users (migration 1748736000000), so a NULL-owner row is impossible and NULL = callerId never matches. A foreign or non-avatar media id can never become the caller's avatar.
- apps/api/src/users/users.service.ts:67-70 - INFO - Oracle parity holds: a single uniform 403 message ('Media id not found or not usable as your avatar.') is raised for nonexistent vs wrong-type vs foreign-owner. Identical class (ForbiddenException), status (403), and byte-identical message. Tests assert message identity at both controller (AC-SETAVATAR-ORACLE) and service (AC-SERVICE-SETAVATAR-ORACLE) layers.
  A caller cannot use the error to learn whether a foreign media id exists or what resourceType it has - prevents the existence-oracle class flagged in P12.
- apps/api/src/users/users.controller.ts:172-217 - INFO - PUT enforces order 400 (body guard) -> 401 (resolveSession) -> 403 (ownership) -> DB; DELETE enforces 401 -> DB. resolveSession throws UnauthorizedException for missing/invalid/revoked/expired session before any media lookup or mutation (auth.service.ts 555-593). No pre-auth oracle. Input guard rejects null/non-object body, missing/non-string/empty/whitespace mediaId with a clean 400 (no 500). Tests confirm service is not called on 400/401.
  Auth is the enforcement boundary and is evaluated before any media DB access; malformed input is rejected cleanly without reaching the database or leaking a server error.
- apps/api/src/media/media.controller.ts:109-119 - INFO - ST12 upload records ownerUserId = session.user.id (server-derived from resolveSession, never client-supplied). ST15 setAvatar matches against that same ownerUserId field, so parity holds. removeAvatar (users.service.ts 82-84) updates only { id: callerId } -> cannot affect another user. ST14 public-profile/suggest field allowlists and the media serve path are untouched by this change set (diff limited to additive users-module methods + docs).
  Confirms a foreign upload's ownerUserId is the uploader's id (a different caller cannot match), removal cannot clear another user's avatar, and no regression weakens the ST14 allowlist or media serve path.

Test sufficiency assessment:
- SUFFICIENT. users tests green via 'vitest run --root apps/api src/users/users.controller.test.ts src/users/users.service.test.ts' (the correct invocation - NOT pnpm --filter @sfus/api test): 68 passed (42 controller + 26 service).
- Negative coverage for R7 is complete: nonexistent id, wrong resourceType, and foreign-owner cases each assert ForbiddenException and that avatarMediaId is NOT updated; operator-pinned WHERE-clause assertions confirm id + resourceType='avatar' + ownerUserId=callerId are all present in a single query.
- Oracle-parity tests assert byte-identical 403 message across all three not-allowed cases at both controller and service layers.
- Auth/input tests: 400 for null/missing/non-string/empty/whitespace mediaId (service not reached); 401 for no session (service not reached); success persists and returns /api/media/<id>; remove returns { avatarUrl: null } and calls update with avatarMediaId: null scoped to the caller.
- Full matrix green from this worktree after pnpm install --frozen-lockfile: typecheck (api + web) pass; lint (api + web, --max-warnings=0) pass.

Documentation / operational guidance assessment:
- SUFFICIENT. docs/features/auth.md adds the set/remove-avatar contract with the correct 400->401->403->DB order, the three-predicate ownership WHERE, the uniform 403 oracle-parity statement, and the removal-only-clears-own-field semantics; the route table and avatarMediaId writability note are updated accurately.
- docs/features/media.md cross-references the avatar upload resourceType. No documentation misstatement (no 404-vs-403 confusion, no oracle distinction leaked).
- No operational/runbook gap: behavior is request-scoped with no new env, secret, or destructive operation.

Artifacts written:
- artifacts/milestone-4-forums/ST15/security_report.md
- artifacts/milestone-4-forums/ST15/security_result.json

Outcome:
- PASS
