Verifier Report

Scope reviewed:
- Implementer (commit 95c4b19): apps/web/next.config.mjs — added buildCsp() and headers() export with enforced Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy applied to all routes. apps/api/src/index.ts — added helmet import and app.use(helmet({strictTransportSecurity: false, contentSecurityPolicy: false})) in apiBootstrap(). apps/api/package.json — added helmet ^8.0.0 as production dependency.
- Tester (commit f02f356): apps/web/next.config.spec.ts — 11 new tests covering AC1/AC2/AC4/AC5 (baseline headers on every route, CSP enforced not report-only, no HSTS, connect-src localhost only in dev, unsafe-inline and data: allowances verified). apps/api/src/index.test.ts — 2 new tests verifying helmet middleware registered before setGlobalPrefix (AC2) and bootstrap success confirming strictTransportSecurity: false is valid (AC5).
- Documenter (commit f39ba30): docs/features/web-shell.md — added Security headers section with header table, full CSP directive table, per-allowance justifications, and HSTS omission rationale. docs/development/api-conventions.md — added Security headers section documenting helmet middleware with both disabled options and their reasons.

Acceptance criteria / plan reference:
- plans/deferred-cleanup-plan.md — subtask-2 (lines 131-160), five acceptance criteria: AC1 every web route has full baseline headers with enforced CSP; AC2 every API route has helmet baseline minus HSTS; AC3 core flows pass with zero CSP violations and smoke passes; AC4 every CSP allowance beyond self has in-code justification; AC5 no Strict-Transport-Security emitted by either app.

Convention files considered:
- AGENTS.md — single-source-of-truth rule, no-restatement rule, doc-update obligations, docs/deferred-tasks.md planner-only edit restriction.
- CLAUDE.md — pointer to AGENTS.md.
- docs/README.md — routing table: next.config.mjs changes -> docs/features/web-shell.md; API bootstrap changes -> docs/development/api-conventions.md.

Findings

BLOCKING
- None

WARNING
- apps/web/next.config.mjs:54 - style-src 'unsafe-inline' lacks an in-code justification comment (AC4 partial gap)
  AC4 requires every CSP allowance beyond 'self' to carry an in-code justification comment. The JSDoc block comment (lines 17-40) documents justifications for script-src unsafe-inline, connect-src http://localhost:3001, and img-src data: but omits a justification for style-src unsafe-inline at line 54. The inline comment at line 52 ('unsafe-inline' required for Next.js 15 hydration scripts) precedes the script-src line only and does not cover style-src. CSS Modules and Next.js CSS injection would be the appropriate justification but it is absent. The CSP posture is technically sound and the allowance is correct, but AC4 is not fully satisfied.
- docs/operations/deployment.md:94 - docs/operations/deployment.md not updated with HSTS enforcement-point statement
  The plan (plans/deferred-cleanup-plan.md line 159-160) listed docs/operations/deployment.md as a documentation impact file requiring an enforcement-point statement documenting that HSTS is handled at the proxy layer. The documenter updated docs/features/web-shell.md and docs/development/api-conventions.md but did not update docs/operations/deployment.md. The existing file describes proxy-level TLS termination (line 94-98) but does not explicitly state HSTS is proxy-owned and deliberately omitted from the app layer. In-code comments in next.config.mjs and index.ts compensate partially, but the deployment runbook is incomplete relative to the plan's documentation scope.

NOTE
- apps/api/src/index.test.ts:201 - AC5 test does not directly assert strictTransportSecurity: false is passed to helmet
  The test at lines 201-217 verifies bootstrap succeeds and app.use() is called but does not capture the specific option object passed to helmet(). The test comment acknowledges this limitation. The test is indirect but valid because helmet itself is not mocked, so malformed options would cause helmet to throw and fail bootstrap. AC5 is primarily enforced by structural audit of the implementation rather than a direct option assertion.
- apps/web/next.config.spec.ts:152 - Test bundles style-src assertion under Next.js hydration description without separate justification
  The test at lines 152-163 is named 'includes script-src and style-src with unsafe-inline for Next.js hydration' and asserts both directives in one expectation block. Since style-src lacks an independent in-code justification, the test naming implies the same rationale applies to both, which is imprecise. Low-risk naming issue related to the WARNING above.

Test sufficiency assessment:
- 11 new tests in next.config.spec.ts and 2 in index.test.ts (13 total). AC1 (all 5 headers present, CSP enforced not report-only), AC4 (per-allowance assertions), and AC5 (no HSTS on web) are well-covered in next.config.spec.ts. AC2 (helmet registered before setGlobalPrefix) is covered in index.test.ts. Both dev and production CSP variants are tested. No regressions across 275 web and 358 API tests (1 pre-existing API failure unrelated to this change). The AC5 HSTS test in index.test.ts cannot directly assert strictTransportSecurity:false due to mock architecture limitations, but this is acceptable given bootstrap-success validation and structural audit. Test sufficiency is adequate for the acceptance criteria.

Documentation accuracy assessment:
- docs/features/web-shell.md accurately describes all five security headers, the full CSP directive table, per-allowance justifications, and the HSTS omission rationale with cross-reference to the architecture decision document. docs/development/api-conventions.md accurately describes the helmet middleware with both disabled options and their reasons, and correctly references the web layer CSP. Both documents are consistent with the implementation. One gap: docs/operations/deployment.md was not updated with an enforcement-point statement on HSTS being proxy-owned, as the plan specified. The HSTS rationale is adequately captured in the feature and development docs plus in-code comments, so this is a completeness gap rather than an inaccuracy.

Artifacts written:
- artifacts/deferred-cleanup/subtask-2/verifier_report.md
- artifacts/deferred-cleanup/subtask-2/verifier_result.json

Verdict:
- CONDITIONAL PASS
