Reviewer Report

Feature plan reviewed:
- plans/deferred-cleanup-plan.md (10 subtasks; register source docs/deferred-tasks.md @ main 1b99db5)

Inputs reviewed:
- Actual delivered code on branch cleanup (HEAD 691e65c), diffed against main (merge-base 4c85297) — per user instruction, upstream verifier/tester artifact verdicts were treated as suspect and NOT relied upon
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
- Validation commands executed by this reviewer: pnpm lint PASS; pnpm typecheck PASS; pnpm test PASS (363 API passed/2 DB-gated skipped + web suite passed); pnpm --filter @sfus/api build PASS; bash cicd/tests/run-validations.sh PASS; bash cicd/scripts/smoke-validate.sh PASS

Overall feature completeness:
- All 10 subtasks are delivered in code on the cleanup branch and match the plan's scope: trusted proxy (1 hop, 9 audit call sites unchanged), app-level security headers/CSP with no HSTS from either app, public comment payload trim with public/admin serializer split and uniform parentId/imageId oracles, bounded (3) duplicate-key slug retry with 409 exhaustion envelope, featuredMediaId validation at all 3 pages write sites, currentRevision relation without schema change, resolveCurrentBody removed (zero references), public GET /pages list endpoint + web index route using the established envelope pattern, internal-URL leading-slash rule with '//' rejection, context-anchored sanitizer patterns with paired accept/reject test suites, exported auth error-mapping helpers with executed 400/409/5xx/null-statusCode tests, and the repaired DB_HOST contract assertions (suite passes).
- Documentation obligations from the plan's per-subtask Documentation Impact lists are all met and were verified claim-by-claim against code; register traceability holds (every in-scope line maps to delivered work; out-of-scope entries remain annotated in docs/deferred-tasks.md, which is correctly untouched on this branch).
- Cross-subtask integration is sound: helmet (subtask-2) sits after trust proxy (subtask-1) in the same bootstrap; the /pages route (subtask-6) works under the subtask-2 CSP because media and API calls route through the 'self' /api proxy path; the pages list endpoint reuses the same status='published' predicate value as findPublishedBySlug, preserving the pages/nav publication lockstep; subtask-8's security finding M1 (missing nosniff on media serve) is resolved cross-subtask by subtask-2's helmet default.
- The conditional element: three WARNING-level findings (one false CSP justification shipped into code comment + web-shell.md, one navigation update-path validation hole, and a cluster of plan-mandated executed-evidence tests delivered as source-inspection/vacuous tests). None block feature completeness; all are small follow-up fixes.

Findings

BLOCKING
- None

WARNING
- apps/web/next.config.mjs:40 - The CSP allowance `img-src data:` carries a factually false justification: the comment (and docs/features/web-shell.md, and the pinning test next.config.spec.ts:165) claim markdown-renderer.tsx uses data: URIs for image previews, but that component REJECTS data: URIs (markdown-renderer.tsx:216,224,249) and no code in apps/web produces data: image sources (verified by grep for data:image/FileReader/readAsDataURL/createObjectURL/blob:). All real image paths use the proxied /api/media/... ('self') route since NEXT_PUBLIC_API_BASE_PATH stays '/api' per docs/operations/launch.md:52.
  Subtask-2 AC4 required every allowance beyond 'self' to carry a justification; a false justification defeats the AC's purpose and the plan elsewhere treats stale claims as defects. The allowance also needlessly widens the CSP (data: images are a known vector for UI spoofing/exfil-adjacent tricks). Fix is one line plus comment/doc/test corrections.
- apps/api/src/navigation/navigation.service.ts:199 - The internal-URL rule can be bypassed on update by switching linkType alone: update() revalidates the URL only when input.url !== undefined, so PATCH { linkType: "internal" } on an item whose stored URL is external (e.g. 'https://evil.example' or '//evil.example') yields an internal item violating the new leading-'/' rule. Subtask-7 AC1 required rejection 'on create and update'. The existing test (navigation.service.test.ts:387) only covers the url+linkType-together case.
  Admin-only input and defense-in-depth, so exploitability is low, but it is a real hole in the exact rule this subtask shipped: a rule-violating row can still be created by a new write (this is not the documented prospective-only/existing-rows exemption). Fix: revalidate item.url whenever the effective linkType becomes internal.
- apps/api/src/index.test.ts:176 - Three plan ACs that explicitly demanded executed behavioral proof were delivered as source-inspection or vacuous tests: (a) subtask-1 AC2 ('request.ip resolves the original client IP behind one simulated proxy hop — provable by an executed test, not source inspection') is covered only by asserting the mocked Express app received set('trust proxy', 1) — no simulated proxy-hop request exists; (b) subtask-2's API-side header assertions are vacuous — the HSTS test admits in comments that 'bootstrap runs without error' plus reading the source is the evidence, and no test asserts emitted API response headers; (c) subtask-3 AC1 ('provable by executed serializer tests') is covered by regex over blog.controller.ts source text (blog.controller.test.ts:292-446), not by executing the serializers.
  The configurations are correct on direct inspection (trust proxy=1 semantics, helmet options, literal serializer return bodies), so no current defect — but the plan's executed-evidence bar was set precisely because source-inspection tests are this repository's known defect class, and regression protection is materially weaker than the plan required. This also confirms the user's suspicion that upstream verifier PASS verdicts overstated test sufficiency.

NOTE
- apps/web/next.config.mjs:26 - The script-src 'unsafe-inline' justification comment (and docs/features/web-shell.md) says nonce/hash migration 'is tracked in docs/deferred-tasks.md (CSP nonce hardening)' — no such register entry exists. The register is editable only during planning cycles, so the entry could not be added in this cycle; the claim is currently false.
  The next planning cycle must add the CSP nonce/hash hardening entry (see follow-ups) or the comment/doc should stop claiming it is tracked.
- apps/api/src/index.ts:46 - The API disables helmet's CSP entirely (contentSecurityPolicy: false) rather than shipping 'the helmet baseline minus HSTS' literally; the in-code comment and docs/development/api-conventions.md document the JSON-only rationale and the Swagger exception decision explicitly.
  Defensible deviation for a JSON-only API (CSP matters for browser-rendered surfaces; Swagger is dev-only), and the specialist security stage accepted it — recorded here so the deviation from the AC's literal wording is a documented decision, not an oversight.
- apps/api/src/pages/entities/standalone-page.entity.ts:41 - The new currentRevision relation is defined (correct dual column+relation mapping, createForeignKeyConstraints: false) but is consumed by no product code and exercised by no enabled test — subtask-5 AC2's 'loading a page with the relation resolves its current revision' is unproven by any default-run test; the DB-gated integration suite (SFUS_DB_INTEGRATION=1) builds the entity metadata but does not load via relations:["currentRevision"].
  Boot-time entity-metadata validity was confirmed by this review's executed smoke validation (full stack boots), but the relation's load behavior remains untested until a consumer or a relation-loading test exists.
- apps/web/app/pages/pages.spec.ts:329 - The web reserved-slug spec asserts all eleven entries are present in the RESERVED_SLUGS declaration but does not pin cardinality or set equality (an extra twelfth entry would pass). The API-side test (pages.service.test.ts:589-619) does pin true set equality + cardinality. Register line 38's web half is therefore only partially strengthened from containment.
  The authoritative enforcement (API) is fully pinned; the web mirror guard retains a small drift window in one direction only.
- apps/api/src/pages/pages.controller.ts:243 - PageSummary includes updatedAt although the /pages index UI does not render it; the plan said to include updatedAt only 'if the UI shows it'. Trivial payload widening with no sensitive content.
  Minor contract/payload-minimization drift; harmless, but the field should either be rendered or dropped at next touch.
- apps/api/src/blog/blog.service.ts:197 - Explicit-slug writes (create with caller-supplied slug at blog.service.ts:197-208 and update at :234-236) still surface a raw duplicate-key error as an unhandled 500 on slug collision. This is outside the plan's scope (which covered only deriveUniqueSlug-consuming paths — exactly one, correctly enumerated) but is the same UX class the plan fixed for derived slugs.
  Candidate register entry for a future cycle: map explicit-slug duplicate-key errors to a controlled 409 envelope for parity.
- apps/api/src/media/markdown-sanitizer.ts:41 - The anchored regex patterns retain known residual bypass classes inherent to regex-over-HTML at the storage layer: e.g. an event handler after a quoted '>' inside an attribute value (<img alt="a>b" onerror=...>), a markdown destination with leading whitespace ('](  data:'), and reference-style link definitions ('[x]: data:...').
  Acceptable for a storage-contract pre-filter because the web layer (markdown-renderer.tsx) independently strips HTML and re-validates URI schemes at render time — the security stage's whole-subsystem review reached the same layered-defense conclusion. Recorded so the residual classes are explicit rather than assumed covered.

Missed functionality or edge cases:
- Navigation linkType-only update path (WARNING 2) is the only delivered-scope behavior gap found: an admin can still produce an internal item with a non-'/' URL via PATCH { linkType: "internal" } without a url change.
- No other plan-scoped functionality is missing: every acceptance criterion was either verified directly in code/executed tests by this review, or is covered by the WARNING findings above (false CSP justification; executed-evidence test gaps).
- Edge cases verified as handled: direct (un-proxied) dev connections under trust proxy=1; CSP in hybrid-dev (connect-src includes the WEB_API_ORIGIN-derived origin; img/media routes stay 'self' via the /api proxy); empty /pages index state; duplicate-key retry exhaustion (409) and non-duplicate error propagation (no swallowing); featuredMediaId null/absent fast paths at all three pages sites; moderator-role and all-children-filtered navigation visibility; statusCode===null network-failure mapping branch (executed).

Follow-up feature requests for planning:
- Small follow-up subtask: remove the unjustified `img-src data:` CSP allowance from apps/web/next.config.mjs (or supply a real consumer-based justification), and correct the three places that assert the false claim together: the in-code comment, docs/features/web-shell.md's CSP allowance list, and the pinning test next.config.spec.ts:165.
- Small follow-up subtask: close the navigation linkType-switch validation hole — in NavigationService.update(), revalidate the effective URL whenever the effective linkType becomes 'internal' (i.e. also when input.linkType is supplied without input.url); add the bypass test (PATCH linkType-only onto an item with an external/protocol-relative URL).
- Tester follow-up subtask: deliver the executed behavioral tests the plan mandated but did not receive — (a) a supertest-style proxy-hop test proving request.ip resolves from X-Forwarded-For under trust proxy=1; (b) API response-header emission assertions for the helmet baseline (nosniff present, Strict-Transport-Security absent, no CSP header); (c) an executed public-serializer test asserting the created/listed comment payload object contains no authorUserId/moderatedByUserId/moderatedAt keys.
- Next planning cycle (register edits, planner-owned): add the 'CSP nonce/hash hardening' entry that next.config.mjs and web-shell.md already reference; carry over the subtask-8 security report's M2 (header-only MIME validation — add magic-byte verification, keep SVG excluded); optionally record the explicit-slug duplicate-key 500 parity gap and the web reserved-slug cardinality pinning gap; remove the register entries closed by this plan.

Artifacts written:
- artifacts/deferred-cleanup/reviewer_report.md
- artifacts/deferred-cleanup/reviewer_result.json

Final outcome:
- CONDITIONAL PASS
