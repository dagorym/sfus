# Milestone 2 Auth Follow-up Fixes Plan

## Planner Activation
- Requested agent: `planner`
- Repository instruction source: `AGENTS.md` plus `.myteam` role/skill content loaded through `myteam`
- Loaded planner skills:
  - `planner/preflight`
  - `repository-inference`
  - `planner/decomposition`
  - `planner/acceptance-and-doc-impact`
  - `planner/dependency-ordering`
  - `planner/implementer-prompts`
  - `handoff-prompt-contract`
  - `planner/plan-validation`
  - `artifact-paths`
  - `planner/artifact-writing`

## Overview
This follow-up plan covers three post-implementation corrections for the Milestone 2 auth foundation:
- restore reliable local registration in local development and make failures diagnosable
- change the first-visit auth entry experience so the `/register` page promotes Google and GitHub before local account creation
- update the public landing-page copy so it reflects Milestone 2 instead of Milestone 1

External-provider credential setup is intentionally excluded from the code-fix subtasks and is handled by the companion document `plans/oauth-provider-setup-instructions.md`.

## Confirmed Repository Context
- The current local registration UI lives in `apps/web/app/register/page.tsx` and posts to `POST /api/auth/register`, then auto-verifies the development token with `POST /api/auth/verify-email`, then attempts `POST /api/auth/login`.
- The current login UI lives in `apps/web/app/login/login-client.tsx` and already renders Google and GitHub entry links that target `/api/auth/external/:provider/start`.
- The current public landing page in `apps/web/app/page.tsx` still contains Milestone 1 copy.
- The API auth contract in `apps/api/src/auth/auth.controller.ts` and `apps/api/src/auth/auth.service.ts` supports local registration plus Google/GitHub start and callback flows.
- The API environment contract in `apps/api/.env.example` already expects real Google and GitHub client credentials and callback URLs.
- The current launch guide in `docs/website-launch-guide.md` documents the auth endpoints, explicit migration step, and required external-provider environment variables.
- Existing automated coverage already exercises auth controller/service logic in `apps/api/src/auth/*.test.ts` and source-contract assertions in `apps/web/app/public-shell.spec.ts`.

## Facts And Assumptions
Confirmed facts:
- OAuth provider actions are currently shown on `/login` but not on `/register`.
- The shipped registration page collapses all non-OK responses into a generic `Registration failed.` message, which hides actionable API failures from manual testing.
- External auth requires non-placeholder provider credentials and matching callback URLs in `apps/api/.env`.

Assumptions:
- Item 1 is treated as a real defect in the shipped local-registration path, but the exact root cause has not yet been isolated from repository evidence alone.
- The safest fix for item 1 includes both repairing the failing path and surfacing API-side error detail or prerequisite failures clearly enough for future manual testing.
- Item 2 is satisfied by making `/register` the first-time account-creation page that prioritizes external providers while keeping local registration available as an explicit fallback on the same page.

## Scope Boundaries
- In scope:
  - local registration flow reliability and error visibility
  - auth entry-page information architecture and copy on `/register` and any directly related login affordances
  - homepage Milestone 2 copy refresh
  - documentation updates required by the fixed behavior
- Out of scope:
  - changing external-provider backend protocol behavior beyond what is needed for entry-page UX consistency
  - adding mock OAuth providers or bypass modes
  - expanding profile, MFA, ACL, or session features beyond what the above fixes require
  - implementing provider credential setup in product code

## Ordered Implementation Subtasks

### Subtask 1: Registration reliability and diagnostics
- Identifier: `auth-followup-1`
- Security review required: `yes`
- Scope:
  - Reproduce and isolate why local registration fails in the shipped local environment.
  - Fix the broken path across the web/API boundary, whether the defect is in frontend request handling, backend validation behavior, launch prerequisites, or immediate post-registration follow-up steps.
  - Preserve the intended development-only auto-verification flow when the API returns a verification token.
  - Replace the generic registration failure handling with user-visible, safe error messages that expose actionable validation or prerequisite failures without leaking secrets.
  - Surface the actual username and password constraints on the registration page so users can see the relevant format, length, and character requirements before submitting.
  - Add or extend automated coverage for the identified failure mode and the improved error-path contract.
- Likely files:
  - `apps/web/app/register/page.tsx`
  - `apps/api/src/auth/auth.controller.ts`
  - `apps/api/src/auth/auth.service.ts`
  - `apps/api/src/auth/*.test.ts`
  - `apps/web/app/public-shell.spec.ts`
  - `docs/website-launch-guide.md`
- Acceptance criteria:
  - A correctly configured local environment can complete local registration successfully through the shipped `/register` page.
  - The development auto-verification path still works when the API includes a verification token.
  - Registration failures now return actionable UI feedback for validation, duplicate-account, or missing-prerequisite cases instead of one generic message.
  - Automated coverage exercises the repaired failure mode and the updated failure-reporting contract.
  - Auth flow changes do not weaken existing session, verification, or password-handling guarantees.
- Documentation Impact:
  - Update `docs/website-launch-guide.md` if the root cause or repaired flow changes the documented local prerequisites, troubleshooting order, or registration behavior.

### Subtask 2: Register-page provider-first auth entry flow
- Identifier: `auth-followup-2`
- Security review required: `no`
- Scope:
  - Move or duplicate the Google/GitHub account-creation entry points onto `/register`.
  - Make the register page clearly recommend provider-based sign-up first, while keeping local email/password registration as a fallback on the same page.
  - Keep login-page behavior coherent so returning users can still sign in locally or through providers without conflicting copy or navigation.
  - Reuse or centralize provider-entry rendering if that is the smallest practical way to keep `/login` and `/register` consistent.
  - Extend source-contract or UI-level tests for the new register-page provider placement and fallback messaging.
- Likely files:
  - `apps/web/app/register/page.tsx`
  - `apps/web/app/login/login-client.tsx`
  - `apps/web/app/auth-shell.module.css`
  - `apps/web/app/public-shell.spec.ts`
  - `docs/website-launch-guide.md`
- Acceptance criteria:
  - `/register` visibly presents Google and GitHub sign-up options before the local registration form.
  - The local registration form remains available as an explicit fallback on `/register`.
  - `/login` continues to support returning-user sign-in without contradictory first-visit guidance.
  - Automated coverage asserts the provider-first register-page contract.
- Documentation Impact:
  - Update `docs/website-launch-guide.md` if the user-facing auth entry flow description changes materially.

### Subtask 3: Milestone 2 homepage copy refresh
- Identifier: `auth-followup-3`
- Security review required: `no`
- Scope:
  - Update the public landing-page milestone language and any directly related highlight text so the homepage describes the shipped Milestone 2 auth-enabled state instead of Milestone 1 foundation-only messaging.
  - Update source-contract coverage that asserts homepage copy.
- Likely files:
  - `apps/web/app/page.tsx`
  - `apps/web/app/public-shell.spec.ts`
- Acceptance criteria:
  - The homepage no longer describes itself as Milestone 1.
  - The visible copy accurately reflects the current Milestone 2 identity and authenticated-shell baseline without promising later-milestone features.
  - Automated coverage is updated to assert the new milestone wording.
- Documentation Impact:
  - No dedicated docs update is required unless implementation also changes other public-facing launch descriptions.

## Overall Acceptance Criteria
- Local registration succeeds in a correctly configured local environment through the shipped `/register` page.
- The `/register` page explicitly communicates the enforced username and password rules.
- Local registration failures are diagnosable from the UI and supported by automated coverage.
- `/register` becomes the provider-first first-visit auth entry page, with local registration preserved as a fallback.
- The public homepage accurately describes the Milestone 2 state.
- The companion provider-setup document remains the source for item 3 operational setup and is not conflated with the product-fix subtasks.

## Documentation Impact
- Update `docs/website-launch-guide.md` for any changed local registration behavior, troubleshooting guidance, or auth-entry UX descriptions.
- Do not treat provider credential provisioning as part of the product-fix scope; keep that operational guidance in the separate document `plans/oauth-provider-setup-instructions.md`.
- No `docs/deferred-tasks.md` update is expected unless implementation intentionally defers part of the registration-fix scope after root-cause analysis.

## Output Artifact Path
- Plan artifact: `plans/auth-follow-up-fixes-plan.md`
- Companion setup document: `plans/oauth-provider-setup-instructions.md`

## Dependency Ordering
- `auth-followup-1` should run first because it addresses the actively broken local registration path and may change `/register` behavior or copy.
- `auth-followup-2` should run after `auth-followup-1` because both subtasks touch `apps/web/app/register/page.tsx` and overlapping auth-entry messaging.
- `auth-followup-3` is operationally independent and can run in parallel with either auth subtask, but serial execution remains acceptable if the coordinator prefers one implementer lane.

## Risks And Mitigations
1. The registration defect may be environment-specific rather than pure code logic.
- Mitigation: require root-cause isolation, not just UI reshuffling, and update launch/troubleshooting docs if environment prerequisites were underspecified.
2. Improved registration errors could accidentally expose implementation detail or sensitive state.
- Mitigation: surface actionable validation and prerequisite messages only; keep secrets, token material, and internal stack traces out of user-visible responses.
3. Duplicating provider CTA logic across `/login` and `/register` could cause drift.
- Mitigation: centralize provider-entry data or rendering if that is the smallest maintainable change.
4. Homepage copy refresh could overstate milestone completeness.
- Mitigation: keep the copy scoped to identity, registration, sign-in, and authenticated-shell foundations already present in the repo.

## Implementer Prompts

### Subtask `auth-followup-1`
```text
Your role is 'implementer'. Your task is as follows:
Repair the shipped local-registration path and make registration failures diagnosable. Reproduce and isolate why `/register` currently fails in local manual testing, fix the broken path across the current web/API implementation, preserve the intended development-only auto-verification behavior when a verification token is returned, replace the generic registration error handling with safe but actionable user-visible feedback, and make the page explicitly state the enforced username and password constraints. This subtask is security-sensitive because it changes an auth entry flow.

Allowed files:
- `apps/web/app/register/page.tsx`
- `apps/api/src/auth/**`
- `apps/web/app/public-shell.spec.ts`
- `docs/website-launch-guide.md`
- App env example files only if the fix requires correcting documented auth prerequisites

Implementation-outcome acceptance criteria:
- A correctly configured local environment can complete local registration through the shipped `/register` page.
- The development auto-verification flow still works when the API returns a verification token.
- The registration page explicitly states the enforced username and password constraints that the backend validates.
- Registration failures now distinguish actionable classes such as invalid input, duplicate account, or missing prerequisite/setup failure rather than collapsing to one generic message.
- Automated coverage exercises the repaired failure mode and the updated error-path contract.
- Session, verification, and password-handling guarantees are not weakened by the fix.

Validation guidance:
- Run targeted API and web tests first, then the relevant workspace lint/typecheck/test commands.
- If the root cause depends on runtime prerequisites, verify against the documented local stack and explicit migration flow before closing the subtask.

Tester guidance:
- Tester-owned follow-up checks will likely live in `apps/api/src/auth/*.test.ts` and `apps/web/app/public-shell.spec.ts` or adjacent auth UI tests if new ones are added.

Artifact guidance:
- Keep artifacts repository-root-relative only if needed for debugging evidence; otherwise keep this subtask artifact-light.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask `auth-followup-2`
```text
Your role is 'implementer'. Your task is as follows:
Rework the first-visit auth entry experience so `/register` promotes external providers first and keeps local email/password registration as a fallback. Add Google and GitHub account-creation entry points to `/register`, make the page copy explicitly steer first-time visitors toward those providers first, and keep `/login` coherent for returning-user sign-in without contradictory messaging.

Allowed files:
- `apps/web/app/register/page.tsx`
- `apps/web/app/login/login-client.tsx`
- `apps/web/app/auth-shell.module.css`
- `apps/web/app/public-shell.spec.ts`
- `docs/website-launch-guide.md`

Implementation-outcome acceptance criteria:
- `/register` visibly presents Google and GitHub entry points before the local registration form.
- The local registration form remains available as an explicit fallback on the same page.
- `/login` still supports returning-user sign-in cleanly and does not contradict the provider-first register-page guidance.
- Automated coverage asserts the provider-first register-page contract.

Validation guidance:
- Run the relevant web lint, typecheck, and test commands, plus any focused source-contract tests covering auth pages.

Tester guidance:
- Tester-owned follow-up checks will likely live in `apps/web/app/public-shell.spec.ts` and any auth-page tests added alongside the implementation.

Artifact guidance:
- No special artifact directory is required unless the implementation introduces one for UI review evidence.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask `auth-followup-3`
```text
Your role is 'implementer'. Your task is as follows:
Refresh the public homepage copy so it accurately reflects Milestone 2 instead of Milestone 1. Update only the homepage language and directly related source-contract assertions needed to keep the public landing page aligned with the current identity and authenticated-shell baseline.

Allowed files:
- `apps/web/app/page.tsx`
- `apps/web/app/public-shell.spec.ts`

Implementation-outcome acceptance criteria:
- The homepage no longer refers to Milestone 1.
- The visible copy accurately reflects the current Milestone 2 auth-enabled foundation without promising later-milestone features.
- Automated coverage is updated to assert the new milestone wording.

Validation guidance:
- Run the relevant web test, lint, and typecheck commands for the homepage copy change.

Tester guidance:
- Tester-owned follow-up checks will likely stay in `apps/web/app/public-shell.spec.ts`.

Artifact guidance:
- No special artifacts are expected for this copy refresh.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```
