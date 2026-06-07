Verifier Report

Scope reviewed:
- Implementer changes (commit e94505b): blog.controller.ts resolvePostId fallback changed from findById to findPublishedById; blog.service.ts createComment non-public guard changed from ForbiddenException to NotFoundException; JSDoc updated on both methods.
- Tester changes (commit 4bc93eb): blog.service.test.ts -- 3 ForbiddenException assertions updated to NotFoundException, findPublishedBySlug and findPublishedById predicate assertions tightened to verify LessThanOrEqual operator type, oracle-parity suite added (5 new tests), commentsLocked ForbiddenException regression suite added (2 new tests); blog.controller.test.ts (new file) -- 4 tests pinning resolvePostId slug-then-id fallback wiring and published-only predicate on both branches.
- Documenter changes (commit 3ba4cd6): docs/README.md -- 3 stale 403 references corrected to 404 for non-public posts on comment-creation path (lines 199, 253, 269); 403 preserved only for commentsLocked=true on a public post.
- Plan reference: plans/ms3-review-closeout-plan.md, Subtask 8.

Acceptance criteria / plan reference:
- plans/ms3-review-closeout-plan.md -- Subtask 8 (page 202-218): Close the comment-creation existence oracle (403 -> 404 for non-public posts).
- Origin: WA1 retroactive security review of prior subtask-4, finding: authenticated existence oracle on POST /api/blog/:postIdOrSlug/comments.

Convention files considered:
- AGENTS.md -- workflow, role, and read-only constraints for verifier.
- .myteam/verifier/role.md -- verifier mission, required workflow, and output requirements.

Findings

BLOCKING
- None

WARNING
- apps/api/src/blog/blog.controller.ts:268 - Stale @ApiForbiddenResponse Swagger decorator on createComment handler still says 'Post is not published.'
  The only remaining 403 on the comment-creation path is commentsLocked=true on a public post. Non-public posts now return 404 (the whole point of this subtask). The Swagger decorator misleads API consumers, OpenAPI code generators, and anyone reading the auto-generated spec. It should be updated to 'Comments are locked on this post.' or removed. This is a documentation-in-code accuracy issue directly caused by the approved behavior change and was not corrected by the implementer.
- artifacts/ms3-review-closeout/subtask-8 - Missing specialist Security stage artifacts: no security_report.md or security_result.json for subtask-8 despite plan marking it 'Security review required: yes'.
  The plan (plans/ms3-review-closeout-plan.md, Subtask 8) explicitly states 'Security review required: yes (publication-leakage/oracle fix on an authenticated surface; expect a specialist Security stage).' Prior security-sensitive subtasks in this plan (subtask-5, subtask-7) and in the prior plan (subtask-3, subtask-4) each have security_report.md and security_result.json committed. Subtask-8 has none. The change is security-targeted (oracle fix), which makes specialist review important for establishing an audit trail and confirming no new bypass vector was introduced. This is a workflow compliance gap.

NOTE
- apps/api/src/blog/blog.controller.test.ts:68-79 - Controller tests simulate resolvePostId logic manually rather than calling the private controller method.
  The controller tests create a BlogService instance and directly call service methods to simulate the resolvePostId slug-then-id fallback logic, rather than exercising the actual private resolvePostId method on BlogController. This is an acceptable tradeoff given that resolvePostId is private, but it means a regression where the controller's method diverges from the simulated logic would not be caught by these tests. The critical actual-code change (findById -> findPublishedById) is directly verified by reading the implementation diff; the tests verify the service-level published-only predicate behavior.
- apps/api/src/blog/blog.controller.ts:276-280 - TOCTOU window between resolvePostId and createComment.findOne is mitigated but not tested.
  A post could transition from published to non-public between the resolvePostId call (line 278) and the createComment service call (line 280). The defense-in-depth NotFoundException in createComment handles this correctly -- a post that flips between those two calls will throw NotFoundException, not ForbiddenException, so no oracle leakage occurs. The TOCTOU hardening is deferred scope per docs/deferred-tasks.md, and the defense-in-depth change is the correct mitigation at this layer. No test exercises this specific race scenario, which is acceptable given the DB-level atomicity constraint and the deferred classification.

Test sufficiency assessment:
- SUFFICIENT with one notable gap. The 79 service tests (+7 new: 5 oracle-parity + 2 commentsLocked regression) and 4 controller wiring tests together cover all four acceptance criteria: (1) NotFoundException parity for nonexistent/draft/unpublished/future-scheduled posts; (2) public post comment creation unchanged; (3) locked public post ForbiddenException preserved with correct message; (4) resolvePostId published-only predicate on both slug and UUID fallback branches.
- The LessThanOrEqual operator type assertions (.type === 'lessThanOrEqual') are correctly tightened from key-presence-only assertions in both findPublishedBySlug and findPublishedById tests.
- The oracle-parity 'all four cases' test verifies identical NotFoundException class and message across all non-public variants, satisfying the security acceptance criterion.
- Gap: the controller tests simulate resolvePostId logic manually (private method constraint) rather than calling the actual controller method. The diff verification compensates for this.
- Gap: no test exercises the TOCTOU scenario (post transitions between resolvePostId and createComment). The defense-in-depth NotFoundException handles it correctly; the gap is acceptable given deferred-scope classification.

Documentation accuracy assessment:
- ACCURATE for docs/README.md. Three stale 403 references updated: (1) line 199 -- future-scheduled post comment response now correctly states 404 with existence-oracle disclosure note; (2) line 253 -- POST /api/blog/:postId/comments response code table correctly shows 404 for non-public/nonexistent and 403 only for commentsLocked=true on a public post; (3) line 269 -- Comment Authorization Model paragraph correctly describes 404 for draft/unpublished/future-scheduled, 403 for commentsLocked on public post.
- INACCURATE for Swagger/OpenAPI: blog.controller.ts line 268 @ApiForbiddenResponse still says 'Post is not published.' This is the stale decorator noted in the WARNING finding. The auto-generated OpenAPI spec will incorrectly describe a 403 for non-public posts.
- Overall: the narrative documentation is accurate; the in-code Swagger annotation requires a follow-up fix.

Artifacts written:
- artifacts/ms3-review-closeout/subtask-8/verifier_report.md
- artifacts/ms3-review-closeout/subtask-8/verifier_result.json

Verdict:
- CONDITIONAL PASS
