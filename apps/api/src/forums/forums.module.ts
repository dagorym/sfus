import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import { ForumCategoryEntity } from "./entities/forum-category.entity";
import { ForumBoardEntity } from "./entities/forum-board.entity";
import { ForumTopicEntity } from "./entities/forum-topic.entity";
import { ForumPostEntity } from "./entities/forum-post.entity";

@Module({})
export class ForumsModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: ForumsModule,
      imports: [
        TypeOrmModule.forFeature([
          ForumCategoryEntity,
          ForumBoardEntity,
          ForumTopicEntity,
          ForumPostEntity
        ])
      ],
      controllers: [],
      providers: [
        {
          provide: API_ENVIRONMENT,
          useValue: environment
        }
      ],
      exports: [API_ENVIRONMENT]
    };
  }
}
