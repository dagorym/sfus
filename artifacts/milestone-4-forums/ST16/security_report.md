Security Review Report

Scope reviewed:
- Specialist security review of Milestone 4 ST16 — web forum surfaces: index/board/topic pages, create-topic + reply authoring, quote affordance, @-mention autocomplete, and moderator pin/lock/move controls.
- Changed files reviewed (diff ms4...HEAD): apps/web/app/forums/page.tsx, [boardSlug]/page.tsx, [boardSlug]/[topicSlug]/page.tsx, [boardSlug]/new-topic/page.tsx, forums-client.ts, forums.module.css; apps/web/components/mention-autocomplete.tsx (+ .module.css); specs forums.spec.ts and mention-autocomplete.spec.ts.
- Read-only context: apps/web/components/markdown-renderer.tsx (the single render trust boundary, unchanged by ST16), apps/web/components/markdown-editor.tsx, apps/web/app/auth-client.ts, apps/web/app/login/login-client.tsx, apps/api/src/media/markdown-sanitizer.ts (server write-path validator), docs/features/forums.md, docs/features/web-shell.md, plans/milestone-4-forums-plan.md (ST16 + R1), docs/development/agent-retrospective-patterns.md (P3/P4).
- Validation matrix run worktree-locally: vitest (apps/web root), typecheck (api+web), lint (api+web).

Why specialist review was triggered:
- ST16 renders USER-AUTHORED content (topic titles, topic/post bodies, quoted content, author displayName, @username) and exposes a moderator UI; plan marks ST16 Security review: required.
- Plan focus: (1) the render path must be XSS-safe; (2) the client-side moderator UI gate must NOT be the only control.
- Plan Risk R1 (Visibility/oracle leaks) — many new read paths; index must expose only site boards; quote/mention paths must not leak non-readable content.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md ST16 (lines 418-444) and Risk R1 (lines 564-567).
- ST16 ACs: forum index shows only site boards; board/topic pages render sanitized Markdown (no raw HTML execution); guests get a sign-in affordance preserving ?next=; locked topics hide the form; @-autocomplete queries the suggest endpoint and rendered @username links to the public profile; moderator controls render only for moderator/admin and call the ST6 API, non-privileged users never see them; web lint+typecheck pass and web tests execute behavior (P3).
- docs/features/forums.md (web surfaces, sanitization, moderation enforcement boundary, ?next= guard); docs/features/web-shell.md (route map); agent-retrospective-patterns.md P3 (tests-mirror-implementation; web tests that grep source) and P4 (run full validation matrix).

Findings

BLOCKING
- apps/web/components/markdown-renderer.tsx:194-201, 218-226 - Stored XSS reachable through the ST16 render path: a Markdown link/image DESTINATION containing a double-quote breaks out of the rendered HTML attribute and injects a live event handler. sanitizeUrl() returns the URL without HTML-attribute escaping, and renderInline interpolates it raw into href="..."/src="...". PoC body [click](/a" onpointerover=alert`1`) passes the server validateMarkdownBody (no '<', no javascript:/data: scheme) and renders as <a href="/a" onpointerover=alert`1`" ...> with a live onpointerover handler. Verified empirically via node reproduction of both layers.
  ST16 newly routes user-authored forum topic/post/quote bodies through this exact path, and the AC requires 'no raw HTML execution'. The defect survives BOTH the server write-path validator (markdown-sanitizer.ts only blocks raw-HTML/script and javascript:/vbscript:/data: schemes — it does not anticipate a quote inside a Markdown link destination) and the client strip/escape layers (the URL is not run through escapeHtml). This is a genuine stored-XSS exploitable by any authenticated member who can post a topic/reply. Root cause is in the shared MarkdownRenderer (also consumed by blog and pages), so the fix must be centralized (escape the sanitizeUrl output / encode '"' before attribute interpolation, or reject destinations containing '"') and the ST16 'no raw HTML execution' AC re-verified. Fix the shared component, then re-run security.

WARNING
- apps/web/app/forums/forums.spec.ts:388-437 - The ST16 web specs follow the repo's existing SOURCE-AUDIT convention (read source text, assert substrings) — acceptable for structural ACs given no jsdom harness, but they do NOT execute the sanitizer against any XSS payload. The XSS-safe-render AC is asserted only by greppping for the presence of stripRawHtml/sanitizeUrl/escapeHtml, which is exactly why the attribute-injection vector above shipped green.
  Per P3, a passing suite that mirrors the implementation rather than the contract hides defects. The markdown-renderer converter functions are pure and unit-testable WITHOUT a DOM harness (export them or test convertMarkdownToHtml output) — adding a behavioral unit test that feeds malicious payloads (quote-in-URL, unclosed tag, javascript:, data:) and asserts the rendered output contains no live handler/scheme is right-sized and does NOT require standing up jsdom/Testing-Library. The moderator-gate is tested in both directions (forums.spec.ts 293-315) which is adequate for that AC; the XSS gap is the material one.

NOTE
- apps/web/app/forums/[boardSlug]/[topicSlug]/page.tsx:204, 380-443 - Client moderator gate is UX-only and the ST6 API is the real boundary: controls render only when hasGlobalRole(session.user,'moderator') and each handler calls forums-client pin/unpin/lock/unlock/move which POST to /api/forums/moderation/topics/:id/... with credentials:include. Server (ST6, docs/features/forums.md 369-392) enforces 401 (no session) / 403 (non-moderator) before any data op. A user who never sees the buttons, or crafts the request directly, is still rejected server-side. Tests assert BOTH directions.
  Confirms concern #2 is satisfied — the client gate is not relied upon as the security boundary.
- apps/web/app/forums/page.tsx:14, 25, 84-99 - Forum index consumes only the public listCategories() read API (server-filtered to site boards); no credentials:include on the index; board links use /forums/${encodeURIComponent(board.slug)}; no admin/project board endpoints are called. Board ids are used only as opaque fetch parameters, not leaked into rendered markup beyond what the public API returns.
  Confirms concern #3 — no client-side fetch or render of non-site/non-readable boards; no visibility/oracle leak introduced by the index.
- apps/web/components/mention-autocomplete.tsx:26, 80-92, 205-221 - Autocomplete calls suggestUsers() → GET /api/users/suggest (ST14, session-gated via credentials:include), debounced 200ms; renders only the allowlisted username/displayName via React-escaped JSX; never builds a parallel user listing and never renders user-supplied HTML. The inserted handle is the raw username placed as plain text into the textarea.
  Confirms concern #4 — no parallel user-listing and only allowlisted fields are rendered.
- apps/web/app/forums/[boardSlug]/[topicSlug]/page.tsx:59-79 - A quote is resolved ONLY from allPosts (the current page of the SAME topic, already fetched via the gated listPosts read path) — never via an independent fetch of an arbitrary quotedPostId. It therefore cannot display content from a non-readable/other topic; when the referenced post is not on the current page it degrades gracefully to a placeholder with no content fetch. (Functional limitation: a quote of a post on a different page shows the placeholder — not a security issue.)
  Confirms concern #5 — quote display cannot leak non-readable content and degrades gracefully. Note: the body still flows through MarkdownRenderer, so the BLOCKING XSS finding also applies to quoted content.
- apps/web/app/login/login-client.tsx:19-23 - Every ST16 ?next= value is an in-app /forums/... path built from encodeURIComponent of slug params (board/topic pages and resolveProtectedSession). The login consumer constrains next to candidate.startsWith('/') && !candidate.startsWith('//'), rejecting absolute external and protocol-relative URLs and defaulting to /app. ST16 introduces no user-controlled arbitrary URL into next.
  Confirms concern #6 — no open-redirect introduced.

Test sufficiency assessment:
- Validation matrix ran GREEN worktree-locally: vitest --root apps/web = 10 files / 368 tests passed (incl. ST16's forums.spec.ts 51 tests + mention-autocomplete.spec.ts 24 tests); typecheck (api+web) Done; lint (api+web, --max-warnings=0) Done. The differing test count vs a main-repo run confirms the worktree-local run actually exercised the ST16 specs.
- Source-audit spec convention is ACCEPTABLE for the structural ACs (no jsdom/Testing-Library harness exists in this repo; standing one up is out of right-sized scope). The moderator gate is proven in both directions.
- INSUFFICIENT for the XSS-safe-render security AC (P3): no test executes the sanitizer against an XSS payload, which is why the BLOCKING attribute-injection vector passed green. Recommended right-sized fix: a behavioral unit test of the markdown-renderer converter (pure functions, no DOM needed) feeding malicious payloads and asserting the output carries no live handler/scheme. This does NOT require a jsdom harness.

Documentation / operational guidance assessment:
- docs/features/forums.md accurately documents the moderation server-enforcement boundary (401/403 before data op), the client-gate-is-UX-only stance, the ?next= open-redirect guard, mention link encoding, and quote same-page resolution.
- DOC GAP tied to the BLOCKING finding: docs/features/forums.md (~lines 473-479) asserts MarkdownRenderer makes 'no script can execute' and 'rejects javascript:, data:, and any non-http(s)/relative URL scheme', but overlooks the attribute-injection-via-unescaped-quote in a Markdown link/image destination. Once the renderer is fixed, this claim should be re-validated; until then the documented XSS guarantee is contradicted by the PoC.

Artifacts written:
- artifacts/milestone-4-forums/ST16/security_report.md
- artifacts/milestone-4-forums/ST16/security_result.json

Outcome:
- FAIL
