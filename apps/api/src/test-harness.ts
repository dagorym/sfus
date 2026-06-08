/**
 * Shared supertest-class HTTP test harness for the SFUS API.
 *
 * Exported so ST8/ST9 (throttle + enforcement) can reuse it.
 *
 * CommonJS-safe: no `import.meta`, no ESM-only APIs.  This module is
 * built under NodeNext CJS and used by vitest.
 *
 * Design
 * ------
 * Rather than spinning up the full NestJS app (which requires a live DB
 * connection via DatabaseModule), the harness builds a minimal bare Express
 * application that applies the **same security middleware configuration**
 * as `index.ts`:
 *
 *   - `app.set("trust proxy", 1)` — trust exactly one reverse-proxy hop so
 *     `request.ip` resolves from `X-Forwarded-For` (locked decision, MS1 §Security).
 *   - `helmet({ strictTransportSecurity: false, contentSecurityPolicy: false })`
 *     — baseline security headers without HSTS or CSP.
 *
 * A caller-supplied router is mounted under `/api` so individual test suites
 * can add their own routes.  A built-in `/api/test/echo-ip` route is always
 * present and returns `{ ip: req.ip }` for proxy-hop tests.
 *
 * Usage
 * -----
 * ```ts
 * const app = createTestApp();
 * const res = await request(app).get("/api/test/echo-ip")
 *   .set("X-Forwarded-For", "203.0.113.42");
 * expect(res.body.ip).toBe("203.0.113.42");
 * ```
 */

import express from "express";
import helmet from "helmet";
import type { Application, Router } from "express";

/**
 * Create a minimal Express application configured with the same security
 * middleware as `index.ts` (trust proxy=1 + helmet baseline).
 *
 * @param extraRouter - Optional Express Router mounted at `/api` in addition
 *   to the built-in echo-ip route.  Use this to mount test-specific routes
 *   in ST8/ST9 throttle integration tests.
 * @returns A ready-to-use Express Application (not yet listening on a port).
 *   Pass it directly to `supertest(app)` — supertest handles ephemeral binding.
 */
export function createTestApp(extraRouter?: Router): Application {
  const app = express();

  /**
   * Trust exactly one reverse-proxy hop — mirrors the production setting in
   * index.ts so req.ip resolves from X-Forwarded-For.
   * Locked decision: docs/architecture/milestone-1-foundation-decisions.md §Security
   */
  app.set("trust proxy", 1);

  /**
   * Helmet baseline: HSTS off (handled by nginx), CSP off (JSON API only).
   * Matches index.ts configuration exactly.
   */
  app.use(
    helmet({
      strictTransportSecurity: false,
      contentSecurityPolicy: false
    })
  );

  app.use(express.json());

  const apiRouter = express.Router();

  /**
   * Built-in echo-ip endpoint for proxy-hop tests.
   * Returns the Express-resolved `req.ip` so tests can verify that
   * `trust proxy=1` causes X-Forwarded-For to be honored.
   */
  apiRouter.get("/test/echo-ip", (req, res) => {
    res.json({ ip: req.ip });
  });

  if (extraRouter) {
    apiRouter.use(extraRouter);
  }

  app.use("/api", apiRouter);

  return app;
}
