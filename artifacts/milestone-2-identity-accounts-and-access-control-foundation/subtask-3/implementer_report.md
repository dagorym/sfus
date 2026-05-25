# Implementer Report

Status:
- completed

Task summary:
- Implemented provider-agnostic Google/GitHub authentication with deterministic account linking and first-login username onboarding gating.

Changed files:
- apps/api/.env.example
- apps/api/src/auth/auth.controller.test.ts
- apps/api/src/auth/auth.controller.ts
- apps/api/src/auth/auth.module.ts
- apps/api/src/auth/auth.service.test.ts
- apps/api/src/auth/auth.service.ts
- apps/api/src/auth/external-auth-provider.registry.ts
- apps/api/src/config/config.constants.ts
- apps/api/src/config/environment.test.ts
- apps/api/src/config/environment.ts
- apps/api/src/database/database.config.test.ts
- apps/api/src/health/readiness.service.test.ts
- apps/api/src/index.test.ts
- apps/web/app/app/page.tsx
- apps/web/app/auth-client.ts
- apps/web/app/auth-shell.module.css
- apps/web/app/login/page.tsx
- apps/web/app/onboarding/username/page.tsx
- apps/web/app/public-shell.spec.ts
- docs/README.md
- docs/website-launch-guide.md

Validation commands run:
- npx --yes pnpm@10.0.0 --filter @sfus/api lint
- npx --yes pnpm@10.0.0 --filter @sfus/api typecheck
- npx --yes pnpm@10.0.0 --filter @sfus/api test
- npx --yes pnpm@10.0.0 --filter @sfus/web lint
- npx --yes pnpm@10.0.0 --filter @sfus/web typecheck
- npx --yes pnpm@10.0.0 --filter @sfus/web test

Validation outcome:
- All API and web lint/typecheck/test commands passed after implementing provider callbacks, onboarding gating, and account-linking coverage.

Implementation/code commit hash:
- dbb855ed3fb056b1b77e14513ca9028ee4f57b75

Artifacts written:
- artifacts/milestone-2-identity-accounts-and-access-control-foundation/subtask-3/implementer_report.md
- artifacts/milestone-2-identity-accounts-and-access-control-foundation/subtask-3/tester_prompt.txt
- artifacts/milestone-2-identity-accounts-and-access-control-foundation/subtask-3/implementer_result.json

Implementation context:
- Added an external-auth provider registry with Google and GitHub adapters, moving provider-specific OAuth token/profile logic behind a provider-agnostic interface.
- Added /api/auth/external/:provider/start and /api/auth/external/:provider/callback plus signed callback-state validation and deterministic account-linking rules (provider+subject, then normalized email, else create pending onboarding user).
- Extended session user payloads with onboardingRequired and added /api/auth/onboarding/username to complete first-login username selection.
- Added focused API tests for callback handling, onboarding completion, and account-linking behavior.
- Added web login, authenticated shell, and onboarding routes where /app redirects onboarding-required users to /onboarding/username until username selection succeeds.
- Updated web auth/navigation source-contract tests and launch/docs environment guidance for external provider configuration.

Expected validation failures carried forward:
- None
