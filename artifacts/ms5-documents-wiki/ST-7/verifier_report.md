Verifier Report

Scope reviewed:
- ST-7 public Documents browse/render surface (web) on branch ms5-st7-verifier-20260611 against base ms5.
- Implementer commit d0c8c65: apps/web/app/docs/page.tsx (DocsIndexPage), apps/web/app/docs/[...path]/page.tsx (DocsPageView), apps/web/app/docs/docs-client.ts, apps/web/app/docs/docs.module.css.
- Tester commit 58d7f6d: apps/web/app/docs/docs-index.spec.ts (17 tests), docs-page.spec.ts (27 tests), docs-client.spec.ts (41 tests) — 85 tests total.
- Documenter commit 7798d28: docs/features/documents.md (ST-7 web surface section added), docs/features/web-shell.md (two route rows added).

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md — ST-7 section (lines 264-283), acceptance criteria AC1-AC4.

Convention files considered:
- AGENTS.md
- plans/ms5-documents-wiki-plan.md (P5: App Router export allowlist; P7: shared error-envelope pattern)
- docs/development/api-conventions.md
- docs/features/web-shell.md
- docs/features/documents.md

Findings

BLOCKING
- None

WARNING
- apps/web/app/docs/docs-client.ts:129 - encodeURIComponent on slash-joined multi-segment path encodes slashes as %2F, breaking API lookup for nested pages
  getDocPageByPath calls fetch(`${apiBase}/docs/${encodeURIComponent(path)}`). For a multi-segment path like 'getting-started/installation', encodeURIComponent encodes '/' as '%2F', producing '/api/docs/getting-started%2Finstallation'. Express does not decode %2F in wildcard path matching; the @Get('*path') handler receives 'getting-started%2Finstallation' (still encoded) rather than 'getting-started/installation', causing the page lookup to fail with a 404 for any nested page. Single-segment root-level pages are unaffected. The test at docs-client.spec.ts:157 only asserts the presence of encodeURIComponent, not that multi-segment paths are encoded correctly. Fix: encode each segment individually — path.split('/').map(encodeURIComponent).join('/') — or omit encoding entirely since useParams already returns URL-decoded segments.

NOTE
- apps/web/app/docs/[...path]/page.tsx:215 - Acquire lock affordance links to /edit (same href as Edit button) rather than a dedicated lock route
  Both 'Edit' (line 211) and 'Acquire lock' (line 215) point to /docs/<path>/edit. This is acceptable for ST-7 scope: the ST-8 edit route is intended to also handle lock acquisition, and the implementer report explicitly notes that /docs/<path>/edit does not yet exist. These are defense-in-depth placeholder links.
- apps/web/app/docs/page.tsx:55 - Redundant session !== undefined check after session != null (loose inequality already excludes undefined)
  In JavaScript, null != null is false and undefined != null is also false (loose equality treats null and undefined as equal). The additional session !== undefined is redundant and harmless. No functional defect.

Test sufficiency assessment:
- 85 new source-contract tests cover all four acceptance criteria: AC1 (tree rendering, breadcrumbs, MarkdownRenderer, revision author/summary), AC2 (isStaff gate, Create/Edit/Acquire lock/History affordances, lock banner visible to all, isLocked computation), AC3 (not-found state, oracle-parity message, Back to Documents link), AC4 (only default export, no non-allowlisted App Router exports, no dangerouslySetInnerHTML).
- Full web suite (640 tests) passes. Pre-existing env failures in authoring-components.spec.ts and user-avatar.spec.ts are unrelated worktree issues.
- Gap: docs-client.spec.ts:157 asserts encodeURIComponent is present but does not verify correctness for multi-segment paths. This allows the %2F encoding defect (WARNING finding) to pass undetected. A test asserting per-segment encoding or no-encoding of slashes would close this gap.
- Overall coverage is good for the scope of ST-7; the single gap corresponds to the WARNING finding.

Documentation accuracy assessment:
- docs/features/documents.md: New 'Web surface (ST-7)' section accurately describes routes, DocsIndexPage and DocsPageView behavior, breadcrumb trail structure, lock indicator visibility, not-found oracle parity, and docs-client.ts API functions with return types and error-envelope pattern.
- docs/features/web-shell.md: Two rows added to the route table for /docs (public, DocsIndexPage) and /docs/<path> (public catch-all, DocsPageView) with correct access level and cross-reference to documents.md#web-surface-st-7.
- No inaccuracies, omissions, contradictions, or duplication found.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-7/verifier_report.md
- artifacts/ms5-documents-wiki/ST-7/verifier_result.json

Verdict:
- CONDITIONAL PASS
