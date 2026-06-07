# Deferred Tasks

- Milestone 2: Add additional external authentication providers beyond Google and GitHub, including Facebook and other common identity sources, using the same provider-linking foundation.
- Milestone 2: Add username changes after initial selection, including rate limiting, profile URL history or redirects, and audit-safe handling for mentions and identity continuity.
- Milestone 3: Add arbitrary file attachments and broader upload/download support beyond the shared image-only baseline for blog posts, standalone pages, and blog comments.
- Milestone 3: Add standalone-page block-builder capabilities such as hero, image, and CTA blocks beyond the shared editor plus revision-history scope.
- Milestone 3: Add navigation trees deeper than one level of dropdown children if future site growth proves the extra hierarchy is necessary.
- Milestone 3: Add project-scoped authoring-policy controls such as owner-only, moderator-only, or member-authoring selection when the Projects milestone introduces project content ownership and membership management.
- Milestone 3: Keep the full wiki/documents feature set, including nested wiki hierarchy and broader document workflows, deferred to Milestone 5.
- Milestone 3: Add SEO surfaces — OpenGraph/meta tags, sitemaps, and canonical URLs for blog posts and standalone pages (design §12; roadmap Phase 5).
- Milestone 3: Add a reports / moderation queue for arbitrary objects beyond per-comment moderation (design §13; forums-era scope).
- Milestone 3: Add a per-user editor-mode preference (e.g. `user_settings.content_prefs`) plus a unified media-library picker with drag-and-drop, beyond the shared per-field image upload (design §10).
- Milestone 3: Complete a full WCAG 2.1 AA accessibility sweep beyond the keyboard-accessible navigation delivered in Milestone 3 (design §11.1; roadmap Phase 5).
- Milestone 3: Add a true WYSIWYG editing surface; Milestone 3 ships Markdown authoring with live preview only.
- Milestone 3: Add comment rate-limiting / anti-spam controls (design rate-limits to Phase 5 and forum anti-spam to Milestone 4; the current stack has no Redis).
- Milestone 3: Harden blog-post `deriveUniqueSlug` against the concurrent-create TOCTOU (catch the duplicate-key error on save and retry derivation with a suffix) so a losing concurrent create succeeds instead of surfacing a 500. Accepted characteristic per the MS3 final review (2026-06): the DB unique constraint already prevents any corruption and the surface is admin-only.
- Milestone 3: Trim the public blog-comment payload to what the UI needs — it currently exposes `authorUserId`, `moderatedByUserId`, and `moderatedAt` (data-minimization note from the retroactive MS3 security review, 2026-06).
- Milestone 3: Batch or cache the navigation publication-filter lookups if the nav tree grows — the public (and, post-closeout, authenticated) nav paths perform bounded per-item indexed point queries today (performance note from the retroactive MS3 security review, 2026-06).
- Milestone 3: Harden `validateUrl` for internal navigation items to require a leading `/` (defense-in-depth; admin-only input today — note from the retroactive MS3 security review, 2026-06).
- **Fix on next dev cycle (Milestone 4):** Repair the stale runtime-contract assertion in `cicd/tests/run-validations.sh` that expects `DB_HOST=mysql` in `apps/api/.env.example` — the example legitimately ships the hybrid-dev default `DB_HOST=127.0.0.1` (the Compose files override to `mysql` for containers only), so `bash cicd/tests/run-validations.sh` currently fails on `main` at that check. Update the test to assert the hybrid default (and, if desired, the Compose-level `mysql` override) per `docs/operations/launch.md`. Found 2026-06-07 during the documentation restructure.
