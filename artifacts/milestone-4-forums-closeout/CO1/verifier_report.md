Verifier Report

Scope reviewed:
- CO1 - Link-limiter word-boundary guard for bare schemes. Implementer added a word-boundary guard to scanBareUrls() in apps/api/src/common/throttle/link-limit.ts (line 121) so that bare schemes from BARE_SCHEMES are counted only when charBefore is in WORD_BOUNDARY_CHARS AND charBefore !== '('. Tester added 16 new tests (51 total, up from 35) covering all five acceptance criteria. Documenter updated docs/development/api-conventions.md to describe the word-boundary requirement for bare schemes. Specialist Security review ran and returned PASS (0 blocking, 0 warning, 4 informational).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-closeout-plan.md, subtask CO1 (lines 117-206), acceptance criteria AC1-AC5; AC6 (toolchain/build) confirmed by Implementer but not re-run by verifier.

Convention files considered:
- AGENTS.md
- docs/development/testing.md
- docs/development/api-conventions.md

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/common/throttle/link-limit.ts:38 - WORD_BOUNDARY_CHARS includes '(' as a member, so '(' passes WORD_BOUNDARY_CHARS.has() but is excluded by the explicit charBefore !== '(' guard on line 121. The two-step pattern (allow then exclude) is intentional and consistent with the www. branch and is correctly tested, but may be surprising to future readers.
  Not a defect. The logic is correct and all relevant cases are tested. Informational only.
- apps/api/src/common/throttle/link-limit.ts:121 - Security assumption forwarded from specialist Security review: the guard's more-permissive-for-bare-schemes direction is non-exploitable only because the in-house markdown renderer (apps/web/components/markdown-renderer.tsx) has no bare-URL autolinker. If an autolinker is ever added, WORD_BOUNDARY_CHARS should be re-evaluated against that autolinker's boundary rules.
  Specialist Security review returned PASS (0 blocking, 0 warning, 4 informational). The verifier accepts this forwarded assumption and records it here so that any future addition of a bare-URL autolinker triggers re-evaluation.

Test sufficiency assessment:
- Sufficient. 16 new tests cover AC2 negatives (hotel:, motel:, xmailto:, a-tel:, inlined_mailto: -> 0), AC3 positives (mailto:/tel: at start-of-string, after space, newline, tab, '>', '['), AC4 markdown-link single-count (no double-count, no skipPositions regression), and AC5 mixed-body fail-safe (boundary-preceded schemes in a mixed body count correctly; hotel:x and tel:+1 -> 1). All 51 tests verified passing by the verifier: npx pnpm --filter @sfus/api exec vitest run src/common/throttle/link-limit.test.ts returned 51 passed, 0 failed.

Documentation accuracy assessment:
- Accurate. docs/development/api-conventions.md (lines 168-171) now states bare http://, https://, ftp://, mailto:, and tel: URIs are counted only at a word boundary, with explicit examples (hotel:, motel: not counted). This matches the implementation and the tests exactly. No other doc describes per-post link-counting tokens; no further update is required.

Artifacts written:
- artifacts/milestone-4-forums-closeout/CO1/verifier_report.md
- artifacts/milestone-4-forums-closeout/CO1/verifier_result.json

Verdict:
- PASS
