Reviewer Report

Feature plan reviewed:
- plans/deferred-cleanup-plan.md (10 subtasks; register source docs/deferred-tasks.md @ main 1b99db5)

Inputs reviewed:
- Actual delivered code on branch cleanup (reviewed at HEAD 691e65c, diffed against main, merge-base 4c85297) — per user instruction, upstream verifier/tester artifact verdicts were treated as suspect and NOT relied upon
- apps/api/src/index.ts, index.test.ts (subtasks 1+2)
- apps/web/next.config.mjs, next.config.spec.ts (subtask 2)
- apps/api/src/blog/blog.controller.ts, blog.service.ts + tests, apps/web/app/blog/blog-client.ts, blog.spec.ts (subtasks 3+4)
- apps/api/src/pages/* (service, controller, entity, module, tests, integration test), apps/web/app/pages/* (subtasks 5+6)
- apps/api/src/navigation/navigation.service.ts + tests (subtask 7)
- apps/api/src/media/markdown-sanitizer.ts + tests, media.controller.ts (subtask 8)
- apps/web/app/auth-client.ts, register/page.tsx, login/login-client.tsx, auth-error-helpers.spec.ts (subtask 9)
- cicd/tests/run-validations.sh, cicd/tests/README.md (subtask 10)
- Docs: deployment.md, auth.md, web-shell.md, api-conventions.md, blog.md, pages.md, navigation.md, media.md, launch.md, deferred-tasks.md, docs/README.md routing table
- Security artifacts existence/scope spot-check: security_report.md present for subtasks 1, 2, 3, 6, 8; subtask-8 report covers the entire media subsystem (discharges register line 29)
- Validation commands executed by this reviewer at review time: pnpm lint PASS; pnpm typecheck PASS; pnpm test PASS (363 API passed/2 DB-gated skipped + web suite passed); pnpm --filter @sfus/api build PASS; bash cicd/tests/run-validations.sh PASS; bash cicd/scripts/smoke-validate.sh PASS
- Validation commands re-executed after post-review remediation: pnpm lint PASS; pnpm typecheck PASS; pnpm test PASS (369 API passed/2 DB-gated skipped, 293 web passed); pnpm --filter @sfus/api build PASS (smoke not re-run: remediation changes do not affect boot, migrations, or the health/homepage contracts it checks)

Overall feature completeness:
- All 10 subtasks are delivered in code on the cleanup branch and match the plan's scope: trusted proxy (1 hop, 9 audit call sites unchanged), app-level security headers/CSP with no HSTS from either app, public comment payload trim with public/admin serializer split and uniform parentId/imageId oracles, bounded (3) duplicate-key slug retry with 409 exhaustion envelope, featuredMediaId validation at all 3 pages write sites, currentRevision relation without schema change, resolveCurrentBody removed (zero references), public GET /pages list endpoint + web index route using the established envelope pattern, internal-URL leading-slash rule with '//' rejection, context-anchored sanitizer patterns with paired accept/reject test suites, exported auth error-mapping helpers with executed 400/409/5xx/null-statusCode tests, and the repaired DB_HOST contract assertions (suite passes).
- Documentation obligations from the plan's per-subtask Documentation Impact lists are all met and were verified claim-by-claim against code; register traceability holds (every in-scope line maps to delivered work; out-of-scope entries remain annotated in docs/deferred-tasks.md, which is correctly untouched on this branch).
- Cross-subtask integration is sound: helmet (subtask-2) sits after trust proxy (subtask-1) in the same bootstrap; the /pages route (subtask-6) works under the subtask-2 CSP because media and API calls route through the 'self' /api proxy path; the pages list endpoint reuses the same status='published' predicate value as findPublishedBySlug, preserving the pages/nav publication lockstep; subtask-8's security finding M1 (missing nosniff on media serve) is resolved cross-subtask by subtask-2's helmet default.
- The initial review (commit 7abfe29) recorded 3 warnings and 7 notes. At the user's direction, every finding that was safe to fix without a full implementer→verifier cycle was remediated in-session (see "Resolved findings" below) and re-validated. The conditional element is now narrowed to one residual warning — the remaining plan-mandated executed behavioral tests — plus planner-owned register follow-ups.

Findings (open, post-remediation)

BLOCKING
- None

WARNING
- apps/api/src/index.test.ts:176 - Two plan ACs that explicitly demanded executed behavioral proof remain covered only by structural/vacuous tests: (a) subtask-1 AC2 ('request.ip resolves the original client IP behind one simulated proxy hop — provable by an executed test, not source inspection') is covered only by asserting the mocked Express app received set('trust proxy', 1) — no simulated proxy-hop request exists; (b) subtask-2's API-side header assertions are vacuous — the HSTS test admits in comments that 'bootstrap runs without error' plus reading the source is the evidence, and no test asserts emitted API response headers. (Part (c) of the original finding — executed serializer proof for subtask-3 AC1 — was resolved in commit e8fe1ac.)
  The configurations are correct on direct inspection (trust proxy=1 semantics, helmet options), so no current defect — but the plan's executed-evidence bar was set precisely because source-inspection tests are this repository's known defect class, and regression protection is weaker than the plan required. Both residual tests likely require a supertest-class harness/dependency decision — tester-cycle work, deliberately not done ad hoc.

NOTE
- apps/api/src/index.ts:46 - The API disables helmet's CSP entirely (contentSecurityPolicy: false) rather than shipping 'the helmet baseline minus HSTS' literally; the in-code comment and docs/development/api-conventions.md document the JSON-only rationale and the Swagger exception decision explicitly.
  Defensible deviation for a JSON-only API (CSP matters for browser-rendered surfaces; Swagger is dev-only), and the specialist security stage accepted it — recorded here so the deviation from the AC's literal wording is a documented decision, not an oversight.
- apps/api/src/pages/entities/standalone-page.entity.ts:41 - The currentRevision relation is defined (correct dual column+relation mapping, createForeignKeyConstraints: false) but is consumed by no product code and exercised by no enabled test — subtask-5 AC2's 'loading a page with the relation resolves its current revision' is unproven by any default-run test; the DB-gated integration suite (SFUS_DB_INTEGRATION=1) builds the entity metadata but does not load via relations:["currentRevision"].
  Boot-time entity-metadata validity was confirmed by this review's executed smoke validation (full stack boots), but the relation's load behavior remains untested until a consumer or a DB-gated relation-loading test exists.
- apps/api/src/blog/blog.service.ts:197 - Explicit-slug writes (create with caller-supplied slug at blog.service.ts:197-208 and update at :234-236) still surface a raw duplicate-key error as an unhandled 500 on slug collision. This is outside the plan's scope (which covered only deriveUniqueSlug-consuming paths — exactly one, correctly enumerated) but is the same UX class the plan fixed for derived slugs.
  Candidate register entry for a future cycle: map explicit-slug duplicate-key errors to a controlled 409 envelope for parity. Product behavior change — deliberately not fixed ad hoc.
- apps/api/src/media/markdown-sanitizer.ts:41 - The anchored regex patterns retain known residual bypass classes inherent to regex-over-HTML at the storage layer: e.g. an event handler after a quoted '>' inside an attribute value (<img alt="a>b" onerror=...>), a markdown destination with leading whitespace ('](  data:'), and reference-style link definitions ('[x]: data:...').
  Acceptable for a storage-contract pre-filter because the web layer (markdown-renderer.tsx) independently strips HTML and re-validates URI schemes at render time — the security stage's whole-subsystem review reached the same layered-defense conclusion. Any tightening is security-review-required surface — deliberately not changed ad hoc.

Resolved findings (post-review remediation, same session, user-directed)

- WARNING (was apps/web/next.config.mjs:40) — false `img-src data:` justification: the comment, docs/features/web-shell.md, and the pinning test claimed markdown-renderer.tsx uses data: URIs for image previews, but that component rejects data: URIs and no apps/web code produces data: image sources. RESOLVED in a26394e: allowance removed (img-src is now 'self' only), comment and web-shell.md corrected, pinning test now asserts data: is absent.
- WARNING (was apps/api/src/navigation/navigation.service.ts:199) — internal-URL rule bypass via linkType-only update: PATCH { linkType: "internal" } without a url change skipped URL revalidation, letting an external or protocol-relative URL survive the switch. RESOLVED in cf55d42: update() now revalidates the stored URL whenever the effective linkType changes; four bypass/acceptance regression tests added; navigation.md documents the behavior.
- WARNING part (c) (was blog.controller.test.ts:292-446) — subtask-3 AC1 serializer trim proven only by source-regex assertions. RESOLVED in e8fe1ac: executed BlogController handler tests (stubbed services, real controller) now assert the listComments and createComment payload objects and nested replies contain no authorUserId/moderatedByUserId/moderatedAt keys.
- NOTE (was apps/web/next.config.mjs:26) — false claim that CSP nonce hardening 'is tracked in docs/deferred-tasks.md' (no such entry exists). RESOLVED in a26394e: wording now says the nonce/hash migration is a candidate for the deferred-work register in the next planning cycle; adding the register entry itself remains planner-owned follow-up.
- NOTE (was apps/web/app/pages/pages.spec.ts:329) — web reserved-slug spec pinned membership but not cardinality/set equality. RESOLVED in e8fe1ac: the RESERVED_SLUGS declaration is now pinned to exactly the eleven entries (cardinality + set equality), completing the web half of register line 38.
- NOTE (was apps/api/src/pages/pages.controller.ts:243) — PageSummary included updatedAt although the /pages index UI does not render it. RESOLVED in 579ec84: field dropped from the API serializer/interface, the web mirror type, and the pages.md response-shape contract; specs assert absence.
- Tooling (reviewer infrastructure, outside plan scope): .myteam/reviewer/artifact-writing/validate_reviewer_state.py corrupted the first git-status path (whole-output strip ate the leading status column). RESOLVED in 2ff9f0c; verified working against this session's artifact state.

Missed functionality or edge cases:
- No open delivered-scope behavior gaps remain: the navigation linkType-only bypass — the single behavior gap found by the initial review — was fixed in cf55d42 with regression tests.
- Every other acceptance criterion was verified directly in code/executed tests by this review; the only residual AC shortfall is evidentiary, not behavioral (open WARNING above: executed proxy-hop and API header-emission tests).
- Edge cases verified as handled: direct (un-proxied) dev connections under trust proxy=1; CSP in hybrid-dev (connect-src includes the WEB_API_ORIGIN-derived origin; img/media routes stay 'self' via the /api proxy); empty /pages index state; duplicate-key retry exhaustion (409) and non-duplicate error propagation (no swallowing); featuredMediaId null/absent fast paths at all three pages sites; moderator-role and all-children-filtered navigation visibility; statusCode===null network-failure mapping branch (executed); linkType-switch revalidation in both directions (executed, post-remediation).

Follow-up feature requests for planning:
- Tester follow-up subtask: deliver the remaining executed behavioral tests the plan mandated — (a) a supertest-style proxy-hop test proving request.ip resolves from X-Forwarded-For under trust proxy=1; (b) API response-header emission assertions for the helmet baseline (nosniff present, Strict-Transport-Security absent, no CSP header). Part (c), the executed public-serializer test, was already remediated in commit e8fe1ac.
- Next planning cycle (register edits, planner-owned): add the 'CSP nonce/hash hardening' entry that next.config.mjs and web-shell.md reference as a candidate; carry over the subtask-8 security report's M2 (header-only MIME validation — add magic-byte verification, keep SVG excluded); record the explicit-slug duplicate-key 500 parity candidate; consider a DB-gated relation-loading assertion for StandalonePageEntity.currentRevision; remove the register entries closed by this plan.

Remediation commits (all validated by lint, typecheck, full test suites — 369 API passed / 2 DB-gated skipped, 293 web passed — and the API build):
- a26394e fix(web): remove unjustified img-src data: CSP allowance (reviewer W1, N1)
- cf55d42 fix(navigation): revalidate URL on linkType-only updates (reviewer W2)
- e8fe1ac test: executed comment-serializer trim proof and reserved-slug cardinality pin (reviewer W3c, N4)
- 579ec84 fix(pages): drop unused updatedAt from PageSummary (reviewer N5)
- 2ff9f0c fix(myteam): validate_reviewer_state.py corrupted the first git-status path

Artifacts written:
- artifacts/deferred-cleanup/reviewer_report.md
- artifacts/deferred-cleanup/reviewer_result.json

Final outcome:
- CONDITIONAL PASS — 0 blocking, 1 warning (residual executed-test evidence for subtask-1 AC2 and subtask-2 API headers), 4 notes. Conditional scope: the tester follow-up for the residual executed tests and the planner-owned register edits. The initial review's findings and the remediation record are preserved in git history (7abfe29, 93990ab).
