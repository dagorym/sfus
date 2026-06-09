# Tester Report

Status:
- success

Task summary:
- Added word-boundary guard to scanBareUrls() in apps/api/src/common/throttle/link-limit.ts. A bare scheme (mailto:, tel:, http://, etc.) is now only counted when the character immediately before it is in WORD_BOUNDARY_CHARS and is not '('. This prevents embedded scheme substrings like 'hotel:', 'motel:', or 'xmailto:' from inflating the per-post link count. Tester added 16 new tests (51 total, up from 35) covering all 5 acceptance criteria.

Branch name:
- ms4a-CO1-tester-20260608

Test commit hash:
- d8cd91ad94581bd975b19b24ae71ab0c7cc139f8

Test files added or modified:
- apps/api/src/common/throttle/link-limit.test.ts

Commands run:
- npx --yes pnpm@10.0.0 --dir /home/tstephen/repos/worktrees/ms4a-CO1-tester-20260608 --filter @sfus/api exec vitest run src/common/throttle/link-limit.test.ts

Pass/fail totals:
- failed: 0
- passed: 51
- skipped: 0

Unmet acceptance criteria:
- None

Final test outcomes:
- 51/51 tests passing (35 pre-existing + 16 new)
- AC1 PASS: word-boundary guard verified — charBefore must be in WORD_BOUNDARY_CHARS and not '('
- AC2 PASS: hotel:, motel:, xmailto:, a-tel:, inlined_mailto: all return 0
- AC3 PASS: mailto:/tel: at string start and after space/newline/tab/>/[ each return 1
- AC4 PASS: '[x](mailto:user@example.com)' and '[call](tel:+15551234)' each return 1 (skipPositions not regressed)
- AC5 PASS: mixed-body with 4 boundary-preceded evasion schemes returns 4; hotel: + tel: combo returns 1
- The 4 other throttle test files require @nestjs/common and dotenv which are absent from the worktree node_modules; those 55 tests confirmed 90/90 passing from the main sfus workspace

Cleanup status:
- tester_artifact_input.json is a required tool-input file retained in the artifact directory
- No temporary byproducts were created outside the artifact directory

Artifacts written:
- artifacts/milestone-4-forums-closeout/CO1/tester_report.md
- artifacts/milestone-4-forums-closeout/CO1/tester_result.json
- artifacts/milestone-4-forums-closeout/CO1/documenter_prompt.txt
