import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const mockApp = {
    setGlobalPrefix: vi.fn(),
    useGlobalFilters: vi.fn(),
    listen: vi.fn().mockResolvedValue(undefined),
    get: vi.fn()
  };
  const applicationLogger = {
    info: vi.fn(),
    error: vi.fn()
  };
  const bootstrapLogger = {
    info: vi.fn(),
    error: vi.fn()
  };
  const environment = {
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

  mockApp.get.mockReturnValue(applicationLogger);

  return {
    appModuleToken: { module: "AppModule" },
    applicationLogger,
    bootstrapLogger,
    createDocument: vi.fn().mockReturnValue({ openapi: "3.0.0" }),
    createMigrationDataSource: vi.fn(),
    environment,
    mockApp,
    nestCreate: vi.fn().mockResolvedValue(mockApp),
    setupSwagger: vi.fn()
  };
});

vi.mock("@nestjs/core", () => ({
  NestFactory: {
    create: state.nestCreate
  }
}));

vi.mock("@nestjs/swagger", () => ({
  DocumentBuilder: class {
    setTitle(): this {
      return this;
    }

    setDescription(): this {
      return this;
    }

    setVersion(): this {
      return this;
    }

    build(): Record<string, string> {
      return { built: "swagger" };
    }
  },
  SwaggerModule: {
    createDocument: state.createDocument,
    setup: state.setupSwagger
  }
}));

vi.mock("./app.module", () => ({
  AppModule: {
    register: vi.fn(() => state.appModuleToken)
  }
}));

vi.mock("./common/filters/json-exception.filter", () => ({
  JsonExceptionFilter: class {
    constructor(public readonly logger: unknown) {}
  }
}));

vi.mock("./common/logger/json-logger.service", () => ({
  JsonLogger: vi.fn().mockImplementation(() => state.bootstrapLogger)
}));

vi.mock("./config/environment", () => ({
  loadEnvironment: vi.fn(() => state.environment)
}));

vi.mock("./database/database.config", () => ({
  createMigrationDataSource: state.createMigrationDataSource,
  reviewedMigrationNames: ["FoundationBaseline1711843200000"]
}));

describe("apiBootstrap", () => {
  beforeEach(() => {
    state.environment.swaggerEnabled = true;
    state.mockApp.setGlobalPrefix.mockClear();
    state.mockApp.useGlobalFilters.mockClear();
    state.mockApp.listen.mockClear();
    state.mockApp.get.mockClear();
    state.mockApp.get.mockReturnValue(state.applicationLogger);
    state.nestCreate.mockClear();
    state.createDocument.mockClear();
    state.setupSwagger.mockClear();
    state.createMigrationDataSource.mockClear();
    state.applicationLogger.info.mockClear();
    state.applicationLogger.error.mockClear();
    state.bootstrapLogger.info.mockClear();
    state.bootstrapLogger.error.mockClear();
  });

  it("boots the API with the /api prefix and serves Swagger at /api/docs when enabled", async () => {
    const { apiBootstrap } = await import("./index.js");

    await apiBootstrap();

    expect(state.nestCreate).toHaveBeenCalledWith(state.appModuleToken, {
      logger: false,
      bufferLogs: false
    });
    expect(state.mockApp.setGlobalPrefix).toHaveBeenCalledWith("api");
    expect(state.createDocument).toHaveBeenCalledTimes(1);
    expect(state.setupSwagger).toHaveBeenCalledWith(
      "api/docs",
      state.mockApp,
      { openapi: "3.0.0" },
      { jsonDocumentUrl: "api/docs/openapi.json" }
    );
    expect(state.mockApp.listen).toHaveBeenCalledWith(3001, "0.0.0.0");
    expect(state.createMigrationDataSource).not.toHaveBeenCalled();
  });

  it("skips Swagger setup when configuration disables it", async () => {
    state.environment.swaggerEnabled = false;
    const { apiBootstrap } = await import("./index.js");

    await apiBootstrap();

    expect(state.createDocument).not.toHaveBeenCalled();
    expect(state.setupSwagger).not.toHaveBeenCalled();
    expect(state.mockApp.listen).toHaveBeenCalledWith(3001, "0.0.0.0");
  });
});
