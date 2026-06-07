# Milestone 3 Blog Standalone Pages And Admin Navigation Plan

## Planner Activation
- Requested agent: `planner`
- Repository instruction source: `AGENTS.md` plus `.myteam` role/skill content loaded through `myteam`
- Workflow obligations being followed:
  - Stay in planning mode only and do not write implementation code.
  - Resolve material design decisions before decomposition.
  - Decompose the milestone into ordered, implementation-ready subtasks with dependencies.
  - Define observable acceptance criteria and documentation impact.
  - Include implementer prompts for each subtask.
  - Write the final plan to a unique markdown file under `plans/`.

## Overview
Milestone 3 delivers the first site-wide publishing system on top of the existing Milestone 2 auth and ACL foundation. The milestone introduces blog posts with scheduled publishing, public comments with authenticated member posting, versioned standalone pages, a shared Markdown/WYSIWYG authoring experience, a shared image-upload baseline, and admin-managed navigation with one level of dropdown children.

The milestone ends when the public site exposes real published content through blog and standalone-page routes, authorized users can create and manage that content through authenticated admin surfaces, comments are publicly readable and member-writable with moderator/admin moderation, and the shared navigation is no longer hardcoded.

Confirmed repository context:
- Milestone 2 already established authenticated users, external/local auth, profile/settings routes, and reusable authorization utilities in `apps/api`.
- The current frontend shell in `apps/web` is session-aware but still hardcodes public/authenticated navigation and has no content-domain routes yet.
- The repo already uses Next.js App Router, NestJS, TypeORM, MySQL 5.7.44-compatible schema rules, and the shared `/api` path contract.
- `plans/` is the default plan artifact directory, and `docs/deferred-tasks.md` is the planning-time register for intentionally postponed scope.

Likely implementation surfaces:
- `apps/api/src/blog/**`
- `apps/api/src/pages/**`
- `apps/api/src/navigation/**`
- `apps/api/src/media/**`
- `apps/api/src/database/migrations/**`
- `apps/api/src/authorization/**`
- `apps/web/app/blog/**`
- `apps/web/app/pages/**` or route-equivalent standalone-page public paths
- `apps/web/app/admin/**` and shared authenticated shell/navigation components
- `apps/web/components/**` for editor, media, and navigation rendering updates

## Assumptions And Locked Decisions
Confirmed from the design doc:
- Blog posts support title, body, featured image, tags, scheduled publishing, and comments.
- Standalone pages are admin-managed site content and should be versioned or managed according to the design intent.
- Editors should provide Markdown and WYSIWYG authoring while storing durable content in Markdown.
- Navigation items must support ordering, visibility, and internal or external destinations.
- Uploaded media and rendered content are untrusted-input paths and must be sanitized and authorization-aware.

Locked Milestone 3 decisions:
1. Blog comments are publicly readable.
2. Only authenticated members may create blog comments.
3. Moderators and admins can moderate or remove blog comments.
4. Milestone 3 image handling is limited to shared image uploads for blog posts, standalone pages, and blog comments.
5. Arbitrary file attachments are out of scope for Milestone 3 and remain deferred to later storage/download milestones.
6. Standalone pages must support revision history and version management in Milestone 3.
7. Standalone pages do not include a block-builder UI in Milestone 3.
8. Admin-managed navigation supports top-level items plus one level of dropdown children.
9. Arbitrary-depth navigation trees are out of scope for Milestone 3.
10. Milestone 3 must reuse the existing Milestone 2 auth and ACL foundation rather than redesign authentication or authorization primitives.
11. Site-wide blog post, standalone-page, and navigation create/edit/publish management in Milestone 3 is admin-only.
12. Project-scoped authoring-policy selection such as owner-only, moderator-only, or member-authoring rules is out of scope for Milestone 3 and belongs to the later Projects milestone.
13. Standalone pages in Milestone 3 are managed site pages such as About, Rules, and Contact, not the full wiki/documents system planned for Milestone 5.

Planning assumptions:
- Blog post, standalone-page, and navigation authoring in Milestone 3 is admin-only; ordinary members do not receive site-wide create/edit/publish rights in this milestone.
- Scheduling uses UTC-backed publish timestamps with application-level display formatting, without introducing a separate editorial-calendar subsystem.
- Shared image handling in this milestone uses a constrained local-storage or equivalent repo-supported image pipeline suitable for current deployment, while leaving broader provider abstraction and arbitrary file delivery for later milestones.
- The shared editor requirement is satisfied by one editor surface that offers Markdown and WYSIWYG modes over the same stored Markdown content model; exact editor-library choice remains an implementation detail.
- Standalone pages may share revision concepts with later document work, but they must not introduce wiki hierarchy, general document namespaces, or collaborative wiki workflows in Milestone 3.

## Workstreams
1. Content persistence and authorization foundation for blog posts, standalone pages, navigation items, comments, and media references.
2. Shared editor, content sanitization, and image-upload workflow.
3. Blog publishing lifecycle and public rendering.
4. Blog comments and moderation controls.
5. Versioned standalone page management and public page routing.
6. Admin-managed navigation and shell integration.

## Ordered Implementation Steps
1. Add the Milestone 3 content, media-reference, and authorization persistence foundation.
- Scope:
  - Add reviewed migrations, entities, and module boundaries for blog posts, blog comments, standalone pages, page revisions, navigation items, and any shared media-reference records required by the image baseline.
  - Define reusable content-status, scheduling, slug, and visibility rules compatible with the Milestone 2 authorization model, while enforcing admin-only site-wide management for blog posts, standalone pages, and navigation.
  - Add startup configuration validation for image upload limits, image MIME allowlists, and any storage-path settings needed for the milestone.
- Dependencies: existing Milestone 2 API and database foundation.
- Security review required: yes.
- Acceptance criteria:
  - The schema supports scheduled/published blog content, public comments with authenticated authorship, standalone-page revisions, and one-level navigation hierarchy while remaining MySQL 5.7.44 compatible.
  - Backend module structure separates blog, pages, navigation, and media concerns cleanly enough for later milestones to reuse shared pieces without rewriting core content models.
  - Required media-related environment variables are validated explicitly at startup.
  - Site-wide blog, standalone-page, and navigation management surfaces have an explicit admin-only authorization contract at the persistence and service boundary.
- Documentation Impact:
  - Update architecture and launch docs for the new content modules, schema surfaces, and image-pipeline environment contract.

2. Implement the shared Markdown/WYSIWYG editor, sanitization pipeline, and shared image upload flow.
- Scope:
  - Implement the shared editor behavior used by blog posts, standalone pages, and blog comments, including Markdown and WYSIWYG modes over one stored Markdown representation.
  - Add safe Markdown rendering, HTML sanitization, image embed handling, and alt-text expectations for authored content.
  - Add the image-upload API and frontend flow for content editors and comment authors, limited to allowed image types and milestone-scoped usage.
- Dependencies: Step 1.
- Security review required: yes.
- Acceptance criteria:
  - Authored content is stored as Markdown and rendered through a sanitization path that blocks unsafe HTML/script execution.
  - Authorized users can upload allowed images and embed or reference them from blog posts, standalone pages, and blog comments.
  - Image validation enforces the configured MIME and size rules, and unauthorized users cannot upload or attach images through protected flows.
  - The shared editor contract is reusable across Milestone 3 content types rather than implemented separately per screen.
- Documentation Impact:
  - Document image-upload constraints, sanitized-rendering expectations, and the shared-editor behavior in the architecture and launch docs.

3. Implement the blog publishing lifecycle and public blog routes.
- Scope:
  - Add blog APIs and frontend admin surfaces for creating, editing, previewing, scheduling, publishing, unpublishing, and listing blog posts.
  - Add public blog listing and blog-detail routes that expose only published content to guests while preserving draft/scheduled controls for admins.
  - Support featured image, tags, slug routing, and publish-state handling consistent with the milestone scope.
- Dependencies: Steps 1-2.
- Security review required: no.
- Acceptance criteria:
  - Admin users can manage blog posts end to end, including scheduled publishing and later publication-state changes.
  - Guests can browse and read published blog posts but cannot reach draft or scheduled content through public routes.
  - Blog routes and APIs apply reusable authorization checks instead of bespoke inline role gating.
  - The public site now exposes a meaningful blog surface rather than only placeholder content.
- Documentation Impact:
  - Update route inventory, launch docs, and any architecture notes describing publish-state behavior and blog content ownership.

4. Implement public blog comments with authenticated posting and moderator/admin moderation controls.
- Scope:
  - Add comment APIs and frontend flows for creating comments on published blog posts, with public read access and authenticated member write access.
  - Add moderation controls for moderators and admins to remove, hide, or otherwise moderate comments within the approved Milestone 3 scope.
  - Apply rate, validation, and authorization rules appropriate to authenticated public discussion flows.
- Dependencies: Steps 1-3.
- Security review required: yes.
- Acceptance criteria:
  - Guests can read comments on published blog posts without authentication.
  - Authenticated members can create comments on eligible published posts, including milestone-scoped image usage.
  - Moderators and admins can moderate comments through explicit authorized flows.
  - Comment creation and rendering use the shared sanitization and authorization model and do not expose unpublished parent content.
- Documentation Impact:
  - Document comment access rules, moderation expectations, and any operational safeguards added for public user-generated content.

5. Implement versioned standalone page management and public standalone-page routing.
- Scope:
  - Add standalone-page APIs and admin surfaces for creating, editing, previewing, publishing, unpublishing, and listing managed pages such as About, Rules, and Contact.
  - Add revision history, revision metadata, and rollback or restore behavior consistent with the milestone's version-management commitment.
  - Add public page routing and rendering for published standalone pages using the shared editor and image pipeline, without introducing the later wiki/documents feature set.
- Dependencies: Steps 1-2.
- Security review required: no.
- Acceptance criteria:
  - Admin users can manage standalone pages through authenticated admin screens and publish them to stable public routes.
  - Every standalone-page edit produces durable revision history with enough metadata to inspect and restore prior versions through approved flows.
  - Guests can read only published standalone pages, and unpublished revisions or drafts remain protected.
  - The implementation does not introduce a block-builder UI, wiki hierarchy, or broader documents/wiki behavior beyond the approved Milestone 3 scope.
- Documentation Impact:
  - Update route inventory, content-management architecture notes, and launch docs for standalone-page administration and revision behavior.

6. Implement admin-managed navigation and replace the hardcoded shell navigation.
- Scope:
  - Add admin APIs and UI for creating, ordering, hiding, nesting, editing, and deleting navigation items within the approved one-level hierarchy.
  - Support internal links to implemented site routes and external links with explicit visibility rules by role or audience as allowed by the milestone design.
  - Replace the current hardcoded frontend navigation with rendered data from the managed navigation model, while preserving safe fallbacks for missing or invalid nav state.
- Dependencies: Steps 1, 3, and 5.
- Security review required: no.
- Acceptance criteria:
  - Admin users can manage top-level and single-child-level navigation items end to end.
  - The public and authenticated shell navigation renders from managed data rather than hardcoded arrays.
  - Visibility and ordering rules are enforced consistently in both admin management and public rendering.
  - Navigation cannot reference unpublished internal content in a way that leaks inaccessible routes to unauthorized users.
- Documentation Impact:
  - Update launch and architecture docs for navigation data ownership, admin workflow, and rendering fallback behavior.

## Acceptance Criteria
Milestone 3 is complete when all of the following are true:
- Admin users can create, edit, schedule, publish, and unpublish site-wide blog posts with tags and featured images.
- The public site exposes published blog posts through real listing and detail routes.
- Blog comments are publicly readable, authenticated-member writable, and moderator/admin manageable.
- Shared authoring behavior exists for blog posts, standalone pages, and comments with Markdown/WYSIWYG entry over one stored Markdown format.
- Shared image uploads work for blog posts, standalone pages, and blog comments within approved MIME and size limits.
- Admin users can create, revise, publish, unpublish, and restore site-wide standalone pages, and guests can view them only when published.
- Standalone pages are managed site pages, not the Milestone 5 wiki/documents system.
- Admin-managed navigation supports ordering, visibility rules, internal and external links, and one level of dropdown children.
- The public and authenticated site shell uses managed navigation data rather than hardcoded navigation definitions.
- Project-scoped authoring-policy controls are explicitly deferred to the later Projects milestone.
- Authorization, sanitization, and image-upload behavior are documented well enough for later milestones to reuse without reinterpreting Milestone 3 contracts.

## Documentation Impact
- Update `docs/README.md` to describe the new blog, standalone-page, navigation, media, and shared-editor architecture surfaces.
- Update `docs/website-launch-guide.md` for new content-management routes, image-upload environment variables, operational media constraints, and public-content verification steps.
- Update `docs/deferred-tasks.md` for intentionally postponed Milestone 3 scope, including arbitrary file attachments, block-builder work, and deeper navigation trees.
- Keep project-scoped authoring-policy selection deferred until the Projects milestone, and keep the wiki/documents feature set deferred until Milestone 5.
- Add or update architecture-specific documentation if Milestone 3 implementation introduces a dedicated content-model or editor/media decision record.

## Output Artifact Path
- `plans/milestone-three-blog-standalone-pages-and-admin-navigation-plan.md`

## Dependency Ordering
- Must happen first:
  - Step 1
- Shared infrastructure path:
  - Step 2 depends on Step 1
- Content-system path:
  - Step 3 depends on Steps 1-2
  - Step 4 depends on Steps 1-3
  - Step 5 depends on Steps 1-2
- Navigation path:
  - Step 6 depends on Steps 1, 3, and 5

Parallelization notes:
- After Step 2, Step 3 and Step 5 are plausibly parallelizable because both depend on the same content/editor foundation but operate on different content domains; the safe coordinator default is still to keep them serial unless staffing pressure justifies parallel execution.
- Step 4 should stay after Step 3 because comments depend on the final blog publication and route contracts.
- Step 6 should stay after both blog and standalone-page public-route conventions are real so navigation management can target implemented content safely.

## Risks And Mitigations
1. Shared editor behavior diverges by content type and creates three inconsistent authoring paths.
- Mitigation: require one stored Markdown contract and one reusable editor/media integration surface before feature-specific screens branch.
2. Image uploads and rendered content introduce XSS or unsafe-file exposure.
- Mitigation: constrain uploads to images only, validate MIME and size at the API boundary, sanitize rendered output, and require specialist security review on upload and comment subtasks.
3. Scheduling and publish-state handling leak draft content through public routes or navigation.
- Mitigation: centralize publish-state checks in backend query and rendering paths, and make unpublished-content leakage an explicit acceptance concern for blog, pages, and navigation.
4. Standalone-page revisions drift toward wiki scope and make Milestone 5 harder to separate.
- Mitigation: keep revision history focused on site-managed standalone pages only, without introducing nested wiki hierarchy, attachment breadth, or broader documents behaviors.
5. Managed navigation becomes tightly coupled to hardcoded frontend assumptions.
- Mitigation: replace hardcoded arrays with a rendered nav model backed by validated API data and explicit fallbacks for absent configuration.
6. Role and authorization rules for site-wide content-management surfaces become inconsistent across blog, pages, and navigation.
- Mitigation: implement blog/page/nav authorization through explicit admin-only rules built on reusable Milestone 2 authorization primitives, and defer project-scoped policy variation to the Projects milestone.

## Implementer Prompts

### Subtask 1: Content, media-reference, and authorization foundation
```text
Your role is 'implementer'. Your task is as follows:
Implement the Milestone 3 persistence and module foundation for blog posts, blog comments, standalone pages, page revisions, navigation items, and the shared media-reference contracts required by the image-upload baseline. Reuse the existing Milestone 2 authorization foundation rather than redesigning auth or ACL primitives, enforce admin-only site-wide management for blog posts, standalone pages, and navigation, and add startup validation for the media-related environment settings needed by this milestone.

Allowed files:
- `apps/api/**`
- `apps/api/.env.example`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/deferred-tasks.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- Reviewed migrations and persistence models support scheduled and published blog content, public comments with authenticated authorship, standalone-page revisions, and one-level navigation hierarchy while remaining MySQL 5.7.44 compatible.
- Backend module structure cleanly separates blog, pages, navigation, and shared media concerns.
- Media-related environment variables are validated explicitly at startup.
- The persistence and service layer make site-wide blog, standalone-page, and navigation management admin-only.

Validation guidance:
- Run the relevant API build, lint, typecheck, migration, and test commands.
- Add or update automated tests where schema, config validation, or authorization behavior is directly exercised.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts`.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/milestone-three-blog-standalone-pages-and-admin-navigation/subtask-1/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 2: Shared editor, sanitization, and image upload
```text
Your role is 'implementer'. Your task is as follows:
Implement the shared Milestone 3 authoring workflow used by blog posts, standalone pages, and blog comments. The workflow must provide Markdown and WYSIWYG entry over one stored Markdown representation, safe rendering with sanitization, and shared image uploads limited to approved image types and milestone-scoped usage.

Allowed files:
- `apps/api/**`
- `apps/web/**`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- Authored content is stored as Markdown and rendered through a sanitization path that blocks unsafe HTML or script execution.
- Authorized users can upload allowed images and use them from blog posts, standalone pages, and blog comments.
- Unauthorized users cannot access protected upload flows, and upload validation enforces the configured MIME and size rules.
- The editor/media workflow is reusable across Milestone 3 content types rather than duplicated per screen.

Validation guidance:
- Run the relevant web and API build, lint, typecheck, and test commands.
- Add or update automated tests that cover sanitization, upload validation, and protected upload behavior.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/milestone-three-blog-standalone-pages-and-admin-navigation/subtask-2/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 3: Blog publishing lifecycle and public blog routes
```text
Your role is 'implementer'. Your task is as follows:
Implement the Milestone 3 blog publishing system, including admin-only create/edit/preview/schedule/publish/unpublish workflows, public blog listing and detail routes, tags, featured images, and authorization-aware publish-state handling.

Allowed files:
- `apps/api/**`
- `apps/web/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- Admin users can manage blog posts end to end, including scheduled publishing and later publication-state changes.
- Guests can browse and read only published blog content through public routes.
- Draft and scheduled content remain protected from unauthorized public access.
- Blog APIs and routes use reusable authorization checks instead of bespoke inline gating.

Validation guidance:
- Run the relevant web and API build, lint, typecheck, and test commands.
- Add or update automated tests for publish-state transitions, public-route filtering, and authorized management flows.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/milestone-three-blog-standalone-pages-and-admin-navigation/subtask-3/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 4: Public blog comments and moderation
```text
Your role is 'implementer'. Your task is as follows:
Implement Milestone 3 blog comments so that comments are publicly readable, authenticated members can create comments on eligible published posts, and moderators or admins can moderate comments through explicit authorized flows. Reuse the shared editor, sanitization, image-upload, and authorization foundations already established for the milestone.

Allowed files:
- `apps/api/**`
- `apps/web/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- Guests can read comments on published blog posts without authentication.
- Authenticated members can create comments on eligible published posts, including milestone-scoped image usage.
- Moderators and admins can moderate comments through explicit protected flows.
- Comments cannot be used to expose unpublished parent content or bypass the shared sanitization and authorization model.

Validation guidance:
- Run the relevant web and API build, lint, typecheck, and test commands.
- Add or update automated tests for comment permissions, moderation flows, and unpublished-content protection.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/milestone-three-blog-standalone-pages-and-admin-navigation/subtask-4/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 5: Versioned standalone pages and public page routes
```text
Your role is 'implementer'. Your task is as follows:
Implement Milestone 3 standalone-page management with admin-only create/edit/preview/publish/unpublish flows, durable revision history with restore behavior, and public routing for published pages such as About, Rules, and Contact. Keep the implementation within the approved scope: shared editor plus revisions, but no block-builder UI or schema, and do not introduce the later wiki/documents feature set.

Allowed files:
- `apps/api/**`
- `apps/web/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/deferred-tasks.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- Admin users can manage standalone pages end to end through authenticated admin screens.
- Every standalone-page edit creates durable revision history with enough metadata to inspect and restore prior versions.
- Guests can read only published standalone pages through stable public routes.
- The implementation does not introduce a block-builder commitment, wiki hierarchy, or broader documents/wiki behavior beyond the approved Milestone 3 scope.

Validation guidance:
- Run the relevant web and API build, lint, typecheck, and test commands.
- Add or update automated tests for revision history, publish-state filtering, restore behavior, and authorized management flows.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/milestone-three-blog-standalone-pages-and-admin-navigation/subtask-5/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```

### Subtask 6: Admin-managed navigation and shell integration
```text
Your role is 'implementer'. Your task is as follows:
Implement Milestone 3 admin-managed navigation with top-level items plus one level of dropdown children, internal and external links, visibility rules, and ordering controls. Replace the current hardcoded site navigation with rendered navigation data while preserving safe fallback behavior and preventing unpublished internal content from being surfaced to unauthorized users.

Allowed files:
- `apps/api/**`
- `apps/web/**`
- `docs/README.md`
- `docs/website-launch-guide.md`
- `docs/deferred-tasks.md`
- `docs/architecture/**`

Implementation-outcome acceptance criteria:
- Admin users can manage navigation items end to end, including one-level nesting, ordering, visibility, and link-type behavior.
- The public and authenticated shell navigation renders from managed data rather than hardcoded arrays.
- Visibility and ordering rules are enforced consistently in admin and public rendering paths.
- Navigation cannot leak unpublished or unauthorized internal destinations to guests or unauthorized users.

Validation guidance:
- Run the relevant web and API build, lint, typecheck, and test commands.
- Add or update automated tests for navigation ordering, visibility filtering, and protected internal-link behavior.

Tester guidance:
- Tester-owned follow-up tests will likely live under `apps/api/src/**/*.test.ts` and `apps/web/**/*.spec.ts` or equivalent existing frontend test locations.

Artifact guidance:
- Use repository-root-relative artifacts under `artifacts/milestone-three-blog-standalone-pages-and-admin-navigation/subtask-6/` if workflow artifacts are required.
- Continue past preflight when blockers are absent.
- Do not report success unless all required artifacts exist and all changes are committed.
```
