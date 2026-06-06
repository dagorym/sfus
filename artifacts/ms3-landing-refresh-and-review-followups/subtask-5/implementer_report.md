# Implementer Report

Status:
- success

Task summary:
- Harden the media image-serving route against a vanished-file TOCTOU race. Attach an on('error') handler to fs.createReadStream() in MediaController.serveImage() so that ENOENT returns a controlled 404 instead of an unhandled stream error or hung connection.

Changed files:
- apps/api/src/media/media.controller.ts
- apps/api/src/media/media.controller.test.ts

Validation commands run:
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/media/media.controller.test.ts --reporter=verbose
- npx --yes pnpm@10.0.0 typecheck
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 test

Validation outcome:
- Media controller tests 7/7 PASS (existing 6 upload-auth tests plus 2 new TOCTOU stream-hardening tests for ENOENT and headers-already-sent cases). Typecheck PASS. Lint: pre-existing failure in navigation.controller.test.ts (unused import, not introduced by this change). Full test suite: pre-existing 6 navigation failures (ENOENT path bug), not introduced by this change. All in-scope media validations pass.

Implementation/code commit hash:
- 36f66434a792927766f64d32026db5718925b418

Artifacts written:
- artifacts/ms3-landing-refresh-and-review-followups/subtask-5/implementer_report.md
- artifacts/ms3-landing-refresh-and-review-followups/subtask-5/tester_prompt.txt
- artifacts/ms3-landing-refresh-and-review-followups/subtask-5/implementer_result.json

Implementation context:
- serveImage() uses @Res() (raw Express response), so NestJS exception filters cannot catch errors thrown inside stream event callbacks.
- The on('error') handler calls res.status(404).json() directly for ENOENT when headers are not yet sent.
- When res.headersSent is true (partial body flushed), the handler calls res.destroy() to close the connection cleanly.
- Non-ENOENT I/O errors send a 500 response.
- stream.pipe(res) is unchanged — the error handler only intercepts the error event, not the normal data flow.
- vi.mock('node:fs') is added at module level so tests can inject fake Readable streams that emit controlled errors.

Expected validation failures carried forward:
- npx --yes pnpm@10.0.0 lint — apps/api/src/navigation/navigation.controller.test.ts: 'UnauthorizedException' is defined but never used (pre-existing, not introduced here)
- npx --yes pnpm@10.0.0 test — apps/api/src/navigation/navigation.controller.test.ts: ENOENT reading controller source file (doubled path, pre-existing, not introduced here)
