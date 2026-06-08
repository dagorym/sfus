# Navigation

Database-driven site navigation: admin-managed items rendered dynamically in the public
shell, with role-aware visibility and publication-leak filtering.

**Code:** `apps/api/src/navigation/`, `apps/web/components/navigation.tsx`,
`apps/web/app/navigation/navigation-client.ts`, `apps/web/app/admin/navigation/page.tsx`
**Related:** [blog](blog.md) / [pages](pages.md) own the publication predicates this feature
checks · [web-shell](web-shell.md) for where the nav renders

## API routes

All under `/api/navigation`. Admin routes require the `sfus_session` cookie + `admin` global
role (`401`/`403`) via `NavigationService.assertAdminManagementAccess()`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/navigation/items/public` | — | Active top-level items with `visibility = "public"`, `sortOrder` ascending, each with its active public children. Linked-target publication filtering applied (below). |
| GET | `/api/navigation/items/authenticated` | session (`401` without) | Active items with `visibility` `public` or `authenticated` (+ `admin` items for admin callers). **Non-admin callers get the same linked-target publication filtering as the public route** — they cannot learn the existence, slug, or label of unpublished content. Admin callers skip the filtering entirely (staging view). |
| GET | `/api/navigation/admin` | admin | all items regardless of visibility/active state |
| POST | `/api/navigation/admin` | admin | `201`. Body `{ label, url, linkType?, visibility?, sortOrder?, parentId? }`; defaults `internal` / `public` / `0` / top-level; `isActive` defaults true |
| PATCH | `/api/navigation/admin/:id` | admin | partial update (incl. `isActive`); `404` unknown |
| DELETE | `/api/navigation/admin/:id` | admin | `{ deleted: true }`; children removed via DB `ON DELETE CASCADE` |

Field rules: `label` ≤ 128 chars; `url` non-empty string ≤ 512 chars; for
`internal` items (the default) the URL must start with a single `/` — protocol-relative
`//` prefixes are rejected with `400`; external items are validated only for presence and
length; `linkType` `internal | external`; `visibility` `public | authenticated | admin`.
This URL constraint is enforced prospectively on create and update; existing rows are
unaffected (same posture as reserved-slug enforcement). On update the stored URL is
re-validated whenever the effective `linkType` changes, so a linkType-only switch to
`internal` cannot leave a non-`/` URL in place.

## Publication-leak filtering

`NavigationService.isLinkedTargetPubliclyVisible()` decides whether an item's link target is
publicly visible; items (top-level or child) failing the check are omitted for public and
non-admin-authenticated callers:

| URL pattern | Rule |
|---|---|
| external link | always shown |
| `/blog/<slug>` | blog post must be `published` with `publishedAt <= now` |
| `/pages/<slug>` | standalone page must be `published` |
| `/<slug>` (single segment) | if the slug is in `RESERVED_PAGE_SLUGS` → treated as a static route, always shown (so a bare `/pages` URL is always rendered); otherwise the standalone page with that slug must be `published` |
| any other internal path | treated as a static route, always shown |

Lookups are bounded per-item indexed point queries; batching/caching is deferred until the
nav tree grows (see `docs/deferred-tasks.md`).

## Nesting constraint

Exactly one level: a child's `parentId` must reference a top-level item (`parentId = null`).
Rejected with `400`: nesting under another child, and reclassifying a top-level item that
still has children as a child.

## Schema (`navigation_items`)

`id` char(36) PK · `parent_id` nullable self-FK with `ON DELETE CASCADE` · `label`
varchar(128) · `link_type` varchar(16) default `internal` · `url` varchar(512) · `visibility`
varchar(32) default `public` · `sort_order` smallint unsigned default 0 · `is_active`
tinyint(1) default 1 · `created_at` / `updated_at` datetime(3). Composite index
`idx_navigation_items_parent_sort (parent_id, sort_order)`.

Response shape `NavigationItemDetail`: all columns camel-cased + `children:
NavigationItemDetail[]` (always present on top-level items; child items appear only inside
their parent's `children`).

## Shell rendering

`apps/web/components/navigation.tsx` fetches on every route change: guests call the public
endpoint, authenticated sessions the authenticated endpoint. Fetch errors fall back silently
to an empty dynamic list so the shell still renders. After dynamic items the shell appends
fixed auth-state links (Sign in / Register for guests; App / Profile / Settings + Sign out
for members; the onboarding link while onboarding is required).

- Items with visible children render as `NavDropdown`: button trigger with `aria-expanded` +
  `aria-haspopup="menu"`, panel with `role="menu"`; Escape or focus-out closes.
- `linkType = "external"` renders a plain `<a target="_blank" rel="noopener noreferrer">`
  (tab-napping guard); internal items render Next.js `<Link>` with pathname-derived active
  styling.

## Admin UI

`/admin/navigation` (client-gated admin page; API enforces): create form (Label, URL, Link
Type, Visibility, Sort Order, optional Parent limited to top-level items), Show/Hide toggles
(`isActive` PATCH), ↑/↓ reorder (swaps `sortOrder` between adjacent siblings via two PATCH
calls), and Delete with confirm dialog (cascade removes children).

`navigation-client.ts` exports the admin helpers only (`adminListNavItems`,
`adminCreateNavItem`, `adminUpdateNavItem`, `adminDeleteNavItem`; all
`credentials: "include"`) plus the `NavigationItemDetail` / input types; the shell fetches the
read endpoints directly.
