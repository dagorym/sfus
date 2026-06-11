import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthorizationModule } from "../authorization/authorization.module";
import type { ApplicationEnvironment } from "../config/environment";
import { DocsPageEntity } from "./entities/docs-page.entity";
import { DocsRevisionEntity } from "./entities/docs-revision.entity";
import { DocsController } from "./docs.controller";
import { DocsService } from "./docs.service";

@Module({})
export class DocsModule {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static register(_environment: ApplicationEnvironment): DynamicModule {
    return {
      module: DocsModule,
      imports: [
        TypeOrmModule.forFeature([DocsPageEntity, DocsRevisionEntity]),
        AuthorizationModule
      ],
      controllers: [DocsController],
      providers: [DocsService],
      exports: [DocsService]
    };
  }
}
