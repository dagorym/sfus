import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

import { MediaReferenceEntity } from "../../media/entities/media-reference.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { BlogPostEntity } from "./blog-post.entity";

export const blogCommentStatuses = ["visible", "hidden", "removed"] as const;
export type BlogCommentStatus = (typeof blogCommentStatuses)[number];

@Entity("blog_comments")
@Index("idx_blog_comments_post_status", ["postId", "status"])
@Index("idx_blog_comments_author", ["authorUserId"])
@Index("idx_blog_comments_parent", ["parentId"])
export class BlogCommentEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "post_id", length: 36 })
  postId!: string;

  @Column("char", { name: "parent_id", length: 36, nullable: true })
  parentId!: string | null;

  @Column("char", { name: "author_user_id", length: 36 })
  authorUserId!: string;

  @Column("text")
  body!: string;

  @Column("varchar", { length: 32, default: "visible" })
  status!: BlogCommentStatus;

  @Column("char", { name: "media_reference_id", length: 36, nullable: true })
  mediaReferenceId!: string | null;

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

  @ManyToOne(() => BlogCommentEntity, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "parent_id" })
  parent!: BlogCommentEntity | null;

  @OneToMany(() => BlogCommentEntity, (reply) => reply.parent)
  replies!: BlogCommentEntity[];

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "author_user_id" })
  author!: UserEntity;

  @ManyToOne(() => MediaReferenceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "media_reference_id" })
  mediaReference!: MediaReferenceEntity | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "moderated_by_user_id" })
  moderatedByUser!: UserEntity | null;
}
