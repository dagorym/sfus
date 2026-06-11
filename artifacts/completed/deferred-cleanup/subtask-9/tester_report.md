# Tester Report — deferred-cleanup subtask-9

## Task

Behavior-preserving restructure of web auth error-mapping helpers. `toApiRequestError`,
`describeRegistrationError`, and login-side equivalents (`describeLoginError`,
`serviceUnavailableMessage`) were extracted from inline definitions in
`apps/web/app/register/page.tsx` and `apps/web/app/login/login-client.tsx` and exported
from `apps/web/app/auth-client.ts`.

## Acceptance Criteria Validated

1. **AC1 — 400 validation mapping**: `describeRegistrationError` returns the message from
   the error when `statusCode` is 400.
2. **AC2 — 409 duplicate-email messaging**: `describeRegistrationError` returns
   `duplicateAccountErrorMessage` when `statusCode` is 409.
3. **AC3 — 5xx masking**: `describeRegistrationError` returns `serviceUnavailableMessage`
   when `statusCode >= 500`; `describeLoginError` returns `serviceUnavailableMessage` when
   `status >= 500`.
4. **AC4 — null statusCode / network-failure branch**: `describeRegistrationError` returns
   `serviceUnavailableMessage` when `statusCode` is null.

Additional criteria verified:
- Helpers are exported and importable by specs; pages consume the exported versions (import
  contract confirmed in source-text contracts and by successful runtime imports in tests).
- Nothing blocks a spec from driving mocked 400/409/5xx/network-failure responses through
  the exported helpers.

## Test Files Added or Modified

- **New**: `apps/web/app/auth-error-helpers.spec.ts` — 13 executed runtime tests directly
  importing the helpers from `auth-client.ts` and driving them with mocked `Error` objects
  and `Response` instances.
- **Modified**: `apps/web/app/public-shell.spec.ts` — "includes registration flow source
  contracts" test updated to replace source-text greps for inline statusCode logic
  (which moved to auth-client.ts) with assertions that verify the import contract and
  check auth-client.ts for the canonical logic strings.

  Justification for update: the implementer's refactor intentionally moved inline logic out
  of register/page.tsx and login-client.tsx, so the old source-text greps checking those
  files for `statusCode === 409` etc. were expected regressions of the source-text contract,
  not failures of the behavior contract. The test was updated to check the correct file.

## Test Execution

Command: `npx --yes pnpm@10.0.0 --dir apps/web test`

### Before Changes (baseline)

- 1 test failing: `public web shell source contracts > includes registration flow source contracts`
- Error: `expected '...' to contain 'statusCode === 409'` — register/page.tsx no longer
  contains inline statusCode logic after the implementer refactor.

### After Changes (final)

| Test File | Tests | Passed | Failed |
|---|---|---|---|
| app/auth-error-helpers.spec.ts | 13 | 13 | 0 |
| app/public-shell.spec.ts | 6 | 6 | 0 |
| components/navigation.spec.ts | 13 | 13 | 0 |
| components/recent-posts-feed.spec.ts | 11 | 11 | 0 |
| next.config.spec.ts | 2 | 2 | 0 |
| app/pages/pages.spec.ts | 67 | 67 | 0 |
| components/authoring-components.spec.ts | 36 | 36 | 0 |
| app/blog/blog.spec.ts | 110 | 110 | 0 |
| **Total** | **258** | **258** | **0** |

All 258 tests pass. All 4 required acceptance criteria have executed runtime coverage.

## Test Commit

Commit hash: `96e737e`
Branch: `cleanup-subtask-9-tester-20260607`

## Implementation Defects

None found. All acceptance criteria are met.

## Cleanup

No temporary non-handoff byproducts remain in the worktree.
