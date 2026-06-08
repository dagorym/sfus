import { describe, expect, it } from "vitest";

import { loadEnvironment } from "./environment";

const createValidEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "development",
  API_PORT: "3001",
  AUTH_PASSWORD_PEPPER: "development-pepper-value",
  AUTH_SESSION_TOKEN_PEPPER: "development-session-token-pepper",
  AUTH_SESSION_TTL_MINUTES: "1440",
  AUTH_SESSION_IDLE_TIMEOUT_MINUTES: "120",
  AUTH_EMAIL_VERIFICATION_TTL_MINUTES: "60",
  AUTH_EXTERNAL_STATE_TTL_MINUTES: "10",
  AUTH_TOTP_ISSUER: "SFUS Development",
  AUTH_GOOGLE_CLIENT_ID: "google-client-id",
  AUTH_GOOGLE_CLIENT_SECRET: "google-client-secret",
  AUTH_GOOGLE_CALLBACK_URL: "http://localhost:3001/api/auth/external/google/callback",
  AUTH_GITHUB_CLIENT_ID: "github-client-id",
  AUTH_GITHUB_CLIENT_SECRET: "github-client-secret",
  AUTH_GITHUB_CALLBACK_URL: "http://localhost:3001/api/auth/external/github/callback",
  AUTH_RECOVERY_CODE_COUNT: "10",
  AUTH_RECOVERY_CODE_LENGTH: "12",
  MEDIA_UPLOAD_MAX_SIZE_BYTES: "5242880",
  MEDIA_ALLOWED_MIME_TYPES: "image/jpeg,image/png,image/gif,image/webp",
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
});

describe("loadEnvironment", () => {
  it("parses a valid API environment and enables Swagger by default outside production", () => {
    const environment = loadEnvironment(process.cwd(), createValidEnvironment());

    expect(environment).toMatchObject({
      nodeEnv: "development",
      apiPort: 3001,
      swaggerEnabled: true,
      media: {
        uploadMaxSizeBytes: 5242880,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        storagePath: "./storage/uploads"
      },
      throttle: {
        windowMs: 60000,
        maxHits: 60,
        newAccountMaxHits: 10,
        newAccountWindowMs: 604800000,
        maxLinksPerPost: 5
      },
      auth: {
        passwordPepper: "development-pepper-value",
        sessionTokenPepper: "development-session-token-pepper",
        sessionTtlMinutes: 1440,
        sessionIdleTimeoutMinutes: 120,
        emailVerificationTtlMinutes: 60,
        externalStateTtlMinutes: 10,
        totpIssuer: "SFUS Development",
        externalProviders: {
          google: {
            clientId: "google-client-id",
            clientSecret: "google-client-secret",
            callbackUrl: "http://localhost:3001/api/auth/external/google/callback"
          },
          github: {
            clientId: "github-client-id",
            clientSecret: "github-client-secret",
            callbackUrl: "http://localhost:3001/api/auth/external/github/callback"
          }
        },
        recoveryCodeCount: 10,
        recoveryCodeLength: 12
      },
      db: {
        host: "mysql",
        port: 3306,
        name: "sfus",
        user: "sfus",
        password: "secret",
        connectTimeoutMs: 5000,
        migrationsTableName: "sfus_migrations"
      }
    });
  });

  it("disables Swagger by default in production unless explicitly enabled", () => {
    const environment = loadEnvironment(process.cwd(), {
      ...createValidEnvironment(),
      NODE_ENV: "production"
    });

    expect(environment.swaggerEnabled).toBe(false);
  });

  it("throws for missing and invalid required values before boot", () => {
    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnvironment(),
        NODE_ENV: "staging",
        API_PORT: "70000",
        AUTH_PASSWORD_PEPPER: "short",
        AUTH_SESSION_TOKEN_PEPPER: "short",
        AUTH_SESSION_IDLE_TIMEOUT_MINUTES: "2000",
        AUTH_EMAIL_VERIFICATION_TTL_MINUTES: "1",
        AUTH_EXTERNAL_STATE_TTL_MINUTES: "1",
        DB_HOST: "",
        DB_CONNECT_TIMEOUT_MS: "999",
        DB_MIGRATIONS_TABLE: "bad-table-name"
      })
    ).toThrowError(`Invalid API environment configuration:
- NODE_ENV must be one of development, test, or production.
- API_PORT must be an integer between 1 and 65535.
- AUTH_EMAIL_VERIFICATION_TTL_MINUTES must be an integer between 5 and 10080.
- AUTH_EXTERNAL_STATE_TTL_MINUTES must be an integer between 5 and 60.
- AUTH_PASSWORD_PEPPER must be at least 16 characters long.
- AUTH_SESSION_TOKEN_PEPPER must be at least 16 characters long.
- AUTH_SESSION_IDLE_TIMEOUT_MINUTES must be less than or equal to AUTH_SESSION_TTL_MINUTES.
- DB_HOST is required.
- DB_CONNECT_TIMEOUT_MS must be an integer between 1000 and 60000.
- DB_MIGRATIONS_TABLE must contain only letters, numbers, or underscores.`);
  });

  it("throws when MEDIA_UPLOAD_MAX_SIZE_BYTES is missing or out of range", () => {
    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnvironment(),
        MEDIA_UPLOAD_MAX_SIZE_BYTES: ""
      })
    ).toThrowError("MEDIA_UPLOAD_MAX_SIZE_BYTES is required.");

    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnvironment(),
        MEDIA_UPLOAD_MAX_SIZE_BYTES: "20971521"
      })
    ).toThrowError("MEDIA_UPLOAD_MAX_SIZE_BYTES must be an integer between 1024 and 20971520.");
  });

  it("throws when MEDIA_ALLOWED_MIME_TYPES is missing or contains an invalid type", () => {
    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnvironment(),
        MEDIA_ALLOWED_MIME_TYPES: ""
      })
    ).toThrowError("MEDIA_ALLOWED_MIME_TYPES is required.");

    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnvironment(),
        MEDIA_ALLOWED_MIME_TYPES: "image/jpeg,not-valid"
      })
    ).toThrowError('MEDIA_ALLOWED_MIME_TYPES contains an invalid MIME type: "not-valid".');
  });

  it("throws when MEDIA_STORAGE_PATH is missing", () => {
    expect(() =>
      loadEnvironment(process.cwd(), {
        ...createValidEnvironment(),
        MEDIA_STORAGE_PATH: ""
      })
    ).toThrowError("MEDIA_STORAGE_PATH is required.");
  });
});
