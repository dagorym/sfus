import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import type { ApplicationEnvironment } from "../config/environment";
import { ForumCategoryEntity } from "./entities/forum-category.entity";
import { ForumBoardEntity } from "./entities/forum-board.entity";
import { ForumTopicEntity } from "./entities/forum-topic.entity";
import { ForumPostEntity } from "./entities/forum-post.entity";

@Module({})
export class ForumsModule {
  static register(_environment: ApplicationEnvironment): DynamicModule {
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
      providers: [],
      exports: []
    };
  }
}
