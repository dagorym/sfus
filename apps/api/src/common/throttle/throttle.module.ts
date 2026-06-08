/**
 * throttle.module.ts
 *
 * ThrottleModule — dynamic module that wires the throttle service and guard.
 *
 * Import with ThrottleModule.register(environment) from AppModule or any
 * feature module that needs throttling.
 *
 * Storage seam: the InMemoryThrottleStore is wired by default.  To swap to
 * Redis, replace the THROTTLE_STORE provider — no guard or service change
 * is required.
 *
 * Exports:
 *   - ThrottleService     — for programmatic use in services/controllers
 *   - ThrottleGuard       — for @UseGuards decoration
 *   - THROTTLE_STORE      — for test doubles / custom providers
 */

import { Module, type DynamicModule } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthModule } from "../../auth/auth.module";
import type { ApplicationEnvironment } from "../../config/environment";
import { InMemoryThrottleStore } from "./throttle-store";
import { ThrottleGuard } from "./throttle.guard";
import { ThrottleService } from "./throttle.service";
import { THROTTLE_CONFIG, THROTTLE_STORE } from "./throttle.types";

@Module({})
export class ThrottleModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: ThrottleModule,
      imports: [AuthModule.register(environment)],
      providers: [
        {
          provide: THROTTLE_STORE,
          useClass: InMemoryThrottleStore
        },
        {
          provide: THROTTLE_CONFIG,
          useValue: {
            windowMs: environment.throttle.windowMs,
            maxHits: environment.throttle.maxHits,
            newAccountMaxHits: environment.throttle.newAccountMaxHits,
            newAccountWindowMs: environment.throttle.newAccountWindowMs,
            maxLinksPerPost: environment.throttle.maxLinksPerPost
          }
        },
        ThrottleService,
        ThrottleGuard,
        Reflector
      ],
      exports: [ThrottleService, ThrottleGuard, THROTTLE_STORE]
    };
  }
}
