import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import type { ApplicationEnvironment } from "../config/environment";
import { DocsPageEntity } from "./entities/docs-page.entity";
import { DocsRevisionEntity } from "./entities/docs-revision.entity";

@Module({})
export class DocsModule {
  static register(_environment: ApplicationEnvironment): DynamicModule {
    return {
      module: DocsModule,
      imports: [TypeOrmModule.forFeature([DocsPageEntity, DocsRevisionEntity])],
      controllers: [],
      providers: [],
      exports: []
    };
  }
}
