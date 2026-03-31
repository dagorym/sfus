import { describe, expect, it } from "vitest";

import type { ApplicationEnvironment } from "../config/environment";
import {
  createDataSourceOptions,
  createMigrationDataSource,
  createNestDataSourceOptions,
  reviewedMigrationNames
} from "./database.config";

const environment: ApplicationEnvironment = {
  nodeEnv: "development",
  apiPort: 3001,
  swaggerEnabled: true,
  db: {
    host: "mysql",
    port: 3306,
    name: "sfus",
    user: "sfus",
    password: "secret",
    connectTimeoutMs: 5000,
    migrationsTableName: "sfus_migrations"
  }
};

describe("database config", () => {
  it("creates MySQL data source options for the documented contract without auto-running migrations", () => {
    const options = createDataSourceOptions(environment);

    expect(options).toMatchObject({
      type: "mysql",
      host: "mysql",
      port: 3306,
      username: "sfus",
      password: "secret",
      database: "sfus",
      charset: "utf8mb4",
      synchronize: false,
      migrationsRun: false,
      migrationsTableName: "sfus_migrations",
      entities: [],
      extra: {
        connectionLimit: 5,
        connectTimeout: 5000
      }
    });
    expect(reviewedMigrationNames).toEqual(["FoundationBaseline1711843200000"]);
  });

  it("creates Nest TypeORM options with manual initialization and no retries", () => {
    const options = createNestDataSourceOptions(environment);

    expect(options).toMatchObject({
      type: "mysql",
      manualInitialization: true,
      retryAttempts: 0,
      autoLoadEntities: false,
      migrationsRun: false
    });
  });

  it("creates a migration data source for explicit migration commands", () => {
    const dataSource = createMigrationDataSource(environment);

    expect(dataSource.options).toMatchObject({
      type: "mysql",
      migrationsRun: false,
      migrationsTableName: "sfus_migrations"
    });
  });
});
