Reviewer Report

Feature plan reviewed:
- plans/forums-listing-enhancements-and-fixes-plan.md (READY FOR COORDINATION; ST1-ST7).
- Comparison base: main; integrated diff reviewed via `git diff main...HEAD` on worktree branch forums-listing-reviewer-20260610 (off coordination base forums-listing).

Inputs reviewed:
- Governing plan plans/forums-listing-enhancements-and-fixes-plan.md (feature restatement, D1-D6, P1-P5, assumptions, Documentation Impact, per-ST acceptance criteria and dependency ordering).
- Integrated source diff: apps/api/src/forums/forums.{service,types}.ts, forums.controller (unchanged), database/database.config.ts, new migration 1780893000000-forum-description-length.ts; apps/web/app/forums/{page.tsx,forums-client.ts,[boardSlug]/page.tsx,forums.module.css}, apps/web/app/admin/forums/page.tsx; tests forums.service.test.ts, forums.service.integration.test.ts, forums.spec.ts, forums-admin.spec.ts.
- Docs: docs/features/forums.md, docs/features/web-shell.md, docs/guides/content-management.md.
- Per-subtask artifacts ST1-ST7 (implementer/tester/documenter/[security]/verifier reports + result JSONs); ST2 history/pass1 superseded first-pass artifacts.
- Re-run validation on the integrated branch: pnpm lint (PASS), typecheck (PASS), @sfus/api vitest run, @sfus/web vitest run.

Overall feature completeness:
- Feature behavior is complete and correct against the plan. All ST1-ST7 acceptance criteria, resolved decisions D1-D6, planner decisions P1-P5, the three assumptions, and the Documentation Impact section are delivered.
- Cross-subtask integration is exact: ST2 adds PublicTopicShape.lastPostAuthor and the resolveTopicLastActivity primitive (+resolveTopicLastActivityAuthors wrapper that nulls non-reply topics); ST3 reuses resolveTopicLastActivity directly for board-level lastPost (reply-vs-opening-post author + effective timestamp) and adds topicCount/postCount/lastPost (BoardLastPostShape); the web consumers ST5 (forums/page.tsx) and ST6 ([boardSlug]/page.tsx) parse and render those exact shapes via forums-client.ts.
- ST1: NULLS LAST literal removed from listRecentTopics orderBy, stale comments corrected, defense-in-depth boardId IN (...) predicate present in addition to the isBoardPubliclyReadable allow-list; returned set unchanged; oracle-safe empty-list path preserved. The 'Recent Forum Activity panel shows an error' item is resolved by ST1 with NO web change (recent-forum-activity.tsx unchanged) - confirmed.
- ST4: new migration 1780893000000 (> 1780892561355) widens forum_categories.description and forum_boards.description to varchar(512) with a working down() to varchar(255), registered last in reviewedMigrationClasses; assertFieldLengthValid enforces description<=512 / name<=128 with a 400 BadRequestException before persistence in create/update Category/Board (update validates only supplied fields); FORUM_DESCRIPTION_MAX_LENGTH / FORUM_NAME_MAX_LENGTH exported.
- ST5/ST6: semantic <table> layouts, encodeURIComponent on every username and slug, displayName ?? username, absolute dates via toLocaleDateString, 'No posts yet' / em-dash fallbacks, badges + pagination preserved, no dangerouslySetInnerHTML. ST7: maxLength 128 (name) / 512 (description) on the shared category+board create/edit forms with a 'max 512 characters' hint; server 400 messages surfaced via setActionError(e.message).
- Feature-level security posture is sound. Specialist Security review ran and PASSed for ST1-ST4 (per P1: data-isolation / untrusted-input / migration surface); it was correctly omitted for the web subtasks ST5-ST7 (which carry security ACCEPTANCE-CRITERIA only and consume already-public data) - no security_* artifacts exist under ST5-ST7. All new aggregate / last-activity queries are public-only and soft-delete-excluded; the migration+validation enforcement boundary is server-side; the web subtasks satisfy username-encoding / no-raw-HTML / server-as-enforcement criteria.
- Documentation coverage matches the plan's Documentation Impact: forums.md (ST1 ordering note + defense-in-depth, ST2 lastPostAuthor + primitive contracts, ST3 aggregates + BoardLastPostShape, ST4 validation rules + constants, ST5/ST6 web rendering); web-shell.md (ST6 4-column board view route note); content-management.md (ST4/ST7 length limits and behavior).
- lint and typecheck PASS on the integrated branch. HOWEVER both test suites are RED on the integrated branch (see BLOCKING findings): 1 stale API assertion and 2 brittle web assertions. These are test-only defects with no production-code or security impact; the feature itself is correct. Verdict is CONDITIONAL PASS - merge/closeout is gated on a small test-only remediation to restore a green integrated suite. The gated MySQL integration specs skip cleanly without SFUS_DB_INTEGRATION=1 (11 API specs skipped).

Findings

BLOCKING
- apps/api/src/database/database.config.test.ts:84 - Integrated API test suite is RED: the exact-match reviewedMigrationNames assertion was not updated for ST4's newly registered migration, so the full @sfus/api vitest run fails (1 failed | 982 passed | 11 skipped).
  ST4 correctly registered ForumDescriptionLength1780893000000 in reviewedMigrationClasses (database.config.ts), but this pre-existing test pins the literal migration list and was outside ST4's allowed-files set, so no stage updated it. Every subtask's acceptance criteria require 'the API test suite passes'; the integrated suite does not. Fix: append "ForumDescriptionLength1780893000000" to the expected array at line 84-90 (test-only; no production change).
- apps/web/app/admin/forums/forums-admin.spec.ts:376,390 - Integrated web test suite is RED: two ST7 'name input enforces maxLength=128' tests assert maxLength={128} appears at a LOWER source-string index than the name placeholder, contradicting the delivered JSX attribute order (maxLength is rendered on the line AFTER placeholder). @sfus/web vitest run fails (2 failed | 624 passed).
  The implementation is correct - page.tsx carries maxLength={128} on both name inputs (lines 418, 500) and maxLength={512} on both description inputs (439, 521), and the companion 'two occurrences total' test passes. The two failing assertions encode a false ordering assumption (placeholder precedes maxLength in source). Fix the assertions to not depend on attribute source order (e.g. assert co-occurrence within the input element, or drop the index-ordering check). Test-only; no production or security impact.

WARNING
- None

NOTE
- apps/api/src/forums/forums.service.ts - Board-level lastPost timestamp for a reply uses topic.lastPostAt (which is not decremented on reply soft-delete), while the reply AUTHOR is correctly re-resolved to the latest non-deleted reply via resolveTopicLastActivity.
  Edge case: if a topic's most-recent reply is soft-deleted, the displayed lastPost author is the next non-deleted reply's author (correct) but the displayed timestamp can still reflect the soft-deleted reply's time. Author/visibility safety is unaffected (only public, non-deleted authors are exposed); the discrepancy is a cosmetic last-activity date. Acceptable for this feature; candidate cleanup if reply soft-delete becomes common.
- apps/api/src/forums/forums.types.ts - TopicLastActivity.at is documented as carrying the latest-reply createdAt but the implementation always sets it to null; ST3 derives the effective timestamp from topic.lastPostAt/createdAt instead.
  Internally consistent and correct (the only consumer, ST3 board aggregation, ignores .at and uses the topic entity timestamps), but the field is effectively unused and its JSDoc slightly overstates what it returns. Minor: simplify or align the doc in a future touch.

Missed functionality or edge cases:
- No missing feature functionality. Every plan item (ST1-ST7, D1-D6, P1-P5, the 'recent panel error' item, and the Documentation Impact) is delivered and integrates consistently across the API/web boundary.
- The only gaps are validation-integrity defects: the integrated API and web test suites do not pass (two BLOCKING test-only findings above). Both are mechanical to fix and carry no production-code or security risk.
- Two low-priority cosmetic NOTEs (board lastPost timestamp on reply soft-delete; unused TopicLastActivity.at field) do not affect correctness or oracle/visibility safety.

Follow-up feature requests for planning:
- Test-fix (BLOCKING, pre-closeout): update apps/api/src/database/database.config.test.ts to add "ForumDescriptionLength1780893000000" to the expected reviewedMigrationNames array so the full @sfus/api suite is green after ST4's migration registration.
- Test-fix (BLOCKING, pre-closeout): rework the two source-ordering assertions in apps/web/app/admin/forums/forums-admin.spec.ts (AC7 name-input maxLength tests, ~lines 376 and 390) so they verify maxLength={128} is present on the name inputs without assuming it precedes the placeholder in source order; the implementation is already correct.
- Cleanup (optional, future): when computing board lastPost in ForumsService.listPublicCategories/getBoard, derive the reply timestamp from the latest NON-DELETED reply (consistent with the author resolution) rather than topic.lastPostAt, so a soft-deleted latest reply cannot leave a stale last-activity date.
- Cleanup (optional, future): either populate TopicLastActivity.at with the resolved reply timestamp or remove the field and tighten its JSDoc, since it is currently always null and unused by callers.

Artifacts written:
- artifacts/forums-listing-enhancements-and-fixes/reviewer_report.md
- artifacts/forums-listing-enhancements-and-fixes/reviewer_result.json

Final outcome:
- CONDITIONAL PASS
