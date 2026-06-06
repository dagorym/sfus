# Security Report

> **RETROACTIVE REVIEW.** This specialist security review is being performed after the
> subtask was implemented, tested, documented, verified, and merged onto `ms3-claude`.
> The plan marked subtask-3 "Security review required: yes", but the specialist stage was
> skipped during execution; the final reviewer flagged the omission as a WARNING
> (`artifacts/ms3-landing-refresh-and-review-followups/final-review/reviewer_report.md`,
> WARNING 4) and requested a retroactive run. This report closes that obligation.

## Review scope and activation
- **Task:** `subtask-3` — Navigation publication-leak fix for top-level page links.
- **Why specialist review was required:** `plans/ms3-landing-refresh-and-review-followups-plan.md`
  marks Subtask 3 security-review-required because it closes a publication-leakage edge case:
  unpublished/draft standalone pages must not leak through public navigation when linked via
  the canonical top-level `/<slug>` route.
- **Plan reference:** `plans/ms3-landing-refresh-and-review-followups-plan.md` (Subtask 3,
  lines 94–106; implementer prompt lines 282–312).
- **Reviewed surface:**
  - `apps/api/src/navigation/navigation.service.ts` (especially `isLinkedTargetPubliclyVisible`, lines 302–353, and `findPublic`, lines 77–98)
  - `apps/api/src/pages/pages.service.ts` (`RESERVED_PAGE_SLUGS`, lines 16–27; slug validation, lines 335–345; `findPublishedBySlug`, lines 91–94)
  - `apps/api/src/pages/entities/standalone-page.entity.ts` (status/publishedAt model)
  - `apps/api/src/navigation/navigation.controller.ts` (public endpoint trust boundary)
  - `apps/api/src/navigation/navigation.service.test.ts` (publication-filtering coverage, lines 342–491)
  - `apps/web/components/navigation.tsx` (client-side safe `[]` fallback, lines 27–39)
  - `docs/README.md` navigation section (lines 405–413, 432–449)
  - Upstream artifact chain under `artifacts/ms3-landing-refresh-and-review-followups/subtask-3/`
    and the final reviewer report under `.../final-review/`.
- **Review lens:** publication/visibility leakage through public navigation; trust boundaries
  of the public navigation endpoint; fail-direction of slug classification under edge inputs;
  completeness of the published-only predicate; query construction safety; DoS characteristics
  of per-item lookups.

## Security assessment summary
- **The fix is correct for its scoped surface and fails closed.** `findPublic()` (the only
  guest-reachable navigation read, `GET /api/navigation/items/public`) filters every internal
  top-level item and child through `isLinkedTargetPubliclyVisible`. A single-segment,
  non-reserved URL (e.g. `/about`) is now resolved against `standalone_pages` with
  `status = "published"`; when no published row matches, the item is omitted
  (`apps/api/src/navigation/navigation.service.ts:337-349`). The pre-existing `/blog/<slug>`
  (status + `publishedAt <= now`) and `/pages/<slug>` (status) filters are intact
  (lines 319–336), and the client-side safe `[]` fallback is untouched
  (`apps/web/components/navigation.tsx:27-39`).
- **Edge-input fail-direction is safe.** I traced the regex classification
  (`/^\/([^/]+)\/?$/` with the `/blog/`, `/pages/` matchers tried first) against adversarial
  shapes:
  - Trailing slash (`/about/`): matched, looked up, filtered correctly.
  - Query/fragment suffixes (`/about?x=1`, `/about#f`): the suffix is absorbed into the slug
    capture, the DB lookup finds no published page (page slugs are constrained to
    `^[a-z0-9]+(?:-[a-z0-9]+)*$` at creation), and the item is **omitted** — fail-closed.
  - Percent-encoded separators (`/about%2Fus`, `/about%20us`): same — no slug can match,
    item omitted, fail-closed.
  - Empty segments (`//`, `/pages//`): match nothing and fall to the static-route
    `return true` — these cannot address a standalone page in the web router, so nothing
    publication-gated is disclosed.
  - Case variants (`/About`): `RESERVED_PAGE_SLUGS.has()` is case-sensitive so `/About` is
    looked up as a page slug; whether the DB collation is case-sensitive or not, a match can
    only ever be a `status = "published"` row, so no unpublished content can leak; a non-match
    omits the item (fail-closed availability quirk only).
  - Multi-segment paths (`/foo/bar`): always-shown static fallback; the web app has no
    multi-segment page-content routes other than `/blog/<slug>` and `/pages/<slug>`, which are
    matched and filtered earlier, so the fallback cannot expose publication-gated content.
- **Predicate completeness is correct today.** Standalone pages have no scheduled-publish
  dimension: `PagesService.publish()` sets `publishedAt = now` at publish time, and the public
  page surface `findPublishedBySlug` filters on `status = "published"` only
  (`apps/api/src/pages/pages.service.ts:91-94`). The navigation predicate
  (`{ slug, status: "published" }`) therefore exactly matches the public page surface — there
  is no `publishedAt <= now` dimension to enforce for pages (unlike blog posts, where the nav
  filter correctly enforces it). If scheduled publishing is ever added for standalone pages,
  the nav predicate and `findPublishedBySlug` must change together (note 4).
- **No injection risk.** All lookups use TypeORM `findOne` with structured `where` objects
  (parameterized); no string-built SQL anywhere in the changed surface.
- **Trust boundary of the public endpoint is sound.** `GET /api/navigation/items/public`
  takes no caller input (no params, no body); the only attacker-influenceable inputs to the
  classification logic are admin-authored nav-item URLs, which sit behind
  `assertAdminManagementAccess` (admin global role). Filtering is enforced server-side in the
  service, not in the client.

## Findings

### BLOCKING
- None.

### WARNING
1. **Authenticated navigation surface bypasses the linked-target publication filter.**
   `findForAuthenticatedUser` (`apps/api/src/navigation/navigation.service.ts:111-132`)
   applies visibility/active filtering only — it never calls
   `filterByLinkedTargetVisibility`/`isLinkedTargetPubliclyVisible`. A public-visibility nav
   item pointing at a draft/unpublished standalone page (or unpublished blog post) is hidden
   from guests but served to **any authenticated user** via
   `GET /api/navigation/items/authenticated`. Self-registration is open, so this boundary is
   weak: any visitor can register and observe the existence, slug, and admin-chosen label of
   unpublished content. Impact is metadata-existence disclosure only — the page content itself
   still 404s for non-admins (`PagesController` serves only `findPublishedBySlug` publicly and
   gates everything else behind the admin role) — and this asymmetry predates this subtask for
   the `/blog/<slug>` and `/pages/<slug>` patterns too (the plan scoped subtask-3 to *public*
   navigation, so this is not a defect in the delivered change). Recommended planner follow-up:
   apply the same linked-target filtering in `findForAuthenticatedUser` for non-admin callers
   (admins should continue to see everything). **Code change needed (follow-up plan, not this
   subtask).**
2. **Tests do not pin the published-only query predicate.**
   The publication-filtering tests (`apps/api/src/navigation/navigation.service.test.ts:362-460`)
   use fully mocked repositories whose `findOne` return value is fixed regardless of the
   `where` argument. None of the tests assert that `findOne` was called with
   `status: "published"` (or, for blog, `publishedAt: LessThanOrEqual(now)`). A regression
   that drops the status condition from the lookup — silently turning the filter into
   "any page with this slug exists" and re-opening the draft-leak — would still pass the
   entire suite. Recommended: tighten the omit/include tests to assert the `where` clause
   passed to `findOne` (mirrors the subtask-4 tester guidance that was applied on the blog
   side). **Test change needed (follow-up); no product-code change.**

### NOTE
1. **Per-item sequential DB lookups on an unauthenticated endpoint (bounded N+1).**
   `findPublic()` performs up to one `findOne` per internal top-level item and per child on
   every request (`navigation.service.ts:84-96, 292-300`), with no caching; the new `/<slug>`
   branch adds one more lookup class. Amplification is bounded by the admin-created item count
   (small in practice) and each lookup is an indexed unique-slug point query, so this is not an
   exploitable DoS vector today. If navigation grows or traffic warrants, batch the slugs into
   one `IN (...)` query per table or cache the public nav response. No change required now.
2. **`validateUrl` accepts arbitrary strings for nav URLs (pre-existing, outside the diff).**
   `navigation.service.ts:265-272` checks only non-empty and ≤512 chars; an admin can store
   protocol-relative (`//host`) or scheme-bearing values on an `internal` item. Such values
   bypass the publication classifier (fail-open to "static route") and are rendered by the web
   shell. The input is admin-only, so this is a hardening observation, not a vulnerability:
   consider requiring internal URLs to match `^/`. No change required for this subtask.
3. **Known item (do not re-report): bare `/pages` URL edge.** A nav URL of exactly `/pages`
   falls through to the top-level matcher, `pages` is not in `RESERVED_PAGE_SLUGS`, and the
   item is silently omitted unless a published page with slug `pages` exists. Fail direction
   is closed (nothing leaks). Already tracked and being fixed by
   `plans/ms3-review-closeout-plan.md` subtask-5 (adds `pages` to `RESERVED_PAGE_SLUGS`).
4. **Future-proofing the predicate pair.** Standalone pages currently have no scheduled
   publishing, so `status = "published"` is the complete public-visibility predicate and the
   nav filter matches `findPublishedBySlug` exactly. If a `publishedAt`-in-the-future state is
   ever introduced for pages, both predicates must be updated in lockstep or the nav filter
   becomes a pre-announcement leak. Worth a code comment when that feature is planned; no
   change now.
5. **Known item (accepted): `deriveUniqueSlug` TOCTOU** in the blog service is recorded as an
   accepted characteristic in the final reviewer report; referenced here only for completeness.

## Trust-boundary and leakage-specific review
- **Trust boundaries:** the public endpoint takes no caller input; classification operates on
  admin-authored URLs only; all filtering is server-side. No new client-side trust assumption.
- **Authorization:** unchanged — admin management routes still require session + global admin
  role via `assertAdminManagementAccess`.
- **Leakage:** the guest surface now omits items linking to unpublished pages by `/pages/<slug>`
  **and** `/<slug>`; the change strictly narrows the public surface. Residual leakage is
  limited to the authenticated-surface metadata gap (WARNING 1).
- **Fail direction:** every ambiguous single-segment input resolves to "omit" (fail-closed);
  the always-show fallback covers only paths that cannot address publication-gated content.
- **Injection / unsafe query construction:** none — parameterized TypeORM `where` objects.
- **Unsafe defaults:** none introduced; `RESERVED_PAGE_SLUGS` passthrough is safe because page
  creation rejects reserved slugs, so a reserved slug can never name real page content.
- **DoS:** bounded N+1 noted above; not exploitable by unauthenticated callers beyond ordinary
  request-rate pressure.

## Test sufficiency assessment
- **Overall: sufficient for the delivered acceptance criteria; one security-relevant gap.**
  `navigation.service.test.ts` directly exercises the leak cases: unpublished `/<slug>` omitted
  (line 434), published `/<slug>` included (line 447), reserved-slug passthrough (line 423),
  unpublished `/pages/<slug>` omitted (line 387), unpublished `/blog/<slug>` omitted
  (line 376), external links unaffected (line 413). 36/36 pass; the 6 `navigation.controller.test.ts`
  failures are a pre-existing cwd-path defect unrelated to this change.
- **Gap (WARNING 2):** mock-only tests do not assert the `status: "published"` (and blog
  `publishedAt`) conditions in the actual query, so the central security predicate is not
  pinned against regression. Minor additional gaps already recorded by the verifier (no
  dedicated test for the multi-segment fallback or the bare `/pages` edge) are low-risk and
  the latter is covered by the closeout plan.

## Documentation sufficiency assessment
- **Sufficient for safe operation.** `docs/README.md:407-412` documents the full filtering
  rule set for `GET /api/navigation/items/public`, including the `/<slug>` rule, the
  enumerated `RESERVED_PAGE_SLUGS`, and the fallback; the method JSDoc
  (`navigation.service.ts:302-313`) matches the implementation; the `navigation_items`
  migration attribution is corrected to `1748736000000-milestone-three-content-foundation.ts`
  (`docs/README.md:434`). The verifier's wording note on the fallback description (line 412)
  is cosmetic. Nothing in the docs encourages insecure operation.

## Outcome
- **Final outcome:** CONDITIONAL PASS
- **Basis:** the delivered fix meets its acceptance criteria, strictly narrows the public
  surface, fails closed on all examined edge inputs, and introduces no injection or
  exploitable DoS path. Two warnings require planner follow-up (neither blocks safe operation
  of the merged change): the authenticated-navigation publication-filter gap (metadata-only
  disclosure to self-registered users) and the unpinned published-only query predicate in the
  test suite.
