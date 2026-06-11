Security Review Report

Scope reviewed:
- Pass-2 specialist security re-review of Milestone 4 subtask ST4 - forum topics (create, paginated read, visibility gate, pinned ordering), after a Verifier-driven remediation that addressed the two non-blocking WARNINGs from the pass-1 Security CONDITIONAL PASS.
- Remediation change set vs pass-1 base (security commit 5234498..HEAD): apps/api/src/forums/forums.service.ts (createTopic type guards), apps/api/src/forums/forums.service.test.ts (+120 lines: TEST A soft-delete coverage, TEST B malformed-input -> 400 coverage), docs/features/forums.md (error contract +6 lines). No changes to forums.controller.ts, forums.types.ts, the visibility predicate, toTopicShape, the oracle message, or the pagination clamp.
- Forum leak surface unchanged: Risk R1 / retrospective pattern P12 (board visibility filtering + 404 oracle parity + sanitizer-before-persist + public-shape allowlisting).

Why specialist review was triggered:
- Plan marks ST4 'Security review: required' as the dominant P12 surface (visibility + oracle parity on new read+write paths). Coordinator routed a Security pass-2 re-review after the Verifier-driven remediation of the two pass-1 WARNINGs to confirm no control was weakened.
- agent-retrospective-patterns.md P12: every lookup path must enforce the full visibility predicate; gated and nonexistent lookups must be 404-indistinguishable; sanitization must run before persistence; public response shapes must be allowlisted.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md - ST4 and Risk R1.
- Pass-1 Security report (CONDITIONAL PASS) preserved at artifacts/milestone-4-forums/ST4/history/verifier-1-warning/security_report.md (WARNING-1 500-vs-400, WARNING-2 missing deletedAt:IsNull test coverage, plus 1 members/project-only scope NOTE).
- docs/features/forums.md (ST4 topic routes, request-handling order, error contract, oracle parity).
- docs/development/agent-retrospective-patterns.md P12 (visibility/oracle leak pattern).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.service.ts:502-503 - createTopic throws BadRequestException("Topic title must not be empty.") for a non-string-but-truthy title (e.g. 99 or {}). The 400 status and fail-closed behavior are correct, but the message text is imprecise for the non-string case.
  Cosmetic only. The response is a generic 400 that reveals nothing about board existence or internal state, so there is no oracle or information-leak impact. Non-blocking; optionally align the message with the body guard's "must be a string" wording in a future polish.
- apps/api/src/forums/forums.service.ts:512 - normalizeMarkdownBody(input.body ?? "") retains the "?? \"\"" guard even though the preceding typeof input.body !== "string" guard (line 507-509) already rejects undefined/null with a 400.
  Harmless redundant defense-in-depth that mirrors the blog precedent; it cannot be reached with a null/undefined body after the type guard. No action required.
- apps/api/src/forums/forums.service.ts:496 - Carried-forward pass-1 NOTE (unchanged by design): createTopic/listTopics gate on isBoardPubliclyReadable, which evaluates the anonymous actor, so members-only / project-only boards are neither topic-listable nor topic-creatable even by an authenticated member who could otherwise read them.
  Conservative / fail-closed: strictly more restrictive than the actor's own read scope, so it cannot leak a topic across visibility scopes. Acceptable ST4 scoping; a future member-scoped-board subtask must re-evaluate the predicate with the real actor rather than widening isBoardPubliclyReadable.

Test sufficiency assessment:
- Validation matrix GREEN, run from this worktree after `pnpm --dir <worktree> install --frozen-lockfile`: `vitest run --root apps/api src/forums/forums.controller.test.ts src/forums/forums.service.test.ts` = 146 passed (57 controller + 89 service, up from 84); `pnpm typecheck` = pass (apps/api + apps/web, 0 errors); `pnpm lint` = pass (eslint --max-warnings=0, 0 warnings).
- WARNING-2 RESOLVED and non-vacuous: TEST A (forums.service.test.ts:1312) drives listTopics on a public board and asserts findAndCount is called with where.deletedAt deep-equal to typeorm IsNull(); dropping or undefining that condition fails the assertion, so a regression that leaked soft-deleted topics is now caught by the unit suite.
- WARNING-1 RESOLVED and non-vacuous: TEST B (forums.service.test.ts:1336) asserts createTopic with undefined body, body=42, body={}, undefined title, and title=99 each throws BadRequestException (400, not a TypeError/500) with topicRepository.save NOT called; each case sets a public board so execution reaches the new type guards rather than short-circuiting at the gate.
- Pre-existing security coverage intact: oracle parity (TC1-TC4 assert byte-identical TOPIC_NOT_FOUND_MESSAGE via toBe for gated-vs-nonexistent boards on both create and list); evaluate() invoked on readable paths (TC5/TC6); 401-before-data-op (controller asserts forumsService.createTopic not called without a session); unsafe Markdown <script>/javascript: rejected 400 before persist (TC7/TC8); public-shape allowlist strips authorUserId/boardId/isLocked/movedByUserId/lockedByUserId/deletedAt (TC10/TC11); pagination offset + pageSize clamp to 100 (TC12/TC13) and pinned order (TC9).

Documentation / operational guidance assessment:
- docs/features/forums.md updated to document the new 400 contract: step 3 now describes the title type guard plus content validation, step 4 the body type guard before normalizeMarkdownBody, and the error table lists "Missing or non-string title or body" under 400. Oracle parity (identical TOPIC_NOT_FOUND_MESSAGE for nonexistent vs hidden), 401-first ordering, sanitize-before-persist sequence, pageSize 1-100 clamp, deletedAt IS NULL exclusion, and the PublicTopicShape/PublicAuthorShape allowlist remain accurately documented.
- Documentation is sufficient for safe operation; no documentation finding. The pass-1 recommendation to document the malformed-body 400 is now satisfied.

Artifacts written:
- artifacts/milestone-4-forums/ST4/security_report.md
- artifacts/milestone-4-forums/ST4/security_result.json

Outcome:
- PASS
