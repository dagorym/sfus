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
| `/forums` | public | forum category/board index; see [forums](forums.md#web-surfaces-st16) |
| `/forums/[boardSlug]` | public | board view (paginated topics); see [forums](forums.md#web-surfaces-st16) |
| `/forums/[boardSlug]/[topicSlug]` | public | topic view (paginated posts, reply form, moderation controls); see [forums](forums.md#web-surfaces-st16) |
| `/forums/[boardSlug]/new-topic` | session | create-topic form; guests redirected to `/login?next=<path>`; see [forums](forums.md#web-surfaces-st16) |
| `/users/<username>` | public | minimal public profile (five fields only: username, displayName, avatar, bio, joinDate); fetches `GET /api/users/:username`; 404 renders a "not found" message; avatar via `UserAvatar` (see below) |
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

`apps/web/app/page.tsx` is a server component (no fetches/effects) refreshed for Milestone 4
with five sections:

1. **Hero** — primary CTA "Visit the forums" → `/forums`; secondary CTA "Read the blog" →
   `/blog`. The hero copy describes Milestone 4: community forums, @mentions with public member
   profiles, member avatars, and anti-spam rate limiting built on top of the earlier content
   milestones. No "Milestone 3" text remains.
2. **Highlights grid** — six cards: Community forums, Blog with threaded comments, Standalone
   pages and revision history, Dynamic navigation and media uploads, Public member profiles and
   avatars, Anti-spam and rate limiting.
3. **"What's new in Milestone 4"** — two-column layout:
   - _Recent forum activity_ column: `RecentForumActivity` client component
     (`apps/web/components/recent-forum-activity.tsx`) fetches up to 5 topics via
     `listRecentTopics({ limit: 5 })` (`GET /api/forums/recent`); loading / "No forum activity
     yet." / non-fatal "Could not load recent forum activity." states; "View the forums →" link
     at `/forums`. Board and topic slugs in links are `encodeURIComponent`-encoded.
   - _Recent posts_ column: `RecentPostsFeed` client component (unchanged; loading / "No posts
     yet." / non-fatal "Could not load recent posts." states); "View all posts →" link at `/blog`.
4. **Explore section** — forums entry (first), blog index, about, navigation admin, and member
   profiles. No `dangerouslySetInnerHTML` anywhere; all text is React text nodes.
5. **Runtime notes** — two meta cards: frontend-to-API contract and current content scope.

The `/about` link targets the top-level catch-all route; if no `about` page is published it
resolves to a "not published" message by design.

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
  server. Accepted as a baseline tradeoff; the nonce/hash migration is tracked in
  `docs/deferred-tasks.md` (CSP nonce/hash hardening).
- **`connect-src http://localhost:3001` (development only)** — in hybrid-dev mode the browser
  makes direct fetch calls to the local API origin before the Next.js proxy rewrites are in
  place; omitted in production.

`img-src` is `'self'` only: every image path (featured images, markdown-rendered images,
upload previews) loads via the proxied `/api/media/...` route, and `markdown-renderer.tsx`
rejects `data:` URIs outright, so no `data:` allowance exists.

## Reaching the API

Frontend code always targets the shared `/api` path contract
(`NEXT_PUBLIC_API_BASE_PATH`, default `/api`). `next.config.mjs` decides the rewrite target:

## Profile page — avatar upload/replace/remove (ST17)

`/profile` is an authenticated page that now includes an avatar control alongside the
existing display-name form. The control reuses the shared `ImageUpload` component
(`resourceType="avatar"`) to call `POST /api/media/upload?resourceType=avatar` (see
[media.md](media.md)). After a successful upload the page calls `PUT /api/users/me/avatar`
(the ST15 API) to bind the returned media id to the user's account. A "Remove avatar" button
calls `DELETE /api/users/me/avatar` and is shown only when an avatar is already set.

The avatar binding is enforced server-side by the ST15 API: the client control is UX only.
See [auth.md](auth.md#avatar-self-service-api-st15) for the enforcement contract.

## UserAvatar display component (ST17)

`apps/web/components/user-avatar.tsx` is the shared avatar display component used on:

- `/users/<username>` — the public profile header
- Forum topic/post author bylines (`/forums/[boardSlug]/[topicSlug]`) — ST16
- Mention-autocomplete results — ST16

**Fallback behavior:** when `avatarSrc` is `null` (no avatar set) or when the image fails
to load (`onError`), the component renders an uppercase-initials placeholder derived from
`displayName` (preferred) or `username`. A broken image is never displayed.

**Security:** `resolveAvatarSrc` enforces that `avatarSrc` begins with `/api/media/`
before returning it; any other value — including `http(s)://`, protocol-relative `//`,
`javascript:`, `data:`, or empty/whitespace — is rejected and returns `null` (initiating
the initials fallback). Callers must not pass raw or un-gated storage URLs, and the
function provides a defense-in-depth guard even if they do.

Usernames in `/users/<username>` links are always `encodeURIComponent`-encoded, consistent
with the ST16 byline convention.

- `NODE_ENV === "development"` → rewrites `/api/:path*` to `WEB_API_ORIGIN`
  (default `http://localhost:3001`) — the hybrid-dev path.
- otherwise → rewrites only when `WEB_API_INTERNAL_URL` is set (full-stack containers set it
  to `http://api:3001`). When unset in production, no rewrite exists and `/api` must be
  routed by the reverse proxy (the production topology — see
  [deployment](../operations/deployment.md)).
