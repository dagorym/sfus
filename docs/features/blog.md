# Blog & Comments

Blog publishing lifecycle (draft / publish / schedule / pin), threaded comments, and
moderation — API and web surfaces.

**Code:** `apps/api/src/blog/`, `apps/web/app/blog/` (incl. `blog-client.ts`),
`apps/web/app/admin/blog/`
**Related:** [media](media.md) for sanitizer + image upload · [authorization](authorization.md)
for the admin/moderation gates · [guides/content-management](../guides/content-management.md)
for the admin how-to

## Public visibility invariant

A post is publicly visible iff `status = "published"` **and** `publishedAt <= now`, evaluated
at query time on every public route (list, detail, comments read, comment create). No
background job: future-dated published posts ("scheduled") become visible when their time
arrives. Non-visible posts return `404` indistinguishable from nonexistent ones (no existence
oracle).

## API routes

All under `/api/blog`. Admin routes require the `sfus_session` cookie + `admin` global role
(`401` no session, `403` insufficient role) via `BlogService.assertAdminManagementAccess()`;
moderation routes require `moderator` or `admin` via `assertModerationAccess()`.

**Public (no auth, published-only):**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/blog` | `{ posts: BlogPostSummary[] }`, ordered `isFeatured DESC, publishedAt DESC` |
| GET | `/api/blog/:slug` | `{ post: BlogPostDetail }`; `404` per the visibility invariant |
| GET | `/api/blog/:postId/comments` | `{ comments: PublicBlogCommentDetail[], commentsLocked }` — top-level `visible` comments (oldest first), each with a `replies` array of its visible replies. Response omits `authorUserId`, `moderatedByUserId`, and `moderatedAt`. `:postId` resolves as slug first, then UUID; both paths enforce the visibility invariant. |

**Member (any active session):**

| Method | Path | Notes |
|---|---|---|
| POST | `/api/blog/:postId/comments` | Body `{ body, imageId?, parentId? }` → `{ comment: PublicBlogCommentDetail }`. `401` no session; `403` thread locked; `404` post not publicly visible; `400` empty/unsafe body, `parentId is invalid.` (uniform — covers both nonexistent parent and parent belonging to a different post), `imageId is invalid.` (uniform — covers both nonexistent image and wrong `resourceType`), or reply-to-a-reply (max 1 level). Response omits `authorUserId`, `moderatedByUserId`, and `moderatedAt`. |

**Admin post management:**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/blog/admin/posts` | all posts, all statuses, `createdAt DESC` |
| GET | `/api/blog/admin/posts/:id` | by UUID; `404` unknown |
| POST | `/api/blog/admin/posts` | create as `draft`. Body `{ title, slug?, body, summary?, featuredImageId?, isFeatured?, tags? }` |
| PATCH | `/api/blog/admin/posts/:id` | partial update; same validation as create for supplied fields |
| POST | `/api/blog/admin/posts/:id/publish` | `status = published`, `publishedAt = now` |
| POST | `/api/blog/admin/posts/:id/publish-at` | Body `{ publishedAt }` (ISO 8601; `400` otherwise). `status = published` with the supplied (possibly future) time. |
| POST | `/api/blog/admin/posts/:id/unpublish` | back to `draft`, `publishedAt` cleared |
| POST | `/api/blog/admin/posts/:id/toggle-featured` | flips the pin state |
| DELETE | `/api/blog/admin/posts/:id` | permanent; `{ deleted: true }` |

**Moderation (moderator/admin):**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/blog/moderation/comments/:postId` | all comments, all statuses; full `BlogCommentDetail` payload including `authorUserId`, `moderatedByUserId`, and `moderatedAt` for moderation workflows |
| PATCH | `/api/blog/moderation/comments/:commentId/status` | Body `{ status: "visible" \| "hidden" \| "removed" }` (`400` otherwise); records `moderatedByUserId` + `moderatedAt` on every change; full `BlogCommentDetail` payload |
| DELETE | `/api/blog/moderation/comments/:commentId` | permanent; `{ deleted: true }` |
| POST | `/api/blog/admin/posts/:id/lock-comments` | sets `commentsLocked = true` (blocks all new comments, moderators included) |
| POST | `/api/blog/admin/posts/:id/unlock-comments` | re-enables comments |

## Post lifecycle

```
draft ──publish / publish-at──▶ published        (publish-at may set a future publishedAt = "scheduled")
published ──unpublish──▶ draft                   (publishedAt cleared)
```

There is no separate stored `"unpublished"` post status — `unpublish` returns the post to
`draft`. (The entity's status enum declares `unpublished` but the service never sets it.)
The admin UI labels future-dated published posts as scheduled with their go-live time.

## Validation rules

- **Slug:** optional on create. When supplied it must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`
  (`400` otherwise). When omitted/blank the server slugifies the title and appends `-2`,
  `-3`, … on collision. Unique at the DB level (`uq_blog_posts_slug`). When the slug is
  auto-derived (no explicit slug supplied), a duplicate-key error on save (MySQL
  `ER_DUP_ENTRY` or SQLite `UNIQUE constraint failed`) signals a concurrent insert that
  claimed the same slug; `BlogService` retries `deriveUniqueSlug` and the save up to 3
  times. If all attempts are exhausted a `409 Conflict` is returned instead of propagating
  an unhandled database error. Explicit slugs supplied by the caller are saved once with no
  retry (the caller owns uniqueness for that path).
- **Body:** `normalizeMarkdownBody` → `validateMarkdownBody` before persistence; unsafe → `400`.
  Applies to posts (create + update) and comments. See [media](media.md).
- **featuredImageId:** must reference an existing `media_references` row (`400` otherwise);
  no resourceType scope check for post featured images.
- **Comment `imageId`:** must exist **and** have `resourceType = "blog-comment"`. Both a nonexistent record and a wrong-scope record return `400 imageId is invalid.` (uniform — prevents existence oracle).
- **Comment `parentId`:** when supplied, the referenced comment must exist and belong to the same post. Both a nonexistent parent and a parent belonging to a different post return `400 parentId is invalid.` (uniform — prevents existence oracle).
- **Tags:** lowercased + trimmed; an update replaces the full tag set.
- **Threading:** one level only — a reply's parent must be a top-level comment on the same post.

## Response shapes

- `BlogPostSummary`: `id, title, slug, summary, status, isFeatured, publishedAt,
  featuredImageId, tags, createdAt`.
- `BlogPostDetail`: summary fields + `body, authorUserId, commentsLocked, updatedAt`.
- `PublicBlogCommentDetail` (public endpoints — `listComments`, `createComment`):
  `id, postId, parentId, body, status, mediaReferenceId, createdAt, updatedAt`
  (+ `replies` on top-level entries from the public list route).
  `authorUserId`, `moderatedByUserId`, and `moderatedAt` are stripped server-side before the
  response leaves the API.
- `BlogCommentDetail` (moderation endpoints — `moderationListComments`, `moderateCommentStatus`):
  all `PublicBlogCommentDetail` fields plus `authorUserId, moderatedByUserId, moderatedAt`.
  Full payload is required for moderation workflows.

The web client `BlogCommentDetail` type in `blog-client.ts` mirrors `PublicBlogCommentDetail`
(public shape only — the three stripped fields are absent from the type).

## Web surfaces

- `/blog` — public index; featured posts first; entries link to `/blog/<slug>`.
- `/blog/:slug` — public post view (`MarkdownRenderer`), then comments: list loads after the
  post (load failures are silently ignored so the post stays readable); locked threads show a
  notice and hide the form/reply buttons; authenticated members get a `MarkdownEditor` comment
  form + `ImageUpload` (`resourceType="blog-comment"`, inserted as `![alt](url)`) and inline
  reply forms on top-level comments; guests get a "sign in to comment" link preserving
  `?next=`.
- `/admin/blog`, `/admin/blog/new`, `/admin/blog/:id/edit` — admin management (client-gated
  via `resolveProtectedSession()` + `hasGlobalRole(user, "admin")`; API enforces). The editor
  shows status-appropriate controls (Publish now / Schedule / Unpublish / Pin) and surfaces
  API error messages verbatim.

`blog-client.ts` is the typed client: public helpers (`listPublishedPosts`,
`getPublishedPost`, `listComments`) fetch without credentials; member/admin/moderation helpers
(`createComment`, `adminCreatePost`, `adminPublishAt`, `adminToggleFeatured`,
`moderateCommentStatus`, `adminLockComments`, …) send `credentials: "include"`. Error
extraction order: `payload.error.message` → `payload.message` → generic fallback (matches the
`JsonExceptionFilter` envelope — see [api-conventions](../development/api-conventions.md)).
