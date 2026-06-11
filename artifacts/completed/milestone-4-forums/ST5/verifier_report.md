Verifier Report

Scope reviewed:
- Milestone 4 ST5 — Posts: create (reply) and paginated read with threading, quoting, locked-topic, and visibility gating.
- Changed files: apps/api/src/forums/forums.service.ts (createPost, listPosts, toPostShape, POST_NOT_FOUND_MESSAGE), apps/api/src/forums/forums.controller.ts (POST+GET /forums/topics/:topicId/posts), apps/api/src/forums/forums.types.ts (PublicPostShape, PaginatedPostsShape, CreatePostInput, PostListQuery).
- Test files: forums.service.test.ts (27 new ST5 tests), forums.controller.test.ts (5 new ST5 tests). Total ST5 tests: 32.
- Documentation: docs/features/forums.md — post routes section added.
- Security artifacts: artifacts/milestone-4-forums/ST5/security_report.md / security_result.json — PASS (0 blocking, 0 warning, 2 informational notes).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md (ST5, lines 219-237); ST5 acceptance criteria confirmed.

Convention files considered:
- docs/features/forums.md (post routes, threading, oracle parity)
- docs/features/blog.md (lock/threading precedent)
- docs/features/authorization.md (evaluate())
- docs/features/media.md (shared markdown sanitizer)
- docs/development/api-conventions.md (error envelope, routing prefix)
- AGENTS.md

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.types.ts:163 - Stale inline type comment on PublicPostShape says it 'Omits ... parentId internal FK' but parentId is intentionally exposed.
  Cosmetic inconsistency only. The field is required for client-side threading. docs/features/forums.md correctly lists parentId as an exposed field. No behavior or security impact. Carried forward from security NOTE-2.
- apps/api/src/forums/forums.types.ts:179 - PaginatedPostsShape JSDoc describes a two-level sort ('parentId IS NULL first, then createdAt ASC') but the implementation uses a flat createdAt ASC, id ASC order.
  The implementation and docs/features/forums.md are both correct and mutually consistent (flat oldest-first). The type comment is misleading and implies a parent-first grouping that does not exist. Cosmetic only — no delivery risk.
- apps/api/src/forums/forums.service.ts:705 - quotedPostId is persisted as an opaque, unvalidated soft-reference; web rendering deferred to ST16.
  The API does not resolve quotedPostId to content server-side; the post-list endpoint returns it as an opaque id string only. No content from a non-readable topic can be leaked via this API. ST16 must fetch quoted content through the same gated GET endpoint. Forwarded as a web-layer obligation per the security report.

Test sufficiency assessment:
- SUFFICIENT. 173/173 forums tests pass (service: 112, controller: 61) from this worktree. Full suite: 709/709 non-integration tests pass (0 failures). Typecheck: 0 errors. Lint: 0 warnings.
- All 7 acceptance-criteria dimensions are directly tested with non-vacuous assertions:
-   (1) 401-before-service: controller test asserts createPost spy not called when resolveSession rejects.
-   (2) Gated/nonexistent 404 oracle parity: createPost and listPosts each assert gatedMsg===missingMsg===TOPIC_NOT_FOUND_MESSAGE.
-   (3) Locked-topic 403: ForbiddenException asserted and save spy confirmed not called.
-   (4) parentId invalid-a/b/c: uniform BadRequestException with identical message (no oracle); save not called.
-   (5) Unsafe Markdown / non-string body: BadRequestException before save; three body type variants tested.
-   (6) Post public shape: authorUserId, topicId, deletedAt absent; author.username/displayName and quotedPostId present.
-   (7) listPosts pagination: createdAt ASC+id ASC order, deletedAt IsNull, pageSize clamped to 100 and 1, skip/take offset.

Documentation accuracy assessment:
- ACCURATE. docs/features/forums.md post-routes section correctly documents: the full board+topic visibility gate, uniform 404 oracle-parity message, locked-topic 403 message, body type-guard and sanitizer order (steps 1-8), parentId uniform 400 with explicit no-oracle language, quotedPostId soft-reference (render deferred to ST16), PublicPostShape field table with exposed parentId, deterministic createdAt-ASC/id-ASC oldest-first pagination, clamp bounds (1-100), and soft-delete exclusion.
- The two stale inline type comments (NOTE-1 and NOTE-2 above) are the only inaccuracies; user-facing documentation is fully accurate.

Artifacts written:
- artifacts/milestone-4-forums/ST5/verifier_report.md
- artifacts/milestone-4-forums/ST5/verifier_result.json

Verdict:
- PASS
