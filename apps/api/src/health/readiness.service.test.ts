import { describe, expect, it, vi } from "vitest";

import type { ApplicationEnvironment } from "../config/environment";
import { reviewedMigrationNames } from "../database/database.config";
import { ReadinessService } from "./readiness.service";

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

describe("ReadinessService", () => {
  it("reports database errors when connectivity fails", async () => {
    const dataSource = {
      isInitialized: false,
      initialize: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
      query: vi.fn()
    };
    const service = new ReadinessService(dataSource as never, environment);

    await expect(service.check()).resolves.toMatchObject({
      status: "error",
      service: "api",
      checks: {
        database: {
          status: "down",
          message: "connect ECONNREFUSED"
        },
        migrations: {
          status: "down",
          required: reviewedMigrationNames,
          missing: reviewedMigrationNames
        }
      }
    });
    expect(dataSource.initialize).toHaveBeenCalledTimes(1);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it("reports missing reviewed migrations even when the database is reachable", async () => {
    const dataSource = {
      isInitialized: true,
      initialize: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ ready: 1 }])
        .mockResolvedValueOnce([{ name: "SomeOtherMigration" }])
    };
    const service = new ReadinessService(dataSource as never, environment);

    await expect(service.check()).resolves.toMatchObject({
      status: "error",
      checks: {
        database: {
          status: "up"
        },
        migrations: {
          status: "down",
          message: "Required reviewed migrations have not been applied.",
          required: reviewedMigrationNames,
          missing: reviewedMigrationNames
        }
      }
    });
    expect(dataSource.query).toHaveBeenNthCalledWith(1, "SELECT 1 AS ready");
    expect(dataSource.query).toHaveBeenNthCalledWith(2, "SELECT name FROM `sfus_migrations`");
  });

  it("reports ready when the database is reachable and the reviewed migration baseline is applied", async () => {
    const dataSource = {
      isInitialized: true,
      initialize: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ ready: 1 }])
        .mockResolvedValueOnce(reviewedMigrationNames.map((name) => ({ name })))
    };
    const service = new ReadinessService(dataSource as never, environment);

    await expect(service.check()).resolves.toMatchObject({
      status: "ok",
      service: "api",
      checks: {
        database: {
          status: "up"
        },
        migrations: {
          status: "up",
          required: reviewedMigrationNames,
          missing: []
        }
      }
    });
  });
});
