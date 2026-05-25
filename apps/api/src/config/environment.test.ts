import { describe, expect, it } from "vitest";

import { loadEnvironment } from "./environment";

const createValidEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "development",
  API_PORT: "3001",
  AUTH_PASSWORD_PEPPER: "development-pepper-value",
  AUTH_PASSWORD_BCRYPT_ROUNDS: "12",
  AUTH_SESSION_TTL_MINUTES: "1440",
  AUTH_SESSION_IDLE_TIMEOUT_MINUTES: "120",
  AUTH_TOTP_ISSUER: "SFUS Development",
  AUTH_RECOVERY_CODE_COUNT: "10",
  AUTH_RECOVERY_CODE_LENGTH: "12",
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
      auth: {
        passwordPepper: "development-pepper-value",
        passwordBcryptRounds: 12,
        sessionTtlMinutes: 1440,
        sessionIdleTimeoutMinutes: 120,
        totpIssuer: "SFUS Development",
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
        AUTH_PASSWORD_BCRYPT_ROUNDS: "99",
        AUTH_SESSION_IDLE_TIMEOUT_MINUTES: "2000",
        DB_HOST: "",
        DB_CONNECT_TIMEOUT_MS: "999",
        DB_MIGRATIONS_TABLE: "bad-table-name"
      })
    ).toThrowError(`Invalid API environment configuration:
- NODE_ENV must be one of development, test, or production.
- API_PORT must be an integer between 1 and 65535.
- AUTH_PASSWORD_BCRYPT_ROUNDS must be an integer between 8 and 15.
- AUTH_PASSWORD_PEPPER must be at least 16 characters long.
- AUTH_SESSION_IDLE_TIMEOUT_MINUTES must be less than or equal to AUTH_SESSION_TTL_MINUTES.
- DB_HOST is required.
- DB_CONNECT_TIMEOUT_MS must be an integer between 1000 and 60000.
- DB_MIGRATIONS_TABLE must contain only letters, numbers, or underscores.`);
  });
});
