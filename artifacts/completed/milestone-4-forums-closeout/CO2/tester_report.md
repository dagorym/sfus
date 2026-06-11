# Tester Report — CO2

## Task

Validate that `resolveAvatarSrc` in `apps/web/components/user-avatar.tsx` rejects
any `avatarSrc` not beginning with `/api/media/`, returning `null` for http://,
https://, //, javascript:, data:, empty/whitespace inputs; and passes through valid
gated paths unchanged.

## Status: PASS

All acceptance criteria met. All 415 tests pass.

## Acceptance Criteria

| # | Criterion | Result |
|---|-----------|--------|
| AC1 | `resolveAvatarSrc` returns null for any avatarSrc not beginning with `/api/media/` (http://, https://, //, javascript:, data:, empty/whitespace) | PASS |
| AC2 | A valid gated path (e.g. `/api/media/<uuid>`) is returned unchanged when `hasError` is false | PASS |
| AC3 | null is returned when `hasError` is true (existing behavior preserved) | PASS |
| AC4 | No change to initials derivation or any other UserAvatar rendering behavior for valid inputs | PASS |

## Test Changes

**File modified:** `apps/web/components/user-avatar.spec.ts`

Added 8 new test cases to the existing `resolveAvatarSrc` describe block:

- `returns null for an http:// URL (open-redirect / off-origin rejection)` — AC1
- `returns null for an https:// URL (off-origin rejection)` — AC1
- `returns null for a protocol-relative // URL` — AC1
- `returns null for a javascript: URI (script-injection rejection)` — AC1
- `returns null for a data: URI (inline-data injection rejection)` — AC1
- `returns null for a whitespace-only string` — AC1
- `returns null for a relative path that does not begin with /api/media/` — AC1
- `returns the gated /api/media/<uuid> path unchanged when hasError is false` — AC2 (explicit UUID variant)

Existing 16 tests retained without modification:
- 11 `deriveInitials` tests (AC4 coverage)
- 5 existing `resolveAvatarSrc` tests (AC2, AC3 baseline coverage)

Total: 24 tests in user-avatar.spec.ts

## Commands Executed

```
pnpm --filter web --dir /home/tstephen/repos/worktrees/ms4a-CO2-tester-20260608 test
# Result: 415 passed (12 test files)

pnpm --filter web --dir /home/tstephen/repos/worktrees/ms4a-CO2-tester-20260608 typecheck
# Result: clean (no errors)

pnpm --filter web --dir /home/tstephen/repos/worktrees/ms4a-CO2-tester-20260608 lint
# Result: 0 warnings
```

## Test Results Summary

- **Test files:** 12 passed, 0 failed
- **Tests:** 415 passed, 0 failed
- **Previous baseline:** 407 tests (per implementation context); observed 407 in unmodified sfus repo
- **New tests added:** 8

## Negative-Path Coverage Note

This is a security-sensitive change (prefix-gating of externally supplied avatar URLs).
All required negative-path cases are covered:
- http:// URL: covered
- https:// URL: covered
- Protocol-relative //: covered
- javascript: URI: covered
- data: URI: covered
- Whitespace-only string: covered
- Non-media relative path (/static/...): covered

## Test Commit

Hash: `f1b288e`
Branch: `ms4a-CO2-tester-20260608`

## Artifacts Written

- `artifacts/milestone-4-forums-closeout/CO2/tester_report.md`
- `artifacts/milestone-4-forums-closeout/CO2/tester_result.json`
- `artifacts/milestone-4-forums-closeout/CO2/documenter_prompt.txt`

## Cleanup

No temporary non-handoff byproducts were created. The worktree is clean except for
the committed test file and artifact files.
