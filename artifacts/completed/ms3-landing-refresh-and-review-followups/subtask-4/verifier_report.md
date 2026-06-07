Verifier Report

Scope reviewed:
- Implementer (commit 58c14ed): apps/api/src/blog/blog.service.ts — added findPublishedById(id) enforcing status=published AND publishedAt<=LessThanOrEqual(now), mirroring findPublishedBySlug. apps/api/src/blog/blog.controller.ts — listComments UUID-fallback updated from findById+inline check to findPublishedById.
- Tester (commit aa795a6): apps/api/src/blog/blog.service.test.ts — added describe 'BlogService.findPublishedById public-visibility predicate (security regression)' with 4 tests; tightened findPublished/findPublishedBySlug assertions to verify publishedAt constraint presence.
- Documenter (commit c11335d): docs/README.md — updated GET /api/blog/:postId/comments description to document dual lookup paths and full public-visibility predicate, noting future-scheduled posts return 404.

Acceptance criteria / plan reference:
- plans/ms3-landing-refresh-and-review-followups-plan.md — Subtask 4 (Blog listComments future-scheduled visibility fix), acceptance criteria and security-review-required marker.

Convention files considered:
- AGENTS.md — single-source-of-truth rule, no-restatement rule, doc-update obligations.
- CLAUDE.md — pointer to AGENTS.md.

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/blog/blog.service.test.ts:217 - LessThanOrEqual operator type not asserted — only key presence checked.
  The test verifies calledWith.where has a 'publishedAt' key but does not assert the value is a TypeORM LessThanOrEqual FindOperator. This would not catch a regression where an exact-match constraint replaced the inequality. Low risk: the service implementation is directly observable and the DB-level enforcement is what matters in production.
- apps/api/src/blog/blog.controller.ts:249 - No controller-level test for the listComments UUID-fallback path.
  The listComments slug-first/UUID-fallback wiring is untested at the controller level. The fix is a one-liner calling findPublishedById, and service-level coverage is comprehensive, so risk is low. A controller integration test would provide additional regression protection.
- artifacts/ms3-landing-refresh-and-review-followups/subtask-4/tester_result.json:16 - Tester reports 66 tests; pnpm test from verifier environment shows 62.
  The pnpm --filter @sfus/api test command runs vitest from the parent worktree files (/home/tstephen/repos/sfus at ms3-claude), not the worktree branch. The worktree's test file has 66 it() calls confirmed by grep. The 4 additional tests are present and well-formed in the committed test file. This is a pnpm worktree environment artifact, not a test quality defect.

Test sufficiency assessment:
- Sufficient. The 4 new regression tests cover all acceptance criteria cases: query shape verification (status + publishedAt key present), null propagation for future-scheduled posts (AC1), successful return for genuinely public posts (AC2), and null for drafts (AC3). Existing findPublished/findPublishedBySlug assertions were tightened. Minor: LessThanOrEqual operator type not asserted (NOTE). No controller-level integration test exists (NOTE). Overall coverage is adequate for the acceptance criteria and security risk level.

Documentation accuracy assessment:
- Accurate. docs/README.md line 249 correctly documents the dual lookup paths, explicitly states both enforce the full public-visibility predicate (status=published AND publishedAt<=now), and notes future-scheduled posts return 404 consistent with every other public surface. No contradictions or inaccuracies found.

Artifacts written:
- artifacts/ms3-landing-refresh-and-review-followups/subtask-4/verifier_report.md
- artifacts/ms3-landing-refresh-and-review-followups/subtask-4/verifier_result.json

Verdict:
- PASS
