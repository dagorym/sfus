Verifier Report

Scope reviewed:
- ST-6 Documents soft-lock: POST /api/docs/:id/lock (acquire/refresh), DELETE /api/docs/:id/lock (release/staff-override), assertNotForeignLocked wired into addRevision/renamePage/softDeletePage/rollbackPage write paths, DOCS_LOCK_TTL_MINUTES env var, DocsLockState field on DocsPageShape.
- Comparison base: ms5. Commits: implementer (02e1484), tester (5a0d43b), documenter (a76e13d, 1793bee).
- Out-of-scope but necessary edits reviewed: docs.module.ts (DOCS_CONFIG provider registration), test fixture updates (docs.lockTtlMinutes: 30) in auth/health/media/database test files.
- Changed files: apps/api/src/docs/docs.service.ts, docs.controller.ts, docs.types.ts, docs.module.ts, docs.service.test.ts, docs.controller.test.ts, docs.service.integration.test.ts, docs-module.test.ts; apps/api/src/config/environment.ts, environment.test.ts; five fixture test files; docs/features/documents.md, docs/operations/launch.md.

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md — ST-6 section (lines 238–260) and ST-6 prompt (lines 671–709).
- Acceptance criteria as supplied in verifier prompt: AC1–AC11.

Convention files considered:
- docs/development/api-conventions.md (error envelope, env validation conventions)
- docs/operations/launch.md (env var table)
- docs/features/documents.md (feature documentation)
- apps/api/src/common/filters/json-exception.filter.ts (global error envelope implementation)
- AGENTS.md / CLAUDE.md (workflow rules)

Findings

BLOCKING
- apps/api/src/docs/docs.service.ts:455-459 and 514-519 - 409 ConflictException holder metadata stripped by global JsonExceptionFilter; client never receives lockedByUserId or lockExpiresAt
  AC2 requires "409 with holder metadata (lockedByUserId, lockExpiresAt)" and AC6 requires the same for write-path 409s. The ConflictException is thrown with {message, lock: {lockedByUserId, lockExpiresAt}}, but JsonExceptionFilter (apps/api/src/common/filters/json-exception.filter.ts, globally applied via app.useGlobalFilters in apps/api/src/index.ts:77) only extracts 'message' and 'error' from the exception body — the 'lock' field is dropped. The HTTP response contains only {error: {code, message, statusCode}, request:{...}}. The web client for ST-8 needs holder/expiry messaging surfaced from the 409 (per plan ST-8 AC2) but the data is not delivered. Documentation (docs/features/documents.md lines 490–498) claims the 409 body includes DocsLockConflictInfo under a 'lock' key — this is inaccurate. No test exercises the post-filter HTTP response body to detect this gap; all 252 unit tests pass because they verify the ConflictException at the service level before the filter runs.

- apps/api/src/docs/docs.controller.ts:587-591 - acquireLock 200 response is double-nested { lock: { pageId, lock: DocsLockState } } rather than AC1-specified { pageId, lock: DocsLockState }
  AC1 specifies the 200 response shape as "{ pageId, lock: DocsLockState }". The controller stores the DocsLockResultShape result (which is {pageId, lock: DocsLockState}) in a variable named 'lock' and returns '{ lock }', producing the double-nested response: { lock: { pageId, lock: { isLocked, lockedByUserId, lockedAt, lockExpiresAt } } }. The controller unit test at docs.controller.test.ts:1218 asserts and accepts this double-nested shape, so the mismatch passes all tests but diverges from AC1. The documentation at docs/features/documents.md line 475 documents "{ lock: DocsLockResultShape }" as the 200 response, which is internally consistent with the code but produces non-standard double-nesting. Web clients consuming this endpoint must navigate { lock: { pageId, lock: DocsLockState } } rather than { pageId, lock: DocsLockState }.

WARNING
- apps/api/src/docs/docs.service.ts:960-979 - softDeletePage performs lock check outside a transaction, creating a TOCTOU window unlike the other three write paths
  addRevision, renamePage, and rollbackPage all load the page entity and call assertNotForeignLocked inside a database transaction. softDeletePage loads the page (line 960) and calls assertNotForeignLocked (line 966) outside any transaction — between the lock check and the final update at line 979, another user could acquire a lock on the page. The pre-existing softDeletePage was non-transactional (inherited constraint, not newly introduced by ST-6), and for an advisory soft-lock the risk is low. However, the inconsistency with the other three write paths is notable and could confuse maintainers expecting uniform transactional lock-check semantics.

- docs/features/documents.md:490-498 - Documentation claims 409 error body includes DocsLockConflictInfo under a 'lock' key, which the JsonExceptionFilter strips
  The documentation states that when a non-expired foreign lock blocks acquisition, the response includes DocsLockConflictInfo under a 'lock' key. The global JsonExceptionFilter only surfaces 'message' and 'error' from exception bodies; the 'lock' field is not included in HTTP error responses. This creates an inaccurate documented contract for web layer developers writing ST-8, who will expect the holder metadata to be present in the 409 body but will find only the message string.

NOTE
- apps/api/src/docs/docs.module.ts:23-30 - docs.module.ts edited outside stated allowed-file scope to register DOCS_CONFIG DI provider — necessary and minimal
  The implementer allowed-file list did not include docs.module.ts. However, DocsService uses @Inject(DOCS_CONFIG) for lockTtlMinutes and NestJS DI requires the provider to be registered in the module. The edit is one import and one provider declaration using environment.docs.lockTtlMinutes. It is necessary for compilation and runtime, correct, and the smallest possible change. Justified scope creep.

- apps/api/src/auth/auth.controller.test.ts, apps/api/src/auth/auth.service.test.ts, apps/api/src/database/database.config.test.ts, apps/api/src/health/readiness.service.test.ts, apps/api/src/media/media.service.test.ts:createValidEnvironment() stub in each file - Five out-of-scope test-fixture files edited to add docs.lockTtlMinutes: 30 — necessary due to ApplicationEnvironment type change
  ApplicationEnvironment now requires the docs.lockTtlMinutes field. All test files sharing the createValidEnvironment() fixture needed this one-liner addition or TypeScript compilation would fail. Each change is mechanical (one field added), correct (default value 30), and unavoidable given the type-system constraint. Not meaningful scope creep.

Test sufficiency assessment:
- Coverage at service and controller unit-test levels is thorough: AC1-AC11 each have dedicated tests. assertNotForeignLocked, acquireLock, releaseLock, toPageShape lock field, and all four write-path guards are tested with positive, negative, boundary, and staff-override cases. DB-gated integration tests cover AC1, AC2, and AC3 against a real database. HOWEVER: no test exercises the full HTTP response through the JsonExceptionFilter. Unit tests verify the ConflictException is thrown with holder metadata at the service level but do not verify that the metadata survives the filter to reach HTTP clients. This gap allowed the BLOCKING holder-metadata defect to pass all 252 unit tests undetected. An HTTP-integration test for the 409 body structure would have caught this.

Documentation accuracy assessment:
- Lock TTL, acquire/release lifecycle, DocsLockState fields, DOCS_LOCK_TTL_MINUTES env var (default, range, fail-fast behavior), and route-ordering note are accurately documented. The 200 response shape documented as "{ lock: DocsLockResultShape }" is internally consistent with the implementation (though double-nested relative to AC1). INACCURATE: The 409 body documentation at docs/features/documents.md lines 490-498 claims DocsLockConflictInfo is returned under a 'lock' key in the error response, but the global JsonExceptionFilter strips non-message/non-error fields, so the holder metadata is not delivered to HTTP clients.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-6/verifier_report.md
- artifacts/ms5-documents-wiki/ST-6/verifier_result.json

Verdict:
- FAIL
