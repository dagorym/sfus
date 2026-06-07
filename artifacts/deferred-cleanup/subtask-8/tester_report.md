# Tester Report

**Status:** success

**Subtask:** deferred-cleanup/subtask-8

**Branch:** cleanup-subtask-8-tester-20260607

**Test Commit Hash:** c5dd6d53667f5a35c0540f23233eb35f23c04515

## Testing Scope

Validate the implementer's changes to `markdown-sanitizer.ts` (pattern anchoring) and `media.controller.ts` (memoryStorage move) against the stated acceptance criteria.

## Test Files Modified

- `apps/api/src/media/markdown-sanitizer.test.ts` — rewritten event-handler and data: URI suites as paired accept/reject-class tests

## Commands Run

1. `npx --yes pnpm@10.0.0 --dir <worktree> install`
2. `npx --yes pnpm@10.0.0 --dir <worktree> --filter @sfus/api test`
3. `npx --yes pnpm@10.0.0 --dir <worktree> lint`
4. `npx --yes pnpm@10.0.0 --dir <worktree> typecheck`
5. `npx --yes pnpm@10.0.0 --dir <worktree> --filter @sfus/api build`

## Test Results

- **Pass:** 304
- **Fail:** 0
- **Skip:** 2 (integration tests requiring live DB — expected)

All acceptance criteria validated. Lint: PASS. Typecheck: PASS. Build: PASS.

## Acceptance Criteria Results

### AC1: Named legitimate-prose examples pass sanitization
**Status:** PASS

New accept tests added and passing:
- `"onmouseover= something"` (bare prose, no HTML tag context) → `safe: true`
- `"The onclick = handler pattern fires on user click."` → `safe: true`
- `"Training data: source A provided the baseline."` → `safe: true`
- `"The data: source was verified by the team."` → `safe: true`

### AC2: Event-handler-attribute and data:-URL payload classes remain rejected
**Status:** PASS

Six rejection classes all verified:
1. **Script tags:** `<script>alert('xss')</script>` → rejected
2. **Event-handler attributes in HTML tag context:** `<span onmouseover=steal()>`, `<a onclick=...>`, `<img onerror=...>`, `<body onload=...>` → all rejected
3. **Dangerous embedding elements:** `<iframe>`, `<object>`, `<embed>` → rejected
4. **Form interaction elements:** `<form>`, `<input>`, `<button>` → rejected
5. **Dangerous URI schemes:** `[bad](javascript:...)`, `[bad](vbscript:...)` → rejected
6. **data: URIs in URL positions:** `![img](data:...)`, `[link](data:...)`, `href="data:..."`, `src="data:..."` → all rejected

### AC3: Per-pattern review of remaining DANGEROUS_HTML_PATTERNS table reported
**Status:** PASS

All patterns reviewed (from implementer analysis, confirmed by test coverage):
- `/<script[\s\S]*?>/i` — tag-anchored; safe. Covered by existing tests.
- `/<\/script>/i` — tag-anchored; safe. Covered.
- `/<[^>]*\bon\w+\s*=/i` — event handler anchored to HTML tag context. New paired tests added.
- `/<iframe[\s\S]*?>/i`, `/<\/iframe>/i` — tag-anchored; safe. Covered.
- `/<object[\s\S]*?>/i`, `/<\/object>/i` — tag-anchored; safe. Covered.
- `/<embed[\s\S]*?>/i` — tag-anchored; safe. Covered.
- `/<form[\s\S]*?>/i`, `/<\/form>/i` — tag-anchored; safe. Covered.
- `/<input[\s\S]*?>/i` — tag-anchored; safe. Covered.
- `/<button[\s\S]*?>/i` — tag-anchored; safe. Covered.
- `/javascript\s*:/i` — context-free; `javascript:` rarely appears in legitimate prose; acceptable false-positive tolerance. Not changed.
- `/vbscript\s*:/i` — context-free; essentially never in legitimate prose. Not changed.
- `/(?:(?:href|src)\s*=\s*['"]?|]\()data\s*:/i` — anchored to URL positions. New paired tests added.

### AC4: memoryStorage sits below imports with no functional change
**Status:** PASS

`media.controller.test.ts` existing 11 tests (7 upload authorization + 4 serveImage stream-hardening) all pass without modification. The memoryStorage destructuring move from line 19 to line 36 caused no behavioral regression.

### AC5: JSDoc/contract comments updated
**Status:** PASS

Implementation inspection confirmed both updates present in `markdown-sanitizer.ts`:
- Pattern anchoring policy JSDoc on `validateMarkdownBody` and the module-level comment
- Six rejection classes enumerated in `DANGEROUS_HTML_PATTERNS` JSDoc block

No test change needed for comment-only content.

## Test Change Rationale

The old `rejects generic on-prefixed handler` test (`"onmouseover= something"` expected `safe: false`) was testing the old unanchored behavior. The task explicitly identified this test as one that must change because the approved implementation behavior changed.

The replacement is a paired accept/reject-class suite per acceptance criterion AC2:
- **Reject (tag context):** `<span onmouseover=steal()>hover me</span>` → `safe: false`
- **Accept (prose):** `"onmouseover= something"` → `safe: true`
- **Accept (technical prose):** `"The onclick = handler pattern fires on user click."` → `safe: true`

Similarly for data: URI, new test cases added to explicitly verify both URL-position rejection and prose-position acceptance.

## Cleanup

No temporary non-handoff byproducts created. The worktree `node_modules` were installed as part of test execution setup (this is a standard setup step, not a test byproduct).
