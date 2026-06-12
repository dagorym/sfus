# Implementer Report

Status:
- success

Task summary:
- Move Swagger UI mount from /api/docs to /api/swagger to fix route collision with Documents API index route.

Changed files:
- apps/api/src/index.ts

Validation commands run:
- pnpm --filter=api lint
- pnpm --filter=api typecheck
- pnpm --filter=api test
- pnpm --filter=api build

Validation outcome:
- lint: clean. typecheck: clean. test: 1295 passed, 30 skipped (suite ran against main workspace; one test in index.test.ts is expected to fail after merge per approved plan — see expected_validation_failures). build: clean.

Implementation/code commit hash:
- c32af68

Artifacts written:
- artifacts/ms5-documents-wiki/swagger-path-fix/implementer_report.md
- artifacts/ms5-documents-wiki/swagger-path-fix/tester_prompt.txt
- artifacts/ms5-documents-wiki/swagger-path-fix/implementer_result.json

Implementation context:
- Root cause: SwaggerModule.setup was mounted at 'api/docs' which collided with the MS5 Documents API GET /api/docs index route.
- Fix: Changed SwaggerModule.setup path from 'api/docs' to 'api/swagger' and jsonDocumentUrl from 'api/docs/openapi.json' to 'api/swagger/openapi.json' in apps/api/src/index.ts lines 87-89.
- Also updated the inline comment at line 58 which referenced '/api/docs' as the Swagger mount point.
- No other files were changed. The Documents API routes are untouched.
- The change is gated by environment.swaggerEnabled (true in dev, typically false in production).
- GET /api/docs/recent and other sub-paths were NOT affected by the collision — only the exact /api/docs index was shadowed by Swagger HTML.

Expected validation failures carried forward:
- apps/api/src/index.test.ts: test 'boots the API with the /api prefix and serves Swagger at /api/docs when enabled' (~line 158) — asserts SwaggerModule.setup was called with 'api/docs'. After this change it asserts the wrong (old) path. This is an APPROVED behavior change. The Tester must update the assertion to expect 'api/swagger' and 'api/swagger/openapi.json'.
