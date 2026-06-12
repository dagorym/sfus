# Tester Report: Swagger Path Fix (api/docs → api/swagger)

**Subtask:** swagger-path-fix  
**Plan:** ms5-documents-wiki  
**Branch:** ms5-swaggerfix-tester-20260612  
**Test commit:** e96d9ab9c7342cfa543802dadb87e18f2950632d

---

## Testing Scope

**Goal:** Validate that SwaggerModule.setup was moved from `api/docs` to `api/swagger` in
`apps/api/src/index.ts`, eliminating the route collision with the Documents API
GET /api/docs endpoint.

**Implementation surface:** `SwaggerModule.setup` call in `apps/api/src/index.ts`

**Acceptance criteria:**

- AC1: `SwaggerModule.setup` is called with `"api/swagger"` (not `"api/docs"`), and
  `jsonDocumentUrl` is `"api/swagger/openapi.json"`, when `swaggerEnabled=true`.
- AC2: The Documents API GET /api/docs index route is no longer shadowed by Swagger —
  a unit-level regression guard asserts SwaggerModule.setup is never called with
  `"api/docs"`.
- AC3: Full `@sfus/api` suite passes after test updates.

---

## Test Files Modified

- `apps/api/src/index.test.ts`
  - Updated existing test title: "boots the API with the /api prefix and serves Swagger
    at /api/docs when enabled" → "... at /api/swagger when enabled"
  - Updated existing assertions: `"api/docs"` → `"api/swagger"`, `"api/docs/openapi.json"` →
    `"api/swagger/openapi.json"` (and added AC1 comment)
  - Added new test: "AC2 regression guard: Swagger is NOT mounted at api/docs (would shadow
    Documents API GET /api/docs)" — asserts `setupSwagger` first arg is NOT `"api/docs"` and IS
    `"api/swagger"`

---

## Why Full-Boot Integration Test Was Not Added

`test-harness.ts` deliberately builds a minimal bare Express application (no NestJS, no DB)
to avoid requiring a database connection. `SwaggerModule.setup` requires an `INestApplication`
instance (a full NestJS app). Spinning up a full Nest app in this harness would require either
a live DB connection or significant new mock infrastructure beyond the scope of this fix.

The unit-level guard in `index.test.ts` is the strongest provable guard achievable in the
existing harness. It catches any future regression where `SwaggerModule.setup` is called with
`"api/docs"` and fails the suite immediately.

---

## Test Execution

**How tests were run against THIS worktree:**

The worktree at `/home/tstephen/repos/worktrees/ms5-swaggerfix-tester-20260612/apps/api/`
has no pnpm-managed `node_modules` (worktrees share git content but not node_modules symlinks).
To resolve this, symlinks were created:

- `apps/api/node_modules` → `/home/tstephen/repos/sfus/apps/api/node_modules`
- `node_modules` → `/home/tstephen/repos/sfus/node_modules`

Tests were then run using the main workspace's vitest binary with `--root` pointing at the
worktree's `apps/api` directory, ensuring the modified `index.test.ts` and the implementer's
modified `index.ts` from the worktree are the files under test:

```
/home/tstephen/repos/sfus/node_modules/.bin/vitest run \
  --root /home/tstephen/repos/worktrees/ms5-swaggerfix-tester-20260612/apps/api \
  src/index.test.ts
```

**Commands executed:**

1. `vitest run --root <worktree>/apps/api src/index.test.ts` — targeted test run
2. `vitest run --root <worktree>/apps/api` — full @sfus/api suite

---

## Results

### Targeted run (src/index.test.ts)

```
Test Files  1 passed (1)
Tests       6 passed (6)
```

All 6 tests passed, including:
- "boots the API with the /api prefix and serves Swagger at /api/swagger when enabled" (AC1)
- "AC2 regression guard: Swagger is NOT mounted at api/docs ..." (AC2)
- 4 pre-existing tests (helmet, trust-proxy, swagger-disabled, etc.)

### Full @sfus/api suite

```
Test Files  34 passed | 3 skipped (37)
Tests       1296 passed | 30 skipped (1326)
```

Skipped tests are DB integration tests that require `SFUS_DB_INTEGRATION=1` — expected behavior.

---

## Acceptance Criteria Verdict

| AC | Description | Result |
|----|-------------|--------|
| AC1 | SwaggerModule.setup called with "api/swagger" and jsonDocumentUrl "api/swagger/openapi.json" | PASS |
| AC2 | Regression guard: Swagger NOT mounted at "api/docs" | PASS (unit-level guard) |
| AC3 | Full @sfus/api suite green | PASS (1296/1296, 30 skipped DB integration) |

---

## Cleanup

Temporary node_modules symlinks (`apps/api/node_modules` and `node_modules`) were created in
the worktree to enable test execution. These are untracked and intentionally NOT committed.
They are non-handoff byproducts required only for running tests in the worktree environment.
The worktree git status shows them as untracked but they are not staged or committed.

---

## Artifacts Written

- `artifacts/ms5-documents-wiki/swagger-path-fix/tester_report.md` (this file)
- `artifacts/ms5-documents-wiki/swagger-path-fix/tester_result.json`
- `artifacts/ms5-documents-wiki/swagger-path-fix/documenter_prompt.txt`
