Security Review Report

Scope reviewed:
- Specialist security review of ST2 (forums-listing-enhancements-and-fixes): enrich GET /api/forums/boards/:boardId/topics with last-reply author via the new ForumsService.resolveTopicLastActivityAuthors primitive (raw/builder SQL over forum_posts joined to users).
- Reviewed git diff main...HEAD for: apps/api/src/forums/forums.types.ts (PublicTopicShape.lastPostAuthor), apps/api/src/forums/forums.service.ts (toTopicShape param; new resolveTopicLastActivityAuthors; listTopics threading), apps/api/src/forums/forums.service.test.ts (new ST2 tests), docs/features/forums.md.
- Also inspected supporting entities (forum-post.entity.ts, user.entity.ts) and the listTopics visibility gate call site.
- Ran the plan's named validation commands: vitest src/forums/forums.service.test.ts, pnpm lint, pnpm typecheck.

Why specialist review was triggered:
- Plan decision P1: ST2 is a security-sensitive API subtask touching untrusted input (board/topic ids), a NEW SQL query path (raw/builder SQL over forum_posts JOIN users with a correlated MAX(created_at) subquery and a soft-delete filter), and PUBLIC exposure of author identity.
- Confirm: (1) SQL injection safety, (2) no board-visibility / oracle bypass, (3) no PII leakage, (4) correct latest-non-deleted-reply selection so no soft-deleted content's author is surfaced.

Acceptance criteria / plan reference:
- plans/forums-listing-enhancements-and-fixes-plan.md — ST2 acceptance criteria (lines 229-267) and Planner decision P1 (lines 95-97).
- Security acceptance criteria from the security task prompt: parameter-bound ids (no interpolation); visibility gate precedes author resolution; PublicAuthorShape exposes only username/displayName; soft-deleted-latest-reply fallback to next non-deleted reply, else null.

Findings

BLOCKING
- None

WARNING
- apps/api/src/forums/forums.service.ts:514 - LINT FAILS on the committed branch: 'openingAuthors' is defined but never used (@typescript-eslint/no-unused-vars). The plan's named `pnpm lint` validation command exits non-zero. The openingAuthors parameter is accepted by resolveTopicLastActivityAuthors but never read in the method body.
  The ST2 acceptance criterion 'lint passes' is not met, contradicting the tester/verifier PASS reports. Not a security vulnerability, but a blocking quality gate that must be remediated before merge. The Verifier must re-run lint and require a fix (either remove the unused param or implement the documented opening-author fallback).
- apps/api/src/forums/forums.service.test.ts:36-53, 1260-1299 - API UNIT SUITE FAILS on a clean worktree install: `vitest run src/forums/forums.service.test.ts` reports 1 failed / 165 passed. The pre-existing ST4 test TC11 ('returned topic shapes lack internal fields ...') throws 'this.postRepository.createQueryBuilder(...).select is not a function'. listTopics now always calls resolveTopicLastActivityAuthors, but the shared createMinimalRepository qbStub only stubs leftJoinAndSelect/where/andWhere/orderBy/addOrderBy/take/getMany and omits select/addSelect/innerJoin/getRawMany; TC11 feeds a non-empty topic page so the new code path hits the unstubbed .select.
  The plan's named vitest validation command does not pass clean; the test mock was not updated to cover the new last-activity query path for the TC11 case. Not a production-code security defect, but the ST2 acceptance criterion 'API test suite passes' is unmet and contradicts upstream PASS reports. The Verifier must re-run the suite on a clean install and require the mock to be completed (or TC11's post-repo wired with a raw QB stub).
- apps/api/src/forums/forums.service.ts:504-543 - PRIMITIVE CONTRACT GAP: the plan and the method's own docstring state the 'last activity' primitive should fall back to the opening post's author when a topic has no non-deleted replies, but the implementation ignores openingAuthors entirely and always returns null for no-reply topics. The ST2 tests (forums.service.test.ts:2912-2918) explicitly assert toBeNull() even with openingAuthors populated, codifying the missing fallback.
  For ST2's lastPostAuthor (null when no reply) the current behavior is correct and security-safe — no opening author is mis-surfaced as a 'last reply'. However ST3 is planned to reuse this primitive expecting the opening-author fallback; as written ST3 would silently receive null. Forward this to the Verifier (and onward to ST3) so the primitive either implements the documented fallback or the docstring/plan reuse expectation is corrected. The root cause is the same unused parameter flagged by the lint WARNING.

NOTE
- apps/api/src/forums/forums.service.ts:512-535 - SQL safety CONFIRMED: resolveTopicLastActivityAuthors binds ids via .where("post.topic_id IN (:...topicIds)", { topicIds }); no string interpolation of any untrusted value. The correlated MAX(p2.created_at) subquery and the deleted_at IS NULL filters use only column references and SQL literals, not user input. An early return for empty topicIds prevents a degenerate empty IN () list.
  Eliminates injection on the new SQL path; the only externally-influenced values (topic ids) are passed through the parameter binder, never concatenated.
- apps/api/src/forums/forums.service.ts:641-685 - VISIBILITY/ORACLE PARITY CONFIRMED: resolveTopicLastActivityAuthors is invoked at listTopics:672, strictly AFTER the board lookup + isBoardPubliclyReadable gate (lines 643-646) that throws the oracle-parity 404. topicIds derive solely from findAndCount({ where: { boardId, deletedAt: IsNull() } }), so only non-deleted topics within the already-gated board are resolved. The per-topic-scoped MAX subquery prevents cross-board/cross-topic contamination. 404 message (TOPIC_NOT_FOUND_MESSAGE) is unchanged for nonexistent and non-readable boards.
  Authors are never resolved for topics in members-only / private / project-scoped or nonexistent boards; the new code cannot be used as a visibility or existence oracle.
- apps/api/src/forums/forums.service.ts:519-538 - NO PII LEAKAGE CONFIRMED: the query projects only post.topicId, u.username, u.display_name via getRawMany (no entity hydration), and maps to PublicAuthorShape ({ username, displayName } only). users columns email, id, global_role, status, bio are never selected or returned. PublicTopicShape.lastPostAuthor reuses the same PublicAuthorShape (forums.types.ts:106-128). Soft-deleted posts' authors are never selected (post.deleted_at IS NULL plus MAX over non-deleted).
  Public exposure of last-reply identity is limited to the same minimal, already-public author fields used elsewhere; no private user data crosses the trust boundary.
- apps/api/src/forums/forums.service.ts:527-533 - LATEST-NON-DELETED SELECTION CONFIRMED: both the outer predicate (post.deleted_at IS NULL) and the subquery (MAX(p2.created_at) WHERE p2.deleted_at IS NULL) exclude soft-deleted posts, so a soft-deleted latest reply correctly falls back to the next non-deleted reply; all-deleted or no-replies yields null (result Map seeded null, overwritten only by query rows). No deleted content's author is attributed as current activity.
  Prevents surfacing the author of removed/moderated content as the topic's current last participant.
- apps/api/src/forums/forums.service.ts:527-533 - Low-severity correctness edge (NOT security): if two non-deleted posts in the same topic share an identical created_at (precision-3 datetime), post.created_at = MAX(...) matches both rows, and the result Map keeps whichever row arrives last (non-deterministic among two legitimate non-deleted authors). No deleted author can leak via this path.
  Purely a tie-break determinism note; both candidate authors are valid current participants, so there is no confidentiality or integrity impact. Mentioned for completeness.

Test sufficiency assessment:
- Security-relevant behavior is well covered by the new ST2 unit tests: deleted_at IS NULL filter asserted; null returned for no-reply and all-soft-deleted cases; non-null reply author for present replies; oracle-parity 404 for nonexistent and gated (members/project-only) boards (AC6); author shape excludes email/globalRole (toTopicShape tests at lines 2731-2732).
- Gaps: (1) the SQL string is not asserted at the binding level (makeRawQb echoes provided rows), so parameter-binding and the MAX subquery are validated by direct source review rather than tests; (2) the suite does NOT currently pass clean — TC11 fails because the shared query-builder mock was not extended for the new last-activity query path; (3) no test covers the opening-author fallback because it is unimplemented.
- Direct source inspection of forums.service.ts confirms parameter-bound ids, column-only correlated subquery, and minimal projection — the security properties hold in the production code independent of the failing test.

Documentation / operational guidance assessment:
- docs/features/forums.md accurately documents the security-relevant semantics: lastPostAuthor exposes only username/displayName, is null when no non-deleted reply (replyCount===0 or all replies soft-deleted), excludes soft-deleted posts, and resolves in a single batched query (no N+1). Adds a defense-in-depth note for listRecentTopics.
- Doc/contract mismatch: the docs describe resolveTopicLastActivityAuthors as accepting an opening-author map but (correctly, matching code) state it returns null for no-reply topics — so docs are internally consistent with the code, while the PLAN's primitive 'fallback to opening author' expectation remains unimplemented. The Verifier/ST3 should reconcile the plan reuse expectation with the as-built null-returning behavior.

Artifacts written:
- artifacts/forums-listing-enhancements-and-fixes/ST2/security_report.md
- artifacts/forums-listing-enhancements-and-fixes/ST2/security_result.json

Outcome:
- CONDITIONAL PASS
