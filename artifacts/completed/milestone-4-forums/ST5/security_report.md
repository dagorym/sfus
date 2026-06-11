Security Review Report

Scope reviewed:
- Milestone 4 ST5 — Posts: create, threading, quoting, locked-topic, paginated read. Forum leak surface (Risk R1, P12) plus one-level threading validation.
- Diff base ms4 = 5588cde (ST4 verifier pass-2); ST5 change set = c5b28fa..d5dfdcd.
- apps/api/src/forums/forums.service.ts — createPost, listPosts, POST_NOT_FOUND_MESSAGE, toPostShape, board+topic visibility predicate, locked-topic gate, threading validation.
- apps/api/src/forums/forums.controller.ts — POST/GET /forums/topics/:topicId/posts (401 ordering).
- apps/api/src/forums/forums.types.ts — PublicPostShape, PaginatedPostsShape, CreatePostInput.
- Reused trust primitives confirmed: AuthorizationService.evaluate() (shared visibility), normalizeMarkdownBody+validateMarkdownBody (shared sanitizer in media/markdown-sanitizer.ts), AuthService.resolveSession (401).

Why specialist review was triggered:
- Plan marks ST5 security-review-required: dominant P12 visibility/oracle surface on new read+write paths plus threading validation (Risk R1 — highest).
- New write path (post create) + new public read path (post list) both query gated forum resources; a re-derived or partial predicate, an existence oracle, or a sanitizer bypass would leak hidden-board/topic existence or content.
- Threading validation introduces a NEW cross-topic existence-oracle risk: an invalid parentId must not reveal whether a post exists in a different (possibly private) topic.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST5 (lines 219-237), ST5 prompt (746-769), Risk R1 (564-565).
- docs/development/agent-retrospective-patterns.md P12 (lookup-path visibility + oracle parity).
- docs/features/blog.md (lock + threading + oracle precedents); docs/features/media.md (shared Markdown sanitizer); docs/features/forums.md (ST5 post-route contract).
- ACs verified: full visibility predicate via evaluate(); gated==nonexistent==soft-deleted uniform 404; locked topic 403; invalid parentId uniform 400 with no existence oracle; deterministic oldest-first paginated read.

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.service.ts:705 - quotedPostId is persisted as an opaque, unvalidated soft-reference (input.quotedPostId ?? null) with no same-topic/membership check.
  Non-blocking for ST5: the API never resolves quotedPostId to content server-side (grep of apps confirms no join/lookup), and the post-list endpoint only returns posts inside the requested, already-gated topic — so quotedPostId is echoed only as an id string and cannot leak content from a non-readable topic via this API. The residual risk is entirely deferred to the ST16 web render layer, which MUST fetch any quoted content through the same gated GET /forums/topics/:topicId/posts predicate (never a privileged/direct lookup) and must treat a cross-topic or private-topic quotedPostId as non-resolvable. Documented as a web-layer obligation; flagging so ST16 inherits it.
- apps/api/src/forums/forums.types.ts:164 - Stale code comment on PublicPostShape says it 'Omits ... parentId internal FK', but the shape and toPostShape intentionally expose parentId.
  Cosmetic only — no leak. parentId is a same-topic post id (not a sensitive cross-tenant identifier) and its exposure is required for client threading. The shipped docs/features/forums.md correctly describe the exposed fields and the flat createdAt-ASC,id-ASC ordering; only this inline type comment is inconsistent. Recommend a one-line comment correction in a later pass.

Test sufficiency assessment:
- SUFFICIENT for all eight security concerns. Validation matrix run in THIS worktree (not the main checkout): pnpm exec vitest run --root apps/api src/forums/forums.controller.test.ts src/forums/forums.service.test.ts -> 173/173 passed (service 112, controller 61); pnpm typecheck -> pass; pnpm lint -> pass (eslint --max-warnings=0). pnpm install --frozen-lockfile succeeded.
- VISIBILITY: createPost+listPosts both gate via isBoardPubliclyReadable(topic.board) (shared evaluate()-based helper, no inline predicate); spy tests assert AuthorizationService.evaluate() is invoked on both paths.
- ORACLE PARITY: tests assert gated==nonexistent==soft-deleted topic all return identical TOPIC_NOT_FOUND_MESSAGE for both createPost and listPosts.
- THREADING NO-ORACLE: invalid-b (parentId in different topic) and invalid-c (reply-to-a-reply) each assert msgA===msgB against the nonexistent-parent case — proving a uniform 'parentId is invalid.' 400 with no cross-topic existence oracle; save asserted not-called.
- LOCKED TOPIC: isLocked -> ForbiddenException(403) and postSave asserted not-called.
- AUTH ORDERING: controller test asserts forumsService.createPost is NOT called when resolveSession rejects (401 before any data op); listPosts test asserts resolveSession is never touched (public route).
- INPUT GUARD: body=undefined/42/{} each -> BadRequestException(400), not a 500 TypeError, save not-called; unsafe <script> and javascript: bodies -> 400 before persistence.
- SHAPE: createPost and listPosts shape tests assert authorUserId/topicId/deletedAt absent and only author.username/displayName + quotedPostId(+parentId) present.
- PAGINATION: order {createdAt:ASC,id:ASC} asserted; pageSize 999->100 and 0->1 clamps asserted; deletedAt IsNull() exclusion asserted as a regression guard.

Documentation / operational guidance assessment:
- SUFFICIENT. docs/features/forums.md documents the ST5 post create/list routes, the full board+topic visibility gate, uniform 404 oracle-parity message, locked-topic 403, the uniform parentId 400 with explicit 'no existence oracle' language, the quotedPostId soft-reference (render deferred to web/ST16), the PublicPostShape stripped-field allowlist, and the deterministic createdAt-ASC/id-ASC oldest-first pagination + clamp + soft-delete exclusion.
- Controller JSDoc and @Api* decorators document the 201/400/401/403/404 contract. Only the inline PublicPostShape type comment (NOTE-2) is stale; user-facing docs are accurate.

Artifacts written:
- artifacts/milestone-4-forums/ST5/security_report.md
- artifacts/milestone-4-forums/ST5/security_result.json

Outcome:
- PASS
