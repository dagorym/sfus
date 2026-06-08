/**
 * throttle-env.test.ts
 *
 * Tests for throttle-related environment variable validation in loadEnvironment().
 *
 * Acceptance criterion covered:
 *   AC4 — New env vars validated in environment.ts; missing/invalid values
 *          cause startup failure consistent with existing handling; the
 *          cross-field check newAccountMaxHits <= maxHits is enforced.
 */

import { describe, expect, it } from "vitest";

import { loadEnvironment } from "../../config/environment";

// ---------------------------------------------------------------------------
// Shared valid environment fixture (replicates environment.test.ts convention)
// ---------------------------------------------------------------------------

function createValidEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    API_PORT: "3001",
    AUTH_PASSWORD_PEPPER: "development-pepper-value",
    AUTH_SESSION_TOKEN_PEPPER: "development-session-token-pepper",
    AUTH_SESSION_TTL_MINUTES: "1440",
    AUTH_SESSION_IDLE_TIMEOUT_MINUTES: "120",
    AUTH_EMAIL_VERIFICATION_TTL_MINUTES: "60",
    AUTH_EXTERNAL_STATE_TTL_MINUTES: "10",
    AUTH_TOTP_ISSUER: "SFUS Test",
    AUTH_GOOGLE_CLIENT_ID: "google-client-id",
    AUTH_GOOGLE_CLIENT_SECRET: "google-client-secret",
    AUTH_GOOGLE_CALLBACK_URL: "http://localhost:3001/api/auth/external/google/callback",
    AUTH_GITHUB_CLIENT_ID: "github-client-id",
    AUTH_GITHUB_CLIENT_SECRET: "github-client-secret",
    AUTH_GITHUB_CALLBACK_URL: "http://localhost:3001/api/auth/external/github/callback",
    AUTH_RECOVERY_CODE_COUNT: "10",
    AUTH_RECOVERY_CODE_LENGTH: "12",
    MEDIA_UPLOAD_MAX_SIZE_BYTES: "5242880",
    MEDIA_ALLOWED_MIME_TYPES: "image/jpeg,image/png",
    MEDIA_STORAGE_PATH: "./storage/uploads",
    THROTTLE_WINDOW_MS: "60000",
    THROTTLE_MAX_HITS: "60",
    THROTTLE_NEW_ACCOUNT_MAX_HITS: "10",
    THROTTLE_NEW_ACCOUNT_WINDOW_MS: "604800000",
    THROTTLE_MAX_LINKS_PER_POST: "5",
    DB_HOST: "mysql",
    DB_PORT: "3306",
    DB_NAME: "sfus",
    DB_USER: "sfus",
    DB_PASSWORD: "secret",
    DB_CONNECT_TIMEOUT_MS: "5000",
    DB_MIGRATIONS_TABLE: "sfus_migrations"
  };
}

// ---------------------------------------------------------------------------
// AC4 — All throttle env vars are required
// ---------------------------------------------------------------------------

describe("loadEnvironment — throttle env vars required (AC4)", () => {
  it("throws when THROTTLE_WINDOW_MS is missing", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_WINDOW_MS: "" })
    ).toThrowError("THROTTLE_WINDOW_MS is required.");
  });

  it("throws when THROTTLE_MAX_HITS is missing", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_MAX_HITS: "" })
    ).toThrowError("THROTTLE_MAX_HITS is required.");
  });

  it("throws when THROTTLE_NEW_ACCOUNT_MAX_HITS is missing", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_NEW_ACCOUNT_MAX_HITS: "" })
    ).toThrowError("THROTTLE_NEW_ACCOUNT_MAX_HITS is required.");
  });

  it("throws when THROTTLE_NEW_ACCOUNT_WINDOW_MS is missing", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_NEW_ACCOUNT_WINDOW_MS: "" })
    ).toThrowError("THROTTLE_NEW_ACCOUNT_WINDOW_MS is required.");
  });

  it("throws when THROTTLE_MAX_LINKS_PER_POST is missing", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_MAX_LINKS_PER_POST: "" })
    ).toThrowError("THROTTLE_MAX_LINKS_PER_POST is required.");
  });
});

// ---------------------------------------------------------------------------
// AC4 — Range validation for each throttle env var
// ---------------------------------------------------------------------------

describe("loadEnvironment — throttle env var range validation (AC4)", () => {
  // THROTTLE_WINDOW_MS: 1000–3600000

  it("throws when THROTTLE_WINDOW_MS is below minimum (999)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_WINDOW_MS: "999" })
    ).toThrowError("THROTTLE_WINDOW_MS must be an integer between 1000 and 3600000.");
  });

  it("throws when THROTTLE_WINDOW_MS is above maximum (3600001)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_WINDOW_MS: "3600001" })
    ).toThrowError("THROTTLE_WINDOW_MS must be an integer between 1000 and 3600000.");
  });

  it("accepts THROTTLE_WINDOW_MS at minimum boundary (1000)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_WINDOW_MS: "1000" })
    ).not.toThrow();
  });

  // THROTTLE_MAX_HITS: 1–10000

  it("throws when THROTTLE_MAX_HITS is 0 (below minimum)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_MAX_HITS: "0" })
    ).toThrowError("THROTTLE_MAX_HITS must be an integer between 1 and 10000.");
  });

  it("throws when THROTTLE_MAX_HITS is 10001 (above maximum)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnv(),
        THROTTLE_MAX_HITS: "10001",
        THROTTLE_NEW_ACCOUNT_MAX_HITS: "10001"
      })
    ).toThrowError("THROTTLE_MAX_HITS must be an integer between 1 and 10000.");
  });

  // THROTTLE_NEW_ACCOUNT_MAX_HITS: 1–10000

  it("throws when THROTTLE_NEW_ACCOUNT_MAX_HITS is 0 (below minimum)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_NEW_ACCOUNT_MAX_HITS: "0" })
    ).toThrowError("THROTTLE_NEW_ACCOUNT_MAX_HITS must be an integer between 1 and 10000.");
  });

  // THROTTLE_NEW_ACCOUNT_WINDOW_MS: 60000–2592000000

  it("throws when THROTTLE_NEW_ACCOUNT_WINDOW_MS is below minimum (59999)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_NEW_ACCOUNT_WINDOW_MS: "59999" })
    ).toThrowError("THROTTLE_NEW_ACCOUNT_WINDOW_MS must be an integer between 60000 and 2592000000.");
  });

  it("throws when THROTTLE_NEW_ACCOUNT_WINDOW_MS is above maximum (2592000001)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_NEW_ACCOUNT_WINDOW_MS: "2592000001" })
    ).toThrowError("THROTTLE_NEW_ACCOUNT_WINDOW_MS must be an integer between 60000 and 2592000000.");
  });

  it("accepts THROTTLE_NEW_ACCOUNT_WINDOW_MS at minimum boundary (60000)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_NEW_ACCOUNT_WINDOW_MS: "60000" })
    ).not.toThrow();
  });

  // THROTTLE_MAX_LINKS_PER_POST: 0–100

  it("accepts THROTTLE_MAX_LINKS_PER_POST at minimum (0 = no links allowed)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_MAX_LINKS_PER_POST: "0" })
    ).not.toThrow();
  });

  it("throws when THROTTLE_MAX_LINKS_PER_POST is 101 (above maximum)", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_MAX_LINKS_PER_POST: "101" })
    ).toThrowError("THROTTLE_MAX_LINKS_PER_POST must be an integer between 0 and 100.");
  });

  it("throws for non-integer values", () => {
    expect(() =>
      loadEnvironment(process.cwd(), { ...createValidEnv(), THROTTLE_MAX_HITS: "not-a-number" })
    ).toThrowError("THROTTLE_MAX_HITS must be an integer between 1 and 10000.");
  });
});

// ---------------------------------------------------------------------------
// AC4 — Cross-field check: newAccountMaxHits <= maxHits
// ---------------------------------------------------------------------------

describe("loadEnvironment — cross-field newAccountMaxHits <= maxHits (AC4)", () => {
  it("throws when THROTTLE_NEW_ACCOUNT_MAX_HITS > THROTTLE_MAX_HITS", () => {
    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnv(),
        THROTTLE_MAX_HITS: "10",
        THROTTLE_NEW_ACCOUNT_MAX_HITS: "11"
      })
    ).toThrowError("THROTTLE_NEW_ACCOUNT_MAX_HITS must be less than or equal to THROTTLE_MAX_HITS.");
  });

  it("does NOT throw when THROTTLE_NEW_ACCOUNT_MAX_HITS equals THROTTLE_MAX_HITS", () => {
    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnv(),
        THROTTLE_MAX_HITS: "10",
        THROTTLE_NEW_ACCOUNT_MAX_HITS: "10"
      })
    ).not.toThrow();
  });

  it("does NOT throw when THROTTLE_NEW_ACCOUNT_MAX_HITS is less than THROTTLE_MAX_HITS", () => {
    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnv(),
        THROTTLE_MAX_HITS: "10",
        THROTTLE_NEW_ACCOUNT_MAX_HITS: "5"
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC4 — Valid throttle config is parsed into environment.throttle
// ---------------------------------------------------------------------------

describe("loadEnvironment — throttle config parsed into environment.throttle (AC4)", () => {
  it("returns parsed throttle config with correct values", () => {
    const env = loadEnvironment(process.cwd(), {
      ...createValidEnv(),
      THROTTLE_WINDOW_MS: "30000",
      THROTTLE_MAX_HITS: "100",
      THROTTLE_NEW_ACCOUNT_MAX_HITS: "20",
      THROTTLE_NEW_ACCOUNT_WINDOW_MS: "86400000",
      THROTTLE_MAX_LINKS_PER_POST: "3"
    });

    expect(env.throttle).toMatchObject({
      windowMs: 30000,
      maxHits: 100,
      newAccountMaxHits: 20,
      newAccountWindowMs: 86400000,
      maxLinksPerPost: 3
    });
  });
});
