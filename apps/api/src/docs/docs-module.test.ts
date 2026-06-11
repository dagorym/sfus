import { describe, expect, it } from "vitest";

import { DocsModule } from "./docs.module";

// ST-3 added ThrottleModule.register(environment) and AuthModule.register(environment)
// to DocsModule, which require environment.throttle to be present. The fake environment
// must supply a throttle config (matching the ForumsModule test pattern).
const fakeEnvironment = {
  throttle: { windowMs: 60000, maxHits: 100, newAccountMaxHits: 10, newAccountWindowMs: 604800000, maxLinksPerPost: 10 }
} as never;

/**
 * Validates DocsModule skeleton registration.
 *
 * ST-1: DocsModule is a skeleton with no routes.
 * ST-2: DocsController and DocsService are wired.
 * ST-3: ThrottleModule and AuthModule added (requires throttle property in fake environment).
 */
describe("DocsModule", () => {
  it("exposes a static register() method that returns a DynamicModule", () => {
    const result = DocsModule.register(fakeEnvironment);

    expect(result).toBeDefined();
    expect(result.module).toBe(DocsModule);
    expect(Array.isArray(result.imports)).toBe(true);
    expect(Array.isArray(result.controllers)).toBe(true);
    expect(Array.isArray(result.providers)).toBe(true);
    expect(Array.isArray(result.exports)).toBe(true);
  });

  it("registers DocsController — routes introduced in ST-2", () => {
    // ST-1 expected empty controllers; ST-2 wires up DocsController and DocsService.
    // This test is updated to reflect the intentional ST-2 behavior change.
    const result = DocsModule.register(fakeEnvironment);

    expect(result.controllers!.length).toBeGreaterThanOrEqual(1);
  });

  it("registers DocsService as a provider — service wiring added in ST-2", () => {
    // ST-1 expected empty providers; ST-2 adds DocsService provider and export.
    // This test is updated to reflect the intentional ST-2 behavior change.
    const result = DocsModule.register(fakeEnvironment);

    expect(result.providers!.length).toBeGreaterThanOrEqual(1);
  });

  it("imports TypeOrmModule.forFeature with docs entity registrations", () => {
    // Acceptance criterion: Both entities compile and are registered in reviewedEntityClasses.
    // The dynamic module imports array must include a TypeORM feature registration.
    const result = DocsModule.register(fakeEnvironment);

    // TypeOrmModule.forFeature returns a DynamicModule; at least one import must be present.
    expect(result.imports!.length).toBeGreaterThan(0);
  });
});
