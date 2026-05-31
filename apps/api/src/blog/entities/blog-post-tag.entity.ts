import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { BlogPostEntity } from "./blog-post.entity";

@Entity("blog_post_tags")
export class BlogPostTagEntity {
  @PrimaryColumn("char", { name: "post_id", length: 36 })
  postId!: string;

  @PrimaryColumn("varchar", { length: 64 })
  tag!: string;

  @ManyToOne(() => BlogPostEntity, (post) => post.postTags, { onDelete: "CASCADE" })
  @JoinColumn({ name: "post_id" })
  post!: BlogPostEntity;
}
