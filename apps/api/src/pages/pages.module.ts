import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthorizationModule } from "../authorization/authorization.module";
import { PageRevisionEntity } from "./entities/page-revision.entity";
import { StandalonePageEntity } from "./entities/standalone-page.entity";
import { PagesService } from "./pages.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([StandalonePageEntity, PageRevisionEntity]),
    AuthorizationModule
  ],
  providers: [PagesService],
  exports: [PagesService]
})
export class PagesModule {}
