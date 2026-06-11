# API Conventions

Cross-cutting contracts every API module follows: routing prefix, error envelope, logging,
health/readiness, environment validation, and database/migration conventions.

**Code:** `apps/api/src/index.ts`, `apps/api/src/common/`, `apps/api/src/config/`,
`apps/api/src/health/`, `apps/api/src/database/`
**Related:** [launch](../operations/launch.md) for the canonical env-variable table ·
feature docs for per-module routes

## Security headers

The API bootstrap (`apiBootstrap()` in `apps/api/src/index.ts`) applies
[helmet](https://helmetjs.github.io/) middleware before routing:

```typescript
app.use(helmet({ strictTransportSecurity: false, contentSecurityPolicy: false }));
```

- **`strictTransportSecurity: false`** — HSTS is omitted at the app level; it is handled by
  the reverse proxy per the locked deployment decision
  (`docs/architecture/milestone-1-foundation-decisions.md`).
- **`contentSecurityPolicy: false`** — the API serves only JSON; browser CSP enforcement is
  irrelevant for JSON endpoints. The default helmet CSP would also block Swagger UI inline
  styles and scripts when `swaggerEnabled=true`. Browser-facing CSP is covered by the web
  layer (`next.config.mjs` — see [web-shell](../features/web-shell.md)).

All other helmet defaults apply (e.g. `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, etc.).

## Routing & Swagger

- Global prefix `api` — every controller route is served under `/api/...`.
- Swagger UI at `/api/docs` (+ generated document at `/api/docs/openapi.json`), enabled when
  `API_SWAGGER_ENABLED` is truthy; the default is on outside production
  (`nodeEnv !== "production"`).

## Process entrypoint

`node dist/index.js [command]`:

- no argument — boot the API server
- `migration:run` — run pending migrations and exit
- `migration:show` — print migration state and exit
- anything else — fails fast with `Unsupported API command`

## Error envelope

`JsonExceptionFilter` shapes every error response:

```json
{
  "error": { "code": "NOT_FOUND", "message": "...", "statusCode": 404 },
  "request": { "correlationId": "...", "method": "GET", "path": "/api/...", "timestamp": "..." }
}
```

- `code` comes from the exception body's `error` field when present, else the HTTP status
  name; normalized to `UPPER_SNAKE_CASE`.
- `details` (optional): a structured object providing domain-specific context for the
  error. Present only when the throwing code sets a `details` key on the exception body
  (e.g. lock-conflict metadata). Absent on all other errors — no `details` key in the
  response (backward-compatible). Example: the 409 lock-conflict from
  `POST /api/docs/:id/lock` includes `error.details.lockedByUserId` and
  `error.details.lockExpiresAt`.
- Non-`HttpException` errors always become
  `{ code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred.", statusCode: 500 }`.
- Web clients should read `payload.error.message` first, then `payload.message`, then fall
  back to a generic string (the pattern used by all `*-client.ts` helpers).

## Correlation & logging

- `CorrelationIdMiddleware` reads `x-correlation-id`, falls back to `x-request-id`, generates
  a UUID otherwise, and always echoes `x-correlation-id` on the response.
- All logs are structured JSON (`JsonLoggerService`):
  `{ timestamp, level, message, context?, metadata? }` — `message` is the event name.
  Request events: `request.completed` (info) / `request.failed` (error). Lifecycle events:
  `api.started`, `api.start_failed`, `migrations.completed`, `migrations.failed`,
  `migrations.status`, `migrations.status_failed`.

## Health & readiness

- `GET /api/health/live` — process-only liveness; always
  `{ status: "ok", service: "api", timestamp }`.
- `GET /api/health/ready` — dependency-aware; returns `503` when not ready. Checks, in order:
  1. database connectivity (`SELECT 1`); when down, migrations are reported down too;
  2. every reviewed migration applied (compared against the `DB_MIGRATIONS_TABLE` table).
  Response includes `checks.database.status` and `checks.migrations.{status,required,missing}`.
- The web app has its own static `/health/live` + `/health/ready` (no dependency checks) —
  see [web-shell](../features/web-shell.md).

## Environment validation

`loadEnvironment()` validates the entire env contract at startup and **fails fast** on any
missing or invalid value — the app never boots half-configured. Conventions:

- integers are range-checked (e.g. `API_PORT` 1–65535, `MEDIA_UPLOAD_MAX_SIZE_BYTES`
  1024–20971520); enums and cross-field rules are enforced
  (`AUTH_SESSION_IDLE_TIMEOUT_MINUTES` ≤ `AUTH_SESSION_TTL_MINUTES`).
- env file resolution: `SFUS_API_ENV_FILE` when set, else the first of `apps/api/.env`,
  `.env`, `<dist>/../.env`; values already in the process environment win
  (`override: false`).
- new modules receive the validated `ApplicationEnvironment` object (e.g.
  `MediaModule.register(environment)`) rather than reading `process.env` directly.

The canonical variable-by-variable table (defaults, ranges, ownership) lives in
[operations/launch](../operations/launch.md). Add new variables there and validate them in
`environment.ts`.

## Rate limiting and anti-spam

The `ThrottleModule` (wired in `AppModule`) provides a reusable per-request
rate-limit mechanism and a per-post link-count check. Route enforcement is
applied by attaching `ThrottleGuard` and/or `exceedsLinkLimit()` to individual
controllers; the module ships the reusable mechanism only — see ST9 for route
wiring.

### Identity resolution

`ThrottleService.checkRequest()` resolves the throttle key as follows:

1. **Authenticated request** — uses the session `userId` as the key (most
   accurate; separate count per user across all IPs).
2. **Guest request** — falls back to `request.ip`, which Express resolves via
   `trust proxy = 1` (locked MS1 decision). The guard **never reads
   `X-Forwarded-For` directly**; it relies on the Express-resolved value.

This means an attacker cannot bypass the IP-based guest limit by spoofing
`X-Forwarded-For`.

### New-account tier

When a request is authenticated **and** the account was created within the last
`THROTTLE_NEW_ACCOUNT_WINDOW_MS` milliseconds, a stricter limit
(`THROTTLE_NEW_ACCOUNT_MAX_HITS`) applies instead of the standard
`THROTTLE_MAX_HITS`. The tier is active on all three member create routes wired
in ST9 (forum topic create, forum post create, blog comment create): each handler
calls `UsersService.findById(session.user.id)` to fetch the account's `createdAt`
and passes it as `userCreatedAt` to `ThrottleService.checkRequest()`. The tier
is inactive for guest requests and for accounts older than the window.

### 429 response envelope

When the rate limit is exceeded, the guard throws an `HttpException(429)` shaped
to match the standard error envelope:

```json
{
  "error": "TOO_MANY_REQUESTS",
  "message": "Rate limit exceeded. Try again in N second(s).",
  "statusCode": 429,
  "retryAfter": 30
}
```

`retryAfter` is the remaining window time in seconds (minimum 1). Clients should
read this field to schedule a retry instead of back-off polling.

### Storage seam (`IThrottleStore`)

All throttle state is accessed exclusively through the `IThrottleStore`
interface via `IThrottleStore.hit(key, windowMs)`. The default wired
implementation is `InMemoryThrottleStore` (fixed-window counter). To swap to
Redis, implement `IThrottleStore` and replace the `THROTTLE_STORE` provider in
`ThrottleModule.register()` — no guard or route change is required.

### Per-post link limit

`countLinks(body)` and `exceedsLinkLimit(body, maxLinks)` (from
`apps/api/src/common/throttle/link-limit.ts`) count links in a Markdown body
without double-counting. The following are counted:

- Markdown-syntax links `[text](destination)` — destination may use any scheme.
- Bare `http://` and `https://` URLs at a word boundary outside Markdown link syntax.
- Bare `ftp://`, `mailto:`, and `tel:` URIs at a word boundary (evasion-scheme detection;
  scheme substrings inside larger words such as `hotel:` or `motel:` are not counted).
- Bare `www.`-prefixed hosts at a word boundary.

The scanner is linear-time (indexOf-based, no backtracking regex on
attacker-supplied input) and caps the inspected region at 256 KB regardless of
body size. Controllers should call
`exceedsLinkLimit(body, environment.throttle.maxLinksPerPost)` to reject bodies
that exceed the configured cap (`THROTTLE_MAX_LINKS_PER_POST`).

---

## Database & migrations

- TypeORM, MySQL, `utf8mb4`, connection limit 5, `connectTimeout` from
  `DB_CONNECT_TIMEOUT_MS`. All schema/queries must stay MySQL 5.7.44-compatible (locked
  decision).
- `synchronize: false`, `migrationsRun: false` — startup never touches the schema; the
  explicit `migration:run` command is the only schema-application path.
- Migrations are explicit, reviewed files in `apps/api/src/database/migrations/` and are
  registered as the reviewed baseline that readiness checks against. Current set:
  `FoundationBaseline1711843200000`, `IdentityAuthorizationFoundation1714435200000`,
  `MilestoneThreeContentFoundation1748736000000`,
  `MilestoneFourForumsFoundation1780890123767`,
  `UserBioAndAvatar1780892561355`,
  `ForumDescriptionLength1780893000000`,
  `MilestoneFiveDocumentsFoundation1781308800000`.
- Schema rollback policy is forward-fix only — see
  [deployment](../operations/deployment.md).
