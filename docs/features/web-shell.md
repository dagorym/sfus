# Web Shell & Routing

The Next.js App Router frontend: shared layout, route map, protected-route session handling,
landing page, health endpoints, and how the web app reaches the API.

**Code:** `apps/web/app/` (layout, pages, `auth-client.ts`), `apps/web/components/`,
`apps/web/next.config.mjs`
**Related:** [auth](auth.md) for the session API · [navigation](navigation.md) for the nav
bar · [launch](../operations/launch.md) for web env vars

## Shared shell

`apps/web/app/layout.tsx` renders the header (eyebrow `Milestone 3 Content Platform`, brand
`Star Frontiers US`), the dynamic [navigation](navigation.md) bar, and the footer
(`Star Frontiers US · Public foundation shell` / `Built for the Milestone 3 content launch
baseline.`). Site metadata description: `Blog, standalone pages, and site navigation for the
Star Frontiers US Milestone 3 content platform.`

Styling stays on the locked baseline: CSS Modules per component/page plus global CSS
custom-property tokens in `app/globals.css`. Branded `404` (`not-found.tsx`) and runtime
error surface (`error.tsx`) are part of the shell.

## Route map

| Route | Access | Notes |
|---|---|---|
| `/` | public | landing page (below) |
| `/login` | public | password sign-in, provider buttons, and the MFA challenge step (`?challenge=<token>`); honors `?next=` (validated: must start with `/`, not `//` — open-redirect guard; default `/app`) |
| `/register` | public | provider-first registration with local email/password fallback; mirrors backend constraints (username `[A-Za-z0-9_.-]{3,32}`, password ≥ 12). In dev it auto-verifies the returned token and attempts immediate sign-in, then routes to MFA challenge / onboarding / `/app` as appropriate. |
| `/onboarding/username` | session | first-login username completion; already-onboarded users are sent to `/app` |
| `/app`, `/profile`, `/settings` | session | authenticated shell, profile (displayName), settings (username, emailVerified, mfaEnabled) |
| `/blog`, `/blog/:slug` | public | see [blog](blog.md) |
| `/pages` | public | published pages index; see [pages](pages.md) |
| `/pages/:slug`, `/:slug` | public | see [pages](pages.md) |
| `/admin/blog[...]`, `/admin/pages[...]`, `/admin/navigation` | admin | client-gated admin management; the API role checks are the enforcement boundary |
| `/health/live`, `/health/ready` | public | static JSON `{ status: "ok", service: "web", check: "live" \| "ready" }` — **no dependency checks**; web readiness says nothing about API/DB health |

## Protected-route session handling

`apps/web/app/auth-client.ts` is the shared client authorization-state resolver:

- `resolveProtectedSession(nextPath)` → `{ session, redirectTo }`: no session →
  `redirectTo = /login?next=<nextPath>`; `user.onboardingRequired` →
  `redirectTo = /onboarding/username` (always — `nextPath` is intentionally ignored until
  onboarding completes); otherwise the live session.
- `readSession()` (null on `401`), `readProfile`/`updateProfile`,
  `readSettings`/`updateSettings`, `AuthorizationError` (carries `status`).
- `hasGlobalRole` / `canAccessPrivateAccount` — UX-only role mirrors (see
  [authorization](authorization.md)).

Every protected page calls `resolveProtectedSession()` on mount and follows `redirectTo`;
admin pages additionally check `hasGlobalRole(user, "admin")` and render an "Admin access
required" error for non-admins. This is client-side gating — sensitive data and mutations are
protected by the API, not by the page.

## Landing page

`apps/web/app/page.tsx` is a server component (no fetches/effects) with four sections: hero
(CTA to `/blog`), three highlight cards, a "What's new" section containing the
`RecentPostsFeed` client component (first 3 published posts via `listPublishedPosts()`;
loading / empty "No posts yet." / non-fatal "Could not load recent posts." states) plus
explore links, and runtime notes. The `/about` link targets the top-level catch-all route; if
no `about` page is published it resolves to a "not published" message by design.

## Security headers

`next.config.mjs` emits a baseline set of security response headers on every route via the
`headers()` export (pattern `/(.*)`):

| Header | Value |
|---|---|
| `Content-Security-Policy` | Full baseline CSP (enforced, not report-only — see below) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `DENY` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |

**No `Strict-Transport-Security` is emitted by the web app.** HSTS is handled at the
reverse-proxy (nginx) level per the locked deployment decision
(`docs/architecture/milestone-1-foundation-decisions.md`).

### Content Security Policy

The CSP is enforced (not `Content-Security-Policy-Report-Only`) and built by `buildCsp()` in
`next.config.mjs`:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self';
connect-src 'self' [+http://localhost:3001 in development];
font-src 'self';
object-src 'none';
frame-ancestors 'none';
base-uri 'self';
form-action 'self'
```

Allowances beyond `'self'` and their justifications (also documented as inline comments in
`next.config.mjs`):

- **`script-src 'unsafe-inline'`** — Next.js 15 injects inline scripts for hydration state
  (`__NEXT_DATA__`, server-action manifest) that cannot be nonce-scoped without a custom
  server. Accepted as a baseline tradeoff; a nonce/hash migration is a candidate for the
  deferred-work register in the next planning cycle.
- **`connect-src http://localhost:3001` (development only)** — in hybrid-dev mode the browser
  makes direct fetch calls to the local API origin before the Next.js proxy rewrites are in
  place; omitted in production.

`img-src` is `'self'` only: every image path (featured images, markdown-rendered images,
upload previews) loads via the proxied `/api/media/...` route, and `markdown-renderer.tsx`
rejects `data:` URIs outright, so no `data:` allowance exists.

## Reaching the API

Frontend code always targets the shared `/api` path contract
(`NEXT_PUBLIC_API_BASE_PATH`, default `/api`). `next.config.mjs` decides the rewrite target:

- `NODE_ENV === "development"` → rewrites `/api/:path*` to `WEB_API_ORIGIN`
  (default `http://localhost:3001`) — the hybrid-dev path.
- otherwise → rewrites only when `WEB_API_INTERNAL_URL` is set (full-stack containers set it
  to `http://api:3001`). When unset in production, no rewrite exists and `/api` must be
  routed by the reverse proxy (the production topology — see
  [deployment](../operations/deployment.md)).
