import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

import { MediaReferenceEntity } from "../../media/entities/media-reference.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { BlogCommentEntity } from "./blog-comment.entity";
import { BlogPostTagEntity } from "./blog-post-tag.entity";

export const blogPostStatuses = ["draft", "published", "unpublished"] as const;
export type BlogPostStatus = (typeof blogPostStatuses)[number];

@Entity("blog_posts")
@Index("uq_blog_posts_slug", ["slug"], { unique: true })
@Index("idx_blog_posts_status_published_at", ["status", "publishedAt"])
@Index("idx_blog_posts_author", ["authorUserId"])
export class BlogPostEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "author_user_id", length: 36 })
  authorUserId!: string;

  @Column("varchar", { length: 255 })
  title!: string;

  @Column("varchar", { length: 255 })
  slug!: string;

  @Column("varchar", { name: "summary", length: 512, nullable: true })
  summary!: string | null;

  @Column("mediumtext")
  body!: string;

  @Column("varchar", { length: 32, default: "draft" })
  status!: BlogPostStatus;

  @Column("tinyint", { name: "is_featured", width: 1, default: 0 })
  isFeatured!: boolean;

  @Column("tinyint", { name: "comments_locked", width: 1, default: 0 })
  commentsLocked!: boolean;

  @Column("char", { name: "featured_image_id", length: 36, nullable: true })
  featuredImageId!: string | null;

  @Column("datetime", { name: "published_at", precision: 3, nullable: true })
  publishedAt!: Date | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "author_user_id" })
  author!: UserEntity;

  @ManyToOne(() => MediaReferenceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "featured_image_id" })
  featuredImage!: MediaReferenceEntity | null;

  @OneToMany(() => BlogPostTagEntity, (tag) => tag.post)
  postTags!: BlogPostTagEntity[];

  @OneToMany(() => BlogCommentEntity, (comment) => comment.post)
  comments!: BlogCommentEntity[];
}
