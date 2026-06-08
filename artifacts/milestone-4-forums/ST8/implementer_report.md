# Implementer Report

Status:
- success

Task summary:
- ST8 — Throttle module (storage seam, new-account tier, link-limit)

Changed files:
- apps/api/src/common/throttle/throttle.types.ts (new)
- apps/api/src/common/throttle/throttle-store.ts (new)
- apps/api/src/common/throttle/link-limit.ts (new)
- apps/api/src/common/throttle/throttle.service.ts (new)
- apps/api/src/common/throttle/throttle.guard.ts (new)
- apps/api/src/common/throttle/throttle.module.ts (new)
- apps/api/src/config/environment.ts (added throttle config section + 5 env vars)
- apps/api/src/app.module.ts (imports ThrottleModule.register(environment))
- apps/api/src/config/environment.test.ts (throttle field added to fixture + assertions)
- apps/api/src/auth/auth.controller.test.ts (throttle field added to existing fixture)
- apps/api/src/auth/auth.service.test.ts (throttle field added to existing fixture)
- apps/api/src/database/database.config.test.ts (throttle field added to existing fixture)
- apps/api/src/health/readiness.service.test.ts (throttle field added to existing fixture)
- apps/api/src/media/media.service.test.ts (throttle field added to existing fixture)

Validation commands run:
- pnpm --dir /home/tstephen/repos/worktrees/ms4-st8-implementer-20260608 lint
- pnpm --dir /home/tstephen/repos/worktrees/ms4-st8-implementer-20260608 typecheck
- pnpm --dir /home/tstephen/repos/worktrees/ms4-st8-implementer-20260608 test
- pnpm --dir /home/tstephen/repos/worktrees/ms4-st8-implementer-20260608 --filter api build

Validation outcome:
- All pass. 431 tests passed (2 skipped DB-integration gated by SFUS_DB_INTEGRATION=1). Lint clean. Typecheck clean. API tsc build clean.

Implementation/code commit hash:
- 732ea0f

Artifacts written:
- artifacts/milestone-4-forums/ST8/implementer_report.md
- artifacts/milestone-4-forums/ST8/tester_prompt.txt
- artifacts/milestone-4-forums/ST8/implementer_result.json

Implementation context:
- New module: apps/api/src/common/throttle/ (6 files). ThrottleService.checkRequest({routeLabel, request, userId?, userCreatedAt?}) is the enforcement entry point; throws HttpException(429) with {error, message, statusCode, retryAfter} when count > maxHits. ThrottleGuard wraps it as CanActivate + @ThrottleLabel decorator.
- InMemoryThrottleStore implements IThrottleStore with fixed-window semantics (not sliding). Storage is injected via THROTTLE_STORE token; swapping to Redis requires only a new provider with no guard/service change.
- Identity resolution: userId ?? request.ip ?? "unknown". request.ip is the Express-resolved IP under trust proxy=1 (never parse X-Forwarded-For directly).
- New-account tier: active when userId is set AND userCreatedAt is within newAccountWindowMs of now; uses newAccountMaxHits (enforced <= maxHits in environment validation).
- link-limit.ts exports countLinks(body) and exceedsLinkLimit(body, maxLinks). Counts Markdown [text](url) links + bare http/https:// URLs without double-counting.
- environment.ts: THROTTLE_WINDOW_MS (1000-3600000 ms), THROTTLE_MAX_HITS (1-10000), THROTTLE_NEW_ACCOUNT_MAX_HITS (1-10000; must be <= THROTTLE_MAX_HITS), THROTTLE_NEW_ACCOUNT_WINDOW_MS (60000-2592000000 ms), THROTTLE_MAX_LINKS_PER_POST (0-100). All required; startup failure on missing/invalid.
- app.module.ts: ThrottleModule.register(environment) added to AppModule imports.
- Existing test fixtures: 6 test files had throttle: {...} section added (type-correct maintenance — no new test logic).
- Security: identity never parsed from XFF directly; IThrottleStore seam proven swappable; 429 thrown before handler runs (fail-closed).

Expected validation failures carried forward:
- None
