# Tester Report — deferred-cleanup/subtask-4

## Status: PASS

## Testing Scope

**Task:** Validate blog slug TOCTOU hardening — BlogService.create() catches duplicate-key errors (MySQL ER_DUP_ENTRY, SQLite UNIQUE constraint failed) and retries deriveUniqueSlug + save up to 3 times. On exhaustion throws ConflictException (409). Non-dup-key errors propagate.

**Branch:** `cleanup-subtask-4-tester-20260607`

**Implementation surface:** `apps/api/src/blog/blog.service.ts` — `create()`, `saveWithDerivedSlugRetry()`, `isDuplicateKeyError()`, `SLUG_RETRY_LIMIT` constant.

## Acceptance Criteria Validation

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Save rejected with duplicate-key error retries derivation and succeeds (MySQL + SQLite variants) | PASS | Tests "retries derivation and succeeds when first save throws a duplicate-key error (MySQL ER_DUP_ENTRY)" and "retries derivation and succeeds when first save throws a SQLite UNIQUE constraint error" — both pass; save mock called twice |
| 2 | Retry attempts bounded at SLUG_RETRY_LIMIT=3; exhaustion returns ConflictException (409), never raw 500 | PASS | Test "throws ConflictException (409-class) after SLUG_RETRY_LIMIT duplicate-key failures" confirms save called exactly 3 times and ConflictException thrown. Test "propagates non-duplicate-key errors without retrying" confirms save called once on non-dup errors |
| 3 | Every deriveUniqueSlug-consuming write path covered; count stated | PASS | Only `create()` calls `saveWithDerivedSlugRetry` which calls `deriveUniqueSlug`. `update()` does not call `deriveUniqueSlug` — uses explicit slug. Count: 1 path |
| 4 | JSDoc on affected methods reflects retry semantics | PASS | `create()` JSDoc documents TOCTOU hardening, ER_DUP_ENTRY/SQLITE_CONSTRAINT detection, SLUG_RETRY_LIMIT=3, and ConflictException on exhaustion. `saveWithDerivedSlugRetry()` JSDoc similarly documents the retry contract |

## Tester-Introduced Fix

**Problem found:** The implementer's MySQL ER_DUP_ENTRY test had an insufficient `findOne` mock — only 3 `mockResolvedValueOnce` calls registered, but the implementation's retry flow requires 4:

1. `deriveUniqueSlug` attempt 1: `findOne(base)` → taken (call 1), `findOne("-2")` → null (call 2) → returns "concurrent-post-2"
2. `save` attempt 1 → rejected with `ER_DUP_ENTRY` (TOCTOU race)
3. `deriveUniqueSlug` attempt 2: `findOne(base)` → null (call 3, originally pointing to savedPost) → returns "concurrent-post"
4. `save` attempt 2 → succeeds
5. Reload: `findOne({id})` → savedPost (call 4, originally exhausted → undefined)

Because the 3rd registered mock was returning `savedPost` (truthy) for the base-slug collision check in attempt 2, `deriveUniqueSlug` would then check `findOne("-2")` as call 4 (exhausted → undefined/falsy = not taken) and return "concurrent-post-2". But call 5 (the reload) was exhausted, returning `undefined`, so `result` was `undefined`.

**Fix:** Added one `mockResolvedValueOnce(null)` as the 3rd call (attempt 2 base-slug check returns null = not taken) and preserved `mockResolvedValueOnce(savedPost)` as the 4th call (reload). Updated comment to document the full 4-call sequence.

**Justification:** This is a test mock authoring error, not an implementation defect. The implementation correctly calls `deriveUniqueSlug` again on retry (consuming 1+ additional `findOne` calls), and the reload always adds 1 more. The SQLite test already worked because its mock setup happened to produce a truthy value that allowed the retry path to proceed to a successful reload.

**Files modified:** `apps/api/src/blog/blog.service.test.ts` (tester-only change, 9 insertions / 3 deletions in mock setup and comments).

## Commands Executed

- `/home/tstephen/miniconda3/envs/sfusdev/lib/node_modules/corepack/shims/pnpm -C /home/tstephen/repos/sfus/cleanup-subtask-4-tester-20260607 --filter @sfus/api exec vitest run src/blog/blog.service.test.ts --reporter=verbose` — initial run: 1 FAIL (MySQL ER_DUP_ENTRY mock), 88 pass
- (mock fix applied)
- Re-run of above command — PASS: 89/89 tests pass
- `/home/tstephen/miniconda3/envs/sfusdev/lib/node_modules/corepack/shims/pnpm -C /home/tstephen/repos/sfus/cleanup-subtask-4-tester-20260607 --filter @sfus/api exec vitest run` — API full suite: 357 pass, 2 skipped (DB integration, expected)
- `/home/tstephen/miniconda3/envs/sfusdev/lib/node_modules/corepack/shims/pnpm -C /home/tstephen/repos/sfus/cleanup-subtask-4-tester-20260607 --filter @sfus/web exec vitest run` — web full suite: 264 pass

## Test Results

| Suite | Pass | Fail | Skip |
|-------|------|------|------|
| blog.service.test.ts (targeted) | 89 | 0 | 0 |
| API full suite | 357 | 0 | 2 (DB integration, expected) |
| Web full suite | 264 | 0 | 0 |

## Describe Block Verified

`BlogService.create slug TOCTOU hardening (subtask-4)` — 4 tests:
- "retries derivation and succeeds when first save throws a duplicate-key error (MySQL ER_DUP_ENTRY)" — PASS
- "retries derivation and succeeds when first save throws a SQLite UNIQUE constraint error" — PASS
- "throws ConflictException (409-class) after SLUG_RETRY_LIMIT duplicate-key failures (exhausted)" — PASS
- "propagates non-duplicate-key errors without retrying" — PASS

## Test Commit

`bd08d2e` — test(blog): fix MySQL ER_DUP_ENTRY retry mock call sequence

## Files Modified

**Implementer:**
- `apps/api/src/blog/blog.service.ts` — TOCTOU hardening: `saveWithDerivedSlugRetry()`, `isDuplicateKeyError()`, `SLUG_RETRY_LIMIT`, JSDoc updates

**Tester:**
- `apps/api/src/blog/blog.service.test.ts` — fixed MySQL ER_DUP_ENTRY mock call sequence (4 findOne calls instead of 3)

## Cleanup

No temporary non-handoff byproducts created. The worktree has a `node_modules/` installation created by `pnpm install --frozen-lockfile` to enable running tests from the worktree. This is a build artifact, not a handoff artifact — it is already gitignored and will not appear in commits.
