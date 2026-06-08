Security Review Report

Scope reviewed:
- Specialist security review of Milestone 4 subtask ST2 - Categories & boards admin management (CRUD).
- Change set vs base ms4: apps/api/src/forums/forums.controller.ts (11 admin endpoints + gate ordering); apps/api/src/forums/forums.service.ts (assertAdminManagementAccess, scope_type/visibility validation, create/update/delete/reorder); apps/api/src/forums/forums.types.ts (input DTOs). Supporting reads: entities/forum-board.entity.ts, authorization.service.ts (hasGlobalRole), blog.service.ts (gate parity), auth.service.ts (resolveSession/401), migration 1780890123767, docs/features/authorization.md and forums.md.
- Validation matrix run from this worktree after pnpm install --frozen-lockfile: lint, typecheck, vitest test, and the API tsc build.

Why specialist review was triggered:
- Plan marks ST2 Security review: REQUIRED. ST2 is the admin gate for forums AND it writes the visibility/scope_type values the entire downstream forum security model (ST3-ST6) keys off. A weak admin gate, or accepting an invalid/unexpected scope_type or visibility value, would undermine every downstream visibility decision.
- Retrospective patterns in scope: P1 (docs/code contract drift) and P12 (visibility predicates / existence oracles).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md - ST2 section (lines 164-180); ACs: 401/403 before any data op; create/update persist scope_type/visibility/project_id deterministically; invalid scope_type/visibility rejected 400; Swagger/JSDoc match the real status contract (P1).
- docs/features/authorization.md - visibility vocabulary: public | unlisted | members | project-only | private; hasGlobalRole admin gate semantics.
- docs/development/agent-retrospective-patterns.md - P1 (line 19), P12 (line 200).

Findings

BLOCKING
- apps/api/src/forums/forums.controller.test.ts:591-599 - Validation matrix is RED: 1 test fails ('adminDeleteCategory JSDoc documents 400 (boards still attached) and 404'). Test suite cannot be handed off green.
  Per ST2 outcome semantics a broken validation matrix is a blocking condition. Root cause is a mis-scoped source-slice assertion, NOT a real security-contract defect: the test slices the controller source from the first literal 'adminDeleteCategory' (byte 6874, the method signature at line 187) to the first 'adminReorderCategories' (byte 8122, line 211). adminDeleteCategory's JSDoc sits ABOVE the method name, so the slice starts after it and instead captures the reorder JSDoc, which contains '400' but not '404'. The delete handler's real contract IS correct and complete (forums.controller.ts line 177 '@throws 404 Category not found.' and line 186 '@ApiNotFoundResponse'). Fix the test slice (or anchor on the JSDoc), not the controller. The actual 404 security/error contract is accurate.

WARNING
- None

NOTE
- apps/api/src/forums/forums.service.ts:200-227,260-267,348-362 - INFO (positive): scope_type and visibility are validated against the exact allowed vocabularies BEFORE persistence on BOTH create and update paths; an out-of-vocabulary value is unstorable.
  assertScopeTypeValid restricts scope_type to {site, project} (forums.types re-exports forumBoardScopeTypes from the entity) and assertVisibilityValid restricts visibility to exactly {public, unlisted, members, project-only, private}, matching docs/features/authorization.md line 38. createBoard calls both validators (lines 202, 205) before boardRepository.save; updateBoard re-validates whenever scopeType/visibility is provided (lines 261, 265) before save. No create or update path can persist an unvalidated value, so the ST3-ST6 visibility model only ever sees known values. This is the security-critical control and it is correctly placed. DB columns are plain VARCHAR (migration lines 59-61) with no CHECK/ENUM, so the application-layer validator is the sole enforcement - acceptable for M4 but worth noting it is the only line of defense.
- apps/api/src/forums/forums.controller.ts:78-401 - INFO (positive): all 11 admin endpoints enforce 401 then 403 before any data operation, with no ungated route and no existence oracle ahead of the gate.
  Every handler calls authService.resolveSession (throws UnauthorizedException/401 for missing/invalid/expired session - auth.service.ts lines 558,568,577,585) THEN forumsService.assertAdminManagementAccess(session.user.globalRole) (throws ForbiddenException/403) BEFORE touching the repository. No data read/write or existence check precedes the gate, so non-admins receive a uniform 401/403 and get no existence oracle (P12 oracle risk is low because there is no public read path in ST2 - that is ST3). Only one @Controller and exactly 11 admin routes exist in the forums module (grep-confirmed); none is left ungated. Service-layer findOne/find/save/remove all use TypeORM parameterized where-clauses (no string interpolation), so slug/name/id inputs cannot inject into queries.
- apps/api/src/forums/forums.service.ts:45-49 - INFO (positive): assertAdminManagementAccess uses the identical hasGlobalRole('admin') semantics as BlogService - no weaker check, no role confusion.
  ForumsService.assertAdminManagementAccess calls this.authorizationService.hasGlobalRole(actorGlobalRole, 'admin') and throws 403 on failure - byte-for-byte the same gate as BlogService.assertAdminManagementAccess (blog.service.ts lines 72-76). hasGlobalRole (authorization.service.ts lines 30-40) returns false for null/undefined/unknown roles and uses rank comparison (admin=2), so a moderator or user cannot pass. No moderator-level shortcut is exposed on the forum admin surface.
- apps/api/src/forums/forums.service.ts:128-137,280-322 - INFO (positive): reorder and delete cannot corrupt cross-category state, and category delete is guarded against orphaning boards.
  reorderBoards scopes existing boards to where:{categoryId} and rejects (400) any orderedId not in that category's set, with strict length parity (lines 301-311) - a foreign-category board id cannot be folded in. reorderCategories applies the same parity/membership check over the full category set (lines 146-156). deleteCategory refuses (400) to delete a category that still has boards (lines 133-135), preventing orphaned boards; deleteBoard 404s on missing id before remove. All mutations are admin-gated at the controller, so a non-admin cannot reach them.
- apps/api/src/forums/forums.service.ts:223,268-270 - INFO: project_id is accepted as a free nullable string with no FK and no scope_type cross-check; this is intentional M7/M8 forward-scaffolding but should be re-validated by ST3 and the projects milestone.
  createBoard/updateBoard store input.projectId as-is (no FK yet - migration lines 46-49 note the FK is deferred to M7/M8), and there is no rule binding projectId presence to scopeType (e.g. scope_type='site' with a non-null project_id, or scope_type='project' with null project_id, are both storable). This does not create an M4 exploit because ST3's leak-proof public index returns only scope_type='site' boards routed through AuthorizationService.evaluate(); project-scoped boards are excluded from the public surface. Flagging so ST3 confirms the site-only filter keys strictly on scope_type (not on project_id) and so the M7/M8 projects work adds the FK and any needed projectId/scope_type consistency check.

Test sufficiency assessment:
- Strong coverage of the security-critical behaviors. forums.controller.test.ts has explicit per-endpoint 401-before-DB and 403-before-DB tests for all 12 handler entry points (lines 122-300), plus gate-ordering assertions that the repository is NOT called when the gate fires, and assertions that session.user.globalRole is what is passed to the gate.
- forums.service.test.ts covers: admin gate allow/deny, gate-ordering (DB not called when gate fires), invalid scopeType rejected BEFORE any DB call on create (AC3) and on update, invalid visibility rejected before persistence on create and update, default scopeType=site/visibility=public when omitted, scopeType=project persistence, slug validation, delete-with-boards 400, and 404-before-mutation ordering.
- Gap: the validation matrix is currently RED - 1 controller test (line 591-599) fails. It is a mis-scoped source-slice assertion rather than a missing security control, but it MUST be fixed so the suite is green before handoff. No oracle-parity gap of concern for ST2 since there is no public read path here (ST3 owns that).

Documentation / operational guidance assessment:
- P1 (contract accuracy) is satisfied in the code: per-handler JSDoc and Swagger decorators on all 11 endpoints accurately state 401/403/400/404 and the scopeType/visibility allowed vocabularies; the controller header comment correctly states both checks happen before any data operation. docs/features/forums.md documents the admin board/category management surface and the scope/visibility model and matches code behavior.
- The single failing test references documentation/JSDoc accuracy but the underlying JSDoc IS correct (adminDeleteCategory documents 400 and 404 at forums.controller.ts lines 174-177 and decorators at 183-186); the failure is a test-scoping bug, not a real doc/code drift instance.
- No operational/runbook documentation gap relevant to ST2's admin-only surface.

Artifacts written:
- artifacts/milestone-4-forums/ST2/security_report.md
- artifacts/milestone-4-forums/ST2/security_result.json

Outcome:
- FAIL
