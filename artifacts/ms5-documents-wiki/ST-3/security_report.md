Security Review Report

Scope reviewed:
- MS5 ST-3 Documents write API RE-REVIEW after a Verifier-driven remediation pass. Prior specialist verdict (archived at artifacts/ms5-documents-wiki/ST-3/history/verifier-1-warn/security_report.md) was CONDITIONAL PASS: 0 BLOCKING, 1 WARNING (P10 atomicity test was a mock illusion), 2 NOTES. Product code was confirmed sound at that time.
- Remediation diff confirmed against coordination base branch ms5 (git diff ms5...HEAD).
- Re-reviewed (read-only): apps/api/src/docs/docs.service.integration.test.ts (rewritten P10 atomicity proof), apps/api/src/pages/integration-test-support.ts (DocsPageEntity/DocsRevisionEntity registration).
- Re-confirmed unchanged product code: apps/api/src/docs/docs.service.ts (assertDocWriteAccess seam, createPage, addRevision, validateSlug/validateTitle, resolveParent, computePathHash, in-transaction collision check); apps/api/src/docs/docs.controller.ts (POST /docs and POST /docs/:id/revisions; 401-resolveSession then 403-assertDocWriteAccess ordering; ThrottleGuard + ThrottleLabel on both routes).
- Cross-checked supporting evidence: apps/api/src/docs/entities/docs-revision.entity.ts (uq_docs_revisions_page_revision_number unique index), apps/api/src/database/migrations/1781308800000-milestone-five-documents-foundation.ts (real UNIQUE KEY in migrated schema), and the proven mirror pattern in apps/api/src/pages/pages.service.integration.test.ts.
- Method: read-only review; no product or test files modified. Diff compared against coordination base branch ms5.

Why specialist review was triggered:
- Planner marked ST-3 'Security review: required': it introduces the wiki write-authorization seam and trust boundary - the single gate every current and future write path depends on.
- A defect here means unauthorized writes, privilege escalation, data-integrity corruption (orphaned page rows / dangling current_revision_id), injection, or an existence oracle for writers.
- Re-review specifically triggered to confirm the prior WARNING (unproven P10 rollback guarantee) is closed by the remediated test + harness registration, and that the product-code trust boundary remains unchanged and sound.

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md (ST-3 acceptance criteria AC1-AC5 and P10 atomicity).
- docs/features/documents.md Write API contract and docs/features/authorization.md gate table.
- Prior archived verdict: artifacts/ms5-documents-wiki/ST-3/history/verifier-1-warn/security_report.md (CONDITIONAL PASS).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/docs/docs.service.integration.test.ts:239-319 - PRIOR WARNING NOW CLOSED. The rewritten P10 mid-sequence-failure atomicity test drives the REAL pageRepo.manager.transaction(): it persists a real docs_pages row and a real docs_revisions row, then forces a genuine DB-level unique-constraint violation by inserting a second revision with revision_number=1 (violating uq_docs_revisions_page_revision_number), causing a real engine rollback, and asserts that NO orphaned docs_pages row and NO dangling docs_revisions rows remain. The earlier fake/patched-manager illusion is fully removed.
  The headline rollback guarantee is now actually exercised against a real transaction and real index, mirroring the already-proven pages.service.integration.test.ts pattern. The unique index exists in both the entity (docs-revision.entity.ts:7) and the migrated schema (migration line 82), so the constraint genuinely fires and a real SAVEPOINT/rollback is observed. apps/api/src/pages/integration-test-support.ts now registers DocsPageEntity and DocsRevisionEntity (lines 33-34, 107-108), so the docs repositories resolve and the proof is runnable. RESIDUAL (unchanged, informational): the whole integration suite is still gated behind SFUS_DB_INTEGRATION=1 and skips in default CI, so the proof must be run manually against the dev DB. This is a pre-existing execution-environment limitation consistent with the pages suite, not a defect, and does not block ST-3.
- apps/api/src/docs/docs.service.ts:610-625 - resolveParent by parentId (line 615) filters on scopeType='site' but NOT status='published', so a soft-deleted parent could be selected by id; the parentPath branch (line 621) does include status='published'. Carried over from the prior review as an intentional deferral.
  Not an ST-3 trust-boundary defect: the write gate (assertDocWriteAccess) and 404 oracle parity are unaffected, and current code path has no soft-delete state yet. Tree management (rename/delete, parent validation) is owned by ST-4. Restated as a note; not an ST-3 blocker.
- apps/api/src/docs/docs.controller.ts:234-238 - addRevision passes the hardcoded scope string "site" to assertDocWriteAccess rather than loading the target page's scope. Carried over from the prior review as an intentional deferral to future project-doc scope.
  Safe today: ST-3 only handles site-scoped pages, and assertDocWriteAccess denies-by-default any unrecognised scope. The seam signature already accepts a DocsPageEntity so a future project scope can switch to entity-derived scope with no call-site change. Restated as a note; not an ST-3 blocker.

Test sufficiency assessment:
- PASS for the authorization seam (unchanged): assertDocWriteAccess unit/integration tests cover null/'user' -> 403, moderator/admin -> pass, deny-by-default on unknown scope, and routing through AuthorizationService.hasGlobalRole. Controller tests assert the seam is invoked BEFORE the service write and that 401 (resolveSession throw) precedes 403, for both write routes.
- PASS for input validation / oracle parity (unchanged): slug charset/length, title length, missing-parent 400, path_hash collision 409, and addRevision nonexistent/deleted -> identical 404 (PAGE_NOT_FOUND_MESSAGE).
- RESOLVED for P10 transactional atomicity: the prior WARNING is CLOSED. The dedicated mid-sequence-failure rollback test now exercises the real DataSource transaction and a real unique-index violation, then asserts no orphan page/revision rows survive after rollback. The harness registers the docs entities so the proof is runnable against the migrated schema. The integration suite remains opt-in via SFUS_DB_INTEGRATION=1 (skips cleanly in CI) - an unchanged execution-environment limitation, captured as a NOTE.
- Throttle attachment and module wiring remain correct in source (ThrottleGuard + ThrottleLabel on both write routes; ThrottleModule imported by DocsModule).

Documentation / operational guidance assessment:
- SUFFICIENT (unchanged). docs/features/documents.md documents the complete Write API contract: single-gate authorization, 401-before-403 ordering, moderator/admin requirement, write-path oracle parity (404), slug/title validation, both throttle labels, P10 transactional atomicity, and module wiring.
- docs/features/authorization.md includes DocsService.assertDocWriteAccess in the gate table (moderator/admin for site scope, extensible for project scope) and reiterates 'gate before any data operation; 401 no session, 403 insufficient role'.
- docs/development/testing.md documents the SFUS_DB_INTEGRATION=1 opt-in and DB_* env contract needed to run the now-genuine atomicity proof. No documentation defects.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-3/security_report.md
- artifacts/ms5-documents-wiki/ST-3/security_result.json

Outcome:
- PASS
