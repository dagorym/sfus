Verifier Report

Scope reviewed:
- Implementer, Tester, Documenter, and Security changes for ST4 (Forum topics: create + paginated read with visibility and pinned ordering).
- Implementation: apps/api/src/forums/forums.service.ts (createTopic, listTopics, TOPIC_NOT_FOUND_MESSAGE, toTopicShape), forums.controller.ts (POST/GET /forums/boards/:boardId/topics), forums.types.ts (PublicTopicShape, PaginatedTopicsShape, CreateTopicInput, PublicAuthorShape, TopicListQuery).
- Tests: apps/api/src/forums/forums.service.test.ts (+12 ST4 tests), forums.controller.test.ts (+4 ST4 tests). Total 16 new ST4 tests; 140 forums tests overall.
- Documentation: docs/features/forums.md (topic routes section added).
- Security stage: artifacts/milestone-4-forums/ST4/security_report.md / security_result.json (CONDITIONAL PASS, 0 BLOCKING, 2 WARNING, 1 NOTE).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST4 (lines 201-217) and Risk R1 (lines 564-567).
- docs/features/forums.md — topic routes, pagination contract, response shapes, oracle parity.
- docs/development/agent-retrospective-patterns.md — P12 (visibility/oracle leak pattern).
- docs/features/media.md / apps/api/src/media/markdown-sanitizer.ts — shared Markdown sanitizer.

Convention files considered:
- AGENTS.md
- docs/development/api-conventions.md
- docs/features/authorization.md
- docs/features/forums.md
- docs/features/media.md
- docs/development/agent-retrospective-patterns.md (P12)

Findings

BLOCKING
- None

WARNING
- apps/api/src/forums/forums.service.ts:504 - createTopic calls normalizeMarkdownBody(input.body) without the null/undefined guard used by the blog precedent.
  blog.service.ts:184,434 calls normalizeMarkdownBody(input.body ?? ""), guarding against undefined/null. The forums service calls normalizeMarkdownBody(input.body) directly. normalizeMarkdownBody calls body.replace(...) which throws TypeError if body is undefined (no global ValidationPipe to coerce first). Result: HTTP 500 instead of 400 when body field is absent. Fail-closed: board gate (line 496) runs before sanitizer call; throw occurs before any DB write; not an existence oracle. Recommendation: add input.body ?? "" to match blog precedent.
- apps/api/src/forums/forums.service.test.ts:1220 - Soft-delete exclusion (deletedAt: IsNull()) is implemented but not directly test-asserted.
  listTopics passes { boardId, deletedAt: IsNull() } in the TypeORM where clause (service.ts:569). TC9/TC12/TC13 assert order, skip, and take via findAndCount spy call-args, but none verify that the where clause includes deletedAt: IsNull(). A regression removing the soft-delete filter would silently expose deleted topics without any test failure. The implementation is correct today. Recommendation: add expect.objectContaining({ where: expect.objectContaining({ deletedAt: IsNull() }) }) assertion to directly guard this invariant.

NOTE
- apps/api/src/forums/forums.service.ts:496 - Both createTopic and listTopics gate on isBoardPubliclyReadable (anonymous actor), so members-visibility and project-only boards are not accessible to authenticated members.
  isBoardPubliclyReadable uses the anonymous actor (userId:null, globalRole:'') via AuthorizationService.evaluate(), restricting access to public/unlisted boards only. This is conservative/fail-closed for ST4 scope. Flagged for future subtasks implementing member-scoped boards to use the real actor's credentials in evaluate() rather than widening isBoardPubliclyReadable.

Test sufficiency assessment:
- Validation matrix confirmed GREEN (run from this worktree): vitest run forums.controller.test.ts + forums.service.test.ts = 140 tests passed (57 controller + 83 service); pnpm typecheck = pass (apps/api + apps/web); pnpm lint = pass (--max-warnings=0).
- 16 new ST4 tests cover all acceptance criteria: TC1-TC4 assert oracle parity (TOPIC_NOT_FOUND_MESSAGE via toBe) for nonexistent and gated boards on both create and list; TC5/TC6 spy on AuthorizationService.evaluate() to confirm invocation on readable boards; TC7/TC8 assert unsafe Markdown (<script> and javascript: link) throws BadRequestException with topicRepository.save NOT called (before-persist assertion); TC9 asserts correct order object {isPinned:'DESC', lastPostAt:'DESC', createdAt:'DESC'}; TC10/TC11 assert internal field stripping (authorUserId, boardId, isLocked, movedByUserId, lockedByUserId, deletedAt absent) and author.username/displayName present; TC12 confirms skip=5, take=5 for page=2, pageSize=5; TC13 confirms pageSize=999 clamped to take=100; TC14 confirms UnauthorizedException is thrown and forumsService.createTopic is NOT called when session is missing.
- Coverage gap: no test directly asserts that findAndCount where clause contains deletedAt: IsNull() (see WARNING). A regression silently dropping the soft-delete filter would not be caught by the unit suite.

Documentation accuracy assessment:
- docs/features/forums.md accurately documents the full ST4 contract: TOPIC_NOT_FOUND_MESSAGE identical for nonexistent vs hidden boards (oracle parity, P12), 401-first ordering, the normalizeMarkdownBody -> validateMarkdownBody before-persist sequence with example rejection patterns (<script>, javascript:), pageSize clamping 1-100, soft-delete (deletedAt IS NULL) exclusion, and PublicTopicShape/PublicAuthorShape allowlist with the complete list of stripped internal fields.
- Documentation is accurate and consistent with the implementation and tests. No missing or inaccurate statements found. The undefined-body TypeError edge case is not documented, which is appropriate since it is a robustness gap and not documented behavior.

Artifacts written:
- artifacts/milestone-4-forums/ST4/verifier_report.md
- artifacts/milestone-4-forums/ST4/verifier_result.json

Verdict:
- PASS
