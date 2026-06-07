# Content Management Guide

How-to walkthroughs for site admins, moderators, and members using the running site:
publishing blog posts, comments and moderation, standalone pages, and navigation.

URLs below use the local default `http://localhost:3000`; substitute the deployed host in
production. API contract details live in the feature docs: [blog](../features/blog.md),
[pages](../features/pages.md), [navigation](../features/navigation.md).

## Blog

### Reading (guests)

- `/blog` — all published posts; pinned/featured posts first.
- `/blog/<slug>` — a single published post ("Post not found" for drafts, future-scheduled
  posts, or missing slugs).

### Publishing a post (admin)

1. Sign in at `/login` with an account whose global role is `admin`.
2. Go to `/admin/blog` and click **New post**.
3. Fill in Title, Slug (optional — leave blank to derive from the title), optional Summary,
   Tags (comma-separated), optional Featured Image (upload widget), and Body (Markdown; the
   server rejects unsafe HTML/script content).
4. Click **Create draft** — the post is created as a draft and the editor opens.
5. In the editor:
   - **Publish now** — live immediately on `/blog`.
   - **Schedule** — supply a future date/time; the post stays hidden until then and goes
     live automatically (no manual step needed).
   - **Pin/Unpin** — pinned posts surface first in the public listing.
6. **Unpublish** retracts a published or scheduled post back to draft.

### Comments

- **Reading** — public on every published post; the list loads below the post body.
- **Posting (members)** — sign in, open a published post, write in the **Leave a comment**
  form (Markdown). Optionally attach an image: enter alt text, upload, and the image is
  inserted into the body automatically. Replies are available on top-level comments
  (one level deep).
- **Locking (moderator/admin)** — a locked thread shows a notice and accepts no new comments.
  Lock/unlock via the admin API (`lock-comments` / `unlock-comments` — see
  [blog](../features/blog.md)).
- **Moderating (moderator/admin)** — set a comment's status to `visible`, `hidden`, or
  `removed`, or delete it permanently, via the moderation API routes. Only `visible`
  comments appear publicly.

## Standalone pages

Admin-managed site pages (About, Rules, Contact, …) with revision history.

### Reading (guests)

Published pages are reachable at both `/<slug>` and `/pages/<slug>`. Draft and unpublished
pages show a "not published" message.

### Managing pages (admin)

1. Sign in and go to `/admin/pages`; click **New page**.
2. Fill in Title, Slug (lowercase hyphenated; some slugs like `admin`, `blog`, `login` are
   reserved and rejected), optional Summary and Featured Image, and Body (Markdown).
3. **Create draft**, then **Publish now** in the editor. **Unpublish** takes a page offline.

### Revision history & restore

Every save creates a new revision. The **Revision History** panel on the edit page lists all
revisions with author and timestamp; **Preview** renders a revision inline, **Restore**
creates a new revision from a prior one (history is never overwritten). An optional Change
Note can be recorded with each save.

## Navigation

Site navigation is database-driven; changes appear on the next page load without a deploy.

### Managing items (admin)

1. Sign in and go to `/admin/navigation`.
2. **Add Navigation Item** — Label, URL (e.g. `/blog` or an external URL), Link Type
   (Internal/External), Visibility (Public / Authenticated only / Admin only), Sort Order
   (lower first), optional Parent (top-level items only; one level of nesting).
3. **Show / Hide** toggles an item without deleting it; **↑ / ↓** reorders adjacent
   siblings; **Delete** removes an item and (automatically) its children.

Items linking to unpublished blog posts or pages are automatically hidden from guests and
non-admin members until the target is published; admins always see every item
(see [navigation](../features/navigation.md)).
