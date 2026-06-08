Security Review Report

Scope reviewed:
- FOCUSED security re-review (pass 3) of Milestone 4 ST16 after a verifier-driven correctness fix (commit fbec0c2) that DROPPED `&` from the sanitizeUrl() reject set in apps/web/components/markdown-renderer.tsx — the reject regex is now /["'<>]/ (was /["'<>&]/).
- Sole objective: confirm the `&`-drop did NOT reopen the stored XSS (pass 1 BLOCKING, resolved + confirmed PASS in pass 2) and introduced no new injection. The change is scoped entirely to sanitizeUrl()'s reject regex + comments, plus two added behavioural tests in authoring-components.spec.ts.
- OVERALL RESULT: PASS. The stored XSS REMAINS CLOSED after the `&`-drop. The attribute-breakout vector is the literal double-quote `"`, which is STILL in the reject set (along with `'`, `<`, `>`). Allowing a literal `&` creates no breakout: inside a double-quoted href="..."/src="..." only a literal `"` terminates the attribute (HTML5 'Attribute value (double-quoted) state'), and a `&...;` character reference that decodes to a quote is appended to the attribute VALUE as data — it does not terminate the attribute. No new injection vector is introduced.

Why specialist review was triggered:
- ST16 renders user-authored Markdown (forum topics/posts) through the shared MarkdownRenderer, then injects the converted string via dangerouslySetInnerHTML — a direct HTML sink for attacker-controlled content. Plan marks ST16 'Security review: required'.
- A prior pass (security-1) found a BLOCKING stored XSS: the pre-fix sanitizeUrl() returned relative URLs verbatim, so a Markdown link/image URL containing a literal `"` broke out of href="..."/src="..." and injected a live event handler. A correctness fix then narrowed the reject set, re-touching the exact security-critical line — requiring specialist re-confirmation that protection is intact.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST16 (lines 418-444). AC: 'board/topic pages render sanitized Markdown (no raw HTML execution)'; 'Security review: required — verify the render path and that the UI gate is not the only control.'
- Sink under review: apps/web/components/markdown-renderer.tsx — sanitizeUrl() (lines 229-249), renderInline() href/src interpolation (lines 195-202), MarkdownRenderer dangerouslySetInnerHTML (lines 274-284).
- Behavioural coverage: apps/web/components/authoring-components.spec.ts — 11 MarkdownRenderer XSS/URL tests (lines 325-405).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/web/components/markdown-renderer.tsx:245 - XSS REMAINS CLOSED after the `&`-drop. Empirically reproduced (against the real source, worktree-locally) the proven payload [click](/a" onpointerover=alert`1`) -> <a href="#" ...> (inert, no handler); image variant ![alt](/x" onerror=alert`1`) -> <img src="#" ...>; single-quote variant -> href="#"; javascript:/data: -> href="#" with scheme stripped and no <script. The `"` `'` `<` `>` reject still fires.
  The breakout primitive is the literal double-quote, which is unchanged in the reject set; dropping `&` does not touch it, so the proven exploit and its quote/scheme variants all still resolve to the inert # fallback.
- apps/web/components/markdown-renderer.tsx:245 - Assessed the specific `&`-decode concern: a URL containing a literal entity sequence (e.g. /a&quot;... or /a&#34;...) PASSES the filter (it has no raw " ' < >) and is written raw into href="...". Verified the output sink: convertMarkdownToHtml emits <a href="/a&quot;onpointerover=alert`1`" ...> with the entity as literal data INSIDE the value; literal double-quotes stay balanced (delimiter pairs only, count 6). Per the HTML5 tokenizer, a character reference decoding to `"` in the double-quoted-attribute state is appended to the attribute value and does NOT terminate the attribute, so no onpointerover/onerror attribute is created and no markup executes.
  This is the only theoretical way allowing `&` could matter; it is a non-issue because attribute termination requires a LITERAL quote in the byte stream (still rejected), not a decoded entity. The re-parse-decodes-to-quote scenario does not produce executable markup.
- apps/web/components/authoring-components.spec.ts:325 - The 9 original behavioural XSS tests (proven payload, quote-in-href, onerror image, quote-in-img-src, javascript: link/img, data:, clean URL, https URL) plus the 2 new multi-param-`&` tests (lines 392-404) all pass and are non-vacuous: confirmed against the extracted pre-fix sanitizeUrl (8a17e49, which returned relative URLs verbatim with NO char filter) the proven/onerror payloads produce live handlers, so the assertions (not.toContain('onpointerover='), href="#") genuinely fail on the vulnerable code. The 2 `&` tests guard against re-introducing over-aggressive `&` rejection.
  Confirms the committed suite would catch a regression of either the XSS (back to raw URLs) or the `&` over-rejection, so the green run is meaningful rather than tautological.
- apps/web/components/markdown-renderer.tsx:0 - The `&`-drop fix (commit fbec0c2) touches ONLY markdown-renderer.tsx (the sanitizeUrl reject regex + comments) and authoring-components.spec.ts (+2 tests). The other ST16 concerns previously PASS — moderator client-gate (API is the enforcement boundary), site-board-only index, @mention rendering/suggest (uses encodeURIComponent), quote affordance, and open-redirect/?next= handling — are not in the changed surface and are spot-confirmed unchanged. Their tests (forums.spec.ts 51, mention-autocomplete.spec.ts 24) pass in the green matrix.
  Bounds the blast radius of the correctness fix to the URL sanitizer; no previously-cleared control was modified or regressed.

Test sufficiency assessment:
- SUFFICIENT for the security AC. Validation matrix GREEN worktree-locally: vitest run --root apps/web = 10 files / 379 tests passed, 0 failures (authoring-components.spec.ts: 47 tests incl. the 11 MarkdownRenderer XSS/URL tests). pnpm typecheck (api+web) = Done. pnpm lint (api+web, --max-warnings=0) = Done.
- Independent empirical re-review beyond the committed suite: a throwaway vitest harness (run worktree-locally against the REAL markdown-renderer source, then removed) executed 10 checks covering the proven payload, image/onerror, single-quote, angle-bracket (stripped by stripRawHtml backstop), javascript:/data:, `&` multi-param, and the &quot;/&#34; entity-decode concern. All confirmed inert: proven->href="#", image->src="#", `&` preserved verbatim (?a=1&b=2), entity payloads stay as literal attribute-value data with balanced quotes and no top-level event-handler attribute.
- Non-vacuity re-confirmed: the proven and onerror behavioural assertions FAIL against the extracted pre-fix sanitizeUrl (commit 8a17e49) and PASS against the current code; the two `&`-preservation tests FAIL against the intermediate /["'<>&]/ reject set and PASS now.

Documentation / operational guidance assessment:
- SUFFICIENT. docs/features/media.md (and the renderer's own JSDoc, lines 215-249) now correctly document the reject set as `" ' < >` with `&` intentionally allowed as a legal RFC 3986 query delimiter that cannot break a double-quoted attribute. This supersedes the prior pass-2 doc state that recorded the `&` multi-param behaviour as a pending regression; the correctness fix resolved that and the docs match the shipped /["'<>]/ behaviour.
- No operational/runbook gap: the change is a client-render hardening with no new env var, migration, or deployment surface.

Artifacts written:
- artifacts/milestone-4-forums/ST16/security_report.md
- artifacts/milestone-4-forums/ST16/security_result.json

Outcome:
- PASS
