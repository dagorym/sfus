Security Review Report

Scope reviewed:
- Specialist security RE-REVIEW of ST2 (REMEDIATION PASS 2) of forums-listing-enhancements-and-fixes: enrich the public topic-list API GET /api/forums/boards/:boardId/topics with the last-reply author, resolved at query time, via a new reusable primitive ForumsService.resolveTopicLastActivity and the listTopics-facing wrapper resolveTopicLastActivityAuthors (builder/raw SQL over forum_posts joined to users).
- Reviewed the ST2 diff on this branch (git diff forums-listing...HEAD): apps/api/src/forums/forums.types.ts (PublicTopicShape gains lastPostAuthor; new TopicLastActivity { author, at, isReply }); apps/api/src/forums/forums.service.ts (resolveTopicLastActivity primitive with opening-post fallback via openingAuthors; resolveTopicLastActivityAuthors wrapper mapping the fallback to null for listTopics; listTopics threading; toTopicShape lastPostAuthor param); apps/api/src/forums/forums.service.test.ts (extended qbStub + behavioral tests); docs/features/forums.md.
- Cross-checked supporting entities (forum-post.entity.ts column names topic_id/author_user_id/deleted_at/created_at; user.entity.ts to enumerate the private fields that must NOT leak) and the listTopics visibility gate call site (isBoardPubliclyReadable -> AuthorizationService.evaluate with an anonymous actor and scopeType='site').
- Re-ran the plan's named validation commands on a clean worktree install: vitest src/forums/forums.service.test.ts (174/174 pass), pnpm lint (clean, --max-warnings=0), pnpm typecheck (clean).
- Compared against the prior CONDITIONAL PASS (history/pass1/security_report.md) to confirm each of its three WARNINGs is remediated in the current state.

Why specialist review was triggered:
- Plan decision P1: ST2 is a security-sensitive API subtask. It feeds untrusted input (board/topic ids) into a NEW SQL query path (builder/raw SQL over forum_posts JOIN users with a correlated MAX(created_at) subquery and a soft-delete filter) and PUBLICLY exposes author identity on an unauthenticated endpoint.
- Confirm (1) SQL injection safety, (2) no board-visibility / 404-oracle bypass, (3) no PII leakage, (4) correct latest-non-deleted-reply selection and soft-delete fallback so no soft-deleted content's author is attributed.
- Re-review trigger: the prior pass was CONDITIONAL PASS; the implementation was remediated (lint/test/contract fixes) and must be re-reviewed in its CURRENT committed state.

Acceptance criteria / plan reference:
- plans/forums-listing-enhancements-and-fixes-plan.md — ST2 acceptance criteria and Planner decision P1 (security-sensitive marking).
- Security acceptance criteria from the security task prompt: parameter-bound ids (no string interpolation); empty-id array cannot produce a degenerate IN (); visibility gate strictly precedes author resolution; PublicAuthorShape / TopicLastActivity / query projection expose only username and displayName; soft-deleted-latest-reply falls back to the next non-deleted reply, else the opening-post author (surfaced as null by the ST2 wrapper); 404 oracle parity unchanged.
- Prior-pass baseline: artifacts/forums-listing-enhancements-and-fixes/ST2/history/pass1/security_report.md (CONDITIONAL PASS, three WARNINGs).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.service.ts:515-549 - RESOLVED (pass-1 WARNING: primitive contract gap). The 'last activity' primitive now reads openingAuthors. resolveTopicLastActivity returns { author, at:null, isReply:true } when a non-deleted reply exists, else falls back to openingAuthors.get(id) with isReply:false, else null. The wrapper resolveTopicLastActivityAuthors maps isReply:false to null for the ST2 listTopics contract.
  The pass-1 root cause (openingAuthors accepted but never read) is eliminated. The documented opening-post fallback is implemented for ST3 reuse, while ST2's public lastPostAuthor remains null for no-reply topics — no opening author is mis-surfaced as a 'last reply'. Security posture is unchanged-or-better: the fallback only ever surfaces the opening author already publicly attributed to the topic, and only via the full primitive, not via the public ST2 shape.
- apps/api/src/forums/forums.service.ts:521-541 - SQL SAFETY CONFIRMED (unchanged from pass-1). The latest-reply query binds ids via .where("post.topic_id IN (:...topicIds)", { topicIds }); no string interpolation of any untrusted value. The correlated SELECT MAX(p2.created_at) ... WHERE p2.deleted_at IS NULL subquery and the outer deleted_at IS NULL filter use only hardcoded column/table references and SQL literals. An early return for empty topicIds (length === 0 -> new Map()) prevents a degenerate IN ().
  No injection on the new SQL path: the only externally-influenced values (topic ids, themselves derived from gated server-side rows, not raw request input) pass through the parameter binder, never concatenated. The empty-array short-circuit is asserted by tests (getRawMany not called).
- apps/api/src/forums/forums.service.ts:684-728 - VISIBILITY / ORACLE PARITY CONFIRMED. resolveTopicLastActivityAuthors is invoked at listTopics:715, strictly AFTER the board lookup + isBoardPubliclyReadable gate (lines 686-689) that throws the oracle-parity 404 (TOPIC_NOT_FOUND_MESSAGE). topicIds derive solely from findAndCount({ where: { boardId, deletedAt: IsNull() } }), so only non-deleted topics within the already-gated board are resolved. isBoardPubliclyReadable routes through AuthorizationService.evaluate() with an anonymous actor and requires scopeType='site'. The only non-test call site is listTopics:715.
  Authors are never resolved for topics in members-only / private / project-scoped or nonexistent boards; the per-topic-scoped IN (...) plus MAX subquery prevents cross-board/cross-topic contamination. The new code cannot be used as a visibility or existence oracle, and the 404 message is unchanged for nonexistent and non-readable boards (asserted by AC6 oracle-parity tests).
- apps/api/src/forums/forums.service.ts:523-545 - NO PII LEAKAGE CONFIRMED. The query projects only post.topicId, u.username, u.display_name via getRawMany (no entity hydration). The reply-author lookup, the TopicLastActivity.author, and PublicTopicShape.lastPostAuthor all use PublicAuthorShape ({ username, displayName } only). users columns email, id, global_role, status, bio, avatar_media_id are never selected or returned. The isReply:false opening-post fallback only surfaces the opening author already publicly attributed to the topic (and is mapped to null by the ST2 wrapper regardless).
  Public exposure of last-reply identity is limited to the same minimal, already-public author fields used elsewhere in the forums API; no private user data crosses the trust boundary. Verified against user.entity.ts which carries email/global_role/status/bio.
- apps/api/src/forums/forums.service.ts:531-540 - LATEST-NON-DELETED SELECTION CONFIRMED. Both the outer predicate (post.deleted_at IS NULL) and the subquery (MAX(p2.created_at) WHERE p2.deleted_at IS NULL) exclude soft-deleted posts, so a soft-deleted latest reply correctly falls back to the next non-deleted reply (isReply:true); all-deleted or no-replies yields the opening-post fallback (isReply:false), surfaced as null by the ST2 wrapper. The result Map is seeded per id and overwritten only by query rows.
  A removed/moderated post's author is never attributed as the topic's current last participant. Covered by unit tests asserting the deleted_at IS NULL filter is present and that null is returned for the no-reply / all-soft-deleted cases.
- apps/api/src/forums/forums.service.test.ts:39-56 - RESOLVED (pass-1 WARNINGs: lint + test-suite failures). The shared createMinimalRepository qbStub now stubs select/addSelect/innerJoin and getRawMany, so the pre-existing topic-shape test no longer crashes on the new query path. The unused-parameter lint failure is gone now that openingAuthors is read. Re-verified on a clean worktree install: vitest 174/174 pass, pnpm lint clean (--max-warnings=0), pnpm typecheck clean.
  The two non-security quality gates that drove the prior CONDITIONAL PASS now pass, so the verdict is no longer gated on remediation of failing validations.
- apps/api/src/forums/forums.service.ts:531-540 - Carried-forward low-severity tie-break note (NOT security): if two non-deleted posts in the same topic share an identical created_at (precision-3 datetime), post.created_at = MAX(...) matches both rows and the result Map keeps whichever row arrives last — non-deterministic among two legitimate non-deleted authors.
  Purely a determinism edge; both candidate authors are valid current participants and no soft-deleted author can leak via this path, so there is no confidentiality or integrity impact. Mentioned for completeness.

Test sufficiency assessment:
- Adequate for the security-relevant behavior. New ST2 unit tests assert: the deleted_at IS NULL filter is present in the query; null is returned for no-reply and all-soft-deleted topics; the reply author is returned when a non-deleted reply exists; the opening-post fallback yields isReply:false (and null via the wrapper); empty topicIds short-circuits with no DB call; the projected author shape carries only username/displayName; and AC6 oracle-parity 404 is identical for nonexistent and gated (members) boards.
- Re-verified on a clean worktree install: 174/174 pass; the prior pass's single failing test (topic-shape test hitting the unstubbed query builder) is resolved by the extended qbStub.
- Residual (non-blocking) gap: the new builder/raw SQL is exercised only via a chainable stub (makeRawQb echoes provided rows); the real parameter binding, the correlated MAX(created_at) subquery, and the live soft-delete filtering are validated by direct source review rather than an executed DB integration test (forums.service.integration.test.ts is DB_INTEGRATION_ENABLED-gated and does not yet cover this path). The security properties hold by construction independent of that gap; an integration assertion is a hardening nice-to-have, not a blocker.

Documentation / operational guidance assessment:
- docs/features/forums.md accurately documents the security-relevant semantics: lastPostAuthor exposes only username/displayName, is null when there is no non-deleted reply (replyCount===0 or all replies soft-deleted), excludes soft-deleted posts, and resolves in a single batched query (no N+1).
- It also documents the TopicLastActivity descriptor and both functions, and explicitly distinguishes the ST2 wrapper (null for opening-post fallback) from the full primitive (opening-post fallback author + isReply flag) intended for ST3 reuse — resolving the pass-1 doc/contract mismatch.
- No operational/runbook changes are required for this read-path enrichment.

Artifacts written:
- artifacts/forums-listing-enhancements-and-fixes/ST2/security_report.md
- artifacts/forums-listing-enhancements-and-fixes/ST2/security_result.json

Outcome:
- PASS
