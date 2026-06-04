Verifier Report

Scope reviewed:
- Review covers Implementer commits 918b6e8 and 3fc4cb7 (blog publishing feature + bare-img lint fix), Tester commit 7c14d17 (test coverage), remediation artifact commit 48b306e, and Documenter commit 9902b64 (docs updates). Files reviewed: blog.service.ts, blog.controller.ts, blog.module.ts, blog.service.test.ts, blog.spec.ts, blog-client.ts, admin blog pages (list/new/edit), public blog pages (list/slug), blog-post.entity.ts, markdown-sanitizer.ts, docs/README.md, docs/website-launch-guide.md.

Acceptance criteria / plan reference:
- plans/ms3-completion-and-copilot-port-plan.md -- Subtask 3 acceptance criteria AC1-AC5

Convention files considered:
- AGENTS.md
- CLAUDE.md

Findings

BLOCKING
- None

WARNING
- apps/api/src/blog/blog.controller.ts:212 - listComments fallback path does not check publishedAt <= now
  When postId is a UUID, findPublishedBySlug returns null and the fallback findById is used, which only checks status === 'published' -- not publishedAt <= now. A future-dated published post would return 200 with an empty comment list rather than 404. Data exposure is minimal (post content is never sent, and no comments can exist on a future-dated post due to createComment guards), but the public surface is inconsistent with the documented invariant that scheduled posts are hidden. Recommended fix: add publishedAt <= now to the fallback branch.
- docs/README.md:203 - BlogPostSummary response shape documentation lists commentsLocked but it is absent from the actual API response
  The docs list commentsLocked as part of the BlogPostSummary response shape, but the BlogPostSummary TypeScript interface (blog.controller.ts:328-339) and toSummary() mapper (blog.controller.ts:347-359) do not include commentsLocked. The field exists on the entity (blog-post.entity.ts:41) but is not exposed through any response mapper. The documentation is inaccurate and would mislead API consumers integrating against this shape.

NOTE
- apps/api/src/blog/blog.service.test.ts:163 - findPublished/findPublishedBySlug filter assertions do not assert the LessThanOrEqual publishedAt constraint
  The tests at lines 163 and 183 assert that findPublished and findPublishedBySlug call their repo methods with status=published but do not assert that the LessThanOrEqual(now) constraint is also passed for publishedAt. The behavior is correct in implementation but the test assertion is weaker than the behavior it claims to cover -- removing the publishedAt filter would not be caught by these tests.

Test sufficiency assessment:
- 318 tests pass (200 API, 118 web), covering all 5 ACs. The API service test file directly tests publishedAt-driven filtering, sanitization with multiple injection vectors (script, iframe, event handlers), featuredImageId validation, publishAt() scheduling, toggleFeatured() flip/unflip, and comment creation guards including future-dated post protection. The web spec file uses source-contract assertions to confirm API client helper shapes, credential handling, admin-only guards, scheduled-post UI labeling, and ImageUpload wiring. One gap noted: filter assertions for findPublished and findPublishedBySlug do not assert the LessThanOrEqual constraint presence, only the status filter. Overall coverage is sufficient for the acceptance criteria.

Documentation accuracy assessment:
- docs/README.md accurately describes the LessThanOrEqual(now) visibility filter, publishAt/toggleFeatured routes, unpublish behavior (returns to draft + clears publishedAt), sanitization pipeline, and featured image validation. One inaccuracy identified: BlogPostSummary response shape documentation lists commentsLocked but the actual API response type and mapper do not include this field. docs/website-launch-guide.md changes are accurate. In-code JSDoc comments are accurate and complete.

Artifacts written:
- artifacts/ms3-completion-and-copilot-port/subtask-3/verifier_report.md
- artifacts/ms3-completion-and-copilot-port/subtask-3/verifier_result.json

Verdict:
- PASS
