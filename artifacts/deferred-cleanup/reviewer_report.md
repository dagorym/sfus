Reviewer Report

Feature plan reviewed:
- plans/deferred-cleanup-plan.md (governing plan; 10 subtasks; coordination branch `cleanup` @ 7f0e454)

Inputs reviewed:
- artifacts/deferred-cleanup/subtask-1 .. subtask-10 (implementer/tester/documenter/verifier results where present; security artifacts for subtasks 1 and 8)
- Merged code state on cleanup @ 7f0e454: apps/api/src/index.ts, apps/web/next.config.mjs, apps/api/src/blog/{blog.controller.ts,blog.service.ts}, apps/api/src/pages/{pages.service.ts,pages.controller.ts,entities/standalone-page.entity.ts}, apps/api/src/navigation/navigation.service.ts, apps/api/src/media/{markdown-sanitizer.ts,media.controller.ts}, apps/web/app/{auth-client.ts,register/page.tsx,login/login-client.tsx,pages/page.tsx,pages/pages-client.ts,blog/blog-client.ts}, cicd/tests/run-validations.sh
- Documentation on cleanup @ 7f0e454: docs/features/{auth,blog,pages,navigation,media,web-shell}.md, docs/operations/deployment.md, docs/development/api-conventions.md, cicd/tests/README.md
- Unmerged documenter branches: cleanup-subtask-{3,5,7,8,10}-documenter-20260607 (commits 18cc9d7, 5493bdf, 4d3bce1, acc7388, d0b739f)
- Validation executed by reviewer on the merged branch: pnpm lint (clean), pnpm typecheck (clean), pnpm test (363 API passed + 2 skipped DB-gated; 293 web passed), pnpm --filter @sfus/api build (clean), bash cicd/tests/run-validations.sh (PASS)

Overall feature completeness:
- All 10 subtasks' code and test deliverables are implemented, merged to `cleanup`, and verified against the plan's acceptance criteria by direct inspection: trust proxy=1 (subtask-1), full web CSP/header baseline + API helmet without HSTS (subtask-2), public comment payload trimmed via split public/admin serializers + uniform 'parentId is invalid.'/'imageId is invalid.' oracles (subtask-3), ER_DUP_ENTRY slug retry bounded at 3 with 409 exhaustion (subtask-4), featuredMediaId validation at all 3 write sites + currentRevision relation with createForeignKeyConstraints:false + resolveCurrentBody removed (subtask-5), GET /api/pages list + /pages web index with title-ASC ordering (subtask-6), internal-URL leading-/ rule rejecting '//' (subtask-7), anchored sanitizer patterns + memoryStorage below imports (subtask-8), exported auth error-mapping helpers with 13 executed runtime spec cases (subtask-9), and repaired DB_HOST contract assertions with the compose.dev.yml override pinned (subtask-10). Lint, typecheck, full test suite, API build, and the CI/CD validation suite are all green on the merged branch.
- However, the plan is NOT fully delivered at the feature level: the documenter outputs for subtasks 3, 5, 7, 8, and 10 were never merged into the coordination branch (their commits exist only on per-subtask documenter branches), leaving stale and missing documentation on `cleanup` — including an affirmatively false claim in docs/features/blog.md that the comment-payload trim is still deferred. Additionally, the plan marks subtasks 2, 3, and 6 'Security review required: yes', but no specialist security artifacts or recorded waivers exist for them (only subtasks 1 and 8 received specialist review).

Findings

BLOCKING
- docs/features/blog.md:99-102 - Documenter commits for subtasks 3, 5, 7, 8, and 10 were never merged into `cleanup`. Commits 18cc9d7 (blog.md comment data-minimization contract), 5493bdf (pages.md featuredMediaId validation + currentRevision relation), 4d3bce1 (navigation.md internal-URL rule), acc7388 (media.md anchoring policy + six rejection classes), and d0b739f (cicd/tests/README.md DB_HOST coverage) exist only on their cleanup-subtask-N-documenter-20260607 branches. Their documenter_report.md/documenter_result.json artifacts are likewise absent from artifacts/deferred-cleanup/subtask-{3,5,7,8,10}/.
  The coordination branch's documentation contradicts shipped behavior: blog.md still states 'the public payload currently includes the moderation metadata fields — trimming them is a deferred task' (false since subtask-3), and the plan's documentation impacts for pages.md, navigation.md, media.md, and cicd/tests/README.md are unfulfilled on `cleanup`. This violates the plan's per-subtask Documentation Impact obligations, the 'no stale claims remain' review gate, and the artifact completion gate for five subtasks.
- plans/deferred-cleanup-plan.md:134, 165, 241 - Plan-mandated specialist security review was not performed for subtasks 2 (site-wide header policy), 3 (data minimization + oracle removal), and 6 (new public read path). The plan marks each 'Security review required: yes' and each implementer prompt repeats 'SECURITY REVIEW REQUIRED'. No security_report.md/security_result.json exists for these subtasks and no explicit waiver is recorded anywhere in artifacts/deferred-cleanup/.
  Per the governing plan and reviewer policy, a routine verifier pass is not a substitute for a plan-required specialist security stage. The same omission was treated as BLOCKING by the subtask-8 verifier and was remediated there; subtasks 2, 3, and 6 carry the identical unmet obligation with no recorded disposition.

WARNING
- artifacts/deferred-cleanup/subtask-8/verifier_result.json - The subtask-8 verifier verdict remains FAIL in the artifact record. Its sole blocking finding (B1: missing specialist security artifacts) was discharged 58 minutes later by the specialist security stage (CONDITIONAL PASS, merged at 7f0e454), but no re-issued verifier verdict or coordinator disposition note records the discharge.
  The machine-readable artifact trail for subtask-8 still reads FAIL even though its only blocker is resolved; downstream consumers of the artifact record cannot see completion without reconstructing the timeline.
- apps/web/next.config.mjs:54 - Subtask-2 accepted warning still unremediated: style-src 'unsafe-inline' carries no in-code justification comment (plan AC4 requires every CSP allowance beyond 'self' to be justified in code).
  AC4 of subtask-2 remains partially unmet on the merged branch; the allowance is correct but undocumented, inviting accidental removal or unreviewed broadening.
- docs/operations/deployment.md:94-98 - Subtask-2 accepted warning still unremediated: the deployment runbook lacks the planned enforcement-point statement that HSTS is proxy-owned and deliberately omitted at the app level (plan Documentation Impact for subtask-2).
  An operator reading only the deployment runbook cannot tell that the absence of app-level HSTS is intentional, risking a redundant or conflicting app-level addition.

NOTE
- apps/api/src/index.ts:67-69 - Subtask-8 security finding M1 (no X-Content-Type-Options: nosniff on API responses) is already resolved on the merged branch: subtask-2's helmet middleware emits nosniff by default. The finding was accurate only for the security worktree's pre-subtask-2 base.
  Confirms cross-subtask integration worked as planned; no action needed, but the security report's M1 should not be carried forward as an open item.
- apps/api/src/pages/pages.service.ts:83-99 - findPublished and findPublishedBySlug use the same literal predicate ({ status: "published" }) rather than a single shared helper as the plan's subtask-6 wording suggested. Predicate equality is operator-pinned by tests on both paths, preserving the pages/nav publication lockstep.
  Minor deviation from plan wording with no behavioral consequence; the test pinning provides the drift protection the shared helper was meant to give.
- apps/web/app/blog/blog-client.ts:33 - Plan AC5 for subtask-3 ('zero references to the trimmed fields anywhere in apps/web') is met in the comment context: remaining authorUserId references are on BlogPostDetail (post author) and a pages-admin type, both legitimate non-comment uses, and the comment-context absence is spec-pinned in blog.spec.ts.
  Records why a literal repo-wide grep still matches the field name so future reviewers do not re-flag it.
- apps/api/src/media/media.service.ts - Subtask-8 security finding M2 stands: media MIME validation is header-only (no magic-byte verification) and SVG must remain excluded from any future allow-list expansion. CONDITIONAL PASS condition; recommended for the deferred-tasks register at the next planning cycle.
  Architectural gap accepted by the specialist security stage as non-blocking, but it should be tracked rather than silently dropped.

Missed functionality or edge cases:
- No missed code functionality: every register item mapped to subtasks 1-10 in the plan's traceability table has a corresponding, verified, merged implementation with executed tests.
- Missed documentation delivery: the plan's Documentation Impact obligations for subtasks 3 (blog.md comment payload + uniform-error contract), 5 (pages.md featuredMediaId rule + relation), 7 (navigation.md internal-URL rule), 8 (media.md sanitizer contract), and 10 (cicd/tests/README.md coverage wording) are written and verified on documenter branches but absent from the coordination branch (BLOCKING finding 1).
- Missed process obligation: specialist security stages for subtasks 2, 3, and 6 (BLOCKING finding 2).
- Navigation.md dead-link residual note removal (subtask-6/7 doc impact) is partially delivered: the merged navigation.md correctly shows bare-/pages as always rendered via RESERVED_PAGE_SLUGS, but the internal-URL validation rule lives only on the unmerged subtask-7 documenter branch.

Follow-up feature requests for planning:
- Coordinator remediation (this cycle, before plan closure): merge the five unmerged documenter branches (cleanup-subtask-{3,5,7,8,10}-documenter-20260607, commits 18cc9d7, 5493bdf, 4d3bce1, acc7388, d0b739f) into `cleanup`, including their documenter_report.md/documenter_result.json artifacts; pages.md requires a content merge so both subtask-5 (featuredMediaId/relation) and subtask-6 (/pages endpoint+route) sections are present; then confirm blog.md's 'trimming them is a deferred task' claim and the public-list BlogCommentDetail row are gone.
- Coordinator remediation (this cycle): run the specialist security stage for subtasks 2, 3, and 6 per the plan's 'Security review required: yes' markings, or record explicit waiver artifacts in each subtask's artifact directory.
- Coordinator remediation (this cycle): record the discharge of subtask-8 verifier finding B1 (re-issue the verifier verdict or add a coordinator disposition note) so the artifact record no longer terminates at FAIL.
- Small follow-up subtask: add the missing style-src 'unsafe-inline' justification comment in apps/web/next.config.mjs and the HSTS enforcement-point statement in docs/operations/deployment.md (subtask-2's two accepted CONDITIONAL PASS warnings).
- Next planning cycle: append media security finding M2 (header-only MIME validation; no magic-byte verification; SVG must remain excluded) to docs/deferred-tasks.md per the specialist security report for subtask-8.

Artifacts written:
- artifacts/deferred-cleanup/reviewer_report.md
- artifacts/deferred-cleanup/reviewer_result.json

Final outcome:
- FAIL
