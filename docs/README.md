# SFUS Milestone 1 Foundation Bootstrap

This repository now includes the Milestone 1 foundation baseline for the monorepo, runtime contracts, and CI/CD scaffolding.

## Workspace Layout

- `apps/web` - frontend workspace baseline
- `apps/api` - backend workspace baseline
- `packages/config` - shared TypeScript, ESLint, and Prettier configuration

## Shared Toolchain Baseline

- TypeScript strict mode is centralized via `packages/config/tsconfig.base.json`.
- ESLint config is centralized in `packages/config/eslint.base.cjs` and consumed by root, `apps/web`, and `apps/api`.
- Prettier config is centralized in `packages/config/prettier.base.cjs` and consumed by root, `apps/web`, and `apps/api`.
- Root and app-level command surfaces run the actual toolchain (`tsc`, `eslint`, `vitest`, and `prettier`) rather than placeholder scripts.

## Root Commands

- `pnpm build` - recursively runs each app workspace build command.
- `pnpm lint` - recursively runs each app workspace ESLint command.
- `pnpm typecheck` - recursively runs each app workspace TypeScript no-emit check.
- `pnpm test` - recursively runs each app workspace `vitest` command.
- `pnpm format` - formats root workspace files plus `apps/*` and `packages/*`.
- `pnpm format:check` - checks formatting for the same workspace surfaces without writing changes.

## App Workspace Commands

- `apps/web` and `apps/api` each expose `build`, `lint`, `typecheck`, `test`, `format`, and `format:check`.
- Each app inherits shared TypeScript, ESLint, and Prettier settings from `packages/config` while executing its own local source-file commands.

## Frontend Shell Baseline

- `apps/web` is a Next.js App Router frontend shell for the Milestone 1 public landing experience plus Milestone 2 identity/account flows.
- Styling stays within the Milestone 1 architecture baseline: CSS Modules for component/page styles plus shared global CSS custom-property tokens in `apps/web/app/globals.css`.
- Public-facing routes include the branded homepage (`/`), branded `404`, branded runtime error surface, sign-in (`/login`), and local registration (`/register`).
- The authenticated shell includes `/app`, `/profile`, `/settings`, and `/onboarding/username`; `/app` redirects unauthenticated users to `/login`, while `/profile` and `/settings` preserve destination intent with `/login?next=<route>`, and all authenticated routes redirect `user.onboardingRequired` sessions into username completion before normal authenticated use.
- Frontend health endpoints are available at `/health/live` and `/health/ready`.
- Frontend code targets the shared `/api` path contract. `NEXT_PUBLIC_API_BASE_PATH` defaults to `/api`, development rewrites forward to `WEB_API_ORIGIN` (`http://localhost:3001` by default), and non-development containerized routing can target `WEB_API_INTERNAL_URL`.

## API Identity And Authorization Foundation

- Milestone 2 Subtask 1 adds the first persistence-layer identity and authorization foundation to `apps/api` while keeping the current frontend shell public-only.
- Reviewed migration `1714435200000-identity-authorization-foundation.ts` introduces the `users`, `auth_identities`, `password_authenticators`, `auth_sessions`, `email_verifications`, `totp_secrets`, `totp_recovery_codes`, and `authorization_grants` tables with MySQL 5.7-compatible DDL.
- `UsersModule` owns user persistence through `UserEntity` and `UsersService`.
- `AuthModule` imports `UsersModule` and owns auth persistence through `AuthIdentityEntity`, `PasswordAuthenticatorEntity`, `AuthSessionEntity`, `EmailVerificationEntity`, `TotpSecretEntity`, `TotpRecoveryCodeEntity`, plus `AuthController` and `AuthService` for local auth and provider-backed (Google/GitHub) auth flows.
- `AuthorizationModule` owns reusable authorization grant persistence through `AuthorizationGrantEntity` and `AuthorizationService`.
- `AppModule` now composes `DatabaseModule`, `UsersModule`, `AuthModule`, `AuthorizationModule`, and `HealthModule` so the API can bootstrap the shared identity/authz foundation as one application surface.
- Local password auth stores Argon2id password hashes after appending the required password pepper, and local login stays blocked until a primary-email verification token has been consumed successfully.
- Email verification tokens are generated at registration time, hashed before persistence with `AUTH_SESSION_TOKEN_PEPPER`, checked for expiry at verification time, and consumed once so the same token cannot activate the account twice.
- Session lifecycle is server-managed through the `sfus_session` HTTP-only cookie: login issues a new session, `GET /api/auth/session` resolves and refreshes the active session timestamp, idle or absolute expiry revokes the record, and logout revokes the current session and clears the cookie.
- MFA is implemented with TOTP plus recovery codes: authenticated users start enrollment at `POST /api/auth/mfa/enroll`, confirm at `POST /api/auth/mfa/enroll/verify`, and receive one-time recovery codes only after successful verification. Recovery codes are single-use during challenge or proof flows, and regeneration (`POST /api/auth/mfa/recovery/regenerate`) replaces the previous set after authenticated MFA proof. Disable (`POST /api/auth/mfa/disable`) also requires authenticated MFA proof.
- Password and external-provider login flows now return an MFA challenge whenever a verified TOTP secret exists. Challenge completion at `POST /api/auth/mfa/challenge` issues the session cookie, and challenge tokens are signed and single-use.
- External-provider auth is provider-agnostic via an adapter registry boundary, with deterministic account linking in this order: existing `(provider, subject)` identity match, then existing user by normalized email, then new pending-onboarding user creation.
- First-time external users are marked `onboarding_required` until `POST /api/auth/onboarding/username` sets a valid unique username; `GET /api/auth/session` now returns `user.onboardingRequired` so the web shell can gate authenticated routes.
- Auth API contract for frontend session-awareness:
  - `POST /api/auth/register`
  - `POST /api/auth/verify-email`
  - `POST /api/auth/login`
  - `POST /api/auth/mfa/challenge`
  - `POST /api/auth/mfa/enroll`
  - `POST /api/auth/mfa/enroll/verify`
  - `POST /api/auth/mfa/recovery/regenerate`
  - `POST /api/auth/mfa/disable`
  - `POST /api/auth/logout`
  - `GET /api/auth/session`
  - `GET /api/auth/external/:provider/start`
  - `GET /api/auth/external/:provider/callback`
  - `POST /api/auth/onboarding/username`
  - `GET /api/auth/profile`
  - `PATCH /api/auth/profile`
  - `GET /api/auth/settings`
  - `PATCH /api/auth/settings`
  - authenticated `login` responses return either `{ user, session }` or `{ mfa }` when a challenge is required; `session` remains stable `{ user, session }`
  - `PATCH /api/auth/profile` accepts profile-display-name updates only and returns `{ username, email, displayName }`
  - `PATCH /api/auth/settings` accepts username updates only, enforces uniqueness, and returns `{ username, email, emailVerified, mfaEnabled }`

## Runtime Contract Overview

Milestone 1 local development is hybrid by default:

- `web` runs on the host at `localhost:3000`
- `api` runs on the host at `localhost:3001`
- `mysql` runs through `cicd/docker/compose.dev.yml`

The same local Compose file also supports full-stack container validation with the `fullstack` profile, while `cicd/docker/compose.prod.yml` is the single production Compose definition for long-lived `web` and `api` services. Production routing stays behind the existing reverse-proxy integration, so production-oriented Compose does not bind host ports for either app service.
The production `migrate` service is independently runnable as a one-off pre-rollout step and does not depend on starting `api`.

## Environment Ownership

Copy the example env files before running local Compose validation:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

Ownership is split by runtime boundary:

- `.env.example` - platform/deployment-owned values used by Compose metadata and local MySQL scaffolding
- `apps/web/.env.example` - web-owned values, including `/api` path targeting and container-internal API routing
- `apps/api/.env.example` - API-owned values, including the database contract plus auth foundation inputs for password peppering, session-token hashing, verification/session lifetimes, TOTP issuer naming, and recovery-code generation used by the API container and explicit migration flow

The API environment contract now validates these auth settings at startup:

- `AUTH_PASSWORD_PEPPER` is required and must be at least 16 characters.
- `AUTH_SESSION_TOKEN_PEPPER` is required, must be at least 16 characters, and is used when hashing persisted session and email-verification tokens.
- `AUTH_SESSION_TTL_MINUTES` must be an integer from 5 to 43200.
- `AUTH_SESSION_IDLE_TIMEOUT_MINUTES` must be an integer from 5 to 10080 and cannot exceed `AUTH_SESSION_TTL_MINUTES`.
- `AUTH_EMAIL_VERIFICATION_TTL_MINUTES` must be an integer from 5 to 10080 and controls how long a newly issued verification token remains usable.
- `AUTH_EXTERNAL_STATE_TTL_MINUTES` must be an integer from 5 to 60 and controls OAuth callback-state expiry.
- `AUTH_TOTP_ISSUER` is required and names the issuer presented by TOTP authenticators.
- `AUTH_RECOVERY_CODE_COUNT` must be an integer from 6 to 20.
- `AUTH_RECOVERY_CODE_LENGTH` must be an integer from 8 to 16.
- `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, and `AUTH_GOOGLE_CALLBACK_URL` are required for Google sign-in.
- `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`, and `AUTH_GITHUB_CALLBACK_URL` are required for GitHub sign-in.

The example files are templates only. Production secrets and the external production MySQL connection are managed on the host outside the repository checkout.

## Deployment And Validation References

- `cicd/docs/local-pipeline.md` - hybrid local development, full-stack Compose validation, and explicit production migration flow
- `cicd/docs/cicd.md` - CI validation entrypoints, smoke validation usage, and runtime contract artifacts
- `docs/website-launch-guide.md` - website container startup, required local env files, runtime URLs, migrations, and test commands
- `docs/architecture/milestone-1-foundation-decisions.md` - locked Milestone 1 architecture and deployment decisions

## Operational Validation Commands

- `bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml` - lint, typecheck, test, smoke validation, and shared CI/CD contract checks
- `bash cicd/scripts/smoke-validate.sh` - build the apps, start the full local stack, run the explicit migration command, and verify homepage plus API health
