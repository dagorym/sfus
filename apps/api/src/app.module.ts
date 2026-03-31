import { MiddlewareConsumer, Module, type DynamicModule, type NestModule } from "@nestjs/common";

import type { ApplicationEnvironment } from "./config/environment";
import { JsonLogger } from "./common/logger/json-logger.service";
import { CorrelationIdMiddleware } from "./common/middleware/correlation-id.middleware";
import { RequestLoggingMiddleware } from "./common/middleware/request-logging.middleware";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";

@Module({})
export class AppModule implements NestModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule.register(environment), HealthModule.register(environment)],
      providers: [JsonLogger, CorrelationIdMiddleware, RequestLoggingMiddleware]
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RequestLoggingMiddleware).forRoutes("*");
  }
}
