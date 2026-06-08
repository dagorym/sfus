Security Review Report

Scope reviewed:
- Specialist security review of Milestone 4 subtask ST4 - Topics: create, paginated read, visibility, pinned ordering.
- Change set vs base (ST3 verifier PASS, 7d29a42..HEAD): apps/api/src/forums/forums.service.ts (createTopic, listTopics, TOPIC_NOT_FOUND_MESSAGE, toTopicShape), forums.controller.ts (POST/GET /forums/boards/:boardId/topics), forums.types.ts (PublicTopicShape, PaginatedTopicsShape, CreateTopicInput, PublicAuthorShape), plus forums tests and docs/features/forums.md.
- Forum leak surface: new read+write paths on Risk R1 / retrospective pattern P12 (visibility filtering + oracle parity + sanitizer-before-persist + shape allowlisting).

Why specialist review was triggered:
- Plan marks ST4 'Security review: required' as the dominant P12 surface (visibility + oracle parity on new read+write paths). Plan: plans/milestone-4-forums-plan.md lines 201-217, Risk R1 lines 564-567.
- agent-retrospective-patterns.md P12: every lookup path must enforce the full visibility predicate; gated and nonexistent lookups must be 404-indistinguishable.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md - ST4 (lines 201-217) and Risk R1 (lines 564-567).
- docs/features/media.md / apps/api/src/media/markdown-sanitizer.ts (shared Markdown sanitizer).
- docs/features/forums.md (ST4 topic routes, pagination contract, response shapes, oracle parity).
- docs/development/agent-retrospective-patterns.md P12 (visibility/oracle leak pattern).

Findings

BLOCKING
- None

WARNING
- apps/api/src/forums/forums.service.ts:504 - createTopic calls normalizeMarkdownBody(input.body) without the `?? ""` null/undefined guard used by the blog precedent (blog.service.ts:184,434). A request with a missing or non-string body field throws a TypeError -> HTTP 500 instead of a clean 400, and there is no global ValidationPipe (verified absent in index.ts/app.module.ts) to coerce/reject it first.
  Non-blocking and fail-closed: the throw occurs before any persistence so no unsafe content is ever stored, and the board visibility gate runs first so it is not an existence oracle (only reachable on an already-public-readable board). Impact is a 500 instead of a 400 for a malformed body. Recommend matching the blog precedent (`input.body ?? ""`) or adding an explicit string assertion before normalize for clean 400 parity. P12 precedent-matching.
- apps/api/src/forums/forums.service.test.ts:1220 - The soft-delete exclusion (`where: { boardId, deletedAt: IsNull() }`, service.ts:569) is implemented but not directly test-asserted. listTopics tests assert order (TC9), skip/take (TC12), and clamping (TC13) but no test inspects the where clause for deletedAt IS NULL, so a regression that dropped the soft-delete filter (leaking deleted topics) would not be caught by the unit suite.
  Implementation is correct today; this is a missing negative-coverage guard, not an active leak. Recommend an assertion that findAndCount is called with where containing deletedAt: IsNull() so a future change cannot silently expose soft-deleted topics.

NOTE
- apps/api/src/forums/forums.service.ts:496 - createTopic and listTopics both gate on isBoardPubliclyReadable (the ST3 helper), which evaluates the anonymous actor (userId:null, role:"") via AuthorizationService.evaluate(). This means a 'members'-visibility or 'project-only' board is neither topic-listable nor topic-creatable by an authenticated member who could otherwise read it.
  This is conservative / fail-closed: it can only be MORE restrictive than the actor's own read scope, so it cannot leak a topic across visibility scopes. It is an acceptable ST4 scoping choice (topics live on public site boards for this milestone). Flagged only so a later subtask that intends member-scoped boards re-evaluates the predicate with the real actor rather than widening isBoardPubliclyReadable.

Test sufficiency assessment:
- Validation matrix GREEN (run from this worktree): vitest run forums.controller.test.ts + forums.service.test.ts = 140 tests passed (57 controller, 83 service); pnpm typecheck = pass (apps/api + apps/web); pnpm lint = pass (--max-warnings=0).
- Security-critical behaviors are covered: oracle parity for create and list asserts byte-identical TOPIC_NOT_FOUND_MESSAGE via toBe for gated-vs-nonexistent boards (TC1-TC4); evaluate() is invoked on the readable path (TC5/TC6 spies); 401-before-any-service-call asserted with forumsService.createTopic not called (TC14); unsafe Markdown <script> and javascript: link rejected 400 with save NOT called (TC7/TC8); public shape strips authorUserId/boardId/isLocked/movedByUserId/lockedByUserId/deletedAt and exposes only author.username/displayName (TC10/TC11); pagination offset (TC12) and pageSize clamp to 100 (TC13) and pinned order (TC9).
- Gap: soft-delete (deletedAt IS NULL) exclusion is implemented but not directly asserted (see WARNING). No member-vs-public board-visibility differential test for the create path (covered conceptually by the anonymous-predicate NOTE).

Documentation / operational guidance assessment:
- docs/features/forums.md accurately documents the ST4 security contract: identical TOPIC_NOT_FOUND_MESSAGE for nonexistent vs hidden boards (oracle parity, P12), the 401-first ordering, the normalizeMarkdownBody -> validateMarkdownBody before-persist sequence with <script>/javascript: examples, pageSize clamping 1-100, soft-delete (deletedAt IS NULL) exclusion, and the explicit PublicTopicShape/PublicAuthorShape allowlist with the stripped internal-field list.
- Documentation is sufficient for safe operation; no documentation finding. Recommend a brief note clarifying the malformed-body (missing body) response once the WARNING above is addressed.

Artifacts written:
- artifacts/milestone-4-forums/ST4/security_report.md
- artifacts/milestone-4-forums/ST4/security_result.json

Outcome:
- CONDITIONAL PASS
