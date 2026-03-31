import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("web next config", () => {
  it("rewrites /api requests to localhost:3001 during development", async () => {
    // Acceptance criterion: frontend code targets /api, with local rewrites forwarding to localhost:3001.
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "development"
    };

    const nextConfig = (await import("./next.config.mjs")).default;

    await expect(nextConfig.rewrites?.()).resolves.toEqual([
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*"
      }
    ]);
  });

  it("uses the explicit internal API origin outside development when provided", async () => {
    // Acceptance criterion: frontend code continues to target /api while runtime routing stays configurable.
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      WEB_API_INTERNAL_URL: "http://api:3001/"
    };

    const nextConfig = (await import("./next.config.mjs")).default;

    await expect(nextConfig.rewrites?.()).resolves.toEqual([
      {
        source: "/api/:path*",
        destination: "http://api:3001/api/:path*"
      }
    ]);
  });
});
