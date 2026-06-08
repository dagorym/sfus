import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { ThrottleModule } from "../common/throttle/throttle.module";
import type { ApplicationEnvironment } from "../config/environment";
import { UserEntity } from "./entities/user.entity";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/**
 * Static form of UsersModule — provides UsersService only.
 *
 * Imported by AuthModule (which cannot use the dynamic form because doing so
 * would create a circular dependency: AuthModule → UsersModule.register →
 * ThrottleModule → AuthModule).
 *
 * AuthModule already resolves the session; this static form exposes UsersService
 * for the user lookup inside AuthService (e.g., resolveSession → findById).
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService]
})
export class UsersModule {
  /**
   * Dynamic form of UsersModule — adds the UsersController and its required
   * dependencies (AuthModule for session resolution, ThrottleModule for
   * rate-limiting the suggest endpoint).
   *
   * Use this in AppModule. AuthModule must continue to import the static form.
   */
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: UsersModule,
      imports: [
        TypeOrmModule.forFeature([UserEntity]),
        AuthModule.register(environment),
        ThrottleModule.register(environment)
      ],
      controllers: [UsersController],
      providers: [UsersService],
      exports: [TypeOrmModule, UsersService]
    };
  }
}
