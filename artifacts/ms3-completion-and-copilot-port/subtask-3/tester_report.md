# Tester Report

Status:
- failure

Task summary:
- MS3 subtask-3 — blog publishing behavior: publishedAt-driven visibility, scheduled-post UI labels, server-side body sanitization on create/update, ImageUpload in admin editor for featured image with media validation, and pin/feature toggle for admin-only ordering control.

Branch name:
- ms3-tester-20260603

Test commit hash:
- 7c14d17

Test files added or modified:
- apps/api/src/blog/blog.service.test.ts
- apps/web/app/blog/blog.spec.ts

Commands run:
- npx --yes pnpm@10.0.0 --dir /home/tstephen/repos/worktrees/ms3-tester-20260603 --filter @sfus/api test
- npx --yes pnpm@10.0.0 --dir /home/tstephen/repos/worktrees/ms3-tester-20260603 --filter @sfus/web test
- npx --yes pnpm@10.0.0 --dir /home/tstephen/repos/worktrees/ms3-tester-20260603 test
- npx --yes pnpm@10.0.0 --dir /home/tstephen/repos/worktrees/ms3-tester-20260603 lint

Pass/fail totals:
- None

Unmet acceptance criteria:
- Lint validation: 4 ESLint warnings for bare <img> elements in web pages introduced by the implementer (apps/web/app/admin/blog/[id]/edit/page.tsx, apps/web/app/admin/blog/new/page.tsx, apps/web/app/blog/[slug]/page.tsx, apps/web/app/blog/page.tsx). Project enforces --max-warnings=0 so lint exits non-zero. Fix: replace bare <img> with Next.js <Image /> from next/image.

Final test outcomes:
- AC1 PASS (functional): findPublished/findPublishedBySlug filter publishedAt<=now; createComment blocks future-dated posts; drafts never public.
- AC2 PASS (functional): publish() sets publishedAt=now; unpublish() returns to draft+clears publishedAt; admin UI labels future-dated published posts as scheduled.
- AC3 PASS (functional): create() and update() sanitize body via normalizeMarkdownBody+validateMarkdownBody; script/iframe/event-handler injection rejected.
- AC4 PASS (functional): ImageUpload wired in admin editor; featuredImageId validated against media_references; featured image rendered on public views.
- AC5 PASS (functional): toggleFeatured() flips isFeatured; featured posts ordered first in findPublished(); summary editable and shown in listings.
- LINT FAIL: 4 bare img elements in implementation files fail @next/next/no-img-element ESLint rule (--max-warnings=0). Implementation defect, not tester-introduced.

Cleanup status:
- None

Artifacts written:
- artifacts/ms3-completion-and-copilot-port/subtask-3/tester_report.md
- artifacts/ms3-completion-and-copilot-port/subtask-3/tester_result.json
