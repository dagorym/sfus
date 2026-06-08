import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

// ── Security header helpers ────────────────────────────────────────────────
// Finds the first header object with the given key inside the headers() output.
const findHeader = (
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>,
  key: string
): { key: string; value: string } | undefined => {
  for (const route of headers) {
    const found = route.headers.find((h) => h.key === key);
    if (found) return found;
  }
  return undefined;
};

describe("web next config — security headers (AC1, AC2)", () => {
  // AC1: Every web route responds with full baseline headers; CSP enforced (not Report-Only).
  // AC5: No Strict-Transport-Security emitted.

  it("applies Content-Security-Policy (enforced, not report-only) to all routes in production", async () => {
    // AC1: CSP must be Content-Security-Policy, not Content-Security-Policy-Report-Only
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    expect(headers).toBeDefined();
    expect(headers!.length).toBeGreaterThan(0);

    // Verify the enforced header is present (not report-only key)
    const cspHeader = findHeader(headers!, "Content-Security-Policy");
    expect(cspHeader).toBeDefined();
    expect(cspHeader!.key).toBe("Content-Security-Policy");
    expect(cspHeader!.key).not.toBe("Content-Security-Policy-Report-Only");

    // CSP must contain 'self' as default-src baseline
    expect(cspHeader!.value).toContain("default-src 'self'");
  });

  it("applies X-Content-Type-Options: nosniff to all routes", async () => {
    // AC1: baseline header required
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    const header = findHeader(headers!, "X-Content-Type-Options");
    expect(header).toBeDefined();
    expect(header!.value).toBe("nosniff");
  });

  it("applies Referrer-Policy to all routes", async () => {
    // AC1: baseline header required
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    const header = findHeader(headers!, "Referrer-Policy");
    expect(header).toBeDefined();
    expect(header!.value).toBeTruthy();
  });

  it("applies X-Frame-Options to all routes", async () => {
    // AC1: baseline header required
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    const header = findHeader(headers!, "X-Frame-Options");
    expect(header).toBeDefined();
    expect(header!.value).toBeTruthy();
  });

  it("applies Permissions-Policy to all routes", async () => {
    // AC1: baseline header required
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    const header = findHeader(headers!, "Permissions-Policy");
    expect(header).toBeDefined();
    expect(header!.value).toBeTruthy();
  });

  it("does not emit Strict-Transport-Security on any route", async () => {
    // AC5: HSTS is handled by the reverse proxy; must not be emitted by the app
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    const hstsHeader = findHeader(headers!, "Strict-Transport-Security");
    expect(hstsHeader).toBeUndefined();
  });

  it("headers() applies to all routes (source matches '/(.*)')", async () => {
    // AC1: every route must receive the baseline headers
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    expect(headers).toBeDefined();
    // At least one route entry must use a wildcard or catch-all source
    const hasGlobalSource = headers!.some(
      (route) => route.source === "/(.*)" || route.source === "/:path*"
    );
    expect(hasGlobalSource).toBe(true);
  });

  it("includes connect-src with localhost:3001 in CSP during development", async () => {
    // AC4 (justification): hybrid-dev localhost connect-src allowance must be present in dev
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "development",
      WEB_API_ORIGIN: "http://localhost:3001"
    };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    const cspHeader = findHeader(headers!, "Content-Security-Policy");
    expect(cspHeader).toBeDefined();
    expect(cspHeader!.value).toContain("connect-src");
    expect(cspHeader!.value).toContain("localhost:3001");
  });

  it("omits localhost:3001 from connect-src in CSP in production", async () => {
    // AC4 (justification): localhost connect-src must NOT appear in production
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    const cspHeader = findHeader(headers!, "Content-Security-Policy");
    expect(cspHeader).toBeDefined();
    // In production, connect-src should only allow 'self'
    expect(cspHeader!.value).toContain("connect-src 'self'");
    expect(cspHeader!.value).not.toContain("localhost:3001");
  });

  it("includes script-src and style-src with 'unsafe-inline' for Next.js hydration", async () => {
    // AC4 (justification): unsafe-inline required for Next.js 15 hydration scripts and CSS modules
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    const cspHeader = findHeader(headers!, "Content-Security-Policy");
    expect(cspHeader).toBeDefined();
    expect(cspHeader!.value).toContain("script-src 'self' 'unsafe-inline'");
    expect(cspHeader!.value).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("restricts img-src to 'self' with no data: allowance (markdown-renderer rejects data: URIs)", async () => {
    // AC4 (justification): all image paths load via the proxied /api/media route
    // ('self') and markdown-renderer.tsx rejects data: URIs, so img-src must not
    // carry a data: allowance.
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };

    const nextConfig = (await import("./next.config.mjs")).default;
    const headers = await nextConfig.headers?.();

    const cspHeader = findHeader(headers!, "Content-Security-Policy");
    expect(cspHeader).toBeDefined();
    expect(cspHeader!.value).toContain("img-src 'self'");
    expect(cspHeader!.value).not.toContain("data:");
  });
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
