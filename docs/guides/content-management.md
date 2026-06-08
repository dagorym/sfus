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

## Forums

The forums subsystem supports moderator/admin controls for pinning, locking, and moving topics.

### Browsing forums (guests and members)

- `/forums` — category/board index listing all public site boards.
- `/forums/<boardSlug>` — board view with paginated topics; pinned topics appear first.
- `/forums/<boardSlug>/<topicSlug>` — topic view with paginated posts.
- Members can create topics (`+ New Topic` link) and post replies; guests see a `Sign in` link that preserves the destination as `?next=`.

### Moderation from the web UI (moderator/admin)

Moderators and admins see a moderation bar on every topic page at `/forums/<boardSlug>/<topicSlug>`. Sign in with a `moderator` or `admin` account and navigate to the topic to use these controls.

**Pin / Unpin** — click **Pin** to make the topic appear first in the board's topic list; click **Unpin** to restore normal sort order.

**Lock / Unlock** — click **Lock** to prevent new replies (locked topics show a "This topic is locked" notice; the reply form is hidden for all visitors). Click **Unlock** to re-enable replies.

**Move** — click **Move…** to expand the move form, enter the destination board UUID, and click **Confirm move**. The destination must be a publicly-readable site board; moves into restricted or project-scoped boards are rejected by the API.

These buttons call the ST6 moderation API (`/api/forums/moderation/topics/:topicId/...`), which enforces `moderator`/`admin` access independently. The buttons are hidden for regular member sessions (client-side UX only; the API is the enforcement boundary).

Full API contract details for pin/lock/move live in [features/forums.md](../features/forums.md#moderation-st6).

### Pinning and unpinning topics — API (moderator/admin)

Pinned topics sort before all others in the board's topic list.

- **Pin:** `PATCH /api/forums/moderation/topics/:topicId/pin`
- **Unpin:** `PATCH /api/forums/moderation/topics/:topicId/unpin`

Both require an active session with the `moderator` or `admin` global role. Returns the updated `ModeratedTopicShape`.

### Locking and unlocking topics — API (moderator/admin)

A locked topic blocks new posts from non-privileged users (they receive `403`).

- **Lock:** `PATCH /api/forums/moderation/topics/:topicId/lock` — records `lockedByUserId` and `lockedAt`.
- **Unlock:** `PATCH /api/forums/moderation/topics/:topicId/unlock` — clears the lock audit fields.

Both require an active session with the `moderator` or `admin` global role.

### Moving topics — API (moderator/admin)

`PATCH /api/forums/moderation/topics/:topicId/move`

Body: `{ "destinationBoardId": "<uuid>" }`

Requires an active session with the `moderator` or `admin` global role. The destination board must be a publicly-readable site board; moves into project-scoped or restricted-visibility boards are rejected with `404`. A malformed `destinationBoardId` returns `400`. Records `movedByUserId` and `movedAt` on the topic.

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
