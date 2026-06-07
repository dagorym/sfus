import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";
import { JsonExceptionFilter } from "./common/filters/json-exception.filter";
import { JsonLogger } from "./common/logger/json-logger.service";
import { loadEnvironment } from "./config/environment";
import { createMigrationDataSource, reviewedMigrationNames } from "./database/database.config";

export const apiBootstrap = async (): Promise<void> => {
  const bootstrapLogger = new JsonLogger();

  try {
    const environment = loadEnvironment();
    const app = await NestFactory.create(AppModule.register(environment), {
      logger: false,
      bufferLogs: false
    });
    const applicationLogger = app.get(JsonLogger);

    /**
     * Trust exactly one reverse-proxy hop.
     *
     * The API runs behind a single shared nginx-proxy instance in production.
     * Setting `trust proxy` to 1 causes Express to resolve `request.ip` and
     * `X-Forwarded-Proto` from the `X-Forwarded-For` / `X-Forwarded-Proto`
     * headers injected by that single upstream proxy, rather than reporting
     * the proxy's IP address.  All auth audit call sites that read `request.ip`
     * therefore receive the original client IP with no call-site changes.
     *
     * Locked decision: docs/architecture/milestone-1-foundation-decisions.md line 117
     *   "Trusted proxy behavior is explicitly configured for the expected
     *    reverse-proxy topology only."
     * Operational note: docs/operations/deployment.md line 94
     *   "the reverse proxy must terminate TLS and forward proto headers per the
     *    locked trusted-proxy decision."
     *
     * Direct (un-proxied) connections in local development are unaffected: when
     * no X-Forwarded-For header is present Express falls back to the socket
     * remote address, which is correct for direct connections.
     */
    app.getHttpAdapter().getInstance().set("trust proxy", 1);

    app.setGlobalPrefix("api");
    app.useGlobalFilters(new JsonExceptionFilter(applicationLogger));

    if (environment.swaggerEnabled) {
      const swaggerConfig = new DocumentBuilder()
        .setTitle("SFUS API")
        .setDescription("Milestone 1 foundation health and operational endpoints.")
        .setVersion("0.1.0")
        .build();
      const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

      SwaggerModule.setup("api/docs", app, swaggerDocument, {
        jsonDocumentUrl: "api/docs/openapi.json"
      });
    }

    await app.listen(environment.apiPort, "0.0.0.0");

    bootstrapLogger.info(
      "api.started",
      {
        port: environment.apiPort,
        swaggerEnabled: environment.swaggerEnabled,
        requiredMigrations: reviewedMigrationNames
      },
      "Bootstrap"
    );
  } catch (error) {
    bootstrapLogger.error(
      "api.start_failed",
      {
        error: serializeError(error)
      },
      "Bootstrap"
    );
    throw error;
  }
};

const runMigrations = async (): Promise<void> => {
  const logger = new JsonLogger();

  try {
    const environment = loadEnvironment();
    const dataSource = createMigrationDataSource(environment);

    try {
      await dataSource.initialize();
      const executedMigrations = await dataSource.runMigrations({ transaction: "all" });

      logger.info(
        "migrations.completed",
        {
          executed: executedMigrations.map((migration) => migration.name),
          requiredMigrations: reviewedMigrationNames
        },
        "MigrationRunner"
      );
    } finally {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  } catch (error) {
    logger.error(
      "migrations.failed",
      {
        error: serializeError(error)
      },
      "MigrationRunner"
    );
    throw error;
  }
};

const showMigrationState = async (): Promise<void> => {
  const logger = new JsonLogger();

  try {
    const environment = loadEnvironment();
    const dataSource = createMigrationDataSource(environment);

    try {
      await dataSource.initialize();
      const appliedRows = (await dataSource.query(
        `SELECT name FROM \`${environment.db.migrationsTableName}\``
      )) as Array<{ name: string }>;
      const appliedMigrationNames = appliedRows.map((row) => row.name);
      const missingMigrationNames = reviewedMigrationNames.filter(
        (migrationName) => !appliedMigrationNames.includes(migrationName)
      );

      logger.info(
        "migrations.status",
        {
          applied: appliedMigrationNames,
          missing: missingMigrationNames,
          requiredMigrations: reviewedMigrationNames
        },
        "MigrationRunner"
      );
    } finally {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  } catch (error) {
    logger.error(
      "migrations.status_failed",
      {
        error: serializeError(error)
      },
      "MigrationRunner"
    );
    throw error;
  }
};

const main = async (arguments_: string[]): Promise<void> => {
  const command = arguments_[0];

  switch (command) {
    case "migration:run":
      await runMigrations();
      return;
    case "migration:show":
      await showMigrationState();
      return;
    case undefined:
      await apiBootstrap();
      return;
    default:
      throw new Error(`Unsupported API command: ${command}`);
  }
};

const serializeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: String(error)
  };
};

if (require.main === module) {
  void main(process.argv.slice(2)).catch(() => {
    process.exitCode = 1;
  });
}
