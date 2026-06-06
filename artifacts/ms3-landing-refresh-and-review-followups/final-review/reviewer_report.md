Reviewer Report

Feature plan reviewed:
- plans/ms3-landing-refresh-and-review-followups-plan.md (7 subtasks; reviewer follow-ups from the prior Milestone 3 CONDITIONAL PASS in artifacts/ms3-completion-and-copilot-port/final-review/)

Inputs reviewed:
- artifacts/ms3-landing-refresh-and-review-followups/subtask-{1..7}/ implementer/tester/documenter/verifier reports and result JSON (all four roles present for every subtask)
- Verifier verdicts: subtasks 1-6 PASS; subtask 7 CONDITIONAL PASS (2 warnings, 2 notes)
- Direct code inspection on ms3-claude: apps/web/app/register/page.tsx, apps/web/app/login/login-client.tsx, apps/web/app/page.tsx, apps/web/components/recent-posts-feed.tsx, apps/api/src/navigation/navigation.service.ts, apps/api/src/blog/blog.controller.ts, apps/api/src/blog/blog.service.ts, apps/api/src/media/media.controller.ts, apps/api/src/pages/pages.service.ts, apps/web/app/pages/pages-client.ts, apps/web/app/blog/blog-client.ts
- docs/README.md (navigation filtering, navigation_items migration attribution, comments visibility invariant, media failure modes, optional slug, landing description), docs/website-launch-guide.md, docs/deferred-tasks.md
- Validation runs: web test suite 172/172 PASS; API test suite 256/262 PASS with 6 pre-existing navigation.controller.test.ts failures (cwd-based path resolution defect predating this plan, flagged as pre-existing by every subtask verifier)

Overall feature completeness:
- All seven subtasks are delivered, tested, documented, and verified, and every security-motivated fix was independently re-verified in code: navigation now resolves single-segment non-reserved /<slug> links against published standalone_pages (with RESERVED_PAGE_SLUGS passthrough and safe [] fallback preserved); listComments' UUID fallback uses the new findPublishedById enforcing status=published AND publishedAt<=now; media serving attaches a stream error handler (ENOENT->404, headers-sent->socket destroy, other->500); register/login distinguish service-unavailable (network/5xx) from credential errors with the misleading prerequisites/migrations text removed; the landing page has zero Milestone 2 references, a RecentPostsFeed (latest 3, loading/empty/error states), and visible /blog and /about links; blog slug is optional with title-derived, collision-suffixed, empty-title-fallback generation; PagesService.create persists standalone_pages before page_revisions, eliminating the fk_page_revisions_page_id 500.
- Documentation obligations are satisfied: navigation_items is attributed to 1748736000000-milestone-three-content-foundation.ts with no reference to the deleted migration; docs/deferred-tasks.md records the six MS3 deferred-scope items (reviewer follow-up C5).
- Three feature-level gaps remain, none blocking: (1) the admin error-envelope fix is absent in pages-client.ts and only partial in blog-client.ts, so the feature-level AC 'admin page/blog API errors surface the real server message in the UI' is only partially met; (2) PagesService.create is a sequential non-transactional three-step save, leaving the plan's transactional-atomicity AC unmet; (3) subtasks 3 and 4 were marked security-review-required but no specialist security artifacts exist anywhere under this plan's artifact tree.

Findings

BLOCKING
- None

WARNING
- apps/web/app/pages/pages-client.ts:87-185 - The subtask-7 admin error-envelope fix was never implemented: all eight page admin calls still read payload?.message instead of payload?.error?.message, so real server errors never surface in the page admin UI.
  This was explicit subtask-7 scope and part of the feature-level acceptance criterion 'admin page/blog API errors surface the real server message in the UI'. The subtask-7 verifier records it as 'explicitly deferred by coordinator', but the deferral is not recorded in docs/deferred-tasks.md (which per policy is edited only during planning), so without a planner-facing follow-up the gap will be silently lost. The original symptom (generic 'Failed to create page.' masking the real error) remains for any future page admin failure.
- apps/web/app/blog/blog-client.ts:126,141-348 - The blog admin error-envelope fix is partial: only adminCreatePost reads payload?.error?.message; update, publish, unpublish, schedule, feature-toggle, delete, and all comment-moderation calls still read payload?.message.
  Subtask 6's scope and acceptance criterion say blog admin failures should surface the real server message ('an API error during blog admin actions shows the real server message'), not only create failures. Every non-create blog admin error still collapses to the generic fallback because payload?.message is always undefined under the JsonExceptionFilter envelope.
- apps/api/src/pages/pages.service.ts:125-169 - PagesService.create is a sequential non-transactional three-step save; the plan's transactional-atomicity acceptance criterion ('A create failure cannot leave an orphaned standalone_pages row without its revision or vice versa') is unmet.
  If revisionRepository.save or the final pageRepository.save throws, a draft standalone_pages row with currentRevisionId=null and no revision is left behind. The slug is then occupied, so a retry of the same create fails until the orphan is manually removed. The subtask-7 verifier issued CONDITIONAL PASS on this basis; impact is bounded (draft-only rows, admin-only surface) but the explicit plan AC stands unsatisfied.
- artifacts/ms3-landing-refresh-and-review-followups - Subtasks 3 and 4 are marked 'Security review required: yes' in the plan and their implementer prompts announce a specialist Security stage, but no security_report.md/security_result.json artifacts exist anywhere under this plan's artifact tree.
  The workflow's specialist security-review obligation for the two publication-leakage fixes was skipped without a recorded waiver. Residual risk is low — this reviewer independently re-verified both fixes in code (navigation /<slug> resolution against published pages with reserved-slug passthrough; findPublishedById enforcing the full status+publishedAt predicate), both changes strictly narrow the public surface, and tester coverage exercises the leak cases directly — but the plan-mandated stage should be run retroactively or the waiver formally recorded.
- apps/api/src/pages/pages.service.test.ts:133-183 - The FK insert-order regression test uses fully mocked repositories and verifies only JS call ordering; the plan's Risk #7 mitigation explicitly required an integration-style test against a schema with the foreign key enforced.
  Mocked unit tests are exactly what allowed the original FK bug to ship undetected (they passed while production returned 500). The call-order assertion is a useful guard but cannot prove the real DB constraint is satisfied, so the class of bug this plan fixed still has no schema-enforced regression net.

NOTE
- apps/api/src/navigation/navigation.controller.test.ts:7 - Pre-existing (not introduced by this plan): 6 tests fail under 'pnpm --filter @sfus/api test' because the controller path is resolved from process.cwd() ('apps/api/src/...'), which doubles to 'apps/api/apps/api/...' when vitest runs with cwd=apps/api.
  The API suite cannot pass clean under the documented per-package test invocation, forcing every role in this plan to hand-wave '6 pre-existing failures unrelated'. A persistent known-failing block erodes the signal value of the suite and risks masking a real future failure.
- apps/web/app/public-shell.spec.ts - Subtask-1 source-contract coverage asserts the register page's service-unavailable copy but not the login client's service-unavailable/credential message strings (subtask-1 verifier NOTE).
  A regression to the login error copy or status-code branching would not be caught by the spec suite; risk is low since the logic was directly verified, but the asymmetry with the register coverage is an easy gap to close.
- apps/api/src/navigation/navigation.service.ts:338 - A bare '/pages' nav URL (no slug segment) falls through to the top-level /<slug> matcher, is not in RESERVED_PAGE_SLUGS, and is looked up as a standalone page with slug 'pages' — silently omitted if none is published (subtask-3 verifier WARNING; near-impossible admin misconfiguration).
  Fail-closed direction is safe (an entry is hidden, nothing leaks), but the behavior is undocumented and untested; adding 'pages' (and 'blog') to the reserved set or documenting the edge would remove the code/docs gap.
- apps/api/src/blog/blog.service.ts:552-572 - deriveUniqueSlug uses check-then-insert (TOCTOU) for uniqueness; near-simultaneous creates with identical titles could both pass the check and one would surface the DB unique-constraint violation as a 500.
  The DB unique constraint is a hard backstop so no data corruption is possible, the plan (D8) does not require a transactional guarantee, and the surface is admin-only; accepted characteristic, recorded for awareness.
- apps/api/src/media/media.controller.test.ts:174-303 - serveImage has error-path coverage only (ENOENT 404, headers-sent destroy, other-I/O 500); there is no happy-path unit test asserting content type, length, and piped bytes for a present file.
  The hardening change did not touch the normal pipe path, so risk is low, but a future regression to normal serving would not be caught at the unit level.
- apps/api/src/pages/pages.service.ts:115-124 - The create() JSDoc documents the FK-aware three-step insert order but does not disclose that the steps are not wrapped in a transaction.
  A maintainer adding error handling or retries may assume atomicity from the documented guarantee; this gap compounds the missing-transaction WARNING and should be fixed together with it.

Missed functionality or edge cases:
- Admin error-message surfacing (pages admin entirely, blog admin beyond create) — the only user-visible plan scope that did not ship; the original 'generic error masks the real failure' symptom persists for those paths.
- Transactional atomicity of PagesService.create and a schema-enforced (non-mocked) FK regression test — both explicitly required by the plan (AC line 155 and Risk #7 mitigation), both absent.
- Specialist security-review stage for the two security-marked subtasks (3 and 4) — no security artifacts or recorded waiver exist; this reviewer's independent code re-verification mitigates but does not replace the mandated stage.
- Every accepted/intentional gap is otherwise recorded: the /about link may 404 until an admin publishes the page (decision D5, accepted), deferred MS3 scope is in docs/deferred-tasks.md, and remaining items above are converted to follow-up requests below.

Follow-up feature requests for planning:
- Complete the admin error-envelope fix deferred from this plan: change all admin/moderation calls in apps/web/app/pages/pages-client.ts and the remaining calls in apps/web/app/blog/blog-client.ts (update, publish, unpublish, schedule, feature, delete, comments moderation) to read payload?.error?.message with the existing generic fallback, matching the JsonExceptionFilter envelope; record the deferral in docs/deferred-tasks.md during the planning cycle and add source-contract specs for the corrected error chains.
- Make PagesService.create transactional (single DB transaction around the page-insert, revision-insert, and currentRevisionId update) to satisfy the unmet atomicity acceptance criterion, update the create() JSDoc to state the transactional guarantee, and add the plan-required integration-style test that exercises create() against a schema with fk_page_revisions_page_id enforced rather than fully mocked repositories.
- Run the specialist security-review stage retroactively for the navigation publication-leak fix (subtask 3) and the blog listComments visibility fix (subtask 4), or formally record a waiver in the workflow artifacts, so the plan's security-review-required markers have a corresponding security_report.md/security_result.json.
- Fix the pre-existing path-resolution defect in apps/api/src/navigation/navigation.controller.test.ts (resolve the controller path relative to the test file, e.g. import.meta.url, instead of process.cwd()) so 'pnpm --filter @sfus/api test' passes 262/262 and pre-existing-failure hand-waving is no longer needed; consider adding 'pages' and 'blog' to RESERVED_PAGE_SLUGS or a test documenting the bare '/pages' nav-URL edge case while in that module.

Artifacts written:
- artifacts/ms3-landing-refresh-and-review-followups/final-review/reviewer_report.md
- artifacts/ms3-landing-refresh-and-review-followups/final-review/reviewer_result.json

Final outcome:
- CONDITIONAL PASS
