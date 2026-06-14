# Implementer Report — MS5 Dev-Env Config (DOCS_LOCK_TTL_MINUTES)

## Task

Add `DOCS_LOCK_TTL_MINUTES` to `apps/api/.env.example` and `apps/api/.env` to fix
config drift introduced by Milestone 5 ST-6, which wired the variable in
`apps/api/src/config/environment.ts` but never added it to either .env template.

## Allowed Files Modified

- `apps/api/.env.example`
- `apps/api/.env`

## Changes Made

### apps/api/.env.example

Added a new grouped block before the Database block, matching the style of the
existing Milestone 3 (Media) and Milestone 4 (Throttle) blocks:

```
# Documents wiki contract (Milestone 5, ST-6).
# DOCS_LOCK_TTL_MINUTES: optional; advisory soft-lock TTL in minutes for the Documents wiki;
#   integer 1–1440 (1 minute to 24 hours); default 30;
#   invalid or out-of-range values fall back to 30 with a collected startup error.
DOCS_LOCK_TTL_MINUTES=30
```

### apps/api/.env

Added a two-line entry after the Milestone 4 throttle block, matching the sparse
comment density used elsewhere in this file:

```
# Milestone 5 Documents wiki contract (optional; default 30).
DOCS_LOCK_TTL_MINUTES=30
```

## Validations Run

| Command | Outcome |
|---|---|
| `pnpm --filter ./apps/api run lint` | PASS (0 warnings, 0 errors) |
| `pnpm --filter ./apps/api run typecheck` | PASS (no errors) |
| `pnpm --filter ./apps/api exec vitest run src/config/environment.test.ts` | PASS (17/17 tests) |

No code was changed. The var is optional with default 30; its value 30 is within
the documented 1–1440 range (confirmed by reviewing `parseOptionalInteger` call in
`environment.ts` at range `{ min: 1, max: 1440, defaultValue: 30 }`).

## Implementation Commit

`2981331f4ca88aa137a2d0a728a4857ad8f924b6`

Branch: `ms5-devenv-implementer-20260612`
