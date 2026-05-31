import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthorizationModule } from "../authorization/authorization.module";
import { NavigationItemEntity } from "./entities/navigation-item.entity";
import { NavigationService } from "./navigation.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([NavigationItemEntity]),
    AuthorizationModule
  ],
  providers: [NavigationService],
  exports: [NavigationService]
})
export class NavigationModule {}
