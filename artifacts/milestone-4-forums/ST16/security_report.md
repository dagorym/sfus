Security Review Report

Scope reviewed:
- Security re-review (PASS 2) of Milestone 4 ST16 — web forum surfaces — after a Security-driven remediation of the pass-1 BLOCKING stored XSS in the shared Markdown renderer.
- Primary remediation surface reviewed (diff e711c66..HEAD, non-artifact): apps/web/components/markdown-renderer.tsx (sanitizeUrl hardening + convertMarkdownToHtml exported @internal for testing), apps/web/components/authoring-components.spec.ts (+9 behavioural XSS tests), apps/web/app/forums/forums.spec.ts (source-contract assertion adjusted to the new sanitizeUrl shape), docs/features/media.md (hardening + known-& caveat documented).
- Read-only context re-read: apps/web/components/markdown-renderer.tsx (the single render trust boundary, now fixed) and its call sites in renderInline (img src + alt, link href + text); apps/web/app/forums/[boardSlug]/[topicSlug]/page.tsx (mod gate + quote), apps/web/app/forums/page.tsx (index), apps/web/components/mention-autocomplete.tsx, apps/web/app/login/login-client.tsx (?next= guard); plans/milestone-4-forums-plan.md (ST16 + R1); pass-1 report at artifacts/milestone-4-forums/ST16/history/security-1-fail/.
- Empirical verification: ran the converter (pure convertMarkdownToHtml) against the proven payload and a variant battery (quote-in-href, quote-in-image-src, single-quote, angle-bracket, javascript:, data:, vbscript:, safe URLs, multi-param & URL); and independently re-ran the same payloads against the PRE-FIX renderer to prove the new tests are non-vacuous. Temp repro files were removed; worktree left clean.
- Validation matrix run worktree-locally: vitest --root apps/web; pnpm typecheck (api+web); pnpm lint (api+web).

Why specialist review was triggered:
- ST16 renders USER-AUTHORED content (topic titles, topic/post bodies, quoted content, author displayName, @username) through the shared MarkdownRenderer and exposes a moderator UI; plan marks ST16 Security review: required.
- Pass-1 outcome was FAIL for one BLOCKING stored XSS: sanitizeUrl() returned URLs without HTML-attribute escaping, so a Markdown link/image destination containing a double-quote broke out of href="..."/src="..." and injected a live event handler (proven payload [click](/a" onpointerover=alert`1`)). A P3 WARNING (no behavioural XSS test) accompanied it. This pass-2 re-review verifies the SECURITY of the fix.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md ST16 (web forum surfaces) — AC: board/topic pages render sanitized Markdown with NO raw HTML execution; moderator controls are server-enforced (client gate UX-only); index exposes only site boards; ?next= guard; @-mention; quote same-page resolution; web lint+typecheck pass and web tests execute behaviour (P3).
- plans/milestone-4-forums-plan.md Risk R1 (visibility/oracle leaks across the new read paths).
- Pass-1 baseline: artifacts/milestone-4-forums/ST16/history/security-1-fail/security_report.md (FAIL: 1 BLOCKING stored XSS, 1 WARNING no-XSS-test, 5 NOTE confirmations).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/web/components/markdown-renderer.tsx:228-247 - RESOLVED — pass-1 BLOCKING stored XSS is genuinely fixed. sanitizeUrl() now applies an allowlist (http(s):// or relative) AND rejects any URL containing " ' < > or & (returns "#"). Empirically confirmed: proven payload [click](/a" onpointerover=alert`1`) now renders <a href="#" target="_blank" rel="noopener noreferrer">click</a> — INERT, no onpointerover. Variant battery all inert: quote-in-href, quote-in-image-src (![alt](/x" onerror=alert`1`) -> src="#", no onerror), single-quote, angle-bracket (<script> stripped + url rejected), javascript:, data:, vbscript: -> all href/src="#".
  Independently proven against the PRE-FIX renderer: the same proven payload produced <a href="/a" onpointerover=alert`1`" ...> (a LIVE handler) and the image payload produced <img src="/x" onerror=alert`1`" ...>. The fix neutralizes the attribute-breakout at the shared sanitizeUrl chokepoint, so blog and pages (which consume the same component) are protected too. The pass-1 BLOCKING finding is resolved.
- apps/web/components/markdown-renderer.tsx:155-213 - No OTHER unescaped user-derived attribute interpolation remains in renderInline. The only emitted attributes are href (sanitizeUrl), src (sanitizeUrl), alt (escapeHtml), and the static target/rel/loading. Link text and alt both pass through escapeHtml; no title attribute is ever generated; stripRawHtml removes raw tags before conversion and code-block/inline-code content is escapeHtml'd.
  Confirms the fix closes the whole attribute-injection class for this renderer, not just the single proven payload — there is no second unescaped attribute sink to pivot to.
- apps/web/components/authoring-components.spec.ts:313-391 - Pass-1 P3 WARNING (no behavioural XSS test) is CLOSED. 9 behavioural tests now call the pure convertMarkdownToHtml directly with live attack payloads (proven onpointerover, quote-in-href, onerror img, quote-in-image, javascript: link, javascript: img, data:, plus 2 safe-URL regression guards) and assert the rendered output is inert (href/src="#", no on*=, no scheme). Executed GREEN in the worktree-local vitest run (authoring-components.spec.ts: 45 tests). Independently confirmed NON-VACUOUS: re-running the proven and image payloads against the extracted pre-fix renderer produced live onpointerover/onerror handlers, so these assertions genuinely fail pre-fix.
  The XSS-safe-render AC is now backed by behavioural assertions (not just source-grep), satisfying P3 and giving regression protection against re-introducing the attribute-breakout.
- apps/web/components/markdown-renderer.tsx:243 - INFO / CONCERN FOR VERIFIER (NOT a security defect): the new /["'<>&]/ reject also blanks legitimate multi-parameter query-string URLs — e.g. https://example.com/?a=1&b=2 now renders href="#" (empirically confirmed). This is over-rejection: more URLs are blanked, never an injection, so it is fail-safe from a security standpoint.
  Flagged for the Verifier/Implementer to adjudicate as a correctness matter (the doc already labels it a pending caveat). It does NOT affect the security verdict because the direction of the error is safe. A narrower fix (reject only " ' < >, or percent-encode & rather than reject) would restore legitimate & URLs without weakening the XSS defense; that is a follow-up, not a blocker.
- apps/web/app/forums/[boardSlug]/[topicSlug]/page.tsx:204, 380-443 - Concern #2 (mod gate) UNCHANGED and sound. Source is byte-for-byte identical since the pass-1 archive (diff e711c66..HEAD touches only markdown-renderer.tsx + 2 specs + media.md). The client moderator gate remains UX-only; ST6 server enforces 401/403 before any data op. Tests assert both directions.
  The remediation introduced no change to the moderation surface; the pass-1 confirmation carries forward.
- apps/web/app/forums/page.tsx, apps/web/components/mention-autocomplete.tsx, apps/web/app/login/login-client.tsx:n/a - Concerns #3 (index shows only site boards via public listCategories), #4 (mention autocomplete renders only allowlisted username/displayName via React-escaped JSX, no parallel user listing), #5 (quote resolves only from same-page allPosts, no arbitrary-id fetch), and #6 (?next= constrained to in-app / paths, no open-redirect) are ALL UNCHANGED since pass 1 (no source edits) and remain sound. No new code path or injection sink was introduced by the fix.
  The fix is a pure tightening localized to the renderer; it cannot have regressed the other five ST16 security concerns, which retain their pass-1 confirmations.

Test sufficiency assessment:
- SUFFICIENT for the security AC. Validation matrix GREEN worktree-locally: vitest --root apps/web = 10 files / 377 tests passed, 0 failures (up from 368 at pass 1; the +9 are the new behavioural XSS tests). pnpm typecheck (api+web) = Done. pnpm lint (api+web, --max-warnings=0) = Done.
- The 9 new behavioural XSS tests in authoring-components.spec.ts execute the converter against live payloads and were independently verified NON-VACUOUS (proven + image payloads produce live handlers against the extracted pre-fix renderer; render inert against the fixed renderer). This closes the pass-1 P3 WARNING.
- Empirical re-review beyond the committed tests: a throwaway 12-payload battery (run worktree-locally then removed) confirmed every attack variant renders inert and the proven payload is neutralized; safe URLs pass through intact.

Documentation / operational guidance assessment:
- SUFFICIENT. docs/features/media.md now documents the sanitizeUrl attribute-breakout hardening (rejects " ' < > & -> "#") and transparently records the known & multi-param-query functional regression as a pending caveat for verifier adjudication. This corrects the pass-1 DOC GAP where the renderer's XSS guarantee was contradicted by the PoC.
- No operational/runbook gap: the fix is a client-render hardening with no new env, migration, or deployment surface.

Artifacts written:
- artifacts/milestone-4-forums/ST16/security_report.md
- artifacts/milestone-4-forums/ST16/security_result.json

Outcome:
- PASS
