import { DynamicModule, Module } from "@nestjs/common";

import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import { HealthController } from "./health.controller";
import { ReadinessService } from "./readiness.service";

@Module({})
export class HealthModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [
        ReadinessService,
        {
          provide: API_ENVIRONMENT,
          useValue: environment
        }
      ]
    };
  }
}
