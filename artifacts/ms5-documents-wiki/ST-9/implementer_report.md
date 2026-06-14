# Implementer Report

Status:
- success

Task summary:
- ST-9: Documents revision history, side-by-side diff, and rollback UI (web). Built /docs/history/[...path] with history view (revisions with author/editor/summary/timestamp), side-by-side diff renderer (server diff hunks: added/removed/unchanged), and staff-gated rollback wired to POST /api/docs/:id/rollback. Extended docs-client.ts with getDocHistory, getDocRevision, getDocDiff, rollbackDocPage (per-segment path encoding, error-envelope pattern, 400 size-cap friendly message). Extended docs.module.css with history list and diff table styles. Fixed History affordance link in /docs/[...path]/page.tsx from /docs/{path}/history to /docs/history/{path} (route-placement correction).

Changed files:
- apps/web/app/docs/history/[...path]/page.tsx
- apps/web/app/docs/docs-client.ts
- apps/web/app/docs/docs.module.css
- apps/web/app/docs/[...path]/page.tsx

Validation commands run:
- pnpm --dir apps/web lint
- pnpm --dir apps/web build

Validation outcome:
- All green: lint 0 warnings (--max-warnings=0); next build succeeded (34 routes compiled including /docs/history/[...path], 0 type errors).

Implementation/code commit hash:
- 89cf88f

Artifacts written:
- artifacts/ms5-documents-wiki/ST-9/implementer_report.md
- artifacts/ms5-documents-wiki/ST-9/tester_prompt.txt
- artifacts/ms5-documents-wiki/ST-9/implementer_result.json

Implementation context:
- Route at apps/web/app/docs/history/[...path]/page.tsx (URL: /docs/history/<path>) per App Router constraint that catch-all must be the last segment.
- History affordance link in apps/web/app/docs/[...path]/page.tsx updated from /docs/${page.path}/history to /docs/history/${page.path}.
- Non-staff users see history list and diff view but have no rollback button (isStaff gate via hasGlobalRole(session.user, 'moderator')); server gate (assertDocWriteAccess) is authoritative.
- 400 response from diff endpoint (size cap exceeded) surfaces friendly message: 'too large to compare' rather than a crash.
- SideBySideDiff table: removed lines = red tint (left side only), added lines = green tint (right side only), unchanged = muted both sides. Gutter columns show line numbers.
- getDocHistory and getDocDiff return null on 404 (oracle parity with ST-2/ST-5 read paths).
- rollbackDocPage reloads history after success and updates from/to selectors to (rolled-back-rev, new-rev); shows success message with new revision number.
- Diff selectors auto-populate to (latest-1, latest) on initial load when >= 2 revisions exist.
- docs-client.ts new helpers: getDocHistory(pageId), getDocRevision(pageId, revisionNumber), getDocDiff(pageId, from, to), rollbackDocPage(pageId, revisionNumber).
- pnpm install --frozen-lockfile was run in the worktree to materialize node_modules from pnpm store cache before running lint/build.

Expected validation failures carried forward:
- None
