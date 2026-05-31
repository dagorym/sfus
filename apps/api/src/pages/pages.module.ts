import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import type { ApplicationEnvironment } from "../config/environment";
import { PageRevisionEntity } from "./entities/page-revision.entity";
import { StandalonePageEntity } from "./entities/standalone-page.entity";
import { PagesController } from "./pages.controller";
import { PagesService } from "./pages.service";

@Module({})
export class PagesModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: PagesModule,
      imports: [
        TypeOrmModule.forFeature([StandalonePageEntity, PageRevisionEntity]),
        AuthorizationModule,
        AuthModule.register(environment)
      ],
      controllers: [PagesController],
      providers: [PagesService],
      exports: [PagesService]
    };
  }
}
