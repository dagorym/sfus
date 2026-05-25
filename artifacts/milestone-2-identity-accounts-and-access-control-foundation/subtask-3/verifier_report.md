Verifier Report

Scope reviewed:
- Reviewed the combined Milestone 2 Subtask 3 implementation, tester artifacts, and documentation updates against `ms2` from verifier branch `ms2-subtask-3-verifier-20260525`, plus the stage-to-stage diffs from `ms2-subtask-3-implementer-20260525` -> `ms2-subtask-3-tester-20260525` -> `HEAD`.
- Inspected `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/external-auth-provider.registry.ts`, `apps/web/app/login/page.tsx`, `apps/web/app/app/page.tsx`, `apps/web/app/onboarding/username/page.tsx`, `apps/web/app/public-shell.spec.ts`, `docs/README.md`, `docs/website-launch-guide.md`, and the tester/documenter result artifacts for acceptance-criteria, security, and documentation alignment.
- Independently reran `npx --yes pnpm@10.0.0 install`, `npx --yes pnpm@10.0.0 --filter @sfus/api lint`, `npx --yes pnpm@10.0.0 --filter @sfus/api typecheck`, `npx --yes pnpm@10.0.0 --filter @sfus/api test`, `npx --yes pnpm@10.0.0 --filter @sfus/web lint`, `npx --yes pnpm@10.0.0 --filter @sfus/web typecheck`, and `npx --yes pnpm@10.0.0 --filter @sfus/web test` successfully.
- Confirmed `artifacts/milestone-2-identity-accounts-and-access-control-foundation/subtask-3/documenter_result.json` preserves documentation commit hash `acaeab588259569977eeab5ac19c669ad6c08af9`; verifier artifacts are being added by amending the existing artifact commit so this branch remains exactly one artifact commit ahead of that documentation commit.

Acceptance criteria / plan reference:
- `plans/milestone-2-identity-accounts-and-access-control-foundation-plan.md` Step 3 and the verifier handoff acceptance criteria for provider-agnostic Google/GitHub auth, deterministic account linking, onboarding gating, and documentation accuracy.

Convention files considered:
- `AGENTS.md`
- `.myteam` verifier role plus the `execution-start`, `repository-inference`, `artifact-paths`, and `review-artifacts` shared skill instructions loaded via `myteam`
- `docs/README.md`
- `docs/website-launch-guide.md`

Findings

BLOCKING
- `apps/api/src/auth/auth.service.ts:241-247`, `apps/api/src/auth/auth.service.ts:546-605` - The external-auth callback state is only a self-signed blob; it is never stored, bound to the initiating browser, or consumed once. Any valid `state` minted for one browser can be replayed from another browser, so an attacker can complete Google/GitHub auth on their own device and then force a victim through the callback URL to log the victim into the attacker's account (login CSRF / session confusion). The generated `nonce` is decorative because nothing later verifies it.
- `apps/api/src/auth/external-auth-provider.registry.ts:191-203`, `apps/api/src/auth/auth.service.ts:507-532` - Account linking trusts normalized email matches even when the provider did not verify that email. The GitHub adapter explicitly falls back to `userProfile.email` when no verified email entry exists, but `resolveExternalIdentityUser()` still links by that unverified email, which can attach a new GitHub identity to an existing local account that merely shares the same address.

WARNING
- `apps/api/src/auth/auth.service.test.ts:444-531`, `apps/api/src/auth/auth.controller.test.ts:164-235`, `apps/web/app/public-shell.spec.ts:67-79` - The added tests prove the happy-path provider start/callback flow, onboarding gate, onboarding completion, and verified-email linking case, but they do not cover rejecting cross-browser/replayed OAuth state or refusing email-based linking when `identity.emailVerified` is false. The current green suite therefore misses both takeover vectors above.

NOTE
- None.

Test sufficiency assessment:
- Verifier reran workspace installation plus API lint/typecheck/test and web lint/typecheck/test successfully in the verifier worktree.
- Coverage is adequate for the documented route contract, registry boundary, and onboarding happy path, but it is not sufficient to validate the security-critical invariants for browser-bound callback state and safe email linking.

Documentation accuracy assessment:
- `docs/README.md:34-39`, `docs/README.md:46-53`, and `docs/README.md:103-104` accurately describe the shipped `/login`, `/app`, and `/onboarding/username` route inventory, the provider-registry boundary, deterministic linking intent, onboarding gate, and required Google/GitHub callback environment variables.
- `docs/website-launch-guide.md:48-68` and `docs/website-launch-guide.md:107-133` accurately document the required external-provider callback URLs, `/api/auth/external/:provider/start|callback` behavior, `POST /api/auth/onboarding/username`, and the redirect from `/app` into `/onboarding/username` for first-login external users.
- `artifacts/milestone-2-identity-accounts-and-access-control-foundation/subtask-3/documenter_result.json:1-25` correctly records documentation commit hash `acaeab588259569977eeab5ac19c669ad6c08af9` rather than the later artifact commit hash.

Artifacts written:
- `artifacts/milestone-2-identity-accounts-and-access-control-foundation/subtask-3/verifier_report.md`
- `artifacts/milestone-2-identity-accounts-and-access-control-foundation/subtask-3/verifier_result.json`

Verdict:
- FAIL
