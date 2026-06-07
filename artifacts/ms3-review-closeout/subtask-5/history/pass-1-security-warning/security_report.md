# Security Report — ms3-review-closeout / subtask-5

## Review scope and activation
- **Task:** `subtask-5` — Reserve the `pages` slug and pin the bare-`/pages` navigation edge.
- **Why specialist review was required:** `plans/ms3-review-closeout-plan.md` marks subtask-5
  "Security review required: yes" (decision D4): the change alters publication-visibility
  classification in public navigation — the same class of surface as the prior plan's
  security-marked navigation subtask
  (`artifacts/ms3-landing-refresh-and-review-followups/subtask-3/security_report.md`).
- **Plan / acceptance reference:** `plans/ms3-review-closeout-plan.md` subtask-5 (plan lines
  ~155–169 and ~414–438) plus the plan's security acceptance criteria: strictly fail-closed for
  content; previously reserved slugs and published/unpublished `/<slug>` filtering unchanged;
  `/blog/<slug>`, `/pages/<slug>`, and safe-`[]` fallback preserved.
- **Diff reviewed:** full subtask chain vs merge-base `24c7abf` on `ms3-claude`
  (commits `80d05b1` impl, `c41f73c` tests, `a9c27bc` docs):
  - `apps/api/src/pages/pages.service.ts` — one-line addition of `"pages"` to
    `RESERVED_PAGE_SLUGS` (line 22).
  - `apps/api/src/pages/pages.service.test.ts` — `pages` rejection on create (line 568) and
    update (line 577); exhaustive reserved-list test updated to eleven slugs (line 558).
  - `apps/api/src/navigation/navigation.service.test.ts` — bare-`/pages` static-route test with
    `findOne` spy asserting the `standalone_pages` repository is never queried (lines 434–451).
  - `docs/README.md` — reserved count ten → eleven; bare-`/pages` static-route note.
  - `apps/api/src/navigation/navigation.service.ts` — confirmed **no logic change** vs
    merge-base; `RESERVED_PAGE_SLUGS` is imported from `pages.service.ts` (line 9), so the
    server-side denylist remains single-sourced for both consumers.
- **Review lens:** fail direction of the visibility-classification change; reserved-slug
  enforcement completeness (create/update/publish paths); legacy-data hazards; web-side
  defense-in-depth parity; interaction with the known authenticated-nav gap (subtask-7).

## Security assessment summary
- **The change is strictly fail-closed for content (AC met).** Adding `pages` to the denylist
  only (a) restricts page creation/rename (`assertSlugValid`,
  `apps/api/src/pages/pages.service.ts:347-358`, called on create at :134 and on update at
  :196) and (b) flips the classification of a bare `/pages` internal nav URL from
  "published-page lookup" to "always-shown static route"
  (`apps/api/src/navigation/navigation.service.ts:338-344`). The only thing newly visible is
  the admin-authored nav link itself; no standalone-page content or existence metadata is
  disclosed, because the static-route branch returns `true` **without any DB query** (pinned by
  the new spy assertion) and the public page read surface remains
  `status = "published"`-only and untouched.
- **Previously reserved slugs and filtering behavior unchanged (AC met).** The diff is a pure
  set addition; the `/blog/<slug>` (status + `publishedAt <= now`) and `/pages/<slug>` (status)
  regex branches precede the top-level branch and are byte-identical to merge-base; the
  multi-segment safe-`[]`/static fallback (`navigation.service.ts:351-352`) is untouched; the
  exhaustive reserved-list test now pins all eleven entries against silent drift.
- **Edge inputs around the new entry fail closed.** `/pages` and `/pages/` → reserved static
  (shown, no lookup); `/pages/<slug>` → unchanged published-only lookup; `/Pages` → not in the
  case-sensitive set → resolved against `standalone_pages` (creation regex forbids uppercase,
  so omitted) — fail-closed; `/pages?x=1` → captured slug `pages?x=1` is not reserved and can
  match no real slug → omitted — fail-closed.
- **No new trust boundary, input path, injection surface, or DoS amplification.** The public
  endpoint still takes no caller input; classification operates on admin-authored URLs only;
  the reserved branch actually removes one DB lookup per bare-`/pages` item.
- **Interaction with known gaps:** the authenticated-nav filter gap (prior security review
  WARNING 1, scheduled as subtask-7) is neither fixed nor worsened — `findForAuthenticatedUser`
  already showed everything, so the denylist addition is a no-op there. The prior review's
  NOTE 3 ("bare `/pages` edge — being fixed by closeout subtask-5") is closed by this change.

## Findings

### BLOCKING
- None.

### WARNING
1. **Web-side reserved-slug mirror diverges, the docs parity claim is now inaccurate, and the
   verifier NOTE's "zero practical impact" rationale rests on an incorrect routing premise.**
   `apps/web/app/[slug]/page.tsx:34-45` still lists ten slugs (no `pages`), while
   `docs/README.md` (line ~369, edited by this subtask's doc commit to say "eleven") continues
   to claim "The client-side catch-all route … mirrors this list as a defence-in-depth guard."
   The pass-1 verifier NOTE assessed the divergence as zero-impact "because a request to /pages
   is served by the apps/web/app/pages/ Next.js directory route before the [slug] catch-all is
   evaluated" — but **`apps/web/app/pages/` contains no `page.tsx`** (only `pages-client.ts`,
   `pages.spec.ts`, `[slug]/`), so the App Router serves a bare `/pages` request with the
   root-level `[slug]` catch-all, `slug = "pages"`. Because the web mirror lacks `pages`, the
   catch-all does not short-circuit: it issues `GET /api/pages/pages` and relies on the API 404
   instead of the local guard. Consequences today: (a) no content leak — the public API read is
   published-only and the slug can no longer be created or renamed into existence; (b) on any
   deployment holding a **legacy** `standalone_pages` row with slug `pages` (legal before this
   change), a published such page would render at `/pages` via the catch-all, shadowing the
   very route prefix this reservation exists to protect — while navigation now unconditionally
   advertises `/pages` as a static route; (c) the docs assert a mirror property that is false,
   which future maintainers may rely on. Remediation (trivial, follow-up — web files were
   correctly outside this API-only subtask's allowed-file list): add `"pages"` to
   `RESERVED_SLUGS` in `apps/web/app/[slug]/page.tsx` and/or correct the parity sentence in
   `docs/README.md`. Fail direction for unpublished content remains closed in every branch, so
   this does not block rollout.

### NOTE
1. **Prospective-only enforcement; no legacy-data sweep.** `assertSlugValid` runs only on
   create and on update-with-slug-change (`pages.service.ts:195-198`); `publish()`
   (`pages.service.ts:252-261`) never re-validates the slug. A pre-existing page with slug
   `pages` therefore remains fully operable (editable in place, publishable) and is silently
   shadowed in navigation classification (the reserved branch wins before any lookup). No
   migration or startup check asserts `standalone_pages` contains no reserved slugs. Suggested
   ops/planner follow-up: a one-off check (`SELECT slug FROM standalone_pages WHERE slug IN
   (<reserved list>)`) at deploy time, or a register entry. Only `pages` can have legacy rows —
   the other ten entries were reserved from the feature's introduction.
2. **The bare-`/pages` "static route" the API now always renders does not exist as a page in
   the web app.** With no `apps/web/app/pages/page.tsx`, an admin-created `/pages` nav item is
   a permanently-rendered link to a not-found state (via the catch-all). This is an
   availability/UX observation for nav admins, not a leakage issue; if a `/pages` index page is
   ever added, behavior becomes fully consistent.
3. **Server-side lockstep is structurally sound.** `navigation.service.ts` imports
   `RESERVED_PAGE_SLUGS` from `pages.service.ts` rather than duplicating it, so the two API
   consumers cannot drift; the updated exhaustive test pins the list contents. The only
   duplicate is the web-side list (WARNING 1).
4. **Carried-forward items unaffected by this change (do not re-report):** the
   authenticated-nav publication-filter gap is owned by subtask-7; the unpinned
   `status: "published"` query predicate in mock-based nav tests (prior security review
   WARNING 2) still stands for the non-reserved branches — the new test's "never called" spy is
   the right pattern and partially demonstrates the fix style.

## Test sufficiency assessment
- **Sufficient for the security acceptance criteria.** Create-path rejection, update/rename
  rejection, exhaustive eleven-slug list, and the bare-`/pages` static-route case are all
  pinned; the navigation test's `expect(pageRepoFindOne).not.toHaveBeenCalled()` assertion
  directly proves the fail-closed short-circuit (classification decided before any DB access).
  Independently re-ran the API suite in this worktree: 15 files, 267/267 tests pass.
- Residual gaps are out of subtask scope: no web-side test covers the catch-all's reserved
  handling of `pages` (WARNING 1), and the published-only predicate for non-reserved branches
  remains unpinned (carried item, NOTE 4).

## Documentation sufficiency assessment
- **Accurate for the API behavior:** count, enumerated list, and the bare-`/pages`
  always-rendered note in `docs/README.md` match the implementation, including the
  "without consulting `standalone_pages`" clause.
- **One inaccuracy:** the web-mirror parity sentence (WARNING 1). Low impact, but it misstates
  a defense-in-depth layer and should be corrected alongside the one-line web fix.

## Outcome
- **Final outcome: CONDITIONAL PASS**
- **Basis:** 0 blocking, 1 warning, 4 notes. The delivered change meets every security
  acceptance criterion — strictly fail-closed for content, previously reserved slugs and
  published/unpublished filtering unchanged, `/blog/<slug>` / `/pages/<slug>` / safe-`[]`
  behavior preserved — and removes rather than adds attack surface. The warning (web-mirror
  divergence + inaccurate docs parity claim, with the verifier note's zero-impact premise
  corrected) needs a trivial follow-up but does not block safe operation of the merged change.
  This review also resolves the pass-1 verifier's only WARNING (missing specialist security
  stage).
