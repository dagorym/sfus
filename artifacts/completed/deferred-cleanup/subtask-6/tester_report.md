# Tester Report — deferred-cleanup subtask-6

**Status:** PASS

## Task Summary

Validate the public GET /pages list endpoint (PagesController.listPublished) and
web /pages index route (app/pages/page.tsx) added by the implementer for subtask-6.

## Acceptance Criteria Results

| # | Criterion | Result |
|---|-----------|--------|
| AC1 | List endpoint returns only published pages via shared predicate — drafts never appear | PASS |
| AC2 | Payload contains only index fields (slug, title, updatedAt — no body) | PASS |
| AC3 | /pages renders published list; bare /pages navigation resolves; empty state renders cleanly | PASS |
| AC4 | Ordering deterministic (title ascending) | PASS |
| AC5 | Swagger documents new endpoint | PASS |

## Test Coverage Added

### apps/api/src/pages/pages.service.test.ts
Added 4 operator-pinned tests to the PagesService.findPublished describe block:
- Returns empty array when no published pages exist (AC1 — empty list safe)
- Passes status='published' to the repository find call (AC1 — operator-pinned query)
- Passes order title ASC to the repository find call (AC4 — deterministic ordering)
- Never returns draft pages (AC1 — drafts must never appear in public list)

Before: 48 tests | After: 52 tests

### apps/web/app/pages/pages.spec.ts
Added 18 new source-contract tests across 4 new describe blocks:

**pages-client.ts source contracts** (3 new tests):
- Exports listPublishedPages without credentials (public index, AC1)
- listPublishedPages() uses apiBase/pages endpoint (correct endpoint, AC1)
- listPublishedPages() returns pages array from { pages } envelope (payload shape, AC2)

**Public /pages index route source contracts** (7 new tests, AC3):
- File exists and imports listPublishedPages
- Renders Link elements to /pages/<slug> for each published page
- Has empty state when no pages are published
- Has loading state while pages are being fetched
- Has error state when the fetch fails
- Does not call any admin or authenticated endpoint
- Uses 'use client' directive

**PagesController.listPublished source contracts** (5 new tests, AC2, AC4, AC5):
- Has @Get() decorator with no path param (bare /pages route)
- Has @ApiOperation on listPublished (Swagger documented)
- Has @ApiOkResponse on listPublished (Swagger response documented)
- toSummary helper returns only slug, title, updatedAt — no body
- PageSummary interface contains slug, title, updatedAt — no body

**PagesService.findPublished source contracts** (3 new tests, AC1, AC4):
- Queries with status='published' (drafts never appear)
- Orders results by title ASC (deterministic ordering)
- Does not include draft or unpublished pages (shared predicate pinned)

Before: 264 tests (43 in pages.spec.ts) | After: 282 tests (61 in pages.spec.ts)

## Validation Commands Run

All from the main repo root (cleanup branch with implementer changes merged):

| Command | Result |
|---------|--------|
| pnpm --filter @sfus/api lint | PASS (clean) |
| pnpm --filter @sfus/api typecheck | PASS (clean) |
| pnpm --filter @sfus/api test | 357 passed, 4 pre-existing failures (helmet/TOCTOU MySQL) |
| pnpm --filter @sfus/web lint | PASS (clean) |
| pnpm --filter @sfus/web typecheck | PASS (clean) |
| pnpm --filter @sfus/web test | 282 passed, 0 failures |

## Pre-existing Failures (Not This Subtask)

4 pre-existing API test failures, unchanged from before this subtask:
1-3. apiBootstrap tests fail due to missing helmet package resolution in test environment
4. BlogService.create slug TOCTOU hardening — MySQL ER_DUP_ENTRY retry test

These failures exist on the cleanup branch and are unrelated to the GET /pages implementation.

## Implementation Audit Summary

The implementation correctly:
- Routes @Get() (bare) to listPublished() with @ApiOperation and @ApiOkResponse (AC5)
- Maps entities via toSummary() returning {slug, title, updatedAt} only — no body (AC2)
- Calls PagesService.findPublished() which queries {where: {status: 'published'}, order: {title: 'ASC'}} (AC1, AC4)
- Exports listPublishedPages() without credentials: 'include' from pages-client.ts (public, AC1)
- Renders app/pages/page.tsx with Link elements, loading, error, and empty states (AC3)

## Code Commit Hash

8ddab0c (test commit — two-commit artifact flow; implementer code commit: 41afc74)
