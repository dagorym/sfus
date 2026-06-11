Verifier Report

Scope reviewed:
- Implementer (commit e7c88aa): renamePage, softDeletePage methods in DocsService; PATCH /api/docs/:id and DELETE /api/docs/:id routes in DocsController; RenameDocPageInput interface in docs.types.ts; resolveParent status='published' fix applied to both parentId and parentPath branches.
- Tester (commit 159d110): renamePage and softDeletePage unit tests in docs.service.test.ts; renamePage and softDeletePage controller tests in docs.controller.test.ts; real-DB integration tests in docs.service.integration.test.ts (slug rename parent+child path rewrite, mid-rename rollback, softDeletePage leaf + children-guard); resolveParent fix tests; pages/integration-test-support.ts updated with docs_pages cleanup helper (docsPageIds param).
- Documenter (commit fed0ff0): docs/features/documents.md updated with PATCH /api/docs/:id and DELETE /api/docs/:id sections, RenameDocPageInput table, DocWriteResultShape table, slug/title validation rules, parent resolution section, module wiring note.
- Security (commit d9c1a8d): specialist review — PASS, 0 blocking, 0 warnings, 3 notes carried forward into this report.

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md §ST-4 (lines 189-212): AC1 atomic slug rename + descendant path/path_hash rewrite in one transaction (P10 proof); AC2 title-only rename leaves paths untouched; AC3 soft-delete sets status='deleted', preserves revisions, disappears from public reads (ST-2); AC4 409 on non-deleted children, no partial state; AC5 assertDocWriteAccess gates both routes (session 401 before role 403, staff-only for site scope).

Convention files considered:
- AGENTS.md
- docs/development/api-conventions.md
- docs/development/testing.md
- docs/features/documents.md

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/docs/docs.service.integration.test.ts:365-438 - Mid-rename atomicity test is a DB-capability proxy rather than a real renamePage() rollback exercise.
  The test forces a raw-SQL unique-constraint violation inside a manual transaction that mirrors renamePage's write sequence. It proves InnoDB rolls back atomically but does not inject a fault into the real renamePage() descendant loop. The production code wraps the entire rewrite in a single pageRepository.manager.transaction; a real parent+child happy-path integration test (lines 323-363) exercises the actual service. The proxy test is an acceptable substitute. Non-blocking. (Security NOTE 1.)
- apps/api/src/docs/docs.service.ts:653 - No test asserts the LIKE-prefix no-over-match property (renaming 'foo' must not rewrite sibling 'foobar').
  The descendant scan uses prefix `${oldPath}/` which structurally excludes siblings. Slugs are validated to [a-z0-9-] so no LIKE wildcards can appear in stored paths; the query is parameterized. Correct by construction, but an explicit regression test would guard against future changes to the prefix derivation. Non-blocking. (Security NOTE 2.)
- apps/api/src/database/migrations/1781308800000-milestone-five-documents-foundation.ts:61 - The unique index uq_docs_pages_scope_path_hash does not include status; a rare descendant path_hash collision against a soft-deleted row surfaces as a 500-shaped rollback rather than a clean 409.
  The renamed page's own new path_hash is pre-checked with a clean 409. For descendant rewrites, a hash collision against any existing row (including soft-deleted) triggers a raw DB constraint error inside the transaction. The entire transaction rolls back cleanly — no tree corruption. The caller receives a generic 500 rather than a 409 for this rare edge case. Fail-safe; non-blocking. (Security NOTE 3.)
- docs/features/documents.md:283 - DocWriteResultShape.revisionNumber described as 'Revision number of the newly created revision' but renamePage returns 0 because no revision is created.
  The description is accurate for createPage (returns 1) and addRevision (returns bumped number) but misleading for the PATCH rename response where revisionNumber=0. The implementation comment at docs.service.ts:691 documents this intent. Low-impact: callers inspecting the PATCH response may be confused by the 0. Non-blocking.

Test sufficiency assessment:
- AC1 (slug rename + subtree rewrite, P10): ADEQUATE. Unit tests verify em.update is called for parent + each descendant (3 calls for parent+child+grandchild); integration test proves real parent+child path rewrite; atomicity proxy test proves DB-level rollback. Minor gap: no real renamePage() fault-injection rollback test and no sibling no-over-match regression test (both NOTE).
- AC2 (title-only, no path change): STRONG. Two unit tests verify em.update called once with only the title field, and em.createQueryBuilder not invoked.
- AC3 (soft-delete sets status='deleted', revisions preserved): STRONG. Unit + integration tests confirm update with status='deleted' and revisions preserved; integration test checks DB state after leaf delete.
- AC4 (409 on non-deleted children, no partial state): STRONG. Unit tests verify ConflictException thrown with 'child' in message, and update NOT called. Integration test confirms 409 and parent remains 'published'.
- AC5 (assertDocWriteAccess gates both routes, 401 → 403 ordering): STRONG. Controller tests verify invocationCallOrder (assert before service call), called with ('moderator','site'), propagates 401/403/404/409 for both PATCH and DELETE. Service tests cover null/undefined/user-role rejection and moderator/admin clearance.
- resolveParent fix: ADEQUATE. Unit test confirms soft-deleted parent via parentId throws BadRequestException; published parent passes through; both branches filter status='published' in code.

Documentation accuracy assessment:
- PATCH /api/docs/:id section is accurate: slug-change subtree rewrite, title-only no-op, deferred cross-parent move note, RenameDocPageInput table, full 400/401/403/404/409/429 error table, throttle label doc-page-edit.
- DELETE /api/docs/:id section is accurate: 204 response, status='deleted', revisions preserved, 409 children guard, full 401/403/404/409/429 error table, throttle label.
- Parent resolution section accurately documents both parentId and parentPath branches filtering status='published' with 400 'Parent page does not exist.' for soft-deleted parents.
- DocWriteResultShape.revisionNumber description is slightly misleading for rename responses (see NOTE). No other contradictions or missing documentation items found.
- Overall documentation accurately reflects the implemented and tested behavior.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-4/verifier_report.md
- artifacts/ms5-documents-wiki/ST-4/verifier_result.json

Verdict:
- PASS
