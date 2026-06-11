import { MiddlewareConsumer, Module, type DynamicModule, type NestModule } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { AuthorizationModule } from "./authorization/authorization.module";
import { BlogModule } from "./blog/blog.module";
import type { ApplicationEnvironment } from "./config/environment";
import { ThrottleModule } from "./common/throttle/throttle.module";
import { JsonLogger } from "./common/logger/json-logger.service";
import { CorrelationIdMiddleware } from "./common/middleware/correlation-id.middleware";
import { RequestLoggingMiddleware } from "./common/middleware/request-logging.middleware";
import { DatabaseModule } from "./database/database.module";
import { DocsModule } from "./docs/docs.module";
import { ForumsModule } from "./forums/forums.module";
import { HealthModule } from "./health/health.module";
import { MediaModule } from "./media/media.module";
import { NavigationModule } from "./navigation/navigation.module";
import { PagesModule } from "./pages/pages.module";
import { UsersModule } from "./users/users.module";

@Module({})
export class AppModule implements NestModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.register(environment),
        UsersModule.register(environment),
        AuthModule.register(environment),
        AuthorizationModule,
        ThrottleModule.register(environment),
        HealthModule.register(environment),
        MediaModule.register(environment),
        BlogModule.register(environment),
        PagesModule.register(environment),
        NavigationModule.register(environment),
        ForumsModule.register(environment),
        DocsModule.register(environment)
      ],
      providers: [JsonLogger, CorrelationIdMiddleware, RequestLoggingMiddleware]
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RequestLoggingMiddleware).forRoutes("*");
  }
}
