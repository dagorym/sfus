# Implementer Report — deferred-cleanup subtask-2

## Task

Add locked baseline security headers and CSP at app level (web and API).

## Status

SUCCESS

## Code Commit

`95c4b19`

## Changed Files

- `apps/web/next.config.mjs` — added `headers()` export with full baseline CSP and security headers for all routes
- `apps/api/src/index.ts` — added helmet import and `app.use(helmet({...}))` call in `apiBootstrap()`
- `apps/api/package.json` — added `helmet ^8.0.0` to dependencies
- `apps/api/src/index.test.ts` — added `use: vi.fn()` to mockApp and `mockApp.use.mockClear()` in beforeEach so existing bootstrap tests pass after the approved behavior change
- `pnpm-lock.yaml` — updated by `pnpm install` after adding helmet

## Implementation Summary

### Web (next.config.mjs)

Added a `buildCsp()` function and `securityHeaders` array, then a `headers()` export that applies them to all routes (`source: "/(.*)`).

Headers applied:
- `Content-Security-Policy` (enforced, not report-only): `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' [localhost:3001 in dev only]; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

No `Strict-Transport-Security` is emitted (HSTS is handled at the nginx reverse proxy per the locked architecture decision).

### CSP Allowances Beyond 'self' (each justified in code)

1. `script-src 'unsafe-inline'` — Next.js 15 injects inline hydration scripts; nonce/hash migration is deferred.
2. `style-src 'unsafe-inline'` — Next.js 15 injects inline styles for CSS modules at runtime.
3. `img-src data:` — `markdown-renderer.tsx` uses `data:` URIs for image previews.
4. `connect-src http://localhost:3001` (dev only) — hybrid-dev mode makes direct XHR/fetch to the API before the Next.js proxy rewrite is applied.

### API (index.ts + package.json)

Added `helmet ^8.0.0` as a production dependency. Added `app.use(helmet({ strictTransportSecurity: false, contentSecurityPolicy: false }))` immediately after the trust-proxy setting.

- `strictTransportSecurity: false` — HSTS is handled by the nginx reverse proxy per the locked deployment decision.
- `contentSecurityPolicy: false` — the API serves only JSON; Swagger UI (conditionally mounted) would require CSP exceptions on every response. The browser-facing CSP is handled by the web layer. This is documented with an in-code comment.

### Swagger UI Exception

Swagger UI is conditionally mounted at `/api/docs` when `swaggerEnabled=true`. Helmet's default CSP is disabled for the API (see above). No additional per-route exception is needed because CSP is not applied at the API level.

### Test Mock Update

The `mockApp` in `apps/api/src/index.test.ts` did not have a `use` method. Adding `app.use(helmet(...))` to `apiBootstrap()` caused all three existing bootstrap tests to fail with `TypeError: app.use is not a function`. This is an expected consequence of the approved behavior change, not a regression. The minimal fix — adding `use: vi.fn()` to the mock and clearing it in `beforeEach` — was applied per validation-triage guidance.

## Validation Results

- `@sfus/api` lint: PASS (0 warnings/errors)
- `@sfus/api` typecheck: PASS (clean)
- `@sfus/api` test: PASS (353 passed, 2 skipped — DB integration suite, expected)
- `@sfus/api` build: PASS (clean)
- `@sfus/web` test: PASS (264 passed)
- `@sfus/web` lint: PRE-EXISTING FAILURE — `eslint-config-next` not found in worktree node_modules; confirmed pre-existing before this change
- `@sfus/web` typecheck: PRE-EXISTING FAILURE — `react` types not found in worktree node_modules; confirmed pre-existing before this change

## Pre-existing Failures (not regressions)

Web lint and typecheck fail in this worktree due to missing `node_modules` for `next` and `react` dev types. These failures existed before any changes in this subtask (verified by stashing changes and re-running). They are not regressions introduced by this change.

## Security Properties

- CSP is enforced (`Content-Security-Policy`, not `Content-Security-Policy-Report-Only`)
- All five baseline headers applied to every web route
- Helmet baseline (minus HSTS, minus CSP) applied to every API route
- No HSTS emitted by either app
- Each CSP allowance beyond 'self' has in-code justification
