# Security Report — ms3-review-closeout / subtask-5 (pass 2)

## Review scope and activation
- **Task:** `subtask-5` — Reserve the `pages` slug and pin the bare-`/pages` navigation edge.
  This is the **second specialist security pass**, reviewing the pass-2 remediation of the
  pass-1 security WARNING.
- **Why specialist review was required:** `plans/ms3-review-closeout-plan.md` marks subtask-5
  "Security review required: yes" (decision D4): the change alters publication-visibility
  classification in public navigation. Pass 2 re-reviews after a user-approved scope expansion
  fixed the web-side mirror divergence flagged by pass 1.
- **Plan / acceptance reference:** `plans/ms3-review-closeout-plan.md` subtask-5 plus the
  plan's security acceptance criteria: strictly fail-closed for content; previously reserved
  slugs and published/unpublished `/<slug>` filtering unchanged; `/blog/<slug>`,
  `/pages/<slug>`, and safe-`[]` fallback preserved.
- **Pass-1 baseline:** CONDITIONAL PASS, archived at
  `artifacts/ms3-review-closeout/subtask-5/history/pass-1-security-warning/security_report.md`
  (0 blocking, 1 warning, 4 notes).
- **Diff reviewed:** full subtask chain vs merge-base `24c7abf` on `ms3-claude`:
  - `apps/api/src/pages/pages.service.ts:22` — `"pages"` in `RESERVED_PAGE_SLUGS` (pass 1).
  - `apps/api/src/pages/pages.service.test.ts` — create/update rejection + eleven-slug
    exhaustive test (pass 1).
  - `apps/api/src/navigation/navigation.service.test.ts:434-451` — bare-`/pages` static-route
    test with `findOne` spy asserting `standalone_pages` is never queried (pass 1).
  - `apps/web/app/[slug]/page.tsx:40` — `"pages"` added to web-side `RESERVED_SLUGS`
    (pass 2, commit `e2102d6`).
  - `apps/web/app/pages/pages.spec.ts:295-314` — eleven-entry source-contract parity test
    (pass 2, commit `2719557`).
  - `docs/README.md` — eleven-slug list, bare-`/pages` static-route note, mirror-parity
    sentence (pass 1, accuracy re-checked in pass 2).
- Confirmed `apps/api/src/navigation/navigation.service.ts`,
  `apps/web/app/pages/[slug]/page.tsx`, and `apps/web/app/pages/pages-client.ts` have **no
  diff** vs merge-base.

## Pass-1 WARNING resolution — RESOLVED

Pass-1 WARNING 1 (web-side `RESERVED_SLUGS` missing `pages`; docs mirror-parity claim
inaccurate; bare `/pages` served by the `[slug]` catch-all querying `GET /api/pages/pages`)
is **fully resolved** by the pass-2 chain:

1. **Mirror restored.** `apps/web/app/[slug]/page.tsx:34-46` now lists all eleven slugs
   including `"pages"` (line 40), byte-for-byte matching the API-side `RESERVED_PAGE_SLUGS`
   set. The JSDoc mirror claim at line 32 is now true.
2. **Fail-closed short-circuit verified in source.** `isReserved` (line 56) is computed
   before the fetch effect; the effect returns early when `isReserved` (line 59), and the
   reserved branch renders a local not-found panel (lines 76-83). A bare `/pages` request —
   still served by the root catch-all, since `apps/web/app/pages/` continues to have no
   `page.tsx` (re-verified) — now produces a local not-found with **zero API traffic**,
   versus the prior behavior of issuing `GET /api/pages/pages` and relying on the API 404.
   This is strictly less data flow than before.
3. **Pass-1 sub-finding (b) closed.** A legacy `standalone_pages` row with slug `pages`
   (legal before this change), even if published, can no longer render at `/pages` and shadow
   the route prefix: the catch-all short-circuits before any fetch. Residual exposure is only
   the direct API read `GET /api/pages/pages`, which returns published-only content — not a
   leak (it is content an admin published) and not a route-shadowing vector.
4. **Drift pinned.** The new source-contract test
   (`apps/web/app/pages/pages.spec.ts:295-314`) locates the `RESERVED_SLUGS` declaration
   block in the actual source of `app/[slug]/page.tsx` and asserts each of the eleven
   entries individually. Removal or partial drift of any entry now fails the web suite.
5. **Docs now accurate.** `docs/README.md` (Slug Validation, line ~369) says "eleven slugs",
   enumerates all eleven including `pages`, and the mirror-parity sentence is now a true
   statement. The navigation-filtering section (line ~414) correctly describes the
   bare-`/pages` always-rendered static-route behavior "without consulting
   `standalone_pages`", matching `navigation.service.ts:338-344`.

## Re-assessment of pass-1 informational notes

- **NOTE 1 (prospective-only enforcement; no legacy-data sweep) — still stands, materially
  mitigated.** `assertSlugValid` still runs only on create and update-with-slug-change;
  `publish()` never re-validates. A pre-existing `pages`-slug row remains operable in admin.
  However, the pass-2 web fix removes the practical consequence: such a row can no longer
  render at `/pages` (web short-circuits) and navigation already classified bare `/pages` as
  static. The one-off deploy-time data check
  (`SELECT slug FROM standalone_pages WHERE slug IN (<reserved list>)`) remains a sensible
  ops follow-up; the pass-2 verifier carried it forward. No change in severity: NOTE.
- **NOTE 2 (bare-`/pages` nav link is a dead link web-side) — still stands, unchanged
  severity.** The API always renders an admin-authored `/pages` nav item as a static route,
  while the web now renders a deliberate not-found for it (reserved branch, rather than the
  previous API-404 path). Verified no hardcoded bare `/pages` links exist anywhere in
  `apps/web`; only admin-authored navigation can produce one. Availability/UX observation for
  nav admins only; no leakage. Becomes consistent if a `/pages` index page is ever added.
- **NOTE 3 (server-side lockstep single-sourced) — unchanged, still sound.** Navigation
  imports `RESERVED_PAGE_SLUGS` from `pages.service.ts`; the web list remains the only
  duplicate, now pinned by the parity test.
- **NOTE 4 (carried-forward items) — unchanged.** The authenticated-nav publication-filter
  gap is owned by subtask-7; the unpinned `status: "published"` predicate in mock-based nav
  tests for non-reserved branches still stands as a recorded carry-forward. Neither is
  affected by the pass-2 diff.

## Evaluation of the pass-2 diff for new concerns

- **`apps/web/app/[slug]/page.tsx`:** a single set-entry addition to an existing,
  already-exercised guard. No new input handling, no new network path, no new rendering
  branch. Over-blocking direction only (reserved → local not-found), i.e. fail-closed.
- **`apps/web/app/pages/pages.spec.ts`:** read-only source-contract test following the
  established `readAppFile` pattern; brittle only toward false failure (e.g., quote-style
  changes), which fails loud and safe.
- **No new trust boundary, secret, injection surface, or DoS vector.** The pass-2 change
  removes one unauthenticated API request per bare-`/pages` page view.

### Security acceptance criteria — all met
1. **Strictly fail-closed for content:** yes. No unpublished page becomes visible or
   resolvable; the only behavioral deltas are (API, pass 1) bare-`/pages` nav classification
   static-with-no-query, and (web, pass 2) bare-`/pages` local not-found with no query.
2. **Previously reserved slugs and published/unpublished `/<slug>` filtering unchanged:**
   yes. Both diffs are pure set additions; `navigation.service.ts` has no diff vs merge-base;
   the published-only predicates (`navigation.service.ts:324,333,347`;
   `pages.service.ts` public read) are untouched.
3. **`/blog/<slug>`, `/pages/<slug>`, safe-`[]` fallback preserved:** yes. The nav regex
   branch order is unchanged (`/blog/<slug>` then `/pages/<slug>` then top-level then `[]`
   fallback at :351-352); web `/pages/[slug]` route file is untouched; the root catch-all
   matches single segments only.

## Findings

### BLOCKING
- None.

### WARNING
- None. Pass-1 WARNING 1 is resolved.

### NOTE
1. **Carried forward (unchanged owner/severity):** prospective-only enforcement with no
   legacy-data sweep (pass-1 NOTE 1, mitigated as described above); bare-`/pages` nav item
   renders web-side not-found (pass-1 NOTE 2); authenticated-nav filter gap → subtask-7 and
   unpinned published-only predicate in mock-based nav tests (pass-1 NOTE 4). All already
   recorded; no new action required in this subtask.
2. **Parity tests are containment-style, not set-equality.** Both the web source-contract
   test and the API exhaustive-rejection test assert that each of the eleven entries is
   *present*; neither pins set cardinality, so a twelfth entry added on one side only would
   not fail either contract. Drift in that direction over-reserves (hides content — fails
   closed), so this is a robustness nicety, not a security gap.
3. **Test-count provenance.** The pass-2 verifier/tester reported 244 web / 278 API; this
   chain branch independently yields 245/245 web and 267/267 API, all green (the differing
   totals are consistent with the verifier counting against a tree containing other merged
   closeout subtasks). No failing tests in either accounting; informational only.

## Test sufficiency assessment
- **Sufficient.** API side: create rejection, update/rename rejection, eleven-slug exhaustive
  list, and the bare-`/pages` static-route case with the `findOne`-never-called spy (the
  correct fail-closed proof pattern). Web side: the new eleven-entry source-contract test
  pins the mirror, and the pre-existing catch-all source contracts ("returns a not-found
  state for reserved slugs without querying the API") now cover `pages` via the shared
  reserved branch. Independently re-ran in this worktree: `app/pages/pages.spec.ts` 67/67,
  full web suite 245/245, `pages.service.test.ts` + `navigation.service.test.ts` 78/78, full
  API suite 267/267 — all pass.

## Documentation sufficiency assessment
- **Sufficient and now accurate.** The pass-1 docs inaccuracy (mirror-parity sentence) is
  resolved by the pass-2 code change rather than a docs edit — the sentence is now true.
  Reserved-slug count, enumerated list, and the bare-`/pages` static-route note in
  `docs/README.md` all match the implementation, including the "without consulting
  `standalone_pages`" clause.

## Outcome
- **Final outcome: PASS**
- **Basis:** 0 blocking, 0 warnings, 3 notes (all informational; the substantive ones are
  carried-forward items already owned elsewhere). The pass-1 WARNING is fully resolved: the
  web mirror contains `pages`, the short-circuit is verified in source and pinned by a
  source-contract test, the legacy-row route-shadowing path is closed, and the docs parity
  claim is accurate. Every security acceptance criterion is met and the pass-2 change
  strictly reduces data flow on the affected path.
