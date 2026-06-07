# Tester Report — MS3 Subtask-6: Optional Blog Post Slug Auto-Generation

## Task
Validate that blog post slug is optional on creation, auto-generated from title when omitted, handles slug collisions with numeric suffixes, has an empty-slugify fallback, and that `adminCreatePost` surfaces real server error messages.

## Branch
`ms3-subtask-6-implementer-20260606`

## Test Commit
`48272ac` — test(blog): add slug auto-generation and error surfacing tests

## Test Files Modified
- `apps/api/src/blog/blog.service.test.ts` — added describe block "BlogService slug auto-generation" (6 tests)
- `apps/web/app/blog/blog.spec.ts` — added describe blocks "Admin blog create page optional slug source contracts" (2 tests) and "blog-client.ts adminCreatePost error message surfacing" (2 tests)

## Acceptance Criteria Results

| # | Criterion | Result |
|---|-----------|--------|
| AC1 | Creating a blog post with no slug succeeds and produces a unique URL-safe slug derived from the title | PASS |
| AC2 | Two posts whose titles slugify identically both succeed with distinct slugs (second gets -2 suffix) | PASS |
| AC3 | Creating a blog post with an explicit slug is validated and used unchanged | PASS |
| AC4 | Blog admin create form accepts empty slug with auto-generation indicator; API errors surface real server message | PASS |

## Test Results

### apps/api/src/blog/blog.service.test.ts
- **72 tests passed, 0 failed**
- New tests: 6 (under "BlogService slug auto-generation")
  - `create() with no slug auto-derives a URL-safe slug from the title` — PASS
  - `create() with blank slug string auto-derives from the title` — PASS
  - `create() appends -2 suffix when base slug is already in use` — PASS
  - `create() uses 'post' as fallback when title slugifies to empty string` — PASS
  - `create() uses an explicit slug unchanged when it is valid` — PASS
  - `create() throws BadRequestException for an invalid explicit slug` — PASS

### apps/web/app/blog/blog.spec.ts
- **62 tests passed, 0 failed**
- New tests: 4
  - `slug input has no required attribute (slug is optional)` — PASS
  - `slug input shows an auto-generation helper hint` — PASS
  - `adminCreatePost error parsing reads payload.error.message before payload.message` — PASS
  - `adminCreatePost error chain prefers error.message over the generic fallback` — PASS

## Typecheck
- `@sfus/api` typecheck: PASS
- `@sfus/web` typecheck: PASS

## Pre-existing Failures (excluded from scope)
- `apps/api/src/navigation/navigation.controller.test.ts`: ENOENT path bug (pre-existing, commit 5d3e83b, outside allowed file list)
- Lint: `UnauthorizedException` unused in same file (pre-existing, outside allowed file list)

## Negative-Path Coverage
The slug auto-generation path involves user-supplied title text (externally supplied). Negative cases covered:
- Invalid explicit slug format throws `BadRequestException` (existing + re-verified)
- Empty/blank title still throws `BadRequestException` via `assertTitleValid` (pre-existing test)
- Empty-slugify result falls back to "post" rather than crashing

## Cleanup
No temporary non-handoff byproducts were created.
