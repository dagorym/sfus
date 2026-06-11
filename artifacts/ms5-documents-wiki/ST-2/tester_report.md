# Tester Report — ST-2: Documents Read API

## Task Summary

Validated the DocsService and DocsController implementation for ST-2 (Documents read API):
path resolution, breadcrumbs, tree/children index, recent feed, and oracle parity (P12).

## Testing Scope

- Implementation surface: `apps/api/src/docs/docs.service.ts`, `apps/api/src/docs/docs.controller.ts`, `apps/api/src/docs/docs.module.ts`, `apps/api/src/docs/docs.types.ts`
- Test files created: `apps/api/src/docs/docs.service.test.ts`, `apps/api/src/docs/docs.controller.test.ts`
- Test file updated: `apps/api/src/docs/docs-module.test.ts` (ST-1 placeholder tests updated for ST-2 intentional behavior change)
- Artifact directory: `artifacts/ms5-documents-wiki/ST-2`

## Acceptance Criteria Results

| AC | Description | Result |
|----|-------------|--------|
| AC1 | GET /api/docs/*path resolves published site page with current revision and ordered breadcrumb ancestry | PASS |
| AC2 | Nonexistent, deleted, and non-readable pages all return identical 404 (oracle parity) — PAGE_NOT_FOUND_MESSAGE constant | PASS |
| AC3 | GET /api/docs returns site page tree with no project-scoped pages | PASS |
| AC4 | GET /api/docs/recent returns recent published site-doc edits, excludes non-readable/project pages, respects limit (default=5, max=20) | PASS |
| AC5 | All read paths route through AuthorizationService.evaluate() with anonymous actor — no inline re-derived predicates | PASS |

## Test Execution

**Command**: `npx --yes pnpm@10.0.0 --filter @sfus/api --dir /home/tstephen/repos/worktrees/ms5-st2-tester-20260610 test`

**Result**: 1065 passed | 11 skipped (integration tests, by design) | 0 failed

**Breakdown by test file**:
- `docs.service.test.ts`: New file — 53 tests covering service methods, oracle parity, AuthorizationService routing, limits
- `docs.controller.test.ts`: New file — 24 tests covering controller delegation, shape correctness, oracle parity propagation
- `docs-module.test.ts`: 2 tests updated — ST-1 "empty arrays" placeholders replaced with ST-2 registrations

Also ran:
- `npx --yes pnpm@10.0.0 --filter @sfus/api --dir ... lint` — PASS (0 warnings, 0 errors)
- `npx --yes pnpm@10.0.0 --filter @sfus/api --dir ... typecheck` — PASS (0 errors)

## Existing Test Regression

Two tests in `docs-module.test.ts` were updated (not broken by my changes, but by the ST-2 implementer's intentional wiring of DocsController and DocsService into the module). The ST-1 tests expected empty `controllers` and `providers` arrays as placeholders; ST-2 correctly adds both. Updated assertions now verify `length >= 1`. Justification: this is an expected behavior change, not a defect.

## Key Findings

- `DocsService.PAGE_NOT_FOUND_MESSAGE = 'Document page not found.'` confirmed as the single constant used across all gated paths
- `isPagePubliclyReadable` correctly short-circuits on `scopeType !== 'site'` without calling `evaluate()`, mirroring `ForumsService.isBoardPubliclyReadable`
- Anonymous actor `{ userId: null, globalRole: '' }` confirmed in evaluate() calls
- `computePathHash` is public and deterministic (SHA-256 format confirmed)
- `listRecentEdits` correctly builds allow-list before querying revisions, capping at 20 and defaulting to 5

## Test Commit

`e1583eb`

## Files Written

- `artifacts/ms5-documents-wiki/ST-2/tester_report.md` (this file)
- `artifacts/ms5-documents-wiki/ST-2/tester_result.json`
- `artifacts/ms5-documents-wiki/ST-2/documenter_prompt.txt`
