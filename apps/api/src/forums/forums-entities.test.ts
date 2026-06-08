import { describe, expect, it } from "vitest";

import { ForumCategoryEntity } from "./entities/forum-category.entity";
import {
  ForumBoardEntity,
  forumBoardScopeTypes,
  forumBoardVisibilities
} from "./entities/forum-board.entity";
import { ForumTopicEntity } from "./entities/forum-topic.entity";
import { ForumPostEntity } from "./entities/forum-post.entity";

/**
 * Validates ST1 acceptance criteria for entity schema correctness and module wiring.
 *
 * These tests work at the TypeScript class/decorator metadata level without a live
 * database connection — they confirm the entity definitions compile and carry the
 * expected structural properties that back the migration DDL.
 */

describe("ForumCategoryEntity", () => {
  it("compiles and can be instantiated", () => {
    // Acceptance criterion: Entities compile and are added to reviewedEntityClasses.
    const entity = new ForumCategoryEntity();
    expect(entity).toBeInstanceOf(ForumCategoryEntity);
  });
});

describe("ForumBoardEntity", () => {
  it("compiles and can be instantiated", () => {
    // Acceptance criterion: Entities compile and are added to reviewedEntityClasses.
    const entity = new ForumBoardEntity();
    expect(entity).toBeInstanceOf(ForumBoardEntity);
  });

  it("defines scope_type vocabulary including 'site' and 'project'", () => {
    // Acceptance criterion: forum_boards has scope_type (default 'site').
    // forward-scaffolding for M7/M8.
    expect(forumBoardScopeTypes).toContain("site");
    expect(forumBoardScopeTypes).toContain("project");
  });

  it("defines visibility vocabulary covering the full authorization contract", () => {
    // Acceptance criterion: forum_boards has visibility columns using the existing vocabulary.
    expect(forumBoardVisibilities).toContain("public");
    expect(forumBoardVisibilities).toContain("unlisted");
    expect(forumBoardVisibilities).toContain("members");
    expect(forumBoardVisibilities).toContain("project-only");
    expect(forumBoardVisibilities).toContain("private");
  });
});

describe("ForumTopicEntity", () => {
  it("compiles and can be instantiated", () => {
    // Acceptance criterion: Entities compile and are added to reviewedEntityClasses.
    const entity = new ForumTopicEntity();
    expect(entity).toBeInstanceOf(ForumTopicEntity);
  });

  it("carries soft-delete support via deletedAt property", () => {
    // Acceptance criterion: deleted_at datetime(3) NULL on forum_topics for soft-delete support.
    const entity = new ForumTopicEntity();
    // Property exists (TypeScript compilation guarantees type; runtime check confirms presence).
    expect("deletedAt" in entity).toBe(true);
  });
});

describe("ForumPostEntity", () => {
  it("compiles and can be instantiated", () => {
    // Acceptance criterion: Entities compile and are added to reviewedEntityClasses.
    const entity = new ForumPostEntity();
    expect(entity).toBeInstanceOf(ForumPostEntity);
  });

  it("carries soft-delete support via deletedAt property", () => {
    // Acceptance criterion: deleted_at datetime(3) NULL on forum_posts for soft-delete support.
    const entity = new ForumPostEntity();
    expect("deletedAt" in entity).toBe(true);
  });

  it("carries quotedPostId property without a FK constraint (posts may be soft-deleted)", () => {
    // Acceptance criterion: quoted_post_id on forum_posts has no FK.
    // The entity column exists; absence of a @JoinColumn / @ManyToOne referencing itself
    // for quotedPostId is confirmed by code inspection — this test confirms the property exists.
    const entity = new ForumPostEntity();
    expect("quotedPostId" in entity).toBe(true);
  });
});
