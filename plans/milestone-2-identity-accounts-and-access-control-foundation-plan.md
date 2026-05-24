# Milestone 2 Identity Accounts And Access Control Foundation Plan

## Planner Activation
- Requested agent: `planner`
- Repository instruction source: `AGENTS.md` plus `.myteam` role/skill content loaded through `myteam`
- Workflow obligations being followed:
  - Stay in planning mode only and do not write implementation code.
  - Resolve material design decisions before decomposition.
  - Decompose the milestone into ordered, implementation-ready subtasks with dependencies.
  - Define observable acceptance criteria and documentation impact.
  - Include implementer prompts for each subtask.
  - Write the final plan to a unique markdown file under `plans/`.

## Overview
Milestone 2 adds the first authenticated product slice on top of the shipped Milestone 1 shell. The milestone introduces local and external authentication, first-login username selection, session management, email verification, profile and account settings basics, TOTP MFA with recovery codes, global roles, and a reusable ACL foundation that later milestones can apply to blog, forums, documents, downloads, characters, projects, search, and feed events.

The milestone ends when a user can create or sign into an account through local auth, Google, or GitHub; complete first-login onboarding; manage a basic profile; enable MFA with recovery codes; navigate an authenticated shell with protected routes; and when the backend exposes reusable authorization utilities that enforce global-role and ACL checks for ownership, visibility, and project-scoped access decisions.

Confirmed repository context:
- Milestone 1 foundation is already implemented in `apps/web` and `apps/api`.
- `apps/api` currently contains infrastructure-only modules for config, database, health, logging, and middleware.
- `apps/web` currently contains a public-only shell with no auth UI or protected routes.
- The repo already uses Next.js App Router, NestJS, TypeORM, MySQL 5.7.44 compatibility constraints, and the shared `/api` path contract.
- `plans/` is the default plan artifact directory and `docs/deferred-tasks.md` is now part of the planning context for future deferments.

Locked Milestone 2 decisions:
- External auth providers in scope now: Google and GitHub.
- MFA scope in Milestone 2: TOTP plus recovery codes.
- Username changes are out of scope after first selection and are recorded as deferred work.

## Assumptions And Locked Decisions
Confirmed from the design doc:
- Preferred external auth uses OpenID Connect or OAuth 2.0 providers.
- Local auth uses email and password with Argon2id hashing and required email verification.
- Username is globally unique and chosen during first login.
- Secure session cookies, optional MFA, global roles, and ACL fields based on `visibility`, `owner_id`, and optional `project_id` are part of the baseline design.
- ACL behavior must be reusable across future content systems and must govern both direct access and future discoverability decisions.

Locked planning decisions for Milestone 2:
1. Auth stack remains within the current Next.js, NestJS, TypeORM, and MySQL 5.7.44 architecture.
2. External provider support in this milestone is limited to Google and GitHub, but the provider integration must be registry-driven and additive.
3. Local auth includes registration, login, logout, password hashing, and email verification.
4. MFA includes TOTP enrollment, challenge verification, recovery-code generation, storage, consumption, and regeneration flows.
5. Session management uses secure server-managed sessions compatible with the current reverse-proxy deployment model.
6. First-login onboarding must handle username creation for newly authenticated external users before they can use the full authenticated shell.
7. Username changes, redirect history, and mention continuity for renamed accounts are deferred and must not be partially implemented.
8. Global roles in this milestone are `member`, `moderator`, and `admin`; guest remains unauthenticated.
9. ACL utilities must support `public`, `unlisted`, `members`, `project-only`, and `private` visibility semantics even if not every visibility mode is exercised by Milestone 2 UI.
10. Milestone 2 remains focused on identity and authorization foundations only; it must not pull in blog, forums, documents, downloads, projects, search, notifications, or feeds except where reusable contracts are necessary.
11. Redis is still deferred, so session, verification, and MFA design must not require Redis to function in Milestone 2.
12. Browser E2E is still not required unless the implementation team decides it is necessary for confidence; the planning baseline remains API plus app-level automated tests.

Planning assumptions:
- Email delivery can be implemented with a provider abstraction and a local-development safe mode, but production-specific mail vendor choice does not need to be reopened in this plan.
- Profile basics for Milestone 2 mean username, display name, avatar URL or avatar placeholder handling, and bio; advanced social/follow settings remain later work.
- Because later domain resources do not exist yet, ACL validation in this milestone will be demonstrated through dedicated authorization utilities, profile ownership behavior, protected routes, and representative backend guard coverage rather than through full content-domain resources.

## Workstreams
1. Identity domain and persistence foundation.
2. Local authentication, verification, and session lifecycle.
3. External identity providers and first-login account linking/onboarding.
4. MFA and account-security controls.
5. Profile, account settings, and authenticated shell behavior.
6. Reusable authorization and ACL enforcement foundation.
7. Validation, deployment updates, and deferred-work documentation hygiene.

## Ordered Implementation Steps
1. Add the identity and authorization data model foundation.
- Scope:
  - Extend the TypeORM schema and reviewed migrations for users, auth identities, password auth, sessions, verification tokens or equivalents, MFA secrets, recovery codes, and any supporting audit or auth-event tables required by the milestone.
  - Add backend module boundaries for auth, users, profiles, and authorization utilities without yet implementing every endpoint.
  - Add environment contracts for auth providers, session secrets, email verification, and MFA-related settings.
- Dependencies: existing Milestone 1 API and database foundation.
- Acceptance criteria:
  - Reviewed migrations define the identity tables and fields required for local auth, external auth, sessions, MFA, and recovery codes while staying MySQL 5.7.44 compatible.
  - Backend module structure clearly separates auth orchestration, user/profile persistence, and authorization utilities.
  - Required auth-related environment variables are validated and documented.
- Documentation Impact:
  - Update architecture and launch docs for new environment ownership, migration surfaces, and auth-related operational inputs.

2. Implement local auth, email verification, and secure session lifecycle.
- Scope:
  - Implement registration, login, logout, session issuance, session invalidation, and current-user retrieval.
  - Use Argon2id password hashing and require verified email before the account is considered fully active according to the chosen product flow.
  - Implement email verification token issuance and confirmation flow, plus the minimal email-delivery abstraction needed to support the feature.
- Dependencies: Step 1.
- Acceptance criteria:
  - A new user can register with email, password, and initial account details and receive a verification path.
  - Passwords are never stored in plaintext and are hashed with Argon2id.
  - Secure session cookies are issued, validated, and cleared correctly through the reverse-proxy-aware deployment model.
  - Unauthenticated and authenticated API states are distinguishable through a stable current-session or current-user contract.
- Documentation Impact:
  - Document local auth env vars, verification flow expectations, and session-cookie deployment requirements.

3. Implement external auth providers, account linking rules, and first-login username onboarding.
- Scope:
  - Add Google and GitHub auth flows through a provider-agnostic backend/provider registry.
  - Create linking and lookup rules so returning provider users resolve to existing accounts safely and first-time provider users are routed into username selection and account completion.
  - Implement the onboarding API and UI path that blocks full authenticated use until the username and required profile basics are complete.
- Dependencies: Steps 1-2.
- Acceptance criteria:
  - Google and GitHub sign-in work end to end in local and deployment-compatible configurations.
  - Provider-specific logic is isolated behind a registry or equivalent abstraction that can accept later providers without auth-core rewrites.
  - First-time external-auth users cannot bypass username selection before entering the normal authenticated shell.
  - Account-linking behavior is deterministic and does not create duplicate local accounts for the same linked identity.
- Documentation Impact:
  - Document provider configuration, callback expectations, onboarding flow, and the deferred-provider expansion in the appropriate docs.

4. Implement MFA with TOTP and recovery codes.
- Scope:
  - Add TOTP enrollment, verification, enable/disable flows, recovery-code generation, secure storage, single-use consumption, and regeneration.
  - Integrate MFA challenge requirements into the relevant authenticated login flows.
  - Add account-security UI surfaces in settings for MFA state and recovery-code lifecycle.
- Dependencies: Steps 1-3.
- Acceptance criteria:
  - A user can enroll a TOTP authenticator, confirm it, and subsequently satisfy MFA during supported login flows.
  - Recovery codes are generated, shown at the correct time, stored safely, invalidated on use, and regenerable.
  - Disabling or resetting MFA requires an authenticated and authorized flow.
  - MFA and recovery-code behavior is test-covered for both success and failure paths.
- Documentation Impact:
  - Document MFA enrollment behavior, recovery-code handling expectations, and any operational secrets or support considerations introduced by the feature.

5. Implement profile basics, account settings, protected routes, and authenticated shell behavior.
- Scope:
  - Add authenticated frontend routes and UI for sign-in, registration, first-login username completion, profile display, and account settings basics.
  - Update shared layout and navigation to reflect signed-in versus signed-out state and protect authenticated-only destinations.
  - Add API endpoints and backend handlers for current-user profile reads and basic profile/account updates within Milestone 2 scope.
- Dependencies: Steps 2-4.
- Acceptance criteria:
  - Signed-out users see the public shell, while signed-in users see authenticated navigation and can reach account/profile surfaces.
  - Protected routes redirect or block unauthenticated users consistently.
  - Username, display name, bio, and allowed profile basics can be viewed and edited within scope after onboarding.
  - The frontend preserves the existing Milestone 1 shell quality while adding authenticated state handling.
- Documentation Impact:
  - Update user-facing route inventory and launch docs for auth entry points, profile pages, and protected-route behavior.

6. Implement reusable global-role and ACL authorization utilities and apply them to Milestone 2 surfaces.
- Scope:
  - Add backend guards, decorators, services, or equivalent utilities for global role checks and ACL evaluation based on ownership, visibility, membership state, and optional project scope.
  - Apply these utilities to current-user, profile, account-settings, and representative protected API surfaces so the foundation is exercised in real use.
  - Define frontend shell behaviors for unauthorized versus unauthenticated access outcomes.
- Dependencies: Steps 1-5.
- Acceptance criteria:
  - Backend authorization utilities can evaluate global roles and ACL-style access decisions without being tied to one future content type.
  - Representative API routes use the reusable authorization layer rather than bespoke inline checks.
  - The authenticated shell distinguishes unauthenticated access from authenticated-but-unauthorized access in a consistent way.
  - The ACL contract is documented well enough for later milestones to reuse it without reinterpretation.
- Documentation Impact:
  - Update architecture docs with the reusable authorization model and its intended reuse boundaries.

7. Finalize validations, deployment updates, and deferred-work hygiene for the identity foundation.
- Scope:
  - Add or extend automated tests for auth, onboarding, MFA, sessions, and authorization checks across API and frontend surfaces.
  - Update deployment and operational docs for provider env vars, session cookies, callback URLs, email verification, and MFA support requirements.
  - Update `docs/deferred-tasks.md` for any Milestone 2 items intentionally left out after implementation.
- Dependencies: Steps 1-6.
- Acceptance criteria:
  - Automated validation covers local auth, external auth, onboarding, session lifecycle, MFA, recovery codes, and representative authorization failures.
  - Deployment docs describe the new public-domain callback, cookie, and email requirements accurately.
  - The deferred-work register reflects any intentional non-scope items that remain after the final milestone implementation decisions.
- Documentation Impact:
  - Update launch, architecture, and deferred-work docs to match the final shipped behavior.

## Acceptance Criteria
Milestone 2 is complete when all of the following are true:
- Users can register and sign in through local auth, Google, and GitHub.
- First-time external-auth users must complete username onboarding before reaching the normal authenticated shell.
- Email verification is functional for local accounts.
- Secure session cookies, logout, and authenticated current-user retrieval work end to end.
- Users can enable TOTP MFA, receive recovery codes, use a recovery code successfully, and regenerate codes through an authorized flow.
- Signed-in users can access profile and account settings basics, while signed-out users continue to see the public shell.
- Protected routes and representative API surfaces enforce reusable auth, role, and ACL checks.
- The backend exposes a reusable authorization foundation designed for later content systems rather than one-off checks.
- The deployment and docs set clearly define provider config, callback URLs, cookie behavior, verification flows, and deferred items.

## Documentation Impact
- Update `docs/README.md` to reflect the new authenticated application architecture, auth module boundaries, and authorization foundation.
- Update `docs/website-launch-guide.md` for provider env vars, callback URLs, session/cookie requirements, verification/MFA expectations, and any required operator steps.
- Keep `docs/deferred-tasks.md` current for intentionally postponed identity work such as additional providers and username changes.
- Add or update architecture-specific documentation if the implementation introduces a dedicated Milestone 2 decisions document.

## Dependency Ordering
- Must happen first:
  - Step 1
- Identity core path:
  - Step 2 depends on Step 1
  - Step 3 depends on Steps 1-2
  - Step 4 depends on Steps 1-3
- Authenticated product shell path:
  - Step 5 depends on Steps 2-4
- Authorization foundation path:
  - Step 6 depends on Steps 1-5
- Validation and documentation closeout:
  - Step 7 depends on Steps 1-6

Parallelization notes:
- After Step 1, some UI scaffolding for Step 5 can begin in parallel with Step 2 if the implementer keeps it behind mocked or provisional contracts, but the safe coordinator default is serial execution.
- Step 6 should stay after the primary auth/profile flows are real, because the authorization abstractions need actual authenticated surfaces to validate against.
- Step 7 should remain last.

## Risks And Mitigations
1. Provider-specific auth logic leaks into auth-core code and makes future providers expensive.
- Mitigation: require a provider registry or equivalent adapter boundary and keep mapping/linking logic isolated.
2. Session behavior breaks behind the reverse proxy due to cookie or trusted-proxy misconfiguration.
- Mitigation: document public-domain callback and cookie rules clearly, and test with deployment-compatible settings rather than localhost-only assumptions.
3. MFA increases account lockout and support complexity.
- Mitigation: ship recovery codes in the same milestone, test reset/disable flows, and document support expectations.
4. ACL utilities become too content-specific before later milestones exist.
- Mitigation: define the authorization contract around actor, owner, visibility, membership, and scope primitives rather than around blog/forum-specific resources.
5. Email verification introduces environment-specific fragility in local development or deployment.
- Mitigation: isolate delivery behind an abstraction, support safe local-development behavior, and document required production settings explicitly.
6. Username onboarding collides with future username-change requirements.
- Mitigation: treat user IDs as the durable internal identity key, treat usernames as mutable presentation identifiers in future design, and keep rename behavior fully deferred rather than partially implemented.

## Implementer Prompts

### Subtask 1: Identity schema and module foundation
```text
Your role is 'implementer'. Your task is as follows:
Implement the Milestone 2 identity and authorization persistence foundation in the existing stack. Add the reviewed TypeORM migrations, entities or persistence models, module boundaries, and environment validation needed for users, auth identities, password auth, sessions, verification state, TOTP MFA, recovery codes, and reusable authorization support.

Allowed files:
- `apps/api/**`
- `apps/api/.env.example`
- Root workspace/config files only if required by API integration
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/deferred-tasks.md`
- New architecture docs under `docs/architecture/**` if needed

Implementation-outcome acceptance criteria:
- The schema and reviewed migrations cover local auth, external auth identities, sessions, MFA, and recovery codes while remaining MySQL 5.7.44 compatible.
- Backend module structure separates auth orchestration, user/profile persistence, and reusable authorization concerns.
- Auth-related environment variables are validated explicitly at startup.

Validation guidance:
- Run the relevant API migration, typecheck, lint, and test commands.
- Add or update automated tests where schema/config behavior is directly exercised.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and any relevant frontend test files added later.

Artifact guidance:
- Use repository-root-relative artifacts only if the implementation workflow requires them; otherwise keep this subtask artifact-light.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 2: Local auth, verification, and session lifecycle
```text
Your role is 'implementer'. Your task is as follows:
Implement local account registration, login, logout, email verification, secure session lifecycle, and stable current-user or current-session APIs on top of the Milestone 2 identity foundation.

Allowed files:
- `apps/api/**`
- `apps/web/**` only where auth entry points or session-aware client behavior is required for integration
- App env example files
- `docs/README.md`
- `docs/website-launch-guide.md`

Implementation-outcome acceptance criteria:
- Users can register and log in with email and password, and passwords are hashed with Argon2id.
- Email verification is implemented and enforced according to the milestone flow.
- Secure session cookies are issued, validated, and cleared correctly.
- A stable authenticated-user API contract exists for the frontend to consume.

Validation guidance:
- Run API and relevant web tests, plus lint and typecheck for any touched workspace.
- Add focused automated tests for success and failure paths in registration, login, logout, and verification.

Tester guidance:
- Tester follow-up should inspect `apps/api/src/**/*.test.ts` and any auth-related frontend tests added under `apps/web`.

Artifact guidance:
- Keep artifact paths repository-root-relative if artifacts are produced.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 3: External auth and first-login onboarding
```text
Your role is 'implementer'. Your task is as follows:
Implement Google and GitHub authentication through a provider-agnostic integration layer, deterministic account-linking rules, and the first-login onboarding flow that requires username selection before a newly authenticated external user reaches the normal signed-in shell.

Allowed files:
- `apps/api/**`
- `apps/web/**`
- App env example files
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/deferred-tasks.md`

Implementation-outcome acceptance criteria:
- Google and GitHub sign-in work end to end.
- Provider-specific code is isolated behind an adapter or registry boundary that is ready for additive future providers.
- First-login external users must complete username onboarding before normal authenticated use.
- Account linking avoids duplicate-account creation for the same external identity.

Validation guidance:
- Run API and web lint, typecheck, and test commands.
- Add automated coverage for provider callback handling, onboarding gating, and account-linking rules.

Tester guidance:
- Tester follow-up should focus on API auth tests and any onboarding or navigation tests under `apps/web`.

Artifact guidance:
- Keep any implementation artifacts repository-root-relative.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 4: MFA with recovery codes
```text
Your role is 'implementer'. Your task is as follows:
Implement Milestone 2 MFA as a complete TOTP plus recovery-code feature: enrollment, verification, login challenge integration, secure recovery-code generation and storage, single-use consumption, regeneration, and authorized disable or reset flows.

Allowed files:
- `apps/api/**`
- `apps/web/**`
- App env example files
- `docs/README.md`
- `docs/website-launch-guide.md`

Implementation-outcome acceptance criteria:
- Users can enable and verify TOTP MFA successfully.
- Recovery codes are generated, stored safely, shown at the correct time, consumed once, and regenerable.
- MFA challenge behavior is integrated into the supported login flows.
- Disable or reset behavior is authenticated and authorized.

Validation guidance:
- Run API and web lint, typecheck, and test commands.
- Add automated coverage for MFA enrollment, challenge success/failure, recovery-code use, and regeneration.

Tester guidance:
- Tester follow-up should inspect both API security-flow tests and any web settings/auth tests covering MFA UX.

Artifact guidance:
- Keep any artifacts repository-root-relative.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 5: Authenticated shell, profile basics, and protected routes
```text
Your role is 'implementer'. Your task is as follows:
Implement the frontend and supporting API surfaces for sign-in, registration, first-login username completion, profile basics, account settings basics, authenticated navigation state, and protected-route behavior within the existing Milestone 1 shell.

Allowed files:
- `apps/web/**`
- `apps/api/**`
- App env example files
- `docs/README.md`
- `docs/website-launch-guide.md`

Implementation-outcome acceptance criteria:
- Signed-out users continue to see the public shell, while signed-in users see authenticated navigation and can access profile and settings surfaces.
- Protected routes redirect or block unauthenticated access consistently.
- In-scope profile basics can be read and updated through real API contracts.
- The existing shell quality and responsive behavior are preserved.

Validation guidance:
- Run the relevant web and API lint, typecheck, and test commands.
- Add automated coverage for protected-route gating and profile/settings flows.

Tester guidance:
- Tester follow-up should focus on frontend route behavior and the profile/settings API contracts exercised by the web app.

Artifact guidance:
- Keep any artifacts repository-root-relative.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 6: Reusable authorization foundation and milestone validations
```text
Your role is 'implementer'. Your task is as follows:
Implement the reusable global-role and ACL authorization foundation, apply it to representative Milestone 2 surfaces, and finish the milestone's validation and documentation updates so later content milestones can build on a stable authz contract.

Allowed files:
- `apps/api/**`
- `apps/web/**` where unauthorized-state handling or shell behavior must change
- Test files under `apps/api/**` and `apps/web/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/deferred-tasks.md`
- New architecture docs under `docs/architecture/**` if needed

Implementation-outcome acceptance criteria:
- Reusable backend authorization utilities cover global-role and ACL-style access decisions without being tied to one content type.
- Representative Milestone 2 routes and UI states use the shared authorization layer rather than bespoke checks.
- Automated validation covers authorization failures and major auth-path regressions.
- Documentation and the deferred-work register match the final implemented scope.

Validation guidance:
- Run all relevant workspace lint, typecheck, and test commands for touched areas.
- Run any milestone-level validation flow that exists for the repo after the auth foundation lands.

Tester guidance:
- Tester follow-up should inspect both API and web tests that exercise authorization behavior, protected routes, and auth regressions.

Artifact guidance:
- Keep artifacts repository-root-relative.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

## Output Artifact Path
- Written plan path: `/home/tstephen/repos/sfus/plans/milestone-2-identity-accounts-and-access-control-foundation-plan.md`
