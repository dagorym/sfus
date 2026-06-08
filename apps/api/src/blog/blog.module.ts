import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { ThrottleModule } from "../common/throttle/throttle.module";
import type { ApplicationEnvironment } from "../config/environment";
import { MediaReferenceEntity } from "../media/entities/media-reference.entity";
import { UsersModule } from "../users/users.module";
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
        TypeOrmModule.forFeature([BlogPostEntity, BlogPostTagEntity, BlogCommentEntity, MediaReferenceEntity]),
        AuthorizationModule,
        AuthModule.register(environment),
        ThrottleModule.register(environment),
        UsersModule
      ],
      controllers: [BlogController],
      providers: [BlogService],
      exports: [BlogService]
    };
  }
}
