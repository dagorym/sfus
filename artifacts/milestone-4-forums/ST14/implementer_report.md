# Implementer Report

Status:
- success

Task summary:
- ST14 — username suggest endpoint + minimal public profile API. (a) GET /users/suggest?q= — session-gated (401), throttled (429), prefix-match on active users, caps at 10, returns only {username,displayName,avatarUrl}; never leaks email/role/status/id. (b) GET /users/:username — minimal public profile with exactly five fields {username,displayName,avatar,bio,joinDate}; uniform 404 for nonexistent and inactive users (no enumeration oracle, P12); avatar resolved to /api/media/<id> URL or null.

Changed files:
- apps/api/src/app.module.ts
- apps/api/src/users/users.controller.ts
- apps/api/src/users/users.module.ts
- apps/api/src/users/users.service.ts
- apps/api/src/users/users.types.ts

Validation commands run:
- pnpm --dir apps/api lint
- pnpm --dir apps/api typecheck
- pnpm --dir apps/api exec vitest run

Validation outcome:
- PASS — lint clean, typecheck clean, 795 tests pass (0 failures, 2 skipped integration)

Implementation/code commit hash:
- ea04474

Artifacts written:
- artifacts/milestone-4-forums/ST14/implementer_report.md
- artifacts/milestone-4-forums/ST14/tester_prompt.txt
- artifacts/milestone-4-forums/ST14/implementer_result.json

Implementation context:
- UsersController at apps/api/src/users/users.controller.ts — new file, two GET endpoints
- GET /users/suggest?q= — order: 400 guard (q must be string) -> 401 resolveSession -> throttle checkRequest -> DB
- GET /users/:username — 400 guard (non-empty string) -> findPublicProfile (returns null for nonexistent+inactive) -> uniform 404
- UsersService.suggestByPrefix uses TypeORM Like() with escapeLikePrefix() to prevent LIKE injection; take:10; where:{status:'active'}
- UsersService.findPublicProfile queries {username, status:'active'} — returns null for BOTH nonexistent and inactive users
- avatarUrl/avatar resolved as '/api/media/' + avatarMediaId, or null when avatarMediaId is null
- joinDate is user.createdAt.toISOString()
- UsersModule now has static form (for AuthModule backward compat) and UsersModule.register(env) dynamic form (for AppModule) that imports AuthModule.register(env) and ThrottleModule.register(env)
- app.module.ts changed from UsersModule to UsersModule.register(environment) — 1-line change
- Security review required per plan (username enumeration surface + public PII exposure)
- SUGGEST_RESULT_CAP = 10, ACTIVE_STATUS = 'active', MEDIA_URL_PREFIX = '/api/media/'
- Tester MUST verify: suggest 401 without session; suggest 429 over limit; suggest ONLY 3 allowlisted fields (assert email/globalRole/status absent); suggest prefix+active+cap; profile exactly 5 fields (no email/role/status/id); enumeration parity (nonexistent 404 message === inactive 404 message); avatar URL resolution; malformed q/username 400

Expected validation failures carried forward:
- None
