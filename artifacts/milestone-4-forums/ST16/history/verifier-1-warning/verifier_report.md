Verifier Report

Scope reviewed:
- ST16 web forum surfaces after Security-driven remediation (pass 2). Implementer, Tester, Documenter, and Security (2 passes) changes reviewed.
- Primary surface: apps/web/app/forums/* (index, board, topic, new-topic pages, forums-client.ts, CSS), apps/web/components/markdown-renderer.tsx (stored XSS fix + @internal export), apps/web/components/mention-autocomplete.tsx, apps/web/components/authoring-components.spec.ts (+9 XSS behavioral tests), apps/web/app/forums/forums.spec.ts (51 tests), docs/features/forums.md, docs/features/web-shell.md, docs/guides/content-management.md, docs/features/media.md.
- Security pass-2 verdict: PASS (0 blocking, 0 warning, 6 notes). Validation matrix run: vitest --root apps/web 377/377 pass, typecheck 0 errors, lint 0 warnings.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md ST16 acceptance criteria. Security baseline: artifacts/milestone-4-forums/ST16/security_report.md (PASS, security pass 2).

Convention files considered:
- AGENTS.md
- CLAUDE.md
- .myteam/verifier/role.md

Findings

BLOCKING
- None

WARNING
- apps/web/components/markdown-renderer.tsx:243 - sanitizeUrl() rejects URLs containing '&', breaking legitimate multi-parameter query-string URLs
  The reject regex /["'<>&]/ includes '&', causing any URL with 2+ query parameters (e.g. https://example.com/?a=1&b=2) to render as href='#'. RFC 3986 defines '&' as a legal unencoded query-parameter delimiter; it does NOT cause HTML attribute breakout in a double-quoted attribute. The rejection is fail-safe but is a functional regression affecting blog/pages/forums wherever multi-param URLs appear in Markdown links or images. Recommended fix: remove '&' from the reject set (keep '"', "'", '<', '>'). Documented by both Tester and Security stage and flagged for verifier adjudication.

NOTE
- docs/features/forums.md:490 - Documentation inaccuracy: claims MarkdownRenderer converts @username to profile links, but it does not
  The doc states '@username handles in rendered Markdown are rendered as links pointing to /users/<encodeURIComponent(username)> by MarkdownRenderer.' The MarkdownRenderer has no @username -> link conversion. Plain '@username' text renders as HTML-escaped plain text. Author bylines are rendered as Next.js <Link> elements in JSX (not via MarkdownRenderer). This misleads future developers about the renderer's capabilities and should be corrected.
- apps/web/components/markdown-renderer.tsx:228-247 - Stored XSS fix verified INERT and NON-VACUOUS; 9 behavioral XSS tests pass
  sanitizeUrl() now rejects attribute-breaking characters and returns '#'. Proven payload ([click](/a" onpointerover=alert`1`) -> href='#', no event handler). 9 behavioral tests are non-vacuous: 4/9 fail against pre-fix renderer. The pass-1 BLOCKING stored XSS is fully resolved.
- apps/web/app/forums/[boardSlug]/[topicSlug]/page.tsx:204, 381-443 - Moderator gate verified both directions: visible for mod/admin, absent for non-privileged
  isModerator derives from hasGlobalRole(session.user, 'moderator'). moderationBar rendered only when isModerator is true. Tests confirm both directions. ST6 API enforces 401/403 independently.
- apps/web/app/forums/page.tsx, apps/web/app/forums/[boardSlug]/page.tsx, apps/web/app/forums/[boardSlug]/new-topic/page.tsx:n/a - Guest ?next= affordances and locked-topic UX verified on all applicable surfaces
  Board view, topic view, and new-topic form all implement guest sign-in affordances preserving ?next=. Locked-topic UX hides the reply form and shows the 'This topic is locked' notice. All tested by forums.spec.ts.
- apps/web/app/forums/forums.spec.ts, apps/web/components/mention-autocomplete.spec.ts, apps/web/components/authoring-components.spec.ts:n/a - Test coverage adequate for source-audit pattern; 377 tests pass; XSS tests are behavioral and non-vacuous
  51 forum tests cover all 5 ACs. 24 mention-autocomplete tests cover AC5. 45 authoring-component tests including 9 XSS behavioral tests. Validation matrix fully green: vitest 377/377, typecheck 0 errors, lint 0 warnings.

Test sufficiency assessment:
- SUFFICIENT for the AC scope as implemented. 377/377 web tests pass. The 9 XSS behavioral tests are non-vacuous (4/9 fail against pre-fix renderer). Source-audit tests cover all 5 ACs. Validation matrix fully green: vitest 377/377, typecheck 0 errors, lint 0 warnings.

Documentation accuracy assessment:
- PARTIALLY ACCURATE. docs/features/forums.md, docs/features/web-shell.md, docs/guides/content-management.md accurately describe routing, session gating, moderator controls, locked-topic UX, quote affordance, and guest sign-in flows. docs/features/media.md accurately documents the XSS hardening and flags the & caveat. INACCURACY: docs/features/forums.md:490 incorrectly states MarkdownRenderer converts @username to profile links — it does not. Author bylines link to /users/<username> via JSX Link; @username text in post bodies renders as plain escaped text.

Artifacts written:
- artifacts/milestone-4-forums/ST16/verifier_report.md
- artifacts/milestone-4-forums/ST16/verifier_result.json

Verdict:
- CONDITIONAL PASS
