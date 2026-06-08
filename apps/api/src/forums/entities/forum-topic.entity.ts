import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";
import { ForumBoardEntity } from "./forum-board.entity";
import { ForumPostEntity } from "./forum-post.entity";

@Entity("forum_topics")
@Index("uq_forum_topics_board_slug", ["boardId", "slug"], { unique: true })
@Index("idx_forum_topics_board_pinned_last_post", ["boardId", "isPinned", "lastPostAt"])
@Index("idx_forum_topics_author", ["authorUserId"])
export class ForumTopicEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "board_id", length: 36 })
  boardId!: string;

  @Column("char", { name: "author_user_id", length: 36 })
  authorUserId!: string;

  @Column("varchar", { length: 255 })
  title!: string;

  @Column("varchar", { length: 255 })
  slug!: string;

  @Column("mediumtext")
  body!: string;

  @Column("tinyint", { name: "is_pinned", width: 1, default: 0 })
  isPinned!: boolean;

  @Column("tinyint", { name: "is_locked", width: 1, default: 0 })
  isLocked!: boolean;

  @Column("int", { name: "reply_count", unsigned: true, default: 0 })
  replyCount!: number;

  @Column("datetime", { name: "last_post_at", precision: 3, nullable: true })
  lastPostAt!: Date | null;

  @Column("char", { name: "moved_by_user_id", length: 36, nullable: true })
  movedByUserId!: string | null;

  @Column("datetime", { name: "moved_at", precision: 3, nullable: true })
  movedAt!: Date | null;

  @Column("char", { name: "locked_by_user_id", length: 36, nullable: true })
  lockedByUserId!: string | null;

  @Column("datetime", { name: "locked_at", precision: 3, nullable: true })
  lockedAt!: Date | null;

  /**
   * deleted_at: soft-delete support for topics.
   * NULL means the topic is active; a non-null value means it has been soft-deleted.
   */
  @Column("datetime", { name: "deleted_at", precision: 3, nullable: true })
  deletedAt!: Date | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @ManyToOne(() => ForumBoardEntity, (board) => board.topics, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "board_id" })
  board!: ForumBoardEntity;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "author_user_id" })
  author!: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "moved_by_user_id" })
  movedByUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "locked_by_user_id" })
  lockedByUser!: UserEntity | null;

  @OneToMany(() => ForumPostEntity, (post) => post.topic)
  posts!: ForumPostEntity[];
}
