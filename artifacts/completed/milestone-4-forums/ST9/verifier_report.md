Verifier Report

Scope reviewed:
- ST9 — Enforce ST8 throttle + link-limit at three protected member-create routes: POST /forums/boards/:boardId/topics (createTopic), POST /forums/topics/:topicId/posts (createPost), POST /blog/:postId/comments (createComment).
- Implementer: wired ThrottleService + exceedsLinkLimit in forums.controller.ts and blog.controller.ts; imported ThrottleModule + UsersModule into ForumsModule and BlogModule; added THROTTLE_CONFIG to ThrottleModule exports.
- Tester: added 23 new ST9-labeled tests covering over-limit (429 fail-closed), under-limit pass, auth-before-throttle ordering, identity/tier wiring, link-limit (400), and new-account-tier non-vacuousness using real ThrottleService + InMemoryThrottleStore.
- Documenter: updated docs/features/forums.md, docs/features/blog.md, docs/development/api-conventions.md.
- Security stage: PASS — 0 blocking, 0 warning, 2 info findings (security_report.md + security_result.json committed).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST9 (lines 302-316), R2 (lines 568-570), R6 (lines 578-579).
- Acceptance criteria: forum topic/post and blog comment create rate-limited (429); new-account tier demonstrably stricter; link-over-limit bodies rejected (400); no throttle logic duplicated; enumerate all wired sites; docs updated.

Convention files considered:
- AGENTS.md
- docs/development/api-conventions.md
- docs/development/testing.md
- docs/features/forums.md
- docs/features/blog.md

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.controller.ts:259 - Link-limit (400) runs before throttle (429) and before resource-existence gate — benign ordering carried from security report
  exceedsLinkLimit() runs before ThrottleService.checkRequest() and before any DB visibility gate. Benign: the link-limit is a body-content anti-abuse rejection that carries no resource-existence information, is identical for all targets regardless of board/topic existence, and does not weaken the throttle. Legitimate-shaped over-volume traffic still hits the throttle. Carried from security stage NOTE.
- apps/api/src/common/throttle/throttle.types.ts:61 - THROTTLE_CONFIG token defined in throttle.types.ts, added to ThrottleModule exports in ST9 — functionally correct
  ST9 adds THROTTLE_CONFIG to ThrottleModule's exports array so feature modules can inject ThrottleConfig. The token itself is defined in throttle.types.ts; the module re-exports it correctly. No security or correctness impact. Carried from security stage NOTE.

Test sufficiency assessment:
- STRONG and non-vacuous. Independently validated from this worktree: vitest run --root apps/api forums.controller.test.ts blog.controller.test.ts => 150/150 passed (111 forums + 39 blog). pnpm typecheck => clean. pnpm lint => clean.
- All three protected create sites have dedicated ST9 specs: over-limit -> 429 with persistence spy asserted not.toHaveBeenCalled() (fail-closed proven); under-limit pass-through; link-over-limit -> 400 with persistence not called.
- Auth-before-throttle ordering proven at all three sites: resolveSession rejects => checkRequest not.toHaveBeenCalled().
- Identity/tier wiring proven: checkRequest receives userId AND non-null userCreatedAt from usersService.findById; VACUOUS test proves null createdAt leaves tier inactive (3 requests pass under maxHits=10) while young real createdAt throttles at newAccountMaxHits=2.
- New-account-tier tests driven through real ThrottleService + InMemoryThrottleStore — confirms reuse of ST8 module, no reimplemented throttle logic.

Documentation accuracy assessment:
- Accurate and complete. docs/features/forums.md: documents 429 in topic-create and post-create route tables, lists auth->link-limit->throttle->persistence ordering, documents new-account tier, links to api-conventions.md.
- docs/features/blog.md: documents 429 in comment-create route table, notes new-account tier active.
- docs/development/api-conventions.md: new-account tier section documents tier as ACTIVE on all three ST9 routes, correct identity resolution, 429 envelope, storage seam, and per-post link limit. No dormant-tier language remains.
- Controller JSDoc accurately documents 400/401/404/429 contract and auth-before-throttle ordering at all three sites.

Artifacts written:
- artifacts/milestone-4-forums/ST9/verifier_report.md
- artifacts/milestone-4-forums/ST9/verifier_result.json

Verdict:
- PASS
