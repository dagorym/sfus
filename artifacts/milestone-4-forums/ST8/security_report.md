Security Review Report

Scope reviewed:
- Specialist security RE-REVIEW (pass 2) of Milestone 4 subtask ST8 - the rate-limit/throttle module - after a Security-driven remediation. Pass 1 was FAIL (one BLOCKING ReDoS + four concerns).
- Files re-reviewed: apps/api/src/common/throttle/{link-limit.ts, throttle.service.ts, throttle.guard.ts, throttle-store.ts} and the colocated tests {link-limit.test.ts, throttle.guard.test.ts}; apps/api/.env.example; docs/development/api-conventions.md (rate-limiting/anti-spam section).
- Remediation diff scope (3e632ac..HEAD) confirmed tight: env.example (+15), link-limit.ts rewrite (+177/-30), link-limit.test.ts (+121), new throttle.guard.test.ts (+288), api-conventions.md (+25). No change to throttle.service.ts/throttle.guard.ts/throttle-store.ts production code - fail-closed posture preserved unchanged.
- Validation matrix run by this reviewer from the worktree after pnpm install + native rebuild (argon2/esbuild/sharp): lint PASS, typecheck PASS, API test PASS (521 pass / 2 DB-gated skips; throttle suites: link-limit 35, throttle.service 18, throttle.guard 8, throttle-store 8, throttle-env 21), API tsc build PASS (P5 CommonJS/NodeNext).
- Empirical probes run by this reviewer (standalone node): NEW linear scanner vs OLD backtracking regex timing, plus evasion/edge-case correctness.
- ST8 ships the mechanism only; no route wired yet (ST9 attaches the guard + exceedsLinkLimit). Findings scoped accordingly.

Why specialist review was triggered:
- Plan Risk R2 (plans/milestone-4-forums-plan.md): throttle correctness / fail-open - anti-abuse control correctness + fail-closed behavior. The link limiter and throttle guard are attacker-facing controls once ST9 wires them to forum/blog Markdown bodies.
- ST8 plan section marks 'Security review: required'.
- Pass-1 BLOCKING defect: catastrophic-backtracking ReDoS in the link limiter (MARKDOWN_LINK_RE = backtracking regex over the markdown link form) - an attacker-controlled Markdown body of repeated '](' blocked the single-threaded event loop (~325 s on a 1 MB body), turning the anti-abuse control into a DoS amplifier.
- agent-retrospective-patterns.md P4/P5 (run the full validation matrix incl. the API tsc CommonJS build) and P1 (docs/code drift).

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md - ST8 acceptance criteria and Risk R2 (fail-closed 429, proxy-resolved IP fallback, new-account tier, link-count limiter, IThrottleStore seam, env validation, API tsc build).
- star_frontiers_rpg_website_design.md section 13 (anti-spam baseline: rate limits + link throttling + stricter new-account tier), section 14 (real client IP via trusted proxy; no attacker-controlled header trust).
- docs/development/agent-retrospective-patterns.md P1, P4, P5.
- Pass-1 artifacts preserved at artifacts/milestone-4-forums/ST8/history/security-1-fail/ (security_report.md = FAIL).

Findings

BLOCKING
- None

WARNING
- apps/api/src/common/throttle/link-limit.ts:104-124 - NEW (minor) - the bare-scheme scan for mailto: and tel: has NO leading word-boundary guard (only a charBefore !== '(' check), so these schemes match as substrings inside ordinary words. Probe confirms 'I stay at a hotel: room 5' counts 1 link (the 'tel:' inside 'hotel:'); 'motel:', 'cartel:', and any text containing 'mailto:'/'tel:' substrings are similarly over-counted.
  This is a false-positive introduced by the remediation's evasion broadening, but its direction is FAIL-SAFE for an anti-spam cap (it over-counts links, making the limiter stricter, never weaker - it cannot be used to bypass the cap). Real-world impact is limited to occasionally rejecting a legitimate post whose prose happens to contain a word ending in 'tel:' or a literal 'mailto:'/'tel:' substring, which is rare in normal Markdown. Not exploitable, not blocking. Recommend ST9 (or a follow-up) add a leading word-boundary guard for the non-'//' schemes (mailto:/tel:) mirroring the www. guard, to reduce false rejections.

NOTE
- apps/api/src/common/throttle/link-limit.ts:22-182 - RESOLVED - the prior BLOCKING ReDoS is genuinely fixed. The backtracking link-form regex is GONE; the link counter is now a linear indexOf-based scanner (scanMarkdownLinks + scanBareUrls) with a hard MAX_SCAN_BYTES = 262144 (256 KB) cap on the inspected region. No regex with unbounded repetition runs on attacker-controlled input.
  Empirically verified by this reviewer: the NEW scanner processes a 1 MB pathological body of repeated '](' in 0.613 ms (64 KB in 0.057 ms) - low single-digit ms, far under the test's 100 ms threshold. The OLD regex blows up quadratically on the SAME input (8 KB ~18.8 ms, 16 KB ~75 ms, 32 KB ~299 ms), so by O(n^2) extrapolation a 1 MB body would take hundreds of seconds - matching pass-1's ~325 s measurement. The colocated regression test (link-limit.test.ts: 1 MB body under 100 ms + 64 KB body under 20 ms) is therefore NON-VACUOUS: the old implementation would time out / fail the under-100 ms assertion. The R2 ReDoS attack surface is closed.
- apps/api/src/common/throttle/throttle.service.ts:81-96 - FAIL-CLOSED PRESERVED and now regression-tested. throttle.service.ts is unchanged: checkRequest() does NOT wrap store.hit() in a try/catch, so a store error propagates out of checkRequest -> guard.canActivate -> NestJS 500 = request DENIED (never silent allow). The off-by-one is correct: the store count includes the current hit and the service blocks on count > maxHits, so exactly maxHits requests pass and the (maxHits+1)th is the first 429.
  Directly answers R2's fail-open vs fail-closed question. The pass-1 GAP (no guard test) is closed: new throttle.guard.test.ts asserts (a) IThrottleStore.hit() throwing => canActivate rejects/throws (fail-closed, two tests + a non-vacuous variant proving session errors are caught while store errors are NOT), (b) resolveSession throwing => IP-keyed identity used and request proceeds (IP fallback), (c) InMemoryThrottleStore window-reset/independent-key/sweep semantics. All 8 guard tests pass. The fail-closed guarantee is now pinned by tests, not just code reading. DETERMINATION: the control is FAIL-CLOSED on store error.
- apps/api/src/common/throttle/link-limit.ts:98-148 - Evasion broadening (concern 1) is LINEAR and meaningfully reduces trivial bypass. scanBareUrls now counts ftp://, mailto:, tel: schemes and www.-prefixed bare hosts (word-boundary-guarded for www. via WORD_BOUNDARY_CHARS) in addition to http(s)://, all via indexOf with no backtracking. A counted Set dedups overlapping matches and skipPositions prevents double-counting Markdown-link destinations.
  Verified by probe: an 'ftp:// mailto: tel: www.' body counts 4; 'xwww.example.com' (no boundary) counts 0; a Markdown link with an ftp/mailto/tel destination counts 1 (no double-count); 'https://www.a.com' counts 1 (the in-URL www. is preceded by '/', not a boundary char, so not double-counted). This closes the easy 'paste many bare ftp/www links' bypass without introducing any new pathological-input handling. No catastrophic input class was created. Net direction of any miscount is OVER-counting (stricter), which is fail-safe for an anti-spam cap.
- apps/api/.env.example:1-55 - Deploy footgun (concern 4) CLOSED and doc drift (concern 2, P1) CORRECTED. apps/api/.env.example now lists all five THROTTLE_* vars (THROTTLE_WINDOW_MS, THROTTLE_MAX_HITS, THROTTLE_NEW_ACCOUNT_MAX_HITS, THROTTLE_NEW_ACCOUNT_WINDOW_MS, THROTTLE_MAX_LINKS_PER_POST) with the cross-field note, so the fail-closed config validation no longer crashes a fresh checkout. docs/development/api-conventions.md now states the ST8 ThrottleGuard passes userCreatedAt: null and the new-account tier activates only once ST9 supplies the authenticated user's createdAt.
  Confirmed accurate against code: ThrottleGuard (throttle.guard.ts:66) still declares userCreatedAt as a const null and never reassigns it, so the doc's 'tier dormant in ST8, activates in ST9' statement matches reality (P1 drift removed). The env-example addition removes the known deploy-env-drift failure mode (a missing var crashes the API and presents as can't-login/can't-register).
- apps/api/src/common/throttle/link-limit.ts:163-171 - INFO - the MAX_SCAN_BYTES = 256 KB cap (the DoS bound) means links located entirely beyond the first 256 KB of a body are not counted. A theoretical bypass is to prepend more than 256 KB of filler before the links. Probe confirms '256 KB pad then 50 links' counts 0, while '50 links then 256 KB pad' correctly counts 50.
  Not reachable under the current topology: the API sets no custom JSON body limit (no bodyParser/limit override in index.ts), so Express/NestJS's default ~100 KB body cap applies - well below the 256 KB scan window, so a body can never reach the uncounted region. This is the inherent and intentional completeness-vs-DoS tradeoff that pass-1 explicitly requested (bounded scan). Flag for ST9: if ST9 raises the request body limit to allow longer posts, the link-count scan window should be revisited so the cap stays >= the max accepted body size. Documented behavior, not a current vulnerability.
- apps/api/src/common/throttle/throttle.guard.ts:66-88 - INFO - pass-1 concern 2 (the new-account tier is inert as wired because the guard always passes userCreatedAt: null) remains true by DESIGN in ST8 and is now correctly documented as such. The remediation did not (and per the plan should not) wire createdAt; that is ST9 scope.
  Not a regression and not a security weakening within ST8: the tier failing toward the laxer (standard) limit is the same posture as having no tier, and ST8 wires no enforced route at all. The fix here was the documentation correction (now accurate). ST9 MUST supply userCreatedAt (e.g. a lightweight user lookup) for the stricter young-account tier to function, per design section 13. Forwarded to ST9.

Test sufficiency assessment:
- ADEQUATE for ST8's security surface after remediation. The pass-1 security-relevant GAPS are closed: (1) ReDoS regression - link-limit.test.ts adds a 1 MB and a 64 KB pathological-body timing assertion (under 100 ms / under 20 ms), demonstrably non-vacuous against the old backtracking regex; (2) evasion - 13 new cases cover ftp/mailto/tel/www detection, www. word-boundary acceptance/rejection, and no-double-count with Markdown links; (3) guard fail-closed - new throttle.guard.test.ts (8 tests) proves throwing-store => denial (fail-closed), session-error => IP fallback, userId-vs-IP key selection, and store window-reset/independent-key/sweep semantics.
- Full matrix re-run by this reviewer: lint PASS, typecheck PASS, API test PASS (521 pass / 2 DB-gated skips), API tsc build PASS.
- Residual (non-blocking) test gaps: no test asserts the mailto:/tel: substring false-positive boundary (it is currently unguarded), and no test pins the 256 KB scan-cap completeness boundary; both are non-exploitable and can be addressed alongside the ST9 enforcement wiring.

Documentation / operational guidance assessment:
- ADEQUATE. docs/development/api-conventions.md now (a) correctly states the new-account tier is dormant in ST8 (guard passes userCreatedAt: null) and activates in ST9 - pass-1 P1 drift removed and verified accurate against throttle.guard.ts; (b) documents the link scanner as linear-time indexOf-based with the 256 KB scan cap and the expanded counted set (Markdown links + http/https + ftp/mailto/tel + www. hosts); (c) documents the no-XFF identity resolution and the 429 envelope.
- apps/api/.env.example now lists all five THROTTLE_* vars with the cross-field constraint, closing the deploy-env-drift footgun.
- Minor doc opportunities for ST9 (non-blocking): note the mailto:/tel: substring over-count behavior and the scan-cap/body-limit relationship so a future change keeping the scan window >= the max accepted body size is intentional. The fail-closed-on-store-error behavior is now proven by tests though still worth an explicit doc line for a future Redis-store author.

Artifacts written:
- artifacts/milestone-4-forums/ST8/security_report.md
- artifacts/milestone-4-forums/ST8/security_result.json

Outcome:
- CONDITIONAL PASS
