import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import type { ApplicationEnvironment } from "../config/environment";
import { BlogCommentEntity } from "./entities/blog-comment.entity";
import { BlogPostEntity } from "./entities/blog-post.entity";
import { BlogPostTagEntity } from "./entities/blog-post-tag.entity";
import { BlogController } from "./blog.controller";
import { BlogService } from "./blog.service";

@Module({})
export class BlogModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: BlogModule,
      imports: [
        TypeOrmModule.forFeature([BlogPostEntity, BlogPostTagEntity, BlogCommentEntity]),
        AuthorizationModule,
        AuthModule.register(environment)
      ],
      controllers: [BlogController],
      providers: [BlogService],
      exports: [BlogService]
    };
  }
}
