# Tester Report

Status:
- success

Task summary:
- ST-9: Documents revision history, side-by-side diff, and rollback UI (web). Route /docs/history/[...path] with history view (revisions with author/editor/summary/timestamp), side-by-side diff renderer (server diff hunks: added/removed/unchanged), and staff-gated rollback wired to POST /api/docs/:id/rollback. Extended docs-client.ts with getDocHistory, getDocRevision, getDocDiff, rollbackDocPage. History affordance link in /docs/[...path]/page.tsx fixed to /docs/history/<path>.

Branch name:
- ms5-st9-tester-20260611

Test commit hash:
- 7925343

Test files added or modified:
- apps/web/app/docs/docs-client-history.spec.ts (new)
- apps/web/app/docs/docs-history-page.spec.ts (new)
- apps/web/app/docs/docs-page.spec.ts (updated: tighten History link assertion)

Commands run:
- npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run --reporter=verbose
- npx --yes pnpm@10.0.0 --filter @sfus/web exec eslint app components --ext .ts,.tsx --max-warnings=0
- npx --yes pnpm@10.0.0 --filter @sfus/web exec next build

Pass/fail totals:
- test_files: 21
- tests_failed: 0
- tests_passed: 843

Unmet acceptance criteria:
- None

Final test outcomes:
- AC1 PASS: History list renders revisionNumber, author/editor display, createdAt timestamp, and summary. Auto-selector populates (latest-1, latest) on load when >= 2 revisions exist.
- AC2 PASS: SideBySideDiff renders added (diffLineAdded), removed (diffLineRemoved), and unchanged (diffLineUnchanged) CSS classes with line-number gutters (diffLineGutter). Friendly size-cap error on 400. 404 returns null.
- AC3 PASS: isStaff gate via hasGlobalRole('moderator') hides rollback button for non-staff. rollbackDocPage POSTs with credentials and revisionNumber. Post-rollback: history reloads and diff selectors update to (rolled-back-rev, new-rev). Success/error feedback rendered.
- AC4 PASS: next build and lint pass with 0 errors and 0 warnings.
- docs-page.spec.ts updated: History link assertion now verifies /docs/history/<path> pattern, confirming the ST-9 affordance-link fix.

Cleanup status:
- Temporary write_commit_msg.py helper removed from worktree before artifact commit.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-9/tester_report.md
- artifacts/ms5-documents-wiki/ST-9/tester_result.json
- artifacts/ms5-documents-wiki/ST-9/documenter_prompt.txt
