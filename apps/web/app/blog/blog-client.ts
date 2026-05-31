/**
 * Blog API client helpers.
 *
 * Public routes (listPublished, getPublishedBySlug) need no session cookie.
 * Admin routes require an active session and the admin global role on the
 * server side — the cookie is forwarded automatically via credentials:include.
 */

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

export interface BlogPostSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  featuredImageId: string | null;
  tags: string[];
  createdAt: string;
}

export interface BlogPostDetail extends BlogPostSummary {
  body: string;
  authorUserId: string;
  updatedAt: string;
}

export interface CreateBlogPostInput {
  title: string;
  slug: string;
  body: string;
  featuredImageId?: string | null;
  tags?: string[];
}

export interface UpdateBlogPostInput {
  title?: string;
  slug?: string;
  body?: string;
  featuredImageId?: string | null;
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

export async function adminSchedulePost(id: string, scheduledAt: string): Promise<BlogPostDetail> {
  const response = await fetch(`${apiBase}/blog/admin/posts/${encodeURIComponent(id)}/schedule`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scheduledAt })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to schedule blog post.");
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
  authorUserId: string;
  body: string;
  status: string;
  moderatedByUserId: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BlogCommentStatus = "visible" | "hidden" | "removed";

// ---------------------------------------------------------------------------
// Public comment routes — no credentials required
// ---------------------------------------------------------------------------

export async function listComments(postId: string): Promise<BlogCommentDetail[]> {
  const response = await fetch(`${apiBase}/blog/${encodeURIComponent(postId)}/comments`, {
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to load comments.");
  }
  const data = (await response.json()) as { comments: BlogCommentDetail[] };
  return data.comments;
}

// ---------------------------------------------------------------------------
// Member comment creation — require active session cookie
// ---------------------------------------------------------------------------

export async function createComment(
  postId: string,
  body: string,
  imageId?: string | null
): Promise<BlogCommentDetail> {
  const response = await fetch(`${apiBase}/blog/${encodeURIComponent(postId)}/comments`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body, imageId: imageId ?? null })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to create comment.");
  }
  const data = (await response.json()) as { comment: BlogCommentDetail };
  return data.comment;
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
