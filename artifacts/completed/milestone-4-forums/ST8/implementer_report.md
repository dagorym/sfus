# Implementer Report

Status:
- success

Task summary:
- ST8 Security Remediation Pass 2: Fixed blocking ReDoS in link-limit.ts, broadened evasion detection, and added THROTTLE_* env vars to .env.example

Changed files:
- apps/api/src/common/throttle/link-limit.ts
- apps/api/.env.example

Validation commands run:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm --filter @sfus/api exec tsc -p tsconfig.json --noEmit

Validation outcome:
- All pass. 498 tests passed (2 skipped - DB integration gated by SFUS_DB_INTEGRATION=1). Lint clean. Typecheck clean. API tsc build clean.

Implementation/code commit hash:
- 3e632acfd2b36997efb2a5e1c0d310a3fc72ebcd

Artifacts written:
- artifacts/milestone-4-forums/ST8/implementer_report.md
- artifacts/milestone-4-forums/ST8/tester_prompt.txt
- artifacts/milestone-4-forums/ST8/implementer_result.json

Implementation context:
- Security remediation pass 2 for ST8. Three fixes applied:
- (1) BLOCKING ReDoS: replaced backtracking /\]\([^)]*\)/g regex in link-limit.ts with linear indexOf-based scanner (scanMarkdownLinks + scanBareUrls). Old regex: 1211 ms for 64 KB pathological input. New implementation: under 1 ms on 1 MB. MAX_SCAN_BYTES=262144 caps work.
- (2) Evasion broadening: bare-URL detection now also counts ftp://, mailto:, tel:, and www.-prefixed bare hosts via indexOf-only scanning. www. detection requires word boundary (space/tab/newline/bracket).
- (3) Deploy-env footgun: all five THROTTLE_* vars added to tracked apps/api/.env.example with sane defaults (THROTTLE_WINDOW_MS=60000, THROTTLE_MAX_HITS=100, THROTTLE_NEW_ACCOUNT_MAX_HITS=20, THROTTLE_NEW_ACCOUNT_WINDOW_MS=604800000, THROTTLE_MAX_LINKS_PER_POST=10).
- All 498 existing tests pass unchanged (20 link-limit, 29 throttle-env, 11 throttle-service, etc.).
- DOCUMENTER NOTE (P1): docs/development/api-conventions.md overstates that the throttle guard supplies userCreatedAt. Guard actually passes userCreatedAt: null; ST9 wires real user context. Doc must be corrected.

Expected validation failures carried forward:
- None
