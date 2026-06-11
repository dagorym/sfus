# Security Review: subtask-6 — Public /pages Index Endpoint and Web Route

**Plan:** plans/deferred-cleanup-plan.md, section "subtask-6 — Public /pages index (API list endpoint + web route)"
**Artifact directory:** artifacts/deferred-cleanup/subtask-6
**Reviewer role:** Security Agent
**Date:** 2026-06-07
**Outcome:** PASS

---

## 1. Review Scope

This specialist security review covers the subtask-6 changeset introducing a public
GET /pages API endpoint and the corresponding /pages web route. The review was triggered
because the change adds a new unauthenticated public surface to an otherwise
session/admin-gated module. Primary risk surface: draft-hiding, payload minimization,
and accidental credential forwarding.

Files reviewed:

- `apps/api/src/pages/pages.controller.ts` — GET /pages endpoint, PageSummary interface, toSummary mapper
- `apps/api/src/pages/pages.service.ts` — findPublished predicate, ordering, assertAdminManagementAccess
- `apps/api/src/pages/entities/standalone-page.entity.ts` — entity shape and status index
- `apps/web/app/pages/pages-client.ts` — listPublishedPages client function
- `apps/web/app/pages/page.tsx` — /pages index route, empty state, Link rendering
- `apps/web/app/[slug]/page.tsx` — top-level catch-all route, RESERVED_SLUGS enforcement
- `apps/api/src/pages/pages.service.test.ts` — unit tests for predicate, ordering, access control
- `apps/web/app/pages/pages.spec.ts` — web source-contract tests
- `docs/features/pages.md` — endpoint and route documentation
- `docs/features/web-shell.md` — navigation route map

Upstream verifier result: PASS (all 5 ACs satisfied).

---

## 2. Why Specialist Review Was Triggered

A new unauthenticated read endpoint on a module that also exposes admin write surfaces
(create, update, publish, unpublish, restore) requires specialist review to confirm:

- the public endpoint does not expose draft or unpublished content,
- the response payload does not leak internal fields (body, revision history, user IDs),
- the web route does not forward credentials or call admin helpers,
- reserved-slug enforcement is present on both the server and client sides.

---

## 3. Findings

### 3.1 Published-Only Enforcement (AC1)

**Result: PASS — no findings**

`PagesService.findPublished()` uses a TypeORM `find({ where: { status: "published" } })`
query, enforcing the published-only predicate at the database query layer rather than
filtering results in application code. This means draft and unpublished pages are never
fetched from the database and cannot appear in any code path that processes the result.

`findPublishedBySlug()` applies the same predicate: `findOne({ where: { slug, status: "published" } })`.
Both public accessors share the same status check, so visibility is consistent across the
list endpoint and individual slug lookup.

The `standalone_pages` entity has a `status` column with values constrained to `"draft"`,
`"published"`, and `"unpublished"`. An index exists on status
(`idx_standalone_pages_status`), so the filter is efficient and not trivially bypassable
via a table-scan side channel.

Service-level tests explicitly verify: (a) `status: "published"` is passed in the where
options (operator-pinned query test), (b) draft pages never appear (negative test with stub
returning empty), and (c) the predicate is correct across `findPublished` and
`findPublishedBySlug`.

### 3.2 Payload Minimization (AC2)

**Result: PASS — no findings**

The `PageSummary` interface in `pages.controller.ts` is declared as:

```ts
interface PageSummary {
  slug: string;
  title: string;
  updatedAt: string;
}
```

The `toSummary` mapper explicitly constructs only these three fields from the
`StandalonePageEntity`. Notably absent from the public payload: `body`, `status`,
`publishedAt`, `currentRevisionId`, `createdByUserId`, `createdAt`, `summary`, and
`featuredMediaId`. The mapper does not spread or forward the full entity.

The `listPublished` controller action maps through `toSummary` before returning, so no
code path can accidentally include additional fields from the entity in the list response.

Source-contract tests pin the `toSummary` function body to confirm `body:` is not present
in the returned object, and pin the `PageSummary` interface to confirm `body` is absent.

### 3.3 Access Control — No Privilege Bypass (AC1)

**Result: PASS — no findings**

The `GET /pages` controller action has no `@UseGuards`, no session resolution, and no
call to `assertAdminManagementAccess`. This is by design: the endpoint is intentionally
unauthenticated (public). The absence of a session check is correct behavior, not a
vulnerability.

All admin routes in `PagesController` (`adminListAll`, `adminGetById`, `adminCreate`,
`adminUpdate`, `adminPublish`, `adminUnpublish`, `adminListRevisions`,
`adminRestoreRevision`) call both `this.authService.resolveSession()` and
`this.pagesService.assertAdminManagementAccess(session.user.globalRole)` before any
data access or mutation. Service-level tests verify that `assertAdminManagementAccess`
throws `ForbiddenException` for all non-admin roles (user, moderator, empty string,
unknown string) and allows only `"admin"`.

No privilege escalation path identified. There is no route handler that conditionally
skips the admin check based on query parameters or headers.

### 3.4 Web Route Security: Credential Forwarding and Admin Endpoint Calls

**Result: PASS — no findings**

`listPublishedPages()` in `pages-client.ts` uses a plain `fetch` with no `credentials`
option and no authorization header. The function fetches from `${apiBase}/pages` (not
`/admin/pages`). This is confirmed by source-contract tests that assert:
(a) `credentials: "include"` is absent from the `listPublishedPages` function body, and
(b) `/admin/pages` does not appear in the function body.

`apps/web/app/pages/page.tsx` imports only `listPublishedPages` from `pages-client.ts`
and does not call any admin helper (`adminListAllPages`, etc.). The component does not
include a `credentials` option. Source-contract tests assert both conditions explicitly.

The admin client functions (`adminListAllPages`, `adminCreatePage`, etc.) all correctly
include `credentials: "include"`.

### 3.5 Reserved-Slug Enforcement — Web/API Mirror Parity

**Result: PASS — no findings**

The server-side `RESERVED_PAGE_SLUGS` set in `pages.service.ts` contains exactly 11
entries: `admin, api, app, blog, login, pages, register, onboarding, profile, settings,
health`. These are enforced at create and update time via `assertSlugValid`, so no
reserved slug can ever be stored as a page slug.

The client-side `RESERVED_SLUGS` set in `apps/web/app/[slug]/page.tsx` mirrors these
exactly. Both sets include `"pages"`, preventing the catch-all route from attempting to
resolve a `/pages` request against the API (which would never return a page for a
reserved slug anyway, but the early return avoids an unnecessary API round trip and
provides defence-in-depth).

Source-contract tests pin the exact 11-entry membership of `RESERVED_SLUGS` in the
catch-all route and assert that `"pages"` is present in the block. Service-level tests
pin `RESERVED_PAGE_SLUGS` via a cardinality check and set-equality loop to prevent
silent additions or removals.

### 3.6 URL Encoding in Link Elements

**Result: PASS — no findings**

`apps/web/app/pages/page.tsx` constructs `Link` hrefs as
`/pages/${encodeURIComponent(page.slug)}`. `getPublishedPage` in `pages-client.ts`
constructs the API URL as `${apiBase}/pages/${encodeURIComponent(slug)}`. Both call
`encodeURIComponent` before embedding the slug. The slug format is additionally
constrained to `^[a-z0-9]+(?:-[a-z0-9]+)*$` by `assertSlugValid`, meaning in practice
all stored slugs are already URL-safe alphanumeric+hyphen strings. The `encodeURIComponent`
calls are defense-in-depth and correct.

### 3.7 Empty-State and Error-State Safety

**Result: PASS — no findings**

The `/pages` component correctly handles three states:
- loading (before fetch resolves),
- empty list (pages.length === 0),
- error (fetch throws).

In the empty state, the component renders a static string: `"No pages have been published yet."` — no page data, no user-supplied content. In the error state, it renders a hardcoded string `"Unable to load pages."` with no interpolation of the API error message into the DOM. This correctly avoids any XSS risk from a malformed API error response being rendered as HTML.

### 3.8 No Leakage via Other Access Paths

**Result: PASS — low residual risk noted**

The public `GET /pages/:slug` route also uses `findPublishedBySlug`, which enforces the
published predicate. The `PageDetail` shape returned for individual pages includes
`status`, `publishedAt`, `currentRevisionId`, `createdByUserId`, and `summary`, which
are informational but not security-sensitive. `createdByUserId` is a UUID (not a username
or email), consistent with how the blog module handles authorship on public surfaces.

Drafts cannot be reached by guessing slugs via `GET /pages/:slug` because
`findPublishedBySlug` includes `status: "published"` in the `findOne` where clause.
The controller converts a null result to `NotFoundException`, so the HTTP response is
`404` for any unpublished or nonexistent slug — timing-attack risk is negligible since
the DB query is identical for both cases (same WHERE clause, same index used).

### 3.9 Body Sanitization for Admin Write Surfaces

**Result: PASS — out of primary scope, confirmed correct**

Not the primary focus of this subtask (sanitization was part of earlier milestones), but
confirmed: `validateMarkdownBody` and `normalizeMarkdownBody` are called in `create()`,
`update()`, and `restoreRevision()`. Service-level tests cover `<script>`, `onclick=`,
`javascript:`, and `<iframe>` cases. This prevents unsanitized markdown from reaching
the database and subsequently being rendered to public users via `MarkdownRenderer`.

---

## 4. Test Coverage Assessment

Test coverage is **sufficient** for the security-sensitive behaviors:

| Concern | Coverage |
|---|---|
| `status='published'` passed to repository | Operator-pinned query test (vi.fn capture) |
| Draft pages never returned | Negative test: stub returns empty, result asserted empty |
| Payload excludes body | Source-contract test on `toSummary` and `PageSummary` interface |
| `listPublishedPages` has no credentials | Source-contract test (string search on function body) |
| `listPublishedPages` hits `/pages` not `/admin/pages` | Source-contract test |
| Page index route has no admin calls | Source-contract test |
| Admin access control (all non-admin roles) | 4 negative unit tests (user, moderator, empty, unknown) |
| Reserved slugs rejected at create and update | 11-entry exhaustive loop + individual named tests |
| Reserved slugs mirrored on client-side catch-all | Source-contract test with 11-entry loop |
| URL encoding in Link hrefs | Source-contract test: `encodeURIComponent(page.slug)` |
| Error state renders safe hardcoded string | Source-contract test: `"Unable to load pages"` present |

One gap that is not security-critical: there is no integration test confirming that
a draft page is invisible at the HTTP layer (end-to-end from request to 200 body).
However, the combination of operator-pinned unit tests on the predicate and the
source-contract tests on the controller/service path provides strong confidence that
the predicate is applied correctly. The gap does not constitute a blocking finding.

---

## 5. Documentation Assessment

`docs/features/pages.md` correctly documents:
- `GET /api/pages` as a public (no auth) endpoint returning `{ pages: PageSummary[] }`,
  ordered by title ascending.
- `PageSummary` defined as `slug, title, updatedAt` with explicit note that body is omitted.
- Status lifecycle and the `status = "published"` filter semantics.
- Reserved slug list and enforcement on both server and client sides.
- `/pages` web surface with loading, empty, and error states.

`docs/features/web-shell.md` correctly lists `/pages` as a public route with a link to
the pages feature doc.

No documentation gaps identified that would affect safe operation.

---

## 6. Summary

All five acceptance criteria are satisfied with no security-blocking findings. The
published-only predicate is enforced at the database query layer. The public payload is
minimal (slug, title, updatedAt only). No credentials are forwarded from the web route.
Reserved slugs are mirrored correctly on both server and client sides. Error states render
safe hardcoded strings. Admin write surfaces remain correctly gated behind session and
role checks.

**Outcome: PASS**

No blocking findings. No conditional findings. One informational observation noted below.

**Observation (informational):** The `PageDetail` shape returned by `GET /pages/:slug`
includes `createdByUserId` (a UUID). This is consistent with the blog module's public
detail response. The value does not expose a username or email address, so it is low-risk.
If a future product decision requires stricter minimization of public detail responses,
this field could be omitted or replaced with a display name from a separate profile lookup.
This is out of scope for subtask-6 and does not block the current changeset.
