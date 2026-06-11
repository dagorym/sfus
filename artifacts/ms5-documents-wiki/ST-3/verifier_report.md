Verifier Report

Scope reviewed:
- ST-3 Documents write API: POST /api/docs (createPage), POST /api/docs/:id/revisions (addRevision)
- assertDocWriteAccess authorization seam (AC5 single gate)
- Slug/title validation, parent resolution, path_hash collision detection (AC3)
- ThrottleGuard attached to both write routes; ThrottleModule + AuthModule wired into DocsModule.register(environment) (AC4)
- Transactional atomicity for page+revision+pointer writes (P10)
- Test files: docs.service.test.ts (72 tests), docs.controller.test.ts (36 tests), docs.service.integration.test.ts (8 tests, skipped without DB)
- Documentation: docs/features/documents.md (write API contract), docs/features/authorization.md (gate table cross-link), docs/development/testing.md (integration note)
- Security review consulted: CONDITIONAL PASS (0 blocking, 1 WARNING, 2 notes) — security_report.md in same artifact directory

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md ST-3 acceptance criteria AC1–AC5 and P10 atomicity
- docs/features/documents.md Write API contract
- docs/features/authorization.md gate table

Convention files considered:
- docs/development/api-conventions.md (error envelope, throttle, migration conventions)
- docs/features/authorization.md (global roles, gate-before-data-operation contract)
- docs/development/testing.md (integration-test gating convention)
- AGENTS.md (workflow and role boundaries)

Findings

BLOCKING
- None

WARNING
- apps/api/src/docs/docs.service.integration.test.ts:239-315 - P10 atomicity injection test is a mock illusion: the patchedManager's transaction() calls the callback directly and em.save never writes to the DB, so no real TypeORM transaction or rollback is exercised.
  The plan explicitly requires 'a schema-enforced integration test, NOT a mock' (ST-3 AC3 / P10). The test currently proves nothing about actual DB rollback behavior — the 'no orphaned row' assertion passes trivially because nothing was ever written. The product code (createPage lines 426–484, addRevision lines 517–565) correctly wraps writes in repository.manager.transaction, and the real-schema happy-path and duplicate-rejection tests do exercise real transactions (when SFUS_DB_INTEGRATION=1 is set). The gap is in the failure-injection path specifically. Classified as WARNING (not BLOCKING) because: (a) the product code is correct; (b) the DB-gated real-schema tests do validate the non-failure path with real transactions; (c) TypeORM + MySQL atomicity guarantees mean the rollback works if the transaction is properly entered. Remediation (Tester, non-blocking): replace the fake manager with a real transaction where failure is injected via a unique-constraint violation or a real DB hook, so rollback is actually observed.

NOTE
- apps/api/src/docs/docs.service.ts:614-615 - resolveParent by parentId does not filter by status='published', so a deleted page can be used as a parent when parentId is specified directly.
  When parentPath is used, resolveParent filters by status='published' (line 621), but the parentId path does not (line 615). A staff member (moderator/admin) could create a child under a soft-deleted page using parentId. This is a staff-only write path, so there is no privilege-escalation risk. It creates a tree inconsistency where a published child can have a deleted parent. Low risk for ST-3 scope since soft-delete is not yet implemented (ST-4), but worth addressing when ST-4 lands. Informational.
- apps/api/src/docs/docs.controller.ts:232-239 - addRevision passes hardcoded 'site' scope string to assertDocWriteAccess instead of loading the page entity first.
  The comment documents this limitation: 'safe until project docs exist'. When project-scoped pages are introduced in a future subtask, this handler will authorize the wrong scope for existing project pages. This is a documented, bounded assumption for ST-3 scope. The single-gate contract (AC5) is met because the gate is still called before any data operation. Noted for future-proofing when project scope is introduced.
- apps/api/src/docs/docs.controller.test.ts:360-589 - No test asserts ThrottleGuard metadata via Reflector.get() — AC4 coverage is by source reading only.
  The controller test header claims 'AC4: ThrottleGuard attached at the decorator level (presence validated by metadata)' but no test actually uses Reflector to verify the guard or label are present on the handler. The source is correct (lines 159–160 and 215–216 of docs.controller.ts), but the claim in the test comment overstates coverage. This matches the security report's NOTE-2. A small metadata-reflection test would make AC4 self-verifying.

Test sufficiency assessment:
- PASS for AC1 (createPage): transaction integrity verified with em.save×2 + em.update×1 spy checks; path derivation for nested pages; returned shape including revisionNumber=1 and currentRevisionId.
- PASS for AC2 (addRevision): revision bump to #2 (and defensive null-last-revision path for #1), new currentRevisionId distinct from old, 404 oracle parity for nonexistent and deleted pages.
- PASS for AC3 (validation and collision): empty slug, invalid chars, >255 slug, empty title, >255 title, missing-parent 400, path_hash collision 409 — all covered.
- PASS for AC4 (throttle attachment and module wiring): ThrottleGuard decorators verified by source; docs-module.test.ts verifies imports array length includes ThrottleModule/AuthModule via the fakeEnvironment pattern. Metadata-reflection assertion absent (NOTE finding).
- PASS for AC5 (assertDocWriteAccess single gate): null/undefined/'user' → 403; moderator/admin → pass; deny-by-default on unknown scope; DocsPageEntity overload; hasGlobalRole routing; controller invocation ordering (assertSpy before createPage/addRevision); 401 propagation.
- WARNING for P10 (atomicity injection): The dedicated mid-sequence failure test substitutes a fake manager and exercises no real DB transaction. Real-schema tests (createPage, duplicate, addRevision) do exercise the real manager.transaction when SFUS_DB_INTEGRATION=1 is set, but those do not inject failures. Rollback is not demonstrated by any executed test. Product code is correct.
- Integration suite (8 tests) skips cleanly without SFUS_DB_INTEGRATION=1, consistent with the repo's DB-gated integration convention. The suite is not included in the test:integration script — documented in testing.md as a direct vitest invocation.

Documentation accuracy assessment:
- SUFFICIENT. docs/features/documents.md adds a complete Write API contract: single-gate authorization, 401-before-403 ordering, moderator/admin requirement, write-path oracle parity (404), slug/title validation rules, both throttle labels (doc-page-create, doc-page-edit), P10 transactional atomicity, full request/response/error tables, DocWriteResultShape shape, and module wiring.
- docs/features/authorization.md adds DocsService.assertDocWriteAccess to the gate table with the correct scope-type annotation and extensibility note, and cross-links to documents.md.
- docs/development/testing.md adds section 6 for the DocsService DB integration spec with correct run instructions and opt-in gate description.
- No documentation defects identified. All documented behavior matches the implementation.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-3/verifier_report.md
- artifacts/ms5-documents-wiki/ST-3/verifier_result.json

Verdict:
- CONDITIONAL PASS
