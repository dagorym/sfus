import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

export type NodeEnvironment = "development" | "test" | "production";

export interface ApplicationEnvironment {
  nodeEnv: NodeEnvironment;
  apiPort: number;
  swaggerEnabled: boolean;
  docs: {
    /**
     * Soft-lock TTL in minutes (DOCS_LOCK_TTL_MINUTES).
     * Default: 30 minutes. Range: 1–1440 minutes (1 minute to 24 hours).
     */
    lockTtlMinutes: number;
  };
  media: {
    uploadMaxSizeBytes: number;
    /** Tighter size cap applied to avatar uploads only (MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES). */
    avatarUploadMaxSizeBytes: number;
    allowedMimeTypes: string[];
    storagePath: string;
  };
  throttle: {
    /** Rate-limit window in milliseconds (THROTTLE_WINDOW_MS). */
    windowMs: number;
    /** Max hits per window for established accounts (THROTTLE_MAX_HITS). */
    maxHits: number;
    /** Max hits per window for new-account tier (THROTTLE_NEW_ACCOUNT_MAX_HITS). */
    newAccountMaxHits: number;
    /**
     * How long (ms) after account creation a user is in the new-account tier
     * (THROTTLE_NEW_ACCOUNT_WINDOW_MS).
     */
    newAccountWindowMs: number;
    /** Maximum number of URLs allowed in a Markdown post body (THROTTLE_MAX_LINKS_PER_POST). */
    maxLinksPerPost: number;
  };
  auth: {
    passwordPepper: string;
    sessionTokenPepper: string;
    sessionTtlMinutes: number;
    sessionIdleTimeoutMinutes: number;
    emailVerificationTtlMinutes: number;
    externalStateTtlMinutes: number;
    totpIssuer: string;
    recoveryCodeCount: number;
    recoveryCodeLength: number;
    externalProviders: {
      google: {
        clientId: string;
        clientSecret: string;
        callbackUrl: string;
      };
      github: {
        clientId: string;
        clientSecret: string;
        callbackUrl: string;
      };
    };
  };
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

  const authPasswordPepper = readRequiredString(source.AUTH_PASSWORD_PEPPER, "AUTH_PASSWORD_PEPPER", errors);
  const authSessionTokenPepper = readRequiredString(
    source.AUTH_SESSION_TOKEN_PEPPER,
    "AUTH_SESSION_TOKEN_PEPPER",
    errors
  );
  const authSessionTtlMinutes = parseInteger(
    source.AUTH_SESSION_TTL_MINUTES,
    "AUTH_SESSION_TTL_MINUTES",
    { min: 5, max: 43200 },
    errors
  );
  const authSessionIdleTimeoutMinutes = parseInteger(
    source.AUTH_SESSION_IDLE_TIMEOUT_MINUTES,
    "AUTH_SESSION_IDLE_TIMEOUT_MINUTES",
    { min: 5, max: 10080 },
    errors
  );
  const authEmailVerificationTtlMinutes = parseInteger(
    source.AUTH_EMAIL_VERIFICATION_TTL_MINUTES,
    "AUTH_EMAIL_VERIFICATION_TTL_MINUTES",
    { min: 5, max: 10080 },
    errors
  );
  const authExternalStateTtlMinutes = parseInteger(
    source.AUTH_EXTERNAL_STATE_TTL_MINUTES,
    "AUTH_EXTERNAL_STATE_TTL_MINUTES",
    { min: 5, max: 60 },
    errors
  );
  const authTotpIssuer = readRequiredString(source.AUTH_TOTP_ISSUER, "AUTH_TOTP_ISSUER", errors);
  const authGoogleClientId = readRequiredString(
    source.AUTH_GOOGLE_CLIENT_ID,
    "AUTH_GOOGLE_CLIENT_ID",
    errors
  );
  const authGoogleClientSecret = readRequiredString(
    source.AUTH_GOOGLE_CLIENT_SECRET,
    "AUTH_GOOGLE_CLIENT_SECRET",
    errors
  );
  const authGoogleCallbackUrl = readRequiredString(
    source.AUTH_GOOGLE_CALLBACK_URL,
    "AUTH_GOOGLE_CALLBACK_URL",
    errors
  );
  const authGitHubClientId = readRequiredString(
    source.AUTH_GITHUB_CLIENT_ID,
    "AUTH_GITHUB_CLIENT_ID",
    errors
  );
  const authGitHubClientSecret = readRequiredString(
    source.AUTH_GITHUB_CLIENT_SECRET,
    "AUTH_GITHUB_CLIENT_SECRET",
    errors
  );
  const authGitHubCallbackUrl = readRequiredString(
    source.AUTH_GITHUB_CALLBACK_URL,
    "AUTH_GITHUB_CALLBACK_URL",
    errors
  );
  const authRecoveryCodeCount = parseInteger(
    source.AUTH_RECOVERY_CODE_COUNT,
    "AUTH_RECOVERY_CODE_COUNT",
    { min: 6, max: 20 },
    errors
  );
  const authRecoveryCodeLength = parseInteger(
    source.AUTH_RECOVERY_CODE_LENGTH,
    "AUTH_RECOVERY_CODE_LENGTH",
    { min: 8, max: 16 },
    errors
  );

  if (authPasswordPepper.length > 0 && authPasswordPepper.length < 16) {
    errors.push("AUTH_PASSWORD_PEPPER must be at least 16 characters long.");
  }

  if (authSessionTokenPepper.length > 0 && authSessionTokenPepper.length < 16) {
    errors.push("AUTH_SESSION_TOKEN_PEPPER must be at least 16 characters long.");
  }

  if (authSessionIdleTimeoutMinutes > authSessionTtlMinutes) {
    errors.push("AUTH_SESSION_IDLE_TIMEOUT_MINUTES must be less than or equal to AUTH_SESSION_TTL_MINUTES.");
  }

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

  const mediaUploadMaxSizeBytes = parseInteger(
    source.MEDIA_UPLOAD_MAX_SIZE_BYTES,
    "MEDIA_UPLOAD_MAX_SIZE_BYTES",
    { min: 1024, max: 20971520 },
    errors
  );
  const mediaAvatarUploadMaxSizeBytes = parseInteger(
    source.MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES,
    "MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES",
    { min: 1024, max: 2097152 },
    errors
  );
  const mediaAllowedMimeTypes = parseMimeTypeList(
    source.MEDIA_ALLOWED_MIME_TYPES,
    "MEDIA_ALLOWED_MIME_TYPES",
    errors
  );
  const mediaStoragePath = readRequiredString(source.MEDIA_STORAGE_PATH, "MEDIA_STORAGE_PATH", errors);

  // ---------------------------------------------------------------------------
  // Throttle / rate-limit configuration
  // ---------------------------------------------------------------------------

  const throttleWindowMs = parseInteger(
    source.THROTTLE_WINDOW_MS,
    "THROTTLE_WINDOW_MS",
    { min: 1000, max: 3600000 },
    errors
  );
  const throttleMaxHits = parseInteger(
    source.THROTTLE_MAX_HITS,
    "THROTTLE_MAX_HITS",
    { min: 1, max: 10000 },
    errors
  );
  const throttleNewAccountMaxHits = parseInteger(
    source.THROTTLE_NEW_ACCOUNT_MAX_HITS,
    "THROTTLE_NEW_ACCOUNT_MAX_HITS",
    { min: 1, max: 10000 },
    errors
  );
  const throttleNewAccountWindowMs = parseInteger(
    source.THROTTLE_NEW_ACCOUNT_WINDOW_MS,
    "THROTTLE_NEW_ACCOUNT_WINDOW_MS",
    { min: 60000, max: 2592000000 },
    errors
  );
  const throttleMaxLinksPerPost = parseInteger(
    source.THROTTLE_MAX_LINKS_PER_POST,
    "THROTTLE_MAX_LINKS_PER_POST",
    { min: 0, max: 100 },
    errors
  );

  if (throttleNewAccountMaxHits > throttleMaxHits) {
    errors.push("THROTTLE_NEW_ACCOUNT_MAX_HITS must be less than or equal to THROTTLE_MAX_HITS.");
  }

  // ---------------------------------------------------------------------------
  // Docs / wiki configuration
  // ---------------------------------------------------------------------------

  const docsLockTtlMinutes = parseOptionalInteger(
    source.DOCS_LOCK_TTL_MINUTES,
    "DOCS_LOCK_TTL_MINUTES",
    { min: 1, max: 1440, defaultValue: 30 },
    errors
  );

  if (errors.length > 0) {
    throw new Error(`Invalid API environment configuration:\n- ${errors.join("\n- ")}`);
  }

  return {
    nodeEnv,
    apiPort,
    swaggerEnabled,
    docs: {
      lockTtlMinutes: docsLockTtlMinutes
    },
    media: {
      uploadMaxSizeBytes: mediaUploadMaxSizeBytes,
      avatarUploadMaxSizeBytes: mediaAvatarUploadMaxSizeBytes,
      allowedMimeTypes: mediaAllowedMimeTypes,
      storagePath: mediaStoragePath
    },
    throttle: {
      windowMs: throttleWindowMs,
      maxHits: throttleMaxHits,
      newAccountMaxHits: throttleNewAccountMaxHits,
      newAccountWindowMs: throttleNewAccountWindowMs,
      maxLinksPerPost: throttleMaxLinksPerPost
    },
    auth: {
      passwordPepper: authPasswordPepper,
      sessionTokenPepper: authSessionTokenPepper,
      sessionTtlMinutes: authSessionTtlMinutes,
      sessionIdleTimeoutMinutes: authSessionIdleTimeoutMinutes,
      emailVerificationTtlMinutes: authEmailVerificationTtlMinutes,
      externalStateTtlMinutes: authExternalStateTtlMinutes,
      totpIssuer: authTotpIssuer,
      recoveryCodeCount: authRecoveryCodeCount,
      recoveryCodeLength: authRecoveryCodeLength,
      externalProviders: {
        google: {
          clientId: authGoogleClientId,
          clientSecret: authGoogleClientSecret,
          callbackUrl: authGoogleCallbackUrl
        },
        github: {
          clientId: authGitHubClientId,
          clientSecret: authGitHubClientSecret,
          callbackUrl: authGitHubCallbackUrl
        }
      }
    },
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

/**
 * Like `parseInteger` but allows the env var to be absent/empty, falling back
 * to a `defaultValue` in that case. Still validates range when a value is set.
 */
const parseOptionalInteger = (
  value: string | undefined,
  name: string,
  range: { min: number; max: number; defaultValue: number },
  errors: string[]
): number => {
  const normalized = value?.trim() || "";

  if (!normalized) {
    return range.defaultValue;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isInteger(parsed) || parsed < range.min || parsed > range.max) {
    errors.push(`${name} must be an integer between ${range.min} and ${range.max}.`);
    return range.defaultValue;
  }

  return parsed;
};

const mimeTypePattern = /^[a-zA-Z0-9!#$&\-^_]+\/[a-zA-Z0-9!#$&\-^_.+]+$/;

const parseMimeTypeList = (
  value: string | undefined,
  name: string,
  errors: string[]
): string[] => {
  const normalized = value?.trim() || "";

  if (!normalized) {
    errors.push(`${name} is required.`);
    return [];
  }

  const types = normalized
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (types.length === 0) {
    errors.push(`${name} must contain at least one MIME type.`);
    return [];
  }

  for (const t of types) {
    if (!mimeTypePattern.test(t)) {
      errors.push(`${name} contains an invalid MIME type: "${t}".`);
      return types;
    }
  }

  return types;
};
