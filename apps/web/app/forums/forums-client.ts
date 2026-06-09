/**
 * Forums API client helpers.
 *
 * Public routes (listCategories, getBoard, listTopics, listPosts) require no session.
 * Member write routes (createTopic, createPost) require an active session cookie.
 * Moderation routes (pinTopic, unpinTopic, lockTopic, unlockTopic, moveTopic)
 * require an active session with the moderator or admin global role.
 * Session cookies are forwarded automatically via credentials:include on all
 * authenticated routes.
 *
 * All user-authored content is returned as raw Markdown strings; rendering is
 * the caller's responsibility (use MarkdownRenderer, never dangerouslySetInnerHTML
 * on raw input).
 */

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PublicAuthorShape {
  username: string;
  displayName: string | null;
}

export interface PublicBoardShape {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCategoryShape {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  boards: PublicBoardShape[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicTopicShape {
  id: string;
  title: string;
  slug: string;
  body: string;
  isPinned: boolean;
  /** isLocked is NOT returned by the API in the public topic shape (stripped server-side); typed optional so the field is absent/undefined at runtime. */
  isLocked?: boolean;
  replyCount: number;
  lastPostAt: string | null;
  author: PublicAuthorShape;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTopicsShape {
  topics: PublicTopicShape[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicPostShape {
  id: string;
  body: string;
  parentId: string | null;
  quotedPostId: string | null;
  author: PublicAuthorShape;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedPostsShape {
  posts: PublicPostShape[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ModeratedTopicShape {
  id: string;
  title: string;
  slug: string;
  isPinned: boolean;
  isLocked: boolean;
  boardId: string;
  lockedByUserId: string | null;
  lockedAt: string | null;
  movedByUserId: string | null;
  movedAt: string | null;
  replyCount: number;
  lastPostAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSuggestItem {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// ---------------------------------------------------------------------------
// Public read routes — no credentials required
// ---------------------------------------------------------------------------

/**
 * List all forum categories with their publicly-readable site boards.
 * Only site-scoped boards with public visibility are included.
 */
export async function listCategories(): Promise<PublicCategoryShape[]> {
  const response = await fetch(`${apiBase}/forums/categories`, {
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load forum categories.");
  }
  const data = (await response.json()) as { categories: PublicCategoryShape[] };
  return data.categories;
}

/**
 * Fetch a single publicly-readable site board by id.
 * Returns null when the board is not found or not publicly accessible (uniform 404).
 */
export async function getBoardById(id: string): Promise<PublicBoardShape | null> {
  const response = await fetch(`${apiBase}/forums/boards/${encodeURIComponent(id)}`, {
    cache: "no-store"
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load forum board.");
  }
  const data = (await response.json()) as { board: PublicBoardShape };
  return data.board;
}

/**
 * List topics in a publicly-readable board, paginated.
 * Pinned topics sort first, then by most-recently active.
 */
export async function listTopics(
  boardId: string,
  opts?: { page?: number; pageSize?: number }
): Promise<PaginatedTopicsShape> {
  const params = new URLSearchParams();
  if (opts?.page !== undefined) params.set("page", String(opts.page));
  if (opts?.pageSize !== undefined) params.set("pageSize", String(opts.pageSize));
  const qs = params.toString();
  const url = `${apiBase}/forums/boards/${encodeURIComponent(boardId)}/topics${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load topics.");
  }
  return (await response.json()) as PaginatedTopicsShape;
}

/**
 * List posts in a topic, paginated, oldest-first.
 */
export async function listPosts(
  topicId: string,
  opts?: { page?: number; pageSize?: number }
): Promise<PaginatedPostsShape> {
  const params = new URLSearchParams();
  if (opts?.page !== undefined) params.set("page", String(opts.page));
  if (opts?.pageSize !== undefined) params.set("pageSize", String(opts.pageSize));
  const qs = params.toString();
  const url = `${apiBase}/forums/topics/${encodeURIComponent(topicId)}/posts${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load posts.");
  }
  return (await response.json()) as PaginatedPostsShape;
}

// ---------------------------------------------------------------------------
// Member write routes — require active session cookie
// ---------------------------------------------------------------------------

/**
 * Create a new topic in a readable board (member-authenticated).
 */
export async function createTopic(
  boardId: string,
  title: string,
  body: string
): Promise<PublicTopicShape> {
  const response = await fetch(`${apiBase}/forums/boards/${encodeURIComponent(boardId)}/topics`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, body })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to create topic.");
  }
  const data = (await response.json()) as { topic: PublicTopicShape };
  return data.topic;
}

/**
 * Create a post (reply) in a readable, unlocked topic (member-authenticated).
 */
export async function createPost(
  topicId: string,
  body: string,
  parentId?: string | null,
  quotedPostId?: string | null
): Promise<PublicPostShape> {
  const response = await fetch(`${apiBase}/forums/topics/${encodeURIComponent(topicId)}/posts`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body, parentId: parentId ?? null, quotedPostId: quotedPostId ?? null })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to create post.");
  }
  const data = (await response.json()) as { post: PublicPostShape };
  return data.post;
}

// ---------------------------------------------------------------------------
// Moderation routes — require active session + moderator/admin role
// ---------------------------------------------------------------------------

/** Pin a topic (moderator/admin). */
export async function pinTopic(topicId: string): Promise<ModeratedTopicShape> {
  const response = await fetch(`${apiBase}/forums/moderation/topics/${encodeURIComponent(topicId)}/pin`, {
    method: "PATCH",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to pin topic.");
  }
  const data = (await response.json()) as { topic: ModeratedTopicShape };
  return data.topic;
}

/** Unpin a topic (moderator/admin). */
export async function unpinTopic(topicId: string): Promise<ModeratedTopicShape> {
  const response = await fetch(`${apiBase}/forums/moderation/topics/${encodeURIComponent(topicId)}/unpin`, {
    method: "PATCH",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to unpin topic.");
  }
  const data = (await response.json()) as { topic: ModeratedTopicShape };
  return data.topic;
}

/** Lock a topic (moderator/admin). */
export async function lockTopic(topicId: string): Promise<ModeratedTopicShape> {
  const response = await fetch(`${apiBase}/forums/moderation/topics/${encodeURIComponent(topicId)}/lock`, {
    method: "PATCH",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to lock topic.");
  }
  const data = (await response.json()) as { topic: ModeratedTopicShape };
  return data.topic;
}

/** Unlock a topic (moderator/admin). */
export async function unlockTopic(topicId: string): Promise<ModeratedTopicShape> {
  const response = await fetch(`${apiBase}/forums/moderation/topics/${encodeURIComponent(topicId)}/unlock`, {
    method: "PATCH",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to unlock topic.");
  }
  const data = (await response.json()) as { topic: ModeratedTopicShape };
  return data.topic;
}

/** Move a topic to a different board (moderator/admin). */
export async function moveTopic(
  topicId: string,
  destinationBoardId: string
): Promise<ModeratedTopicShape> {
  const response = await fetch(`${apiBase}/forums/moderation/topics/${encodeURIComponent(topicId)}/move`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ destinationBoardId })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to move topic.");
  }
  const data = (await response.json()) as { topic: ModeratedTopicShape };
  return data.topic;
}

// ---------------------------------------------------------------------------
// User suggest — session-gated, throttled
// ---------------------------------------------------------------------------

/**
 * Prefix-suggest active usernames (session-gated, throttled).
 * Returns at most 10 results with only username/displayName/avatarUrl.
 */
export async function suggestUsers(q: string): Promise<UserSuggestItem[]> {
  const response = await fetch(`${apiBase}/users/suggest?q=${encodeURIComponent(q)}`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    // Fail silently — autocomplete degradation is acceptable
    return [];
  }
  const data = (await response.json()) as { users: UserSuggestItem[] };
  return data.users;
}
