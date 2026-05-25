import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthorizationGrantEntity } from "./entities/authorization-grant.entity";
import { AuthorizationService } from "./authorization.service";

@Module({
  imports: [TypeOrmModule.forFeature([AuthorizationGrantEntity])],
  providers: [AuthorizationService],
  exports: [TypeOrmModule, AuthorizationService]
})
export class AuthorizationModule {}
