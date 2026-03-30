# Star Frontiers Website Implementation Plan

## Source And Planning Goal
- Source design: `star_frontiers_rpg_website_design.md`
- Goal: break the full website design into small, self-contained, deployable milestones.
- Planning rule used here: every milestone must leave the site functional in production, even if later features are still absent.

## Sequencing Principles
- Build the platform skeleton first so later milestones land on a deployable base.
- Introduce content systems in the order that minimizes cross-cutting dependencies.
- Delay high-coupling systems such as search, event feeds, and notifications until the content domains they aggregate already exist.
- Keep each milestone scoped to a user-visible outcome with a clear operational completion state.

## Milestone 1: Platform Skeleton And Public Shell
**Goal**
- Stand up the deployable application foundation with the chosen stack, Docker-based environments, database connectivity, shared layout, basic theming tokens, navigation shell, health checks, and a public landing experience.

**What should exist upon completion**
- A working frontend and API deployed behind the reverse proxy design described in the source document.
- Production and local development environment configuration for the core app containers and backing services.
- A shared design system baseline: typography, color tokens, layout primitives, header/footer, and responsive page shell.
- Public pages for home, sign-in entry, and not-found/error handling.
- Foundational observability and operational wiring: health endpoints, logging baseline, migration path, and environment variable contracts.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 1 of the Star Frontiers RPG website project.

Milestone goal:
Stand up the deployable application foundation with the chosen stack, Docker-based environments, database connectivity, shared layout, navigation shell, basic theming tokens, and a functional public landing experience.

Completion state required:
- A working frontend and API deploy behind the existing reverse proxy model in the design doc.
- Local dev and production-oriented container configuration exist for the core app and backing services.
- Shared UI foundation exists: layout shell, navigation shell, footer, design tokens, responsive behavior, and baseline public pages.
- Health checks, migrations, logging baseline, and environment contracts are defined.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Keep scope limited to foundation only; do not pull auth, blog, forums, or other feature domains into this milestone except where a shell or placeholder is required.
- Break the milestone into small implementation steps with clear dependencies and acceptance criteria.
- Call out key architectural decisions that must be locked before implementation starts.
- Include testing, deployment validation, and rollback considerations.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 2: Identity, Accounts, And Access Control Foundation
**Goal**
- Implement authentication, account creation, usernames, sessions, profile basics, global roles, and the ACL model that later content systems will reuse.

**What should exist upon completion**
- External identity and local email/password authentication flows work end to end.
- First-login username selection, account settings basics, and profile pages exist.
- Session management, email verification, and optional MFA scaffolding are functional.
- Global roles and the core visibility/ownership/project ACL checks are implemented in backend authorization utilities and enforced in the app shell.
- Protected routes and authenticated navigation behavior are live.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 2 of the Star Frontiers RPG website project.

Milestone goal:
Implement authentication, account creation, usernames, sessions, profile basics, global roles, and the ACL foundation used by all later content systems.

Completion state required:
- External auth and local auth both work end to end.
- First-login username selection and account/profile basics exist.
- Session management, email verification, and MFA scaffolding are functional.
- Global role checks and the reusable ACL/visibility model are implemented and tested.
- Protected routes and authenticated navigation behavior are live.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Scope this milestone to identity and authorization foundations only.
- Design the ACL model so later milestones can reuse it across blog, forums, docs, downloads, characters, projects, search, and feed events.
- Break the work into small implementation steps with dependencies, data model changes, API/UI work, testing, and deployment validation.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 3: Blog, Standalone Pages, And Admin Navigation
**Goal**
- Deliver the first full content publishing system for site-wide communication and establish admin-managed navigation and standalone page management.

**What should exist upon completion**
- Admins and authorized members can create, edit, schedule, publish, and comment on blog posts.
- Standalone pages such as About/Rules/Contact can be created and rendered.
- Shared editor behavior exists for Markdown/WYSIWYG content entry with image handling baseline.
- Admin navigation management exists for ordering, visibility, and internal/external links.
- The public site has a real content surface, not just placeholder pages.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 3 of the Star Frontiers RPG website project.

Milestone goal:
Deliver site-wide publishing through blog posts and standalone pages, plus admin-managed navigation.

Completion state required:
- Blog post creation, editing, publishing, scheduling, and comments work.
- Standalone pages exist and are versioned or managed according to the design intent.
- Shared editor behavior exists for Markdown/WYSIWYG entry and image handling baseline.
- Admin navigation management supports ordering, visibility, and internal/external links.
- The public site exposes meaningful published content.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Reuse the auth and ACL foundation from earlier milestones rather than re-planning it.
- Keep the milestone deployable and complete without requiring forums, docs, projects, search, or feeds.
- Break the work into small implementation steps with dependencies, acceptance criteria, tests, and moderation considerations where relevant.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 4: Forums
**Goal**
- Add the community discussion system with categories, boards, topics, posts, moderation controls, and anti-spam protections.

**What should exist upon completion**
- Public and restricted boards can be configured and browsed.
- Members can create topics and replies with the shared rich content workflow.
- Moderators can pin, lock, move, and otherwise manage forum content.
- Mentions, quoting, pagination, and forum navigation are functional.
- Rate limiting and baseline anti-spam protections are active for forum posting.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 4 of the Star Frontiers RPG website project.

Milestone goal:
Implement the forums system with categories, boards, topics, posts, moderation tools, and baseline anti-spam protections.

Completion state required:
- Public and restricted boards can be configured and browsed.
- Members can create topics and replies with the shared editor workflow.
- Moderators can pin, lock, move, and manage forum content.
- Mentions, quoting, and pagination are functional.
- Rate limiting and anti-spam controls are active for posting flows.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Reuse the existing auth, ACL, media, and admin/navigation foundations.
- Keep the milestone self-contained and deployable without projects, docs, downloads, character generator, search, or personalized feeds.
- Break the work into small implementation steps with dependencies, data model changes, moderation flows, testing, and deployment validation.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 5: Documents Wiki
**Goal**
- Implement the site-wide wiki/documentation system with hierarchy, revisions, soft locking, and attachment support.

**What should exist upon completion**
- Users can browse and edit site documents through nested paths and breadcrumbs.
- Every edit produces a revision history with diffs and rollback support.
- Soft locking exists to reduce collisions during editing.
- Document attachments and watcher/notification hooks are ready at the model/API level where needed.
- The site now supports durable community knowledge beyond blog/forum conversations.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 5 of the Star Frontiers RPG website project.

Milestone goal:
Implement the site-wide documents/wiki system with hierarchy, revisions, diffs, rollback support, soft locking, and attachments.

Completion state required:
- Users can browse and edit nested document paths with breadcrumbs.
- Revisions, diffs, and rollback support work end to end.
- Soft locking exists for edit collision reduction.
- Attachment handling exists for document pages.
- The wiki is deployable and functional as a standalone content system.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Reuse the existing editor, auth, ACL, and media foundations.
- Keep the milestone focused on site-wide documents only; do not add project-scoped docs yet except where the architecture must be prepared for later reuse.
- Break the work into small implementation steps with dependencies, testing, operational concerns, and acceptance criteria.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 6: Downloads And Storage Pipeline
**Goal**
- Deliver file releases, upload/download flows, storage abstraction, quota enforcement, and the operational file-handling pipeline.

**What should exist upon completion**
- Site-wide downloads can be created with metadata, multiple files, versions, and download tracking.
- Upload flows use the storage abstraction defined in the design document with a local implementation first.
- File validation, allowlists, quotas, checksums, and virus-scan integration points exist.
- Secure download delivery is functional without forcing the app to proxy large files.
- The site supports practical file sharing for the community.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 6 of the Star Frontiers RPG website project.

Milestone goal:
Deliver the downloads system and file-storage pipeline with metadata, versioned releases, secure delivery, quota enforcement, and a storage abstraction that starts with local storage.

Completion state required:
- Site-wide downloads support metadata, multiple files, versions, and download counts.
- Upload flows use a storage abstraction with a local provider first.
- File validation, allowlists, quotas, checksums, and virus-scan integration points exist.
- Secure delivery works without proxying large files through the application layer.
- The downloads system is production-deployable and operationally understandable.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Keep scope limited to site-wide downloads and shared storage/media infrastructure.
- Prepare for future S3-compatible storage without implementing the full future provider unless the milestone truly requires stubs.
- Break the work into small implementation steps with dependencies, operational considerations, tests, and acceptance criteria.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 7: Projects Core
**Goal**
- Introduce project spaces with lifecycle management, privacy, join policies, membership states, project roles, and a project overview hub.

**What should exist upon completion**
- Members can create projects with title, slug, branding, privacy, and join policy.
- Project membership flows work for open and restricted projects.
- Project-specific roles and access rules are enforced.
- Each project has an overview page and project-aware navigation shell.
- Public and private projects are usable even before project-scoped subfeatures arrive.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 7 of the Star Frontiers RPG website project.

Milestone goal:
Implement the core projects system with creation, branding, privacy, join policies, membership states, project roles, and a project overview hub.

Completion state required:
- Members can create and manage projects with slug, branding, privacy, and join policy.
- Open and restricted membership flows work.
- Project-specific roles and access rules are enforced.
- Each project has an overview page and project-aware navigation shell.
- Public and private projects are fully usable as containers before scoped content modules arrive.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Scope this milestone to project lifecycle and access control only; do not implement project-scoped forums/docs/downloads/blog in full yet.
- Reuse the existing ACL foundation and prepare clean extension points for later scoped content milestones.
- Break the work into small implementation steps with dependencies, testing, acceptance criteria, and deployment validation.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 8: Project-Scoped Content Modules
**Goal**
- Extend the existing content systems into project spaces so each project can host its own overview content, forums, documents, and downloads.

**What should exist upon completion**
- Projects expose scoped content sections that mirror the site-wide modules where the design requires them.
- Project content obeys project role and visibility rules across reads, writes, and navigation.
- Project overview pages surface recent project activity in a coherent hub experience.
- Shared content infrastructure is reused rather than forked into separate implementations.
- Public projects and active members in private projects can use project mini-hubs end to end.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 8 of the Star Frontiers RPG website project.

Milestone goal:
Extend the existing content systems into project-scoped mini-hubs, including project overview content, forums, documents, and downloads.

Completion state required:
- Projects expose scoped content sections that mirror the required site-wide modules.
- Project role and visibility rules are enforced across reads, writes, and navigation.
- Project overview pages surface meaningful recent project activity.
- Shared content infrastructure is reused instead of duplicated.
- Public projects and active members in private projects can use project mini-hubs end to end.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Assume site-wide blog/forums/docs/downloads and core projects already exist.
- Focus the plan on adding project scoping cleanly across those systems with minimal duplication.
- Break the work into small implementation steps with dependencies, testing, migration considerations, and acceptance criteria.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 9: Characters Gallery, Import/Export, And Generator
**Goal**
- Deliver the character subsystem with canonical schema support, gallery browsing, manual creation, import/export, and the first generator module.

**What should exist upon completion**
- Users can create and manage characters with the canonical schema and visibility controls.
- A public/gallery browsing experience exists with filtering and sorting.
- JSON import/export and printable/PDF export flows exist.
- The first deterministic generator module is live with seed support and validation.
- Characters can be used as a meaningful standalone feature independent of search/feed work.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 9 of the Star Frontiers RPG website project.

Milestone goal:
Implement the characters subsystem with canonical schema support, gallery browsing, manual entry, import/export, and the first deterministic generator module.

Completion state required:
- Users can create and manage characters with visibility controls.
- Gallery browsing and filtering work.
- JSON import/export and printable/PDF export exist.
- The first generator module supports seeded generation and validation.
- The subsystem is deployable and useful even before search, feed aggregation, and advanced notifications arrive.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Reuse the existing auth, ACL, media, and project foundations where applicable.
- Keep the milestone focused on characters; do not absorb search/feed scope beyond the events or hooks needed for later integration.
- Break the work into small implementation steps with dependencies, data model/API/UI concerns, tests, and acceptance criteria.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 10: Global Search, Event System, Feed, And Notifications
**Goal**
- Add the cross-system aggregation layer: searchable content, event generation, personalized feed ranking, mentions/follows, and onsite notification delivery.

**What should exist upon completion**
- Access-aware search works across the implemented content domains without leaking unauthorized objects.
- Content creation and updates emit normalized events.
- Users have a functional personalized feed with the core filters defined in the design.
- Mentions, follows, and onsite notification reads are functional.
- The site meaningfully surfaces activity across global and project scopes.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 10 of the Star Frontiers RPG website project.

Milestone goal:
Implement global search, normalized content events, a personalized feed, follows/mentions, and onsite notifications across the already-built content systems.

Completion state required:
- Access-aware search works across implemented content types without permission leaks.
- Content creation and updates emit normalized events.
- Users have a functional personalized feed with the core filters from the design.
- Mentions, follows, and onsite notifications work.
- The aggregation layer spans both site-wide and project-scoped content where applicable.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Assume prior milestones already delivered the source content systems.
- Treat ACL correctness and leak prevention as first-class planning requirements.
- Break the work into small implementation steps with dependencies, indexing strategy, cache/invalidation concerns, testing, and acceptance criteria.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Milestone 11: Moderation, Security Hardening, Accessibility, SEO, And Operations Readiness
**Goal**
- Finish the platform for sustained production use by completing moderation workflows, hardening security, tightening accessibility and SEO, and closing operational readiness gaps.

**What should exist upon completion**
- Moderation queues, reporting flows, auditability, and admin safety tooling are live.
- Security controls from the design are implemented and verified, including proxy-aware session security, CSRF/CSP, rate limits, sanitization, and privacy/compliance flows.
- Accessibility and responsive behavior have been reviewed and remediated to the target standard.
- SEO/social metadata, sitemap behavior, and robots handling are production-ready.
- Backup/restore expectations, monitoring, and deployment runbooks are documented well enough for ongoing operations.

**Planner agent prompt**
```text
You are the planner agent.

Create a detailed implementation plan for Milestone 11 of the Star Frontiers RPG website project.

Milestone goal:
Finish the site for sustained production use by implementing moderation workflows, security hardening, accessibility improvements, SEO/social metadata, and operations readiness work.

Completion state required:
- Reporting, moderation queues, and auditability are live.
- Security controls from the design are implemented and verified.
- Accessibility and responsive behavior meet the project target.
- SEO/social metadata, sitemap behavior, and robots handling are production-ready.
- Backup/restore expectations, monitoring, and deployment/runbook readiness are documented.

Planning constraints:
- Use `star_frontiers_rpg_website_design.md` as the source of truth.
- Assume the feature milestones are already delivered and focus on closing production-readiness gaps.
- Treat security, permission safety, and accessibility as release-blocking concerns.
- Break the work into small implementation steps with dependencies, validation strategy, rollout sequencing, and acceptance criteria.

Output format:
- Overview
- Assumptions and open decisions
- Workstreams
- Ordered implementation steps
- Acceptance criteria
- Risks and mitigations
```

## Notes
- This milestone plan intentionally splits the original phased design into smaller deployable increments.
- Milestones 7 and 8 separate project lifecycle concerns from project-scoped content so the platform can ship usable projects earlier and extend them cleanly later.
- Milestone 10 is intentionally late because search/feed/notifications depend on stable content domains and ACL behavior across the rest of the system.
