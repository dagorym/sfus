/**
 * ST7 — Supertest-class HTTP integration tests.
 *
 * These tests execute real HTTP requests against a minimal Express application
 * configured with the same security middleware as the production `index.ts`.
 * They are *not* mocked call-order tests — they prove runtime behavior per P3.
 *
 * Two executed test groups are delivered here (D9-1):
 *
 *   (a) Proxy-hop — proves that Express resolves `request.ip` to the
 *       original client IP from `X-Forwarded-For` when `trust proxy = 1`.
 *       This is the security property that audit call sites depend on.
 *
 *   (b) Helmet baseline — asserts the three header conditions that must hold
 *       on every API response:
 *         • `X-Content-Type-Options: nosniff` PRESENT
 *         • `Strict-Transport-Security` ABSENT (handled by reverse proxy)
 *         • `Content-Security-Policy` ABSENT (JSON API — no browser CSP)
 *
 * Security note: P3 — tests derive from the contract, not the implementation.
 * Each assertion is stated as a requirement from the MS1 foundation decisions
 * and the ST7 acceptance criteria, not reverse-engineered from the code.
 */

import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./test-harness.js";

// ---------------------------------------------------------------------------
// (a) Proxy-hop test — X-Forwarded-For → request.ip under trust proxy=1
// ---------------------------------------------------------------------------

describe("Proxy-hop: request.ip under trust proxy=1", () => {
  /**
   * The production API sets `trust proxy = 1` so that `request.ip` resolves
   * the ORIGINAL client IP from the `X-Forwarded-For` header injected by the
   * single upstream nginx-proxy.
   *
   * Acceptance criterion: request.ip equals the injected X-Forwarded-For
   * client address — not a mocked setter call.
   *
   * Security rationale: auth audit logs read `request.ip` for client
   * attribution; if trust proxy were misconfigured (0 or >1), logs would
   * record the proxy IP instead of the real client IP.
   */
  it("resolves request.ip to the injected X-Forwarded-For client address", async () => {
    const app = createTestApp();
    const clientIp = "203.0.113.42"; // TEST-NET-3 (RFC 5737) — safe for tests

    const res = await request(app)
      .get("/api/test/echo-ip")
      .set("X-Forwarded-For", clientIp)
      .expect(200);

    expect(res.body).toHaveProperty("ip", clientIp);
  });

  /**
   * Over-trust regression guard (security concern from first Verifier pass).
   *
   * When a TWO-entry X-Forwarded-For header is present (forged leftmost entry
   * followed by the real immediate-hop client address), `trust proxy=1` must
   * treat ONLY the rightmost entry as the client IP and discard the forged
   * leftmost entry.
   *
   * Under the correct setting (`trust proxy=1`):
   *   X-Forwarded-For: "1.1.1.1, 203.0.113.42"
   *   →  request.ip === "203.0.113.42"  (rightmost, the real immediate hop)
   *
   * Under an over-trust regression (`trust proxy>=2`) this test would FAIL
   * because Express would walk one extra hop and return "1.1.1.1" — the
   * attacker-controlled leftmost entry.
   *
   * Security rationale: ST8/ST9 rate-limiting keys off `request.ip`.  An
   * over-trust regression would let an attacker evade or mis-attribute
   * throttles by prepending a forged IP to X-Forwarded-For.
   */
  it("rejects a spoofed leftmost entry in a two-hop X-Forwarded-For header", async () => {
    const app = createTestApp();
    const realIp = "203.0.113.42"; // TEST-NET-3 (RFC 5737) — real immediate hop
    const spoofedIp = "1.1.1.1"; // attacker-controlled forged leftmost entry

    const res = await request(app)
      .get("/api/test/echo-ip")
      .set("X-Forwarded-For", `${spoofedIp}, ${realIp}`)
      .expect(200);

    // Must resolve to the rightmost (real) entry, not the spoofed leftmost.
    expect(res.body).toHaveProperty("ip", realIp);
    expect(res.body.ip).not.toBe(spoofedIp);
  });

  /**
   * When no X-Forwarded-For header is present (direct connection), Express
   * falls back to the socket remote address.  supertest connects to the
   * server via loopback, so the resolved IP should be the loopback address
   * (127.0.0.1 or ::1).
   */
  it("falls back to the socket remote address when no X-Forwarded-For is present", async () => {
    const app = createTestApp();

    const res = await request(app).get("/api/test/echo-ip").expect(200);

    // The fallback IP is the loopback address from the supertest TCP connection.
    // Accept both IPv4 and IPv6 loopback forms.
    expect(res.body.ip).toMatch(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
  });
});

// ---------------------------------------------------------------------------
// (b) Helmet baseline header assertions
// ---------------------------------------------------------------------------

describe("Helmet baseline: security headers on API responses", () => {
  /**
   * X-Content-Type-Options: nosniff must be present on every response.
   *
   * This header instructs browsers not to MIME-sniff the response content type.
   * It is part of the helmet default set and must remain enabled.
   * (Noted in plans/milestone-4-forums-plan.md §2 — confirmed globally via helmet.)
   */
  it("sets X-Content-Type-Options: nosniff on the response", async () => {
    const app = createTestApp();

    const res = await request(app).get("/api/test/echo-ip").expect(200);

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  /**
   * Strict-Transport-Security must be ABSENT.
   *
   * HSTS is handled by the nginx reverse proxy per the locked MS1 deployment
   * decision.  The API explicitly disables helmet's HSTS middleware
   * (`strictTransportSecurity: false`) so the header is never emitted.
   * Emitting HSTS from the API would be redundant and could interfere with
   * local development over HTTP.
   */
  it("does not set Strict-Transport-Security (HSTS handled by reverse proxy)", async () => {
    const app = createTestApp();

    const res = await request(app).get("/api/test/echo-ip").expect(200);

    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  /**
   * Content-Security-Policy must be ABSENT.
   *
   * The API serves only JSON; browser CSP enforcement is irrelevant and would
   * interfere with Swagger UI rendering.  The API explicitly disables helmet's
   * CSP middleware (`contentSecurityPolicy: false`).  Web-layer CSP is handled
   * by next.config.mjs.
   */
  it("does not set Content-Security-Policy (JSON API — no browser CSP needed)", async () => {
    const app = createTestApp();

    const res = await request(app).get("/api/test/echo-ip").expect(200);

    expect(res.headers["content-security-policy"]).toBeUndefined();
  });
});
