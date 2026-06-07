Verifier Report

Scope reviewed:
- Pass-2 implementer (commit 624f458): apps/api/src/blog/blog.controller.ts — @ApiForbiddenResponse on createComment updated from stale 'Post is not published.' to 'Comments are locked on this post.'; @ApiNotFoundResponse updated from stale 'Post not found.' to 'Post not found or not published.'
- Pass-2 tester (commit 03fea84): apps/api/src/blog/blog.controller.test.ts — 3 new source-contract assertions added to pin both corrected decorator descriptions and verify stale text is absent, forming a regression guard for future OpenAPI accuracy.
- Documenter (commit 866049c): no new doc edits; docs/README.md retained from pass-1 documenter commit 3ba4cd6 which already corrected all three stale 403-for-non-public references to 404.
- Pass-1 changes (resolvePostId fallback to findPublishedById and createComment defense-in-depth NotFoundException) remain in place and are unchanged; pass-2 touches only Swagger decorators and their source-contract tests.

Acceptance criteria / plan reference:
- plans/ms3-review-closeout-plan.md — Subtask 8 (pp. 202-218): Close the comment-creation existence oracle (403 -> 404 for non-public posts). Decision D8.
- Verifier-1 CONDITIONAL PASS (artifacts/ms3-review-closeout/subtask-8/history/verifier-1-conditional/verifier_report.md): WARNING on stale @ApiForbiddenResponse 'Post is not published.' on createComment — resolved by pass-2 implementer commit 624f458.
- Acceptance criteria: AC1 (indistinguishable 404 for non-public posts), AC2 (public post comment creation unchanged; locked post still 403), AC3 (other comment routes unchanged), AC4 (no existence oracle), AC5 (API builds/typechecks), AC6 (OpenAPI decorators accurate with 3 new source-contract tests).

Convention files considered:
- AGENTS.md — workflow, role boundaries, read-only constraint for verifier.
- .myteam/verifier/role.md — verifier mission, required workflow, output requirements.
- docs/README.md — canonical home for API route response-code documentation (subtask-8 documenter scope).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/blog/blog.controller.test.ts:230 - Source-contract window is exactly 600 chars; robust but would miss a decorator if the decorator block grows beyond 600 chars.
  The 600-character lookback from 'async createComment(' is currently exactly the available window length. Python simulation confirms all five targeted assertions pass against current source. The current decorator block is ~300 chars, leaving headroom. If the decorator block grows substantially, the 600-char constant may need updating. Informational only — no action required.
- apps/api/src/blog/blog.controller.ts:276-280 - TOCTOU window between resolvePostId and createComment.findOne remains deferred (carry-forward from verifier-1 NOTE).
  A post could transition from published to non-public between resolvePostId (line 278) and the createComment service call (line 280). The defense-in-depth NotFoundException in blog.service.ts (lines 382-386) correctly handles this case — no oracle leakage occurs. Deferred per docs/deferred-tasks.md. No test exercises the race scenario, which is acceptable given the DB-level atomicity constraint and deferred classification.
- apps/api/src/blog/blog.controller.test.ts:44-199 - Controller tests simulate resolvePostId logic manually rather than calling the private controller method (carry-forward from verifier-1 NOTE).
  Tests create a BlogService instance and directly call service methods to simulate the resolvePostId slug-then-id fallback, rather than exercising the actual private resolvePostId method on BlogController. This is an acceptable tradeoff given the private visibility. The 3 new pass-2 source-contract tests partially compensate by asserting directly against controller source; the critical findById -> findPublishedById change is confirmed in the source diff.

Test sufficiency assessment:
- SUFFICIENT. 7/7 blog.controller.test.ts tests pass: 4 pass-1 oracle-parity/predicate tests + 3 new pass-2 source-contract assertions. Python simulation confirms all source-contract window assertions hold against the current controller source.
- The 3 new source-contract tests are the effective regression guard for the verifier-1 WARNING: any re-introduction of the stale 'Post is not published.' @ApiForbiddenResponse text or 'Post not found.' @ApiNotFoundResponse text will immediately fail tests 1 and 2; test 3 verifies both corrected descriptions appear in the same decorator block.
- 79/79 blog.service.test.ts pass unchanged from pass-1 (service-level oracle-parity suite, commentsLocked regression, predicate operator assertions).
- Pre-existing 6 navigation.controller.test.ts failures are unrelated (cwd path-construction bug owned by a separate subtask).

Documentation accuracy assessment:
- ACCURATE. docs/README.md lines 199, 253, and 269 (pass-1 documenter commit 3ba4cd6) correctly state 404 for non-public posts and 403 only for commentsLocked=true on a public post, with explicit existence-oracle-prevention language. No changes needed in pass-2.
- Swagger/OpenAPI in-code documentation now accurate: @ApiForbiddenResponse({ description: 'Comments are locked on this post.' }) and @ApiNotFoundResponse({ description: 'Post not found or not published.' }) on createComment at lines 268 and 270 respectively. This was the exact inaccuracy raised in verifier-1 WARNING — confirmed resolved.
- No new documentation gaps introduced by pass-2 changes (decorator-only edit; no behavioral change to document).

Artifacts written:
- artifacts/ms3-review-closeout/subtask-8/verifier_report.md
- artifacts/ms3-review-closeout/subtask-8/verifier_result.json

Verdict:
- PASS
