# Tester Report — Dev-env Config: DOCS_LOCK_TTL_MINUTES (MS5, ST-6)

## Testing Scope

Validate that the implementer's changes to `apps/api/.env.example` and `apps/api/.env` satisfy
acceptance criteria AC1–AC3 for the "Documents wiki contract (Milestone 5, ST-6)" config task.

No product code was changed by the implementer; this is a config/template-only change.

## Assumptions

- Worktree: `/home/tstephen/repos/worktrees/ms5-devenv-tester-20260612` on branch `ms5-devenv-tester-20260612`
- Shared artifact directory: `artifacts/ms5-documents-wiki/dev-env-config` (repository-root-relative)
- Test framework: Vitest, run via `pnpm --filter @sfus/api test`
- Integration tests (requiring `SFUS_DB_INTEGRATION=1`) are correctly skipped in the CI/local run; this is expected behavior.

## Acceptance Criteria Results

### AC1: .env.example and .env contents

**PASS**

- `apps/api/.env.example` contains a `# Documents wiki contract (Milestone 5, ST-6).` header block followed by
  `DOCS_LOCK_TTL_MINUTES=30`, with a description stating `optional; integer 1–1440; default 30`.
- The description matches `environment.ts`: `parseOptionalInteger` with `{ min: 1, max: 1440, defaultValue: 30 }`.
- The description matches `docs/operations/launch.md` line 88: `optional; integer 1–1440; soft-lock TTL in minutes; default 30`.
- `apps/api/.env` contains `DOCS_LOCK_TTL_MINUTES=30` (under a `# Milestone 5 Documents wiki contract (optional; default 30).` comment).
- Value 30 is within the 1–1440 validated range.

### AC2: Value in range; env-parsing tests pass; full API suite green

**PASS**

- Value 30 is within the documented and validated range of 1–1440.
- `environment.test.ts` already contains 7 comprehensive `DOCS_LOCK_TTL_MINUTES` tests (absent → default 30,
  valid integer, boundary min=1, boundary max=1440, above-max error, below-min error, non-integer error).
- `src/config/environment.test.ts`: **17/17 tests passed**.
- Full `@sfus/api` suite: **1295 passed, 30 skipped** (integration tests skipped as expected).

```
Test Files  34 passed | 3 skipped (37)
Tests       1295 passed | 30 skipped (1325)
```

### AC3: Only expected files changed vs ms5

**PASS**

`git diff --stat ms5...HEAD` shows:
```
apps/api/.env                                      |  3 ++
apps/api/.env.example                              |  6 +++
artifacts/ms5-documents-wiki/dev-env-config/implementer_report.md
artifacts/ms5-documents-wiki/dev-env-config/implementer_result.json
artifacts/ms5-documents-wiki/dev-env-config/tester_prompt.txt
```

Only `apps/api/.env` and `apps/api/.env.example` are non-artifact changes. No code or other config was modified.

## Optional Test Addition

The implementer noted an absence of a test asserting `.env.example` completeness vs the environment schema.
Assessment: such a test would require reading and parsing `.env.example` at test time and comparing keys to
the `environment.ts` schema — moderately complex and somewhat brittle (comment lines, ordering, optional vs
required keys). Given that the existing `environment.test.ts` provides strong coverage of the
`DOCS_LOCK_TTL_MINUTES` parsing behavior, and no other gap exists for this change, this optional test was
**not added**. Recommendation forwarded to the Documenter for noting in the docs or deferred-tasks register.

## No Test Changes

The existing `environment.test.ts` already fully covers AC2. No new tests were added.

## Summary

| AC  | Result | Evidence |
|-----|--------|----------|
| AC1 | PASS   | .env.example block confirmed; .env entry confirmed; matches environment.ts and launch.md |
| AC2 | PASS   | 17/17 env tests pass; 1295/1295 API unit tests pass |
| AC3 | PASS   | Diff is strictly apps/api/.env + apps/api/.env.example + artifacts |
