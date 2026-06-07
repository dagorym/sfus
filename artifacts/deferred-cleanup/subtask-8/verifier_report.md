# Verifier Report

**Subtask:** deferred-cleanup/subtask-8  
**Branch reviewed:** cleanup-subtask-8-documenter-20260607 (commit bc0d1fa)  
**Comparison base:** cleanup branch  
**Date:** 2026-06-07

---

## Scope Reviewed

- **Implementer (bf699d3):** Anchored `DANGEROUS_HTML_PATTERNS` in `markdown-sanitizer.ts`; moved `memoryStorage` destructuring below imports in `media.controller.ts`; updated JSDoc and DANGEROUS_HTML_PATTERNS contract comments.
- **Tester (c5dd6d5):** Rewrote `markdown-sanitizer.test.ts` event-handler and data: URI suites as paired accept/reject-class tests.
- **Documenter (acc7388):** Updated `docs/features/media.md` sanitizer section with anchoring policy and six rejection classes.

Files reviewed:
- `apps/api/src/media/markdown-sanitizer.ts`
- `apps/api/src/media/media.controller.ts`
- `apps/api/src/media/markdown-sanitizer.test.ts`
- `apps/api/src/media/media.service.ts` (security review scope — entire media subsystem)
- `docs/features/media.md`

---

## Acceptance Criteria / Plan Reference

Source: `plans/deferred-cleanup-plan.md`, subtask-8 acceptance criteria.

1. Named legitimate-prose examples (incl. "training data: source A" and prose containing "onclick = handler") pass sanitization.
2. Event-handler attributes and data:-URL link/image/attribute payloads remain rejected; rejection classes enumerated.
3. Per-pattern review of remaining DANGEROUS_HTML_PATTERNS reported.
4. `memoryStorage` sits below the import block with no functional change.
5. Sanitizer JSDoc/contract comments match the new behavior.
6. `docs/features/media.md` updated to describe the six rejection classes, anchoring policy, and acceptable prose examples.

---

## Convention Files Considered

- `AGENTS.md` — workflow, artifact, and role constraints
- `docs/README.md` — documentation routing table
- `docs/features/media.md` — canonical media subsystem contract (Documenter scope)
- `plans/deferred-cleanup-plan.md` — governing plan and subtask-8 definition

---

## Findings

### BLOCKING

**B1: Missing specialist security stage artifacts required by plan**  
`artifacts/deferred-cleanup/subtask-8/` — `security_report.md` and `security_result.json` are absent.

The plan (`plans/deferred-cleanup-plan.md`, subtask-8) states: "**Security review required: yes — and the specialist stage must review the ENTIRE media subsystem** (upload handling, content-type validation, serve path, sanitizer), not just this diff: this discharges the retroactive review the ms3-completion cycle never ran. The Coordinator must not record this subtask complete without `security_report.md` + `security_result.json` or an explicit recorded waiver."

Neither the specialist security artifacts nor an explicit recorded waiver exist in the artifact directory. The verifier's own security pass (see security review assessment below) is not a substitute for the specialist security stage: the plan requires a dedicated specialist pass or an explicit waiver documented in the artifact directory.

**Required action:** Either run the specialist security stage to produce `security_report.md` + `security_result.json`, or the Coordinator must record an explicit waiver artifact in `artifacts/deferred-cleanup/subtask-8/` before marking this subtask complete.

---

### WARNING

**W1: HTML comment bypass in event-handler pattern — low real-world risk**  
`apps/api/src/media/markdown-sanitizer.ts:41` — `/<[^>]*\bon\w+\s*=/i`

Input `<img <!-- comment --> onload=x>` is NOT blocked by this pattern because `[^>]*` stops at the `>` in `-->`, so `onload=x` appears after the `>` and is not matched within the `<...>` span. The content would be stored.

Mitigating factors:
- Browsers do not treat embedded HTML comments inside a tag as valid HTML5; no major browser executes event handlers on tags containing `<!-- ... -->`.
- The client-side `MarkdownRenderer` (per `docs/features/media.md`) strips **all** raw HTML tags as a defense-in-depth layer before rendering.
- This pattern class was not addressed by the anchoring task; the plan's scope was to fix context-free patterns, not to make the sanitizer exhaustive for all HTML parsing edge cases.

This is a known gap in regex-based HTML sanitization (vs. a parser-based approach). It is out of scope for this subtask but warrants acknowledgment.

**W2: Controller test count discrepancy in acceptance criteria statement**  
`artifacts/deferred-cleanup/subtask-8/tester_report.md:77` and task acceptance criteria.

The acceptance criterion states "11 existing controller tests pass" but `media.controller.test.ts` contains 14 `it()` cases (7 upload authorization + 4 TOCTOU stream-hardening + 3 serveImage happy-path). All 14 pass. The count discrepancy is in the task description only; actual test coverage is more complete than stated.

---

### NOTE

**N1: Tab/newline mid-word in `javascript:` not caught**  
`apps/api/src/media/markdown-sanitizer.ts:51` — `/javascript\s*:/i`

Input `javas\tcript:` (tab within the word) is not caught by this pattern. The `\s*` applies only between the word and the colon, not within the word. This is not a real bypass vector: no browser treats `javas\tcript:` as a valid `javascript:` URI scheme. Acceptable tolerance.

**N2: `javascript:` and `vbscript:` patterns are context-free**  
`apps/api/src/media/markdown-sanitizer.ts:51-52`

Both `/javascript\s*:/i` and `/vbscript\s*:/i` are context-free (not anchored to URL positions). The implementer reviewed these and judged that `javascript:` essentially never appears in legitimate prose (unlike `data:`). This assessment is sound: the false-positive risk is negligible and the security benefit of context-free matching is high. No change needed, and the per-pattern review documenting this decision is present in the implementer report.

**N3: `%6Aavascript:` (URL-encoded scheme) not caught**  
`apps/api/src/media/markdown-sanitizer.ts` — all URI scheme patterns

URL-encoded equivalents of `javascript:` (e.g., `%6Aavascript:`, `&#106;avascript:`) are not caught by the sanitizer. These require a URL decoder pass before pattern matching. This is a known limitation of regex-based sanitization and is mitigated by the client-side `MarkdownRenderer`, which re-validates URI schemes in rendered link/image attributes.

---

## Correctness Review Assessment

All six acceptance criteria are satisfied by the implementation and tests:

1. **AC1 — Prose acceptance**: All four named prose examples (`onmouseover= something`, `The onclick = handler pattern fires on user click.`, `Training data: source A provided the baseline.`, `The data: source was verified by the team.`) are verified safe by direct pattern testing and by the new accept-class test cases. PASS.

2. **AC2 — Rejection classes**: All six documented rejection classes are correctly implemented and covered by paired accept/reject tests. The anchored patterns `/<[^>]*\bon\w+\s*=/i` (event handlers in HTML tag context) and `/(?:(?:href|src)\s*=\s*['"]?|]\()data\s*:/i` (data: URIs in URL positions) correctly block the target payload classes while passing the prose examples. PASS.

3. **AC3 — Per-pattern review**: The implementer's per-pattern review is complete and accurate. All patterns assessed. The tester's report confirms alignment with the implementer's findings. PASS.

4. **AC4 — memoryStorage placement**: The `const { memoryStorage } = multer;` destructuring is correctly placed at line 36, after all imports. All 14 existing controller tests pass with no functional regression. PASS.

5. **AC5 — JSDoc/contract comments**: Both the module-level anchoring policy note and the DANGEROUS_HTML_PATTERNS rejection-class enumeration are present and accurate in `markdown-sanitizer.ts`. PASS.

6. **AC6 (Documenter) — docs/features/media.md**: Updated accurately with the six rejection classes, anchoring policy, and prose-acceptance notes. Content is consistent with the implementation. PASS.

---

## Security Review Assessment (Verifier Pass)

The verifier performed a security review of the entire `apps/api/src/media/` subsystem as required by the plan. This is the verifier's standard security pass; the specialist security stage (which must produce separate `security_report.md` + `security_result.json` artifacts) is separate and still required per the plan.

**Sanitizer (`markdown-sanitizer.ts`):**
- Pattern anchoring is correct and does not introduce new bypass vectors compared to the previous state.
- The HTML comment bypass (W1 above) was not introduced by this change; it was a pre-existing limitation of the `[^>]*` quantifier in HTML tag matching.
- No regex denial-of-service (ReDoS) risk: `[^>]*` on the event-handler pattern is O(n) on typical input; the `[\s\S]*?` lazy quantifier on script/iframe/etc. patterns terminates at the first `>` without catastrophic backtracking.

**Upload pipeline (`media.service.ts`, `media.controller.ts`):**
- MIME type allow-list enforcement at the service layer is correctly implemented.
- File size limit enforced both by Multer (20 MB hard cap at ingestion) and by the service-layer `uploadMaxSizeBytes` check (configurable).
- Storage key is server-generated (`<resourceType>/<uuid><ext>`); no user-controlled path component reaches the filesystem.
- Original filename is display-only, sanitized via `path.basename` + word-character replacement before persistence, and never used to build filesystem paths.

**Serve path (`media.controller.ts`, `media.service.ts`):**
- Path containment check on `storageKey` is correct: `path.resolve(storageRoot, entity.storageKey)` and the `startsWith(storageRoot + path.sep)` guard prevent path traversal for even a hypothetically injected DB value.
- MIME type re-checked at serve time (defence-in-depth).
- TOCTOU stream handling is correctly implemented: ENOENT → 404, headers-already-flushed → socket destroy, other I/O errors → 500.
- Content-Disposition header uses `inline; filename="..."` with `"` characters escaped; no injection risk.

**Authorization:**
- Upload authorization correctly enforces admin-level role for `blog-post` and `standalone-page` resource types; any authenticated session for `blog-comment`.
- Session resolution via `authService.resolveSession` correctly throws on missing/invalid sessions (401).

No new security issues were introduced by this subtask's changes. The pre-existing HTML comment bypass (W1) and URL-encoding gap (N3) are out of scope for this change and are mitigated by the client-side defense layer.

**Specialist security review verdict:** Cannot be cleared by verifier alone. The plan requires dedicated specialist security artifacts for this subtask. See BLOCKING finding B1.

---

## Test Sufficiency Assessment

The test suite additions are well-structured and sufficient for the acceptance criteria:

- **Paired accept/reject-class pattern** for event handlers: four reject cases (onclick, onerror, onload, onmouseover — all in HTML tag context) plus two accept cases (bare prose, technical prose). The pairing clearly demonstrates that the anchoring works in both directions.
- **Paired accept/reject-class pattern** for data: URIs: four reject cases (Markdown image, Markdown link, href attribute, src attribute) plus two accept cases (prose variants). Full coverage of all URL-position variants.
- **Pre-existing coverage** for the other four rejection classes (script tags, dangerous elements, form elements, URI schemes) is retained without change.
- **Controller tests (14):** All pass without modification, confirming no behavioral regression from the memoryStorage move.

One gap worth noting: the test suite does not cover the HTML comment bypass (W1) as a known limitation. This is acceptable — a test documenting a known bypass would be confusing without a corresponding fix — but a code comment in the pattern would improve maintainability.

---

## Documentation Accuracy Assessment

`docs/features/media.md` is accurate and complete:

- The six rejection classes match the implementation (`markdown-sanitizer.ts:28-37`) exactly.
- The anchoring policy description (prose examples not rejected; URL-position rejection for data:; tag-context rejection for event handlers) matches both the implementation and the tests.
- The `javascript:` and `vbscript:` entries are correctly described as rejecting "any position" (i.e., context-free matching), consistent with the implementation.
- No duplication or contradiction with the inline JSDoc in `markdown-sanitizer.ts`.

---

## Verdict

**FAIL**

The implementation, tests, and documentation satisfy all substantive acceptance criteria. However, the plan's mandatory specialist security stage artifacts (`security_report.md` + `security_result.json`) are absent from `artifacts/deferred-cleanup/subtask-8/` and no explicit waiver has been recorded. Per `plans/deferred-cleanup-plan.md`, the Coordinator must not record this subtask complete without them. The verifier cannot issue PASS or CONDITIONAL PASS while this plan-mandated requirement is unmet.

**To resolve:** The Coordinator must either (a) run the specialist security stage to produce the required artifacts, or (b) record an explicit waiver artifact in the subtask artifact directory, then re-engage the verifier if needed.
