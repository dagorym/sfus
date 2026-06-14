# Implementer Report

Status:
- success

Task summary:
- ST-5 remediation pass: add DoS size guard to DocsService.getDiff — expose DOCS_DIFF_MAX_BODY_BYTES and DOCS_DIFF_MAX_LINES as named constants in docs.types.ts; reject with BadRequestException(400) before entering the O(m*n) LCS DP table when either revision body exceeds the cap.

Changed files:
- apps/api/src/docs/docs.types.ts
- apps/api/src/docs/docs.service.ts

Validation commands run:
- pnpm -r --filter ./apps/api run typecheck
- pnpm -r --filter ./apps/api run lint
- pnpm -r --filter ./apps/api run test
- pnpm -r --filter ./apps/api run build

Validation outcome:
- all pass — typecheck: clean, lint: clean, test: 1149 passed / 23 skipped (integration tests skipped, no DB), build: clean

Implementation/code commit hash:
- 8d41a96

Artifacts written:
- artifacts/ms5-documents-wiki/ST-5/implementer_report.md
- artifacts/ms5-documents-wiki/ST-5/tester_prompt.txt
- artifacts/ms5-documents-wiki/ST-5/implementer_result.json

Implementation context:
- docs.types.ts: Added DOCS_DIFF_MAX_BODY_BYTES = 512_000 (512 KB per revision body) and DOCS_DIFF_MAX_LINES = 5_000 (lines per revision body) as exported named constants in a new 'Diff size limits' section. Full JSDoc explains rationale and worst-case DP table bound (5 000 * 5 000 = 25 000 000 cells).
- docs.service.ts: Added value import of DOCS_DIFF_MAX_BODY_BYTES and DOCS_DIFF_MAX_LINES alongside the existing 'import type' block.
- docs.service.ts getDiff: After fetching both revisions and before body.split('\n'), added (1) byte-length check: Buffer.byteLength(body, 'utf8') > DOCS_DIFF_MAX_BODY_BYTES -> throw BadRequestException with message 'Revision body exceeds the maximum allowed size for diff (NNN bytes).'; (2) line-count check: lines.length > DOCS_DIFF_MAX_LINES -> throw BadRequestException with message 'Revision body exceeds the maximum allowed line count for diff (NNN lines).'. Both checks fire before any O(m*n) work begins.
- The guard is deterministic and adds negligible overhead for normal-sized inputs. The LCS algorithm and diff output are completely unchanged for inputs below the cap.
- The fix closes the unauthenticated DoS surface flagged as WARNING in the security_report.md and verifier_report.md from the verifier-1-warn pass.
- The Documenter must document DOCS_DIFF_MAX_BODY_BYTES (512 KB) and DOCS_DIFF_MAX_LINES (5 000 lines) in docs/features/documents.md in the diff endpoint section (previously noted as a gap in security_report.md NOTE and verifier_report.md NOTE).

Expected validation failures carried forward:
- None
