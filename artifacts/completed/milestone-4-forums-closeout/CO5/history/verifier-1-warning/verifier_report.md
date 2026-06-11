Verifier Report

Scope reviewed:
- CO5 — Public unauthenticated GET /api/forums/recent endpoint. Implementer added RecentTopicShape, RecentTopicBoardStub, RecentTopicsQuery types; listRecentTopics() service method with limit/cap logic and isBoardPubliclyReadable filtering; listRecentTopics controller handler. Tester added 31 tests covering all 4 ACs. Documenter updated docs/features/forums.md with the new endpoint documentation. Security stage ran (CONDITIONAL PASS, 0 blocking, 1 warning, 2 notes); verifier independently confirms the forwarded WARNING.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-closeout-plan.md section CO5, acceptance criteria AC1–AC4 (AC5 = validation gate)

Convention files considered:
- AGENTS.md
- CLAUDE.md
- docs/development/api-conventions.md
- docs/features/forums.md
- docs/README.md

Findings

BLOCKING
- None

WARNING
- apps/api/src/forums/forums.controller.ts:200-204 - Non-finite ?limit input (e.g. ?limit=abc or ?limit=) causes parseInt to yield NaN; the clamp Math.min(20, Math.max(1, NaN ?? 5)) does NOT neutralize NaN (NaN ?? 5 stays NaN), so qb.take(NaN) throws TypeORMError → unauthenticated HTTP 500.
  The controller parses the ?limit query string with parseInt(limit, 10). When the input is non-numeric (e.g. 'abc') or empty, parseInt returns NaN. The service receives NaN as query.limit. Because NaN is not null/undefined, the nullish coalescing operator (query.limit ?? RECENT_TOPICS_DEFAULT_LIMIT) does NOT substitute the default — it propagates NaN. Math.min(20, Math.max(1, NaN)) also yields NaN. qb.take(NaN) causes TypeORM to throw a TypeORMError, which the global JsonExceptionFilter maps to a generic HTTP 500. This contradicts (a) AC4's 'stable empty list' contract and (b) the JSDoc on listRecentTopics (service.ts lines 809-810): 'Always returns a stable list.' The 500 body is the sanitized generic error message with no stack or PII, so no data is leaked. The discriminability side-effect (500 when >= 1 public board exists, 200 when none) leaks only information already publicly disclosed by GET /api/forums/categories. Fix: add a Number.isFinite guard before the clamp, e.g. const parsedLimit = parseInt(limit, 10); const safeParsed = Number.isFinite(parsedLimit) ? parsedLimit : undefined; or check isNaN before passing to the service. A regression test for ?limit=abc and ?limit= should accompany the fix. Severity confirmed as WARNING (not blocking): no auth bypass, no data leak, fix is trivial, discriminability is a minor pre-disclosed signal.

NOTE
- apps/api/src/forums/forums.service.ts:812-829 - NaN→500 path is reachable only when publicBoardIds.length > 0; when no public boards exist the early-return [] path fires first, yielding 200. This means malformed ?limit acts as a weak oracle for 'at least one publicly-readable site board exists.'
  This is a side-effect of the WARNING above and is informational only. The information leaked ('at least one publicly-readable site board exists') is already fully and openly disclosed by GET /api/forums/categories. The P12 oracle property that matters (excluded content indistinguishable from 'no activity') is fully preserved. Resolving the WARNING also removes this signal.
- apps/api/src/forums/forums.service.ts:833-857 - leftJoinAndSelect hydrates the full UserEntity and ForumBoardEntity into memory; only selected fields reach the wire via the explicit per-field mapper.
  The QueryBuilder uses leftJoinAndSelect for author and board, which reads all columns from those entities into memory. The mapper then builds RecentTopicShape selecting only username/displayName and board name/slug, so no sensitive column reaches the HTTP response. The explicit per-field mapper (not an entity spread) is the same defensive pattern used by toTopicShape/toBoardShape elsewhere in this service, and the CO5 tests assert absence of email/globalRole/id/authorUserId/boardId/etc. As pure defense-in-depth, a future cleanup could narrow the JOIN to leftJoin + explicit addSelect of only the needed columns. Optional, non-blocking.

Test sufficiency assessment:
- SUFFICIENT for the core correctness and security properties, with one gap tied to the WARNING. CO5 service tests (31 new tests) cover: default limit 5, explicit in-range limit (10), hard cap at 20; ordering lastPostAt DESC NULLS LAST then createdAt DESC; exclusion of members/private/project-scoped boards with createQueryBuilder asserted NOT called (oracle-safe); WHERE IN includes only public board ids; deletedAt IS NULL andWhere; early-return [] when no boards / when all boards fail the predicate; public-safe RecentTopicShape with explicit absence assertions for email/globalRole/id/authorUserId/boardId/isLocked/isPinned/body/replyCount/deletedAt/updatedAt and board.id/board.visibility; lastPostAt null pass-through. CO5 controller tests cover: no resolveSession call (route is public), limit parsing/delegation, undefined-limit pass-through, stable {topics:[]} empty envelope, and {topics} wrapping. GAP: no test for adversarial non-numeric/empty ?limit (e.g. ?limit=abc, ?limit=); such a test would currently surface the NaN→500 behavior. A regression test should accompany the input-clamp fix.

Documentation accuracy assessment:
- ACCURATE and COMPLETE. docs/features/forums.md was updated (commit 2921d76) with a new 'Recent topics feed (CO5)' section including: route, query parameter table, sort order, visibility filter description, RecentTopicShape field table, RecentTopicBoardStub definition, and a Visibility filtering and oracle safety (P12) subsection accurately describing the implementation. The new row in the route table also matches the implementation. JSDoc in controller (lines 175-199) and service (lines 789-811) accurately document the endpoint contract. No inaccuracies or contradictions found. One minor gap: the documentation does not yet note that malformed ?limit values fall back to the default (once the WARNING is resolved, the 'always returns a stable list' claim in the JSDoc and docs will be fully accurate).

Artifacts written:
- artifacts/milestone-4-forums-closeout/CO5/verifier_report.md
- artifacts/milestone-4-forums-closeout/CO5/verifier_result.json

Verdict:
- CONDITIONAL PASS
