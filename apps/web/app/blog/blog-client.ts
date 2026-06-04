/**
 * Blog API client helpers.
 *
 * Public routes (listPublishedPosts, getPublishedPost, listComments) need no
 * session cookie.
 * Member comment routes (createComment) require any authenticated session.
 * Admin routes (adminListAllPosts, adminCreate/Update/Delete/Publish, etc.)
 * require an active session and the admin global role on the server side.
 * Moderation/lock routes (moderationListComments, moderateCommentStatus,
 * deleteComment, adminLockComments, adminUnlockComments) require the moderator
 * or admin global role.
 * Session cookies are forwarded automatically via credentials:include on all
 * authenticated routes.
 */

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

export interface BlogPostSummary {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: string;
  isFeatured: boolean;
  publishedAt: string | null;
  featuredImageId: string | null;
  tags: string[];
  createdAt: string;
}

export interface BlogPostDetail extends BlogPostSummary {
  body: string;
  authorUserId: string;
  commentsLocked: boolean;
  updatedAt: string;
}

export interface CreateBlogPostInput {
  title: string;
  slug: string;
  body: string;
  summary?: string | null;
  featuredImageId?: string | null;
  isFeatured?: boolean;
  tags?: string[];
}

export interface UpdateBlogPostInput {
  title?: string;
  slug?: string;
  body?: string;
  summary?: string | null;
  featuredImageId?: string | null;
  isFeatured?: boolean;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

export async function listPublishedPosts(): Promise<BlogPostSummary[]> {
  const response = await fetch(`${apiBase}/blog`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Failed to load blog posts.");
  }
  const data = (await response.json()) as { posts: BlogPostSummary[] };
  return data.posts;
}

export async function getPublishedPost(slug: string): Promise<BlogPostDetail | null> {
  const response = await fetch(`${apiBase}/blog/${encodeURIComponent(slug)}`, {
    cache: "no-store"
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to load blog post.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

// ---------------------------------------------------------------------------
// Admin routes — require active session cookie
// ---------------------------------------------------------------------------

export async function adminListAllPosts(): Promise<BlogPostDetail[]> {
  const response = await fetch(`${apiBase}/blog/admin/posts`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to load blog posts.");
  }
  const data = (await response.json()) as { posts: BlogPostDetail[] };
  return data.posts;
}

export async function adminGetPost(id: string): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(id)}`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to load blog post.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

export async function adminCreatePost(input: CreateBlogPostInput): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to create blog post.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

export async function adminUpdatePost(id: string, input: UpdateBlogPostInput): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to update blog post.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

export async function adminPublishPost(id: string): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to publish blog post.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

export async function adminUnpublishPost(id: string): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(id)}/unpublish`, {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to unpublish blog post.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

export async function adminPublishAt(id: string, publishedAt: string): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(id)}/publish-at`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publishedAt })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to schedule blog post.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

export async function adminToggleFeatured(id: string): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(id)}/toggle-featured`, {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to toggle featured state.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

export async function adminDeletePost(id: string): Promise<void> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to delete blog post.");
  }
}

// ---------------------------------------------------------------------------
// Comment types
// ---------------------------------------------------------------------------

export interface BlogCommentDetail {
  id: string;
  postId: string;
  parentId: string | null;
  authorUserId: string;
  body: string;
  status: string;
  mediaReferenceId: string | null;
  moderatedByUserId: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Visible replies — populated only on top-level comments from the public list route. */
  replies?: BlogCommentDetail[];
}

export type BlogCommentStatus = "visible" | "hidden" | "removed";

// ---------------------------------------------------------------------------
// Public comment routes — no credentials required
// ---------------------------------------------------------------------------

export async function listComments(postId: string): Promise<{ comments: BlogCommentDetail[]; commentsLocked: boolean }> {
  const response = await fetch(`${apiBase}/blog/${encodeURIComponent(postId)}/comments`, {
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to load comments.");
  }
  const data = (await response.json()) as { comments: BlogCommentDetail[]; commentsLocked: boolean };
  return { comments: data.comments, commentsLocked: data.commentsLocked ?? false };
}

// ---------------------------------------------------------------------------
// Member comment creation — require active session cookie
// ---------------------------------------------------------------------------

export async function createComment(
  postId: string,
  body: string,
  imageId?: string | null,
  parentId?: string | null
): Promise<BlogCommentDetail> {
  const response = await fetch(`${apiBase}/blog/${encodeURIComponent(postId)}/comments`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body, imageId: imageId ?? null, parentId: parentId ?? null })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to create comment.");
  }
  const data = (await response.json()) as { comment: BlogCommentDetail };
  return data.comment;
}

export async function adminLockComments(postId: string): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(postId)}/lock-comments`, {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to lock comments.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

export async function adminUnlockComments(postId: string): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(postId)}/unlock-comments`, {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to unlock comments.");
  }
  const data = (await response.json()) as { post: BlogPostDetail };
  return data.post;
}

// ---------------------------------------------------------------------------
// Moderation routes — require active session + moderator/admin role
// ---------------------------------------------------------------------------

export async function moderationListComments(postId: string): Promise<BlogCommentDetail[]> {
  const response = await fetch(`${apiBase}/blog/moderation/comments/${encodeURIComponent(postId)}`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to load comments for moderation.");
  }
  const data = (await response.json()) as { comments: BlogCommentDetail[] };
  return data.comments;
}

export async function moderateCommentStatus(
  commentId: string,
  status: BlogCommentStatus
): Promise<BlogCommentDetail> {
  const response = await fetch(
    `${apiBase}/blog/moderation/comments/${encodeURIComponent(commentId)}/status`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to update comment status.");
  }
  const data = (await response.json()) as { comment: BlogCommentDetail };
  return data.comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  const response = await fetch(
    `${apiBase}/blog/moderation/comments/${encodeURIComponent(commentId)}`,
    {
      method: "DELETE",
      credentials: "include"
    }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to delete comment.");
  }
}
