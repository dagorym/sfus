# Verifier Report

## Scope Reviewed

- **Implementer change** (commit 8ef1f2f): `apps/api/src/navigation/navigation.service.ts` — `findForAuthenticatedUser` extended with a `if (!isAdmin)` block that calls `filterByLinkedTargetVisibility(item.children)` and `isLinkedTargetPubliclyVisible(item)` for non-admin callers, mirroring `findPublic`. Admin callers skip the block entirely. JSDoc updated to document the non-admin publication-filtering guarantee.
- **Tester change** (commit 9427a23): `apps/api/src/navigation/navigation.service.test.ts` — 16 new tests added covering non-admin publication filtering for blog posts, standalone pages, canonical `/<slug>` routes, reserved slugs, external links, children, admin bypass, and authenticated-visibility items. 2 pre-existing AC3 tests updated: URLs changed from non-reserved single-segment slugs to reserved slugs so the visibility-focused tests pass without requiring page/blog repository mocks.
- **Documenter change** (commit 526fa27): `docs/README.md` — the `GET /api/navigation/items/authenticated` endpoint description extended with the non-admin publication-filtering guarantee (helper names, behavior, admin bypass).

## Acceptance Criteria / Plan Reference

- **Governing plan**: `plans/ms3-review-closeout-plan.md`, Subtask 7 (publication filtering for authenticated navigation, non-admin callers).
- **Evaluation source**: Plan acceptance criteria AC1–AC5 and security criterion AC4.

## Convention Files Considered

- `AGENTS.md` (single source of truth for workflow policy)
- `docs/README.md` (canonical API-contract reference)

## Independent Verification

All claimed test outcomes were re-run from the verifier worktree:

- `npx pnpm@10.0.0 -C <verifier-worktree> install` — completed without error.
- `npx pnpm@10.0.0 -C <verifier-worktree> --filter @sfus/api exec vitest run src/navigation/navigation.service.test.ts --reporter verbose` — **53/53 tests pass**.
- `npx pnpm@10.0.0 -C <verifier-worktree> --filter @sfus/api exec vitest run` — **297 pass, 2 skipped (integration), 0 failed**.
- `npx pnpm@10.0.0 -C <verifier-worktree> --filter @sfus/api typecheck` — **pass**.
- `npx pnpm@10.0.0 -C <verifier-worktree> --filter @sfus/api lint` — **pass**.

## Findings

### BLOCKING

None.

### WARNING

None.

### NOTE

- `apps/api/src/navigation/navigation.service.test.ts:556-568` — The "includes all children for admin users" test at line 556 uses `url: "/view"` for the public child and `url: "/section"` for the parent. These are non-reserved single-segment slugs. Because this test uses the admin role (which bypasses publication filtering), no DB lookup is triggered and the test passes correctly. However, the comment on this test does not explain why these non-reserved slugs are safe for admin tests (unlike the analogous non-admin tests which have explicit comments). Minor consistency gap — the test is correct; only the comment is absent. No delivery risk.

- `apps/api/src/navigation/navigation.service.test.ts` — There is no explicit test for a moderator-role caller (expected to be treated as non-admin and receive publication filtering). The `hasGlobalRole("moderator", "admin")` returns `false` by rank comparison (rank 1 < rank 2), so by code inspection moderators receive publication filtering. The absence of an explicit test is a minor coverage gap for a role that exists in the system. No blocking risk since the logic is correct.

- `apps/api/src/navigation/navigation.service.test.ts` — There is no test for the scenario where all children of a non-admin item are filtered out by publication filtering but the parent's own target is visible. In this case the parent should appear with an empty children array. This is correct by code inspection (children mutation and parent visibility check are independent) but is an untested edge case. No blocking risk.

## Test Sufficiency Assessment

The 16 new tests provide strong coverage of the security-critical paths:

- Both `findPublic` classifier paths are covered for `findForAuthenticatedUser` (blog, page, canonical top-level, external, reserved, multi-segment static).
- Admin bypass is confirmed by asserting that the blog and page repositories are NOT called (`not.toHaveBeenCalled()`) when the caller is admin — this is the strongest possible assertion short of integration tests.
- Predicate-pinning tests confirm `status: "published"`, `slug`, and `publishedAt` (as a defined object) are present in the blog query, and `status: "published"` and `slug` are present in the page query. This directly addresses the security review WARNING 2 requirement.
- Children filtering and admin children bypass are both covered.
- Authenticated-visibility item behavior (include with published target, omit with unpublished target) is covered.
- The 2 pre-existing test URL changes are appropriate: they switch from non-reserved single-segment slugs (which now trigger publication lookups) to reserved slugs (which pass without DB queries), isolating the visibility-focused tests from the publication filter.

Coverage is assessed as **sufficient** for the acceptance criteria. The three noted gaps (moderator role, empty-children-after-publication-filter, admin test comment) are minor observations with no delivery or security risk.

## Documentation Accuracy Assessment

The `docs/README.md` update is accurate and complete:

- Correctly names the two helper functions (`NavigationService.isLinkedTargetPubliclyVisible` and `filterByLinkedTargetVisibility`).
- Accurately describes which callers are affected (non-admin callers).
- Accurately describes the admin bypass (admin callers receive all items without linked-target publication filtering).
- Correctly states the security guarantee (preventing authenticated non-admin users from learning the existence, slug, or label of unpublished content).
- The description is consistent with the implementation and the tests.

No duplicate, contradictory, or stale documentation was found.

## Verdict

**PASS**

All five acceptance criteria (AC1–AC5) and the security criterion (AC4) are satisfied. The implementation is logically correct, reuses existing helpers verbatim per plan specification, applies the admin bypass correctly, and is fail-secure. Test coverage is sufficient with predicate-pinning assertions directly addressing the security review requirements. Documentation accurately reflects the implemented and tested behavior. No blocking or warning findings are raised.

A specialist Security stage follows this pass per plan policy; the three notes above are offered as additional context for that stage.
