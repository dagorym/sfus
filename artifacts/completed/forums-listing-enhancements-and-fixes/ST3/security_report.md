Security Review Report

Scope reviewed:
- ST3 of the forums-listing-enhancements-and-fixes plan: per-board aggregates (topicCount, postCount, lastPost) added to the public, unauthenticated forum APIs GET /forums/categories (listPublicCategories) and GET /forums/boards/:id (getPublicBoard).
- Files reviewed (git diff forums-listing...HEAD): apps/api/src/forums/forums.types.ts (BoardLastPostShape; PublicBoardShape gains topicCount/postCount/lastPost), apps/api/src/forums/forums.service.ts (listPublicCategories + getPublicBoard aggregate logic, toBoardShape stats param, reply-count grouping, reuse of ST2 resolveTopicLastActivity), apps/api/src/forums/forums.service.test.ts (new aggregate tests + qbStub additions), docs/features/forums.md.
- Supporting context inspected: isBoardPubliclyReadable (public-board allow-list gate), resolveTopicLastActivity primitive, ForumPostEntity / ForumTopicEntity data model, PublicAuthorShape PII boundary, createTopic/createPost write paths, and the public controller endpoints.

Why specialist review was triggered:
- Plan decision P1 marks ST3 security-sensitive: the new aggregates run batch SQL over forum data and PUBLICLY expose counts, authors, and timestamps to unauthenticated callers.
- Threats considered: leaking existence/volume/authorship/timing of non-public, members-only, or project-scoped boards/topics; SQL injection in the new aggregate queries; PII exposure via lastPost.author.

Acceptance criteria / plan reference:
- plans/forums-listing-enhancements-and-fixes-plan.md (ST3); plan decision P1.
- Security acceptance criteria: public-only counting; soft-delete exclusion; SQL safety (bound params, safe empty batches, no cross-board/non-public subversion); no oracle/enumeration leak; no PII leakage (lastPost.author limited to username + displayName).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.service.ts:532-534, 632 - lastPost.at for the reply case is derived from topic.lastPostAt, which is set at reply-create time and is never reset on post soft-delete. If post soft-deletion is ever added, lastPost.at could surface the timestamp of a now-soft-deleted reply (author stays correct — always the latest non-deleted reply's author from resolveTopicLastActivity).
  Not currently reachable: no service path soft-deletes forum posts (the deleted_at column exists but is only ever written as null at create time), so post.deleted_at is always NULL in practice today and this cannot leak. Flagged as forward-compatibility: when post soft-delete is introduced, also recompute/reset topic.lastPostAt, or source lastPost.at from the non-deleted-reply rows returned by resolveTopicLastActivity, so a soft-deleted reply's timestamp cannot surface. Non-blocking.
- apps/api/src/forums/forums.service.test.ts:239-633 - ST3 aggregate tests are mock/stub-based (qbStub). Soft-delete exclusion and IN-list binding are asserted via stubbed query returns, not exercised against a real database; the SQL WHERE/JOIN/GROUP BY correctness rests on code inspection.
  The new queries read correctly under inspection (deleted_at IS NULL on outer query, MAX subquery, and the forum_topics re-join; bound :...params; empty-batch guards), and they pass 197 unit tests, but a real-DB integration test for soft-deleted topic/reply exclusion would harden against future query-shape regressions. Consistent with the module's existing unit-test pattern; non-blocking.

Test sufficiency assessment:
- ADEQUATE for this change. forums.service.test.ts adds AC1-AC8 coverage for both listPublicCategories and getPublicBoard: topicCount/postCount math, postCount sourced from the direct reply-count query (not the stale topic.replyCount), empty-board lastPost=null, reply-case and opening-post-fallback lastPost, most-recent-activity selection across topics, exact lastPost/author shape (no extra fields), and soft-delete-exclusion regression guards. Full suite: 197/197 passed.
- Gap (non-blocking, NOTE): tests are mock-based, so soft-delete exclusion and IN-binding are validated by stub returns rather than against a real DB. SQL correctness verified by inspection. A real-DB integration test would strengthen confidence.

Documentation / operational guidance assessment:
- ADEQUATE. docs/features/forums.md documents BoardLastPostShape and the new PublicBoardShape fields, and states the security-relevant semantics explicitly: topicCount/postCount/lastPost reflect only non-deleted content; soft-deleted topics and replies are excluded; project-scoped (scopeType != 'site') and non-publicly-readable boards are excluded from all counts and from listing/aggregate queries; lastPost.author is limited to { username, displayName }.

Artifacts written:
- artifacts/forums-listing-enhancements-and-fixes/ST3/security_report.md
- artifacts/forums-listing-enhancements-and-fixes/ST3/security_result.json

Outcome:
- PASS
