# Tester Report — ST8: Throttle Module

## Task
ST8 — Throttle module (storage seam, new-account tier, link-limit)

## Testing Scope

Validated the throttle module implementation against all four acceptance criteria
defined in the ST8 plan. New test files were created in
`apps/api/src/common/throttle/` following the colocated test convention.

## Acceptance Criteria and Coverage

### AC1 — Over-limit -> 429; under-limit passes; identity resolution; new-account tier
- **Status: PASS**
- `throttle.service.test.ts` covers:
  - Under-limit (count < maxHits): does not throw
  - At-limit (count == maxHits): does not throw (boundary)
  - Over-limit (count > maxHits): throws HttpException with status 429
  - 429 response envelope contains `error`, `message`, `statusCode`, and `retryAfter` fields
  - `retryAfter` clamped to minimum 1 second
  - Identity prefers `userId` over `request.ip` (confirmed by asserting key passed to `store.hit()`)
  - Falls back to `request.ip` when `userId` is null or undefined
  - Falls back to `"unknown"` when both are absent
  - Does NOT parse `X-Forwarded-For` directly (security: reads only `request.ip`)
  - New-account tier applies when `userId` truthy AND `userCreatedAt` within `newAccountWindowMs`
  - New-account tier NOT applied to guests (null userId) even when `userCreatedAt` is provided
  - New-account tier NOT applied when `userCreatedAt` is null
  - Established accounts (older than `newAccountWindowMs`) use regular `maxHits`

### AC2 — Link-count limiter: rejects over-max, accepts compliant; no double-counting
- **Status: PASS**
- `link-limit.test.ts` covers:
  - Zero links in plain prose returns 0
  - Single and multiple Markdown `[text](url)` links counted correctly
  - Single and multiple bare `http://`/`https://` URLs counted correctly
  - Markdown `[text](https://...)` counted exactly once — not double-counted as Markdown + bare URL
  - Mixed Markdown and bare URLs counted without duplication
  - Empty body returns 0
  - `exceedsLinkLimit`: at-limit returns false, one-over returns true, well-under returns false

### AC3 — Storage seam: only `store.hit()` called; swap requires no guard/route change
- **Status: PASS**
- `throttle-store.test.ts` and `throttle.service.test.ts` cover:
  - `ThrottleService` calls `store.hit()` exactly once per `checkRequest()` call
  - Key and `windowMs` passed correctly to `store.hit()`
  - A test-double `IThrottleStore` (non-InMemory) is injected and used without any guard or service code change — proves the storage seam is functional
  - `InMemoryThrottleStore` satisfies the `IThrottleStore` interface structurally
  - Fixed-window semantics: count increments within window, resets after expiry
  - Separate counters per key

### AC4 — Env vars validated; missing/invalid -> startup failure; cross-field check
- **Status: PASS**
- `throttle-env.test.ts` covers:
  - All five throttle env vars are required (`THROTTLE_WINDOW_MS`, `THROTTLE_MAX_HITS`,
    `THROTTLE_NEW_ACCOUNT_MAX_HITS`, `THROTTLE_NEW_ACCOUNT_WINDOW_MS`, `THROTTLE_MAX_LINKS_PER_POST`)
  - Range boundaries for each:
    - `THROTTLE_WINDOW_MS`: 1000–3600000
    - `THROTTLE_MAX_HITS`: 1–10000
    - `THROTTLE_NEW_ACCOUNT_MAX_HITS`: 1–10000
    - `THROTTLE_NEW_ACCOUNT_WINDOW_MS`: 60000–2592000000
    - `THROTTLE_MAX_LINKS_PER_POST`: 0–100
  - Non-integer values rejected
  - Cross-field check: `THROTTLE_NEW_ACCOUNT_MAX_HITS > THROTTLE_MAX_HITS` throws
  - `THROTTLE_NEW_ACCOUNT_MAX_HITS == THROTTLE_MAX_HITS` is allowed
  - Valid config is correctly parsed into `environment.throttle`

## Test Execution Results

### Baseline (main sfus repo, before test authoring)
- 431 tests passed, 2 DB-gated skips

### After test authoring (worktree)
- **498 tests passed, 2 DB-gated skips, 0 failures**
- New tests: 67 across 4 new test files
  - `link-limit.test.ts`: 20 tests
  - `throttle-env.test.ts`: 21 tests
  - `throttle.service.test.ts`: 18 tests
  - `throttle-store.test.ts`: 8 tests

## Commands Executed

```
pnpm install --frozen-lockfile --dir /home/tstephen/repos/worktrees/ms4-st8-tester-20260608
pnpm --dir /worktree --filter @sfus/api run test     # baseline: 431 pass
# [test authoring]
pnpm --dir /worktree --filter @sfus/api run test     # 498 pass
pnpm --dir /worktree --filter @sfus/api run typecheck  # clean
pnpm --dir /worktree --filter @sfus/api run lint       # clean
pnpm --dir /worktree --filter @sfus/api run build      # clean
```

## Test Files Added

- `apps/api/src/common/throttle/link-limit.test.ts`
- `apps/api/src/common/throttle/throttle-env.test.ts`
- `apps/api/src/common/throttle/throttle-store.test.ts`
- `apps/api/src/common/throttle/throttle.service.test.ts`

## Test Commit

- Hash: `6d51eb2`
- Branch: `ms4-st8-tester-20260608`

## Implementation Defects Found

None. All acceptance criteria pass.

## XFF / Security Note

Test `"does NOT read X-Forwarded-For directly"` in `throttle.service.test.ts` confirms that the
service uses only `request.ip` (Express-resolved under `trust proxy=1`) and does not reinstate
direct XFF header parsing that was previously identified as a security issue in ST7.
