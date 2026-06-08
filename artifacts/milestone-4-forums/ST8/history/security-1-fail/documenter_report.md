# Documenter Report — ST8 Throttle Module

## Status

Success

## Subtask

ST8 — Throttle module (storage seam, new-account tier, link-limit)

## Branch

`ms4-st8-documenter-20260608`

## Documentation Commit

`9dd6880050ae837ec986646ad281fdc3068b46f0`

## Documentation Changes

### `docs/development/api-conventions.md`

Added a new **Rate limiting and anti-spam** section documenting:

- **Identity resolution**: session `userId` preferred; falls back to trust-proxy-resolved `request.ip` for guests. The guard never reads `X-Forwarded-For` directly — Express resolves the IP via `trust proxy = 1`.
- **New-account tier**: when an authenticated user's account was created within `THROTTLE_NEW_ACCOUNT_WINDOW_MS`, the stricter `THROTTLE_NEW_ACCOUNT_MAX_HITS` limit applies instead of `THROTTLE_MAX_HITS`.
- **429 envelope shape**: `{ error: "TOO_MANY_REQUESTS", message: "...", statusCode: 429, retryAfter: N }` — `retryAfter` is in seconds (minimum 1).
- **`IThrottleStore` storage seam**: all throttle state accessed exclusively through `IThrottleStore.hit(key, windowMs)`. Default wired implementation is `InMemoryThrottleStore`. Redis swap requires only replacing the `THROTTLE_STORE` provider — no guard or route change.
- **Per-post link limit**: `countLinks()` and `exceedsLinkLimit()` from `link-limit.ts` count Markdown links and bare URLs without double-counting.
- Note that route enforcement lands in ST9; this subtask delivers the reusable mechanism only.

### `docs/operations/launch.md`

Added five required throttle env vars to the canonical `apps/api/.env` table:

| Variable | Constraint |
|---|---|
| `THROTTLE_WINDOW_MS` | required; integer 1000–3600000 |
| `THROTTLE_MAX_HITS` | required; integer 1–10000 |
| `THROTTLE_NEW_ACCOUNT_MAX_HITS` | required; integer 1–10000; must be ≤ `THROTTLE_MAX_HITS` |
| `THROTTLE_NEW_ACCOUNT_WINDOW_MS` | required; integer 60000–2592000000 |
| `THROTTLE_MAX_LINKS_PER_POST` | required; integer 0–100 |

## Scope Notes

- `docs/deferred-tasks.md` was not edited (D1 Redis-storage-swap is a planner register item).
- `docs/README.md` routing table was not changed; no new doc files were created and existing routing remains accurate.
- No implementation or test behavior was changed.

## Artifacts Written

- `artifacts/milestone-4-forums/ST8/documenter_report.md`
- `artifacts/milestone-4-forums/ST8/documenter_result.json`
- `artifacts/milestone-4-forums/ST8/verifier_prompt.txt`
