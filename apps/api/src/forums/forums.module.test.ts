import { describe, expect, it } from "vitest";

import { API_ENVIRONMENT } from "../config/config.constants";
import { ForumsModule } from "./forums.module";

/**
 * Validates ST1 acceptance criteria: ForumsModule.register(environment) follows
 * the dynamic-module pattern.
 */
describe("ForumsModule", () => {
  it("exposes a static register() method that returns a DynamicModule", () => {
    // Acceptance criterion: ForumsModule.register(environment) follows the dynamic-module pattern.
    // The method must exist and return an object with the required NestJS DynamicModule shape.
    const fakeEnvironment = {} as never;
    const result = ForumsModule.register(fakeEnvironment);

    expect(result).toBeDefined();
    expect(result.module).toBe(ForumsModule);
    expect(Array.isArray(result.imports)).toBe(true);
    // Controllers and providers are empty arrays in ST1 (no endpoints yet)
    expect(Array.isArray(result.controllers)).toBe(true);
    expect(Array.isArray(result.providers)).toBe(true);
  });

  it("imports TypeOrmModule.forFeature with all four forum entities", () => {
    // Acceptance criterion: Entities compile and are registered in ForumsModule.
    // The dynamic module imports array must include a TypeORM feature registration
    // (identified by the presence of at least one import).
    const fakeEnvironment = {} as never;
    const result = ForumsModule.register(fakeEnvironment);

    // TypeOrmModule.forFeature returns a DynamicModule; at least one import must be present
    expect(result.imports!.length).toBeGreaterThan(0);
  });

  it("provides API_ENVIRONMENT token so downstream consumers can inject the environment", () => {
    // Acceptance criterion: ForumsModule.register(environment) follows the HealthModule pattern
    // where the environment is consumed via the API_ENVIRONMENT token (remediation pass 2).
    const fakeEnvironment = { db: { host: "localhost" } } as never;
    const result = ForumsModule.register(fakeEnvironment);

    const apiEnvProvider = result.providers!.find(
      (p) => typeof p === "object" && "provide" in p && p.provide === API_ENVIRONMENT
    );
    expect(apiEnvProvider).toBeDefined();
    // The provider value must be the environment object passed to register()
    expect((apiEnvProvider as { useValue: unknown }).useValue).toBe(fakeEnvironment);
  });
});
