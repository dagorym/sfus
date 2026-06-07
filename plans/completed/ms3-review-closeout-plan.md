# Milestone 3 Review Closeout Plan

## Planner Activation
- Requested agent: `planner`
- Repository instruction source: `AGENTS.md` plus `.myteam` role/skill content loaded through `myteam`.
- Base branch: `ms3-claude` (current branch) — the in-flight Milestone 3 build to continue from. The Coordinator uses a dedicated per-plan coordination branch off `ms3-claude` per workflow policy.
- Workflow obligations being followed:
  - Stay in planning mode only; do not write implementation code.
  - Resolve material design decisions with the user before decomposition (done — see Resolved Decisions).
  - Decompose into ordered, implementation-ready subtasks with dependencies, acceptance criteria, and documentation impact.
  - Provide a launch-ready Implementer prompt per subtask.
  - Write the final plan to a unique markdown file under `plans/`.
- In-cycle planner actions already performed (the deferred-task register is edited only during planning cycles):
  - Appended the accepted blog-slug TOCTOU hardening item to `docs/deferred-tasks.md` (decision D5; reviewer NOTE on `deriveUniqueSlug`). No implementer subtask exists for it.
  - The reviewer's request to "record the admin error-envelope deferral in docs/deferred-tasks.md" is **superseded**: this plan implements that work directly (subtask-2), so no register entry is made.
  - Gap-checked every `docs/deferred-tasks.md` entry against `star_frontiers_rpg_website_design.md` (decision D6): all entries remain correctly deferred; nothing is pulled back into Milestone 3.
  - **Executed Workflow Action WA1 in-cycle at the user's direction**: the two retroactive specialist security reviews ran as `security` role agents (read-only on product code) and their artifacts are committed on `ms3-claude` (`ef9c964` for prior subtask-3, `f54c02a` for prior subtask-4). Both returned CONDITIONAL PASS; the code-change findings were folded into this plan as subtasks 7 and 8 per decisions D7 and D8, the test-tightening findings became those subtasks' tester guidance, and three informational notes were appended to `docs/deferred-tasks.md` per decision D9.

## Overview
The final reviewer pass for the prior plan returned **CONDITIONAL PASS** (`artifacts/ms3-landing-refresh-and-review-followups/final-review/reviewer_report.md`: 0 blocking, 5 warnings, 6 notes, 4 follow-up requests). This plan closes out Milestone 3 by addressing **every** warning, note, missed-functionality item, and follow-up request in that report, plus one user-reported gap: the site shell (header/footer/metadata in `apps/web/app/layout.tsx`) still says "Milestone 2". It has five threads:

1. **Site shell Milestone 3 copy.** `apps/web/app/layout.tsx` still carries three "Milestone 2" strings (metadata description line 14, header eyebrow line 29, footer line 46). The landing page body already describes Milestone 3; the shell must match.
2. **Admin error-envelope completion (reviewer WARNINGs 1–2).** The `JsonExceptionFilter` envelope nests the real message under `payload.error.message`, but all eight admin calls in `apps/web/app/pages/pages-client.ts` and fourteen calls in `apps/web/app/blog/blog-client.ts` (everything except `adminCreatePost`) still read `payload?.message`, so real server errors never surface.
3. **Transactional page creation + FK-enforced regression test (reviewer WARNINGs 3 and 5, NOTE 6).** `PagesService.create` is a sequential, non-transactional three-step save; a mid-create failure orphans a draft `standalone_pages` row and blocks slug reuse. The plan-required integration-style test against a schema with `fk_page_revisions_page_id` enforced was never written (the existing regression test mocks repositories and proves only JS call ordering — the exact test style that let the original FK bug ship).
4. **Retroactive security stage (reviewer WARNING 4) — completed in-cycle.** Prior-plan subtasks 3 and 4 were marked security-review-required but had no `security_report.md`/`security_result.json`. Per decision D3 the specialist Security stage ran retroactively **during this planning cycle**; both reviews returned CONDITIONAL PASS, the artifacts are committed, and the two code-change findings are folded in as subtasks 7 and 8: authenticated navigation applies no publication filtering (metadata leak to any self-registered user), and `POST /api/blog/:postIdOrSlug/comments` is an authenticated existence oracle (403 for existing non-public posts vs 404 for nonexistent ones).
5. **Test-suite hygiene and small edges (reviewer NOTEs 1–3, 5).** Fix the pre-existing `navigation.controller.test.ts` cwd-based path-resolution defect (6 known failures that force "pre-existing failure" hand-waving in every cycle); add login error-copy source-contract coverage; add a `serveImage` happy-path unit test; reserve the `pages` slug to close the bare-`/pages` nav-URL edge.

### Confirmed repository context
- `apps/web/app/layout.tsx:14,29,46` — the three Milestone 2 strings. `apps/web/app/public-shell.spec.ts:52-53` **asserts those exact strings**, so the tester stage must move the assertions with the copy.
- `apps/web/app/pages/pages-client.ts` — 8 error reads at lines 87, 100, 115, 130, 143, 156, 169, 185, all `payload?.message`. `apps/web/app/blog/blog-client.ts` — 15 error reads; only line 126 (`adminCreatePost`) uses the correct `payload?.error?.message || payload?.message || fallback` pattern; lines 98, 111, 141, 154, 167, 182, 195, 208, 244, 268, 281, 294, 311, 332, 348 still read `payload?.message`.
- `apps/api/src/pages/pages.service.ts:125-169` — `create()` does page-save → revision-save → page-update with no transaction; the JSDoc (lines 115-124) documents the FK-aware order but not the missing atomicity.
- `apps/api/src/pages/pages.service.test.ts:133-183` — the FK-order regression test uses fully mocked repositories (call-order assertion only).
- The API database is **MySQL** (`mysql2` + TypeORM `^0.3.28`); there are no sqlite/pg-mem/testcontainers dev dependencies. The dev stack (`cicd/docker/compose.dev.yml`) provides MySQL with the env contract `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` documented in `docs/website-launch-guide.md` (host-run hybrid: `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME=sfus`).
- `apps/api/src/navigation/navigation.controller.test.ts:7` — `path.resolve(process.cwd(), "apps/api/src/navigation/navigation.controller.ts")` doubles the path when vitest runs with `cwd=apps/api`, causing the 6 pre-existing failures under `pnpm --filter @sfus/api test` (256/262).
- `RESERVED_PAGE_SLUGS` (`apps/api/src/pages/pages.service.ts:16-27`) contains `admin, api, app, blog, login, register, onboarding, profile, settings, health` — `blog` is present, `pages` is **not**. `navigation.service.ts:314-353` treats reserved single-segment internal URLs as always-visible static routes and resolves non-reserved ones against published `standalone_pages` (bare `/pages` is therefore silently hidden unless a published page with slug `pages` exists).
- `apps/api/src/media/media.controller.test.ts:174-303` — `serveImage` has error-path coverage only (ENOENT 404, headers-sent destroy, other-I/O 500); no happy-path test asserts content type, length, and piped bytes.
- `apps/web/app/public-shell.spec.ts` asserts the register page's service-unavailable copy but not the login client's service-unavailable/credential strings (reviewer NOTE 2).
- The cicd validation contract lives in `cicd/config/validation-config.yml` (ids `workspace-test`, etc.) executed by `cicd/scripts/run-validations.sh`; docs in `cicd/docs/cicd.md` and `cicd/docs/local-pipeline.md`.
- Test invocations (from `docs/website-launch-guide.md`): `npx --yes pnpm@10.0.0 test` (workspace), `npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run <file>` (single file).

### Likely implementation surfaces
- `apps/web/app/layout.tsx`
- `apps/web/app/pages/pages-client.ts`, `apps/web/app/blog/blog-client.ts`
- `apps/api/src/pages/pages.service.ts` (+ a new integration test and small test-support helper)
- `apps/api/src/navigation/navigation.service.ts` (`findForAuthenticatedUser` filtering + JSDoc), `apps/api/src/navigation/navigation.controller.test.ts`
- `apps/api/src/blog/blog.controller.ts` (`resolvePostId`), `apps/api/src/blog/blog.service.ts` (`createComment` guard)
- `cicd/config/validation-config.yml`, `cicd/docs/*.md`, `docs/README.md`, `docs/website-launch-guide.md`

## Resolved Decisions
All material design/scope decisions were resolved with the user before decomposition.

| # | Decision | Resolution |
|---|---|---|
| Base | Branch to build on | `ms3-claude` (current branch) |
| D1 | Site shell copy | **Milestone 3 branding.** Header eyebrow → `Milestone 3 Content Platform`; footer line → `Built for the Milestone 3 content launch baseline.`; metadata description → `Blog, standalone pages, and site navigation for the Star Frontiers US Milestone 3 content platform.` The first footer line (`Star Frontiers US · Public foundation shell`) is unchanged. |
| D2 | FK integration-test infrastructure | **Env-gated real MySQL.** The integration spec connects to the dev MySQL using the documented `DB_*` env contract and an explicit opt-in flag (`SFUS_DB_INTEGRATION=1`); vitest skips it cleanly when the flag/DB is absent, and a cicd validation entry runs it with the dev DB up. No new database dependencies. |
| D3 | Missing security stage for prior subtasks 3 & 4 | **Retroactive specialist security review**, writing `security_report.md`/`security_result.json` into `artifacts/ms3-landing-refresh-and-review-followups/subtask-3/` and `subtask-4/`. Any findings that need fixes are folded back into this plan (user approves the fold-in). |
| D4 | Bare `/pages` nav-URL edge | **Reserve the `pages` slug** (add to `RESERVED_PAGE_SLUGS`) with tests and a docs note, so no standalone page can shadow the `/pages/*` route prefix and a bare `/pages` nav link is treated as a static route. |
| D5 | `deriveUniqueSlug` TOCTOU (reviewer NOTE 4) | **Leave as accepted characteristic; record as a future improvement.** Appended to `docs/deferred-tasks.md` in-cycle. No code change in this plan; the DB unique constraint remains the backstop. |
| D6 | Deferred-task pull-back check | **Nothing pulled back into Milestone 3.** All `docs/deferred-tasks.md` entries (including the three design-adjacent candidates: blog-comment attachments §5.1, standalone-page simple blocks §5.7, WYSIWYG §5.1) remain deferred. |
| D7 | Security finding: authenticated-nav unpublished-metadata leak | **Fix, filtering for non-admins** (subtask-7): `findForAuthenticatedUser` applies the same linked-target publication filtering as `findPublic` for non-admin callers; admins continue to see all items (useful for staging/nav management). |
| D8 | Security finding: comment-creation existence oracle | **Align to 404** (subtask-8): non-public posts return 404 on comment creation, indistinguishable from nonexistent posts, matching the milestone's visibility invariant; the documented 403 contract in `docs/README.md` is updated. Locked-comments 403 on public posts is unchanged. |
| D9 | Informational security notes | **Record all three** in `docs/deferred-tasks.md` (done in-cycle): public-comment payload data-minimization; nav publication-filter batching/caching if the tree grows; `validateUrl` leading-`/` hardening for internal nav URLs. |

## Reviewer-Finding Coverage Map
| Reviewer item | Disposition |
|---|---|
| WARNING 1 (pages-client envelope) | subtask-2 |
| WARNING 2 (blog-client envelope, partial) | subtask-2 |
| WARNING 3 (non-transactional create) | subtask-3 |
| WARNING 4 (missing security stage) | Workflow Action WA1 — **completed in-cycle**; artifacts committed |
| WARNING 5 (mock-only FK test) | subtask-4 |
| NOTE 1 (nav controller test cwd defect) | subtask-6 |
| NOTE 2 (login error-copy spec gap) | subtask-1 (tester stage) |
| NOTE 3 (bare `/pages` edge) | subtask-5 |
| NOTE 4 (deriveUniqueSlug TOCTOU) | accepted; recorded in `docs/deferred-tasks.md` in-cycle (D5) |
| NOTE 5 (serveImage happy-path test gap) | subtask-6 (tester stage) |
| NOTE 6 (create() JSDoc atomicity gap) | subtask-3 |
| Missed functionality items 1–3 | subtasks 2, 3, 4 and WA1 (same underlying items) |
| Follow-up request 1 | subtask-2 (+ superseded register note) |
| Follow-up request 2 | subtasks 3 + 4 |
| Follow-up request 3 | Workflow Action WA1 — **completed in-cycle**; artifacts committed |
| Follow-up request 4 | subtasks 5 + 6 |
| User item: shell still says Milestone 2 | subtask-1 |
| Security finding (WA1): authenticated-nav unpublished-metadata leak | subtask-7 (decision D7) |
| Security finding (WA1): nav publication-predicate assertions not pinned | subtask-7 (tester stage) |
| Security finding (WA1): comment-creation 403/404 existence oracle | subtask-8 (decision D8) |
| Security notes (WA1): LessThanOrEqual assertion + fallback-wiring test gaps | subtask-8 (tester stage) |
| Security notes (WA1): data-minimization, nav batching, validateUrl hardening | recorded in `docs/deferred-tasks.md` in-cycle (decision D9) |
| Security notes (WA1): slug/UUID namespace overlap, pages/nav predicate lockstep, bare-`/pages`, TOCTOU | no action needed (last two already covered: subtask-5 and the D5 register entry) |

## Subtasks

### Subtask 1: Site shell Milestone 3 copy refresh
- Stable ID: `subtask-1`
- Security review required: no (static user-facing copy only).
- Dependencies: none.
- Scope:
  - In `apps/web/app/layout.tsx`, replace the three Milestone 2 strings with the approved Milestone 3 copy (decision D1): metadata `description` → `"Blog, standalone pages, and site navigation for the Star Frontiers US Milestone 3 content platform."`; header eyebrow → `Milestone 3 Content Platform`; footer second line → `Built for the Milestone 3 content launch baseline.` Leave all other shell structure, navigation, and the first footer line unchanged.
- Acceptance criteria:
  - `apps/web/app/layout.tsx` contains no "Milestone 2" text; the three strings match decision D1 exactly.
  - No other shell behavior (navigation, layout structure, routes) changes.
  - The web app builds, lints, and typechecks clean.
- Documentation Impact: none expected; if `docs/README.md` or `docs/website-launch-guide.md` quotes the shell copy, the downstream Documenter stage aligns it.
- Tester-stage note (routine, listed for traceability): `apps/web/app/public-shell.spec.ts:52-53` asserts the old Milestone 2 strings and must be updated to the new copy; while in that file, the tester also closes reviewer NOTE 2 by adding source-contract assertions for the login client's service-unavailable and credential message strings and their status-code branching (mirroring the existing register coverage).

### Subtask 2: Complete the admin error-envelope adoption in the pages and blog clients
- Stable ID: `subtask-2`
- Security review required: no (the surfaced text is the curated `JsonExceptionFilter` envelope message already shown on the create path; no stack traces or internals are exposed).
- Dependencies: none.
- Scope:
  - In `apps/web/app/pages/pages-client.ts`, change all eight error reads (lines 87, 100, 115, 130, 143, 156, 169, 185) from `payload?.message || <fallback>` to the established envelope pattern `payload?.error?.message || payload?.message || <fallback>` (the pattern already used at `blog-client.ts:126`), keeping each call's existing generic fallback string unchanged.
  - In `apps/web/app/blog/blog-client.ts`, apply the same pattern to the fourteen remaining reads (lines 98, 111, 141, 154, 167, 182, 195, 208, 244, 268, 281, 294, 311, 332, 348) — covering update, publish, unpublish, schedule, feature-toggle, delete, and all comment/moderation calls, plus the public list/detail loads for consistency. Do not change request logic, success paths, types, or fallback texts.
- Acceptance criteria:
  - Every error read in both files resolves `payload?.error?.message` first; no `payload?.message`-only read remains in either file.
  - A failing admin action (e.g. a 400/409/500 envelope response) surfaces the envelope's `error.message` in the thrown `Error`; when the envelope is absent (network failure, non-JSON body), the existing generic fallback still appears.
  - No success-path behavior, exported types, or function signatures change.
  - The web app builds, lints, typechecks, and its test suite passes.
- Documentation Impact: none expected; if `docs/README.md` documents the admin error-surfacing behavior, the downstream Documenter stage aligns it (it may currently describe the envelope fix as create-only).
- Tester-stage note (routine, listed for traceability): per reviewer follow-up 1, add source-contract specs for the corrected error chains in the tester-owned specs (`apps/web/app/pages/pages.spec.ts`, `apps/web/app/blog/blog.spec.ts`), pinning the `payload?.error?.message` pattern for all admin calls in both files.

### Subtask 3: Make `PagesService.create` transactional and document the guarantee
- Stable ID: `subtask-3`
- Security review required: no (atomicity/correctness fix on an admin-only surface; no trust-boundary change).
- Dependencies: none. Subtasks 4 and 5 depend on this one.
- Scope:
  - In `apps/api/src/pages/pages.service.ts`, wrap the three-step `create()` sequence (insert `standalone_pages` with `currentRevisionId=null` → insert `page_revisions` → update `currentRevisionId`) in a **single database transaction** (TypeORM `DataSource.transaction(...)` or an injected manager — follow the existing module's injection conventions; update `apps/api/src/pages/pages.module.ts` only if a new injection is required). Preserve the FK-aware insert order, the validation/sanitization behavior, the returned entity shape (non-null `currentRevisionId`), and revision numbering. No schema change.
  - Update the `create()` JSDoc (currently lines 115-124) to state the transactional guarantee: a mid-create failure rolls back the page, the revision, and the pointer update together, so no orphaned `standalone_pages` row (occupied slug) or orphaned revision can remain (closes reviewer NOTE 6 together with WARNING 3).
- Acceptance criteria:
  - A failure at any step of `create()` leaves **no** `standalone_pages` row and **no** `page_revisions` row from that call (the slug is immediately reusable on retry).
  - A successful create persists the page and revision 1 and returns an entity with `currentRevisionId` set, exactly as before.
  - `update`, `publish`, `unpublish`, revision listing, and restore behavior are unchanged.
  - The `create()` JSDoc states the transactional guarantee alongside the FK-aware order.
  - The API builds, lints, typechecks, and its unit suite passes (the existing mocked tests may need mock-shape updates by the tester stage; that does not relax this subtask's criteria).
- Documentation Impact: `docs/README.md` — if it describes the page-create flow or the FK-aware insert order, the downstream Documenter stage adds the transactional guarantee.
- Tester-stage note (routine, listed for traceability): the existing mocked unit tests in `apps/api/src/pages/pages.service.test.ts` (including the call-order regression test at lines 133-183) must be adapted to the transaction wrapper; the schema-enforced proof is subtask-4's deliverable, not this one's.

### Subtask 4: Env-gated MySQL integration test proving the FK and rollback behavior
- Stable ID: `subtask-4`
- Security review required: no.
- Dependencies: `subtask-3` (tests the transactional implementation).
- Scope (explicitly test-infrastructure work, justified: the prior plan's Risk #7 mitigation and reviewer follow-up 2 require a schema-enforced regression net that the routine downstream workflow cannot supply — mocked unit tests are exactly what let the original FK bug ship):
  - Add an integration spec `apps/api/src/pages/pages.service.integration.test.ts` that connects to a real MySQL via TypeORM using the documented env contract (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) and is **gated** on an explicit opt-in env var `SFUS_DB_INTEGRATION=1`: when the flag is unset the suite skips cleanly (vitest `describe.skipIf` or equivalent) with a logged skip reason, so the default `workspace-test` validation is unaffected.
  - The spec must exercise the real `fk_page_revisions_page_id` constraint against the migrated dev-stack schema: (a) a successful `PagesService.create` round-trip persists the page and revision with no FK error and sets `current_revision_id`; (b) a forced mid-transaction failure (e.g. a revision insert made to violate a constraint) leaves **no** orphaned `standalone_pages` row — proving rollback. The spec creates only its own throwaway rows (unique slugs) and cleans them up.
  - Add any small shared test-support helper needed for the DataSource bootstrap (e.g. `apps/api/src/pages/integration-test-support.ts` or an equivalent colocated helper), an `apps/api/package.json` script (e.g. `test:integration`), and a cicd validation entry in `cicd/config/validation-config.yml` (following the existing entry conventions) that runs the integration spec with the dev database up; update `cicd/docs/cicd.md`/`cicd/docs/local-pipeline.md` to describe when the entry runs.
- Acceptance criteria:
  - With the dev MySQL up, migrations applied, and `SFUS_DB_INTEGRATION=1` plus the `DB_*` env vars set, the integration spec passes: real-FK create round-trip succeeds and the forced-failure case proves no orphaned page row remains.
  - With the flag unset, `npx --yes pnpm@10.0.0 test` behaves exactly as before (the spec skips, with an explicit skip message; no DB required).
  - A documented, copy-pasteable command exists to run the integration spec locally, and the cicd validation contract includes the new entry.
  - No production code changes; the API builds, lints, and typechecks clean.
- Documentation Impact: `docs/website-launch-guide.md` — add the integration-test invocation (env flag + `DB_*` contract) to the test-commands section; `cicd/docs/cicd.md` / `cicd/docs/local-pipeline.md` — document the new validation entry (downstream Documenter stage verifies/completes).
- Tester-stage note: the tester validates both the gated-run and skip paths and may extend assertions; the implementer owns the harness because it is explicitly story-required test infrastructure.

### Subtask 5: Reserve the `pages` slug and pin the bare-`/pages` navigation edge
- Stable ID: `subtask-5`
- Security review required: **yes** (it changes publication-visibility classification in public navigation — same class as the prior plan's security-marked navigation subtask; expect a specialist Security stage).
- Dependencies: `subtask-3` (both edit `apps/api/src/pages/pages.service.ts`; serialized to avoid overlap).
- Scope:
  - Add `"pages"` to `RESERVED_PAGE_SLUGS` in `apps/api/src/pages/pages.service.ts` (decision D4). Effects: creating/renaming a standalone page with slug `pages` is rejected by `assertSlugValid`, and `navigation.service.ts` treats a bare `/pages` internal nav URL as a reserved static route (always rendered) instead of resolving it as a standalone-page slug (previously silently hidden unless a published page with slug `pages` existed).
  - Align the `isLinkedTargetPubliclyVisible` JSDoc in `apps/api/src/navigation/navigation.service.ts` if its reserved-slug description needs the new entry mentioned; no logic change there.
- Acceptance criteria:
  - `POST`/update of a standalone page with slug `pages` is rejected with the existing reserved-slug `BadRequestException`.
  - A public navigation response renders an internal nav item with URL `/pages` (treated as a static route) regardless of standalone-page publication state; all previously reserved slugs and the published/unpublished `/<slug>` filtering behavior are unchanged.
  - Existing `/blog/<slug>`, `/pages/<slug>`, and safe-`[]`-fallback behavior is preserved.
  - The API builds, lints, typechecks, and its unit suite passes.
- Security acceptance criteria:
  - The change is strictly fail-closed for content: no unpublished standalone page becomes publicly visible or resolvable through navigation as a result of this change (only the visibility of the static link itself changes).
- Documentation Impact: `docs/README.md` — the reserved-slug list and the navigation publication-filtering description gain the `pages` entry and a note about the bare-`/pages` static-route behavior (downstream Documenter stage).
- Tester-stage note (routine, listed for traceability): add a reserved-slug rejection case for `pages` in `apps/api/src/pages/pages.service.test.ts` and a bare-`/pages` nav-URL case in `apps/api/src/navigation/navigation.service.test.ts` documenting the always-rendered static behavior (closes the untested-edge half of reviewer NOTE 3).

### Subtask 6: Fix the navigation controller test path defect (restore a clean 262/262 API suite)
- Stable ID: `subtask-6`
- Security review required: no.
- Dependencies: none.
- Scope (explicitly test-infrastructure repair, justified: reviewer follow-up 4 names this defect as distinct deliverable work — the cwd-based path resolution is broken test infrastructure rather than ordinary coverage work; `apps/api/src/navigation/navigation.controller.test.ts` enters the implementer allowed-file list for that reason only):
  - In `apps/api/src/navigation/navigation.controller.test.ts:7`, resolve the controller source path relative to the test file (e.g. via `import.meta.url` / `fileURLToPath`) instead of `process.cwd()`, so the 6 failing source-contract tests pass under `pnpm --filter @sfus/api test` (cwd=`apps/api`) and under any other cwd. Do not weaken or remove any assertion.
  - Check the API test tree for other `process.cwd()`-anchored source-path resolutions of the same pattern and fix them identically if found (bounded to test files; no product code changes).
- Acceptance criteria:
  - `npx --yes pnpm@10.0.0 --filter @sfus/api test` passes **262/262** (no pre-existing-failure exceptions remain).
  - The path fix is cwd-independent (test passes when vitest is invoked from the repo root and from `apps/api`).
  - No product code changes; assertion strength is unchanged.
- Documentation Impact: none expected; if any docs mention the 6 known-failing tests, the downstream Documenter stage removes the caveat.
- Tester-stage note (listed for traceability, closes reviewer NOTE 5): while validating this subtask, the tester adds the missing `serveImage` happy-path unit test in `apps/api/src/media/media.controller.test.ts` (present file streams with correct content type, content length, and piped bytes), complementing the existing error-path coverage.

### Subtask 7: Publication filtering for authenticated navigation (non-admin callers)
- Stable ID: `subtask-7`
- Origin: WA1 security review of prior subtask-3 (WARNING: authenticated-nav unpublished-metadata leak), folded in per decision D7.
- Security review required: **yes** (it changes publication-visibility behavior on an authenticated surface; expect a specialist Security stage).
- Dependencies: `subtask-5` (both edit `apps/api/src/navigation/navigation.service.ts`; serialized to avoid overlap).
- Scope:
  - In `apps/api/src/navigation/navigation.service.ts`, extend `findForAuthenticatedUser(actorGlobalRole)` (lines ~111-132) so that **non-admin** callers receive the same linked-target publication filtering that `findPublic` applies: filter children through the existing `filterByLinkedTargetVisibility` helper and omit top-level items whose linked target fails `isLinkedTargetPubliclyVisible`. Admin callers (per the existing `isAdmin` check) continue to receive items without linked-target filtering, preserving their staging/nav-management view. Reuse the existing helpers verbatim — no new classification logic. Update the method JSDoc to state the non-admin filtering guarantee.
- Acceptance criteria:
  - An authenticated non-admin navigation response omits any nav item (top-level or child) whose internal link targets an unpublished standalone page or blog post, exactly mirroring the public-surface classification (reserved slugs, `/blog/<slug>`, `/pages/<slug>`, top-level `/<slug>`, external/static links).
  - An authenticated admin response is unchanged from today (visibility-rule filtering only; unpublished-target items still listed).
  - `findPublic` behavior and the public endpoint are unchanged.
  - The API builds, lints, typechecks, and its unit suite passes.
- Security acceptance criteria:
  - After this change, no unauthenticated or non-admin authenticated caller can learn the existence, slug, or label of unpublished content through any navigation endpoint.
- Documentation Impact: `docs/README.md` — the authenticated-navigation description gains the non-admin publication-filtering guarantee (downstream Documenter stage).
- Tester-stage note (listed for traceability, closes the WA1 test-tightening WARNING on the nav side): in `apps/api/src/navigation/navigation.service.test.ts`, add non-admin vs admin filtering cases for unpublished-target items, and tighten the existing mock assertions to pin the publication `where` predicate (`status: "published"`; blog `publishedAt` LessThanOrEqual(now)) so a regression dropping the status condition cannot pass.

### Subtask 8: Close the comment-creation existence oracle (403 → 404 for non-public posts)
- Stable ID: `subtask-8`
- Origin: WA1 security review of prior subtask-4 (WARNING: authenticated existence oracle on `POST /api/blog/:postIdOrSlug/comments`), folded in per decision D8.
- Security review required: **yes** (publication-leakage/oracle fix on an authenticated surface; expect a specialist Security stage).
- Dependencies: none (no other subtask touches the blog module).
- Scope:
  - In `apps/api/src/blog/blog.controller.ts`, change the `resolvePostId` fallback (lines ~352-360) from the any-status `findById` to the public-visibility `findPublishedById`, so a non-public post addressed by UUID resolves exactly like a nonexistent one (404, same message) on the comment-creation path.
  - In `apps/api/src/blog/blog.service.ts`, change the `createComment` non-public guard (lines ~382-384) from `ForbiddenException("Comments can only be added to published posts.")` to `NotFoundException("Blog post not found.")` — defense-in-depth with the same message/shape as the nonexistent-post case. Keep the `commentsLocked` `ForbiddenException` (lines ~387-389) unchanged: a locked **public** post is legitimately visible, so its 403 is not an oracle.
- Acceptance criteria:
  - `POST /api/blog/:postIdOrSlug/comments` returns an indistinguishable 404 (same status, same envelope message) for nonexistent, draft, unpublished, and future-scheduled posts, whether addressed by slug or UUID.
  - Comment creation on genuinely public posts is unchanged; comment creation on a locked public post still returns the existing 403 lock message.
  - All other comment routes (list, moderation, lock/unlock) are behaviorally unchanged.
  - The API builds, lints, typechecks, and its unit suite passes.
- Security acceptance criteria:
  - No authenticated member can distinguish an existing non-public post from a nonexistent one via the comment-creation route (status code, message, and envelope shape all match).
- Documentation Impact: `docs/README.md` — the documented comment-creation 403 contract (lines ~253 and ~269) is updated to the 404 behavior (downstream Documenter stage).
- Tester-stage note (listed for traceability, closes the WA1 informational notes on the blog side): add oracle-parity tests (nonexistent vs draft vs future-scheduled UUID produce identical 404 responses), a locked-public-post 403 regression case, tighten the `findPublished*` predicate assertions to verify the `LessThanOrEqual` operator (not just key presence), and add a controller-level test pinning the slug-then-id fallback wiring of `resolvePostId`.

## Workflow Action WA1: Retroactive specialist security review — COMPLETED IN-CYCLE
Executed during this planning cycle at the user's direction (decisions D3, D7, D8, D9) by two `security` role agents, read-only on product code. Nothing remains for the Coordinator under this action; the final Reviewer pass should treat the prior report's WARNING 4 as closed.

- **Prior subtask-3** (navigation publication-leak fix): **CONDITIONAL PASS** — 0 blocking, 2 warnings, 5 notes. Artifacts committed in `ef9c964`: `artifacts/ms3-landing-refresh-and-review-followups/subtask-3/security_report.md` + `security_result.json`.
- **Prior subtask-4** (blog `listComments` visibility fix): **CONDITIONAL PASS** — 0 blocking, 1 warning, 4 notes. Artifacts committed in `f54c02a`: `artifacts/ms3-landing-refresh-and-review-followups/subtask-4/security_report.md` + `security_result.json`.
- Finding disposition: the authenticated-nav metadata leak → **subtask-7**; the nav predicate-assertion gap → subtask-7 tester guidance; the comment-creation 403/404 oracle → **subtask-8**; the `LessThanOrEqual`-assertion and fallback-wiring note → subtask-8 tester guidance; data-minimization, nav N+1 batching, and `validateUrl` hardening → recorded in `docs/deferred-tasks.md` (decision D9); remaining notes (slug/UUID namespace overlap, pages/nav predicate lockstep, bare-`/pages`, `deriveUniqueSlug` TOCTOU) require no action — the last two were already covered by subtask-5 and the D5 register entry.

## Acceptance Criteria (feature-level)
This feature is complete when all of the following hold:
- The site shell (`layout.tsx` metadata, header, footer) carries the approved Milestone 3 copy with no "Milestone 2" text anywhere in `apps/web`'s rendered shell.
- Every error read in `pages-client.ts` and `blog-client.ts` resolves the `JsonExceptionFilter` envelope (`payload?.error?.message`) first, so all page/blog admin and moderation failures surface the real server message — closing the reviewer's "only user-visible plan scope that did not ship".
- `PagesService.create` is atomic (single transaction), its JSDoc states the guarantee, and an env-gated integration test against a real MySQL schema with `fk_page_revisions_page_id` enforced proves both the create round-trip and rollback-on-failure.
- The `pages` slug is reserved, the bare-`/pages` nav edge is pinned by tests and documented, and no unpublished-content visibility regression is introduced.
- `npx --yes pnpm@10.0.0 --filter @sfus/api test` passes (all tests green, including the additions from subtasks 7–8) with the cwd defect fixed; the web suite passes with updated shell-copy assertions plus new login error-copy and admin error-chain source-contract coverage; `serveImage` has happy-path unit coverage.
- `security_report.md`/`security_result.json` exist for prior-plan subtasks 3 and 4 (**done in-cycle**: commits `ef9c964`, `f54c02a`, both CONDITIONAL PASS), and every code-change finding from them is closed by subtasks 7 and 8.
- Authenticated non-admin navigation applies the same publication filtering as public navigation (no unpublished existence/slug/label leak); admins retain their full management view.
- Comment creation returns an indistinguishable 404 for non-public posts (no authenticated existence oracle), with the locked-public-post 403 preserved and the documented contract updated.
- `docs/deferred-tasks.md` records the `deriveUniqueSlug` TOCTOU hardening as future scope (done in-cycle), and `docs/README.md`/`docs/website-launch-guide.md`/`cicd/docs/*` reflect the reserved slug, the transactional guarantee, and the integration-test entry.

## Documentation Impact (Overall)
- `docs/deferred-tasks.md`: TOCTOU hardening item plus the three WA1 informational notes (comment-payload data-minimization, nav publication-filter batching/caching, `validateUrl` leading-`/` hardening) appended during this planning cycle (**already applied** — not implementer deliverables). The admin error-envelope deferral is intentionally **not** recorded there because subtask-2 implements it.
- `docs/README.md`: reserved-slug list gains `pages` + bare-`/pages` navigation note (subtask-5); page-create transactional guarantee if the create flow is described (subtask-3); admin error-surfacing description updated from create-only to all admin calls if present (subtask-2); authenticated-navigation publication-filtering guarantee (subtask-7); comment-creation contract updated from 403 to 404 for non-public posts at lines ~253/269 (subtask-8).
- `docs/website-launch-guide.md`: integration-test invocation (`SFUS_DB_INTEGRATION=1` + `DB_*` env contract) added to the test-commands section (subtask-4); the "6 pre-existing API test failures" caveat removed anywhere it appears (subtask-6).
- `cicd/docs/cicd.md` / `cicd/docs/local-pipeline.md`: new DB-backed validation entry documented (subtask-4).

## Dependency Ordering
- `subtask-3` → `subtask-4` (the integration test exercises the transactional implementation).
- `subtask-3` → `subtask-5` (both edit `apps/api/src/pages/pages.service.ts`; serialized, never parallel).
- `subtask-5` → `subtask-7` (both edit `apps/api/src/navigation/navigation.service.ts`; serialized, never parallel).
- `subtask-4` and `subtask-5` touch disjoint files after `subtask-3` lands (new integration/test-support/cicd files vs. the reserved-slug set) and may run in parallel with each other.
- `subtask-1`, `subtask-2`, `subtask-3`, `subtask-6`, and `subtask-8` are mutually disjoint (shell copy vs. web clients vs. API pages service vs. API test files vs. API blog module) and may run in parallel as the first wave.
- WA1 (retroactive security review) is **already complete** (in-cycle); no scheduling needed.
- Shared-doc serialization: the documenter stages of `subtask-2`, `subtask-3`, `subtask-5`, `subtask-7`, and `subtask-8` may all edit `docs/README.md`; merge them serially in the order 2 → 3 → 8 → 5 → 7 (or have the Coordinator coordinate the doc edits). `subtask-4`'s doc edits (`docs/website-launch-guide.md`, `cicd/docs/*`) and `subtask-6`'s (caveat removal) are disjoint from that set but `subtask-6` may also touch `docs/website-launch-guide.md` — if so, serialize 4 → 6 for that file.

Recommended execution: **Wave A (parallel):** subtask-1, subtask-2, subtask-3, subtask-6, subtask-8. **Wave B (parallel, after subtask-3):** subtask-4, subtask-5. **Wave C (after subtask-5):** subtask-7.

## Risks And Mitigations
1. `public-shell.spec.ts:52-53` asserts the old Milestone 2 shell strings and will fail on subtask-1's change.
   - Mitigation: expected; the tester stage updates the assertions to the D1 copy (and adds the login error-copy coverage in the same file). The spec is tester-owned and is not in the implementer allowed list.
2. Wrapping `create()` in a transaction changes how repositories/managers are used, which can break the existing mocked unit tests and subtly alter the return shape.
   - Mitigation: acceptance criteria pin the return shape and sibling-method behavior; the tester adapts the mocks; subtask-4's real-DB test proves the end-to-end behavior the mocks cannot.
3. The env-gated integration test could be silently skipped everywhere and rot.
   - Mitigation: an explicit cicd validation entry runs it with the dev DB up; the skip path logs a visible reason; the run command is documented in `docs/website-launch-guide.md`.
4. Reserving `pages` could invalidate an existing standalone page already using that slug.
   - Mitigation: assumption (labeled): no such page exists in any current environment — the slug was previously creatable but `/pages`-prefixed routes make it pathological. The change is fail-closed (creation rejected; nothing exposed). The tester pins rejection behavior; if a deployment ever held such a row, it remains readable at `/pages` route resolution but can no longer be re-saved under that slug.
5. ~~The retroactive security review may produce findings requiring code changes after subtasks are in flight.~~ **Resolved:** the reviews ran in-cycle, before execution started; their findings are subtasks 7 and 8 in this plan. No in-flight fold-back remains.
6. Applying the envelope pattern to public load calls in `blog-client.ts` (lines 98, 111, 244, 268) could change user-visible error text on public pages.
   - Mitigation: the pattern only *adds* a higher-priority source for the message; fallbacks are unchanged, and the envelope message is the server's intended human-readable error. Tester specs pin the chains.
7. The subtask-7 filtering could over-hide legitimate items from authenticated non-admin users (e.g. static routes misclassified as page links).
   - Mitigation: it reuses `filterByLinkedTargetVisibility`/`isLinkedTargetPubliclyVisible` verbatim — the exact classifier already proven on the public surface (and security-reviewed twice); tester adds non-admin/admin parity cases. The per-item DB lookups it adds to the authenticated path are the same bounded, indexed point queries the public path already performs (WA1 NOTE; batching recorded as deferred scope).
8. The subtask-8 change alters a documented API contract (403 → 404) that the web client or existing tests may assert.
   - Mitigation: the web comment form never renders for non-public posts, so members cannot hit the changed path through the UI; the envelope message is surfaced generically by the client (no hardcoded 403 text); the documenter updates `docs/README.md` lines ~253/269 and the tester pins the new parity behavior plus the preserved locked-post 403.

## Output Artifact Path
- `plans/ms3-review-closeout-plan.md`

## Implementer Prompts

### Subtask 1: Site shell Milestone 3 copy refresh
```text
Your role is 'implementer'. Your task is as follows:
On the plan's coordination branch (based on ms3-claude), update the site shell so it stops describing Milestone 2. The landing page body already describes Milestone 3; only the shared shell in apps/web/app/layout.tsx is stale.

Do the following, replacing the three Milestone 2 strings with exactly this approved copy:
- Metadata description (line ~14): "Blog, standalone pages, and site navigation for the Star Frontiers US Milestone 3 content platform."
- Header eyebrow (line ~29): "Milestone 3 Content Platform"
- Footer second line (line ~46): "Built for the Milestone 3 content launch baseline."
Leave the title template, the first footer line ("Star Frontiers US · Public foundation shell"), the navigation component, and all shell structure unchanged.

Allowed files:
- `apps/web/app/layout.tsx`

Implementation-outcome acceptance criteria:
- apps/web/app/layout.tsx contains no "Milestone 2" text; the three new strings match the approved copy exactly.
- No other shell behavior (navigation, layout structure, routes) changes.
- The web app builds, lints, and typechecks clean.

Validation guidance:
- Run the web build, lint, typecheck, and test commands per docs/website-launch-guide.md. Note: apps/web/app/public-shell.spec.ts currently asserts the OLD Milestone 2 strings (lines ~52-53) and will fail until the tester stage updates it — a failure localized to those assertions is expected and must be reported, not fixed by you (that file is tester-owned).

Tester guidance:
- Tester-owned web specs live under apps/web/app/**/*.spec.ts. public-shell.spec.ts must be updated to assert the new Milestone 3 shell copy; while in that file, also add source-contract assertions for the login client's service-unavailable and credential message strings and their status-code branching (mirroring the existing register coverage), closing the final reviewer's NOTE 2.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-review-closeout/subtask-1/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 2: Complete the admin error-envelope adoption in the pages and blog clients
```text
Your role is 'implementer'. Your task is as follows:
On the plan's coordination branch (based on ms3-claude), finish the admin error-envelope fix that the previous plan delivered only partially. The API's JsonExceptionFilter envelope is { error: { code, message, statusCode }, request: {...} }, so the real message lives at payload.error.message; most client calls still read payload?.message (always undefined), collapsing every failure to a generic fallback.

Do the following:
- In apps/web/app/pages/pages-client.ts, change all eight error reads (lines ~87, 100, 115, 130, 143, 156, 169, 185) from payload?.message || <fallback> to payload?.error?.message || payload?.message || <fallback> — the established pattern already used at apps/web/app/blog/blog-client.ts line ~126. Keep each call's existing generic fallback string exactly as it is.
- In apps/web/app/blog/blog-client.ts, apply the same pattern to the fourteen remaining reads (lines ~98, 111, 141, 154, 167, 182, 195, 208, 244, 268, 281, 294, 311, 332, 348), covering update, publish, unpublish, schedule, feature-toggle, delete, all comment/moderation calls, and the public list/detail loads for consistency.
- Do not change request logic, success paths, exported types, function signatures, or fallback texts.

Allowed files:
- `apps/web/app/pages/pages-client.ts`
- `apps/web/app/blog/blog-client.ts`

Implementation-outcome acceptance criteria:
- Every error read in both files resolves payload?.error?.message first; no payload?.message-only read remains in either file.
- A failing admin action with an envelope response surfaces the envelope's error.message in the thrown Error; when no envelope is present (network failure, non-JSON body), the existing generic fallback still appears.
- No success-path behavior, exported types, or function signatures change.
- The web app builds, lints, typechecks, and its test suite passes.

Validation guidance:
- Run the web build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- Tester-owned web specs live under apps/web/app/**/*.spec.ts (pages.spec.ts, blog.spec.ts). Per the final reviewer's follow-up 1, add source-contract specs pinning the payload?.error?.message chain for all admin calls in both files so a regression to payload?.message-only cannot ship silently.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-review-closeout/subtask-2/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 3: Make PagesService.create transactional and document the guarantee
```text
Your role is 'implementer'. Your task is as follows:
On the plan's coordination branch (based on ms3-claude), make standalone-page creation atomic. PagesService.create (apps/api/src/pages/pages.service.ts lines ~125-169) currently performs three sequential saves (page with currentRevisionId=null → revision → page update) with no transaction; a failure at step 2 or 3 leaves an orphaned draft standalone_pages row whose slug blocks retries. This was an unmet acceptance criterion of the prior plan (final reviewer WARNING 3).

Do the following:
- Wrap the three-step create() sequence in a single database transaction (TypeORM DataSource.transaction(...) or a transactional EntityManager — follow the module's existing injection conventions; touch apps/api/src/pages/pages.module.ts only if a new injection is required). Preserve the FK-aware insert order (page first, then revision, then currentRevisionId update), all validation/sanitization behavior, the returned entity shape (non-null currentRevisionId), and revision numbering. Do not change the database schema.
- Update the create() JSDoc (currently lines ~115-124) to state the transactional guarantee: a mid-create failure rolls back the page, revision, and pointer update together, so no orphaned standalone_pages row (occupied slug) or orphaned revision can remain. This closes the final reviewer's NOTE 6 alongside WARNING 3.

Allowed files:
- `apps/api/src/pages/pages.service.ts`
- `apps/api/src/pages/pages.module.ts`

Implementation-outcome acceptance criteria:
- A failure at any step of create() leaves no standalone_pages row and no page_revisions row from that call; the slug is immediately reusable.
- A successful create persists the page and revision 1 and returns an entity with currentRevisionId set, exactly as before.
- update, publish, unpublish, revision listing, and restore behavior are unchanged.
- The create() JSDoc states the transactional guarantee alongside the FK-aware order.
- The API builds, lints, and typechecks clean.

Validation guidance:
- Run the API build, lint, typecheck, and test commands per docs/website-launch-guide.md. The existing mocked unit tests in apps/api/src/pages/pages.service.test.ts (including the call-order regression test at lines ~133-183) may fail against the transaction wrapper; report that for the tester stage rather than editing that tester-owned file.

Tester guidance:
- Tester-owned tests live under apps/api/src/pages/*.test.ts; the mocked create() tests must be adapted to the transactional implementation (transaction-aware mocks), preserving the insert-order regression assertion. The schema-enforced FK/rollback proof is subtask-4's deliverable, not this subtask's.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-review-closeout/subtask-3/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 4: Env-gated MySQL integration test proving the FK and rollback behavior
```text
Your role is 'implementer'. Your task is as follows:
On the plan's coordination branch (based on ms3-claude), after subtask-3 has landed, add the schema-enforced regression net the prior plan required but never received (final reviewer WARNING 5): an integration-style test that exercises PagesService.create against a real MySQL schema with fk_page_revisions_page_id enforced. Mocked unit tests are exactly what let the original FK bug ship, so this subtask is explicitly test-infrastructure work assigned to you.

Do the following:
- Add apps/api/src/pages/pages.service.integration.test.ts: a vitest spec that bootstraps a TypeORM DataSource from the documented env contract (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD — see docs/website-launch-guide.md; host-run hybrid defaults DB_HOST=127.0.0.1, DB_PORT=3306, DB_NAME=sfus) and is gated on an explicit opt-in flag SFUS_DB_INTEGRATION=1. When the flag is unset, the suite must skip cleanly (describe.skipIf or equivalent) with a logged skip reason so the default workspace test run needs no database.
- The spec must prove, against the migrated dev-stack schema with the real foreign key: (a) a successful PagesService.create round-trip persists the standalone_pages row and its page_revisions row with no FK error and sets current_revision_id; (b) a forced mid-transaction failure (e.g. a revision insert engineered to violate a constraint) leaves no orphaned standalone_pages row — proving rollback. Use only throwaway rows with unique slugs and clean them up after each test.
- Add a small colocated bootstrap helper if needed (e.g. apps/api/src/pages/integration-test-support.ts), an apps/api/package.json script (e.g. "test:integration"), and a validation entry in cicd/config/validation-config.yml (following the existing entry conventions) that runs the integration spec with the dev database up; update cicd/docs/cicd.md and/or cicd/docs/local-pipeline.md to describe when that entry runs.

Allowed files:
- `apps/api/src/pages/pages.service.integration.test.ts`
- `apps/api/src/pages/integration-test-support.ts`
- `apps/api/package.json`
- `cicd/config/validation-config.yml`
- `cicd/docs/cicd.md`
- `cicd/docs/local-pipeline.md`

Implementation-outcome acceptance criteria:
- With the dev MySQL up, migrations applied, and SFUS_DB_INTEGRATION=1 plus DB_* set, the integration spec passes: the real-FK create round-trip succeeds and the forced-failure case proves no orphaned page row remains.
- With the flag unset, the workspace test command behaves exactly as before: the spec skips with an explicit skip message and no DB is required.
- A copy-pasteable command to run the integration spec locally exists in the changes (script and/or cicd docs), and cicd/config/validation-config.yml includes the new entry.
- No production code changes; the API builds, lints, and typechecks clean.

Validation guidance:
- Run the API test command per docs/website-launch-guide.md twice: once without the flag (must skip cleanly) and once with the dev stack up and SFUS_DB_INTEGRATION=1 (must pass). Start the dev stack per docs/website-launch-guide.md if needed.

Tester guidance:
- Tester-owned tests live under apps/api/src/pages/*.test.ts; the tester validates both the gated-run and skip paths and may extend integration assertions. You own the harness because the plan explicitly requires this test infrastructure.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-review-closeout/subtask-4/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 5: Reserve the `pages` slug and pin the bare-`/pages` navigation edge
```text
Your role is 'implementer'. Your task is as follows:
On the plan's coordination branch (based on ms3-claude), after subtask-3 has landed, close the bare-/pages navigation edge flagged by the final reviewer (NOTE 3). This subtask is security-sensitive (it changes publication-visibility classification in public navigation) and will receive specialist Security review.

Background: navigation.service.ts resolves single-segment non-reserved internal URLs against published standalone_pages, so a nav item with URL "/pages" is currently looked up as a standalone page with slug "pages" and silently hidden if none is published. The reserved-slug denylist RESERVED_PAGE_SLUGS (apps/api/src/pages/pages.service.ts lines ~16-27) already contains "blog" but not "pages".

Do the following:
- Add "pages" to RESERVED_PAGE_SLUGS in apps/api/src/pages/pages.service.ts. Effects: assertSlugValid rejects creating/renaming a standalone page with slug "pages", and navigation treats a bare /pages internal URL as a reserved static route (always rendered) instead of a page-slug lookup.
- If the isLinkedTargetPubliclyVisible JSDoc in apps/api/src/navigation/navigation.service.ts enumerates reserved slugs or needs its description aligned, update that JSDoc only; make no logic change in the navigation service.

Allowed files:
- `apps/api/src/pages/pages.service.ts`
- `apps/api/src/navigation/navigation.service.ts`

Implementation-outcome acceptance criteria:
- Creating or renaming a standalone page with slug "pages" is rejected with the existing reserved-slug BadRequestException.
- A public navigation response renders an internal nav item with URL "/pages" regardless of standalone-page publication state; all previously reserved slugs and published/unpublished /<slug> filtering behavior are unchanged.
- Existing /blog/<slug>, /pages/<slug>, and safe-[] fallback behavior is preserved.
- Security: the change is strictly fail-closed for content — no unpublished standalone page becomes publicly visible or resolvable through navigation (only the static link's own visibility changes).
- The API builds, lints, typechecks, and its unit suite passes.

Validation guidance:
- Run the API build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- Tester-owned tests live under apps/api/src/pages/*.test.ts and apps/api/src/navigation/*.test.ts; add a reserved-slug rejection case for "pages" and a bare-"/pages" nav-URL case pinning the always-rendered static behavior.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-review-closeout/subtask-5/` if workflow artifacts are required.
- This subtask is marked security-review-required; expect a specialist Security stage.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 6: Fix the navigation controller test path defect (restore a clean 262/262 API suite)
```text
Your role is 'implementer'. Your task is as follows:
On the plan's coordination branch (based on ms3-claude), repair the pre-existing test-infrastructure defect called out by the final reviewer (NOTE 1, follow-up 4): apps/api/src/navigation/navigation.controller.test.ts line 7 resolves the controller source path from process.cwd() ("apps/api/src/..."), which doubles to "apps/api/apps/api/..." when vitest runs with cwd=apps/api, so 6 tests fail under the documented per-package invocation and every workflow cycle must hand-wave "6 pre-existing failures". This is test-infrastructure repair explicitly required by the plan, which is why a tester-owned file is in your allowed list.

Do the following:
- In apps/api/src/navigation/navigation.controller.test.ts, resolve the controller source path relative to the test file itself (e.g. import.meta.url + fileURLToPath, or __dirname-equivalent) instead of process.cwd(), so the source-contract tests pass regardless of the vitest working directory. Do not weaken, remove, or rewrite any assertion.
- Search the API test tree for other process.cwd()-anchored source-file path resolutions of the same pattern and fix them identically if found. Bounded to test files only; no product code changes.

Allowed files:
- `apps/api/src/navigation/navigation.controller.test.ts`
- `apps/api/src/**/*.test.ts` (only for identical cwd-based path-resolution fixes; no assertion changes)

Implementation-outcome acceptance criteria:
- npx --yes pnpm@10.0.0 --filter @sfus/api test passes 262/262 — no pre-existing-failure exceptions remain.
- The fix is cwd-independent: the suite passes when vitest is invoked from the repo root and from apps/api.
- No product code changes; assertion strength is unchanged.

Validation guidance:
- Run the API test command per docs/website-launch-guide.md from both the repo root and via the --filter invocation to confirm cwd independence.

Tester guidance:
- Tester-owned tests live under apps/api/src/**/*.test.ts. While validating this subtask, the tester also closes the final reviewer's NOTE 5 by adding a serveImage happy-path unit test in apps/api/src/media/media.controller.test.ts (present file streams with correct content type, content length, and piped bytes), complementing the existing error-path coverage.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-review-closeout/subtask-6/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 7: Publication filtering for authenticated navigation (non-admin callers)
```text
Your role is 'implementer'. Your task is as follows:
On the plan's coordination branch (based on ms3-claude), after subtask-5 has landed, close an authenticated-surface publication leak found by the retroactive security review (artifacts/ms3-landing-refresh-and-review-followups/subtask-3/security_report.md): findForAuthenticatedUser applies no linked-target publication filtering, so nav items pointing at unpublished pages/posts are served to ANY authenticated user — and self-registration is open, so any visitor can register and learn the existence/slug/label of unpublished content (metadata only; content itself still 404s). This subtask is security-sensitive and will receive specialist Security review.

Do the following:
- In apps/api/src/navigation/navigation.service.ts, extend findForAuthenticatedUser(actorGlobalRole) (lines ~111-132) so that NON-ADMIN callers get the same linked-target publication filtering the public path applies: filter each item's children through the existing filterByLinkedTargetVisibility helper and omit any top-level item for which isLinkedTargetPubliclyVisible returns false. Admin callers (per the existing isAdmin check via authorizationService.hasGlobalRole) must continue to receive items WITHOUT linked-target filtering, preserving their staging/nav-management view. Reuse the existing helpers verbatim — add no new URL-classification logic. Update the method JSDoc to state the non-admin publication-filtering guarantee.
- Do not change findPublic, the controller, the reserved-slug set, or any helper's classification behavior.

Allowed files:
- `apps/api/src/navigation/navigation.service.ts`

Implementation-outcome acceptance criteria:
- An authenticated non-admin navigation response omits any nav item (top-level or child) whose internal link targets an unpublished standalone page or blog post, with classification identical to the public surface (reserved slugs, /blog/<slug>, /pages/<slug>, top-level /<slug>, external/static links).
- An authenticated admin response is unchanged from today: visibility-rule filtering only, unpublished-target items still listed.
- findPublic and the public endpoint behavior are unchanged.
- Security: after this change, no unauthenticated or non-admin authenticated caller can learn the existence, slug, or label of unpublished content through any navigation endpoint.
- The API builds, lints, typechecks, and its unit suite passes.

Validation guidance:
- Run the API build, lint, typecheck, and test commands per docs/website-launch-guide.md.

Tester guidance:
- Tester-owned tests live under apps/api/src/navigation/*.test.ts. Add non-admin vs admin cases for unpublished-target items (non-admin omits, admin retains), and — per the security review's second WARNING — tighten the existing mock assertions to pin the publication where-predicate (status: "published" for pages; status + publishedAt LessThanOrEqual(now) for blog posts) so a regression dropping the status condition cannot pass the suite.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-review-closeout/subtask-7/` if workflow artifacts are required.
- This subtask is marked security-review-required; expect a specialist Security stage.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 8: Close the comment-creation existence oracle (403 → 404 for non-public posts)
```text
Your role is 'implementer'. Your task is as follows:
On the plan's coordination branch (based on ms3-claude), close an authenticated existence oracle found by the retroactive security review (artifacts/ms3-landing-refresh-and-review-followups/subtask-4/security_report.md): POST /api/blog/:postIdOrSlug/comments returns 403 ("Comments can only be added to published posts.") for an existing non-public post but 404 for a nonexistent one, so an authenticated member with a known/guessed UUID can confirm a draft or future-scheduled post exists. Align the route to the milestone's visibility invariant: non-public must be indistinguishable from nonexistent. This subtask is security-sensitive and will receive specialist Security review.

Do the following:
- In apps/api/src/blog/blog.controller.ts, change the resolvePostId fallback (lines ~352-360) from the any-status findById to the public-visibility findPublishedById, so a non-public post addressed by UUID resolves exactly like a nonexistent one on the comment-creation path. Update the helper's JSDoc accordingly.
- In apps/api/src/blog/blog.service.ts, change the createComment non-public guard (lines ~382-384) from ForbiddenException("Comments can only be added to published posts.") to NotFoundException("Blog post not found.") — defense-in-depth with the exact message/shape of the nonexistent-post case. Keep the commentsLocked ForbiddenException (lines ~387-389) unchanged: a locked PUBLIC post is legitimately visible, so its 403 is not an oracle.
- Make no other changes to comment listing, moderation, or lock/unlock routes.

Allowed files:
- `apps/api/src/blog/blog.controller.ts`
- `apps/api/src/blog/blog.service.ts`

Implementation-outcome acceptance criteria:
- POST /api/blog/:postIdOrSlug/comments returns an indistinguishable 404 (same status and envelope message) for nonexistent, draft, unpublished, and future-scheduled posts, whether addressed by slug or UUID.
- Comment creation on genuinely public posts is unchanged; a locked public post still returns the existing 403 lock message.
- All other comment routes (list, moderation, lock/unlock) are behaviorally unchanged.
- Security: no authenticated member can distinguish an existing non-public post from a nonexistent one via the comment-creation route.
- The API builds, lints, typechecks, and its unit suite passes.

Validation guidance:
- Run the API build, lint, typecheck, and test commands per docs/website-launch-guide.md. Existing tests asserting the old 403 behavior may fail; report them for the tester stage rather than editing tester-owned files.

Tester guidance:
- Tester-owned tests live under apps/api/src/blog/*.test.ts. Add oracle-parity tests (nonexistent vs draft vs future-scheduled UUID produce identical 404 responses), a locked-public-post 403 regression case, tighten the findPublished* predicate assertions to verify the LessThanOrEqual operator rather than key presence, and add a controller-level test pinning resolvePostId's slug-then-id fallback wiring (both per the security review's informational notes).

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/ms3-review-closeout/subtask-8/` if workflow artifacts are required.
- This subtask is marked security-review-required; expect a specialist Security stage.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```
