Below is a complete product and technical design for your sci‑fi role‑playing game website. It’s organized so you can move from concept to implementation without guesswork.

---

## 1) Product vision & high‑level requirements

**Core idea:** A community hub for your game where players can log in (preferably via external identity), read and publish news, discuss on forums, share files, build characters, collaborate in projects (each with its own mini‑hub), and maintain a Documents/wiki. A personalized front page surfaces “what’s new” across the whole site and each user’s projects.

**Non‑goals (MVP):** No marketplace/payments, no real‑time collaborative editing (use per‑page locking + revisions), and no federation/federated search.

---

## 2) User roles & permissions

**Global roles**
- **Guest:** read public content.
- **Member:** create/edit own content, join open projects, comment, upload within quotas.
- **Moderator:** moderate across the site (delete/lock/move, handle reports).
- **Admin:** site configuration, navigation, theming, user management.

**Project‑scoped roles (per project)**
- **Project Admin** (owner): manage settings, membership, sections, and permissions.
- **Project Moderator:** moderate within project.
- **Project Member:** read/write within project, access private content.
- **Project Viewer:** read‑only (if project is public).

> All content objects carry an **ACL**: `visibility` (public/unlisted/members/project-only/private) + `owner_id` + optional `project_id`.  
> ACL rules govern both direct reads and search discoverability (no object should appear in search if the requester cannot access it).

---

## 3) Information architecture

### Top‑level sections
- **Home / What’s New** (personalized feed)
- **Blog** (news & announcements)
- **Forums**
- **Downloads**
- **Characters** (gallery + generator)
- **Documents** (wiki)
- **Projects** (list & search)
- **Pages** (standalone)
- **Search** (global, access-aware across all user-visible site and project content)
- **Profile** / **Settings** / **Admin** (as applicable)

### Project sub‑sections (same structure, scoped)
- **Overview (blog‑style front page)**
- **Forums** (project‑scoped)
- **Documents** (project wiki namespace)
- **Downloads** (project files)

---

## 4) Authentication & account model

**Preferred auth:** External identity providers via **OpenID Connect** / **OAuth 2.0** (Google, Facebook, GitHub; add others later).

**Local auth:** Email + password with Argon2id hashing; email verification required.

**Flow**
1. User clicks “Continue with Google/Facebook/…”
2. On first login, user picks a **unique site username/alias** (e.g., `@voidpilot`).  
3. Optional: set display name (can change), upload avatar, accept ToS/Privacy.
4. Multi‑factor (TOTP) optional in settings.
5. Multiple external identities can be linked to the same account.

**Key rules**
- **Username** is globally unique, URL‑safe, and used for mentions (`@alias`).
- Display name can contain spaces/emoji; username cannot.
- Changing username is allowed but rare (rate‑limit and 301 old profile URL).

---

## 5) Content types & features

### 5.1 Blog
- Posts: title, body (Markdown + WYSIWYG), featured image, tags, scheduled publishing.
- Comments: threaded (1 level), images/attachments allowed.
- Moderation: draft/review (optional), pin/feature, lock comments.

### 5.2 Forums
- Hierarchy: Categories → Boards → Topics → Posts.
- Features: rich text (Markdown or WYSIWYG), quotes, mentions, polls, images/attachments, pin/lock/move/split/merge, per‑board moderators.
- Anti‑spam: rate limits, link limits, captcha on suspicious patterns.

### 5.3 Downloads
- Files with metadata: title, description, version, license, tags, checksum, size.
- Attach multiple files per “release”; show version history; count downloads.
- Virus scan on upload (clamav container or service), file type allowlist, per‑user quotas.
- Storage: **abstracted storage layer** (local filesystem initially, S3‑compatible swappable) with **pre‑signed URLs** or secure volume‑served paths for delivery.

### 5.4 Characters (gallery + generator)
- **Schema:** system‑agnostic container with **game‑module** metadata:
  - Core fields: name, species, background, portrait, short bio.
  - Attribute bundle(s) (key/value; e.g., STR, INT, DEX…).
  - Skills & levels, equipment, notes.
  - Visibility: public/unlisted/private or project‑only.
- **Random generator:** pluggable module per game system; seeded random; rule tables.
- **Import/Export:** JSON (canonical schema), printable PDF; image upload for portrait.
- **Gallery:** filter by species, archetype, tags; “featured” and “recent”.

### 5.5 Documents (wiki)
- Markdown with WYSIWYG editor; page tree + breadcrumbs; slug paths.
- Namespaces: `/docs/...` and `/projects/:slug/docs/...` with separate indices.
- Every edit creates a **revision** with diff & rollback; attachments allowed.
- Page locking (soft lock) to reduce edit conflicts; per‑page watchers/notifications.

### 5.6 Projects
- Create project: title, slug, description, banner, icon.
- Privacy: **public** or **private**.
- Membership: **open join** or **restricted** (invite/approve). Status states: invited, pending, active, banned. Project role is tracked separately (viewer/member/moderator/admin).
- Sections: mini‑blog, forums, documents, downloads (identical features but scoped).
- Project feed: recent items from all sections, visible to members; public if project is public.

### 5.7 Standalone Pages
- For About, Contact, Rules, etc. Versioned like documents; Page builder: Markdown or WYSIWYG + simple blocks (hero, image, CTA).

### 5.8 Navigation bar
- Configurable **nav items** with order, visibility by role, and external/internal targets.
- Supports hierarchical menus (dropdowns) and per‑project subnav.

### 5.9 Personalized “What’s New” feed
- Aggregates: new/updated blog posts, forum topics/posts, document edits, downloads, and character uploads from:
  - Global public content
  - Projects the user is a member of
  - Authors/boards/tags the user follows
- Ranking: time‑decay + lightweight personalization (boost follows/mentions).
- Realtime: WebSocket/SSE for badge counts; page uses cached queries refreshed frequently.

### 5.10 Notifications & follows
- Users can **follow** tags, authors, boards, projects, or specific objects.
- Channels: onsite inbox + email digests; granular per‑type settings.

---

## 6) System architecture

**Deployment model:** Self‑hosted on local server using **Docker** containers behind **nginx‑proxy** with **Let's Encrypt** companion for automatic TLS certificate management. All services run on a single domain with **path‑based routing** (e.g., `example.com/` for frontend, `example.com/api` for backend).

**Recommended stack (TypeScript‑first)**
- **Frontend:** Next.js (React) with SSR/ISR + App Router, TypeScript, Zod validation, Zustand/React Query.
- **Backend:** NestJS (Node) with REST (and GraphQL optional), class‑validator, Swagger.
- **Database:** MySQL 5.7.44 (existing server instance; avoid 8.0‑only features in schema and queries).
- **Cache / jobs / pub‑sub:** Redis (BullMQ for tasks).
- **Search:** OpenSearch/Elasticsearch for full‑text across posts/wiki/forums/characters.
- **Storage:** Abstracted storage interface with local filesystem/volume implementation initially; designed for future S3‑compatible swap (MinIO, AWS S3, etc.).
- **Realtime:** WebSockets (Socket.IO) or Server‑Sent Events.
- **Reverse proxy:** nginx‑proxy with automated Let's Encrypt certificates.
- **CI/CD:** Docker Compose, GitHub Actions for build/test, local deployment scripts.

**Alternative (Python)**
- **Django + Django Rest Framework**, Celery + Redis, Django‑Allauth, MySQL, Wagtail (pages/blog), Django‑Channels (realtime). Choose this if your team prefers Python.

**High‑level diagram (Docker self‑hosted)**

```
[Internet]
     │
     ▼
[nginx-proxy + Let's Encrypt companion]  ← TLS termination, routing
     │  (example.com/* → frontend)
     │  (example.com/api/* → backend)
     ├──→ [Next.js SSR container]
     │         └──→ [Static assets volume]
     └──→ [NestJS API container]
               ├──→ [MySQL container]
               ├──→ [Redis container: cache, queues, pub-sub]
               ├──→ [OpenSearch container]
               └──→ [Local storage volume]  ← abstracted, swappable to S3

All containers on internal Docker network; only nginx-proxy exposed on :80/:443.
```

**Storage abstraction layer**
- Define an interface `IStorageProvider` with methods: `upload(file, key)`, `getUrl(key)`, `delete(key)`, `generatePresignedUrl(key, expiry)`.
- Implementations: `LocalStorageProvider` (filesystem + nginx volume serving), `S3StorageProvider` (future).
- Configuration-based selection via environment variable `STORAGE_PROVIDER=local|s3`.

---

## 7) Data model (key tables)

> Prefix `site_` for global, `proj_` for project‑scoped, shared tables omit prefix. Timestamps are UTC; all rows have `created_at` and `updated_at`. Add `deleted_at NULL` on tables where soft delete is required.

**Users & auth**
- `users(id, email, email_verified_at, username UNIQUE, display_name, avatar_url, bio, mfa_enabled, role ENUM[member,moderator,admin])` (guest is unauthenticated and not stored as a user row)
- `auth_identities(id, user_id FK, provider ENUM[google,facebook,github,local], provider_user_id, access_token_hash, refresh_token_hash, last_login_at)`
- `password_auth(user_id PK, password_hash, password_updated_at)`
- `sessions(id, user_id, ip, user_agent, created_at, expires_at)`
- `user_settings(user_id PK, timezone, locale, content_prefs JSON, notif_prefs JSON)`
- `follows(id, follower_user_id, target_type, target_id, created_at)`

**Navigation**
- `nav_items(id, label, url, type ENUM[internal,external,section,page], parent_id, position, visible_to ENUM[guest,member,moderator,admin,all])`

**Blog**
- `blog_posts(id, author_id, title, slug UNIQUE, body_md, body_html, featured_image, status ENUM[draft,published,scheduled], published_at)`
- `blog_post_tags(post_id, tag)`
- `blog_comments(id, post_id, author_id, body_md, body_html, parent_id NULL, attachments JSON)`

**Forums**
- `forum_categories(id, name, description, position)`
- `forum_boards(id, category_id, name, description, slug, position, is_private, moderators JSON)`
- `forum_topics(id, board_id, author_id, title, slug, is_locked, is_pinned, last_post_at)`
- `forum_posts(id, topic_id, author_id, body_md, body_html, attachments JSON, reply_to_post_id NULL)`

**Downloads**
- `downloads(id, scope_type ENUM[site,project], scope_id NULL, title, description, license)`
- `download_tags(download_id, tag)`
- `download_files(id, download_id, version, file_key, checksum, size_bytes, mime, changelog, downloads_count)`

**Documents (wiki)**
- `docs_pages(id, scope_type, scope_id, title, path, slug, parent_id, is_locked, current_rev_id)`
- `docs_revisions(id, page_id, author_id, body_md, body_html, summary, rev_number)`

**Characters**
- `characters(id, owner_id, project_id NULL, name, species, archetype, portrait_url, summary, visibility, metadata JSON)`
- `character_attributes(id, character_id, key, value, module_namespace)`
- `character_files(id, character_id, file_key, kind ENUM[portrait,pdf,json], size_bytes)`

**Projects**
- `projects(id, owner_id, title, slug UNIQUE, description, banner_url, icon_url, visibility ENUM[public,private], join_policy ENUM[open,restricted])`
- `project_members(id, project_id, user_id, role ENUM[admin,moderator,member,viewer], status ENUM[invited,pending,active,banned])`

**Feed & notifications**
- `events(id, actor_user_id, event_type, scope_type, scope_id, object_type, object_id, occurred_at, payload JSON, visibility)`
- `user_inbox(id, user_id, event_id, is_read, is_emailed)`

**Moderation & safety**
- `reports(id, reporter_id, object_type, object_id, reason ENUM[spam,abuse,other], notes, status ENUM[open,reviewed,resolved])`
- `audit_log(id, actor_id, action, object_type, object_id, details JSON)`

---

## 8) API design (selected endpoints)

**Auth**
- `POST /api/auth/external/:provider/callback` → exchange code, upsert user, return secure session cookie.
- `POST /api/auth/local/register` `{ email, password, username }`
- `POST /api/auth/local/login` `{ email, password }`
- `POST /api/auth/logout`
- `POST /api/auth/mfa/enable`, `POST /api/auth/mfa/verify`

> **Deployment note:** OAuth callback URLs, CORS origins, and CSRF cookie domains must all reference the **public domain** and public API base path (e.g., `https://example.com/api/auth/external/google/callback`) configured in nginx‑proxy routing.

**Blog**
- `GET /api/blog?tag=&q=&page=`
- `POST /api/blog` (auth) create post
- `GET /api/blog/:slug`
- `POST /api/blog/:id/comments`

**Forums**
- `GET /api/forums`
- `GET /api/forums/boards/:slug/topics?page=`
- `POST /api/forums/boards/:id/topics`
- `GET /api/forums/topics/:slug`
- `POST /api/forums/topics/:id/posts`
- `PATCH /api/forums/topics/:id` (pin/lock) [moderator]

**Downloads**
- `GET /api/downloads?scope=site|project&id=&q=`
- `POST /api/downloads` then `POST /api/downloads/:id/files` → returns pre‑signed upload URL
- `GET /api/download-files/:id` → redirects to pre‑signed GET

**Documents**
- `GET /api/docs/*path` (catch-all route for nested wiki paths)
- `POST /api/docs` (create page)
- `POST /api/docs/:id/revisions` (edit)
- `GET /api/docs/:id/history` (diff data)

**Characters**
- `GET /api/characters?q=&species=&archetype=`
- `POST /api/characters` (create/import)
- `POST /api/characters/generate?module=sfrpg&seed=`
- `GET /api/characters/:id/export?format=json|pdf`

**Projects**
- `GET /api/projects?q=&visibility=`
- `POST /api/projects` (create)
- `GET /api/projects/:slug`
- `POST /api/projects/:slug/members` (invite/add/approve)
- Project‑scoped section endpoints mirror site ones with `/api/projects/:slug/...` (use IDs internally only).

**Search**
- `GET /api/search?q=&type=&project=&scope=all|site|projects&page=`
- Returns only objects the requester can access after ACL + membership filtering.
- `scope` narrows results but cannot expand beyond requester permissions.

**Feed & notifications**
- `GET /api/feed` (personalized)
- `GET /api/notifications`, `POST /api/notifications/:id/read`

---

## 9) Frontend UX flows (key screens)

1. **Onboarding**
   - Choose login provider → pick username/alias → optional display name/avatar → done.
2. **Create content**
   - Editors offer **Markdown or WYSIWYG mode** toggle (per-user preference saved in `user_settings.content_prefs`); unified media picker; live preview; drag‑and‑drop images. WYSIWYG converts to Markdown on save.
3. **Image uploads**
   - Client requests **pre‑signed URL** (or upload endpoint for local storage), uploads file, then submits the post with attachment metadata.
4. **Projects**
   - Create → pick privacy & join policy → land on project overview (blog‑style) with tabs for Forums, Documents, Downloads.
5. **Personalized feed**
   - “What’s New” shows cards for posts/edits/uploads with source badges (Blog/Forum/Docs/Project). Filters: “All”, “Only my projects”, “Mentions”.

**Navigation**
- Top bar: logo, main sections, Search box, “Create” dropdown, notifications bell, user menu.
- Admins see **Customize Nav**: drag‑order, visibility, and link editor.

**Accessibility**
- WCAG 2.1 AA: heading hierarchy, focus styles, color contrast, ARIA landmarks, keyboard‑navigable menus, alt text enforcement on images.

---

## 10) Character generator (module design)

**Module contract**
```ts
interface CharacterGeneratorModule {
  id: 'sfrpg' | 'custom';
  name: string;
  defaultSeed?: number;
  roll(seed?: number): GeneratedCharacter;
  validate(c: GeneratedCharacter): ValidationResult;
}
```

**GeneratedCharacter (canonical)**
```ts
type AttributeBlock = Record<string, number | string>;
interface GeneratedCharacter {
  name: string;
  species: string;
  archetype?: string;
  attributes: AttributeBlock;     // e.g., { STR: 55, DEX: 60, ... }
  skills: { name: string; level: number }[];
  equipment: string[];
  backstory?: string;
  meta: { module: string; rulesetVersion: string };
}
```

**Rules data**
- Store tables as JSON under `/game_modules/sfrpg/*.json` (species list, name syllables, skill distributions).
- Deterministic randomness with seed → stable rerolls.
- UI offers: “Random”, “Roll with seed”, “Lock some traits & re‑roll others”.

---

## 11) Search design

- **Index** blog posts, forum topics & posts, doc pages (current revision), downloads, characters.
- Fields: title, body, tags, author, project, timestamps, visibility.
- **Scope rule**: default search scope is all content the current requester can access.
  - Guest: public site content + content from public projects.
  - Authenticated user: public site content + public project content + private project content where membership status is `active`.
  - Include requester-owned private/unlisted objects where object type supports owner-private visibility.
- **Permission filter**: enforce ACL and membership at query time using indexed visibility + scope metadata.
- **Leak prevention**: unauthorized objects must not appear in result lists, snippets, facets, or total hit counts.
- Query operators: `tag:`, `author:`, `project:`, `type:topic|doc|char`, quoted phrases.
- Ranking: BM25 + recency boost.

---

## 12) Personalization & feed mechanics

- Write to `events` on create/update: e.g., `BlogPostPublished`, `ForumPostCreated`, `DocRevised`, `DownloadReleased`, `CharacterCreated`, with `scope_type` and `visibility`.
- Nightly cleanup job compacts older events.
- **Feed query**:
  1. Get user’s memberships and follows.
  2. Fetch candidate events matching: (public) OR (project in memberships) OR (actor followed) OR (tag followed).
  3. Enforce ACL/membership visibility on every candidate event before scoring/rendering.
  4. Sort by `score = recency_decay + follow_boost + mention_boost`.
- Cache per‑user feed pages in Redis; invalidate on new relevant events.

---

## 13) Moderation, safety & compliance

- **Reports**: any object can be reported; moderators get queue with context and quick actions (warn, delete, lock, ban).
- **Content filters**: simple bad‑word list + link throttling; captcha for first posts/new accounts.
- **Rate limits**: per route & per user/IP via Redis token buckets.
- **Privacy & ToS**: consent on sign‑up; data export (GDPR‑style) for user content; delete account removes PII but keeps anonymized authored content if policy allows.
- **Logging & audit**: security events (auth, permission failures), moderation actions, admin changes.

---

## 14) Security architecture

- **HTTPS everywhere**, HSTS at nginx‑proxy; strong cipher suites, TLS 1.2+ only.
- **Reverse proxy hardening**:
  - TLS termination at nginx‑proxy; app containers use HTTP internally on isolated Docker network.
  - Trusted proxy configuration: app reads `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP` headers from nginx‑proxy only.
  - Rate limiting and audit logs capture **real client IP** via trusted headers.
  - Secure cookies: `httpOnly`, `SameSite=Lax/Strict`, `Secure` flag (requires app to recognize `X-Forwarded-Proto: https`).
  - App containers **not exposed** on host ports; only nginx‑proxy on :80/:443.
- **CSRF** protection on state‑changing requests; **CSP** headers.
- **Password hashing**: Argon2id; block common passwords (HIBP offline list).
- **Secure session cookies** (`httpOnly`, `Secure`, `SameSite`) with proper proxy‑aware flags.
- **Email verification** required; **MFA (TOTP)** optional.
- **Presigned/secure storage URLs** for uploads/downloads; server never proxies big files (nginx volume serving or presigned abstraction).
- **Input sanitization** + Markdown renderer that strips dangerous HTML; allow limited embeds (images only).

---

## 15) Performance & scalability

- SSR for fast first paint, **ISR** (incremental static regeneration) for read‑heavy pages (blog, docs).
- Redis caching for hot lists (recent topics, project feeds), with tag‑based invalidation.
- **Reverse proxy optimizations**:
  - gzip/brotli compression at nginx‑proxy for text responses.
  - Static asset caching headers; consider nginx caching layer for ISR pages.
  - `client_max_body_size` tuned for large uploads (e.g., 100MB for downloads/images).
  - WebSocket/SSE proxy support: `Upgrade` header pass‑through, long timeouts for realtime connections.
- Background jobs for:
  - Image processing (thumbnails, WebP), virus scans.
  - Search indexing.
  - Email digests.
- Static assets served via nginx volume or abstracted storage with cache headers.
- N+1 query prevention via DataLoader/ORM eager loading.

---

## 16) Admin console

- **Users:** search, roles, bans, link/unlink identities.
- **Navigation:** add/edit/remove items, drag sort, visibility.
- **Content:** blog management, forum board config, tags.
- **Moderation:** reports queue, audit history.
- **Settings:** site name/branding, email provider, storage bucket keys, auth providers.

---

## 17) Implementation plan (phased)

**Phase 1 – Foundation (Auth + Blog + Forums + Nav)**
- External + local auth with username selection.
- Blog (posts/comments), Forums (boards/topics/posts), image upload pipeline.
- Navigation editor, basic permissions, admin console skeleton.

**Phase 2 – Documents & Downloads**
- Wiki with revisions and attachments.
- Downloads with releases, virus scanning, and storage abstraction (`local` first, optional `s3` provider later).

**Phase 3 – Projects**
- Project creation, privacy & join policy, scoped sections (blog/forums/docs/downloads).
- Project feed.

**Phase 4 – Characters**
- Character schema, gallery, JSON import/export, first generator module.

**Phase 5 – Personalized feed & notifications**
- Event system, per‑user feed, follows, onsite notifications + email digests.
- Global Search.

**Phase 6 – Polish**
- Theming, accessibility sweep, SEO (sitemaps, OpenGraph), analytics, rate limits.

---

## 18) Key UI details (so it feels cohesive)

- **Design language:** “Retro‑futuristic control panel” motif (optional), but keep typography clean and modern for readability.
- **Cards everywhere:** blog posts, feed items, downloads, characters.
- **Badges:** clearly label scope (Global / Project Name) on feed items.
- **Editors:** consistent toolbar (bold/italic/link/code/quote/list/table/image) with **Markdown/WYSIWYG mode toggle** (remembers per-user preference); Markdown shortcuts and live preview in Markdown mode; visual editing in WYSIWYG mode. All content stored as Markdown.
- **Mentioning:** `@username` autocomplete; notifies mentioned users.
- **Breadcrumbs:** especially in Documents and Projects.
- **Diff view:** side‑by‑side for wiki revisions.

---

## 19) Testing checklist

- Unit tests for generators, permissions, and editors.
- Integration tests for auth flows (external + local), uploads (pre‑signed), role gating.
- E2E for creating a project and posting in all sections.
- Security tests: XSS payloads in Markdown, CSRF, rate‑limit enforcement.

---

## 20) Example schemas (abbreviated MySQL SQL)

```sql
-- Users
CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  email_verified_at DATETIME NULL,
  username VARCHAR(64) NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  role ENUM('member','moderator','admin') NOT NULL DEFAULT 'member',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Projects
CREATE TABLE projects (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT,
  title TEXT NOT NULL,
  slug VARCHAR(128) NOT NULL,
  description TEXT,
  banner_url TEXT,
  icon_url TEXT,
  visibility ENUM('public','private') NOT NULL DEFAULT 'public',
  join_policy ENUM('open','restricted') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_projects_slug (slug),
  CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_members (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role ENUM('admin','moderator','member','viewer') NOT NULL DEFAULT 'member',
  status ENUM('invited','pending','active','banned') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_project_members_project_user (project_id, user_id),
  CONSTRAINT fk_project_members_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

(Extend similarly for blog/forums/docs/downloads/characters.)

---

## 21) Permission matrix (excerpt)

| Action | Guest | Member | Moderator | Admin | Project Member | Project Admin |
|---|---|---|---|---|---|---|
| Read public blog/forums/docs | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Comment on blog/forum | – | ✔ | ✔ | ✔ | ✔ | ✔ |
| Upload to Downloads (site) | – | ✔ (quota) | ✔ | ✔ | – | – |
| Create Project | – | ✔ | ✔ | ✔ | – | – |
| Join open Project | – | ✔ | ✔ | ✔ | – | – |
| Invite/approve Project members | – | – | – | – | – | ✔ |
| Moderate (site/project) | – | – | ✔ (site) | ✔ | ✔ (project) | ✔ |

---

## 22) DevOps & operations

### Self‑hosted Docker deployment

**Docker Compose stack (production):**
- `nginx-proxy`: jwilder/nginx-proxy or nginxproxy/nginx-proxy with volume-mounted `/etc/nginx/vhost.d` for custom configs.
- `acme-companion`: nginxproxy/acme-companion for automatic Let's Encrypt certificate issuance and renewal.
- `frontend`: Next.js container, env `VIRTUAL_HOST=example.com`, `VIRTUAL_PATH=/`, `LETSENCRYPT_HOST=example.com`.
- `api`: NestJS container, env `VIRTUAL_HOST=example.com`, `VIRTUAL_PATH=/api`, `LETSENCRYPT_HOST=example.com`.
- `mysql`: official MySQL 5.7.44 image with named volume for `/var/lib/mysql`.
- `redis`: official Redis image with persistence volume.
- `opensearch`: OpenSearch container with data volume.
- `storage-volume`: named Docker volume or bind mount for local file storage (user uploads, images, downloads).
- Optional: `clamav` container for virus scanning.

**Persistent volumes:**
- `mysql_data`, `redis_data`, `opensearch_data`, `storage_files`, `letsencrypt_certs`, `nginx_conf`.
- Regular offsite backup of all volumes (rsync, Restic, or tarball snapshots).

**Secrets management:**
- Use Docker secrets or `.env` files (not checked into Git); rotate database passwords, JWT secrets, OAuth client secrets regularly.

**Certificate renewal:**
- acme-companion handles Let's Encrypt renewal automatically; monitor logs for failures.
- Set up alerts if certs are <14 days from expiry.

**Host responsibilities:**
- OS patching, Docker engine updates, firewall rules (allow :80/:443 only).
- Monitor disk usage (logs, volumes); rotate/compress logs.
- Ensure DNS A/AAAA records point to host public IP.

**Backup & restore:**
- Server infrastructure/operations team owns backup execution and restore drills for website content and database.
- This project defines backup requirements (scope, retention, recovery targets) and verifies they are met.

**Observability:**
- Structured logs from all containers → centralized collector (Loki, or volume-mounted log aggregation).
- Metrics: Prometheus + Grafana or simple health-check dashboard.
- Tracing: OpenTelemetry optional.
- Error tracking: Sentry or self-hosted alternative.

**Migrations:**
- Prisma/TypeORM/Alembic with MySQL driver; run migrations via one‑off container or init script before API startup.

**Environments:**
- **dev:** docker-compose.dev.yml on developer machines.
- **staging:** separate stack on same or different host.
- **prod:** production stack with hardened configs, resource limits, health checks.

---

## 23) SEO & social

- Per‑page meta tags, OpenGraph images, canonical URLs.
- Sitemaps for blog/docs/forums/characters/projects.
- Robots.txt tuned; avoid indexing private/project‑only content.
- Private/project-restricted content remains internally searchable only for authorized users.
- Friendly slugs: `/blog/shipyard-upgrade`, `/forums/board/starships/topic/hull-plating`, `/characters/voidpilot-2319`.

---

## 24) Theming & extensibility

- Theme tokens (colors, spacing, typography) with CSS variables.
- Light/dark mode.
- Plugin hooks for:
  - Additional auth providers
  - New character generator modules
  - Content webhooks (e.g., to Discord)

---

### What you can build first (quick win prototype)
- External login (Google), username pick.
- Blog + Forums with Markdown + image uploads (local storage provider + signed/authorized download URLs).
- Characters: gallery with manual entry and a simple random name/species generator.
- Projects: create + private/public + open/restricted membership.
- “What’s New” feed pulling last 30 events across site & memberships.
