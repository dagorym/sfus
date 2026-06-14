# Verifier Report

## Scope Reviewed

Story: RUNTIME BUG FIX — Swagger UI was mounted at /api/docs, colliding with the MS5 Documents API
GET /api/docs. Fix: Swagger moved to /api/swagger (+ /api/swagger/openapi.json) in
apps/api/src/index.ts; index.test.ts assertions updated + regression guard added; Swagger path
updated in three docs.

Branch/worktree: ms5-swaggerfix-verifier-20260612
Implementer commit: c32af68
Tester commit: e96d9ab
Documenter commit: e1b4e3b (+ e6e18b05 artifact commit)
Comparison base: ms5

Files reviewed:
- apps/api/src/index.ts
- apps/api/src/index.test.ts
- apps/api/src/docs/docs.controller.ts
- docs/operations/launch.md (~163)
- docs/development/api-conventions.md (~34)
- apps/api/README.md (~10)
- docs/features/documents.md (intact check)
- docs/architecture/milestone-1-foundation-decisions.md (stale reference check)

## Acceptance Criteria / Plan Reference

Source: task prompt acceptance criteria AC1–AC5.

## Convention Files Considered

- AGENTS.md (repo entry point)
- docs/README.md (documentation routing table)
- docs/development/api-conventions.md (API conventions)
- docs/architecture/milestone-1-foundation-decisions.md (locked ADR)

---

## Findings

### WARNING

- docs/architecture/milestone-1-foundation-decisions.md:36 — Stale Swagger path in ADR
  The locked architectural decision record says: "Swagger/OpenAPI is included in Milestone 1 at
  `/api/docs`." This file was not updated by the documenter. The three operational/developer-facing
  docs (launch.md, api-conventions.md, apps/api/README.md) were all updated correctly. The ADR is
  a historical record of decisions as made in Milestone 1, so "at `/api/docs`" is historically
  accurate. However, AC4 requires no doc still describes Swagger at /api/docs. A reader consulting
  this file for current setup will see the old path. Recommend adding a parenthetical note such as
  "(subsequently moved to /api/swagger in MS5 to resolve collision with the Documents API)" on
  the same line or as a follow-on bullet. This is not BLOCKING because all live operational
  references are correct and the ADR's purpose is historical record, but it does technically
  fail AC4.

### NOTE

- apps/api/src/index.test.ts:180–196 — AC5 regression guard is unit-level (adequate given constraints)
  The test at line 180 ("AC2 regression guard: Swagger is NOT mounted at api/docs") is a unit test
  that asserts the string argument passed to SwaggerModule.setup(). It does NOT perform a live HTTP
  GET /api/docs to confirm JSON (not Swagger HTML) is returned, because test-harness.ts is a bare
  Express app, not a real Nest+Swagger boot, so a true runtime guard is not feasible in-suite.
  Assessment: the unit guard is adequate for the in-suite context. It will cause the test suite to
  fail if a future change regresses to "api/docs". The Coordinator's post-merge live stack
  verification provides the runtime-level assurance layer. The combination is sufficient.

---

## Test Sufficiency Assessment

The @sfus/api suite was run against the worktree's files using the following method: a symlink was
created from `/home/tstephen/repos/worktrees/ms5-swaggerfix-verifier-20260612/apps/api/node_modules`
to `/home/tstephen/repos/sfus/apps/api/node_modules` (the main workspace's installed packages).
Vitest was invoked with `--root /home/tstephen/repos/worktrees/ms5-swaggerfix-verifier-20260612/apps/api`,
exercising the worktree's source files. The symlink was removed after the run. Result:
**1296 tests passed, 30 skipped (DB integration), 0 failed.**

The 6 tests in index.test.ts all pass and cover:
1. Swagger mounted at "api/swagger" with jsonDocumentUrl "api/swagger/openapi.json" (AC1 positive check)
2. Regression guard: Swagger NOT mounted at "api/docs" (AC1/AC2 negative guard)
3. Helmet middleware registration ordering
4. HSTS-disabled CSP-disabled configuration
5. Trust proxy set to 1
6. Swagger skipped when swaggerEnabled=false

The negative guard (test 2) is the key regression protection introduced by this fix. Test coverage
for the Swagger path change is sufficient. The full API suite is unaffected.

## Documentation Accuracy Assessment

Three operational docs were updated correctly:
- docs/operations/launch.md:163 — Runtime URLs table updated: "Swagger (dev)" row now shows
  `http://localhost:3001/api/swagger`
- docs/development/api-conventions.md:34–37 — "Routing & Swagger" section updated to document
  `/api/swagger` as the current mount, with an explicit note that the mount was moved from `/api/docs`
  to avoid collision with the Documents API namespace.
- apps/api/README.md:10 — "Runtime contract" section updated: Swagger now listed as `/api/swagger`
  (+ `/api/swagger/openapi.json`).

docs/features/documents.md: All /api/docs/* Documents API routes intact and unchanged (AC3 intact
check passes).

docs/architecture/milestone-1-foundation-decisions.md:36: Stale reference remains (see WARNING
finding above). This is the only inconsistency.

All other docs (deployment.md, authorization.md, features/web-shell.md) contain /api/docs
references that correctly refer to the Documents API — these are not stale; they are correct.

## Security Review

This change is limited to a mount path string change in bootstrap configuration. No authentication,
authorization, input validation, or session handling is modified. The Swagger route itself is
dev-only (gated by swaggerEnabled). No security issues identified.

---

## Verdict: CONDITIONAL PASS

The implementation (AC1), tests (AC2), and three operational doc updates (AC3) are all correctly
implemented and the full test suite passes. The Documents API /api/docs/* contract is intact.

The single finding is a WARNING: docs/architecture/milestone-1-foundation-decisions.md:36 still
references Swagger at `/api/docs`, which technically fails AC4. This is a historical ADR entry,
not an operational reference, and all live docs are correct. The fix is a one-line annotation to
the ADR.

Condition to upgrade to PASS: Add a brief note to
docs/architecture/milestone-1-foundation-decisions.md line 36 indicating the path was subsequently
moved to /api/swagger (e.g., as a parenthetical on the existing bullet). This can be done in the
same branch before merge, or as a follow-on commit.
