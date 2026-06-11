# Implementer Report — Subtask 4: Blog Slug TOCTOU Hardening

**Status:** success
**Branch:** cleanup-subtask-4-implementer-20260607
**Commit:** eb03724
**Date:** 2026-06-07

## Task

Make blog slug persistence concurrency-safe by catching MySQL duplicate-key errors
(ER_DUP_ENTRY) on `save()` calls that use a `deriveUniqueSlug`-derived slug. Retry
derivation with incremented suffix (bounded at 3 attempts), then return a controlled
409-class error envelope on exhaustion.

## Files Changed

- `apps/api/src/blog/blog.service.ts` — implementation
- `apps/api/src/blog/blog.service.test.ts` — new unit tests for retry behavior

## Implementation Summary

### What was added

**`BlogService.SLUG_RETRY_LIMIT` (static readonly = 3)**
Maximum retry attempts before exhaustion.

**`BlogService.isDuplicateKeyError(err)` (static private)**
Returns true for MySQL ER_DUP_ENTRY (code/errno 1062) and SQLite
"UNIQUE constraint failed" message patterns. Covers both production
(MySQL/MariaDB) and test/dev (SQLite) environments.

**`BlogService.saveWithDerivedSlugRetry(...)` (private async)**
Loops up to SLUG_RETRY_LIMIT times: calls `deriveUniqueSlug`, builds
the post entity, and attempts `save()`. On duplicate-key error and
remaining retries: continues. On duplicate-key error and retry
exhaustion: throws `ConflictException` (HTTP 409). On any
non-duplicate-key error: re-throws immediately without retry.

**`BlogService.create()` (updated)**
Split into two execution paths:
- **Explicit slug path:** validates and saves directly (no retry needed;
  caller owns the slug value; no TOCTOU window).
- **Auto-derive path:** delegates to `saveWithDerivedSlugRetry()` for
  TOCTOU-safe persistence.

`ConflictException` imported from `@nestjs/common` (already used in
`auth.service.ts`).

### deriveUniqueSlug call sites

| Write path | Calls deriveUniqueSlug? | Covered by retry? |
|---|---|---|
| `create()` (auto-derive slug) | Yes | Yes — via `saveWithDerivedSlugRetry` |
| `update()` | No — callers always supply an explicit slug | N/A |

**Total call sites: 1**

## Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| AC1: retry-then-success driven by unit test | PASS | Test "retries derivation and succeeds when first save throws a duplicate-key error (MySQL ER_DUP_ENTRY)" — save mocked reject-then-resolve, called twice |
| AC2: bounded retry; exhaustion → 409, never 500 | PASS | SLUG_RETRY_LIMIT=3; exhaustion test confirms save called exactly 3 times and ConflictException thrown |
| AC3: all deriveUniqueSlug call sites covered; count stated | PASS | 1 call site (create() only) |
| AC4: JSDoc on affected methods reflects retry semantics | PASS | create() and saveWithDerivedSlugRetry() JSDoc updated |

## Validation

| Command | Result |
|---|---|
| `npx --yes pnpm@10.0.0 lint` | PASS (0 warnings) |
| `npx --yes pnpm@10.0.0 typecheck` | PASS |
| `npx --yes pnpm@10.0.0 test` | PASS (353 API + 264 web tests) |
| `blog.service.test.ts` isolated | 85 tests passed |

## New Tests (describe: "BlogService.create slug TOCTOU hardening (subtask-4)")

1. Retries derivation and succeeds when first save throws ER_DUP_ENTRY (MySQL)
2. Retries derivation and succeeds when first save throws UNIQUE constraint failed (SQLite)
3. Throws ConflictException after SLUG_RETRY_LIMIT (3) duplicate-key failures
4. Propagates non-duplicate-key errors without retrying
