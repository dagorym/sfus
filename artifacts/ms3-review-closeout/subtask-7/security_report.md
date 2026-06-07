# Security Report — ms3-review-closeout/subtask-7

## Review scope and activation
- **Task:** `ms3-review-closeout/subtask-7` — publication filtering for authenticated
  navigation (non-admin callers).
- **Why specialist review was required:** the plan (`plans/ms3-review-closeout-plan.md`,
  Subtask 7, decision D7) marks this subtask security-review-required: it changes
  publication-visibility behavior on an authenticated surface. It closes WARNING 1 of the
  WA1 retroactive security review
  (`artifacts/ms3-landing-refresh-and-review-followups/subtask-3/security_report.md`):
  `findForAuthenticatedUser` applied no linked-target publication filtering, so nav items
  pointing at unpublished pages/posts were served to ANY authenticated user — and with
  open self-registration, any visitor could register and learn the existence, slug, and
  label of unpublished content (metadata only; content itself still 404s).
- **Plan/acceptance reference:** `plans/ms3-review-closeout-plan.md` Subtask 7 acceptance
  criteria and security acceptance criterion ("no unauthenticated or non-admin
  authenticated caller can learn the existence, slug, or label of unpublished content
  through any navigation endpoint"; admin response unchanged; `findPublic` unchanged).
- **Reviewed surface** (full chain diff `d4b3e8b..HEAD`, merge-base with `ms3-claude`):
  - `apps/api/src/navigation/navigation.service.ts` — `findForAuthenticatedUser`
    non-admin filtering block (lines 135–141) and updated JSDoc (lines 109–113);
    helpers `filterByLinkedTargetVisibility` (305–313) and
    `isLinkedTargetPubliclyVisible` (327–366) confirmed unchanged.
  - `apps/api/src/navigation/navigation.service.test.ts` — 16 new tests
    (lines 583–832) + 2 updated AC3 tests (538–581).
  - `docs/README.md` — authenticated-navigation endpoint description (line 416).
  - Context: `apps/api/src/navigation/navigation.controller.ts` (trust boundary),
    `apps/api/src/authorization/authorization.service.ts` (`hasGlobalRole`, `roleRank`),
    `docs/deferred-tasks.md` (D9 register entries), upstream verifier report
    (`artifacts/ms3-review-closeout/subtask-7/verifier_report.md`) and the originating
    WA1 security report.
- **Review lens:** completeness of the authenticated-surface leak closure across every
  navigation endpoint; admin-bypass correctness and fail direction for unknown/lesser
  roles; parity with the public-path classifier; predicate-pinning adequacy (WA1
  WARNING 2); side channels (timing, response-shape, caching); DoS delta.

## Security assessment

### The fix is correct, minimal, and fails closed
`findForAuthenticatedUser` (`navigation.service.ts:117-145`) now applies, for non-admin
callers only, exactly the two existing public-path helpers: children are filtered through
`filterByLinkedTargetVisibility` and a top-level item is skipped (`continue`, never
pushed) when `isLinkedTargetPubliclyVisible` returns false. The helpers are reused
verbatim — byte-identical classification to `findPublic` (reserved slugs, `/blog/<slug>`
with `status="published"` + `publishedAt <= now`, `/pages/<slug>` and canonical
`/<slug>` with `status="published"`, external/static passthrough). No new
URL-classification logic was added, so the edge-input fail-direction analysis from the
WA1 report (trailing slash, query/fragment suffixes, encoded separators, empty segments,
case variants — all fail-closed) carries over to the authenticated surface unchanged.

### All navigation endpoints are now covered (security AC 1 — met)
- `GET /api/navigation/items/public` → `findPublic` (unchanged in this diff; verified no
  hunks touch it) — already filtered.
- `GET /api/navigation/items/authenticated` → `findForAuthenticatedUser` — now filtered
  for every non-admin caller. The controller derives the role exclusively from
  `resolveSession(...).user.globalRole` (`navigation.controller.ts:66-69`); 401 without a
  session; no caller-supplied role input.
- `GET /api/navigation/admin` (and all management routes) → gated by
  `assertAdminManagementAccess`, which requires global admin rank; moderators (rank 1 <
  admin rank 2) are rejected — pinned by an existing test.

No other read path over `navigation_items` exists. An unpublished-target nav item is now
indistinguishable from a nonexistent one on every non-admin surface (same omission, same
indexed point query whether the row matches or not — no meaningful timing or
response-shape oracle).

### Admin bypass is scoped exactly as intended (security AC 2 — met)
The bypass keys solely on `hasGlobalRole(actorGlobalRole, "admin")` (rank ≥ 2).
Moderators and users are filtered; a null/unknown/garbage role yields
`actorRank === undefined → false` → treated as non-admin → filtered — **fail-closed for
every role outside the known set**. Admin callers skip the block entirely; the tests pin
this with the strongest available assertion (`blogFindOne`/`pageFindOne`
`not.toHaveBeenCalled()` for admin callers, both top-level and children), confirming the
staging/nav-management view is byte-for-byte the pre-change behavior. No privilege
escalation path: the bypass grants visibility of admin-authored metadata only, to a role
that already has full nav management and `findAll` access.

### `findPublic` and the public endpoint unchanged (security AC 3 — met)
The chain diff contains no hunk in `findPublic`, the controller, the reserved-slug set,
or either helper. Independent confirmation: the public-path tests in the suite still pass
unmodified (53/53 re-run in this worktree).

### WA1 WARNING closure — both confirmed closed
1. **Authenticated-nav metadata leak (WA1 WARNING 1): CLOSED** by the code change above;
   covered by 16 new tests including the two highest-value abuse cases — a
   `visibility="authenticated"` item with an unpublished target is omitted for non-admin
   callers, and child items with unpublished blog targets are stripped while published
   siblings remain.
2. **Unpinned published-only predicate (WA1 WARNING 2): CLOSED.** Predicate-pinning tests
   assert the actual `where` clause passed to `findOne`: `status: "published"` + `slug`
   for both the blog and page lookups, and `publishedAt` present as a defined object for
   blog. Because both `findPublic` and `findForAuthenticatedUser` route through the
   single shared helper `isLinkedTargetPubliclyVisible`, these pins protect the public
   path's predicate too — a regression dropping the status condition now fails the suite
   regardless of entry point. (Residual operator-shape nuance: NOTE 1.)

### No injection, no new DoS surface, no caching hazard
All lookups remain parameterized TypeORM `findOne` calls with structured `where` objects.
The bounded per-item N+1 now also runs on the authenticated path — already recorded with
exactly that scope in `docs/deferred-tasks.md` (line 18: "public (and, post-closeout,
authenticated) nav paths"), so the deferred-register obligation from D9 is satisfied. The
authenticated endpoint sets no cache headers and the API has no shared-cache layer, so
the now role-dependent response body introduces no cache-poisoning/cross-serving concern.

## Findings

### BLOCKING
- None.

### WARNING
- None.

### NOTE
1. **`publishedAt` pin is shape-only, not operator-pinned.**
   `navigation.service.test.ts:613-630` asserts the blog `where.publishedAt` is a defined
   object but not that it is specifically a `LessThanOrEqual` FindOperator bounded at
   "now". A regression swapping the operator (e.g. to `MoreThanOrEqual` or
   `Not(IsNull())`) would still pass, re-opening only the narrow future-scheduled-post
   window. The plan's subtask-8 tester guidance already requires operator-level
   `LessThanOrEqual` assertions on the blog side; recommend mirroring that assertion
   style here in a future test pass. Low likelihood, low impact; no action required for
   this subtask.
2. **Verifier note "no explicit moderator-role test" — assessed: no security
   significance beyond a minor coverage nicety.** The tests construct the service with
   the **real** `AuthorizationService`, the rank table pins moderator (1) below admin
   (2), unknown roles fail closed, and the existing
   `assertAdminManagementAccess`-throws-for-moderator test already pins moderator < admin
   on the management side. By inspection moderators receive publication filtering. An
   explicit `findForAuthenticatedUser("moderator")` omission test would make the
   moderator read-side contract regression-proof; recommend adding opportunistically.
3. **Verifier note "no parent-visible-but-all-children-filtered edge test" — assessed: no
   security significance.** Both plausible failure modes of that path (parent wrongly
   omitted, or empty `children` array) over-filter or shrink the response; neither can
   disclose unpublished metadata. Correct by inspection (children reassignment and the
   parent visibility check are independent). Coverage nicety only.
4. **Authenticated/admin divergence is now a documented contract.** The admin bypass means
   the same endpoint returns different item sets by role; `docs/README.md:416` states
   this explicitly (helpers named, guarantee and bypass both described), which is the
   right operational posture. Any future role added between moderator and admin must
   decide its side of this line deliberately — the rank-based check defaults it to
   filtered (safe).
5. **Per-item lookups on the authenticated surface** (bounded N+1, indexed point queries,
   admin-bounded item count) — properly tracked in `docs/deferred-tasks.md`; restated for
   completeness only. No action.

## Test sufficiency assessment
**Sufficient for the security-sensitive behavior.** Independently re-run in this
worktree: `vitest run src/navigation/navigation.service.test.ts` → **53/53 pass**. The
16 new tests cover every classifier branch from the non-admin authenticated entry point
(unpublished/published blog, page, canonical `/<slug>`; reserved slugs; external links),
children filtering, the `visibility="authenticated"` × unpublished-target abuse case,
and the admin bypass with repo-not-called assertions. Predicate pins close WA1
WARNING 2 at the shared-helper level. The two pre-existing AC3 test updates (reserved
slugs) are behavior-preserving isolation fixes, not assertion weakening. Residual gaps
(NOTES 1–3) are minor and none has blocking security significance.

## Documentation sufficiency assessment
**Sufficient.** `docs/README.md:416` accurately states the non-admin publication-
filtering guarantee (existence/slug/label non-disclosure), names the enforcing helpers,
and describes the admin bypass and its rationale; the method JSDoc
(`navigation.service.ts:109-113`) matches the implementation. The deferred-tasks register
already reflects the authenticated-path N+1 scope. Nothing in the docs encourages
insecure operation.

## Outcome
- **Final outcome: PASS**
- **Basis:** all three security acceptance criteria are met with margin — every
  navigation endpoint now withholds unpublished-content metadata from unauthenticated and
  non-admin authenticated callers with fail-closed classification identical to the public
  surface; the admin staging view is provably unchanged (repo-not-called assertions);
  `findPublic` is untouched. Both WA1 WARNINGs for this surface are confirmed closed.
  Zero blocking and zero warning findings; five informational notes, none requiring
  action before merge.
