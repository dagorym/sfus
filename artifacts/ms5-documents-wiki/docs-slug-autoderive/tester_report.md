# Tester Report: docs slug auto-derivation (docs-slug-autoderive)

## Task Summary

Validated the POST /api/docs slug auto-derivation feature introduced by the Implementer (commit 544f3d4).
When `slug` is omitted or blank, the API now derives a URL-safe slug from the title. Explicit slugs
are unchanged (still validated and 409 on collision).

## Scope

- Branch: `ms5-docslug-tester-20260612`
- Test files modified:
  - `apps/api/src/docs/docs.controller.test.ts`
  - `apps/api/src/docs/docs.service.test.ts`

## Step 1: Stale Test Fixes

Two stale test assertions (old behavior: blank/empty slug → 400) were replaced.

### docs.controller.test.ts
- **Removed:** `"throws BadRequestException (400) for missing slug in body guard (AC3)"`
  - Input: `{ title: "T", slug: "  ", body: "b" }`
  - Old expectation: rejects with `BadRequestException`
  - New behavior: resolves successfully (slug auto-derived from title)
- **Replaced with:** Two tests (G) confirming 201 success when slug is blank or omitted.

### docs.service.test.ts
- **Removed:** `"throws BadRequestException (400) for empty slug"`
  - Input: `{ title: "T", slug: "", body: "b" }`
  - Old expectation: rejects with `BadRequestException`
  - New behavior: resolves with `path: "t"` (derived from title "T")
- **Replaced with:** Test asserting `result.path === "t"`.

## Step 2: New Coverage Added

12 new tests added in a `describe("DocsService.createPage (slug auto-derivation: ...)")` block
and 1 new controller test (G):

| ID | Test | Assertion |
|----|------|-----------|
| A  | Omitted slug, title "Hello World" | path === "hello-world" |
| B  | Blank slug `""`, title "Hello World" | path === "hello-world" |
| C1 | Collision: base "my-page" exists | resolves with path "my-page-2" |
| C2 | Two pages, same title | first gets base path (no collision in clean mock) |
| D1 | Degenerate title "!!!" | path === "page" (fallback) |
| D2 | Degenerate title "!!!", "page" already exists | path === "page-2" |
| E1 | Explicit slug "custom-slug" | path === "custom-slug" |
| E2 | Second call, same explicit slug | throws ConflictException (409) |
| F  | Child page, parent has path "parent" | path === "parent/child-page", depth === 1 |
| G1 | Controller: blank slug | resolves 201, has page property |
| G2 | Controller: omitted slug entirely | resolves 201, has page property |
| AC3-fix | Blank slug service test | path === "t" (replaced stale 400) |

## Test Execution Results

Commands run:
- `pnpm --dir /home/tstephen/repos/worktrees/ms5-docslug-tester-20260612 --filter @sfus/api test`
- `pnpm --dir /home/tstephen/repos/worktrees/ms5-docslug-tester-20260612 --filter @sfus/api lint`
- `pnpm --dir /home/tstephen/repos/worktrees/ms5-docslug-tester-20260612 --filter @sfus/api typecheck`

Results:
- **Tests passed:** 1306
- **Tests failed:** 0
- **Tests skipped:** 30 (integration tests, require DB)
- **Lint:** PASS (0 warnings, 0 errors)
- **Typecheck:** PASS (no errors)

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| A: omitted slug → derived path | PASS |
| B: blank slug → derived path | PASS |
| C: collision → -2 suffix | PASS |
| D: degenerate title → "page" fallback with suffix | PASS |
| E: explicit slug preserved, 409 on collision | PASS |
| F: derived slug under parent path | PASS |
| G: controller omitted slug → 201 not 400 | PASS |

## Commit

Test commit: `02c4609`

## Cleanup

No temporary byproducts created. No files to clean up.
