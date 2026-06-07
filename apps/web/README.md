# SFUS Web (`@sfus/web`)

Next.js (App Router) frontend. All API access targets the shared `/api` path contract;
`next.config.mjs` rewrites it to the API in dev/containers (the reverse proxy routes it in
production).

## Runtime contract

- host-run local port: `3000`
- static health probes: `/health/live`, `/health/ready` (no dependency checks)
- protected routes are client-gated via `resolveProtectedSession()`; the API role checks are
  the enforcement boundary

## Where the documentation lives

Start from the [documentation map](../../docs/README.md) and read the docs matching what you
are touching:

- shell, route map, session handling, API path targeting:
  [docs/features/web-shell.md](../../docs/features/web-shell.md)
- feature surfaces: [blog](../../docs/features/blog.md),
  [pages](../../docs/features/pages.md), [navigation](../../docs/features/navigation.md),
  [auth](../../docs/features/auth.md)
- shared authoring components (`MarkdownEditor`, `MarkdownRenderer`, `ImageUpload`):
  [docs/features/media.md](../../docs/features/media.md)
- web env variables: [docs/operations/launch.md](../../docs/operations/launch.md)
- tests: [docs/development/testing.md](../../docs/development/testing.md)

## Layout

`app/` — routes (public shell, auth entry, authenticated shell, `admin/*` management,
top-level `[slug]` catch-all) and typed API clients (`auth-client.ts`, `blog/blog-client.ts`,
`pages/pages-client.ts`, `navigation/navigation-client.ts`) · `components/` — shared
components (navigation, authoring widgets, recent-posts feed, page-state)
