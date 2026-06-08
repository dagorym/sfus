import { forumBoardScopeTypes, forumBoardVisibilities } from "./entities/forum-board.entity";
import type { ForumBoardScopeType, ForumBoardVisibility } from "./entities/forum-board.entity";

// Re-export the vocabularies so controller and service don't reach into the entity.
export { forumBoardScopeTypes, forumBoardVisibilities };
export type { ForumBoardScopeType, ForumBoardVisibility };

// ---------------------------------------------------------------------------
// Public read shapes (ST3) — safe, server-mapped DTOs exposed to unauthenticated callers.
// ---------------------------------------------------------------------------

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
 * Public-safe topic shape returned from topic list and topic detail.
 * Omits authorUserId (internal FK), boardId (implicit from URL), isLocked,
 * movedByUserId, movedAt, lockedByUserId, lockedAt, deletedAt.
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
