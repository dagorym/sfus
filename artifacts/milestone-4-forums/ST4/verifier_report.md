Verifier Report

Scope reviewed:
- Second-pass verifier review of ST4 (Forum Topics: create, paginated read, visibility gate, pinned ordering) after verifier-driven remediation pass 2.
- Changes reviewed vs ms4 base: apps/api/src/forums/forums.service.ts (createTopic typeof-guards for title/body yielding 400 not 500); apps/api/src/forums/forums.service.test.ts (+TEST A: listTopics deletedAt:IsNull() non-vacuous regression test; +TEST B: malformed-input -> 400 non-vacuous regression tests); apps/api/src/forums/forums.controller.ts (listTopics + createTopic routes); apps/api/src/forums/forums.controller.test.ts (TC14 401-before-data-op; listTopics delegation tests); apps/api/src/forums/forums.types.ts (PublicTopicShape, PaginatedTopicsShape, CreateTopicInput, TopicListQuery, PublicAuthorShape); docs/features/forums.md (full topic route documentation, shapes, oracle parity, error contracts).
- Security pass-2 PASS report verified at artifacts/milestone-4-forums/ST4/security_report.md (0 BLOCKING, 0 WARNING, 3 informational NOTEs; all pass-1 WARNINGs confirmed resolved).
- Pass-1 artifacts preserved at artifacts/milestone-4-forums/ST4/history/verifier-1-warning/.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md (ST4, Risk R1, P12): member-authenticated topic creation; public paginated list; Markdown sanitization 400 before persistence; oracle parity (uniform 404 for nonexistent and gated boards); visibility checks via shared predicate helpers; public shape allowlisted server-side.
- docs/development/agent-retrospective-patterns.md (P12): every lookup path must enforce the full visibility predicate; gated and nonexistent lookups must be 404-indistinguishable; sanitization must run before persistence; public response shapes must be allowlisted.

Convention files considered:
- AGENTS.md
- docs/development/api-conventions.md
- docs/development/agent-retrospective-patterns.md

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.service.ts:502 - BadRequestException message for non-string title says "Topic title must not be empty." rather than "must be a string"
  Cosmetic only. The 400 status and fail-closed behavior are correct; the imprecise message text does not affect security or correctness. Carried forward from security pass-2. No action required.

- apps/api/src/forums/forums.service.ts:512 - Redundant "?? empty-string" fallback on normalizeMarkdownBody call after the typeof guard at line 507 already rejects non-strings with 400
  The fallback is unreachable after the type guard. Harmless defense-in-depth matching the blog.service.ts precedent. No action required.

- apps/api/src/forums/forums.service.ts:496 - Carried-forward: members-only and project-only boards are not topic-listable or topic-creatable even by authenticated members who could otherwise read them
  isBoardPubliclyReadable evaluates the anonymous actor, so the gate is strictly more restrictive than the authenticated actor's own read scope. Fail-closed and acceptable for ST4 scope. A future member-scoped-board subtask must re-evaluate the predicate with the real actor.

Test sufficiency assessment:
- Validation matrix GREEN (confirmed independently from this worktree after pnpm install --frozen-lockfile).
  - vitest run --root apps/api src/forums/forums.controller.test.ts src/forums/forums.service.test.ts: 146 passed (57 controller, 89 service).
  - Full API suite: 682 passed, 2 skipped (integration tests gated on DB env). 0 failures.
  - pnpm typecheck: pass (0 errors, apps/api + apps/web).
  - pnpm lint: pass (eslint --max-warnings=0, 0 warnings).
- TEST A (WARNING-2 regression, non-vacuous): forums.service.test.ts asserts listTopics issues findAndCount with where.deletedAt deep-equal to TypeORM IsNull(). Dropping or undefining that key causes the test to fail; the regression that would leak soft-deleted topics is caught.
- TEST B (WARNING-1 regression, non-vacuous): forums.service.test.ts asserts createTopic with undefined body, body=42, body={}, undefined title, and title=99 each throws BadRequestException (400, not TypeError/500) with topicRepository.save NOT called. Each case sets a readable board so execution reaches the type guards rather than short-circuiting at the board gate.
- Pre-existing security coverage intact: oracle parity via byte-identical TOPIC_NOT_FOUND_MESSAGE comparison (TC1-TC4); evaluate() spy confirmed on readable paths (TC5/TC6); 401-before-data-op confirmed (TC14, controller asserts createTopic not called without session); unsafe Markdown <script>/javascript: rejected 400 before persist (TC7/TC8); public-shape allowlist strips authorUserId/boardId/isLocked/movedByUserId/lockedByUserId/deletedAt (TC10/TC11); pagination skip=5/take=5 for page=2/pageSize=5 (TC12); pageSize clamp to 100 (TC13); pinned sort order (TC9).

Documentation accuracy assessment:
- docs/features/forums.md accurately documents: 401-first ordering for createTopic; board lookup + oracle parity gate (identical TOPIC_NOT_FOUND_MESSAGE for nonexistent vs non-readable boards, P12); title type guard then content validation -> 400; body type guard -> 400 then normalizeMarkdownBody; validateMarkdownBody -> 400 before any DB write; pageSize 1-100 clamp; deletedAt IS NULL exclusion from topic list; PublicTopicShape and PublicAuthorShape allowlisted field tables; GET/POST route table with correct status codes; complete error contract tables for both endpoints.
- No inaccuracies, omissions, or contradictions found. Documentation is complete and matches the implemented and tested behavior.

Verdict:
- PASS
