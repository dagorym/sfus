Reviewer Report

Feature plan reviewed:
- plans/ms3-completion-and-copilot-port-plan.md — Milestone 3 Completion And ms3-copilot Port Plan (6 subtasks, milestone-level acceptance criteria).
- Governing design source of truth referenced by the plan: star_frontiers_rpg_website_design.md via plans/sfus-implementation-plan.md § Milestone 3.
- Comparison inputs that drove the plan: artifacts/ms3-comparison-v1.md, artifacts/ms3-comparison-v2.md.

Inputs reviewed:
- Coordination base branch ms3-claude at HEAD b692089 (worktree HEAD matches branch HEAD exactly).
- Implementer/Tester/Documenter/Verifier artifacts for all 6 subtasks under artifacts/ms3-completion-and-copilot-port/subtask-1..6/.
- All 6 verifier_result.json verdicts: subtask-1 PASS (0B/0W/2N), subtask-2 PASS (0B/0W/2N), subtask-3 PASS (0B/2W/1N), subtask-4 PASS remediation-pass-2 (0B/0W/2N), subtask-5 PASS (0B/0W/3N), subtask-6 PASS (0B/0W/2N).
- Delivered code: apps/api/src/{blog,pages,navigation,media}/**, database/migrations/**; apps/web/app/{[slug],blog,pages,admin,navigation}/**, components/{image-upload,markdown-renderer,navigation}.tsx.
- Deployment/runtime config: cicd/docker/compose.dev.yml, cicd/docker/compose.prod.yml.
- Documentation surfaces: docs/README.md, docs/website-launch-guide.md, docs/deferred-tasks.md.

Overall feature completeness:
- Substantively complete. All six workstreams are implemented, tested, documented, and verified; every subtask carries a verifier PASS and the aggregate API+web suite is green (406 tests at HEAD). No BLOCKING feature-level defects were found.
- Milestone AC1 (boot + in-container migrations): MET. multer is a declared dependency; the single consolidated MS3 migration 1748736000000-milestone-three-content-foundation.ts is the source of truth (duplicate 1748736000001-navigation-items.ts removed); in-container migration:run was validated in subtask-1/2.
- Milestone AC2 (media): MET. Public GET /api/media/:id streams by server-resolved storageKey (path-traversal-safe, image-only); role-scoped uploads (admin for blog-post/standalone-page, authenticated for blog-comment, 401 otherwise); alt-text captured and rendered; durable named volume sfus_media_uploads mounted at MEDIA_STORAGE_PATH in both dev and prod compose.
- Milestone AC3 (blog publishing): MET. Query-time visibility status=published AND publishedAt<=now (LessThanOrEqual filter); future-dated posts auto-appear with no job; summary, tags, featured image (validated), server-side sanitization, and pin/feature ordering present; drafts/unpublished/future hidden on public list/detail paths.
- Milestone AC4 (comments): MET. Public read of visible comments on published posts; authenticated-member create on eligible published unlocked posts; 1-level threading enforced (deeper nesting rejected); persisted blog-comment-scoped media reference; moderator/admin moderation + thread lock.
- Milestone AC5 (standalone pages): MET. Top-level /<slug> catch-all evaluated last with a reserved-slug denylist mirrored client- and server-side; durable enriched revisions (summary/changeNote/editorUserId/featuredMediaId) with restore-creates-new-revision; featured media; server-side sanitization on create/update/restore; published-only visibility; no block-builder/wiki scope.
- Milestone AC6 (navigation): MET (with one edge-case gap, see WARNING). Top-level + one keyboard-accessible dropdown level; external links with target/rel; publication-aware filtering of children and linked /blog and /pages targets; authenticated endpoint requires a session and excludes admin-only items from non-admins; safe [] fallback; unused import removed.
- Milestone AC7 (documentation accuracy + deferred-scope recording): PARTIALLY MET — two documentation obligations are unmet (see WARNINGs): a stale migration-file reference in docs/README.md and several plan-listed deferred-scope items not recorded in docs/deferred-tasks.md.

Findings

BLOCKING
- None

WARNING
- apps/api/src/navigation/navigation.service.ts:306-331 - Navigation publication-aware filtering only recognizes /blog/<slug> and /pages/<slug> link URLs; a nav item that links to a standalone page via its canonical top-level route (e.g. /about) is treated as a static route and is never publication-filtered.
  Subtask-5 made the top-level /<slug> route the primary public route for standalone pages, and the admin nav UI accepts a free-form url. An admin who links a nav entry to an unpublished page using its top-level slug (/about rather than /pages/about) would expose that destination in the public nav, which conflicts with milestone AC6 (omit entries whose linked blog/page target is not publicly visible) and the N2 design decision. The subtask-6 verifier flagged this top-level bypass as untested and JSDoc-misaligned but did not treat it as blocking; at the feature level it is a real cross-subtask publication-leakage edge case.
- apps/api/src/blog/blog.controller.ts:246-247 - listComments UUID-fallback resolves a post by id checking only status === 'published', not publishedAt <= now, so a future-dated (scheduled) post addressed by UUID returns 200 with an empty comments payload instead of 404.
  This is the WARNING raised in the subtask-3 verifier report and left unremediated through subtask-4. Data exposure is minimal (post body is never returned here and createComment guards prevent any comment existing on a future-dated post), but the public surface is inconsistent with the documented invariant that scheduled posts are hidden, and the subtask-4 verifier confirmed no test exercises this id-fallback path for a future-scheduled post.
- docs/deferred-tasks.md:1-10 - Several deferred-scope items the plan explicitly directs to be recorded here are absent: SEO (OpenGraph/meta/sitemaps/canonical), reports/moderation queue for arbitrary objects, per-user editor-mode preference plus unified media-library picker/drag-and-drop, full WCAG 2.1 AA sweep, true WYSIWYG, and comment rate-limiting/anti-spam.
  Milestone AC7 requires deferred scope to be recorded in docs/deferred-tasks.md, and the plan's Deferred Scope section names these items. Only the pre-existing deferrals (arbitrary attachments, block-builder, nav depth>1, project-scoped authoring, wiki) are present. Per AGENTS.md, docs/deferred-tasks.md is edited only during a planning cycle, so this is a planner follow-up rather than an in-cycle fix, but it is a genuine unmet documentation obligation.
- docs/README.md:429 - The navigation_items schema section still attributes the table to the deleted migration 1748736000001-navigation-items.ts; navigation_items is now created by the consolidated 1748736000000-milestone-three-content-foundation.ts.
  Subtask-1 removed the duplicate migration and consolidated navigation_items into the single MS3 migration; the subtask-6 verifier flagged this as a pre-existing doc inaccuracy not introduced by subtask-6 and left it unfixed. It is doc-vs-reality drift that milestone AC7 forbids and would mislead anyone tracing schema ownership.

NOTE
- apps/api/src/media/media.controller.ts:149 - serveImage pipes fs.createReadStream(media.filePath) with no stream error handler (TOCTOU between the service's existence check and stream open).
  Already flagged by the subtask-2 verifier. If the file disappears between resolution and read, the unhandled stream error could surface as an unclean 500 / dangling response rather than a controlled 404. Low severity and not a leakage vector since the path is server-resolved, but worth hardening for production robustness.
- apps/api/src/blog/blog.service.test.ts:163 - Assertion gaps carried forward from subtask-3/4: findPublished/findPublishedBySlug filter tests assert the status filter but not the LessThanOrEqual(now) publishedAt constraint, and no test covers the listComments id-fallback for a future-scheduled post.
  Implementation behavior is correct, but the tests are weaker than the behavior they cover; removing the publishedAt constraint would not be caught. Tightening these assertions would lock in the scheduling-visibility invariant that is central to the milestone.
- artifacts/ms3-completion-and-copilot-port - Specialist security review obligations from the plan (subtasks 2-6 marked security-review-required) were satisfied through the verifier security-sensitive assessments and security-focused test coverage rather than separate security_report.md artifacts as seen in the auth-follow-up plan.
  The trust-boundary behaviors (untrusted upload + path-safe serving, publish-state leakage, UGC sanitization, moderation authz, reserved-slug/route-collision safety, nav publication leakage, endpoint authz) were each examined and are substantively sound. No dedicated specialist security pass was run for this plan; given the leakage edge cases above (nav top-level link, listComments fallback), a focused security pass on publication-leakage paths would add assurance but is not blocking.

Missed functionality or edge cases:
- Cross-subtask gap (5↔6): nav publication filtering does not cover the top-level /<slug> page link form that subtask-5 established as canonical, so an unpublished page linked by its top-level slug can leak as a visible nav destination.
- Edge case (3↔4): future-scheduled blog post addressed by UUID through GET /api/blog/:postId/comments returns 200 (empty) instead of 404, inconsistent with the hidden-scheduled-post invariant.
- Documentation obligations (milestone AC7): plan-mandated deferred-scope items are not recorded in docs/deferred-tasks.md, and docs/README.md references a deleted migration file for navigation_items.
- Robustness: media serving lacks a read-stream error handler (TOCTOU) — not a leak, but an unclean failure mode.
- No functional milestone capability was found entirely missing; all six workstreams' core behaviors are implemented and verified.

Follow-up feature requests for planning:
- Extend NavigationService linked-target publication filtering to recognize standalone pages linked by their canonical top-level route (e.g. /about), not only /pages/<slug>, by resolving any non-reserved single-segment internal path against the standalone_pages table (published-only) before treating it as a static route; add tests covering an unpublished top-level page link being omitted from public nav.
- Make the listComments UUID-fallback enforce the full public-visibility predicate (status=published AND publishedAt<=now) so a future-scheduled post returns 404 like every other public surface; add a regression test for the id-fallback future-scheduled case.
- During the next planning cycle, record the plan's remaining MS3 deferred-scope items in docs/deferred-tasks.md: SEO (OpenGraph/meta/sitemaps/canonical), reports/moderation queue for arbitrary objects, per-user editor-mode preference plus unified media-library picker/drag-and-drop, full WCAG 2.1 AA sweep, true WYSIWYG, and comment rate-limiting/anti-spam.
- Correct docs/README.md so the navigation_items schema section attributes the table to 1748736000000-milestone-three-content-foundation.ts and drops the reference to the deleted 1748736000001-navigation-items.ts migration.
- Optionally harden media serving with a read-stream error handler that maps a vanished file to a controlled 404, and tighten blog scheduling-visibility test assertions to cover the LessThanOrEqual(now) constraint.

Artifacts written:
- artifacts/ms3-completion-and-copilot-port/final-review/reviewer_report.md
- artifacts/ms3-completion-and-copilot-port/final-review/reviewer_result.json

Final outcome:
- CONDITIONAL PASS
