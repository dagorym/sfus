Security Review Report

Scope reviewed:
- Pass-2 (re-review) specialist security review of Milestone 4 subtask ST2 - Categories & boards admin management (CRUD), after a TEST-ONLY remediation of the single pass-1 blocking finding.
- Remediation under review: commit 045ad70 'fix(forums): fix brittle source-text slice anchors in controller test' - the ONLY code/test change since the pass-1 implementer commit f013244. It re-anchored 5 source-contract assertions in apps/api/src/forums/forums.controller.test.ts onto stable, unique JSDoc/decorator phrases inside each handler's own block (and changed the slice END anchors from bare method names to 'async <method>' forms).
- Verified the security-sound ST2 code from pass-1 is byte-for-byte preserved: git diff f013244..HEAD -- forums.controller.ts forums.service.ts forums.types.ts is EMPTY; across apps/ and packages/ the only changes vs the implementer commit are the two forums test files (controller + service).
- Re-ran the full validation matrix from THIS worktree (after pnpm --dir <worktree> install --frozen-lockfile) using the correct worktree-local invocation: vitest run within apps/api (the main-checkout pnpm --filter resolution does NOT reach this worktree's forums tests).

Why specialist review was triggered:
- Plan marks ST2 'Security review: required' (plans/milestone-4-forums-plan.md lines 164-180). ST2 is the admin gate for forums AND it writes the scope_type/visibility values the entire downstream forum security model (ST3-ST6) keys off, so a weak gate or an out-of-vocabulary scope/visibility value would undermine every downstream visibility decision.
- Pass-1 outcome was FAIL for exactly ONE reason: the validation matrix was RED (a brittle source-text-slice test, 'adminDeleteCategory JSDoc documents 400 and 404', sliced the controller from the method name which sits AFTER the @ApiNotFoundResponse decorator, missing the 404). Pass-1 explicitly found the ST2 CODE security-sound (admin gate, input validation, injection/IDOR, contract accuracy all PASS). Per ST2 outcome semantics a RED matrix is a blocking condition, so the subtask was correctly stopped for remediation.
- This pass must confirm: (1) the matrix is now GREEN; (2) the fixed tests are NON-VACUOUS and still verify the real security-relevant delete contract (must still assert BOTH 400 and 404, and would fail if the documented contract were wrong); (3) no controller/service/types code changed; (4) no NEW issues from the remediation. NOTE: a FAIL on this second pass stops the subtask for a user decision.
- Retrospective patterns in scope: P1 (docs/code contract drift) and P12 (visibility predicates / existence oracles).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md - ST2 section (lines 164-180); ACs: 401/403 before any data op; create/update persist scope_type/visibility/project_id deterministically; invalid scope_type/visibility rejected 400; Swagger/JSDoc match the real status contract (P1).
- Pass-1 security artifacts (preserved): artifacts/milestone-4-forums/ST2/history/security-1-fail/security_report.md and security_result.json - single BLOCKING finding (RED matrix, mis-scoped source slice), code assessed security-sound with 5 positive informational NOTES.
- docs/development/agent-retrospective-patterns.md - P1 (contract accuracy), P12 (visibility/oracle).
- docs/features/authorization.md - visibility vocabulary public | unlisted | members | project-only | private; hasGlobalRole admin gate semantics.

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/forums/forums.controller.test.ts:557-608 - RESOLVED (pass-1 blocking finding cleared): the validation matrix is now GREEN. Worktree-local runs in this pass: forums.controller.test.ts 51/51 PASS, forums.service.test.ts 52/52 PASS (103 total, 0 failures); full apps/api suite 639 passed / 2 skipped / 0 failures across 27 files; pnpm typecheck 0 errors (apps/api + apps/web); pnpm lint clean (eslint --max-warnings=0, both apps).
  The sole pass-1 blocking condition (RED matrix from a brittle source-text-slice test) is gone. The previously-failing 'adminDeleteCategory JSDoc documents 400 and 404' test now passes, as do the other re-anchored source-contract tests.
- apps/api/src/forums/forums.controller.test.ts:596-608 - POSITIVE: the fixed adminDeleteCategory test is NON-VACUOUS and was NOT weakened. It still asserts BOTH toContain('400') AND toContain('404'). The slice now runs from 'Category still has boards' (controller line 174, the @throws 400 JSDoc line) to 'async adminReorderCategories' (line 211), so it spans the handler's full JSDoc+decorator block (lines 174-186) including @throws 404 (177) and @ApiNotFoundResponse (186).
  Static proof of non-vacuity: within that slice the ONLY source of the token '404' is the genuine delete-category 404 documentation (lines 177 and 186) - confirmed there is NO stray '404' in the intervening reorder block (lines 178-210 document only 400/401/403). If the controller's @throws 404 / @ApiNotFoundResponse were removed or wrong, the slice would contain no '404' and the assertion would FAIL. The fix corrected the pass-1 root cause exactly: the old start anchor (bare method name 'adminDeleteCategory') matched the method signature at line 187, which sits AFTER the JSDoc/decorators, so the slice missed the 404; anchoring on the JSDoc phrase fixes that.
- apps/api/src/forums/forums.controller.test.ts:557-594 - POSITIVE: the other two re-anchored source-contract tests are also non-vacuous and correctly scoped. adminListCategories slice ['List all forum categories with their boards' (line 67) .. 'async adminGetCategory' (line 100)) contains the handler's own 401 (line 70) and 403 (line 71) and does NOT bleed into adminGetCategory's 404 - so asserting only 401/403 is correct for that read-only handler. adminCreateBoard slice ['Create a new forum board' (line 282) .. 'async adminUpdateBoard' (line 335)) contains 400/401/403/404 and scopeType/visibility within the handler's own block.
  Confirms the remediation did not introduce over-broad slices that pass by capturing a neighbouring handler's documentation. Each end anchor was changed to the 'async <method>' form, ensuring the slice ends at the next handler definition rather than at an earlier incidental mention of the method name.
- apps/api/src/forums/forums.controller.ts; forums.service.ts; forums.types.ts:n/a - CONFIRMED: the remediation is TEST-ONLY. git diff f013244..HEAD for forums.controller.ts, forums.service.ts, and forums.types.ts is EMPTY (byte-for-byte identical to the pass-1 implementer commit). Across apps/ and packages/, the only delta vs f013244 is the two forums *.test.ts files. The security-sound code reviewed and approved in pass-1 is preserved unchanged.
  Because no controller/service/types code changed, the pass-1 code security findings carry forward without re-litigation: admin gate enforces 401-then-403 before any data op on all 11 endpoints; scope_type and visibility validated against the exact allowed vocabularies BEFORE persistence on both create and update; TypeORM parameterized queries (no injection); category-delete guarded against orphaning boards; reorder rejects foreign-category ids. No regression possible from a test-only change beyond the test suite itself, which is green.
- apps/api/src/forums/forums.service.ts:223,268-270 - FORWARDED (unchanged from pass-1, non-blocking): project_id is accepted as a free nullable string with no FK and no scope_type cross-check (intentional M7/M8 forward-scaffolding). No M4 exploit because ST3's public index returns only scope_type='site' boards routed through AuthorizationService.evaluate().
  Carry-forward so ST3 confirms its site-only filter keys strictly on scope_type (not project_id) and so the M7/M8 projects work adds the FK and any needed projectId/scope_type consistency check. This is a forward note, not a blocker for ST2.
- apps/api/src/forums/forums.service.ts; database migration 1780890123767:200-227,260-267 - FORWARDED (unchanged from pass-1, non-blocking): scope_type/visibility DB columns are plain VARCHAR with no CHECK/ENUM, so the application-layer validators (assertScopeTypeValid / assertVisibilityValid) are the SOLE enforcement of the allowed vocabularies. Acceptable for M4 given both create and update paths validate before save.
  Single line of defense observation for awareness; a future DB CHECK/ENUM would add defense-in-depth. Not a blocker; the application validators are correctly placed and tested.

Test sufficiency assessment:
- Matrix is GREEN and re-verified in THIS worktree: forums.controller.test.ts 51/51, forums.service.test.ts 52/52 (103/103, 0 failures); full apps/api suite 639 passed / 2 skipped / 0 failures (27 files); typecheck 0 errors; lint clean. Matches the implementer/tester-reported results.
- The 3 fixed/re-anchored source-contract tests are NON-VACUOUS: the delete endpoint test still asserts BOTH 400 AND 404, and (by static slice analysis) the only '404' token in its slice originates from the genuine delete-category 404 documentation, so the assertion would FAIL if that documented contract were removed or wrong. The remediation did NOT weaken assertions to pass trivially - it corrected the slice boundaries that caused the pass-1 false-negative.
- Underlying security coverage from pass-1 is intact (code unchanged): per-endpoint 401-before-DB and 403-before-DB tests for all admin handlers, gate-ordering assertions (repository not called when the gate fires), and service-layer invalid-scopeType/invalid-visibility-rejected-before-persistence on both create and update, plus delete-with-boards 400 and 404-before-mutation ordering.

Documentation / operational guidance assessment:
- P1 (contract accuracy) is satisfied and now correctly tested: per-handler JSDoc and Swagger decorators on all 11 endpoints accurately state 401/403/400/404 and the scopeType/visibility allowed vocabularies; the previously false-negative source-contract test now genuinely verifies the adminDeleteCategory 400+404 contract.
- No new documentation/operational gap introduced by the test-only remediation. docs/features/forums.md (admin board/category management + scope/visibility model) remains accurate vs the unchanged code. No runbook gap relevant to ST2's admin-only surface.

Artifacts written:
- artifacts/milestone-4-forums/ST2/security_report.md
- artifacts/milestone-4-forums/ST2/security_result.json

Outcome:
- PASS
