# Implementer Report

Status:
- success

Task summary:
- REMEDIATION PASS (no product change): Re-confirmed all ST-3 validations still green after verifier-1-warn pass. Updated tester_prompt.txt to direct the Tester to rewrite the P10 atomicity-injection test to exercise the real DataSource transaction (failure injected via unique-constraint violation, mirroring the Pages integration spec), so rollback is actually observed in the DB rather than asserted against a fake manager.

Changed files:
- None

Validation commands run:
- pnpm --dir /home/tstephen/repos/worktrees/ms5-st3-implementer-20260610 lint
- pnpm --dir /home/tstephen/repos/worktrees/ms5-st3-implementer-20260610 typecheck
- pnpm --dir /home/tstephen/repos/worktrees/ms5-st3-implementer-20260610 test
- pnpm --filter @sfus/api exec tsc --noEmit

Validation outcome:
- PASS — lint clean, typecheck clean, 33 unit test files pass (1111 tests), 1 integration file skips cleanly (SFUS_DB_INTEGRATION not set), API tsc clean. All results identical to previous pass.

Implementation/code commit hash:
- No Changes Made

Artifacts written:
- artifacts/ms5-documents-wiki/ST-3/implementer_report.md
- artifacts/ms5-documents-wiki/ST-3/tester_prompt.txt
- artifacts/ms5-documents-wiki/ST-3/implementer_result.json

Implementation context:
- NO PRODUCT CODE WAS CHANGED in this remediation pass. docs.service.ts, docs.controller.ts, docs.types.ts, docs.module.ts are identical to the code commit 6ee19db.
- The verifier (CONDITIONAL PASS) and security reviewer both confirmed that the product code is CORRECT: createPage (docs.service.ts lines 426-484) and addRevision (docs.service.ts lines 517-565) both wrap their writes in this.pageRepository.manager.transaction.
- The schema enforces uq_docs_revisions_page_revision_number (page_id, revision_number) and fk_docs_pages_current_revision_id / fk_docs_revisions_page_id ON DELETE CASCADE — the same constraint pattern used by the Pages integration spec.
- The ONLY gap is in docs.service.integration.test.ts lines 239-315: the P10 test replaces the manager with a fake patchedManager whose transaction() just calls the callback and whose em.save never writes to the DB. No real TypeORM SAVEPOINT or rollback is exercised.
- The fix: replace the fake-manager test with a test-local real transaction (on pageRepo.manager.transaction) that injects a second revision insert with a duplicate revision_number to violate uq_docs_revisions_page_revision_number, exactly mirroring the pattern in apps/api/src/pages/pages.service.integration.test.ts lines 241-318.
- Entity classes for the test: DocsPageEntity (docs/entities/docs-page.entity.ts), DocsRevisionEntity (docs/entities/docs-revision.entity.ts). The scope_type field is 'site' and scope_id is null for site-scoped docs pages.
- Required imports are already present in the integration test file (DocsPageEntity, DocsRevisionEntity, DataSource, Repository, crypto).
- After the fix, the test must still skip cleanly when SFUS_DB_INTEGRATION=1 is not set (the existing describe.skipIf guard covers this).
- Do NOT add a new it.todo — the previous implementer_result.json noted 'P10 atomicity injection' as a tester item; the rewrite of the existing test closes it.
- Deferred informational items (do NOT fix in ST-3): resolveParent by parentId does not filter status='published' (asymmetry vs parentPath path — deferred to ST-4 soft-delete); addRevision passes hardcoded 'site' scope to assertDocWriteAccess (deferred to when project scope is introduced).

Expected validation failures carried forward:
- None
