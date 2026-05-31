import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";
import { BlogPostEntity } from "./blog-post.entity";

export const blogCommentStatuses = ["visible", "hidden", "removed"] as const;
export type BlogCommentStatus = (typeof blogCommentStatuses)[number];

@Entity("blog_comments")
@Index("idx_blog_comments_post_status", ["postId", "status"])
@Index("idx_blog_comments_author", ["authorUserId"])
export class BlogCommentEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "post_id", length: 36 })
  postId!: string;

  @Column("char", { name: "author_user_id", length: 36 })
  authorUserId!: string;

  @Column("text")
  body!: string;

  @Column("varchar", { length: 32, default: "visible" })
  status!: BlogCommentStatus;

  @Column("char", { name: "moderated_by_user_id", length: 36, nullable: true })
  moderatedByUserId!: string | null;

  @Column("datetime", { name: "moderated_at", precision: 3, nullable: true })
  moderatedAt!: Date | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @ManyToOne(() => BlogPostEntity, (post) => post.comments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "post_id" })
  post!: BlogPostEntity;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "author_user_id" })
  author!: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "moderated_by_user_id" })
  moderatedByUser!: UserEntity | null;
}
