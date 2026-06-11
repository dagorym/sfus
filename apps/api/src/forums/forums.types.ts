import { forumBoardScopeTypes, forumBoardVisibilities } from "./entities/forum-board.entity";
import type { ForumBoardScopeType, ForumBoardVisibility } from "./entities/forum-board.entity";

// Re-export the vocabularies so controller and service don't reach into the entity.
export { forumBoardScopeTypes, forumBoardVisibilities };
export type { ForumBoardScopeType, ForumBoardVisibility };

// ---------------------------------------------------------------------------
// Input length limits for category and board fields.
// ---------------------------------------------------------------------------

/** Maximum allowed length for a forum category or board description. */
export const FORUM_DESCRIPTION_MAX_LENGTH = 512;

/** Maximum allowed length for a forum category or board name. */
export const FORUM_NAME_MAX_LENGTH = 128;

// ---------------------------------------------------------------------------
// Public read shapes (ST3) — safe, server-mapped DTOs exposed to unauthenticated callers.
// ---------------------------------------------------------------------------

/**
 * The most-recent-activity stub included on the public board shape.
 * at: ISO-8601 string of the latest NON-DELETED reply's createdAt when a reply exists
 *     (derived from the posts table so a soft-deleted latest reply cannot leave a stale
 *     date), or the opening post's createdAt when no non-deleted replies exist.
 * author: the author of that activity post.
 */
export interface BoardLastPostShape {
  at: string;
  author: {
    username: string;
    displayName: string | null;
  };
}

/**
 * Public-safe board shape returned from the main forum listing and board detail.
 * Internal-only fields (projectId, categoryId raw FK, etc.) are omitted.
 */
export interface PublicBoardShape {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  visibility: ForumBoardVisibility;
  topicCount: number;
  postCount: number;
  lastPost: BoardLastPostShape | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Public-safe category shape returned from the main forum listing.
 * Only includes site-scoped, publicly-readable boards.
 */
export interface PublicCategoryShape {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  boards: PublicBoardShape[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Category DTOs
// ---------------------------------------------------------------------------

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string | null;
  sortOrder?: number;
}

export interface ReorderCategoryInput {
  /** Ordered list of category ids; all existing ids must be present. */
  orderedIds: string[];
}

// ---------------------------------------------------------------------------
// Board DTOs
// ---------------------------------------------------------------------------

export interface CreateBoardInput {
  categoryId: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
  /** Defaults to 'site' when omitted. */
  scopeType?: ForumBoardScopeType;
  visibility?: ForumBoardVisibility;
  /** Forward-scaffolding for project-scoped boards (M7/M8). Nullable. */
  projectId?: string | null;
}

export interface UpdateBoardInput {
  categoryId?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  sortOrder?: number;
  scopeType?: ForumBoardScopeType;
  visibility?: ForumBoardVisibility;
  projectId?: string | null;
}

export interface ReorderBoardInput {
  /** Ordered list of board ids within the category; all board ids in the category must be present. */
  orderedIds: string[];
}

// ---------------------------------------------------------------------------
// Topic DTOs (ST4) — public read shapes and member create input.
// ---------------------------------------------------------------------------

/**
 * Public-safe author shape included on topic responses.
 * Omits author id, email, globalRole, status, and all other internal fields.
 */
export interface PublicAuthorShape {
  username: string;
  displayName: string | null;
}

/**
 * Per-topic "last activity" descriptor returned by resolveTopicLastActivity.
 *
 * author     — the most recent non-deleted reply's author when isReply is true,
 *              or the opening post's author (from the openingAuthors map) when isReply is false.
 * at         — when isReply is true: the createdAt of the most recent NON-DELETED reply,
 *              resolved directly from the posts table so a soft-deleted latest reply cannot
 *              produce a stale last-activity date. Null when the fallback is the opening post
 *              (isReply=false); callers needing the opening createdAt should read it from the
 *              topic entity directly.
 * isReply    — true when the activity is a real non-deleted reply; false when the
 *              activity falls back to the opening post (no non-deleted replies exist).
 *
 * Intended for use by ST3 board-level aggregation, which needs author+timestamp
 * across all topics in a board regardless of whether they have replies.
 * ST2's listTopics derives lastPostAuthor = isReply ? author : null from this.
 */
export interface TopicLastActivity {
  author: PublicAuthorShape;
  at: Date | null;
  isReply: boolean;
}

/**
 * Public-safe topic shape returned from topic list and topic detail.
 * Omits authorUserId (internal FK), boardId (implicit from URL), isLocked,
 * movedByUserId, movedAt, lockedByUserId, lockedAt, deletedAt.
 *
 * lastPostAuthor: the author of the most recent non-deleted reply to this topic,
 * or null when the topic has no non-deleted replies. Resolved at query time.
 */
export interface PublicTopicShape {
  id: string;
  title: string;
  slug: string;
  body: string;
  isPinned: boolean;
  replyCount: number;
  lastPostAt: Date | null;
  author: PublicAuthorShape;
  lastPostAuthor: PublicAuthorShape | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Paginated topic list response.
 * Order: isPinned DESC, then lastPostAt DESC (nulls last), then createdAt DESC.
 */
export interface PaginatedTopicsShape {
  topics: PublicTopicShape[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Input for creating a new forum topic (member-only).
 */
export interface CreateTopicInput {
  boardId: string;
  title: string;
  body: string;
}

/**
 * Pagination query parameters for topic listing.
 */
export interface TopicListQuery {
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Post DTOs (ST5) — public read shapes and member create input.
// ---------------------------------------------------------------------------

/**
 * Public-safe post shape returned from the post list.
 * Omits authorUserId (internal FK), topicId (implicit from URL), parentId internal FK,
 * quotedPostId (rendered by web layer), deletedAt.
 * Exposes quotedPostId so the web layer can render quotes.
 */
export interface PublicPostShape {
  id: string;
  body: string;
  parentId: string | null;
  quotedPostId: string | null;
  author: PublicAuthorShape;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Paginated post list response.
 * Order: parentId IS NULL first (top-level), then createdAt ASC (oldest-first within threading).
 */
export interface PaginatedPostsShape {
  posts: PublicPostShape[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Input for creating a new forum post (reply) within a topic.
 * parentId: optional — if provided, must reference a top-level post in the same topic.
 * quotedPostId: optional — soft-reference to a quoted post (no FK enforcement).
 */
export interface CreatePostInput {
  topicId: string;
  body: string;
  parentId?: string | null;
  quotedPostId?: string | null;
}

/**
 * Pagination query parameters for post listing.
 */
export interface PostListQuery {
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Moderation DTOs (ST6) — returned only to moderators/admins.
// ---------------------------------------------------------------------------

/**
 * Moderation-enriched topic shape. Extends the public shape with state and
 * audit columns that are meaningful to moderators (isLocked, boardId, audit fields).
 * Omits author details (not needed for moderation responses).
 */
export interface ModeratedTopicShape {
  id: string;
  title: string;
  slug: string;
  isPinned: boolean;
  isLocked: boolean;
  boardId: string;
  lockedByUserId: string | null;
  lockedAt: Date | null;
  movedByUserId: string | null;
  movedAt: Date | null;
  replyCount: number;
  lastPostAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for moving a topic to a different board.
 * destinationBoardId must be a non-empty string (validated before persistence).
 */
export interface MoveTopicInput {
  destinationBoardId: string;
}

// ---------------------------------------------------------------------------
// Recent topics feed (CO5) — public-safe shape for the landing-page activity feed.
// ---------------------------------------------------------------------------

/**
 * Public-safe board stub included on recent-topic entries.
 * Provides only the board name and slug needed for linking — no internal fields.
 */
export interface RecentTopicBoardStub {
  name: string;
  slug: string;
}

/**
 * Public-safe shape for a single entry in the recent-topics feed.
 *
 * Omits all internal-only fields: authorUserId, boardId FK, isLocked, isPinned,
 * movedByUserId, movedAt, lockedByUserId, lockedAt, deletedAt, body, replyCount.
 * The board is represented as a minimal stub (name + slug) for linking only.
 * Author is represented as a minimal stub (username + displayName) — no email,
 * globalRole, id, or other PII.
 */
export interface RecentTopicShape {
  id: string;
  title: string;
  slug: string;
  board: RecentTopicBoardStub;
  author: PublicAuthorShape;
  lastPostAt: Date | null;
  createdAt: Date;
}

/**
 * Query parameters for the recent-topics feed.
 * limit: number of topics to return (default 5; hard-capped at 20).
 */
export interface RecentTopicsQuery {
  limit?: number;
}
