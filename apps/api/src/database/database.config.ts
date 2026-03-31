import type { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { DataSource, type DataSourceOptions, type MigrationInterface } from "typeorm";

import type { ApplicationEnvironment } from "../config/environment";
import { FoundationBaseline1711843200000 } from "./migrations/1711843200000-foundation-baseline";

const reviewedMigrationClasses = [FoundationBaseline1711843200000];

export const reviewedMigrationNames = reviewedMigrationClasses.map((MigrationClass) => {
  const migration = new MigrationClass() as MigrationInterface & { name?: string };
  return migration.name || MigrationClass.name;
});

export const createDataSourceOptions = (
  environment: ApplicationEnvironment
): DataSourceOptions => {
  return {
    type: "mysql",
    host: environment.db.host,
    port: environment.db.port,
    username: environment.db.user,
    password: environment.db.password,
    database: environment.db.name,
    charset: "utf8mb4",
    synchronize: false,
    logging: false,
    migrationsRun: false,
    migrationsTableName: environment.db.migrationsTableName,
    migrations: reviewedMigrationClasses,
    entities: [],
    extra: {
      connectionLimit: 5,
      connectTimeout: environment.db.connectTimeoutMs
    }
  };
};

export const createNestDataSourceOptions = (
  environment: ApplicationEnvironment
): TypeOrmModuleOptions => {
  return {
    ...createDataSourceOptions(environment),
    autoLoadEntities: false,
    retryAttempts: 0,
    manualInitialization: true
  };
};

export const createMigrationDataSource = (environment: ApplicationEnvironment): DataSource => {
  return new DataSource(createDataSourceOptions(environment));
};
