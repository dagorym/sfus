Security Review Report

Scope reviewed:
- Specialist security review of ST4 (forums description varchar(512) migration + server-side input-length validation) of the forums-listing-enhancements-and-fixes plan, limited to git diff forums-listing...HEAD.
- Migration apps/api/src/database/migrations/1780893000000-forum-description-length.ts (new) and its registration in apps/api/src/database/database.config.ts.
- Validation in apps/api/src/forums/forums.service.ts (new assertFieldLengthValid helper; createCategory, updateCategory, createBoard, updateBoard) and constants in apps/api/src/forums/forums.types.ts (FORUM_DESCRIPTION_MAX_LENGTH=512, FORUM_NAME_MAX_LENGTH=128).
- Unit tests (forums.service.test.ts) and integration/migration tests (forums.service.integration.test.ts).
- Docs: docs/features/forums.md and docs/guides/content-management.md.
- Confirmed forums.controller.ts, forums.module.ts, and authorization/ are NOT modified by this diff.

Why specialist review was triggered:
- Plan decision P1: ST4 adds a schema-changing DB migration and server-side validation on untrusted, admin-supplied input.
- Risks evaluated: malformed/irreversible/data-losing migration; injectable migration DDL; bypassable validation letting over-length input reach the DB (500 or silent truncation); ReDoS/DoS in the length checks; and any weakening of admin gating on create/update endpoints.

Acceptance criteria / plan reference:
- plans/forums-listing-enhancements-and-fixes-plan.md (ST4) and the ST4 security acceptance criteria supplied in the review task.
- Acceptance criteria: migration safety (non-narrowing up, narrowing down acceptable/documented), validation as the real pre-persistence enforcement boundary, no injection/no DoS, admin gating unchanged, and 512/128 constant-migration-doc consistency.

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/database/migrations/1780893000000-forum-description-length.ts:28-33 - down() narrows forum_boards.description and forum_categories.description from varchar(512) back to varchar(255). This is an inherent, expected property of a reversible widening migration, but the truncation risk on rollback is not documented in the migration header comment, the implementer report, or the operational docs.
  Because ST4 validation permits descriptions up to 512 chars, legitimately-stored values of 256-512 chars can exist after up(). Running down() on a DB holding such values would either error (MySQL 5.7 default STRICT_TRANS_TABLES) or, in a non-strict deployment, silently truncate to 255 chars and lose data. This is a developer/operator-only rollback path not reachable by untrusted input, so it does not block forward rollout; recommend the Documenter/Verifier add a one-line rollback caveat. No code change required to pass.
- apps/api/src/forums/entities/forum-category.entity.ts, apps/api/src/forums/entities/forum-board.entity.ts:15, 42 - The TypeORM @Column decorators for description still declare length: 255 while the migration and DB column are now varchar(512). This is cosmetic only: database.config.ts sets synchronize: false and migrationsRun: false, so entity metadata never drives runtime schema or value truncation; MySQL enforces the actual 512 column width.
  No runtime or security impact (no ORM-side truncation, no 500). Noted only for maintainability so the entity metadata is not mistaken for the source of truth; a future schema-diff tool could report drift. Not blocking.

Test sufficiency assessment:
- Sufficient for the security-sensitive behavior. forums.service.test.ts adds 224 passing tests including, for all four methods (createCategory/updateCategory/createBoard/updateBoard): description boundaries at 255/256/512 accepted and 513 rejected with BadRequestException; name 128 accepted and 129 rejected; null/undefined description skipped.
- Critical pre-persistence assertions present: over-length cases assert saveSpy NOT called (expect(saveSpy).not.toHaveBeenCalled()), proving validation runs before any DB write and over-length input never reaches persistence (no 500, no silent truncation).
- Partial-update isolation covered: updating name alone does not validate an existing 512-char description, and updates validate only supplied fields.
- Integration tests assert real DDL outcomes via information_schema: up() yields varchar(512), down() yields varchar(255), and up-then-down round-trips back to 255 on both tables.
- Gap (non-blocking): integration tests run down() on a clean schema only and do not exercise the down() narrowing-truncation case against pre-existing >255 data; this matches the NOTE finding above. Focused suite, lint, and typecheck all pass.

Documentation / operational guidance assessment:
- Adequate for forward operation. docs/features/forums.md documents the 128/512 limits, the 400 error messages, partial-update behavior (omitted description not validated), and the exported constants enforced before any DB write. docs/guides/content-management.md documents max 128 / max 512 in the admin create flows. Constants (512/128), migration width (512), and docs are mutually consistent.
- One documentation gap (low/non-blocking): no rollback caveat noting that the migration down() narrows back to varchar(255) and could truncate or reject descriptions longer than 255 characters. Recommend adding a short operator note; not required to pass.

Artifacts written:
- artifacts/forums-listing-enhancements-and-fixes/ST4/security_report.md
- artifacts/forums-listing-enhancements-and-fixes/ST4/security_result.json

Outcome:
- PASS
