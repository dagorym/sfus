import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { BlogPostEntity } from "../blog/entities/blog-post.entity";
import type { ApplicationEnvironment } from "../config/environment";
import { StandalonePageEntity } from "../pages/entities/standalone-page.entity";
import { NavigationItemEntity } from "./entities/navigation-item.entity";
import { NavigationController } from "./navigation.controller";
import { NavigationService } from "./navigation.service";

@Module({})
export class NavigationModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: NavigationModule,
      imports: [
        TypeOrmModule.forFeature([NavigationItemEntity, BlogPostEntity, StandalonePageEntity]),
        AuthorizationModule,
        AuthModule.register(environment)
      ],
      controllers: [NavigationController],
      providers: [NavigationService],
      exports: [NavigationService]
    };
  }
}
