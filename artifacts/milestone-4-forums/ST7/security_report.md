Security Review Report

Scope reviewed:
- Re-review (pass 2) of Milestone 4 subtask ST7 after a Verifier-driven remediation that responded to the single non-blocking CONCERN from the pass-1 CONDITIONAL PASS.
- Remediation under review: commit 6f40cfa 'test(ST7): add spoof-rejection assertion for two-hop XFF' — a single purely-additive executed test added to apps/api/src/http.integration.test.ts:79-92 ('rejects a spoofed leftmost entry in a two-hop X-Forwarded-For header'). git show confirms +35 lines, one file, no other source touched.
- apps/api/src/http.integration.test.ts — now 6 executed tests across two groups (proxy-hop: 3, helmet baseline: 3). The added test sends X-Forwarded-For: '1.1.1.1, 203.0.113.42' and asserts req.ip === '203.0.113.42' AND req.ip !== '1.1.1.1'.
- apps/api/src/test-harness.ts — exported createTestApp() helper (trust proxy=1, helmet HSTS/CSP off, /api/test/echo-ip route). Unchanged by the remediation; re-confirmed it still faithfully mirrors production.
- apps/api/src/index.ts — production bootstrap (trust proxy=1 at line 45; helmet { strictTransportSecurity:false, contentSecurityPolicy:false } at lines 66-74). Unchanged; cross-checked for continued faithful mirroring.
- Validation run in this worktree (ms4-st7-security-20260607): pnpm install --frozen-lockfile; @sfus/api lint (eslint --max-warnings=0) PASS; @sfus/api typecheck (tsc --noEmit) PASS; @sfus/api build (tsc -p) PASS; vitest run src/http.integration.test.ts -> 6 passed, with verbose reporter confirming the new spoof-rejection test is executed (not skipped).
- Empirical trust-proxy probe against the exact resolved express@5.2.1 + supertest@7.2.2 in apps/api/node_modules (same Express engine production uses transitively via @nestjs/platform-express@11.1.17).

Why specialist review was triggered:
- Trusted-proxy IP resolution is a security property: request.ip is the identity the downstream ST8/ST9 throttle / anti-abuse layer keys off (plan ST8: identity falls back to the proxy-resolved client IP). An over-trust regression (trust proxy>=2) would let an attacker prepend a forged leftmost X-Forwarded-For entry and evade or mis-attribute the throttle.
- Pass-1 returned CONDITIONAL PASS with exactly one non-blocking CONCERN: the proxy-hop test used a single-entry X-Forwarded-For, which passes under BOTH trust proxy=1 and trust proxy>=2 and therefore could not detect the over-trust spoofing regression. Pass 2 must confirm the remediation closes that detection gap non-vacuously (P3): executed, real HTTP request through real Express trust-proxy, both positive and negative assertions, and would fail if the behavior regressed.
- Plan marks ST7 'Security review: required' for trusted-proxy IP resolution as a security property (confirm the test actually proves it, P3).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST7 (lines 258-274): AC = executed proxy-hop test asserts request.ip equals the injected X-Forwarded-For client address (not a mocked setter); executed helmet test asserts the three header conditions on a real HTTP response; harness is a reusable exported helper, CommonJS-safe (no import.meta), API tsc build passes. 'Security review: required — trusted-proxy IP resolution is a security property; confirm the test actually proves it (P3).'
- docs/architecture/milestone-1-foundation-decisions.md — Security And Proxy Behavior (lines 116-119): trusted proxy behavior configured for the expected reverse-proxy topology only; baseline security-header/CSP direction. index.ts line 45 references line 117 as the locked single-hop trust-proxy decision; HSTS-at-proxy and CSP-off are the locked baseline.
- docs/development/agent-retrospective-patterns.md — P3: tests must exercise the security property from the contract, not mirror the implementation; verifier lens 'would this suite fail if the behavior regressed?'.

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/http.integration.test.ts:79 - RESOLVED — the pass-1 over-trust detection CONCERN is closed. The new executed test 'rejects a spoofed leftmost entry in a two-hop X-Forwarded-For header' sends X-Forwarded-For: '1.1.1.1, 203.0.113.42' and asserts req.ip === '203.0.113.42' AND req.ip !== '1.1.1.1'.
  Confirmed executed (not skipped) via vitest --reporter=verbose (6/6 passed; the spoof test listed by name). It issues a real HTTP request through supertest to the harness app and reads the Express-resolved req.ip from /api/test/echo-ip — not a mocked setter — satisfying P3. Empirically non-vacuous on the exact resolved express@5.2.1 + supertest@7.2.2 (same engine production uses via @nestjs/platform-express@11.1.17): under the correct trust proxy=1, this two-hop XFF resolves req.ip='203.0.113.42' so BOTH assertions pass; under the over-trust regression trust proxy=2 the SAME request resolves req.ip='1.1.1.1', so both assertions FAIL — the test now catches the over-trust spoofing regression the pass-1 single-entry test was blind to (probe confirmed the old single-entry test passes under both trust=1 and trust=2). It also catches the disabled regression (trust unset -> req.ip=loopback -> fails). The exact spoofing direction relevant to ST8/ST9 anti-abuse identity is now guarded.
- apps/api/src/test-harness.ts:57 - No regression and no new test-to-production divergence from the remediation. The harness (trust proxy=1, helmet {strictTransportSecurity:false, contentSecurityPolicy:false}) and production index.ts were not touched by commit 6f40cfa; the remediation is purely additive test code.
  Re-verified the harness still faithfully mirrors production: test-harness.ts line 57 app.set('trust proxy', 1) == index.ts line 45; test-harness.ts lines 63-68 helmet config == index.ts lines 66-74; same helmet ^8.0.0 and same express 5.2.1 the production bundle resolves. The three helmet assertions (nosniff present; HSTS absent; CSP absent) remain executed and non-vacuous against a real HTTP response. lint, typecheck, and tsc build all pass in this worktree, so the new test introduced no type, lint, or build regression.
- apps/api/tsconfig.json:11 - Pre-existing INFO carried forward unchanged: tsconfig include 'src/**/*.ts' compiles test-harness.ts and http.integration.test.ts into dist/ (re-confirmed dist/test-harness.js and dist/http.integration.test.js emitted by the build). The remediation did not change this.
  Not exploitable: production runtime is CMD ['node','dist/index.js']; index.ts builds the app via NestFactory and never imports test-harness.ts, so createTestApp() and its /api/test/echo-ip route are never instantiated and cannot be reached in production. This is a repo-wide pre-existing pattern (all *.test.ts compile into dist the same way), so ST7 — including the remediation — does not regress build hygiene. Optional future cleanup: exclude *.test.ts and test-harness.ts from the production tsconfig build.
- apps/api/src/test-harness.ts:57 - Pre-existing INFO carried forward unchanged: the two trust-proxy/helmet config sites (test-harness.ts and production index.ts) are hand-duplicated rather than sharing one source, so they can in principle drift silently with no automated guard tying them together.
  Currently identical and re-verified identical in this pass. The remediation touched neither config site, so it neither worsened nor fixed this. Relevant when ST8/ST9 reuse the harness: a future change to one site must be mirrored to the other. Non-blocking; forwarded as a hardening observation only.

Test sufficiency assessment:
- ADEQUATE and now complete for the ST7 acceptance criteria — the single pass-1 hardening CONCERN is RESOLVED with no remaining forwarded security gap on the proxy-hop property.
- The remediation test is executed (vitest verbose: 6/6 passed, the spoof-rejection test listed by name — not skipped), exercises real Express trust-proxy behavior via a real supertest HTTP request reading req.ip from /api/test/echo-ip (P3 satisfied, not a mocked setter), and is non-vacuous on both directions: it asserts the positive (rightmost real IP resolved) and the negative (forged leftmost rejected). Empirically it FAILS under the over-trust regression (trust proxy=2 -> req.ip='1.1.1.1') and under the disabled regression (trust unset -> req.ip=loopback), so it would fail if the behavior regressed.
- The harness remains a faithful, non-divergent mirror of production (trust proxy=1; helmet HSTS/CSP off; same express 5.2.1 and helmet ^8.0.0), so the tests prove the production property and not a test-only one; the remediation introduced no new divergence.
- The three helmet assertions remain executed and non-vacuous against a real HTTP response (nosniff == 'nosniff' positive; HSTS and CSP toBeUndefined negative).
- Validation evidence run this pass in worktree ms4-st7-security-20260607: lint PASS, typecheck PASS, tsc build PASS, vitest run src/http.integration.test.ts -> 6 passed.

Documentation / operational guidance assessment:
- Sufficient and unchanged. ST7 Documentation Impact is correctly 'none (test infrastructure; no behavior change)' and the remediation is a pure test addition that does not alter documented behavior.
- The new test block is well self-documented, naming the over-trust regression it guards and the ST8/ST9 throttle rationale, and the harness/index.ts cite the locked MS1 Security decision and deployment trust-proxy note — consistent with the production rationale.
- No operational/runbook change is needed; the HSTS-at-proxy and CSP-off decisions remain documented and unchanged.

Artifacts written:
- artifacts/milestone-4-forums/ST7/security_report.md
- artifacts/milestone-4-forums/ST7/security_result.json

Outcome:
- PASS
