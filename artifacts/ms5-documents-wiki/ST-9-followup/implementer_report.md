# Implementer Report

Status:
- success

Task summary:
- ST-9 carry-over defect fix: getDocDiff 400 branch now surfaces friendly 'too large to compare' message instead of raw API error string.

Changed files:
- apps/web/app/docs/docs-client.ts

Validation commands run:
- vitest run --root apps/web apps/web/app/docs/docs-client-history.spec.ts
- vitest run --root apps/web apps/web/app/docs/

Validation outcome:
- 36/36 tests passed. Previously-red test 'throws a too large to compare error on 400' now GREEN.

Implementation/code commit hash:
- 9eda14b

Artifacts written:
- artifacts/ms5-documents-wiki/ST-9-followup/implementer_report.md
- artifacts/ms5-documents-wiki/ST-9-followup/tester_prompt.txt
- artifacts/ms5-documents-wiki/ST-9-followup/implementer_result.json

Implementation context:
- Root cause: getDocDiff 400 branch called extractErrorMessage(payload, friendlyFallback). extractErrorMessage prefers payload.error.message ('Diff size exceeds limit.') over the fallback, so the friendly message was never thrown.
- Fix: removed extractErrorMessage from the 400 branch; now throws 'This diff is unavailable because one or more revisions are too large to compare.' directly.
- Only apps/web/app/docs/docs-client.ts was changed (lines 414-421, -5/+1).
- The 404-null and generic non-ok branches are unchanged.

Expected validation failures carried forward:
- None
