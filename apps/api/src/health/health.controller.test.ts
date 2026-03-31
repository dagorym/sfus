import { describe, expect, it, vi } from "vitest";

import type { ReadinessPayload } from "./readiness.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns a JSON liveness payload", () => {
    const controller = new HealthController({ check: vi.fn() } as never);

    expect(controller.getLiveness()).toMatchObject({
      status: "ok",
      service: "api"
    });
  });

  it("returns readiness JSON without overriding a healthy status code", async () => {
    const readiness: ReadinessPayload = {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: "up" },
        migrations: { status: "up", required: [], missing: [] }
      }
    };
    const response = { status: vi.fn() };
    const controller = new HealthController({
      check: vi.fn().mockResolvedValue(readiness)
    } as never);

    await expect(controller.getReadiness(response as never)).resolves.toEqual(readiness);
    expect(response.status).not.toHaveBeenCalled();
  });

  it("returns readiness JSON and sets HTTP 503 when a dependency is unavailable", async () => {
    const readiness: ReadinessPayload = {
      status: "error",
      service: "api",
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: "down", message: "connect ECONNREFUSED" },
        migrations: { status: "down", required: [], missing: [], message: "DB unavailable" }
      }
    };
    const response = { status: vi.fn() };
    const controller = new HealthController({
      check: vi.fn().mockResolvedValue(readiness)
    } as never);

    await expect(controller.getReadiness(response as never)).resolves.toEqual(readiness);
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
