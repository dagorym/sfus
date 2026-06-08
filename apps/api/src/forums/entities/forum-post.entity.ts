import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";
import { ForumTopicEntity } from "./forum-topic.entity";

@Entity("forum_posts")
@Index("idx_forum_posts_topic_created", ["topicId", "createdAt"])
@Index("idx_forum_posts_topic_parent", ["topicId", "parentId"])
@Index("idx_forum_posts_author", ["authorUserId"])
export class ForumPostEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "topic_id", length: 36 })
  topicId!: string;

  /**
   * parent_id: one-level threading — a reply's parent must be a top-level post on the same topic.
   * NULL means this is a top-level post in the topic.
   */
  @Column("char", { name: "parent_id", length: 36, nullable: true })
  parentId!: string | null;

  @Column("char", { name: "author_user_id", length: 36 })
  authorUserId!: string;

  @Column("mediumtext")
  body!: string;

  /**
   * quoted_post_id: optional reference to a quoted post within the same topic.
   * Used by the quote-a-post feature (ST5). No FK — posts may be deleted.
   */
  @Column("char", { name: "quoted_post_id", length: 36, nullable: true })
  quotedPostId!: string | null;

  /**
   * deleted_at: soft-delete support for posts.
   * NULL means the post is active; a non-null value means it has been soft-deleted.
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

  @ManyToOne(() => ForumTopicEntity, (topic) => topic.posts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "topic_id" })
  topic!: ForumTopicEntity;

  @ManyToOne(() => ForumPostEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "parent_id" })
  parent!: ForumPostEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "author_user_id" })
  author!: UserEntity;
}
