Verifier Report — deferred-cleanup/subtask-4

## Scope Reviewed

- **Implementer (eb03724):** `apps/api/src/blog/blog.service.ts` — added `SLUG_RETRY_LIMIT` constant, `isDuplicateKeyError()` helper, `saveWithDerivedSlugRetry()` method; refactored `create()` into explicit-slug and auto-derive paths; imported `ConflictException` from `@nestjs/common`.
- **Tester (bd08d2e):** `apps/api/src/blog/blog.service.test.ts` — added 4 targeted tests for TOCTOU retry behavior; fixed MySQL ER_DUP_ENTRY mock call sequence (4 findOne calls instead of 3).
- **Documenter (d0a0abd):** `docs/features/blog.md` — replaced "accepted characteristic (see deferred-tasks.md)" note with accurate description of retry behavior, 409 Conflict on exhaustion, and no-retry on explicit-slug paths.

## Acceptance Criteria / Plan Reference

- `plans/deferred-cleanup-plan.md` — subtask-4 (Blog slug TOCTOU hardening), acceptance criteria 1–4.
- Register item: deferred-tasks.md item #19 (file line 21), labeled "Scheduled: deferred-cleanup subtask-4".

## Convention Files Considered

- `AGENTS.md` — repository workflow policy
- `docs/development/api-conventions.md` — API conventions
- `docs/development/testing.md` — testing conventions
- `docs/features/blog.md` — canonical blog feature documentation

## Findings

### BLOCKING

None.

### WARNING

None.

### NOTE

- `apps/api/src/blog/blog.service.ts:547` — `isDuplicateKeyError` checks `errno === 1062` independently from `code === "ER_DUP_ENTRY"`.
  The OR condition means an error object with only `errno=1062` (without `code="ER_DUP_ENTRY"`) is classified as a duplicate-key error. In MySQL/MariaDB these properties always appear together on ER_DUP_ENTRY. The only unique constraint reachable from a `create()` save is `uq_blog_posts_slug` (the UUID primary key is collision-free), so a false-positive match on a different unique-constraint violation is not currently possible. The check is safe for the current schema and low risk. No change required.

## Acceptance Criteria Evaluation

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| AC1 | Duplicate-key errors trigger retry — confirmed by 2 targeted tests | PASS | Tests "retries derivation and succeeds when first save throws a duplicate-key error (MySQL ER_DUP_ENTRY)" and "retries derivation and succeeds when first save throws a SQLite UNIQUE constraint error" both pass; save mock called twice in each |
| AC2 | Retry bounded at 3; exhaustion returns ConflictException (409); non-dup-key errors propagate unchanged — confirmed by 2 targeted tests | PASS | Exhaustion test: save called exactly 3 times, ConflictException thrown. Non-dup-key test: save called once, original Error rethrown |
| AC3 | 1 write path covered (create only; update not affected) | PASS | `deriveUniqueSlug` called only from `saveWithDerivedSlugRetry` which is called only from `create()`. `update()` uses explicit supplied slug only. Count: 1 |
| AC4 | JSDoc on SLUG_RETRY_LIMIT, isDuplicateKeyError, saveWithDerivedSlugRetry, and create() reflects retry semantics | PASS | All four have JSDoc documenting retry contract, error pattern recognition, and ConflictException on exhaustion |

## Test Sufficiency Assessment

SUFFICIENT. Four targeted tests in `describe("BlogService.create slug TOCTOU hardening (subtask-4)")` cover all four acceptance criteria directly:

1. MySQL ER_DUP_ENTRY triggers retry and succeeds — tests `isDuplicateKeyError` MySQL path and `saveWithDerivedSlugRetry` retry logic.
2. SQLite UNIQUE constraint triggers retry and succeeds — tests `isDuplicateKeyError` SQLite path.
3. Exhaustion after SLUG_RETRY_LIMIT=3 failures throws ConflictException — pins the boundary exactly.
4. Non-duplicate-key errors propagate unchanged with save called once — confirms no retry swallowing.

The tester identified and fixed a mock call-sequence bug in test 1 (3 findOne mocks were insufficient; 4 are needed to cover both `deriveUniqueSlug` derivation calls and the final reload). The fix is correct and well-documented.

Test run results: blog.service.test.ts 89 pass / 0 fail / 0 skip; API full suite 357 pass / 0 fail / 2 skip (DB integration, expected); web full suite 264 pass / 0 fail / 0 skip. Verified independently in this verifier session.

## Documentation Accuracy Assessment

ACCURATE. `docs/features/blog.md` correctly replaces the old "accepted characteristic (see docs/deferred-tasks.md)" note with an accurate, implementation-matching description:

- Retry triggers on MySQL `ER_DUP_ENTRY` or SQLite `UNIQUE constraint failed` (matches `isDuplicateKeyError` implementation).
- Up to 3 retries (matches `SLUG_RETRY_LIMIT = 3`).
- 409 Conflict on exhaustion (matches `ConflictException` throw).
- No retry for explicit-slug paths (caller owns uniqueness for that path).

`docs/deferred-tasks.md` line 21 intentionally not modified. Per `plans/deferred-cleanup-plan.md` "Overall Documentation Impact" note: "closed entries are removed in the **next planning cycle** after this plan completes." The documenter documented this assumption explicitly. This is correct behavior.

## Verdict

**PASS**

No blocking findings. No warnings. One low-risk NOTE on the errno-only OR branch in `isDuplicateKeyError` that does not require a change. All acceptance criteria are satisfied. Test coverage is sufficient. Documentation is accurate. The implementation is correct and well-scoped.
