# Tester Report

Status:
- pass

Task summary:
- MS3 subtask-3 — blog publishing behavior: publishedAt-driven visibility (LessThanOrEqual filter, no background job), scheduled-post UI labels in admin, server-side body sanitization on create/update, ImageUpload wired in admin editor for featured image with media validation, and pin/feature toggle for admin-only ordering control.

Branch name:
- ms3-tester-20260603

Test commit hash:
- 7c14d17

Test files added or modified:
- apps/api/src/blog/blog.service.test.ts
- apps/web/app/blog/blog.spec.ts

Commands run:
- npx --yes pnpm@10.0.0 install
- npx --yes pnpm@10.0.0 test
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 --filter @sfus/web run typecheck

Pass/fail totals:
- passed: 318 (200 API, 118 web)
- failed: 0
- total: 318

Unmet acceptance criteria:
- None

Final test outcomes:
- AC1 PASS: findPublished/findPublishedBySlug filter publishedAt<=now via LessThanOrEqual(now); future-dated posts hidden from public routes; drafts and unpublished posts never public; createComment blocks future-dated posts with ForbiddenException.
- AC2 PASS: publish() sets publishedAt=now and status=published; unpublish() returns post to draft+clears publishedAt; admin UI labels published+future posts as "scheduled" using isScheduled computed from status+publishedAt>now.
- AC3 PASS: create() and update() sanitize body via normalizeMarkdownBody+validateMarkdownBody; script/iframe/event-handler injection rejected with BadRequestException.
- AC4 PASS: ImageUpload wired in admin create/edit editors for featured image; featuredImageId validated against media_references table; featured image rendered on public blog views via /api/media/ URL.
- AC5 PASS: toggleFeatured() flips isFeatured; featured posts ordered first in findPublished() via ORDER BY isFeatured DESC; summary editable and shown in public listing; adminToggleFeatured client helper exported with credentials:include for admin-only access.
- LINT PASS: 0 ESLint warnings (implementer replaced bare img elements with Next.js Image after first tester run flagged the failures).
- TYPECHECK PASS: tsc --noEmit exits clean.

Cleanup status:
- tester_input.json (temp input file) left in artifact directory; safe to leave as documentation of artifact generation inputs.

Artifacts written:
- artifacts/ms3-completion-and-copilot-port/subtask-3/tester_report.md
- artifacts/ms3-completion-and-copilot-port/subtask-3/tester_result.json
- artifacts/ms3-completion-and-copilot-port/subtask-3/documenter_prompt.txt
