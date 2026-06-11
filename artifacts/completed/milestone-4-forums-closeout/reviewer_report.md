Reviewer Report

Feature plan reviewed:
- plans/milestone-4-forums-closeout-plan.md — Milestone 4 Forums Closeout (CO1–CO9): Workstream A review follow-ups (CO1–CO4) + Workstream B MS4 surfacing (CO5–CO9). Resolved decisions D1–D7.

Inputs reviewed:
- Governing plan: plans/milestone-4-forums-closeout-plan.md (all CO1–CO9 sections, Resolved Decisions D1–D7, Documentation Impact).
- Merged code on ms4a vs merge-base with main (git log main..ms4a — 9 subtasks, all PASS / security-PASS commits incl. CO5 NaN remediation cycle).
- CO1: apps/api/src/common/throttle/link-limit.ts (bare-scheme word-boundary guard) + link-limit.test.ts (51 tests green).
- CO2: apps/web/components/user-avatar.tsx (resolveAvatarSrc /api/media/ prefix guard) + user-avatar.spec.ts (24 tests green).
- CO3: apps/api/src/users/users.service.ts (escapeLikePrefix export) + users.service.test.ts (32 tests green).
- CO4: apps/web/app/forums/forums-client.ts (isLocked comment correction) + docs/features/forums.md.
- CO5: apps/api/src/forums/forums.controller.ts + forums.service.ts (listRecentTopics) + forums.types.ts; security_result.json (PASS pass-2) and verifier_result.json (PASS, 0/0).
- CO6: apps/web/app/page.tsx, apps/web/components/recent-forum-activity.tsx, forums-client.ts listRecentTopics; recent-forum-activity.spec.ts (14 tests green).
- CO7: apps/web/app/admin/page.tsx + apps/web/components/navigation.tsx; admin-dashboard.spec.ts (19) + navigation.spec.ts (19) green.
- CO8: apps/web/app/admin/forums/forums-admin-client.ts (12 typed functions) + forums-admin-client.spec.ts (78 tests green).
- CO9: apps/web/app/admin/forums/page.tsx; security_result.json (PASS, 0/0) + forums-admin.spec.ts (44 tests green).
- Docs: docs/features/forums.md, docs/features/web-shell.md, docs/guides/content-management.md, docs/development/api-conventions.md.
- Validation re-run on merged base: API forums/throttle/users suites 459 tests passed; web changed-area suites 249 tests passed.

Overall feature completeness:
- COMPLETE at the per-subtask acceptance level: every CO1–CO9 acceptance criterion and Resolved Decisions D1–D7 are satisfied by the merged code, tests, and docs. No CO subtask AC is unmet.
- Workstream A (CO1–CO4): CO1 bare-scheme branch now guards WORD_BOUNDARY_CHARS.has(charBefore) && charBefore !== '(' (link-limit.ts:121), mirroring the www. branch and preserving the markdown skipPositions exclusion (fail-safe direction). CO2 resolveAvatarSrc rejects any non-/api/media/ value (user-avatar.tsx:82). CO3 escapeLikePrefix is a named export with the call site unchanged. CO4 PublicTopicShape.isLocked comment now correctly states the field is stripped server-side (forums-client.ts:55).
- Workstream B (CO5–CO9): CO5 GET /api/forums/recent is visibility-filtered via the shared isBoardPubliclyReadable / AuthorizationService.evaluate() predicate (no inline re-derivation), returns a public-safe RecentTopicShape, orders lastPostAt DESC NULLS LAST then createdAt DESC, hard-caps at 20, and returns a stable empty list (oracle-safe).
- CO5 remediation CONFIRMED CLOSED: the malformed-?limit (NaN)→HTTP 500 defect is fixed by Number.isFinite(rawLimit) before take(limit) (forums.service.ts:817); 5 regression tests (NaN/Infinity/-Infinity service + ?limit=abc / ?limit= controller) are present and green; final security and verifier results are PASS, 0 blocking / 0 warning.
- Cross-subtask integration is sound: CO5 endpoint shape ({ topics: RecentTopicShape[] }) matches CO6 RecentTopicItem exactly; CO8's 12 typed functions map 1:1 to the admin controller routes/methods and are consumed by CO9; CO9's /admin/forums link resolves and is listed on the CO7 dashboard; admin gating (resolveProtectedSession + hasGlobalRole('admin')) is consistent across /admin, /admin/forums, and the nav entry; CO4↔CO6 serialized edits to forums-client.ts produced no regression (forums spec 51 tests green).
- Security obligations met: all four security-marked subtasks (CO1, CO2, CO5, CO9) received specialist security review with PASS outcomes. Public read paths (CO5/CO6) leak no non-public content; admin surfaces (CO7/CO8/CO9) treat the server as the enforcement boundary (client gating is UX-only); no dangerouslySetInnerHTML on rendered forum/user text and dynamic link segments use encodeURIComponent.
- Documentation is comprehensive and internally consistent: forums.md documents GET /forums/recent and the admin web management surface; web-shell.md documents the MS4 landing refresh, admin dashboard, and admin nav entry; content-management.md documents the admin dashboard and forum category/board how-tos; api-conventions.md notes the bare-scheme word-boundary rule.
- One feature-level (not subtask-level) gap and minor observations are recorded below; none is blocking.

Findings

BLOCKING
- None

WARNING
- apps/web/app/layout.tsx:14, 29, 46 - The global site chrome still brands the platform 'Milestone 3': the header eyebrow 'Milestone 3 Content Platform' (line 29), the metadata description '...Star Frontiers US Milestone 3 content platform.' (line 14), and the footer 'Built for the Milestone 3 content launch baseline.' (line 46). These render on the refreshed landing page and on every page.
  Workstream B's stated intent is to surface MS4 and update Milestone 3 copy to Milestone 4. CO6's AC1 ('No "Milestone 3" text remains on the landing page') is technically met for page.tsx, but layout.tsx was outside every CO subtask's allowed-files list, so the per-subtask pipeline correctly could not touch it. The result is a cross-subtask feature-level gap: the MS4 landing still displays 'Milestone 3 Content Platform' in persistent chrome, undercutting the refresh. Cosmetic/branding only — no functional or security impact — hence WARNING, not BLOCKING.

NOTE
- apps/api/src/forums/forums.service.ts:838-847 - CO5 carried two informational security NOTES about defense-in-depth JOIN narrowing. listRecentTopics builds an allow-list of public board ids and filters topics with WHERE topic.boardId IN (:...boardIds); the board/author relations are joined for shaping only. Visibility is correctly enforced by the allow-list, so the current behavior is sound.
  The allow-list already guarantees only public-board topics are returned, so there is no leak today. The NOTES are a hardening preference (push the public-board predicate into the JOIN/WHERE as a second layer), not a correctness defect. A future planning cycle may fold this into a forums query-hardening item; no action is required for closeout.
- apps/web/app/admin/forums/forums-admin-client.ts:149, 268, 246 - CO8 exposes all 12 admin functions per its AC, but CO9's page consumes adminListCategories plus the CRUD/reorder functions and does not call adminGetCategory / adminGetBoard / adminListBoards directly (the list endpoint returns categories-with-boards, making per-id fetches unnecessary for the current UI).
  This matches the plan: CO8's AC1 requires the client to expose ALL endpoints (it does), and CO9 only needs the functional subset. The unused getters are intentional surface for future admin views (e.g. a single-board editor) and are fully covered by CO8's own spec (78 tests). No gap — recorded only to confirm the client/page coupling was reviewed.
- plans/milestone-4-forums-closeout-plan.md:3 - The plan header still reads 'Status: IN PROGRESS' although all CO1–CO9 subtasks are merged, verified, and (where required) security-reviewed PASS. Per repository policy the plan/register is edited only during a planning cycle, not a coordinator-led development cycle, so this reviewer did not modify it.
  Purely a status-bookkeeping observation for the next planning cycle to flip to DONE/COMPLETE and move the plan to plans/completed/ alongside the prior milestones. No impact on the delivered feature.

Missed functionality or edge cases:
- No missed in-scope functionality: every CO1–CO9 acceptance criterion is delivered and every Resolved Decision D1–D7 is satisfied.
- Edge cases verified as handled: CO5 malformed/non-finite ?limit coerces to default (no 500); empty-public-activity returns a stable empty list; members/private/project-scoped boards are excluded oracle-safely; CO9 'category must have no boards' 400 is surfaced as a friendly message; admin gating denies non-admin and anonymous/onboarding sessions across /admin, /admin/forums, and the nav entry.
- The only feature-level shortfall is the WARNING above: the global layout chrome (header eyebrow, metadata description, footer) still reads 'Milestone 3', which falls outside any CO subtask's allowed files but contradicts the MS4-surfacing goal of the closeout. Pre-existing JSDoc 'Milestone 3' comments in markdown-editor/image-upload/markdown-renderer and historical references in *.spec.ts are non-chrome and correctly out of scope.

Follow-up feature requests for planning:
- Refresh the global site chrome to Milestone 4: update apps/web/app/layout.tsx so the header brand eyebrow ('Milestone 3 Content Platform'), the root metadata.description ('...Star Frontiers US Milestone 3 content platform.'), and the footer text ('Built for the Milestone 3 content launch baseline.') reflect the Milestone 4 feature set, consistent with the already-refreshed landing page (apps/web/app/page.tsx) and docs/features/web-shell.md. Include a layout/public-shell spec assertion that no 'Milestone 3' string remains in user-visible chrome, and update web-shell.md's header/layout description (currently still 'Milestone 3 Content Platform') to match. Scope: branding/copy only; no behavior change. Traceable to closeout WARNING (layout.tsx not in any CO allowed-files list).
- (Optional, low priority) Forums recent-feed query hardening: as a defense-in-depth second layer, push the public-board predicate into the listRecentTopics JOIN/WHERE in addition to the existing public-board-id allow-list, per the two informational NOTES carried out of CO5. The current allow-list already prevents any leak, so this is a hardening preference, not a defect fix.
- (Bookkeeping, planner only) On the next planning cycle, mark plans/milestone-4-forums-closeout-plan.md COMPLETE and relocate it under plans/completed/ alongside the other finished milestones, per the documented plan-lifecycle convention.

Post-review addenda (coordinator, 2026-06-09 — appended after the review at the user's direction; original reviewer findings above are unchanged):
- RESOLVED since review (closeout WARNING + follow-up #1): the apps/web/app/layout.tsx 'Milestone 3' chrome was fixed directly on ms4a in commit e348c31. The header eyebrow, root metadata.description, and footer now read 'Milestone 4' (description broadened to include community forums), and public-shell.spec.ts was updated with MS4 assertions plus a guard that no 'Milestone 3' string remains in layout chrome (576 web tests, typecheck, lint all green). web-shell.md's layout description was already updated under CO7. This follow-up is closed; no further planner action needed beyond awareness.
- NEW follow-up (forum category/board description length — surfaced during post-closeout admin smoke-test): creating a forum category via /admin/forums with a description longer than 255 characters fails with a generic 500 ('An unexpected error occurred'). Root cause: forum_categories.description and forum_boards.description are varchar(255); MySQL 5.7 runs with STRICT_TRANS_TABLES; and ForumsService.createCategory/updateCategory/createBoard/updateBoard validate name (non-empty) and slug (format) but perform NO length validation on description (or on name, varchar(128)) — unlike topic titles, which guard 255 at forums.service.ts:1070. Reproduced at the data layer: a 259-char description -> ERROR 1406 'Data too long for column description'; a 255-char value inserts cleanly. The admin endpoint is correctly gated (unauthenticated POST -> 401); the defect is the missing length validation, not authorization.
  Decided fix (next planning cycle, per user direction): (a) widen the category AND board description columns to varchar(512) via a new migration (the shortest real description being ported from the old site is 259 chars, so 512 gives headroom); (b) add server-side length validation in create/update for both category and board to the new 512 bound (and keep name within its 128-char bound), returning a friendly BadRequestException message rather than letting the DB error surface as a 500; (c) surface the limit on the /admin/forums create/edit form (e.g. note the max length and/or show a character counter) when creating or editing a category (and board). Scope covers categories and boards, create and update. No immediate code change was made; the reporting user is using a <=255-char description in the interim.

Artifacts written:
- artifacts/milestone-4-forums-closeout/reviewer_report.md
- artifacts/milestone-4-forums-closeout/reviewer_result.json

Final outcome:
- CONDITIONAL PASS
