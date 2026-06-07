## Documenter Report

### Files Updated
- **`docs/README.md`** — Corrected the frontend shell baseline so it matches the shipped `/login`, `/app`, and `/onboarding/username` route contract and the onboarding-required redirect gate.
- **`docs/website-launch-guide.md`** — Added external callback URL deployment guidance and documented the dedicated `/onboarding/username` page behavior alongside the existing auth flow notes.

### Summary
Updated the architecture and launch documentation to match the implemented and tester-validated Milestone 2 Subtask 3 behavior: Google and GitHub auth live behind the provider registry boundary, callback URLs must target the public `/api/auth/external/:provider/callback` routes, and the web shell now routes first-login external users through username onboarding before normal authenticated use.

### Validation
- Reused tester evidence: `npx --yes pnpm@10.0.0 install`
- Reused tester evidence: `npx --yes pnpm@10.0.0 --filter @sfus/api lint`
- Reused tester evidence: `npx --yes pnpm@10.0.0 --filter @sfus/api typecheck`
- Reused tester evidence: `npx --yes pnpm@10.0.0 --filter @sfus/api test`
- Reused tester evidence: `npx --yes pnpm@10.0.0 --filter @sfus/web lint`
- Reused tester evidence: `npx --yes pnpm@10.0.0 --filter @sfus/web typecheck`
- Reused tester evidence: `npx --yes pnpm@10.0.0 --filter @sfus/web test`
- Documenter rerun: `npx --yes pnpm@10.0.0 install`
- Documenter rerun: `npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/auth/auth.controller.test.ts src/auth/auth.service.test.ts`
- Documenter rerun: `npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/public-shell.spec.ts`

### Documentation Commit
- `acaeab588259569977eeab5ac19c669ad6c08af9` — `docs: clarify external auth onboarding`
