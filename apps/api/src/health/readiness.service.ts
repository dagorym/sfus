import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import { reviewedMigrationNames } from "../database/database.config";

export interface ReadinessPayload {
  status: "ok" | "error";
  service: "api";
  timestamp: string;
  checks: {
    database: {
      status: "up" | "down";
      message?: string;
    };
    migrations: {
      status: "up" | "down";
      message?: string;
      required: string[];
      missing: string[];
    };
  };
}

@Injectable()
export class ReadinessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(API_ENVIRONMENT) private readonly environment: ApplicationEnvironment
  ) {}

  async check(): Promise<ReadinessPayload> {
    const timestamp = new Date().toISOString();

    try {
      await this.ensureDataSource();
      await this.dataSource.query("SELECT 1 AS ready");
    } catch (error) {
      return {
        status: "error",
        service: "api",
        timestamp,
        checks: {
          database: {
            status: "down",
            message: formatError(error)
          },
          migrations: {
            status: "down",
            message: "Database connectivity is required before migration state can be evaluated.",
            required: reviewedMigrationNames,
            missing: reviewedMigrationNames
          }
        }
      };
    }

    try {
      const appliedMigrationNames = await this.readAppliedMigrationNames();
      const missingMigrationNames = reviewedMigrationNames.filter(
        (migrationName) => !appliedMigrationNames.includes(migrationName)
      );

      if (missingMigrationNames.length > 0) {
        return {
          status: "error",
          service: "api",
          timestamp,
          checks: {
            database: {
              status: "up"
            },
            migrations: {
              status: "down",
              message: "Required reviewed migrations have not been applied.",
              required: reviewedMigrationNames,
              missing: missingMigrationNames
            }
          }
        };
      }
    } catch (error) {
      return {
        status: "error",
        service: "api",
        timestamp,
        checks: {
          database: {
            status: "up"
          },
          migrations: {
            status: "down",
            message: formatError(error),
            required: reviewedMigrationNames,
            missing: reviewedMigrationNames
          }
        }
      };
    }

    return {
      status: "ok",
      service: "api",
      timestamp,
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
    };
  }

  private async ensureDataSource(): Promise<void> {
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }
  }

  private async readAppliedMigrationNames(): Promise<string[]> {
    const tableName = `\`${this.environment.db.migrationsTableName}\``;
    const rows = (await this.dataSource.query(`SELECT name FROM ${tableName}`)) as Array<{
      name: string;
    }>;

    return rows.map((row) => row.name);
  }
}

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown readiness error.";
};
