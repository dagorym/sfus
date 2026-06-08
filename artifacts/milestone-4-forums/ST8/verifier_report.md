Verifier Report

Scope reviewed:
- ST8 rate-limit/throttle module after Security-driven remediation (pass 2). Implementer, Tester, Documenter, and Security (pass 2) changes reviewed.
- Implementation: apps/api/src/common/throttle/ (link-limit.ts, throttle.service.ts, throttle.guard.ts, throttle-store.ts, throttle.module.ts, throttle.types.ts), apps/api/src/config/environment.ts, apps/api/src/app.module.ts, apps/api/.env.example.
- Tests: link-limit.test.ts (35 tests), throttle.service.test.ts (18 tests), throttle.guard.test.ts (8 tests, new), throttle-store.test.ts (8 tests), throttle-env.test.ts (21 tests), plus cascading env-fixture updates in auth/database/health/media test files.
- Documentation: docs/development/api-conventions.md (rate-limiting/anti-spam section), docs/operations/launch.md (THROTTLE_* env var table).
- Security artifacts consulted: artifacts/milestone-4-forums/ST8/security_report.md and security_result.json (CONDITIONAL PASS, 0 blocking, 1 warning, 6 notes). Pass-1 FAIL artifacts preserved under artifacts/milestone-4-forums/ST8/history/security-1-fail/.
- Validation re-run from worktree: 521 tests passed, 2 DB-gated skips. Lint PASS. Typecheck PASS. API tsc build PASS (CommonJS/NodeNext). All throttle suites green.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md ST8 section: over-limit 429 envelope, under-limit pass, userId-over-IP identity, new-account tier, link-count limiter, IThrottleStore seam, 5 THROTTLE_* env vars validated, API tsc build.
- Task prompt ACs: AC1 (429 envelope + identity resolution + new-account tier), AC2 (link-limit), AC3 (IThrottleStore seam), AC4 (env var validation + cross-field check), plus Security-remediation ACs (ReDoS resolved, evasion detection, fail-closed on store error, env-example accurate, api-conventions.md accurate).
- Risk R2: throttle correctness / fail-open (plans/milestone-4-forums-plan.md).

Convention files considered:
- AGENTS.md -- single-source-of-truth rule, agent workflow policy.
- docs/development/api-conventions.md -- rate-limiting contract section (updated by this subtask).
- docs/operations/launch.md -- canonical env-variable table (updated by this subtask).
- docs/development/agent-retrospective-patterns.md -- P1 (no stale docs), P4/P5 (toolchain), P7 (breadth).

Findings

BLOCKING
- None

WARNING
- apps/api/src/common/throttle/link-limit.ts:104-124 - mailto: and tel: bare-scheme detection lacks a leading word-boundary guard -- over-counts substrings like 'hotel:' or 'cartel:'
  Forwarded unchanged from the Security CONDITIONAL PASS report (security_report.md). The over-count direction is fail-safe: the limiter is stricter, never weaker, and cannot be used to bypass the link cap. Real-world impact is limited to occasionally rejecting a legitimate post whose prose happens to contain a word like 'hotel:' or 'motel:' -- rare in normal Markdown. Not a security bypass; not a blocking concern for ST8. The security reviewer recommends ST9 add a leading word-boundary guard for mailto:/tel: to reduce false rejections. No independent severity escalation by this reviewer.

NOTE
- apps/api/src/common/throttle/link-limit.ts:22-182 - ReDoS fix confirmed genuine -- linear indexOf scanner processes 1 MB pathological body in < 1 ms empirically
  The old backtracking regex (MARKDOWN_LINK_RE) is gone. countLinks() is a pure indexOf scanner (scanMarkdownLinks + scanBareUrls) bounded by MAX_SCAN_BYTES=262144 (256 KB). No regex with unbounded repetition runs on attacker-controlled input. ReDoS regression test (link-limit.test.ts:135-162) is non-vacuous: the 1 MB body ']('.repeat(500000) would cause the old regex to hang (quadratic time); the new scanner handles it in well under 100 ms.
- apps/api/src/common/throttle/throttle.guard.ts:66 - userCreatedAt is permanently null in ST8 -- new-account tier is dormant by design; api-conventions.md accurately documents this
  The guard declares 'const userCreatedAt: Date | null = null' and never reassigns it (const prevents reassignment). ThrottleService.checkRequest() receives null and correctly skips the new-account tier check (isNewAccount requires both userId and userCreatedAt truthy). The doc states the tier activates in ST9. This is intentional ST8 scope, not a defect.
- apps/api/src/common/throttle/throttle.guard.ts:79-88 - Fail-closed on store error -- session errors caught; store errors propagate -- proven non-vacuously by throttle.guard.test.ts
  The guard wraps only session resolution in try/catch; store.hit() propagates uncaught out of ThrottleService.checkRequest() into canActivate() and up to NestJS (500 denial). Three guard tests cover: (a) throwing store => canActivate rejects (fail-closed); (b) session error + working store => returns true with IP-keyed identity; (c) non-vacuous combined scenario proving the semantic distinction. All 8 guard tests pass.
- apps/api/src/common/throttle/link-limit.ts:163-171 - 256 KB scan cap means links beyond first 256 KB are not counted -- intentional DoS tradeoff, not a current vulnerability
  Current Express/NestJS default body cap (~100 KB) is well below the 256 KB window, so uncounted links cannot be reached under current topology. ST9 should revisit if body limit is raised. Documented behavior as noted in security report.
- apps/api/src/config/environment.ts:243-244 - Cross-field NaN comparison is safe -- parseInteger returns range.min on missing input, preventing spurious cross-field errors
  When either THROTTLE_NEW_ACCOUNT_MAX_HITS or THROTTLE_MAX_HITS is missing/invalid, parseInteger() returns range.min (1). 1 > 1 is false, so no spurious cross-field error fires alongside the primary parse error. The validation logic is correct and the error messages are accurate.

Test sufficiency assessment:
- Sufficient. All AC-mapped test paths are covered. 521 tests pass (2 DB-gated skips), verified by this reviewer from the worktree. Throttle suites: link-limit.test.ts (35), throttle.service.test.ts (18), throttle.guard.test.ts (8), throttle-store.test.ts (8), throttle-env.test.ts (21).
- AC1: identity resolution (userId-over-IP, XFF-not-read), 429 envelope fields, at-limit pass, over-limit throw, retryAfter >= 1, new-account tier (young/established/guest/null-createdAt cases) all covered in throttle.service.test.ts.
- AC2: Markdown link counting, bare URL counting, no double-counting, evasion schemes (ftp/mailto/tel/www.), ReDoS regression (1 MB body < 100 ms), exceedsLinkLimit boundary cases all covered in link-limit.test.ts.
- AC3: IThrottleStore seam proven with test doubles in throttle.service.test.ts and throttle-store.test.ts.
- AC4: All five env var required/range/cross-field cases covered in throttle-env.test.ts (21 tests).
- Security-remediation ACs: ReDoS regression non-vacuous; fail-closed proven via throwing-store contract tests in throttle.guard.test.ts; evasion detection cases in link-limit.test.ts.
- Residual non-blocking gaps noted by security reviewer: no test pins the mailto:/tel: substring false-positive boundary; no test pins the 256 KB scan-cap completeness boundary. Both non-exploitable, appropriate for ST9.

Documentation accuracy assessment:
- Accurate. docs/development/api-conventions.md correctly states: (1) new-account tier is dormant in ST8 (guard passes userCreatedAt: null), activates in ST9 -- verified accurate against throttle.guard.ts:66; (2) link scanner is linear indexOf-based with 256 KB cap; (3) evasion schemes counted (ftp/mailto/tel/www.); (4) guard never reads X-Forwarded-For directly; (5) 429 envelope shape and retryAfter semantics; (6) IThrottleStore seam and Redis-swap path.
- docs/operations/launch.md lists all five THROTTLE_* vars with ranges and cross-field constraint.
- apps/api/.env.example provides working defaults for all five THROTTLE_* vars with inline comments.
- No stale doc text detected. No doc drift from implementation. P1 compliance confirmed.

Artifacts written:
- artifacts/milestone-4-forums/ST8/verifier_report.md
- artifacts/milestone-4-forums/ST8/verifier_result.json

Verdict:
- PASS
