Security Review Report

Scope reviewed:
- Milestone 4 subtask ST7 change set vs base ms4: the CommonJS-safe supertest-class HTTP harness plus the two folded-in executed tests (proxy-hop request.ip + helmet baseline headers).
- apps/api/src/test-harness.ts - exported createTestApp() helper (trust proxy=1, helmet HSTS/CSP off, built-in /api/test/echo-ip route).
- apps/api/src/http.integration.test.ts - 5 executed tests across two groups (proxy-hop, helmet baseline).
- apps/api/package.json + pnpm-lock.yaml - added dev dependencies supertest, @types/supertest, express.
- Cross-checked against production apps/api/src/index.ts (trust proxy + helmet config) for faithful mirroring.
- Validated current state in this worktree: pnpm install --frozen-lockfile, @sfus/api build (tsc -p), @sfus/api lint (eslint --max-warnings=0), and vitest run src/http.integration.test.ts (5 passed). Empirically probed Express 5.2.1 trust-proxy behavior (single-hop, multi-hop, over-trust, disabled) using the express@5.2.1 resolved in the lockfile.

Why specialist review was triggered:
- Trusted-proxy IP resolution is a security property: request.ip is the identity the downstream ST8/ST9 throttle / anti-abuse layer keys off (plan ST8: identity falls back to proxy-resolved client IP). If proxy-hop handling is wrong, rate limiting can be evaded or mis-attributed.
- The plan marks ST7 'Security review: required' and requires confirming the proxy-hop test actually proves the property (P3), not via a mocked setter and not against a divergent test-only Express config.
- The helmet baseline (X-Content-Type-Options: nosniff present; Strict-Transport-Security absent; Content-Security-Policy absent) is an asserted security posture that must be proven on a real HTTP response and cannot pass vacuously.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md - ST7 (lines 258-274): AC = executed proxy-hop test asserts request.ip equals injected X-Forwarded-For client address (not a mocked setter); executed helmet test asserts the three header conditions on a real HTTP response; harness is a reusable exported helper, CommonJS-safe (no import.meta), API tsc build passes. 'Security review: required - trusted-proxy IP resolution is a security property; confirm the test actually proves it (P3).'
- docs/architecture/milestone-1-foundation-decisions.md - Security And Proxy Behavior (lines 116-119): trusted proxy behavior configured for the expected reverse-proxy topology only; baseline security-header/CSP direction; line 117 referenced by index.ts as the locked trust-proxy decision.
- docs/development/agent-retrospective-patterns.md - P3 (lines 61-80): tests must exercise the security property from the contract, not mirror the implementation; Verifier lens 'would this suite fail if the behavior regressed?'.

Findings

BLOCKING
- None

WARNING
- apps/api/src/http.integration.test.ts:47 - CONCERN: the proxy-hop test uses a single-entry X-Forwarded-For ('203.0.113.42'), which cannot distinguish trust proxy=1 from an over-trust regression (trust proxy=2 or higher). Recommend adding a multi-hop XFF assertion proving a spoofed leftmost entry is rejected.
  Empirically (Express 5.2.1, the same version production resolves via @nestjs/platform-express): with trust proxy=1 a request whose XFF is '1.1.1.1, 203.0.113.42' resolves request.ip='203.0.113.42' (spoofed leftmost rejected - SAFE); but with trust proxy=2 the SAME request resolves request.ip='1.1.1.1' (attacker spoof ACCEPTED). With only a single XFF entry, both trust proxy=1 and trust proxy=2 yield '203.0.113.42', so the current test passes under either. It therefore catches the 'trust proxy disabled' regression (confirmed: trust proxy unset/0 -> request.ip=loopback, test would FAIL) but NOT the over-trust regression - and over-trust is the spoofing direction that would let an attacker forge the client IP and evade or mis-attribute the ST8/ST9 throttle. Non-blocking because production is currently correctly trust proxy=1 and the AC does not mandate multi-hop coverage; forward to Verifier / ST8-ST9 as a hardening recommendation (one extra assertion with a two-entry XFF closes the gap).

NOTE
- apps/api/tsconfig.json:11 - INFO: tsconfig include 'src/**/*.ts' compiles test-harness.ts and http.integration.test.ts into dist/ (verified: dist/test-harness.js and dist/http.integration.test.js are emitted). The /api/test/echo-ip harness route ships into the image as dead code.
  Not exploitable: production runtime is CMD ['node','dist/index.js'] only; index.ts builds the app via NestFactory and never imports test-harness.ts, so createTestApp() and its /api/test/echo-ip route are never instantiated and the route cannot be reached in production (confirmed by grep: createTestApp/echo-ip referenced only by the test file). This is a pre-existing repo-wide pattern - all *.test.ts already compile into dist the same way - so ST7 does not regress build hygiene. Optional future cleanup: exclude *.test.ts and test-harness.ts from the production tsconfig build.
- apps/api/package.json:36 - INFO: the three added packages (supertest 7.2.2, @types/supertest 7.2.0, express 5.2.1) are all in the devDependencies block (confirmed in pnpm-lock.yaml apps/api devDependencies); express@5.2.1 resolves to the SAME version production already uses transitively via @nestjs/platform-express@11.1.17, and helmet is the shared production ^8.0.0 (8.2.0). No production-surface or version-drift concern; caret pinning matches repo convention.
  Confirms the harness exercises the identical Express trust-proxy engine and identical helmet version as production, so the tests prove the same behavior production exhibits, and no new runtime dependency reaches the production bundle (no supertest import in non-test source; production express usage is type-only).

Test sufficiency assessment:
- ADEQUATE for the ST7 acceptance criteria, with one forwarded hardening concern. The proxy-hop test is real and non-vacuous: it issues an actual HTTP request through supertest to the harness app and asserts request.ip == the injected X-Forwarded-For value (not a mocked setter), satisfying P3 and the AC. Empirically confirmed the assertion FAILS under the primary regression (trust proxy unset or 0 -> request.ip resolves to loopback, not the XFF value), so it would catch a break of client-IP resolution.
- The harness security config is a faithful, NON-divergent mirror of production index.ts: app.set('trust proxy', 1) == index.ts line 45 getInstance().set('trust proxy', 1); helmet({strictTransportSecurity:false, contentSecurityPolicy:false}) == index.ts lines 66-74; same helmet ^8.0.0 and same express 5.2.1. The tests therefore prove the production property, not a test-only one.
- The three helmet assertions execute against a real HTTP response and are non-vacuous: nosniff is asserted == 'nosniff' (positive), HSTS and CSP are asserted toBeUndefined (would fail if helmet defaults re-enabled them).
- Residual gap (WARNING, forwarded): single-entry XFF does not exercise the multi-hop spoof / over-trust case, which is the spoofing direction relevant to the ST8/ST9 anti-abuse identity. A two-entry-XFF assertion would close it.
- The two config sites (harness and production index.ts) can in principle drift silently because they are hand-duplicated rather than sharing one source; no automated guard ties them together. Currently identical; flagged so a future change to one is mirrored to the other (relevant when ST8/ST9 reuse the harness).

Documentation / operational guidance assessment:
- Sufficient for this test-infrastructure change. ST7 Documentation Impact is correctly 'none (test infrastructure; no behavior change)'.
- The harness and test files are well self-documented and cite the locked decisions (milestone-1-foundation-decisions.md Security section, deployment.md trust-proxy note), matching the production index.ts rationale.
- No operational/runbook change is needed; HSTS-at-proxy and CSP-off decisions are already documented and unchanged.

Artifacts written:
- artifacts/milestone-4-forums/ST7/security_report.md
- artifacts/milestone-4-forums/ST7/security_result.json

Outcome:
- CONDITIONAL PASS
