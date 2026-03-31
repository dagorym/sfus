import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

export type NodeEnvironment = "development" | "test" | "production";

export interface ApplicationEnvironment {
  nodeEnv: NodeEnvironment;
  apiPort: number;
  swaggerEnabled: boolean;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    connectTimeoutMs: number;
    migrationsTableName: string;
  };
}

const allowedNodeEnvironments = new Set<NodeEnvironment>(["development", "test", "production"]);
const truthyValues = new Set(["1", "true", "yes", "on"]);
const falsyValues = new Set(["0", "false", "no", "off"]);
const migrationsTablePattern = /^[A-Za-z0-9_]+$/;

export const loadEnvironment = (
  currentWorkingDirectory = process.cwd(),
  source: NodeJS.ProcessEnv = process.env
): ApplicationEnvironment => {
  loadEnvFile(currentWorkingDirectory);

  const errors: string[] = [];

  const nodeEnv = parseNodeEnvironment(source.NODE_ENV, errors);
  const apiPort = parseInteger(source.API_PORT, "API_PORT", { min: 1, max: 65535 }, errors);
  const swaggerEnabled = parseBoolean(
    source.API_SWAGGER_ENABLED,
    "API_SWAGGER_ENABLED",
    nodeEnv !== "production",
    errors
  );

  const dbHost = readRequiredString(source.DB_HOST, "DB_HOST", errors);
  const dbPort = parseInteger(source.DB_PORT, "DB_PORT", { min: 1, max: 65535 }, errors);
  const dbName = readRequiredString(source.DB_NAME, "DB_NAME", errors);
  const dbUser = readRequiredString(source.DB_USER, "DB_USER", errors);
  const dbPassword = readRequiredString(source.DB_PASSWORD, "DB_PASSWORD", errors);
  const dbConnectTimeoutMs = parseInteger(
    source.DB_CONNECT_TIMEOUT_MS,
    "DB_CONNECT_TIMEOUT_MS",
    { min: 1000, max: 60000 },
    errors
  );
  const migrationsTableName = readRequiredString(
    source.DB_MIGRATIONS_TABLE,
    "DB_MIGRATIONS_TABLE",
    errors
  );

  if (migrationsTableName && !migrationsTablePattern.test(migrationsTableName)) {
    errors.push("DB_MIGRATIONS_TABLE must contain only letters, numbers, or underscores.");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid API environment configuration:\n- ${errors.join("\n- ")}`);
  }

  return {
    nodeEnv,
    apiPort,
    swaggerEnabled,
    db: {
      host: dbHost,
      port: dbPort,
      name: dbName,
      user: dbUser,
      password: dbPassword,
      connectTimeoutMs: dbConnectTimeoutMs,
      migrationsTableName
    }
  };
};

const loadEnvFile = (currentWorkingDirectory: string): void => {
  const explicitPath = process.env.SFUS_API_ENV_FILE;
  const candidatePaths = explicitPath
    ? [path.resolve(currentWorkingDirectory, explicitPath)]
    : [
        path.resolve(currentWorkingDirectory, "apps/api/.env"),
        path.resolve(currentWorkingDirectory, ".env"),
        path.resolve(__dirname, "../.env")
      ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
    }
  }
};

const parseNodeEnvironment = (
  value: string | undefined,
  errors: string[]
): NodeEnvironment => {
  const normalized = value?.trim() || "development";

  if (!allowedNodeEnvironments.has(normalized as NodeEnvironment)) {
    errors.push("NODE_ENV must be one of development, test, or production.");
    return "development";
  }

  return normalized as NodeEnvironment;
};

const readRequiredString = (
  value: string | undefined,
  name: string,
  errors: string[]
): string => {
  const normalized = value?.trim() || "";

  if (!normalized) {
    errors.push(`${name} is required.`);
  }

  return normalized;
};

const parseInteger = (
  value: string | undefined,
  name: string,
  range: { min: number; max: number },
  errors: string[]
): number => {
  const normalized = value?.trim() || "";

  if (!normalized) {
    errors.push(`${name} is required.`);
    return range.min;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isInteger(parsed) || parsed < range.min || parsed > range.max) {
    errors.push(`${name} must be an integer between ${range.min} and ${range.max}.`);
    return range.min;
  }

  return parsed;
};

const parseBoolean = (
  value: string | undefined,
  name: string,
  defaultValue: boolean,
  errors: string[]
): boolean => {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  if (truthyValues.has(normalized)) {
    return true;
  }

  if (falsyValues.has(normalized)) {
    return false;
  }

  errors.push(`${name} must be a boolean value (true/false).`);
  return defaultValue;
};
