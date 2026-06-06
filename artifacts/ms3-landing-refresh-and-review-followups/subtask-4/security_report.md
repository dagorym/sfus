# Security Report

> **RETROACTIVE REVIEW.** Subtask 4 was marked "Security review required: yes" in
> `plans/ms3-landing-refresh-and-review-followups-plan.md`, but the specialist security
> stage was skipped during execution. The final reviewer flagged the omission as a
> WARNING (`artifacts/ms3-landing-refresh-and-review-followups/final-review/reviewer_report.md`,
> WARNING 4) and requested a retroactive run. This review evaluates the already
> implemented, tested, verified, and merged work on branch `ms3-claude` after the fact.
> No product code or tests were modified by this review.

## Review scope and activation
- **Task:** `ms3-landing-refresh-and-review-followups` / `subtask-4` — Blog `listComments` future-scheduled visibility fix.
- **Why specialist review was required:** the plan marks subtask-4 security-sensitive for "publication leakage / public-surface consistency for scheduled posts" — the public comments route's UUID fallback disclosed the existence of future-scheduled posts (200 + empty comments) instead of returning 404 like every other public surface.
- **Plan reference:** `plans/ms3-landing-refresh-and-review-followups-plan.md`, Subtask 4 (lines 108–118) and feature-level AC line 165.
- **Reviewed surface (current `ms3-claude` HEAD, implementation commit `58c14ed`, tests `aa795a6`, docs `c11335d`):**
  - `apps/api/src/blog/blog.controller.ts` — `listComments` (lines 240–258), `createComment`/`resolvePostId` (lines 264–282, 352–360), admin/moderation routes (lines 80–338).
  - `apps/api/src/blog/blog.service.ts` — `findPublishedById` (lines 124–130), `findPublished` (94–101), `findPublishedBySlug` (109–115), `unpublish` (280–289), `publishAt` (297–306), `findVisibleComments` (340–346), `createComment` (375–444).
  - `apps/api/src/blog/blog.service.test.ts` — security-regression describe block (lines 211–308) and tightened `findPublished`/`findPublishedBySlug` assertions (163–207).
  - `apps/api/src/blog/entities/blog-post.entity.ts` (column types for the injection/robustness analysis).
  - `docs/README.md` (comments-route contract, lines 247–269).
  - Upstream artifacts under `artifacts/ms3-landing-refresh-and-review-followups/subtask-4/` and the final reviewer report (WARNING 4).

## Security assessment summary

The delivered fix is correct, complete for its scope, and strictly narrows the public surface.

- **Predicate completeness on the fixed route.** `findPublishedById` (`blog.service.ts:124-130`) enforces exactly the same predicate as `findPublished` and `findPublishedBySlug`: `status: "published", publishedAt: LessThanOrEqual(now)`. The `listComments` UUID fallback (`blog.controller.ts:249-250`) now uses it, so a future-scheduled post addressed by UUID returns 404 — identical to the slug path, the post-list, and the post-detail routes.
- **No status or practical timing oracle on the GET route.** Nonexistent, draft, unpublished, and future-scheduled posts addressed by UUID all follow the identical code path on `GET /api/blog/:postIdOrSlug/comments`: slug lookup (miss) → id lookup (miss or predicate-excluded) → the same `NotFoundException("Blog post not found or not published.")`. Same query count, same message, same status. The residual difference between "PK row exists but predicate-excluded" and "no PK row" is a single indexed-lookup variance and is not realistically measurable.
- **NULL `publishedAt` fails closed.** A `status = "published"` row with `publishedAt = NULL` is excluded by `publishedAt <= now` (SQL NULL comparison yields no match), so a malformed publish state cannot leak.
- **Out-of-published transitions fail closed at query time.** `unpublish()` sets `status = "draft"` and `publishedAt = null`; the predicate is evaluated per request (no caching), so comment listing for a post that leaves the published state immediately returns 404. The `"unpublished"` status value is likewise excluded.
- **Authorization on admin/moderation comment routes is unchanged.** Every `admin/*` and `moderation/*` route still resolves the session and asserts `assertAdminManagementAccess` or `assertModerationAccess` before any data access (`blog.controller.ts:84-338`); lock/unlock-comments require moderator/admin. The fix touched none of these.
- **No injection or unsafe query construction in the id/slug fallback dispatch.** There is no string classification step at all — the raw path segment is passed to two TypeORM `findOne` calls with parameter binding; no query text is built from input. The `id` column is `char(36)` (`blog-post.entity.ts:16-17`), not a native uuid type, so an arbitrary non-UUID string compares safely (no row) rather than raising a type-cast error — no 500-based probe and no injection vector.
- **Comment payload gating.** Comments are fetched only after the post's public visibility is confirmed, and only `status = "visible"` top-level comments and visible replies are surfaced (`blog.controller.ts:254-257`, `blog.service.ts:340-346`).

## Findings

### BLOCKING
- None.

### WARNING
1. **Authenticated existence oracle remains on the adjacent `POST /api/blog/:postIdOrSlug/comments` route (pre-existing; not introduced or worsened by this subtask).**
   Evidence: `apps/api/src/blog/blog.controller.ts:352-360` — `resolvePostId` falls back to `findById` (any status) — and `apps/api/src/blog/blog.service.ts:377-384` — `createComment` then throws `ForbiddenException` ("Comments can only be added to published posts.") for a post that exists but is draft/unpublished/future-scheduled, versus `NotFoundException` for a post that does not exist. An authenticated member who knows a post's UUID can therefore distinguish "exists but not public" (403) from "does not exist" (404). UUIDs of once-published posts are publicly known (the public summary payload includes `id`), so a member can confirm that an unpublished-after-the-fact post still exists, or monitor an off-feed post's lifecycle. Exploitability is low (requires a session and a known UUID; leaks existence/state only, never content) and the 403-vs-404 split is the documented contract (`docs/README.md:253`, 269). However, it is now the only comments-family surface that deviates from the invariant this plan enforced everywhere else — that a non-public post is indistinguishable from a nonexistent one. **Recommended action for the Planner:** either align the POST route to return 404 for non-public posts (matching the GET route's fail-closed posture, with a corresponding docs/README.md contract update), or formally record the 403 distinction as an accepted, intentional behavior. A code change is recommended but is not required to accept subtask-4 itself, whose scope and acceptance criteria are fully met.

### NOTE
1. **Predicate regression tests assert key presence, not the operator type** (known — subtask-4 verifier NOTE, reaffirmed). `apps/api/src/blog/blog.service.test.ts:181-183, 204-206, 235-238` check `where` has a `publishedAt` key but not that it is a `LessThanOrEqual` FindOperator; a regression to `Equal`/`MoreThan` would pass the shape assertion. Behavioral tests (null for future-scheduled/draft) partially compensate at the mock level.
2. **No controller-level test pins the `listComments` slug-then-id fallback wiring** (known — subtask-4 verifier NOTE, reaffirmed). `blog.controller.ts:249-250` — a future edit reverting the fallback to `findById` would not be caught by the service-level suite.
3. **Slug/UUID namespace overlap in the dual lookup.** UUID strings satisfy the slug format regex (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), so an admin-created slug equal to another post's UUID would shadow the id lookup (slug is tried first). Admin-controlled input only, no trust-boundary crossing, and the shadowing post must itself satisfy the public predicate — fail-closed for visibility. Awareness only.
4. **Public comment payload includes `authorUserId`, `moderatedByUserId`, and `moderatedAt`** (`blog.controller.ts:507-522`). Pre-existing data-minimization observation outside this subtask's scope; exposing moderator identity on visible comments is a deliberate-looking design but worth a conscious decision at some point.

### Known items not re-reported (per instruction)
- `deriveUniqueSlug` check-then-insert TOCTOU (`blog.service.ts:552-572`) — recorded as an accepted characteristic by the final reviewer (DB unique constraint is the backstop).
- The remaining final-review findings already have a follow-up plan in flight (`plans/ms3-review-closeout-plan.md`), which also restates the prior subtask-4 invariant as a protected behavior (closeout plan line 179).

## Test sufficiency assessment
- **Sufficient for the risk level of the change.** The tester added a dedicated security-regression describe block (`blog.service.test.ts:211-308`) with four tests covering: query-shape verification (status + publishedAt constraint present), null for a future-scheduled post (AC1), the post returned for a genuinely public post (AC2), and null for a draft (AC3), and tightened the `findPublished`/`findPublishedBySlug` assertions to require the `publishedAt` constraint. Residual gaps are the two reaffirmed NOTEs above (operator-type assertion, controller-level fallback wiring); both are low risk because the service implementation is a single parameterized `findOne` and the DB-evaluated predicate is what matters in production. Coverage is mock-based, consistent with the rest of this suite.

## Documentation sufficiency assessment
- **Sufficient for safe operation.** `docs/README.md:249` accurately documents both lookup paths, states the full public-visibility predicate for each, and explicitly notes that draft, unpublished, and future-scheduled content returns 404 on this route, matching `GET /api/blog` and `GET /api/blog/:slug`. Line 253/269 accurately document the POST route's current 403 behavior — that documented contract is exactly what WARNING 1 asks the Planner to confirm or change.

## Outcome
- **Final outcome:** CONDITIONAL PASS
- The subtask-4 change itself fully satisfies its acceptance criteria, closes the publication-leakage vector it targeted, introduces no new risk, and strictly narrows the public surface. The conditional element is WARNING 1 — a pre-existing, adjacent existence oracle on the authenticated comment-creation route — which should be folded into the active follow-up plan (fix to 404 or record formal acceptance). No rollback or immediate remediation of the merged subtask-4 work is needed.
