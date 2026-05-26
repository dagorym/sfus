## Documenter Report

### Files Updated
- **`docs/README.md`** — Clarified that MFA recovery codes are single-use and that regeneration replaces the previous recovery-code set.
- **`docs/website-launch-guide.md`** — Clarified that MFA challenge supports single-use recovery codes and that recovery-code regeneration invalidates prior codes.

### Summary
Validated implementer and tester outputs for Milestone 2 Subtask 4 and made targeted documentation-only clarifications so the recovery-code lifecycle wording matches tested behavior (single-use consumption plus set replacement on regeneration).

### Validation
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
- `cbeef8c055dd74768ea6e8b53a1aee6208119510` — `docs: clarify MFA recovery-code lifecycle`
