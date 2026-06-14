# Implementer Report

Status:
- PASS

Task summary:
- Implement Documents soft-lock system for ST-6 of Milestone 5 (Documents Wiki): POST /api/docs/:id/lock (acquire/refresh with TTL), DELETE /api/docs/:id/lock (release by holder or staff override), lock check wired into all write paths (addRevision, renamePage, softDeletePage, rollbackPage), DOCS_LOCK_TTL_MINUTES env var (range 1-1440, default 30), and lock state surfaced on page read responses.

Changed files:
- apps/api/src/docs/docs.service.ts
- apps/api/src/docs/docs.controller.ts
- apps/api/src/docs/docs.types.ts
- apps/api/src/config/environment.ts
- apps/api/src/docs/docs.module.ts
- apps/api/src/docs/docs-module.test.ts
- apps/api/src/docs/docs.controller.test.ts
- apps/api/src/docs/docs.service.test.ts
- apps/api/src/docs/docs.service.integration.test.ts
- apps/api/src/auth/auth.controller.test.ts
- apps/api/src/auth/auth.service.test.ts
- apps/api/src/database/database.config.test.ts
- apps/api/src/health/readiness.service.test.ts
- apps/api/src/media/media.service.test.ts

Validation commands run:
- pnpm --filter @sfus/api run lint
- pnpm --filter @sfus/api run typecheck
- pnpm --filter @sfus/api run test
- pnpm --filter @sfus/api run build

Validation outcome:
- PASS — lint clean, typecheck clean, 1225/1225 unit tests pass (26 integration tests skipped, DB not available), build clean. Pre-existing TS2339 never-narrowing bug at docs.service.test.ts:2096 fixed as part of this commit.

Implementation/code commit hash:
- 02e1484

Artifacts written:
- artifacts/ms5-documents-wiki/ST-6/implementer_report.md
- artifacts/ms5-documents-wiki/ST-6/tester_prompt.txt
- artifacts/ms5-documents-wiki/ST-6/implementer_result.json

Implementation context:
- New endpoints: POST /api/docs/:id/lock (acquireLock -> 200 { pageId, lock }) and DELETE /api/docs/:id/lock (releaseLock -> 204)
- New service methods: acquireLock(actorUserId, actorGlobalRole, pageId), releaseLock(actorUserId, actorGlobalRole, pageId), assertNotForeignLocked(page, actorUserId?, actorGlobalRole?)
- Lock entity fields used: isLocked (tinyint), lockedByUserId, lockedAt, lockExpiresAt datetime on DocsPageEntity
- TTL: lockExpiresAt = now + (lockTtlMinutes * 60 * 1000); sourced from DOCS_CONFIG injection token (DocsConfig.lockTtlMinutes)
- Staff bypass: AuthorizationService.hasGlobalRole(actorGlobalRole, moderator) returns true for admin and moderator roles; bypasses all foreign lock checks
- Oracle P12: lockExpiresAt <= now means lock is expired and treated as free; write proceeds normally
- Signature changes (all backward-compatible with optional appended params): addRevision(actorUserId, pageId, input, actorGlobalRole?), renamePage(pageId, input, actorUserId?, actorGlobalRole?), softDeletePage(pageId, actorUserId?, actorGlobalRole?), rollbackPage(actorUserId, pageId, input, actorGlobalRole?)
- DocsPageShape.lock: { isLocked: boolean, lockedByUserId: string|null, lockedAt: Date|null, lockExpiresAt: Date|null } computed in toPageShape()
- DOCS_CONFIG injection token defined in docs.types.ts; provider registered in docs.module.ts using environment.docs.lockTtlMinutes
- DOCS_LOCK_TTL_MINUTES: optional env var added to environment.ts with parseOptionalInteger helper; range 1-1440; default 30; errors collected not thrown immediately

Expected validation failures carried forward:
- None
