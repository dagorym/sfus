# Authentication & Identity

Identity, registration, email verification, sessions, MFA, external providers (Google/GitHub),
onboarding, and the profile/settings account surface.

**Code:** `apps/api/src/auth/`, `apps/api/src/users/`, `apps/web/app/login/`,
`apps/web/app/register/`, `apps/web/app/onboarding/`, `apps/web/app/profile/`,
`apps/web/app/settings/`, `apps/web/app/auth-client.ts`
**Related:** [authorization](authorization.md) for roles/grants · [web-shell](web-shell.md) for
protected-route behavior · [launch](../operations/launch.md) for the `AUTH_*` env contract

## Identity model

`UserEntity` (`users` table): `id` (UUID), `username` (unique, varchar 32), `email` (unique,
varchar 320), `displayName` (nullable, varchar 80), `globalRole` (`user` | `moderator` | `admin`,
default `user`), `status` (`active` | `onboarding_required`), `emailVerifiedAt` (nullable),
`bio` (nullable, TEXT), `avatarMediaId` (nullable CHAR(36), FK → `media_references` ON DELETE SET NULL, added ST13).

- `user.onboardingRequired` in API payloads is derived: `status === "onboarding_required"`.
- Username rule: `^[A-Za-z0-9_.-]{3,32}$`. Password rule: minimum 12 characters.
- Email is normalized (trim + lowercase) and must match a basic `local@domain.tld` shape.
- `bio` is stored server-side but not yet editable via the authenticated profile/settings API. It is exposed read-only via the public profile endpoint (see below).
- `avatarMediaId` is now writable via the self-service avatar surface (`PUT /api/users/me/avatar`, `DELETE /api/users/me/avatar`, added ST15); it is exposed read-only in the public profile and suggest endpoints (ST14).

## API routes

All routes below sit under the global `/api` prefix.

| Method | Path | Auth | Returns / notes |
|---|---|---|---|
| POST | `/api/auth/register` | — | `201` `{ user, emailVerification: { required, expiresAt, token? } }`; `409` duplicate email/username; `400` invalid input. `token` is included only when `NODE_ENV !== "production"` (dev/test convenience). |
| POST | `/api/auth/verify-email` | — | `{ user, verified: true }`; `400` invalid/expired/already-consumed token |
| POST | `/api/auth/login` | — | `{ user, session }` + session cookie, **or** `{ mfa: { required, challengeToken, expiresAt, nextPath } }` when a verified TOTP secret exists; `401` bad credentials; `403` email not verified |
| POST | `/api/auth/mfa/challenge` | challenge token in body | `{ user, session, redirectPath }` + session cookie; `401` invalid/expired/replayed challenge or bad code. Body: `challengeToken` + `totpCode` or `recoveryCode`. |
| POST | `/api/auth/mfa/enroll` | session | `{ secret, otpauthUrl, issuer }`; `400` MFA already enabled |
| POST | `/api/auth/mfa/enroll/verify` | session | `{ enabled: true, recoveryCodes }` — recovery codes are returned only here and on regenerate; `400` enrollment not started; `401` invalid code |
| POST | `/api/auth/mfa/recovery/regenerate` | session + MFA proof | `{ regenerated: true, recoveryCodes }` — replaces the previous set |
| POST | `/api/auth/mfa/disable` | session + MFA proof | `{ disabled: true }` — deletes TOTP secrets and recovery codes |
| POST | `/api/auth/logout` | session | `{ success: true }`; idempotent; revokes the session and clears the cookie |
| GET | `/api/auth/session` | session | `{ user, session }`; `401` when missing/expired. `user` includes `onboardingRequired`. |
| GET | `/api/auth/profile` | session | `{ username, email, displayName }`; supports `?userId=<targetId>` (see cross-account access) |
| PATCH | `/api/auth/profile` | session | accepts `displayName` only (max 80 chars); returns the profile payload |
| GET | `/api/auth/settings` | session | `{ username, email, emailVerified, mfaEnabled }`; supports `?userId=<targetId>` |
| PATCH | `/api/auth/settings` | session | accepts `username` only (uniqueness enforced); returns the settings payload |
| GET | `/api/auth/external/:provider/start` | — | `302` to the provider consent URL; `?next=<path>` preserved through state; `400` unsupported provider |
| GET | `/api/auth/external/:provider/callback` | — | `302` to `/app`, `/onboarding/username`, or the MFA challenge route; `400` invalid/expired state; `502` provider exchange failure |
| POST | `/api/auth/onboarding/username` | session | `{ user, session }`; `400` invalid/duplicate username; `401` no session or onboarding not required |
| GET | `/api/users/suggest?q=` | session | `{ users: [{ username, displayName, avatarUrl }] }` — up to 10 active users whose username starts with `q`; `400` missing/non-string `q`; `401` no session; `429` throttle exceeded. |
| GET | `/api/users/:username` | — | `{ profile: { username, displayName, avatar, bio, joinDate } }` — public profile; `400` empty/non-string param; `404` nonexistent or inactive (identical message). |
| PUT | `/api/users/me/avatar` | session | `{ avatarUrl: "/api/media/<id>" }` — binds a media_references row as the caller's avatar; `400` missing/non-string `mediaId`; `401` no session; `403` media not found, wrong resourceType, or not owned by caller (uniform message). |
| DELETE | `/api/users/me/avatar` | session | `{ avatarUrl: null }` — clears the caller's avatar; `401` no session. |

MFA proof = `totpCode` **or** `recoveryCode` in the request body; at least one required.

## Sessions

- Cookie: `sfus_session` — always `HttpOnly`, `SameSite=Lax`, path `/`; `Secure` when
  `NODE_ENV === "production"`. Cookie expiry mirrors the session's `expiresAt`.
- Token: 32 random bytes (base64url) in the cookie; the database stores only
  `SHA-256(token + ":" + AUTH_SESSION_TOKEN_PEPPER)`.
- Lifetime: absolute TTL (`AUTH_SESSION_TTL_MINUTES`) is fixed at issuance and is **not**
  extended by activity. Session resolution updates `lastSeenAt`, which anchors the idle
  timeout (`AUTH_SESSION_IDLE_TIMEOUT_MINUTES`, must be ≤ the TTL).
- Revocation: explicit logout, absolute expiry, or idle expiry — checked on every resolution;
  expired sessions are revoked and return `401`.

## Passwords and email verification

- Password hash: Argon2id over `password + AUTH_PASSWORD_PEPPER`.
- Local login is blocked (`403`) until a verification token has been consumed.
- Verification tokens: 32 random bytes, persisted as a peppered SHA-256 hash, expire after
  `AUTH_EMAIL_VERIFICATION_TTL_MINUTES`, and are single-use (`consumedAt` set on first success).
- In non-production environments the raw token is returned from `/api/auth/register` so the
  flow can be exercised without a mail provider; production stores only the hash.

## MFA (TOTP + recovery codes)

- TOTP: SHA-1, 6 digits, 30-second period, ±1 step window; codes are 6–8 digits after
  whitespace stripping; a given code is accepted once per window (replay-guarded).
- The TOTP secret is stored AES-256-GCM encrypted; the key is derived as
  `SHA-256(AUTH_SESSION_TOKEN_PEPPER + ":" + AUTH_PASSWORD_PEPPER)`.
- Recovery codes: count/length from `AUTH_RECOVERY_CODE_COUNT` / `AUTH_RECOVERY_CODE_LENGTH`,
  generated from a lookalike-free alphabet (no `I O 0 1`), displayed in 4-char dash groups,
  stored as peppered hashes, single-use.
- Login (password or external) returns an MFA challenge whenever a *verified* TOTP secret
  exists. Challenge tokens are HMAC-SHA256-signed (session-token pepper), single-use
  (in-memory replay guard), and expire after `AUTH_EXTERNAL_STATE_TTL_MINUTES` (reused — there
  is no separate MFA-challenge TTL).

## External providers

- Providers are registered behind an adapter registry (`external-auth-provider.registry.ts`);
  currently `google` and `github`. Adding a provider means adding an adapter + registry entry
  plus its `AUTH_<PROVIDER>_*` env vars.
- OAuth `state` is a signed payload (HMAC-SHA256, session-token pepper) carrying the provider,
  normalized `next` path, and a nonce; it expires after `AUTH_EXTERNAL_STATE_TTL_MINUTES`, is
  bound to the request via the `sfus_external_auth_state` cookie, and is single-use (in-memory
  replay guard — restart clears the guard until tokens expire).
- Account linking is deterministic, in order:
  1. existing `(provider, subject)` identity → that user;
  2. provider-verified email matching an existing user (normalized) → link to that user;
  3. otherwise create a new user with username `pending_<16 hex>`, status
     `onboarding_required`, and — when the provider email is unverified — a synthetic
     `<provider>_<subject>@users.noreply.sfus.local` email.
- First-time external users stay `onboarding_required` until
  `POST /api/auth/onboarding/username` succeeds; the web shell gates all authenticated routes
  on this flag (see [web-shell](web-shell.md)).

## Cross-account profile/settings access

`GET|PATCH /api/auth/profile` and `GET|PATCH /api/auth/settings` accept `?userId=<targetId>`
and evaluate the shared authorization contract against an `account` resource
(`ownerUserId = target`, `visibility = "private"`): the owner always passes; otherwise a
global role or an explicit ACL grant must allow the `read`/`write` action. `403` when denied.
See [authorization](authorization.md).

## Audit logging and client IP

All auth event handlers (register, verify-email, login, MFA challenge/enroll/disable,
logout, external-auth callback, onboarding — 9 call sites in `auth.controller.ts`)
record `ipAddress: request.ip` in the session or audit payload. Because the API runs
behind a single shared `nginx-proxy` hop, Express is configured with `trust proxy = 1`
so `request.ip` resolves to the original client IP from the `X-Forwarded-For` header
rather than the proxy's address. In direct (un-proxied) local development no
`X-Forwarded-For` header is present, so Express falls back to the socket remote address,
which is correct for direct connections. See `apps/api/src/index.ts` for the bootstrap
configuration and `docs/architecture/milestone-1-foundation-decisions.md` for the locked
proxy-topology decision.

## User discovery API (ST14)

Two endpoints in `UsersModule` expose limited, public-safe user information. Both enforce
explicit field allowlist mapping — the entity is never passed through directly.

### GET /api/users/suggest?q= — username prefix-suggest

Session-gated, throttled endpoint for prefix-based username autocomplete.

**Security order (400 → 401 → throttle → DB):**

1. `q` parameter must be a string — missing or non-string returns `400`.
2. Active session required (`sfus_session` cookie) — `401` before any DB work.
3. `ThrottleService.checkRequest()` — per-user rate limit with `userId` + `userCreatedAt`
   (new-account tier active, same pattern as forums post creation). Returns `429` when
   the limit is exceeded.
4. `UsersService.suggestByPrefix(q)` — prefix-match on ACTIVE users only (status
   `"active"`), escaped for LIKE injection (`%`, `_`, `\` are escaped), capped at 10
   results, ordered alphabetically.

**Response (200):** `{ users: UserSuggestItem[] }` where each item contains ONLY:

| Field | Type |
|---|---|
| `username` | string |
| `displayName` | `string \| null` |
| `avatarUrl` | `string \| null` — `/api/media/<id>` or `null` |

The response **never** includes `email`, `globalRole`, `status`, `id`, or any other field.

**Error contract:**

| Status | Condition |
|---|---|
| 400 | Missing or non-string `q` |
| 401 | No active session |
| 429 | Throttle limit exceeded |

### GET /api/users/:username — minimal public profile

Unauthenticated endpoint returning the five-field public profile of an active user.

**Security (enumeration parity, P12):** Both nonexistent users and users that exist but are
not active return `404 "User not found."` — the message is **identical in both cases** so
callers cannot determine whether an inactive username exists.

**Response (200):** `{ profile: PublicProfileShape }` containing EXACTLY:

| Field | Type | Notes |
|---|---|---|
| `username` | string | |
| `displayName` | `string \| null` | |
| `avatar` | `string \| null` | `/api/media/<id>` URL or `null` when no avatar is set |
| `bio` | `string \| null` | |
| `joinDate` | string (ISO-8601) | Account creation date |

The response **never** includes `email`, `globalRole`, `status`, `id`, or any other field.

**Error contract:**

| Status | Condition |
|---|---|
| 400 | Missing or non-string (including empty) `:username` param |
| 404 | User not found or not active — **identical message in both cases** (P12) |

### UsersModule wiring

`UsersModule` has two forms to avoid a circular-dependency between `AuthModule` and
`UsersModule`:

- **Static form** (`UsersModule` decorated with `@Module`) — imports only `TypeOrmModule`
  and exports `UsersService`. `AuthModule` imports this form.
- **Dynamic form** (`UsersModule.register(environment)`) — adds `AuthModule` and
  `ThrottleModule` imports plus `UsersController`. `AppModule` calls this form.

The split is required because a naive `UsersModule` importing `AuthModule` would create the
cycle `AuthModule → UsersModule → AuthModule`.

## Avatar self-service API (ST15)

Two session-gated endpoints in `UsersModule` allow users to set or remove their own avatar.

### PUT /api/users/me/avatar — set avatar

**Security order (400 → 401 → 403 → DB):**

1. `mediaId` in request body must be a non-empty string — missing or wrong type returns `400`.
2. Active session required (`sfus_session` cookie) — `401` before any DB work.
3. `UsersService.setAvatar` performs a single DB lookup with three predicates:
   `id = mediaId AND resourceType = 'avatar' AND ownerUserId = callerId`. A row not matching
   all three conditions (nonexistent id, wrong `resourceType`, or owned by a different user)
   returns a uniform `403 "Media id not found or not usable as your avatar."`. The caller
   cannot determine whether a foreign media id exists (oracle parity).
4. On success, `users.avatar_media_id` is updated to `mediaId` and the endpoint returns
   `{ avatarUrl: "/api/media/<id>" }`.

**Important:** only media uploaded with `resourceType='avatar'` (via `POST /api/media/upload?resourceType=avatar`)
can be bound. Attempting to bind a media id uploaded under any other resource type yields
the same uniform `403` as a nonexistent or foreign id. See [media.md](media.md) for the
upload contract.

The set avatar is immediately reflected in the public profile (`GET /api/users/:username`)
and the suggest endpoint (`GET /api/users/suggest`).

**Error contract:**

| Status | Condition |
|---|---|
| 400 | Missing or non-string `mediaId` in request body |
| 401 | No active session |
| 403 | Media id nonexistent, wrong resourceType, or not owned by caller — uniform message |

### DELETE /api/users/me/avatar — remove avatar

**Security order (401 → DB):**

1. Active session required (`sfus_session` cookie) — `401` otherwise.
2. `UsersService.removeAvatar` sets `users.avatar_media_id = NULL` for the calling user.
3. Returns `{ avatarUrl: null }`.

No ownership check is required for removal because the endpoint only clears the caller's own
`avatar_media_id` field; it does not affect the underlying `media_references` row.

**Error contract:**

| Status | Condition |
|---|---|
| 401 | No active session |

## Security invariants

- Two peppers, two jobs: `AUTH_PASSWORD_PEPPER` is used only for password hashing;
  `AUTH_SESSION_TOKEN_PEPPER` hashes/signs everything else (session tokens, verification
  tokens, recovery codes, state and challenge signatures, TOTP key derivation).
- No bearer tokens: all authenticated API access rides the `sfus_session` cookie.
- Raw secrets (session tokens, verification tokens, recovery codes) are never persisted —
  only peppered hashes.
