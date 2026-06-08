Security Review Report

Scope reviewed:
- Milestone 4 subtask ST6 — Forum moderation controls (pin/unpin, lock/unlock, move).
- Change set vs base ms4 (commit 026fbbd): apps/api/src/forums/forums.service.ts (assertModerationAccess, setPinned, setLocked, moveTopic, toModeratedTopicShape), apps/api/src/forums/forums.controller.ts (five PATCH /forums/moderation/topics/:topicId/{pin,unpin,lock,unlock,move} endpoints), apps/api/src/forums/forums.types.ts (ModeratedTopicShape, MoveTopicInput).
- Supporting authorization surface reviewed read-only: apps/api/src/authorization/authorization.service.ts (hasGlobalRole, evaluate, canModeratorOverride), apps/api/src/blog/blog.service.ts (assertModerationAccess comparison baseline), apps/api/src/forums/entities/forum-topic.entity.ts and forum-board.entity.ts (audit columns + scope/visibility vocab).
- Validation evidence: forums controller+service tests (vitest), pnpm typecheck, pnpm lint.

Why specialist review was triggered:
- Plan marks ST6 'Security review: required' for TWO risks: (1) the privilege gate (moderator/admin), and (2) the cross-scope MOVE leak that could relocate a topic across visibility scopes.
- Plan Risk R1 (highest; P12) — visibility/oracle leaks across new read/move paths; all decisions must route through AuthorizationService.evaluate() with 404 oracle parity.
- agent-retrospective-patterns P12 — gated paths must not distinguish hidden-from-nonexistent (404 parity).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST6 (lines 239-256) and Risk R1 (lines 564-567).
- docs/features/authorization.md (assertModerationAccess semantics); docs/features/forums.md (Moderation ST6 section, lines 361-434).
- ST6 acceptance criteria: 401/403 before any data op; lock blocks non-privileged posts; move re-evaluates destination via evaluate() and rejects cross-scope; Swagger/JSDoc match the real status contract.

Findings

BLOCKING
- None

WARNING
- docs/features/forums.md:405 - Doc inaccuracy (non-security): the move-contract section lists 'unlisted' among destinations rejected with 404. In reality isBoardPubliclyReadable returns TRUE for a site-scoped 'unlisted' board (evaluate() allows anonymous reads of public/unlisted, authorization.service.ts:54), so a move INTO a site/unlisted board is PERMITTED, not rejected — confirmed by service test forums.service.test.ts:636-650.
  Not an exposure leak: unlisted site boards are anonymous-readable (merely unlisted from the index), and the source topic was already publicly readable, so effective exposure does not increase. But the documented contract overstates the rejection set and should be corrected by the documenter to read 'members, private, project-only' (unlisted is allowed). Forward to documenter.

NOTE
- apps/api/src/forums/forums.controller.ts:359-545 - PRIVILEGE GATE SOUND. All five moderation PATCH handlers (pinTopic/unpinTopic/lockTopic/unlockTopic/moveTopic) run resolveSession() (401) then assertModerationAccess(session.user.globalRole) (403) BEFORE any data op. No moderation endpoint is left ungated; there is no existence oracle ahead of the gate.
  Verified by tests: assertModeration401FiresBeforeData and assertModeration403FiresBeforeData assert the data spy (setPinned/setLocked/moveTopic) is NOT called when the 401/403 fires. The task brief says 'six endpoints'; the actual change set exposes FIVE PATCH routes (pin/unpin/lock/unlock/move) — all five are gated. assertModerationAccess uses hasGlobalRole(role,'moderator'), byte-for-byte the same semantics as BlogService.assertModerationAccess; rank-hierarchy means moderator(1) and admin(2) both pass, while user(0) and '' are rejected (roleRank['']===undefined → false). No weaker check.
- apps/api/src/forums/forums.service.ts:872-913 - CROSS-SCOPE MOVE LEAK PREVENTED in both directions. Destination is re-validated through isBoardPubliclyReadable() → evaluate() with the anonymous actor {userId:null, globalRole:''}. Because the actor role is empty, the global-admin/global-moderator override branches in evaluate() are NOT taken, so the destination must be scopeType==='site' AND anonymous-readable. Project-scoped and members/private/project-only destinations are rejected with 404 BOARD_NOT_FOUND_MESSAGE (oracle parity). The SOURCE gate (line 883) likewise requires isBoardPubliclyReadable(topic.board), so a topic that currently lives in a hidden/project board 404s at the source gate and cannot be pulled out into a public board.
  This is the dominant P12 concern for ST6. The anonymous-actor evaluation is the load-bearing defense: a moderator/admin caller cannot use their own elevated role to relocate a topic into a board a guest could not read, nor surface a previously-gated topic. Reverse-direction leak is also closed by the symmetric source-board gate. Tests cover: project-scoped dest rejected + save NOT called; members dest rejected + evaluate() invoked on dest + save NOT called; nonexistent dest → BOARD_NOT_FOUND_MESSAGE; nonexistent source → TOPIC_NOT_FOUND_MESSAGE; no-op same-board short-circuit. No residual leak identified.
- apps/api/src/forums/forums.service.ts:832-850, 666-669 - LOCK SEMANTICS SOUND. setLocked toggles topic.isLocked. ST5 createPost (line 666-669) checks topic.isLocked before any persistence and throws 403 'This topic is locked. New posts are not allowed.' for non-privileged callers. The five gated moderation endpoints are the only privileged write path to isLocked.
  A non-privileged user cannot flip the lock flag (no ungated write path) and cannot post into a locked topic (createPost gate). Integration test 'LOCK INTEGRATION: after setLocked(true), createPost throws ForbiddenException' confirms the end-to-end behavior. Consistent with blog comment-lock semantics per the AC.
- apps/api/src/forums/forums.service.ts:840-847, 901-905 - AUDIT TRAIL UNFORGEABLE. lockedByUserId/lockedAt and movedByUserId/movedAt are written from actorUserId, which the controller binds to session.user.id (server-resolved). The move request body carries only destinationBoardId; no actor identity or timestamp is client-supplied.
  An attacker cannot forge who-moved/who-locked metadata. Unlock clears lockedByUserId/lockedAt to null; tests assert the recorded id equals the authenticated actor and that unlock clears the columns.
- apps/api/src/forums/forums.controller.ts:537-540 (and forums.service.ts:874-876) - INPUT GUARD CLEAN. Malformed/missing/non-string/empty destinationBoardId yields a clean 400 'destinationBoardId must be a non-empty string.', never a 500, and is enforced in BOTH the controller (pre-delegation) and the service (defense in depth). It cannot bypass destination re-validation.
  Tests cover undefined, empty-string, whitespace, numeric, and object inputs — all 400 with moveTopic NOT called. The trim()-based guard prevents string-method crashes and prevents an empty id from reaching the board lookup.
- docs/features/forums.md:363 - Minor doc copy error (non-security): prose says 'six PATCH endpoints' but the route table immediately below (lines 380-384) and the code expose exactly FIVE (pin/unpin/lock/unlock/move). Swagger @Api*Response decorators and per-handler JSDoc otherwise match the real status contract (200/401/403/404, plus 400 on move), and controller tests assert decorator presence per handler.
  P1 contract integrity holds at the API surface; the 'six' is a stale narrative count. Documenter-owned tidy-up; no security impact.
- apps/api/src/forums/forums.controller.ts:537-541 - moveTopic runs the destinationBoardId 400 type-guard BEFORE resolveSession (401). An unauthenticated caller sending a malformed body receives 400 rather than 401.
  Low/informational: the guard is a content-free type check that leaks no existence/state and reveals nothing beyond the already-public route shape. The service re-validates after the auth gate (defense in depth). Acceptable, but if strict 401-before-400 ordering is desired for consistency, the controller guard could move below resolveSession. No leak.

Test sufficiency assessment:
- SUFFICIENT for the ST6 security surface. forums.controller.test.ts (96) + forums.service.test.ts (133) = 229 tests, all green via vitest run --root apps/api.
- Privilege gate: 401-before-data and 403-before-data helpers cover all five moderation handlers and assert the data op spy is not called; assertModerationAccess accepts moderator/admin and rejects user/'' .
- Cross-scope move: dedicated tests for project-scoped dest rejection (save not called), members-visibility dest rejection (evaluate invoked, save not called), nonexistent dest (BOARD_NOT_FOUND_MESSAGE), nonexistent source (TOPIC_NOT_FOUND_MESSAGE), no-op same-board.
- Lock: lock/unlock audit-column persistence + clearing; lock→createPost 403 integration.
- Input guard: undefined/empty/whitespace/numeric/object destinationBoardId all 400 with moveTopic not called.
- Contract: per-handler @ApiUnauthorizedResponse/@ApiForbiddenResponse/@ApiNotFoundResponse (and @ApiBadRequestResponse on move) presence asserted.

Documentation / operational guidance assessment:
- ADEQUATE for safe operation; two non-blocking documenter fixes recommended.
- docs/features/forums.md Moderation (ST6) section documents the two-step gate, the cross-scope move re-validation, oracle parity, and the audit columns, and the route table lists the correct five endpoints with correct status codes.
- WARNING: forums.md:405 wrongly lists 'unlisted' as a rejected move destination (it is permitted; harmless but inaccurate). NOTE: forums.md:363 says 'six' endpoints where the contract has five. Both are documenter-owned and do not affect the security posture.
- Validation commands run from this worktree: pnpm --dir <worktree> install --frozen-lockfile (OK); vitest run --root apps/api src/forums/forums.controller.test.ts src/forums/forums.service.test.ts (229/229 passed); pnpm typecheck (api+web Done); pnpm lint (api+web Done, --max-warnings=0).

Artifacts written:
- artifacts/milestone-4-forums/ST6/security_report.md
- artifacts/milestone-4-forums/ST6/security_result.json

Outcome:
- PASS
