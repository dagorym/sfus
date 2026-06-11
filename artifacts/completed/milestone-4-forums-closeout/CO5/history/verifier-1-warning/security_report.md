Security Review Report

Scope reviewed:
- Subtask CO5 of the Milestone 4 forums closeout plan (plans/milestone-4-forums-closeout-plan.md): a new public, unauthenticated GET /api/forums/recent endpoint that surfaces the most-recently-active public forum topics for the landing-page feed.
- Reviewed surface: apps/api/src/forums/forums.controller.ts (public listRecentTopics handler, ?limit query param, lines 175-205); apps/api/src/forums/forums.service.ts (listRecentTopics(), lines 780-858, plus the shared isBoardPubliclyReadable predicate, lines 355-385); apps/api/src/forums/forums.types.ts (RecentTopicShape / RecentTopicBoardStub / RecentTopicsQuery, lines 242-281).
- Supporting evidence reviewed: apps/api/src/authorization/authorization.service.ts (evaluate()), authorization.types.ts, forum-board.entity.ts, forum-topic.entity.ts, users/entities/user.entity.ts, common/filters/json-exception.filter.ts, and the CO5 tests in forums.service.test.ts (lines 2394-2712) and forums.controller.test.ts (lines 1708-1766).

Why specialist review was triggered:
- Planner marked CO5 'Security review: required' (decision D7): it adds a NEW public no-auth read path that surfaces forum content site-wide.
- Central risks per the plan: (1) authorization/visibility leak of non-public content; (2) an oracle (existence-disclosure, P12) of excluded boards/topics; (3) over-exposure of internal/PII fields; (4) input abuse via the ?limit parameter; (5) soft-delete / cross-tenant (project-scoped) leakage.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-closeout-plan.md, section 'CO5 - Public "recent forum activity" API endpoint', acceptance criteria AC1-AC5 and the embedded Implementer prompt.
- P12 oracle-safety contract as established in docs/features/forums.md and the existing forums public-read surfaces (getPublicBoard / listTopics / listPosts use uniform NotFound messages and shared predicate).

Findings

BLOCKING
- None

WARNING
- apps/api/src/forums/forums.controller.ts:200-204 - A malformed ?limit query value (non-numeric, empty, or whitespace e.g. ?limit=abc or ?limit=) is parsed by parseInt(limit,10) to NaN; the service clamp Math.min(20, Math.max(1, query.limit ?? 5)) does NOT neutralize NaN (NaN ?? 5 keeps NaN), so qb.take(NaN) is reached and TypeORM throws TypeORMError, which the global JsonExceptionFilter maps to a generic HTTP 500.
  Verified empirically: negative/zero/float/huge/odd-radix values clamp correctly into [1,20], but non-numeric/empty/whitespace produce NaN -> take(NaN) throws (TypeORM SelectQueryBuilder.take, node_modules typeorm 0.3.28, lines 575-579) -> 500. This contradicts AC4 / the service doc 'always returns a stable list' and the 'stable empty list' contract, and lets an unauthenticated caller trivially trigger 500s. It is a robustness/availability defect, NOT a data leak: the 500 body is the sanitized generic 'An unexpected error occurred.' with no stack/PII. Fix: coerce a non-finite parsed limit back to the default (e.g. Number.isFinite check, or use the default when parseInt yields NaN) so all inputs clamp to [default, 20]. A controller/service test for ?limit=abc and ?limit= should accompany the fix.

NOTE
- apps/api/src/forums/forums.service.ts:812-829 - Side-effect of the WARNING above: because the NaN->500 path is only reachable when publicBoardIds.length > 0 (otherwise the early return [] at line 827-829 yields 200 {topics:[]}), a malformed ?limit yields 500 when at least one publicly-readable site board exists and 200 when none exist - a weak distinguishable signal.
  This only reveals 'at least one publicly-readable site board exists', which is already fully and openly disclosed by the existing GET /api/forums/categories endpoint. It does NOT disclose the existence of any EXCLUDED (members/private/project-scoped) board or topic, so the P12 oracle property that matters (excluded content indistinguishable from 'no activity') is preserved. Resolving the WARNING (clamp NaN to default) also removes this signal. Forwarded to the Verifier as informational; not blocking.
- apps/api/src/forums/forums.service.ts:833-857 - The QueryBuilder uses leftJoinAndSelect('topic.author','author') and leftJoinAndSelect('topic.board','board'), which hydrates the FULL UserEntity (including email, globalRole, status) and ForumBoardEntity (including scopeType, projectId, visibility) into memory. The response mapper then builds RecentTopicShape field-by-field, selecting only username/displayName and board name/slug, so no sensitive column reaches the wire.
  No leak: the explicit per-field mapper (not an entity spread) is the same hardening pattern used by toTopicShape/toBoardShape elsewhere in this service, and the CO5 tests assert absence of email/globalRole/id/authorUserId/boardId/body/etc. As pure defense-in-depth, a future cleanup could narrow the JOIN to a leftJoin with an explicit addSelect of only the needed columns so sensitive columns are never even read into memory. Optional, non-blocking.

Test sufficiency assessment:
- SUFFICIENT for the core security properties. Ran (grounding): npx pnpm@10.0.0 -C <worktree> --filter @sfus/api exec vitest run src/forums/forums.service.test.ts src/forums/forums.controller.test.ts -> 2 files passed, 262 tests passed (146 service + 116 controller), 0 failed.
- CO5 service tests cover: default limit 5, explicit in-range limit, hard cap at 20; ordering lastPostAt DESC NULLS LAST then createdAt DESC; exclusion of members/private/project-scoped boards with createQueryBuilder asserted NOT called (no oracle); WHERE IN includes only public board ids; deletedAt IS NULL andWhere; early-return [] when no boards / when all boards fail the predicate; public-safe RecentTopicShape with explicit absence assertions for email/globalRole/id/authorUserId/boardId/isLocked/isPinned/body/replyCount/deletedAt/updatedAt and board.id/board.visibility; lastPostAt null pass-through.
- CO5 controller tests cover: no resolveSession call (route is public), limit parsing/delegation, undefined-limit pass-through, stable {topics:[]} empty envelope, and {topics} wrapping.
- GAP (tie to the WARNING): there is NO test for an adversarial non-numeric/empty ?limit (e.g. ?limit=abc, ?limit=); such a test would currently surface the NaN->500 behavior. A regression test for this should accompany the input-clamp fix.
- isBoardPubliclyReadable predicate tests (ST3) independently confirm scopeType!='site' short-circuits before evaluate, and that site+public/unlisted pass while site+members/private/project-only fail - the same shared predicate CO5 relies on.

Documentation / operational guidance assessment:
- Controller-level JSDoc (forums.controller.ts:175-199) and service-level JSDoc (forums.service.ts:789-811) document the route, the public-safe shape, the visibility/oracle (P12) contract, ordering, and the default/hard-cap limits accurately.
- Plan-listed doc impact (docs/features/forums.md - endpoint + visibility/oracle contract) is the Documenter's deliverable and is in scope for CO5; the Documenter/Verifier should confirm docs/features/forums.md was updated with the new GET /forums/recent route and its visibility contract.
- Recommend the doc and code comments note the input-validation behavior for ?limit once the WARNING is resolved (malformed limit falls back to the default), so the 'always returns a stable list' guarantee is accurate.

Artifacts written:
- artifacts/milestone-4-forums-closeout/CO5/security_report.md
- artifacts/milestone-4-forums-closeout/CO5/security_result.json

Outcome:
- CONDITIONAL PASS
