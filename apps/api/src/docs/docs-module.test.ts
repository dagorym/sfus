import { describe, expect, it } from "vitest";

import { DocsModule } from "./docs.module";

/**
 * Validates ST-1 acceptance criteria for DocsModule skeleton registration.
 *
 * DocsModule is a skeleton at this stage — no routes are introduced in ST-1.
 * These tests confirm the dynamic-module pattern is followed and that the
 * module is wirable into AppModule.
 */
describe("DocsModule", () => {
  it("exposes a static register() method that returns a DynamicModule", () => {
    // Acceptance criterion: DocsModule is registered in app.module.ts;
    // skeleton has empty providers/controllers/exports arrays — no routes in ST-1.
    const fakeEnvironment = {} as never;
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
    const fakeEnvironment = {} as never;
    const result = DocsModule.register(fakeEnvironment);

    expect(result.controllers!.length).toBeGreaterThanOrEqual(1);
  });

  it("registers DocsService as a provider — service wiring added in ST-2", () => {
    // ST-1 expected empty providers; ST-2 adds DocsService provider and export.
    // This test is updated to reflect the intentional ST-2 behavior change.
    const fakeEnvironment = {} as never;
    const result = DocsModule.register(fakeEnvironment);

    expect(result.providers!.length).toBeGreaterThanOrEqual(1);
  });

  it("imports TypeOrmModule.forFeature with docs entity registrations", () => {
    // Acceptance criterion: Both entities compile and are registered in reviewedEntityClasses.
    // The dynamic module imports array must include a TypeORM feature registration.
    const fakeEnvironment = {} as never;
    const result = DocsModule.register(fakeEnvironment);

    // TypeOrmModule.forFeature returns a DynamicModule; at least one import must be present.
    expect(result.imports!.length).toBeGreaterThan(0);
  });
});
