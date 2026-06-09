# Implementer Report

## Subtask: CO5 — Recent Topics Feed (Remediation Pass 2 of 2)

Status: SUCCESS

## Task Summary

Fix the NaN-limit defect in `GET /api/forums/recent`. When `?limit=abc` or `?limit=` (empty string) is sent, `parseInt(...)` returns `NaN`. The previous code used `query.limit ?? RECENT_TOPICS_DEFAULT_LIMIT`, which does not catch `NaN` (nullish coalescing only catches `null`/`undefined`). As a result, `Math.max(1, NaN)` and `Math.min(20, NaN)` both return `NaN`, and `queryBuilder.take(NaN)` threw a `TypeORMError`, returning HTTP 500 to anonymous callers. This violated AC4's "returns a stable list" contract.

## Fix Applied

**File:** `apps/api/src/forums/forums.service.ts`

Added an explicit `Number.isFinite` guard at the start of `listRecentTopics` that coerces any non-finite `query.limit` value to `RECENT_TOPICS_DEFAULT_LIMIT` (5) before the `Math.min`/`Math.max` clamp. The effective limit is always an integer in [1, 20].

```typescript
const rawLimit = query.limit;
const safeLimit = Number.isFinite(rawLimit) ? rawLimit! : ForumsService.RECENT_TOPICS_DEFAULT_LIMIT;
const limit = Math.min(
  ForumsService.RECENT_TOPICS_MAX_LIMIT,
  Math.max(1, safeLimit)
);
```

## Changed Files

- `apps/api/src/forums/forums.service.ts`

## Preserved Behavior

All previously-accepted CO5 behavior is unchanged:
- Ordering: `lastPostAt DESC NULLS LAST`, then `createdAt DESC`
- Visibility filtering via `isBoardPubliclyReadable` / `AuthorizationService.evaluate()`
- Oracle-safe early `return []` when no public boards exist
- Public-safe `RecentTopicShape` (no internal/PII fields)
- No authentication required

## Validation Commands and Results

| Command | Result |
|---|---|
| `pnpm --filter api exec tsc --noEmit` | PASS — no errors |
| `pnpm --filter api exec eslint src/forums/forums.service.ts src/forums/forums.controller.ts src/forums/forums.types.ts --max-warnings=0` | PASS — no warnings |
| `pnpm --filter api exec vitest run src/forums` | PASS — 256/256 tests |
| `pnpm --filter api exec vitest run` | PASS — 885 pass, 3 skipped (DB integration) |

## Implementation/Code Commit Hash

`b48e1bf`

## Artifacts Written

- `artifacts/milestone-4-forums-closeout/CO5/implementer_report.md`
- `artifacts/milestone-4-forums-closeout/CO5/implementer_result.json`
- `artifacts/milestone-4-forums-closeout/CO5/tester_prompt.txt`
