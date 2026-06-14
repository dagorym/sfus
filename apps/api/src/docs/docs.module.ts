import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { ThrottleModule } from "../common/throttle/throttle.module";
import type { ApplicationEnvironment } from "../config/environment";
import { DocsPageEntity } from "./entities/docs-page.entity";
import { DocsRevisionEntity } from "./entities/docs-revision.entity";
import { DocsController } from "./docs.controller";
import { DocsService } from "./docs.service";
import { DOCS_CONFIG } from "./docs.types";

@Module({})
export class DocsModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: DocsModule,
      imports: [
        TypeOrmModule.forFeature([DocsPageEntity, DocsRevisionEntity]),
        AuthorizationModule,
        AuthModule.register(environment),
        ThrottleModule.register(environment)
      ],
      controllers: [DocsController],
      providers: [
        DocsService,
        {
          provide: DOCS_CONFIG,
          useValue: { lockTtlMinutes: environment.docs.lockTtlMinutes }
        }
      ],
      exports: [DocsService]
    };
  }
}
