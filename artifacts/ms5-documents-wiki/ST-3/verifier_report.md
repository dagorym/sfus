Verifier Report

Scope reviewed:
- Implementer (6ee19db): docs.service.ts createPage, addRevision, assertDocWriteAccess seam, validateSlug, validateTitle, resolveParent, computePathHash — all in a single pageRepository.manager.transaction. docs.controller.ts POST /api/docs and POST /api/docs/:id/revisions with ThrottleGuard + ThrottleLabel, 401 (resolveSession) before 403 (assertDocWriteAccess). docs.module.ts: AuthModule.register and ThrottleModule.register added. docs.types.ts: CreateDocPageInput, AddDocRevisionInput, DocWriteResultShape added.
- Tester (bbb98b0): docs.service.test.ts — assertDocWriteAccess unit tests (null/user/moderator/admin/entity overload/deny-by-default/hasGlobalRole routing), createPage transaction (save×2 + update×1, validation, collision, parent resolution), addRevision (revision bump, pointer update, 404/400 paths). docs.controller.test.ts — 401-before-403 ordering for both write routes, ThrottleGuard metadata, body guard 400, propagation of 403/409/404. docs-module.test.ts updated for ThrottleModule/AuthModule requirement.
- Remediation tester (95f165a): docs.service.integration.test.ts — P10 atomicity test rewritten from fake-manager to real pageRepo.manager.transaction() driving a genuine unique-constraint violation (uq_docs_revisions_page_revision_number) to prove rollback at the DB engine level. Also adds AC1/AC2/AC3 integration tests against live schema.
- Remediation infra (befe65f): apps/api/src/pages/integration-test-support.ts — DocsPageEntity and DocsRevisionEntity registered in createIntegrationDataSource entities array (lines 33-34, 107-108), making the docs integration suite runnable.
- Documenter (eb6c4e2): docs/features/documents.md write API section (assertDocWriteAccess, 401/403 ordering, throttle labels, P10 atomicity, module wiring, DocWriteResultShape, slug/title validation). docs/features/authorization.md gate table entry for assertDocWriteAccess. docs/development/testing.md section 6 for DocsService DB integration spec.
- Security RE-REVIEW (da17c03): artifacts/ms5-documents-wiki/ST-3/security_report.md — PASS verdict, 0 blocking, 0 warnings, 3 notes (P10 atomicity now proven by real-DB rollback; resolveParent-by-parentId status filter deferred to ST-4; addRevision hardcoded site scope deferred to future project scope).

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md — ST-3 acceptance criteria AC1-AC5.
- artifacts/ms5-documents-wiki/ST-3/security_report.md — specialist Security RE-REVIEW PASS (0 blocking, 0 warnings, 3 notes). Prior P10 WARNING closed.

Convention files considered:
- AGENTS.md — single-source-of-truth rule, workflow (coordinator/implementer/tester/documenter/security/verifier chain), artifact-path conventions, no-commit-without-approval.
- docs/development/api-conventions.md — error envelope, status code conventions, migration registry.
- docs/development/testing.md — integration test opt-in contract (SFUS_DB_INTEGRATION=1, DB_* env vars).

Findings

BLOCKING
- None

WARNING
- apps/api/src/pages/integration-test-support.ts:155-164 - cleanupThrowawayRows uses StandalonePageEntity and standalone_pages table; docs integration test passes docs_pages IDs to it — cleanup is a silent no-op, accumulating orphaned rows across runs.
  When docs.service.integration.test.ts afterEach calls cleanupThrowawayRows(ds, createdPageIds, []), the helper runs UPDATE standalone_pages SET current_revision_id = NULL WHERE id = ? (no-op for docs IDs) and then deletes via StandalonePageEntity repository (also no-op). docs_pages and docs_revisions rows from the AC1, AC2, and AC3 collision tests accumulate in the real DB on successive integration runs. The P10 rollback-proof test is unaffected (fakePageId is never committed and is never added to createdPageIds). Production code is correct; this is a test-harness hygiene defect that will cause increasingly noisy integration state over time.

NOTE
- apps/api/src/docs/docs.service.ts:610-625 - resolveParent by parentId (line 615) does not filter on status='published'; a soft-deleted parent could be resolved by id. Carried over as intentional deferral to ST-4.
  Not an ST-3 trust-boundary defect: the write gate (assertDocWriteAccess) and 404 oracle parity are unaffected, and no soft-delete state exists in current data. Tree management (rename/delete, parent validation with status filter) is owned by ST-4.
- apps/api/src/docs/docs.controller.ts:234-238 - addRevision passes hardcoded string 'site' to assertDocWriteAccess rather than loading the target page's scope. Intentional deferral to future project-doc scope.
  Safe today: ST-3 handles site-scoped pages only, and assertDocWriteAccess denies-by-default any unrecognised scope. The seam signature already accepts DocsPageEntity so a future project scope switches to entity-derived scope with no call-site change.
- apps/api/src/docs/docs.service.integration.test.ts:82-87 - Integration suite gated behind SFUS_DB_INTEGRATION=1; skips cleanly in default CI. Opt-in execution is manual per docs/development/testing.md section 6.
  Pre-existing execution-environment limitation consistent with the pages suite. Not a defect.

Test sufficiency assessment:
- PASS with one WARNING (cleanup harness). Unit coverage: assertDocWriteAccess tests all role/scope combinations (null/user/moderator/admin, entity overload, deny-by-default for unknown scope, routing through AuthorizationService.hasGlobalRole); createPage tests transaction integrity (save×2 + update×1 verified by spy counts), all validation error paths (empty/long slug, invalid charset, empty/long title, missing parent, path_hash collision); addRevision tests revision number bump (→2), pointer update, 404 for nonexistent/deleted, 400 for invalid title. Controller unit tests verify: resolveSession called before assertDocWriteAccess for both write routes; 401 propagates from resolveSession before 403 from assertDocWriteAccess; ThrottleGuard metadata present on both routes; body-guard 400 paths; ConflictException 409 and NotFoundException 404 propagation.
- Integration test coverage (opt-in, real-DB): P10 atomicity proven by genuine DB-level unique-constraint violation rollback (not a mock); duplicate path_hash rejection; createPage inserts page+revision+pointer (AC1); addRevision produces revision #2 with updated pointer (AC2).
- The cleanup harness defect (WARNING) means integration test data accumulates across runs but does not affect individual test assertions or the P10 atomicity proof validity.

Documentation accuracy assessment:
- PASS. docs/features/documents.md accurately documents: assertDocWriteAccess as single gate, 401-before-403 ordering, moderator/admin requirement, write-path oracle parity (same 404 as read paths), slug charset/length validation, title length validation, both throttle labels (doc-page-create, doc-page-edit), P10 transactional atomicity with rollback guarantee, DocsModule.register wiring (AuthModule + ThrottleModule), DocWriteResultShape fields.
- docs/features/authorization.md gate table accurately reflects assertDocWriteAccess: moderator/admin for site-scope, extensible for project-scope, with correct 401/403 error contract and link to documents.md.
- docs/development/testing.md section 6 accurately documents: SFUS_DB_INTEGRATION=1 opt-in gate, DB_* env contract, direct vitest run command (not included in test:integration npm script), skips cleanly when unset. No documentation inaccuracies.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-3/verifier_report.md
- artifacts/ms5-documents-wiki/ST-3/verifier_result.json

Verdict:
- PASS
