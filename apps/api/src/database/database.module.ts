import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import type { ApplicationEnvironment } from "../config/environment";
import { createNestDataSourceOptions } from "./database.config";

@Module({})
export class DatabaseModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [TypeOrmModule.forRoot(createNestDataSourceOptions(environment))]
    };
  }
}
