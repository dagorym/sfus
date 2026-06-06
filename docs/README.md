# SFUS Milestone 1 Foundation Bootstrap

This repository now includes the Milestone 1 foundation baseline for the monorepo, runtime contracts, and CI/CD scaffolding.

## Workspace Layout

- `apps/web` - frontend workspace baseline
- `apps/api` - backend workspace baseline
- `packages/config` - shared TypeScript, ESLint, and Prettier configuration

## Shared Toolchain Baseline

- TypeScript strict mode is centralized via `packages/config/tsconfig.base.json`.
- ESLint config is centralized in `packages/config/eslint.base.cjs` and consumed by root, `apps/web`, and `apps/api`.
- Prettier config is centralized in `packages/config/prettier.base.cjs` and consumed by root, `apps/web`, and `apps/api`.
- Root and app-level command surfaces run the actual toolchain (`tsc`, `eslint`, `vitest`, and `prettier`) rather than placeholder scripts.

## Root Commands

- `pnpm build` - recursively runs each app workspace build command.
- `pnpm lint` - recursively runs each app workspace ESLint command.
- `pnpm typecheck` - recursively runs each app workspace TypeScript no-emit check.
- `pnpm test` - recursively runs each app workspace `vitest` command.
- `pnpm format` - formats root workspace files plus `apps/*` and `packages/*`.
- `pnpm format:check` - checks formatting for the same workspace surfaces without writing changes.

## App Workspace Commands

- `apps/web` and `apps/api` each expose `build`, `lint`, `typecheck`, `test`, `format`, and `format:check`.
- Each app inherits shared TypeScript, ESLint, and Prettier settings from `packages/config` while executing its own local source-file commands.

## Frontend Shell Baseline

- `apps/web` is a Next.js App Router frontend shell for the Milestone 3 public landing experience, auth-entry routes, authenticated-shell foundation, and Milestone 3 content surfaces (blog, standalone pages, navigation, media).
- The shared shell (`apps/web/app/layout.tsx`) carries Milestone 3 branding: header eyebrow `Milestone 3 Content Platform`, footer second line `Built for the Milestone 3 content launch baseline.`, and Next.js site metadata description `Blog, standalone pages, and site navigation for the Star Frontiers US Milestone 3 content platform.`
- Styling stays within the Milestone 1 architecture baseline: CSS Modules for component/page styles plus shared global CSS custom-property tokens in `apps/web/app/globals.css`.
- Public-facing routes include the branded homepage (`/`) with a `RecentPostsFeed` client component showing up to 3 recent published posts and links to `/blog` and `/about`; branded `404`; branded runtime error surface; returning-user sign-in (`/login`); and provider-first registration (`/register`) with local email/password fallback.
- The authenticated shell includes `/app`, `/profile`, `/settings`, and `/onboarding/username`; `/app`, `/profile`, and `/settings` all preserve destination intent for unauthenticated users with `/login?next=<route>`, and all authenticated routes redirect `user.onboardingRequired` sessions into username completion before normal authenticated use.
- Frontend health endpoints are available at `/health/live` and `/health/ready`.
- Frontend code targets the shared `/api` path contract. `NEXT_PUBLIC_API_BASE_PATH` defaults to `/api`, development rewrites forward to `WEB_API_ORIGIN` (`http://localhost:3001` by default), and non-development containerized routing can target `WEB_API_INTERNAL_URL`.

## API Identity And Authorization Foundation

- Milestone 2 Subtask 1 adds the first persistence-layer identity and authorization foundation to `apps/api` while keeping the current frontend shell public-only.
- Reviewed migration `1714435200000-identity-authorization-foundation.ts` introduces the `users`, `auth_identities`, `password_authenticators`, `auth_sessions`, `email_verifications`, `totp_secrets`, `totp_recovery_codes`, and `authorization_grants` tables with MySQL 5.7-compatible DDL.
- `UsersModule` owns user persistence through `UserEntity` and `UsersService`.
- `AuthModule` imports `UsersModule` and owns auth persistence through `AuthIdentityEntity`, `PasswordAuthenticatorEntity`, `AuthSessionEntity`, `EmailVerificationEntity`, `TotpSecretEntity`, `TotpRecoveryCodeEntity`, plus `AuthController` and `AuthService` for local auth and provider-backed (Google/GitHub) auth flows.
- `AuthorizationModule` owns reusable authorization grant persistence through `AuthorizationGrantEntity` and `AuthorizationService`.
- `AuthorizationService` now provides reusable global-role + ACL authorization decisions (`read`/`write`/`admin`) over generic resources (`resourceType`, `resourceId`, `ownerUserId`, `visibility`, optional `projectId`) so later content milestones can reuse one authz contract.
- `AppModule` now composes `DatabaseModule`, `UsersModule`, `AuthModule`, `AuthorizationModule`, `HealthModule`, `MediaModule`, `BlogModule`, `PagesModule`, and `NavigationModule` so the API can bootstrap the shared identity/authz and Milestone 3 content foundation as one application surface.
- Local password auth stores Argon2id password hashes after appending the required password pepper, and local login stays blocked until a primary-email verification token has been consumed successfully.
- Email verification tokens are generated at registration time, hashed before persistence with `AUTH_SESSION_TOKEN_PEPPER`, checked for expiry at verification time, and consumed once so the same token cannot activate the account twice.
- Session lifecycle is server-managed through the `sfus_session` HTTP-only cookie: login issues a new session, `GET /api/auth/session` resolves and refreshes the active session timestamp, idle or absolute expiry revokes the record, and logout revokes the current session and clears the cookie.
- MFA is implemented with TOTP plus recovery codes: authenticated users start enrollment at `POST /api/auth/mfa/enroll`, confirm at `POST /api/auth/mfa/enroll/verify`, and receive one-time recovery codes only after successful verification. Recovery codes are single-use during challenge or proof flows, and regeneration (`POST /api/auth/mfa/recovery/regenerate`) replaces the previous set after authenticated MFA proof. Disable (`POST /api/auth/mfa/disable`) also requires authenticated MFA proof.
- Password and external-provider login flows now return an MFA challenge whenever a verified TOTP secret exists. Challenge completion at `POST /api/auth/mfa/challenge` issues the session cookie, and challenge tokens are signed and single-use.
- External-provider auth is provider-agnostic via an adapter registry boundary, with deterministic account linking in this order: existing `(provider, subject)` identity match, then existing user by normalized email, then new pending-onboarding user creation.
- First-time external users are marked `onboarding_required` until `POST /api/auth/onboarding/username` sets a valid unique username; `GET /api/auth/session` now returns `user.onboardingRequired` so the web shell can gate authenticated routes.
- Auth API contract for frontend session-awareness:
  - `POST /api/auth/register`
  - `POST /api/auth/verify-email`
  - `POST /api/auth/login`
  - `POST /api/auth/mfa/challenge`
  - `POST /api/auth/mfa/enroll`
  - `POST /api/auth/mfa/enroll/verify`
  - `POST /api/auth/mfa/recovery/regenerate`
  - `POST /api/auth/mfa/disable`
  - `POST /api/auth/logout`
  - `GET /api/auth/session`
  - `GET /api/auth/external/:provider/start`
  - `GET /api/auth/external/:provider/callback`
  - `POST /api/auth/onboarding/username`
  - `GET /api/auth/profile`
  - `PATCH /api/auth/profile`
  - `GET /api/auth/settings`
  - `PATCH /api/auth/settings`
  - authenticated `login` responses return either `{ user, session }` or `{ mfa }` when a challenge is required; `session` remains stable `{ user, session }`
  - `PATCH /api/auth/profile` accepts profile-display-name updates only and returns `{ username, email, displayName }`
  - `PATCH /api/auth/settings` accepts username updates only, enforces uniqueness, and returns `{ username, email, emailVerified, mfaEnabled }`
  - `GET|PATCH /api/auth/profile` and `GET|PATCH /api/auth/settings` now run through the shared authorization layer for account-scoped access, including global-role and ACL grant checks when `?userId=<targetId>` is supplied for representative cross-account authorization coverage.

## Milestone 3 Content Foundation

Milestone 3 Subtask 1 adds the persistence and module foundation for blog posts, standalone pages, navigation items, comments, and shared media references.

### New Modules

- `MediaModule` owns `MediaReferenceEntity` for shared image-reference records used across content types.
- `BlogModule` owns `BlogPostEntity`, `BlogPostTagEntity`, and `BlogCommentEntity`, and exposes `BlogService` with an admin-only management authorization contract.
- `PagesModule` owns `StandalonePageEntity` and `PageRevisionEntity`, and exposes `PagesService` with an admin-only management authorization contract.
- `NavigationModule` owns `NavigationItemEntity`, and exposes `NavigationService` with an admin-only management authorization contract.

### Database Migration

Migration `1748736000000-milestone-three-content-foundation.ts` adds six tables to the MySQL 5.7.44-compatible schema:

- `blog_posts` — blog post records with `status` enum (`draft`/`published`/`unpublished`), `published_at` (nullable, may hold a future time), `summary`, `is_featured`, `comments_locked`, and `slug`.
- `blog_post_tags` — many-to-many tag associations for blog posts.
- `blog_comments` — comment records with `status` enum (`visible`/`hidden`/`removed`), `author_user_id` FK, nullable `parent_id` self-reference (one-level threading), and nullable `media_reference_id` FK.
- `standalone_pages` — managed site pages with `status` enum (`draft`/`published`/`unpublished`) and `slug`.
- `page_revisions` — page revision records with a `revision_number` unique constraint per page, plus `summary`, `change_note`, `editor_user_id`, and `featured_media_id`.
- `navigation_items` — navigation item records with a `parent_id` self-reference and `ON DELETE CASCADE`.

### Admin-Only Management Authorization

`BlogService.assertAdminManagementAccess()`, `PagesService.assertAdminManagementAccess()`, and `NavigationService.assertAdminManagementAccess()` each throw `ForbiddenException` for any caller whose role is below admin, delegating to `AuthorizationService.hasGlobalRole('admin')`. This contract must be called on all create, edit, publish, and delete operations for blog posts, standalone pages, and navigation items.

### Media Environment Contract

`ApplicationEnvironment` now includes a `media` field populated by `loadEnvironment()` at startup. The following variables are required:

- `MEDIA_UPLOAD_MAX_SIZE_BYTES` — maximum accepted upload size in bytes; must be an integer from 1024 to 20971520.
- `MEDIA_ALLOWED_MIME_TYPES` — comma-separated list of accepted MIME types; each entry must be a valid `type/subtype` string.
- `MEDIA_STORAGE_PATH` — local filesystem path for uploaded files; required non-empty string.

All three are validated by `loadEnvironment()` at startup; a missing or invalid value throws immediately before the application finishes bootstrapping.

### Shared Authoring Workflow (Milestone 3 Subtask 2)

Milestone 3 Subtask 2 adds the shared authoring infrastructure — a protected image-upload API, a server-side Markdown sanitizer, and three reusable web components — used across blog posts, standalone pages, and blog comments.

#### MediaModule Upload and Serve API

`MediaModule.register(environment)` is a dynamic NestJS module that exposes:

- `POST /api/media/upload?resourceType=<type>` — uploads an image for Milestone 3 content. Requires an active session (HTTP-only `sfus_session` cookie). Returns a `MediaUploadResult` with `id`, `storageKey`, `url`, `mimeType`, `sizeBytes`, `originalFilename`, and `createdAt`.
  - `resourceType` must be one of `blog-post`, `standalone-page`, or `blog-comment`.
  - **Role-scoped authorization:** uploading for `blog-post` or `standalone-page` requires the `admin` global role; uploading for `blog-comment` requires any authenticated user. Unauthenticated requests receive `401 Unauthorized`; authenticated non-admin requests for admin-only resource types receive `403 Forbidden`.
  - `MediaService.uploadImage()` enforces the configured MIME allow-list and size limit, both read from the `media` environment block; any violation produces `400 Bad Request` with a human-readable message.
  - Files are stored under `MEDIA_STORAGE_PATH` organized by `<resourceType>/<uuid><ext>`. The original filename is sanitized before persistence (directory traversal removed, non-word characters replaced with `_`, capped at 255 characters).
- `GET /api/media/:id` — serves a stored media file by its UUID. This endpoint is **public** (no authentication required). The file path is resolved from the stored `storageKey` (server-generated), never from any user-supplied path, preventing path traversal. Only MIME types in the configured allow-list are served (defence-in-depth). Returns the file with `Content-Type`, `Content-Length`, and `Cache-Control: public, max-age=31536000, immutable` headers. Returns `404` when the record does not exist or the file is absent from disk, and `400` when the stored MIME type is not in the allow-list. The route attaches a stream `error` handler so the TOCTOU race (file vanishes between the DB lookup and the stream open) is handled cleanly: an `ENOENT` at stream time returns `404`; if response headers have already been flushed when the stream error fires, the socket is destroyed to signal an incomplete response rather than attempting to write a new status line; other unexpected I/O errors return `500`.
  - `MediaService.getImageForServing(id)` performs a path-containment guard on the resolved path even though `storageKey` is server-generated, so that any corrupted or injected database value still cannot escape the configured storage root.
- `MediaModule` imports `AuthModule.register(environment)` to resolve sessions on the upload endpoint. The module exports `MediaService` and `TypeOrmModule` for reuse in later content modules.

#### MarkdownSanitizer (server-side)

`apps/api/src/media/markdown-sanitizer.ts` provides two functions used by all Milestone 3 content-write paths:

- `validateMarkdownBody(body: string): SanitizationResult` — inspects the raw Markdown body against a pattern list that blocks `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<button>`, inline event handlers (`on*=`), and dangerous URI schemes (`javascript:`, `vbscript:`, `data:`). Returns `{ safe: true }` or `{ safe: false, reason }`. Callers that persist body content **must** call this before writing and reject the request when `safe === false`.
- `normalizeMarkdownBody(body: string): string` — normalizes line endings to LF and trims surrounding whitespace without altering content. Call after `validateMarkdownBody`.

#### Web Components

Three shared components live in `apps/web/components/` and are reusable across all Milestone 3 authoring surfaces:

- `MarkdownEditor` (`markdown-editor.tsx`) — a fully controlled write/preview toggle. Props: `value`, `onChange`, `placeholder`, `rows`, `label`, `disabled`, `id`. Write mode shows a `<textarea>`; Preview mode renders via `MarkdownRenderer`. Owns no internal body state; callers decide when to persist.
- `MarkdownRenderer` (`markdown-renderer.tsx`) — renders stored Markdown as sanitized HTML in the browser. Strips all raw HTML tags from the Markdown source before conversion (defence-in-depth on top of the server sanitizer), converts a safe Markdown subset (headings, bold, italic, inline code, fenced code blocks, blockquotes, unordered lists, links, images), and rejects `javascript:`, `vbscript:`, and `data:` URI schemes in link and image attributes. Uses `dangerouslySetInnerHTML` with a purpose-built converter; no external Markdown library is required.
- `ImageUpload` (`image-upload.tsx`) — a shared image-upload widget. Props: `resourceType` (`"blog-post" | "standalone-page" | "blog-comment"`), `onUpload`, `onError`, `apiBasePath`, `disabled`, `label`. Posts `multipart/form-data` to `POST /api/media/upload?resourceType=<type>` with `credentials: "include"`. Handles `401` by surfacing an authentication-required message; delegates MIME and size enforcement to the server. Calls `onUpload(result)` on success so callers can insert the returned URL and alt text into the Markdown body as `![altText](url)`.
  - `ImageUploadResult` includes an `altText` field (the value from the controlled alt-text input at upload time) so callers receive both the URL and the accessibility description in a single callback.
  - Each `ImageUpload` instance uses React `useId()` to generate stable, unique DOM ids for both the file input (`image-upload-input-<id>`) and the alt-text input (`image-upload-alt-<id>`), preventing id collisions when multiple instances appear on the same page.

#### Security Contract Summary

- Server-side MIME type and file-size validation in `MediaService` is authoritative. The `ImageUpload` component performs an early client-side `image/*` check only as a UX aid.
- Upload authorization is role-scoped: `blog-post` and `standalone-page` uploads require the `admin` global role; `blog-comment` uploads require any authenticated user. Unauthenticated requests are rejected with `401`; non-admin requests for admin-only resource types are rejected with `403`. Authorization relies entirely on the `sfus_session` cookie resolved by `AuthService.resolveSession()`; the upload endpoint has no separate capability token.
- `GET /api/media/:id` is intentionally public for read access. Write-time authorization (above) controls what is stored; the serve endpoint does not re-authenticate the reader.
- All Markdown body content stored through Milestone 3 write paths must be validated through `validateMarkdownBody` before persistence; content that fails validation must be rejected with a `400` response.
- `MarkdownRenderer` applies a client-side HTML-strip pass before rendering so that any raw HTML that escaped the server sanitizer becomes a no-op in the browser.

### Blog Publishing Lifecycle (Milestone 3 Subtask 3)

Milestone 3 Subtask 3 adds the full blog publishing lifecycle: a `BlogController` with separated public and admin route surfaces, a complete `BlogService` with status-transition methods, server-side body sanitization, featured image wiring, and pin/feature ordering. The corresponding admin and public web pages are also included.

#### BlogModule API Routes

`BlogController` exposes two distinct access surfaces under `/api/blog`:

**Public routes — no authentication required, published content only:**

- `GET /api/blog` — returns all published posts whose `publishedAt` is at or before the current time as `{ posts: BlogPostSummary[] }`, ordered by `isFeatured DESC, publishedAt DESC`. Future-dated published posts and draft posts are never included; no background job is required for scheduled visibility — the `LessThanOrEqual(now)` filter is evaluated at query time.
- `GET /api/blog/:slug` — returns a single published post by slug as `{ post: BlogPostDetail }`. Returns `404` when the post does not exist, is not published, or its `publishedAt` is in the future, so draft, unpublished, and future-scheduled content is never exposed through this route.

**Admin management routes — require an active `sfus_session` cookie and the global `admin` role:**

- `GET /api/blog/admin/posts` — lists all posts regardless of status as `{ posts: BlogPostDetail[] }`.
- `GET /api/blog/admin/posts/:id` — fetches a single post by UUID.
- `POST /api/blog/admin/posts` — creates a new post in `draft` status. Body: `{ title, slug?, body, summary?, featuredImageId?, isFeatured?, tags? }`. `slug` is optional; when omitted or blank the server derives a URL-safe slug from the title (lowercase, non-alphanumeric runs collapsed to hyphens) and appends a numeric suffix (`-2`, `-3`, …) if the base slug is already taken. When `slug` is supplied it must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` or the request is rejected with `400`. The `body` is sanitized with `normalizeMarkdownBody` + `validateMarkdownBody` before persistence; unsafe bodies are rejected with `400`. `featuredImageId` is validated against the `media_references` table; an unrecognized UUID is rejected with `400`.
- `PATCH /api/blog/admin/posts/:id` — updates post fields. All fields are optional; only the supplied fields are changed. Body sanitization and `featuredImageId` validation apply when those fields are present.
- `POST /api/blog/admin/posts/:id/publish` — transitions a post to `published` status and records the current UTC timestamp in `publishedAt`. The post becomes immediately visible on public routes because `publishedAt <= now`.
- `POST /api/blog/admin/posts/:id/publish-at` — schedules a post for future publication. Body: `{ publishedAt: string }` (ISO 8601 datetime). Sets `status = "published"` and `publishedAt` to the supplied datetime. The post remains hidden from public routes until `publishedAt <= now`; no background job is required.
- `POST /api/blog/admin/posts/:id/unpublish` — returns the post to `draft` status and clears `publishedAt`. The post is immediately hidden from all public routes.
- `POST /api/blog/admin/posts/:id/toggle-featured` — toggles the `isFeatured` (pin) state of the post. Featured posts surface first in the public listing (`isFeatured DESC`). Only admins may call this endpoint.
- `DELETE /api/blog/admin/posts/:id` — permanently removes the post.

All admin routes return `401` when no session is present and `403` when the session's global role is not `admin`. Authorization is enforced by `BlogService.assertAdminManagementAccess(session.user.globalRole)` called at the top of every admin handler.

#### Authorization Model

`BlogService.assertAdminManagementAccess(actorGlobalRole: string)` is the single reusable authorization gate for all blog management operations. It delegates to `AuthorizationService.hasGlobalRole(actorGlobalRole, "admin")` and throws `ForbiddenException` for any role below admin. All admin `BlogController` handlers call this method before performing any data operation; no admin action is reachable without it. This pattern avoids inline role-checks scattered across handlers.

#### Post Status Lifecycle

```
draft → published (publish / publish-at)
published → draft (unpublish — also clears publishedAt)
draft → draft (publish-at with future date sets status=published + future publishedAt)
```

`unpublish` returns the post to `draft` status and sets `publishedAt` to `null`; there is no separate `"unpublished"` status in the persistence layer. Public routes filter on both `status = "published"` and `publishedAt <= now`, so a future-dated published post is effectively "scheduled" — it is stored as published but hidden until its time arrives. The admin UI labels such posts as scheduled with a "goes live at" timestamp. Drafts and posts with `publishedAt` in the future are never visible through public routes.

Comment creation is also gated on `publishedAt <= now`; attempting to comment on a future-scheduled published post returns `403`.

#### Response Shapes

`BlogPostSummary` (public list and admin list): `id`, `title`, `slug`, `summary`, `status`, `isFeatured`, `publishedAt`, `featuredImageId`, `tags`, `createdAt`.

`BlogPostDetail` (admin or single-post views): all summary fields plus `body`, `authorUserId`, `commentsLocked`, and `updatedAt`.

#### Body Sanitization

All blog post bodies are sanitized server-side on create and update using the shared Markdown sanitizer (`apps/api/src/media/markdown-sanitizer.ts`):

1. `normalizeMarkdownBody(body)` — normalizes line endings to LF and trims whitespace.
2. `validateMarkdownBody(normalized)` — blocks unsafe HTML and dangerous URI schemes. Returns `{ safe: false, reason }` on violation.

A body that fails validation is rejected with `400 Bad Request` before persistence. This applies to both `POST /api/blog/admin/posts` (create) and `PATCH /api/blog/admin/posts/:id` (update).

#### Featured Image Validation

When `featuredImageId` is supplied on create or update, `BlogService` queries the `media_references` table and rejects any UUID that does not correspond to an existing record with `400 Bad Request`. This ensures the blog post entity always references a valid uploaded media file.

#### Web Routes — Public Blog

- `/blog` — public blog index (`apps/web/app/blog/page.tsx`). No session required. Lists all published posts fetched from `GET /api/blog`. Featured/pinned posts appear first. Each post links to `/blog/<slug>`.
- `/blog/:slug` — single blog post view (`apps/web/app/blog/[slug]/page.tsx`). No session required. Fetches `GET /api/blog/<slug>` and renders the post body via `MarkdownRenderer`. Displays a "Post not found" message when the API returns `null` (post missing, not published, or scheduled for the future).

#### Web Routes — Admin Blog Management

All admin blog pages in `apps/web/app/admin/blog/` call `resolveProtectedSession()` followed by `hasGlobalRole(session.user, "admin")` on mount and redirect unauthenticated users to `/login?next=<current-route>`. A non-admin authenticated session shows an "Admin access required" error in place of the management UI.

- `/admin/blog` — admin blog list (`apps/web/app/admin/blog/page.tsx`). Shows all posts (all statuses) with inline Publish / Unpublish / Delete actions and a "New post" link to `/admin/blog/new`. Future-dated published posts are labeled as scheduled with their go-live timestamp.
- `/admin/blog/new` — create a new draft post (`apps/web/app/admin/blog/new/page.tsx`). Form fields: Title, Slug (optional — leave blank for auto-generation from the title), Summary, Tags (comma-separated), Featured Image (via `ImageUpload`), Body (via `MarkdownEditor`). On submit, calls `adminCreatePost()` and redirects to the edit page for the newly created post. API errors are surfaced verbatim from the server response rather than replaced by a generic fallback.
- `/admin/blog/:id/edit` — edit an existing post (`apps/web/app/admin/blog/[id]/edit/page.tsx`). Shows the current status and publish controls at the top, followed by the content editor form. Controls visible by status: draft/scheduled posts show "Publish now" and "Schedule" options; published posts show "Unpublish"; all posts show a "Pin/Unpin" toggle. Saving the content form calls `adminUpdatePost()`; lifecycle transitions call the corresponding `adminPublishPost`, `adminUnpublishPost`, `adminPublishAt`, or `adminToggleFeatured` helpers from `blog-client.ts`. The featured image field uses `ImageUpload` (`resourceType="blog-post"`).

#### blog-client.ts

`apps/web/app/blog/blog-client.ts` is the typed API client for all blog API calls. Public helpers (`listPublishedPosts`, `getPublishedPost`) fetch without credentials. Admin helpers send `credentials: "include"` so the session cookie is forwarded:

- `adminListAllPosts`, `adminGetPost`, `adminCreatePost`, `adminUpdatePost`, `adminPublishPost`, `adminUnpublishPost`, `adminDeletePost` — standard CRUD and lifecycle operations.
- `adminPublishAt(id, publishedAt)` — calls `POST /api/blog/admin/posts/:id/publish-at` with `{ publishedAt }` (ISO 8601 string) to schedule future publication.
- `adminToggleFeatured(id)` — calls `POST /api/blog/admin/posts/:id/toggle-featured` to toggle the pin/featured state.

All admin helpers (and the comment helpers `listComments`, `moderationListComments`, `moderateCommentStatus`, `deleteComment`, `adminLockComments`, `adminUnlockComments`) surface the real server error by reading `payload?.error?.message` first, then falling back to `payload?.message`, then to a generic fallback string. This matches the `JsonExceptionFilter` envelope shape `{ error: { code, message, statusCode }, request: {...} }` used by all API error responses. When no JSON body is available (network failure, non-JSON response), the generic fallback is used.

### Blog Comments (Milestone 3 Subtask 4)

Milestone 3 Subtask 4 adds blog comments: publicly readable, authenticated-member writable, and moderator/admin moderated.

#### Comment API Routes

**Public route — no authentication required, visible comments only:**

- `GET /api/blog/:postId/comments` — returns all top-level comments with `status = "visible"` for a published post as `{ comments: BlogCommentDetail[], commentsLocked: boolean }`. Each top-level comment includes a `replies` array of its visible replies (1-level deep). The `:postId` parameter is resolved as a slug first (via `findPublishedBySlug`) and then as a UUID (via `findPublishedById`); both lookup paths enforce the full public-visibility predicate — `status = "published"` AND `publishedAt <= now`. Returns `404` when the post does not exist, is not published, or its `publishedAt` is in the future, so draft, unpublished, and future-scheduled content is never exposed through this route. This is the same scheduled-post visibility invariant enforced by `GET /api/blog` and `GET /api/blog/:slug`.

**Member route — requires an active `sfus_session` cookie (any authenticated role):**

- `POST /api/blog/:postId/comments` — creates a comment on a published post. Body: `{ body: string, imageId?: string | null, parentId?: string | null }`. The `body` field is run through `normalizeMarkdownBody` then `validateMarkdownBody` before persistence; a comment whose body fails sanitization is rejected with `400`. If `imageId` is supplied, the referenced media record must exist and have `resourceType = "blog-comment"` (scope enforcement); mismatched scope returns `400`. If `parentId` is supplied, the parent must exist, belong to the same post, and itself have no parent (max 1-level threading enforced); deeper nesting is rejected with `400`. Returns `{ comment: BlogCommentDetail }` on success. Returns `401` when no session is present, `403` when the post is not published or its `commentsLocked = true`, and `404` when the post does not exist.

**Moderation/admin routes — require an active `sfus_session` cookie and the `moderator` or `admin` global role:**

- `GET /api/blog/moderation/comments/:postId` — lists all comments for a post regardless of status as `{ comments: BlogCommentDetail[] }`. Returns `403` for non-moderator/admin callers.
- `PATCH /api/blog/moderation/comments/:commentId/status` — updates a comment's status. Body: `{ status: "visible" | "hidden" | "removed" }`. Records `moderatedByUserId` and `moderatedAt` on every status change. Returns `{ comment: BlogCommentDetail }`.
- `DELETE /api/blog/moderation/comments/:commentId` — permanently deletes a comment. Returns `{ deleted: true }`.
- `POST /api/blog/admin/posts/:id/lock-comments` — locks the comment thread on a post; prevents all new comment creation. Requires `moderator` or `admin` role. Returns `{ post: BlogPostDetail }`.
- `POST /api/blog/admin/posts/:id/unlock-comments` — unlocks the comment thread; re-enables new comments. Requires `moderator` or `admin` role. Returns `{ post: BlogPostDetail }`.

All moderation routes return `401` for missing sessions and `403` for sessions whose global role is below `moderator`.

#### Comment Authorization Model

`BlogService.assertModerationAccess(actorGlobalRole: string)` is the single authorization gate for all moderation operations. It throws `ForbiddenException` for any role that is neither `moderator` nor `admin`. All moderation and lock/unlock `BlogController` handlers call this method before performing any data operation.

Comment creation does not require a minimum role beyond an active session, but the parent post must be in `published` status with `publishedAt <= now` and `commentsLocked = false`; attempting to comment on a draft, unpublished, future-scheduled, or locked post returns `403`.

#### Comment Sanitization

All comment bodies pass through the shared Markdown sanitizer (`apps/api/src/media/markdown-sanitizer.ts`) before persistence:

1. `normalizeMarkdownBody(input)` — normalizes line endings to LF and trims whitespace.
2. `validateMarkdownBody(normalized)` — blocks `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<button>`, inline event handlers (`on*=`), and `javascript:` / `vbscript:` / `data:` URI schemes. Returns `{ safe: false, reason }` on violation.

A comment body that fails either step is rejected with `400 Bad Request` before the record is written.

#### Comment Response Shape

`BlogCommentDetail`: `id`, `postId`, `parentId` (nullable; set when the comment is a threaded reply), `authorUserId`, `body`, `status` (`"visible" | "hidden" | "removed"`), `mediaReferenceId` (nullable; references an attached image), `moderatedByUserId`, `moderatedAt`, `createdAt`, `updatedAt`.

#### Web — Public Comment Display and Member Submission

`apps/web/app/blog/[slug]/page.tsx` now renders a comments section below each published blog post:

- The comments list is fetched from `GET /api/blog/:id/comments` immediately after the post loads. A comment-load failure is silently ignored so the post remains readable. The response now includes `commentsLocked` to drive locked-state UI.
- When `commentsLocked` is `true`, a locked-thread notice is displayed and the comment form and reply buttons are hidden.
- Top-level comments render their visible replies in a nested indented list (1-level deep). Reply buttons appear on top-level comments for authenticated members on unlocked threads.
- Authenticated members on unlocked threads see a comment form with a `MarkdownEditor` for the body and the shared `ImageUpload` component (`resourceType="blog-comment"`) to attach an optional image. The submitted image URL is inserted into the Markdown body before the form posts.
- Unauthenticated visitors see a "Sign in to leave a comment" link that preserves the current URL as the `next` parameter.
- Comment submission posts to `POST /api/blog/:id/comments` with the session cookie. The new comment is appended to the local list on success without reloading.

#### blog-client.ts — Comment Helpers

`blog-client.ts` now exports additional typed helpers:

- `listComments(postId)` — public, no credentials. Fetches `GET /api/blog/:postId/comments`. Returns `{ comments, commentsLocked }`.
- `createComment(postId, body, imageId?, parentId?)` — member, sends `credentials: "include"`. Posts to `POST /api/blog/:postId/comments`.
- `moderationListComments(postId)` — moderator/admin, sends `credentials: "include"`. Fetches `GET /api/blog/moderation/comments/:postId`.
- `moderateCommentStatus(commentId, status)` — moderator/admin, sends `credentials: "include"`. Patches `PATCH /api/blog/moderation/comments/:commentId/status`.
- `deleteComment(commentId)` — moderator/admin, sends `credentials: "include"`. Deletes `DELETE /api/blog/moderation/comments/:commentId`.
- `adminLockComments(postId)` — moderator/admin, sends `credentials: "include"`. Posts to `POST /api/blog/admin/posts/:postId/lock-comments`.
- `adminUnlockComments(postId)` — moderator/admin, sends `credentials: "include"`. Posts to `POST /api/blog/admin/posts/:postId/unlock-comments`.

### Standalone Pages (Milestone 3 Subtask 5)

Milestone 3 Subtask 5 adds versioned standalone page management with full admin CRUD, revision history, restore capability, server-side body sanitization, featured media, enriched revision metadata, and public routing for published pages at both `/pages/:slug` and top-level `/:slug` paths.

#### PagesModule API Routes

`PagesController` exposes two distinct access surfaces under `/api/pages`:

**Public route — no authentication required, published content only:**

- `GET /api/pages/:slug` — returns a single published page as `{ page: PageDetail }`. Returns `404` when the page does not exist or is not published, so draft and unpublished content is never exposed through this route.

**Admin management routes — require an active `sfus_session` cookie and the global `admin` role:**

- `GET /api/pages/admin/pages` — lists all pages regardless of status as `{ pages: PageDetail[] }`.
- `GET /api/pages/admin/pages/:id` — fetches a single page by UUID.
- `POST /api/pages/admin/pages` — creates a new page in `draft` status. Body: `{ title, slug, body, summary?, changeNote?, featuredMediaId? }`. The `body` is validated and normalized with the shared Markdown sanitizer before persistence; unsafe bodies are rejected with `400`. A `summary` and `changeNote` are recorded on revision 1 when supplied. `featuredMediaId` links an uploaded media reference to the initial revision.
- `PATCH /api/pages/admin/pages/:id` — updates page fields and creates a new revision. All fields optional; only supplied fields change. Body sanitization applies when `body` is present; when `body` is omitted the existing revision body is preserved without re-sanitization. `summary`, `changeNote`, and `featuredMediaId` on the update input are recorded on the new revision.
- `POST /api/pages/admin/pages/:id/publish` — transitions a page to `published` status and records the current UTC timestamp in `publishedAt`.
- `POST /api/pages/admin/pages/:id/unpublish` — transitions a page to `unpublished` status.
- `GET /api/pages/admin/pages/:id/revisions` — lists all revisions for a page ordered by revision number ascending as `{ revisions: RevisionDetail[] }`.
- `POST /api/pages/admin/pages/:id/restore/:revisionId` — restores a page to the content of a prior revision by creating a new revision that copies the source revision's title, body, summary, and featuredMediaId, sets `changeNote` to `"Restored from revision <N>"`, and records `editorUserId`. The original revision is preserved in the audit trail; `restoreRevision` does not overwrite existing records.

All admin routes return `401` when no session is present and `403` when the session's global role is not `admin`. Authorization is enforced by `PagesService.assertAdminManagementAccess(session.user.globalRole)` called at the top of every admin handler.

#### Authorization Model

`PagesService.assertAdminManagementAccess(actorGlobalRole: string)` is the single authorization gate for all standalone page management operations. It delegates to `AuthorizationService.hasGlobalRole(actorGlobalRole, "admin")` and throws `ForbiddenException` for any role below admin. All admin `PagesController` handlers call this method before performing any data operation.

#### Revision History Contract

- Every `create` call records revision 1 with the initial title, body, summary, changeNote, and featuredMediaId.
- Every `update` call appends a new revision; the revision number is monotonically incremented from the current highest revision on that page. `currentRevisionId` is updated to the new revision after each save. The `editorUserId` field on the new revision is set to the acting user's id.
- Every `restore` call appends a new revision copying the source revision's title, body, summary, and featuredMediaId, sets `changeNote` to `"Restored from revision <N>"`, sets `editorUserId` to the acting user's id, and updates `currentRevisionId` to the new revision.
- Revision history is an admin-only surface; guests cannot access the revisions endpoint.

#### Body Sanitization

All standalone page bodies are sanitized server-side on create and update using the shared Markdown sanitizer (`apps/api/src/media/markdown-sanitizer.ts`):

1. `validateMarkdownBody(body)` — blocks `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<button>`, inline event handlers (`on*=`), and `javascript:` / `vbscript:` / `data:` URI schemes. Returns `{ safe: false, reason }` on violation.
2. `normalizeMarkdownBody(body)` — normalizes line endings to LF and trims whitespace.

A body that fails validation is rejected with `400 Bad Request` before persistence. When `body` is not supplied on an update, the body is read from the current revision by direct id lookup (`findRevisionById`) rather than scanning the revision list, and the already-stored body passes through `normalizeMarkdownBody` only (no re-validation needed).

#### Page Status Lifecycle

```
draft → published (publish)
published → unpublished (unpublish)
unpublished → published (publish)
```

The public `GET /api/pages/:slug` route filters exclusively on `status = "published"` regardless of how the record was last modified. Draft and unpublished pages are never exposed through the public route.

#### Slug Validation and Reserved Slugs

Slugs must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` (lowercase alphanumeric words separated by hyphens). Invalid slugs are rejected with `400 Bad Request` on both create and update.

In addition, ten slugs are reserved at the service layer via `RESERVED_PAGE_SLUGS` (exported from `pages.service.ts`) and are always rejected with `400 Bad Request` regardless of format validity: `admin`, `api`, `app`, `blog`, `login`, `register`, `onboarding`, `profile`, `settings`, `health`. These slugs collide with existing Next.js app routes or protected API/admin surfaces and must never be claimed by a standalone page. The client-side catch-all route (`apps/web/app/[slug]/page.tsx`) mirrors this list as a defence-in-depth guard and redirects reserved slugs to a not-found state without querying the API.

#### Response Shapes

`PageDetail` (all views): `id`, `title`, `slug`, `body`, `status`, `publishedAt`, `currentRevisionId`, `createdByUserId`, `createdAt`, `updatedAt`, `summary` (nullable; from the current revision), `featuredMediaId` (nullable; from the current revision).

`RevisionDetail` (revisions list): `id`, `pageId`, `authorUserId`, `editorUserId` (nullable; set to the acting user's id on update and restore), `title`, `body`, `summary` (nullable), `changeNote` (nullable; free-text note describing the change; auto-set to `"Restored from revision <N>"` on restore), `featuredMediaId` (nullable), `revisionNumber`, `createdAt`.

#### Web Routes — Public Standalone Pages

Published standalone pages are reachable through two complementary routes:

- `/:slug` — top-level catch-all route (`apps/web/app/[slug]/page.tsx`). No session required. Because the route is a Next.js dynamic segment `[slug]`, it is evaluated after all static segments in the app directory and never shadows existing routes (`/`, `/blog`, `/login`, `/register`, etc.). Reserved slugs (`RESERVED_SLUGS`, mirroring the API-side list) are rejected at routing time with a not-found state rather than querying the API. Fetches `GET /api/pages/:slug` for the given slug; renders the page title, optional featured image (via `GET /api/media/:featuredMediaId`), and body via `MarkdownRenderer`. Displays a "not published" message when the API returns `null`.
- `/pages/:slug` — secondary public standalone page view (`apps/web/app/pages/[slug]/page.tsx`). No session required. Fetches `GET /api/pages/:slug` and renders via `MarkdownRenderer`. Displays a "not published" message when the API returns `null`. Never exposes the edit UI.

#### Web Routes — Admin Standalone Page Management

All admin pages in `apps/web/app/admin/pages/` call `resolveProtectedSession()` followed by `hasGlobalRole(session.user, "admin")` on mount and redirect unauthenticated users to `/login?next=<current-route>`. A non-admin authenticated session shows an "Admin access required" error in place of the management UI.

- `/admin/pages` — admin pages list (`apps/web/app/admin/pages/page.tsx`). Shows all pages (all statuses) with inline Publish / Unpublish actions and a link to create a new page.
- `/admin/pages/new` — create a new draft page (`apps/web/app/admin/pages/new/page.tsx`). Form fields: Title, Slug, Summary (optional), Featured Image (via `ImageUpload`, `resourceType="standalone-page"`), Body (via `MarkdownEditor`). On submit, calls `adminCreatePage()` with `summary` and `featuredMediaId` and redirects to the edit page for the newly created page.
- `/admin/pages/:id/edit` — edit an existing page (`apps/web/app/admin/pages/[id]/edit/page.tsx`). Shows current status and publish/unpublish controls, the content editor form (Title, Slug, Summary, Featured Image, Body, Change Note), and a Revision History panel listing all prior revisions with Preview and Restore actions. Loads the existing `summary` and `featuredMediaId` from the current page detail on mount and repopulates them after each save. The Change Note field is cleared after each successful save. Saving calls `adminUpdatePage()` with `summary`, `changeNote`, and `featuredMediaId`; lifecycle transitions call `adminPublishPage` or `adminUnpublishPage`; restore calls `adminRestoreRevision`.

#### pages-client.ts

`apps/web/app/pages/pages-client.ts` is the typed API client for all standalone pages calls. The `PageDetail` interface includes `summary` and `featuredMediaId`. The `RevisionDetail` interface includes `editorUserId`, `summary`, `changeNote`, and `featuredMediaId`. The `CreatePageInput` and `UpdatePageInput` interfaces accept optional `summary`, `changeNote`, and `featuredMediaId` fields. The public helper (`getPublishedPage`) fetches without credentials. Admin helpers (`adminListAllPages`, `adminGetPage`, `adminCreatePage`, `adminUpdatePage`, `adminPublishPage`, `adminUnpublishPage`, `adminListRevisions`, `adminRestoreRevision`) send `credentials: "include"` so the session cookie is forwarded. All admin helpers surface the real server error by reading `payload?.error?.message` first, then falling back to `payload?.message`, then to a generic fallback string, matching the `JsonExceptionFilter` envelope shape used by all API error responses.

#### Scope Boundaries

Standalone pages in Milestone 3 are managed site pages (About, Rules, Contact, and similar). They do not introduce a block-builder UI, wiki hierarchy, document namespaces, or collaborative wiki workflows. Those features are deferred to Milestone 5.

### Admin Navigation (Milestone 3 Subtask 6)

Milestone 3 Subtask 6 adds a configurable admin navigation system. Site navigation items are managed through an API-backed CRUD interface and rendered dynamically in the public shell, replacing the previous hardcoded nav links.

#### NavigationModule API Routes

`NavigationController` exposes two distinct access surfaces under `/api/navigation`:

**Public read routes — no authentication required for the public surface:**

- `GET /api/navigation/items/public` — returns all active top-level navigation items with `visibility = "public"`, ordered by `sortOrder` ascending. Returns `{ items: NavigationItemDetail[] }` where each top-level item includes its active, public-visibility children. Children whose linked internal blog post or standalone page target is not publicly visible are omitted before the response is returned. Top-level items whose own linked target is not publicly visible are also omitted entirely. Safe for guest access; `NavigationService.findPublic()` enforces all filtering server-side.
  - **Publication-leakage filtering rules** (`NavigationService.isLinkedTargetPubliclyVisible`): external links always pass. Internal links are checked by URL pattern:
    - `/blog/<slug>` — the linked blog post must have `status = "published"` and `publishedAt <= now`; future-dated or unpublished posts are omitted.
    - `/pages/<slug>` — the linked standalone page must have `status = "published"`; draft and unpublished pages are omitted.
    - `/<slug>` (single-segment top-level path) — slugs in `RESERVED_PAGE_SLUGS` (`admin`, `api`, `app`, `blog`, `login`, `register`, `onboarding`, `profile`, `settings`, `health`) are treated as static routes and are always shown. All other single-segment paths are resolved against `standalone_pages`; the page must have `status = "published"` or the item is omitted.
    - All other internal paths (multi-segment static routes) are always shown (safe `[]` fallback).
- `GET /api/navigation/items/authenticated` — returns all active top-level navigation items with `visibility = "public"` or `"authenticated"`, ordered by `sortOrder` ascending, with one level of active, non-admin children. **Requires an active `sfus_session` cookie**; the controller calls `AuthService.resolveSession()` and returns `401` when no session is present. Items with `visibility = "admin"` are excluded for non-admin users; the caller's `globalRole` is used to determine whether admin items should be included. For admin users all visibility levels are returned.

**Admin management routes — require an active `sfus_session` cookie and the global `admin` role:**

- `GET /api/navigation/admin` — lists all navigation items regardless of visibility or active status as `{ items: NavigationItemDetail[] }`. Top-level items ordered by `sortOrder`; each includes its children.
- `POST /api/navigation/admin` — creates a new navigation item. Body: `{ label, url, linkType?, visibility?, sortOrder?, parentId? }`. Defaults: `linkType = "internal"`, `visibility = "public"`, `sortOrder = 0`, `isActive = true`. Returns `{ item: NavigationItemDetail }` with HTTP 201.
- `PATCH /api/navigation/admin/:id` — updates a navigation item. All fields optional. Returns `{ item: NavigationItemDetail }`.
- `DELETE /api/navigation/admin/:id` — deletes a navigation item. Child items are removed via database CASCADE. Returns `{ deleted: true }`.

All admin routes return `401` when no session is present and `403` when the session's global role is not `admin`. Authorization is enforced by `NavigationService.assertAdminManagementAccess(session.user.globalRole)` called at the top of every admin handler.

#### Authorization Model

`NavigationService.assertAdminManagementAccess(actorGlobalRole: string)` is the single authorization gate for all navigation management operations. It delegates to `AuthorizationService.hasGlobalRole(actorGlobalRole, "admin")` and throws `ForbiddenException` for any role below admin. All admin `NavigationController` handlers call this method before performing any data operation.

#### 1-Level Nesting Constraint

Navigation supports exactly one level of nesting. A child item's `parentId` must point to a top-level item (one whose own `parentId` is `null`). Attempting to set a grandparent relationship (nesting a child under another child) is rejected with `400 Bad Request`. Additionally, a top-level item that already has children cannot be reclassified as a child item without first reassigning or deleting its children; this too is rejected with `400 Bad Request`.

#### `navigation_items` Table Schema

Migration `1748736000000-milestone-three-content-foundation.ts` adds the `navigation_items` table:

| Column | Type | Notes |
|---|---|---|
| `id` | `char(36)` | UUID primary key |
| `parent_id` | `char(36)` | Nullable FK to `navigation_items.id` with `ON DELETE CASCADE` |
| `label` | `varchar(128)` | Display label; required, max 128 characters |
| `link_type` | `varchar(16)` | `"internal"` or `"external"`; default `"internal"` |
| `url` | `varchar(512)` | Destination URL; required, max 512 characters |
| `visibility` | `varchar(32)` | `"public"`, `"authenticated"`, or `"admin"`; default `"public"` |
| `sort_order` | `smallint unsigned` | Ascending display order; default `0` |
| `is_active` | `tinyint(1)` | `1 = active`, `0 = inactive`; default `1` |
| `created_at` | `datetime(3)` | Set at insert |
| `updated_at` | `datetime(3)` | Auto-updated on change |

A composite index `idx_navigation_items_parent_sort` on `(parent_id, sort_order)` supports the ordered tree queries. The self-referential FK enforces cascade deletion of children when a parent is deleted.

#### Response Shape

`NavigationItemDetail`:

```
{
  id: string,
  parentId: string | null,
  label: string,
  linkType: "internal" | "external",
  url: string,
  visibility: "public" | "authenticated" | "admin",
  sortOrder: number,
  isActive: boolean,
  children: NavigationItemDetail[],
  createdAt: string,   // ISO 8601
  updatedAt: string    // ISO 8601
}
```

Top-level items always include a `children` array (empty when no children exist). Child items are included in the parent's `children` field; they are not returned as separate top-level entries.

#### Web Routes — Admin Navigation Management

`/admin/navigation` — admin navigation management page (`apps/web/app/admin/navigation/page.tsx`). Requires an active session with the global `admin` role. Redirects unauthenticated users to `/login?next=/admin/navigation`. Non-admin sessions see an "Admin access required" error.

Features available from the admin navigation page:
- **Create** — form with Label, URL, Link Type (`internal`/`external`), Visibility (`public`/`authenticated only`/`admin only`), Sort Order, and optional Parent selector (limited to top-level items). Submits `POST /api/navigation/admin`.
- **Toggle visibility** — "Show"/"Hide" buttons toggle `isActive` per item via `PATCH /api/navigation/admin/:id`. Applies to both top-level and child items.
- **Reorder** — up/down arrow buttons swap `sortOrder` values between adjacent siblings within the same level, via two concurrent `PATCH` calls.
- **Delete** — confirms with a browser dialog before calling `DELETE /api/navigation/admin/:id`. Cascade removes children automatically.

#### Dynamic Navigation Shell

`apps/web/components/navigation.tsx` renders the public shell navigation bar dynamically. On each route change it fetches navigation items from the API based on the current session state:

- Guest sessions call `GET /api/navigation/items/public`.
- Authenticated sessions call `GET /api/navigation/items/authenticated`.

A fetch error falls back silently to an empty dynamic items list so the shell still renders. After dynamic items, the shell always appends the fixed auth-state links (Sign in / Register for guests; App / Profile / Settings for authenticated users).

**Child item rendering — `NavDropdown`:** When a top-level item has visible children (active children whose visibility is compatible with the current session state), it renders as a keyboard-accessible dropdown using the `NavDropdown` component. The dropdown trigger is a `<button>` with `aria-expanded` and `aria-haspopup="menu"`. The panel has `role="menu"` with an `aria-label`. Pressing Escape or moving focus outside the container closes the dropdown; clicking the trigger toggles it.

**External link rendering — `NavItemLink`:** Items with `linkType = "external"` render as a plain `<a>` element with `target="_blank"` and `rel="noopener noreferrer"` to prevent tab-napping. Items with `linkType = "internal"` render as a Next.js `<Link>` with active-state styling derived from the current pathname.

`apps/web/app/navigation/navigation-client.ts` is the typed API client for navigation calls. It exports `adminListNavItems`, `adminCreateNavItem`, `adminUpdateNavItem`, and `adminDeleteNavItem` (all admin, `credentials: "include"`) as well as the `NavigationItemDetail`, `CreateNavigationItemInput`, and `UpdateNavigationItemInput` TypeScript interfaces.

### Public Landing Page (MS3 Landing Refresh)

The public homepage at `/` was refreshed to describe Milestone 3 capabilities and surface recent blog content.

#### Page Structure

`apps/web/app/page.tsx` is a Next.js server component with no `fetch` calls or `useEffect` hooks. It renders four sections:

1. **Hero** — heading, Milestone 3 description, and a primary link to `/blog`.
2. **Highlights grid** — three cards describing blog with threaded comments, standalone pages with revision history, and dynamic navigation with media uploads.
3. **What's new in Milestone 3** — a two-column section containing the `RecentPostsFeed` component with a "View all posts →" link to `/blog`, and an explore list with links to `/blog` (blog index), `/about` (standalone page), `/admin/navigation` (admin navigation), and a copy note about threaded comments.
4. **Runtime notes** — the shared API path contract and current content scope description.

All Milestone 2 references have been removed from the landing page copy and the shared site shell (`layout.tsx`).

#### RecentPostsFeed Component

`apps/web/components/recent-posts-feed.tsx` is a `"use client"` component that calls `listPublishedPosts()` from `blog-client.ts`, slices the result to the first 3 posts, and renders them as a linked list. Each post entry links to `/blog/<slug>` and optionally shows the post summary and formatted `publishedAt` date.

State handling:
- **Loading** — shows "Loading recent posts…" while the fetch is in progress.
- **Empty** — shows "No posts yet." when the API returns an empty list.
- **Error** — shows "Could not load recent posts." as a non-fatal inline message when the fetch fails; the rest of the landing page renders normally.

The `/about` link points to `/:slug` (the top-level catch-all route) for the `about` slug. If an admin has not yet published a standalone page with slug `about`, the link resolves to a "not published" message rather than a `404`; this is intentional.

## Runtime Contract Overview

Milestone 1 local development is hybrid by default:

- `web` runs on the host at `localhost:3000`
- `api` runs on the host at `localhost:3001`
- `mysql` runs through `cicd/docker/compose.dev.yml`

The same local Compose file also supports full-stack container validation with the `fullstack` profile, while `cicd/docker/compose.prod.yml` is the single production Compose definition for long-lived `web` and `api` services. Production routing stays behind the existing reverse-proxy integration, so production-oriented Compose does not bind host ports for either app service.
The production `migrate` service is independently runnable as a one-off pre-rollout step and does not depend on starting `api`.

Both Compose files declare a `sfus_media_uploads` named Docker volume that is mounted into the `api` container at `/app/storage/uploads` and the `MEDIA_STORAGE_PATH` environment variable is set to that path in both `compose.dev.yml` and `compose.prod.yml`. The production `migrate` service also mounts the same volume so migrations that touch media records can access the storage root. The named volume ensures uploaded files survive container restarts and image rebuilds; in production, this volume must be backed by durable storage and included in backup procedures.

## Environment Ownership

Copy the example env files before running local Compose validation:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

Ownership is split by runtime boundary:

- `.env.example` - platform/deployment-owned values used by Compose metadata and local MySQL scaffolding
- `apps/web/.env.example` - web-owned values, including `/api` path targeting and container-internal API routing
- `apps/api/.env.example` - API-owned values, including the database contract, auth foundation inputs for password peppering, session-token hashing, verification/session lifetimes, TOTP issuer naming, and recovery-code generation, and Milestone 3 media upload constraints (`MEDIA_UPLOAD_MAX_SIZE_BYTES`, `MEDIA_ALLOWED_MIME_TYPES`, `MEDIA_STORAGE_PATH`) used by the API container and explicit migration flow

The API environment contract now validates these auth settings at startup:

- `AUTH_PASSWORD_PEPPER` is required and must be at least 16 characters.
- `AUTH_SESSION_TOKEN_PEPPER` is required, must be at least 16 characters, and is used when hashing persisted session and email-verification tokens.
- `AUTH_SESSION_TTL_MINUTES` must be an integer from 5 to 43200.
- `AUTH_SESSION_IDLE_TIMEOUT_MINUTES` must be an integer from 5 to 10080 and cannot exceed `AUTH_SESSION_TTL_MINUTES`.
- `AUTH_EMAIL_VERIFICATION_TTL_MINUTES` must be an integer from 5 to 10080 and controls how long a newly issued verification token remains usable.
- `AUTH_EXTERNAL_STATE_TTL_MINUTES` must be an integer from 5 to 60 and controls OAuth callback-state expiry.
- `AUTH_TOTP_ISSUER` is required and names the issuer presented by TOTP authenticators.
- `AUTH_RECOVERY_CODE_COUNT` must be an integer from 6 to 20.
- `AUTH_RECOVERY_CODE_LENGTH` must be an integer from 8 to 16.
- `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, and `AUTH_GOOGLE_CALLBACK_URL` are required for Google sign-in.
- `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`, and `AUTH_GITHUB_CALLBACK_URL` are required for GitHub sign-in.
- `MEDIA_UPLOAD_MAX_SIZE_BYTES` must be an integer from 1024 to 20971520.
- `MEDIA_ALLOWED_MIME_TYPES` must be a comma-separated list of at least one valid `type/subtype` MIME type.
- `MEDIA_STORAGE_PATH` is required and must be a non-empty string.

The example files are templates only. Production secrets and the external production MySQL connection are managed on the host outside the repository checkout.

## Deployment And Validation References

- `cicd/docs/local-pipeline.md` - hybrid local development, full-stack Compose validation, and explicit production migration flow
- `cicd/docs/cicd.md` - CI validation entrypoints, smoke validation usage, and runtime contract artifacts
- `docs/website-launch-guide.md` - website container startup, required local env files, runtime URLs, migrations, and test commands
- `docs/architecture/milestone-1-foundation-decisions.md` - locked Milestone 1 architecture and deployment decisions

## Operational Validation Commands

- `bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml` - lint, typecheck, test, smoke validation, and shared CI/CD contract checks
- `bash cicd/scripts/smoke-validate.sh` - build the apps, start the full local stack, run the explicit migration command, and verify homepage plus API health
