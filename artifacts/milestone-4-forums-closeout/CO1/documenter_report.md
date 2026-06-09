# Documenter Report

Status:
- success

Task summary:
- CO1 — Link-limiter word-boundary guard for bare schemes. Added a word-boundary guard to scanBareUrls() in apps/api/src/common/throttle/link-limit.ts so that bare schemes (mailto:, tel:, http://, ftp://) are only counted when the preceding character is in WORD_BOUNDARY_CHARS and is not '('. This prevents embedded scheme substrings like 'hotel:', 'motel:', or 'xmailto:' from inflating the per-post link count. Tester added 16 new tests (51 total, up from 35) covering all 5 acceptance criteria. Documenter updated docs/development/api-conventions.md to reflect that bare schemes are counted at word boundaries only.

Branch name:
- ms4a-CO1-documenter-20260608

Documentation commit hash:
- 64014f6

Documentation files added or modified:
- docs/development/api-conventions.md

Commands run:
- npx --yes pnpm@10.0.0 --dir /home/tstephen/repos/worktrees/ms4a-CO1-tester-20260608 --filter @sfus/api exec vitest run src/common/throttle/link-limit.test.ts

Final test outcomes:
- 51/51 tests passing (35 pre-existing + 16 new)
- AC1 PASS: word-boundary guard verified — charBefore must be in WORD_BOUNDARY_CHARS and not '('
- AC2 PASS: hotel:, motel:, xmailto:, a-tel:, inlined_mailto: all return 0
- AC3 PASS: mailto:/tel: at string start and after space/newline/tab/>/[ each return 1
- AC4 PASS: '[x](mailto:user@example.com)' and '[call](tel:+15551234)' each return 1 (skipPositions not regressed)
- AC5 PASS: mixed-body with 4 boundary-preceded evasion schemes returns 4; hotel: + tel: combo returns 1

Assumptions:
- Plan path inferred as plans/milestone-4-forums-closeout-plan.md from CO1 subtask context.
- Comparison base inferred as ms4a from handoff context.
- No in-code file-header update required — scanBareUrls() already has an accurate inline comment (added by Implementer); no repository-mandated file-level docblock exists for this file.

Artifacts written:
- artifacts/milestone-4-forums-closeout/CO1/documenter_report.md
- artifacts/milestone-4-forums-closeout/CO1/documenter_result.json
- artifacts/milestone-4-forums-closeout/CO1/verifier_prompt.txt
