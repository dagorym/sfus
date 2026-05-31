import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthorizationModule } from "../authorization/authorization.module";
import { BlogCommentEntity } from "./entities/blog-comment.entity";
import { BlogPostEntity } from "./entities/blog-post.entity";
import { BlogPostTagEntity } from "./entities/blog-post-tag.entity";
import { BlogService } from "./blog.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([BlogPostEntity, BlogPostTagEntity, BlogCommentEntity]),
    AuthorizationModule
  ],
  providers: [BlogService],
  exports: [BlogService]
})
export class BlogModule {}
