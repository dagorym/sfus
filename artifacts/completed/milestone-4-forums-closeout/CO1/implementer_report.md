# Implementer Report

Status:
- success

Task summary:
- Added word-boundary guard to the bare-scheme branch of scanBareUrls() in apps/api/src/common/throttle/link-limit.ts. A bare scheme (mailto:, tel:, http://, etc.) is now only counted when the character immediately before it is in WORD_BOUNDARY_CHARS and is not '('. This prevents embedded scheme substrings inside larger words (e.g. 'hotel:', 'motel:', inlined 'mailto:') from being over-counted toward the per-post link limit, while preserving all existing positive-count and no-double-count behaviour.

Changed files:
- apps/api/src/common/throttle/link-limit.ts

Validation commands run:
- npx --yes pnpm@10.0.0 --filter @sfus/api exec tsc --noEmit  →  PASS (exit 0, no output)
- npx --yes pnpm@10.0.0 --filter @sfus/api run build  →  PASS (exit 0)
- npx --yes pnpm@10.0.0 --filter @sfus/api exec eslint src/common/throttle/link-limit.ts --max-warnings=0  →  PASS (exit 0, no output)
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/common/throttle/link-limit.test.ts  →  PASS — 35/35 tests passed
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/common/throttle  →  PASS — 90/90 tests passed (5 files)
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run  →  PASS — 863 tests passed, 3 skipped (DB integration, expected)

Validation outcome:
- All validations passed. Zero regressions. The full API vitest suite (863 tests) and all throttle-specific tests pass.

Implementation/code commit hash:
- f5c1b2d

Artifacts written:
- artifacts/milestone-4-forums-closeout/CO1/implementer_report.md
- artifacts/milestone-4-forums-closeout/CO1/tester_prompt.txt
- artifacts/milestone-4-forums-closeout/CO1/implementer_result.json

Implementation context:
- The change is a one-line guard addition: `if (WORD_BOUNDARY_CHARS.has(charBefore) && charBefore !== '(')` replaces `if (charBefore !== '(')` in the bare-scheme loop inside scanBareUrls().
- WORD_BOUNDARY_CHARS = new Set(["", " ", "\t", "\n", "\r", ">", "(", "["]) — includes empty string (start of body), so a scheme at position 0 is still counted.
- The '(' exclusion is kept: it prevents any residual ](...) destinations that were not caught by skipPositions from being double-counted.
- The skipPositions mechanism (markdown link destinations) is fully intact and not modified.
- Negative test cases needed: words embedding a scheme token with a non-boundary predecessor — e.g. 'hotel:example', 'xmailto:user@example.com', 'a-tel:+1555'. These should return countLinks(...) === 0.
- Positive test cases needed: 'mailto:user@example.com' at start of string or after space/newline/tab/>/[ — should return 1. 'tel:+15551234' similarly. '[x](mailto:user@example.com)' — should return 1 (single-counted markdown link).

Expected validation failures carried forward:
- None
