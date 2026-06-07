Verifier Report

Scope reviewed:
- Implementer (commit bae0763): added apps/api/src/pages/pages.service.integration.test.ts and apps/api/src/pages/integration-test-support.ts; added test:integration script in apps/api/package.json; added pages-service-integration entry in cicd/config/validation-config.yml; documented in cicd/docs/cicd.md and cicd/docs/local-pipeline.md.
- Tester: validated skip path (no SFUS_DB_INTEGRATION, 264 unit tests pass, integration suite skips with explicit message) and gated-run path (2 integration tests pass against real MySQL at port 43306). No test files added.
- Documenter (commit 33aa635): added section 4 "PagesService DB integration spec (opt-in)" to docs/website-launch-guide.md.

Acceptance criteria / plan reference:
- plans/ms3-review-closeout-plan.md, Subtask 4: Env-gated MySQL integration test proving the FK and rollback behavior
- Closes reviewer WARNING 5 (mock-only FK test) from the prior ms3-landing-refresh-and-review-followups final review

Convention files considered:
- AGENTS.md (project workflow and repository policy)
- CLAUDE.md (pointer to AGENTS.md)

Findings

BLOCKING
(none)

WARNING
- apps/api/src/pages/pages.service.integration.test.ts:166 — Test 2 does not call PagesService.create directly; uses a test-local transaction mirroring create() to prove rollback
  Test 2 constructs its own transaction that inserts a standalone_pages row followed by a duplicate revision_number violation rather than actually invoking PagesService.create(). The strategy comment at line 152 says "call service.create() successfully" but the test body does not call service.create() at any point. This means Test 2 proves the database's rollback capability in a transaction shaped like the service, but does not directly prove PagesService.create itself rolls back on failure. This approach is structurally justified (injecting a failure into service.create() without modifying production code is not possible, and AC5 prohibits production code changes), and Test 1 already exercises PagesService.create end-to-end with real FK enforcement. Not a blocker, but future maintainers may be confused about why the rollback test does not use the service.

NOTE
- apps/api/src/pages/pages.service.integration.test.ts:152 — Minor comment inaccuracy: the "Strategy" block describes calling service.create() first, which the test body does not do
  The multi-line comment beginning at line 152 describes a two-step approach (first call service.create() successfully, then attempt a duplicate insert to trigger rollback) that the actual test body does not follow. The test instead constructs a standalone transaction directly. No behavior impact; the test is correct. The comment mismatch may confuse a future reader who expects to find a service.create() call in the test body.

- apps/api/src/pages/integration-test-support.ts:54 — DB_USER and DB_PASSWORD default to empty strings when env vars are unset
  readDbOptionsFromEnv() at line 54-55 returns empty strings for DB_USER and DB_PASSWORD when those env vars are absent, unlike DB_HOST (127.0.0.1), DB_PORT (3306), and DB_NAME (sfus) which have meaningful defaults. A connection attempt with empty credentials will fail with a generic DB driver error rather than a clear missing-credentials message. This is functionally safe since the DataSource.initialize() call will immediately fail. Adding a brief JSDoc note documenting that DB_USER and DB_PASSWORD require explicit env vars (no safe default) would aid debugging.

Test sufficiency assessment:
- Coverage is sufficient for all five acceptance criteria. Test 1 exercises PagesService.create end-to-end against the real MySQL schema, verifying both standalone_pages and page_revisions rows persist with revisionNumber=1, currentRevisionId set and cross-referenced correctly. Test 2 proves database-level rollback atomicity via a deliberate uq_page_revisions_page_revision_number violation inside a transaction, confirming no orphaned standalone_pages row survives. The skip path is covered by describe.skipIf(!DB_INTEGRATION_ENABLED) plus a logged skip reason. Cleanup logic (afterEach removes pages, afterAll removes the throwaway user) correctly handles the FK cycle by nulling current_revision_id before deleting standalone_pages. The direct-service rollback gap (WARNING) is structurally unavoidable without violating AC5.

Documentation accuracy assessment:
- Documentation is accurate and complete. cicd/docs/cicd.md adds a well-structured "Database integration tests" section with copy-pasteable commands for both direct invocation and via run-validations.sh. cicd/docs/local-pipeline.md adds a "Database integration spec" section with commands and a cross-reference to cicd.md. docs/website-launch-guide.md adds section 4 with the full invocation sequence. All three documents consistently state DB_PORT=3306 matching the documented dev-stack defaults. The pages-service-integration entry in validation-config.yml correctly notes the spec skips safely when SFUS_DB_INTEGRATION is unset, making it safe for the default validation run.

Verdict:
- PASS
