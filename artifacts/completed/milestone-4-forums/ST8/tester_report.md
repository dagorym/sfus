# Tester Report

Status:
- success

Task summary:
- ST8 Security Remediation Pass 2: validated three security fixes — (1) linear indexOf-based ReDoS-safe link scanner replacing backtracking regex in link-limit.ts; (2) broadened evasion detection for ftp://, mailto:, tel:, www.-prefixed hosts; (3) THROTTLE_* env vars added to .env.example. All existing 498 API tests unchanged and passing; 35 new link-limit tests and 8 new guard tests added.

Branch name:
- ms4-st8-tester-20260608

Test commit hash:
- 2b49393

Test files added or modified:
- apps/api/src/common/throttle/link-limit.test.ts
- apps/api/src/common/throttle/throttle.guard.test.ts

Commands run:
- pnpm install --frozen-lockfile
- pnpm --filter @sfus/api test --dir /home/tstephen/repos/worktrees/ms4-st8-tester-20260608
- node .../eslint.js --max-warnings=0 apps/api/src/common/throttle/ (all clean)
- node .../tsc -p apps/api/tsconfig.json --noEmit (no errors)

Pass/fail totals:
- failed: 0
- passed: 814
- skipped: 2
- total_test_files: 34

Unmet acceptance criteria:
- None

Final test outcomes:
- PASS — 814 tests passed, 2 skipped (integration DB tests, expected), 0 failed
- PASS AC1 — over-limit throws 429; under-limit passes; identity prefers userId over request.ip; new-account tier applies to young accounts (throttle.service.test.ts: 18 tests)
- PASS AC2 — link-count limiter rejects over-max bodies and accepts compliant ones; no double-counting (link-limit.test.ts: 35 tests)
- PASS AC3 — IThrottleStore seam proven via test-double injection; service calls only store.hit() (throttle.service.test.ts + throttle-store.test.ts)
- PASS AC4 — all 5 THROTTLE_* env vars validated; missing/invalid values cause startup failure; cross-field check enforced (throttle-env.test.ts: 21 tests)
- PASS AC-Security-ReDoS — 1 MB pathological body (']('.repeat(500000)) completes in <100 ms; 64 KB variant completes in <20 ms (link-limit.test.ts: 2 new timing tests)
- PASS AC-Security-Evasion — ftp://, mailto:, tel:, and www.-prefixed bare hosts each counted; evasion URLs mix correctly without double-counting (link-limit.test.ts: 12 new tests)
- PASS AC-Security-FailClosed — throwing IThrottleStore causes ThrottleGuard.canActivate() to propagate the error (rejects), never returns true; session errors are distinguished from store errors (throttle.guard.test.ts: 3 fail-closed tests)
- DOCUMENTER NOTE (P1): docs/development/api-conventions.md overstates that the throttle guard supplies userCreatedAt. Guard actually passes userCreatedAt: null; ST9 wires real user context. This must be corrected in documentation.

Cleanup status:
- tester_input.json written as transient tool input; not a committed test artifact
- No other non-handoff byproducts remain

Artifacts written:
- artifacts/milestone-4-forums/ST8/tester_report.md
- artifacts/milestone-4-forums/ST8/tester_result.json
- artifacts/milestone-4-forums/ST8/documenter_prompt.txt
