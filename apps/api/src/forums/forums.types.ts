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
