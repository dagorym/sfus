import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

import { ForumCategoryEntity } from "./forum-category.entity";
import { ForumTopicEntity } from "./forum-topic.entity";

/**
 * Scope type for a forum board.
 * 'site'    — a standard site-wide board (the only kind active in M4).
 * 'project' — a project-scoped board (forward-scaffolding; projects arrive at M7/M8;
 *              project_id will reference the projects table when that module lands).
 */
export const forumBoardScopeTypes = ["site", "project"] as const;
export type ForumBoardScopeType = (typeof forumBoardScopeTypes)[number];

/**
 * Visibility vocabulary reused from the existing authorization contract.
 * See docs/features/authorization.md.
 */
export const forumBoardVisibilities = [
  "public",
  "unlisted",
  "members",
  "project-only",
  "private"
] as const;
export type ForumBoardVisibility = (typeof forumBoardVisibilities)[number];

@Entity("forum_boards")
@Index("uq_forum_boards_slug", ["slug"], { unique: true })
@Index("idx_forum_boards_category_sort", ["categoryId", "sortOrder"])
@Index("idx_forum_boards_scope_visibility", ["scopeType", "visibility"])
export class ForumBoardEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "category_id", length: 36 })
  categoryId!: string;

  @Column("varchar", { length: 128 })
  name!: string;

  @Column("varchar", { length: 255, nullable: true })
  description!: string | null;

  @Column("varchar", { length: 128 })
  slug!: string;

  /**
   * scope_type: 'site' (default) or 'project'.
   * Project-scoped boards are forward-scaffolded for M7/M8; in M4 only site boards are surfaced.
   */
  @Column("varchar", { name: "scope_type", length: 16, default: "site" })
  scopeType!: ForumBoardScopeType;

  /**
   * project_id: nullable — forward-scaffolding for M7/M8 project integration.
   * No FK constraint yet; projects table does not exist in M4.
   * When projects land, add: FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE.
   */
  @Column("char", { name: "project_id", length: 36, nullable: true })
  projectId!: string | null;

  /**
   * visibility: reuses the site-wide visibility vocabulary from AuthorizationService.evaluate().
   * Site boards readable by guests use 'public'; member-only use 'members'; etc.
   */
  @Column("varchar", { length: 32, default: "public" })
  visibility!: ForumBoardVisibility;

  @Column("smallint", { name: "sort_order", unsigned: true, default: 0 })
  sortOrder!: number;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @ManyToOne(() => ForumCategoryEntity, (category) => category.boards, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "category_id" })
  category!: ForumCategoryEntity;

  @OneToMany(() => ForumTopicEntity, (topic) => topic.board)
  topics!: ForumTopicEntity[];
}
