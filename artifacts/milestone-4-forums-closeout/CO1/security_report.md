Security Review Report

Scope reviewed:
- Specialist security review of subtask CO1 (Milestone 4 forums closeout): a word-boundary guard added to the bare-scheme counting branch of scanBareUrls() in apps/api/src/common/throttle/link-limit.ts, the per-post link limiter (a spam/abuse-control boundary).
- Source change reviewed (apps/api/src/common/throttle/link-limit.ts:121): bare scheme now counts only when WORD_BOUNDARY_CHARS.has(charBefore) AND charBefore !== '(' (previously counted whenever charBefore !== '(').
- Tester change reviewed (apps/api/src/common/throttle/link-limit.test.ts): 18 new regression assertions covering negative embedded-scheme cases, positive boundary-anchored cases, markdown single-count, and mixed-body fail-safe.
- Documenter change reviewed (docs/development/api-conventions.md): per-post link-limit section now states bare schemes are counted only at a word boundary.
- Diff scope: base ms4a (66c7118) -> efe5dfd; the only non-test, non-artifact source change is the 11-line bare-scheme-branch edit. scanMarkdownLinks() and skipPositions generation are byte-identical/unchanged.
- Downstream rendering surface examined: forum post/topic bodies and blog comment bodies guarded by exceedsLinkLimit() are rendered only by apps/web/components/markdown-renderer.tsx.

Why specialist review was triggered:
- Planner marked CO1 'Security review: required' (D2) because it changes anti-abuse counting logic in the per-post link limiter, an abuse-control boundary where the relevant risk is direction: a change that lowers the counted total could let a malicious post smuggle extra links past THROTTLE_MAX_LINKS_PER_POST.
- The security-relevant concern is under-counting (more permissive), not over-counting: the limiter must remain fail-safe so a genuine boundary-anchored link cannot be silently dropped from the count in a way an attacker exploits.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-closeout-plan.md, subtask CO1 (lines 117-206), acceptance criteria AC1-AC6, with AC5 'fail-safe direction' as the security-critical criterion and D2 designating CO1 Security review: required.
- Enforcement call sites: apps/api/src/forums/forums.controller.ts:260 and :367 (forum create/reply) and apps/api/src/blog/blog.controller.ts:298 (blog comment), all via exceedsLinkLimit(body, maxLinksPerPost).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/common/throttle/link-limit.ts:121 - Fail-safe direction confirmed: the new count predicate is a strict subset of the old, so the change can only reduce the counted total, never increase the renderer-visible clickable-link exposure.
  Old count condition: charBefore !== '('. New: WORD_BOUNDARY_CHARS.has(charBefore) AND charBefore !== '('. The new predicate ANDs an additional constraint onto the old, so for every input the set of counted positions is a subset of the previous set and countLinks() can only return a value <= before. The only abuse-relevant direction is therefore 'more permissive for bare schemes', which is assessed as non-exploitable (see evasion NOTE). All genuine boundary-anchored bare schemes (start-of-body, space, tab, newline, CR, '>', '[') remain counted; the '(' markdown-destination case stays excluded and is independently handled by skipPositions. No genuine boundary-anchored URL is newly dropped in an exploitable way.
- apps/web/components/markdown-renderer.tsx:155 - The 'more permissive' direction is not an exploitable link-smuggling bypass because the downstream renderer does not autolink bare schemes at all and forces non-http(s) link destinations to '#'.
  All limiter-guarded bodies (forum topics/posts, blog comments) render only through MarkdownRenderer/convertMarkdownToHtml, an in-house converter with no external markdown library (no GFM/remark/markdown-it/marked autolinking). It emits an <a href> only from explicit [text](url) syntax, and sanitizeUrl() rewrites any non-http(s)/relative destination (mailto:, tel:, ftp:, data:, javascript:) to '#'. A bare 'foomailto:...' (now uncounted) was therefore never a clickable link regardless of the count, so reducing the bare-scheme count cannot smuggle an extra clickable link past THROTTLE_MAX_LINKS_PER_POST. The bare-scheme count is a spam-text heuristic, not an anchor gate. ASSUMPTION/forward-to-Verifier: this conclusion is coupled to MarkdownRenderer having no autolinking; if a future change introduces a bare-URL autolinker (or GFM autolink) for these bodies, the WORD_BOUNDARY_CHARS set should be re-evaluated against that autolinker's boundary rules at that time.
- apps/api/src/common/throttle/link-limit.ts:38 - WORD_BOUNDARY_CHARS omits some characters a strict CommonMark autolinker would treat as a boundary (e.g. '<' for <mailto:...>, and general punctuation), but this is heuristic tightness, not an exploitable gap given no autolinking downstream.
  Because the renderer performs no autolinking, an unmatched boundary character simply means a bare-scheme spam token may go uncounted; it does not create a clickable link. The bare-scheme branch already mirrors the pre-existing www. branch's WORD_BOUNDARY_CHARS, so this is consistent with established behavior and within the planned scope. No action required for this subtask; noted only so a future autolinking change does not silently inherit a too-narrow boundary set.
- apps/api/src/common/throttle/link-limit.ts:98 - No injection, ReDoS, or unbounded-scan concern introduced; the scan remains linear and bounded.
  The change adds only a Set.has() membership test alongside the pre-existing '!== "("' check inside the same indexOf-driven loop. No regex is introduced on attacker input, no new allocation occurs inside the loop, and the MAX_SCAN_BYTES (256 KB) cap and O(n) indexOf scanning are unchanged. skipPositions handling and counted-dedup are unchanged, so there is no new double-count or under-count path. No new outputs, logging, or error text are added, so there is no new information-disclosure surface.

Test sufficiency assessment:
- Sufficient for the security-relevant behavior. 18 new assertions in apps/api/src/common/throttle/link-limit.test.ts cover AC2 negatives (hotel:, motel:, xmailto:, a-tel:, inlined_mailto: -> 0), AC3 positives (boundary-anchored mailto:/tel: after start/newline/tab/'>'/'['/space -> 1), AC4 markdown single-count for mailto:/tel: (no double-count, no skipPositions regression), and AC5 mixed-body fail-safe (all four boundary-preceded schemes still counted; 'hotel:x and tel:+1' -> 1).
- Validation run (this review): `npx vitest run --root apps/api src/common/throttle/link-limit.test.ts` -> 35 passed; `npx vitest run --root apps/api src/common/throttle` -> 5 files, 90 passed. No failures.
- No test asserts insecure behavior: the assertions encode the intended false-positive reduction while explicitly pinning that genuine boundary-anchored links and markdown-link destinations are still counted exactly once.
- Gap (non-blocking): there is no direct unit assertion that the renderer does not autolink bare schemes; that property lives in the web layer and is the basis for the evasion conclusion. It is a documented assumption forwarded to the Verifier rather than a test gap in this API-scoped subtask.

Documentation / operational guidance assessment:
- Sufficient. docs/development/api-conventions.md now states bare http://, https://, ftp://, mailto:, and tel: are counted only at a word boundary, with an explicit example that scheme substrings inside larger words (hotel:, motel:) are not counted, matching the implemented behavior.
- No operational/runbook change is warranted: THROTTLE_MAX_LINKS_PER_POST semantics and enforcement points are unchanged; the doc accurately narrows the counting description without overstating it.

Artifacts written:
- artifacts/milestone-4-forums-closeout/CO1/security_report.md
- artifacts/milestone-4-forums-closeout/CO1/security_result.json

Outcome:
- PASS
