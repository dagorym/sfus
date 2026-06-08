import crypto from "node:crypto";
import argon2 from "argon2";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ApplicationEnvironment } from "../config/environment";
import { AuthorizationService } from "../authorization/authorization.service";
import { AuthorizationGrantEntity } from "../authorization/entities/authorization-grant.entity";
import { AuthService } from "./auth.service";
import type { ExternalAuthProviderRegistry } from "./external-auth-provider.registry";
import { AuthIdentityEntity } from "./entities/auth-identity.entity";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { EmailVerificationEntity } from "./entities/email-verification.entity";
import { PasswordAuthenticatorEntity } from "./entities/password-authenticator.entity";
import { TotpRecoveryCodeEntity } from "./entities/totp-recovery-code.entity";
import { TotpSecretEntity } from "./entities/totp-secret.entity";
import { UserEntity } from "../users/entities/user.entity";

type EntityClass =
  | typeof UserEntity
  | typeof AuthIdentityEntity
  | typeof PasswordAuthenticatorEntity
  | typeof AuthSessionEntity
  | typeof EmailVerificationEntity
  | typeof TotpSecretEntity
  | typeof TotpRecoveryCodeEntity
  | typeof AuthorizationGrantEntity;

type RepositoryLike<T extends { id: string }> = {
  data: T[];
  create: (entityLike: Partial<T>) => T;
  save: (entity: T | T[]) => Promise<T | T[]>;
  findOne: (input: { where: Partial<T> }) => Promise<T | null>;
  find: (input: { where: Partial<T> }) => Promise<T[]>;
  delete: (input: Partial<T>) => Promise<void>;
  failNextSave: (error: Error) => void;
  manager?: {
    transaction: <TResult>(
      callback: (entityManager: { getRepository: (entity: EntityClass) => RepositoryLike<{ id: string }> }) => Promise<TResult>
    ) => Promise<TResult>;
  };
};

const createRepository = <T extends { id: string }>(): RepositoryLike<T> => {
  const data: T[] = [];
  let nextSaveError: Error | null = null;

  return {
    data,
    create: (entityLike: Partial<T>) => entityLike as T,
    save: async (entity: T | T[]): Promise<T | T[]> => {
      const entities = Array.isArray(entity) ? entity : [entity];
      if (nextSaveError) {
        const error = nextSaveError;
        nextSaveError = null;
        throw error;
      }

      for (const entry of entities) {
        const existingIndex = data.findIndex((current) => current.id === entry.id);
        if (existingIndex >= 0) {
          data[existingIndex] = entry;
        } else {
          data.push(entry);
        }
      }

      return entity;
    },
    findOne: async (input: { where: Partial<T> }): Promise<T | null> => {
      const keys = Object.keys(input.where) as Array<keyof T>;
      const found = data.find((candidate) =>
        keys.every((key) => candidate[key] === input.where[key])
      );
      return found || null;
    },
    find: async (input: { where: Partial<T> }): Promise<T[]> => {
      const keys = Object.keys(input.where) as Array<keyof T>;
      return data.filter((candidate) => keys.every((key) => candidate[key] === input.where[key]));
    },
    delete: async (input: Partial<T>): Promise<void> => {
      const keys = Object.keys(input) as Array<keyof T>;
      if (!keys.length) {
        data.length = 0;
        return;
      }
      const retained = data.filter(
        (candidate) => !keys.every((key) => candidate[key] === input[key])
      );
      data.length = 0;
      data.push(...retained);
    },
    failNextSave: (error: Error): void => {
      nextSaveError = error;
    }
  };
};

const createEnvironment = (): ApplicationEnvironment => ({
  nodeEnv: "development",
  apiPort: 3001,
  swaggerEnabled: true,
  media: {
    uploadMaxSizeBytes: 5242880,
    allowedMimeTypes: ["image/jpeg", "image/png"],
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

const decodeBase32Secret = (secret: string): Buffer => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = secret.replace(/=+$/g, "");
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const createTotpCode = (secret: string): string => {
  const key = decodeBase32Secret(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
};

const createService = (
  providerRegistry: ExternalAuthProviderRegistry = {
    resolve: (provider: string) => {
      throw new Error(`Unexpected provider lookup: ${provider}`);
    }
  }
) => {
  const usersRepository = createRepository<UserEntity>();
  const authIdentitiesRepository = createRepository<AuthIdentityEntity>();
  const passwordAuthenticatorsRepository = createRepository<PasswordAuthenticatorEntity>();
  const authSessionsRepository = createRepository<AuthSessionEntity>();
  const emailVerificationsRepository = createRepository<EmailVerificationEntity>();
  const totpSecretsRepository = createRepository<TotpSecretEntity>();
  const totpRecoveryCodesRepository = createRepository<TotpRecoveryCodeEntity>();
  const authorizationGrantsRepository = createRepository<AuthorizationGrantEntity>();

  const repositoryByEntity = new Map<EntityClass, RepositoryLike<{ id: string }>>([
    [UserEntity, usersRepository as unknown as RepositoryLike<{ id: string }>],
    [AuthIdentityEntity, authIdentitiesRepository as unknown as RepositoryLike<{ id: string }>],
    [
      PasswordAuthenticatorEntity,
      passwordAuthenticatorsRepository as unknown as RepositoryLike<{ id: string }>
    ],
    [AuthSessionEntity, authSessionsRepository as unknown as RepositoryLike<{ id: string }>],
    [EmailVerificationEntity, emailVerificationsRepository as unknown as RepositoryLike<{ id: string }>],
    [TotpSecretEntity, totpSecretsRepository as unknown as RepositoryLike<{ id: string }>],
    [TotpRecoveryCodeEntity, totpRecoveryCodesRepository as unknown as RepositoryLike<{ id: string }>],
    [AuthorizationGrantEntity, authorizationGrantsRepository as unknown as RepositoryLike<{ id: string }>]
  ]);

  const cloneRepositoryData = () =>
    new Map(
      [...repositoryByEntity.entries()].map(([entity, repository]) => [
        entity,
        repository.data.map((entry) => ({ ...entry }))
      ])
    );

  const restoreRepositoryData = (
    snapshot: Map<EntityClass, Array<{ id: string }>>
  ): void => {
    for (const [entity, repository] of repositoryByEntity.entries()) {
      const entries = snapshot.get(entity) || [];
      repository.data.length = 0;
      repository.data.push(...entries);
    }
  };

  const manager = {
    transaction: async <TResult>(
      callback: (entityManager: { getRepository: (entity: EntityClass) => RepositoryLike<{ id: string }> }) => Promise<TResult>
    ): Promise<TResult> => {
      const snapshot = cloneRepositoryData();
      try {
        return await callback({
          getRepository: (entity: EntityClass): RepositoryLike<{ id: string }> => {
            const repository = repositoryByEntity.get(entity);
            if (!repository) {
              throw new Error(`Unknown repository for entity: ${entity.name}`);
            }

            return repository;
          }
        });
      } catch (error) {
        restoreRepositoryData(snapshot as Map<EntityClass, Array<{ id: string }>>);
        throw error;
      }
    }
  };

  usersRepository.manager = manager;
  authIdentitiesRepository.manager = manager;
  passwordAuthenticatorsRepository.manager = manager;
  authSessionsRepository.manager = manager;
  emailVerificationsRepository.manager = manager;
  totpSecretsRepository.manager = manager;
  totpRecoveryCodesRepository.manager = manager;
  authorizationGrantsRepository.manager = manager;

  const dataSource = {
    isInitialized: true,
    initialize: vi.fn(async () => {
      dataSource.isInitialized = true;
      return dataSource;
    })
  };

  const service = new AuthService(
    dataSource as never,
    usersRepository as never,
    authIdentitiesRepository as never,
    passwordAuthenticatorsRepository as never,
    authSessionsRepository as never,
    emailVerificationsRepository as never,
    totpSecretsRepository as never,
    totpRecoveryCodesRepository as never,
    authorizationGrantsRepository as never,
    createEnvironment(),
    providerRegistry,
    new AuthorizationService()
  );

  return {
    service,
    usersRepository,
    authIdentitiesRepository,
    passwordAuthenticatorsRepository,
    authSessionsRepository,
    emailVerificationsRepository,
    totpSecretsRepository,
    totpRecoveryCodesRepository,
    authorizationGrantsRepository,
    providerRegistry
  };
};

const expectPasswordSession = (
  result: Awaited<ReturnType<AuthService["loginWithPassword"]>>
): Exclude<Awaited<ReturnType<AuthService["loginWithPassword"]>>, { mfa: unknown }> => {
  if ("mfa" in result) {
    throw new Error("Expected direct session login, but MFA challenge was returned.");
  }
  return result;
};

const expectExternalSession = (
  result: Awaited<ReturnType<AuthService["loginWithExternalProvider"]>>
): Exclude<Awaited<ReturnType<AuthService["loginWithExternalProvider"]>>, { mfa: unknown }> => {
  if ("mfa" in result) {
    throw new Error("Expected external session login, but MFA challenge was returned.");
  }
  return result;
};

describe("AuthService", () => {
  it("initializes the data source lazily before registration", async () => {
    const {
      service
    } = createService();

    const dataSource = service["dataSource"] as unknown as {
      isInitialized: boolean;
      initialize: ReturnType<typeof vi.fn>;
    };
    dataSource.isInitialized = false;

    await service.registerAccount({
      email: "lazy-init@example.com",
      username: "lazy_init",
      password: "super-secure-password"
    });

    expect(dataSource.initialize).toHaveBeenCalledTimes(1);
  });

  it("registers a user with an Argon2id password hash and issues a verification token", async () => {
    const {
      service,
      usersRepository,
      authIdentitiesRepository,
      passwordAuthenticatorsRepository,
      emailVerificationsRepository
    } = createService();

    const registration = await service.registerAccount({
      email: "Test.User@Example.com",
      username: "test_user",
      password: "super-secure-password"
    });

    expect(registration.user.email).toBe("test.user@example.com");
    expect(registration.emailVerification.required).toBe(true);
    expect(registration.emailVerification.token).toBeTruthy();
    expect(usersRepository.data).toHaveLength(1);
    expect(authIdentitiesRepository.data).toHaveLength(1);
    expect(passwordAuthenticatorsRepository.data).toHaveLength(1);
    expect(emailVerificationsRepository.data).toHaveLength(1);
    expect(passwordAuthenticatorsRepository.data[0]?.passwordHash.startsWith("$argon2id$")).toBe(true);
    await expect(
      argon2.verify(
        passwordAuthenticatorsRepository.data[0]!.passwordHash,
        "super-secure-passworddevelopment-pepper-value"
      )
    ).resolves.toBe(true);
  });

  it("rejects malformed auth inputs with bad-request responses", async () => {
    const { service } = createService();

    await expect(service.registerAccount({} as never)).rejects.toThrowError(
      "A valid email address is required."
    );
    await expect(service.loginWithPassword({ email: null, password: "x" } as never, {})).rejects.toThrowError(
      "Email and password are required."
    );
    await expect(service.verifyEmailToken({ token: null } as never)).rejects.toThrowError(
      "Verification token is required."
    );
  });

  it("rolls back registration writes when a mid-flow save fails", async () => {
    const {
      service,
      usersRepository,
      authIdentitiesRepository,
      passwordAuthenticatorsRepository,
      emailVerificationsRepository
    } = createService();

    passwordAuthenticatorsRepository.failNextSave(new Error("write failure"));

    await expect(
      service.registerAccount({
        email: "rollback@example.com",
        username: "rollback_user",
        password: "super-secure-password"
      })
    ).rejects.toThrowError("write failure");

    expect(usersRepository.data).toHaveLength(0);
    expect(authIdentitiesRepository.data).toHaveLength(0);
    expect(passwordAuthenticatorsRepository.data).toHaveLength(0);
    expect(emailVerificationsRepository.data).toHaveLength(0);
  });

  it("rejects duplicate registration by email", async () => {
    const { service } = createService();
    await service.registerAccount({
      email: "duplicate@example.com",
      username: "duplicate_one",
      password: "super-secure-password"
    });

    const duplicateRegistration = service.registerAccount({
      email: "duplicate@example.com",
      username: "duplicate_two",
      password: "super-secure-password"
    });
    await expect(duplicateRegistration).rejects.toThrowError("An account with this email already exists.");
    await expect(duplicateRegistration).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects duplicate registration by username", async () => {
    const { service } = createService();
    await service.registerAccount({
      email: "username-duplicate-one@example.com",
      username: "duplicate_user",
      password: "super-secure-password"
    });

    const duplicateRegistration = service.registerAccount({
      email: "username-duplicate-two@example.com",
      username: "duplicate_user",
      password: "super-secure-password"
    });
    await expect(duplicateRegistration).rejects.toThrowError("This username is already in use.");
    await expect(duplicateRegistration).rejects.toBeInstanceOf(ConflictException);
  });

  it("requires email verification before login", async () => {
    const { service } = createService();
    await service.registerAccount({
      email: "verify-first@example.com",
      username: "verify_first",
      password: "super-secure-password"
    });

    await expect(
      service.loginWithPassword(
        {
          email: "verify-first@example.com",
          password: "super-secure-password"
        },
        {}
      )
    ).rejects.toThrowError("Email verification required before login.");
  });

  it("verifies email, logs in, resolves session, and revokes on logout", async () => {
    const { service } = createService();
    const registration = await service.registerAccount({
      email: "flow@example.com",
      username: "flow_user",
      password: "super-secure-password"
    });
    const verificationToken = registration.emailVerification.token!;

    await expect(service.verifyEmailToken(verificationToken)).resolves.toMatchObject({
      user: {
        emailVerified: true
      }
    });

    const login = expectPasswordSession(
      await service.loginWithPassword(
      {
        email: "flow@example.com",
        password: "super-secure-password"
      },
      {
        ipAddress: "127.0.0.1",
        userAgent: "vitest"
      }
      )
    );
    expect(login.sessionToken).toBeTruthy();
    await expect(
      service.resolveSession({
        cookieHeader: `sfus_session=${login.sessionToken}`
      })
    ).resolves.toMatchObject({
      user: {
        email: "flow@example.com"
      },
      session: {
        id: login.session.id
      }
    });

    await expect(
      service.logout({
        cookieHeader: `sfus_session=${login.sessionToken}`
      })
    ).resolves.toBeUndefined();

    await expect(
      service.resolveSession({
        cookieHeader: `sfus_session=${login.sessionToken}`
      })
    ).rejects.toThrowError("Authentication required.");
  });

  it("rejects expired verification tokens", async () => {
    const { service, emailVerificationsRepository } = createService();
    const registration = await service.registerAccount({
      email: "expired-token@example.com",
      username: "expired_token",
      password: "super-secure-password"
    });

    emailVerificationsRepository.data[0]!.expiresAt = new Date(Date.now() - 1_000);

    await expect(service.verifyEmailToken(registration.emailVerification.token!)).rejects.toThrowError(
      "Invalid or expired verification token."
    );
  });

  it("rejects replayed verification tokens after consumption", async () => {
    const { service } = createService();
    const registration = await service.registerAccount({
      email: "replay-token@example.com",
      username: "replay_token",
      password: "super-secure-password"
    });

    const token = registration.emailVerification.token!;
    await service.verifyEmailToken(token);

    await expect(service.verifyEmailToken(token)).rejects.toThrowError(
      "Invalid or expired verification token."
    );
  });

  it("revokes sessions that exceed the absolute expiry boundary", async () => {
    const { service, authSessionsRepository } = createService();
    const registration = await service.registerAccount({
      email: "absolute-expiry@example.com",
      username: "absolute_expiry",
      password: "super-secure-password"
    });

    await service.verifyEmailToken(registration.emailVerification.token!);
    const login = expectPasswordSession(
      await service.loginWithPassword(
      {
        email: "absolute-expiry@example.com",
        password: "super-secure-password"
      },
      {}
      )
    );

    authSessionsRepository.data[0]!.expiresAt = new Date(Date.now() - 1_000);

    await expect(
      service.resolveSession({
        cookieHeader: `sfus_session=${login.sessionToken}`
      })
    ).rejects.toThrowError("Session has expired.");
    expect(authSessionsRepository.data[0]!.state).toBe("revoked");
  });

  it("revokes sessions that exceed the idle-timeout boundary", async () => {
    const { service, authSessionsRepository } = createService();
    const registration = await service.registerAccount({
      email: "idle-expiry@example.com",
      username: "idle_expiry",
      password: "super-secure-password"
    });

    await service.verifyEmailToken(registration.emailVerification.token!);
    const login = expectPasswordSession(
      await service.loginWithPassword(
      {
        email: "idle-expiry@example.com",
        password: "super-secure-password"
      },
      {}
      )
    );

    authSessionsRepository.data[0]!.lastSeenAt = new Date(Date.now() - 121 * 60_000);
    authSessionsRepository.data[0]!.expiresAt = new Date(Date.now() + 60_000);

    await expect(
      service.resolveSession({
        cookieHeader: `sfus_session=${login.sessionToken}`
      })
    ).rejects.toThrowError("Session has expired.");
    expect(authSessionsRepository.data[0]!.state).toBe("revoked");
  });

  it("creates pending users for first-time external identities and gates onboarding", async () => {
    const { service, authIdentitiesRepository } = createService({
      resolve: (provider: string) => ({
        provider,
        getAuthorizationUrl: (state: string) => `https://example.test/${provider}/auth?state=${state}`,
        exchangeCodeForIdentity: async () => ({
          provider,
          subject: "provider-subject",
          email: "external@example.com",
          emailVerified: true,
          displayName: "External User"
        })
      })
    });

    const start = service.startExternalAuth("google", "/app");
    expect(start.authorizationUrl).toContain("https://example.test/google/auth?state=");

    const callback = expectExternalSession(
      await service.loginWithExternalProvider(
      {
        provider: "google",
        code: "auth-code",
        state: start.authorizationUrl.split("state=")[1]
      },
      {
        cookieHeader: `${service.getExternalAuthStateCookieName()}=${start.stateCookieValue}`
      }
      )
    );

    expect(callback.redirectPath).toBe("/onboarding/username");
    expect(callback.user.onboardingRequired).toBe(true);
    expect(callback.user.status).toBe("onboarding_required");
    expect(authIdentitiesRepository.data[0]).toMatchObject({
      provider: "google",
      providerSubject: "provider-subject",
      providerEmail: "external@example.com"
    });

    const completed = await service.completeExternalOnboarding(
      {
        username: "external_user"
      },
      {
        cookieHeader: `sfus_session=${callback.sessionToken}`
      }
    );
    expect(completed.user.onboardingRequired).toBe(false);
    expect(completed.user.username).toBe("external_user");
  });

  it("links external identities to existing users by deterministic email matching", async () => {
    const { service, authIdentitiesRepository } = createService({
      resolve: (provider: string) => ({
        provider,
        getAuthorizationUrl: (state: string) => `https://example.test/${provider}?state=${state}`,
        exchangeCodeForIdentity: async () => ({
          provider,
          subject: "github-subject",
          email: "linked@example.com",
          emailVerified: true,
          displayName: "Linked User"
        })
      })
    });
    const registration = await service.registerAccount({
      email: "linked@example.com",
      username: "linked_local",
      password: "super-secure-password"
    });
    await service.verifyEmailToken(registration.emailVerification.token!);

    const start = service.startExternalAuth("github", "/app");
    const callback = expectExternalSession(
      await service.loginWithExternalProvider(
      {
        provider: "github",
        code: "auth-code",
        state: start.authorizationUrl.split("state=")[1]
      },
      {
        cookieHeader: `${service.getExternalAuthStateCookieName()}=${start.stateCookieValue}`
      }
      )
    );
    expect(callback.user.email).toBe("linked@example.com");
    expect(callback.user.status).toBe("active");
    expect(callback.redirectPath).toBe("/app");
    expect(authIdentitiesRepository.data).toHaveLength(2);
    expect(
      authIdentitiesRepository.data.filter(
        (identity) => identity.provider === "github" && identity.userId === callback.user.id
      )
    ).toHaveLength(1);
  });

  it("rejects external callbacks that are not bound to the initiating browser state cookie", async () => {
    const { service } = createService({
      resolve: (provider: string) => ({
        provider,
        getAuthorizationUrl: (state: string) => `https://example.test/${provider}/auth?state=${state}`,
        exchangeCodeForIdentity: async () => ({
          provider,
          subject: "provider-subject",
          email: "external@example.com",
          emailVerified: true,
          displayName: "External User"
        })
      })
    });

    const start = service.startExternalAuth("google", "/app");
    const state = start.authorizationUrl.split("state=")[1]!;

    await expect(
      service.loginWithExternalProvider(
        {
          provider: "google",
          code: "auth-code",
          state
        },
        {
          cookieHeader: `${service.getExternalAuthStateCookieName()}=different-state`
        }
      )
    ).rejects.toThrowError("Invalid authentication callback state.");
  });

  it("rejects replayed external callback state tokens", async () => {
    const { service } = createService({
      resolve: (provider: string) => ({
        provider,
        getAuthorizationUrl: (state: string) => `https://example.test/${provider}/auth?state=${state}`,
        exchangeCodeForIdentity: async () => ({
          provider,
          subject: "provider-subject",
          email: "external@example.com",
          emailVerified: true,
          displayName: "External User"
        })
      })
    });

    const start = service.startExternalAuth("google", "/app");
    const state = start.authorizationUrl.split("state=")[1]!;
    const cookieHeader = `${service.getExternalAuthStateCookieName()}=${start.stateCookieValue}`;

    await service.loginWithExternalProvider(
      {
        provider: "google",
        code: "auth-code",
        state
      },
      {
        cookieHeader
      }
    );

    await expect(
      service.loginWithExternalProvider(
        {
          provider: "google",
          code: "auth-code-2",
          state
        },
        {
          cookieHeader
        }
      )
    ).rejects.toThrowError("Invalid authentication callback state.");
  });

  it("does not link unverified external emails to existing local accounts", async () => {
    const { service, authIdentitiesRepository, usersRepository } = createService({
      resolve: (provider: string) => ({
        provider,
        getAuthorizationUrl: (state: string) => `https://example.test/${provider}?state=${state}`,
        exchangeCodeForIdentity: async () => ({
          provider,
          subject: "github-unverified-subject",
          email: "linked@example.com",
          emailVerified: false,
          displayName: "Unverified Linked User"
        })
      })
    });
    const registration = await service.registerAccount({
      email: "linked@example.com",
      username: "linked_local",
      password: "super-secure-password"
    });
    await service.verifyEmailToken(registration.emailVerification.token!);

    const start = service.startExternalAuth("github", "/app");
    const callback = expectExternalSession(
      await service.loginWithExternalProvider(
      {
        provider: "github",
        code: "auth-code",
        state: start.authorizationUrl.split("state=")[1]
      },
      {
        cookieHeader: `${service.getExternalAuthStateCookieName()}=${start.stateCookieValue}`
      }
      )
    );

    expect(callback.user.id).not.toBe(registration.user.id);
    expect(callback.user.email).toBe("github_github-unverified-subject@users.noreply.sfus.local");
    expect(callback.user.emailVerified).toBe(false);
    expect(callback.redirectPath).toBe("/onboarding/username");
    expect(usersRepository.data).toHaveLength(2);
    expect(
      authIdentitiesRepository.data.filter(
        (identity) => identity.provider === "github" && identity.userId === callback.user.id
      )
    ).toHaveLength(1);
    expect(
      authIdentitiesRepository.data.find(
        (identity) => identity.provider === "github" && identity.providerSubject === "github-unverified-subject"
      )?.providerEmail
    ).toBeNull();
  });

  it("supports MFA enrollment, challenge verification, and one-time recovery code use", async () => {
    const { service, totpSecretsRepository, totpRecoveryCodesRepository } = createService();
    const registration = await service.registerAccount({
      email: "mfa-user@example.com",
      username: "mfa_user",
      password: "super-secure-password"
    });
    await service.verifyEmailToken(registration.emailVerification.token!);

    const login = expectPasswordSession(
      await service.loginWithPassword(
      {
        email: "mfa-user@example.com",
        password: "super-secure-password"
      },
      {}
      )
    );

    const enrollment = await service.startMfaEnrollment({
      cookieHeader: `sfus_session=${login.sessionToken}`
    });
    expect(enrollment.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enrollment.otpauthUrl).toContain("otpauth://totp/");

    const expectedCode = createTotpCode(enrollment.secret);

    const verified = await service.verifyMfaEnrollment(
      { code: expectedCode },
      {
        cookieHeader: `sfus_session=${login.sessionToken}`
      }
    );
    expect(verified.enabled).toBe(true);
    expect(verified.recoveryCodes).toHaveLength(10);
    expect(totpSecretsRepository.data[0]?.verifiedAt).toBeInstanceOf(Date);
    expect(totpRecoveryCodesRepository.data).toHaveLength(10);

    const secondLogin = await service.loginWithPassword(
      {
        email: "mfa-user@example.com",
        password: "super-secure-password"
      },
      {}
    );
    expect("mfa" in secondLogin).toBe(true);
    if (!("mfa" in secondLogin)) {
      throw new Error("Expected MFA challenge after enrollment.");
    }

    const challengeByRecovery = await service.verifyMfaChallenge(
      {
        challengeToken: secondLogin.mfa.challengeToken,
        recoveryCode: verified.recoveryCodes[0]
      },
      {}
    );
    expect(challengeByRecovery.sessionToken).toBeTruthy();
    const consumed = totpRecoveryCodesRepository.data.find((code) => code.consumedAt !== null);
    expect(consumed).toBeTruthy();

    const thirdLogin = await service.loginWithPassword(
      {
        email: "mfa-user@example.com",
        password: "super-secure-password"
      },
      {}
    );
    if (!("mfa" in thirdLogin)) {
      throw new Error("Expected third login MFA challenge.");
    }
    await expect(
      service.verifyMfaChallenge(
        {
          challengeToken: thirdLogin.mfa.challengeToken,
          recoveryCode: verified.recoveryCodes[0]
        },
        {}
      )
    ).rejects.toThrowError("Invalid MFA verification code.");
  });

  it("regenerates recovery codes and disables MFA with authenticated MFA proof", async () => {
    const { service } = createService();
    const registration = await service.registerAccount({
      email: "mfa-admin@example.com",
      username: "mfa_admin",
      password: "super-secure-password"
    });
    await service.verifyEmailToken(registration.emailVerification.token!);
    const login = expectPasswordSession(
      await service.loginWithPassword(
      {
        email: "mfa-admin@example.com",
        password: "super-secure-password"
      },
      {}
      )
    );

    const enrollment = await service.startMfaEnrollment({
      cookieHeader: `sfus_session=${login.sessionToken}`
    });
    const enrollmentCode = createTotpCode(enrollment.secret);
    const verified = await service.verifyMfaEnrollment(
      {
        code: enrollmentCode
      },
      {
        cookieHeader: `sfus_session=${login.sessionToken}`
      }
    );

    const regeneration = await service.regenerateMfaRecoveryCodes(
      {
        recoveryCode: verified.recoveryCodes[0]
      },
      {
        cookieHeader: `sfus_session=${login.sessionToken}`
      }
    );
    expect(regeneration.regenerated).toBe(true);
    expect(regeneration.recoveryCodes).toHaveLength(10);
    expect(regeneration.recoveryCodes).not.toContain(verified.recoveryCodes[0]);

    await expect(
      service.disableMfa(
        {
          recoveryCode: regeneration.recoveryCodes[0]
        },
        {
          cookieHeader: `sfus_session=${login.sessionToken}`
        }
      )
    ).resolves.toEqual({ disabled: true });

    await expect(
      service.loginWithPassword(
        {
          email: "mfa-admin@example.com",
          password: "super-secure-password"
        },
        {}
      )
    ).resolves.toMatchObject({
      sessionToken: expect.any(String)
    });
  });

  it("rejects invalid verification tokens", async () => {
    const { service } = createService();

    await expect(service.verifyEmailToken("not-a-real-token")).rejects.toThrowError(
      "Invalid or expired verification token."
    );
  });

  it("reads and updates authenticated profile and settings basics", async () => {
    const { service, usersRepository } = createService();
    const registration = await service.registerAccount({
      email: "profile-settings@example.com",
      username: "profile_user",
      password: "super-secure-password"
    });
    await service.verifyEmailToken(registration.emailVerification.token!);
    const login = expectPasswordSession(
      await service.loginWithPassword(
        {
          email: "profile-settings@example.com",
          password: "super-secure-password"
        },
        {}
      )
    );
    const sessionContext = {
      cookieHeader: `sfus_session=${login.sessionToken}`
    };

    await expect(service.getProfile(sessionContext)).resolves.toMatchObject({
      username: "profile_user",
      displayName: null
    });
    await expect(
      service.updateProfile(
        {
          displayName: "Commander Zenith"
        },
        sessionContext
      )
    ).resolves.toMatchObject({
      displayName: "Commander Zenith"
    });
    await expect(
      service.updateSettings(
        {
          username: "profile_zenith"
        },
        sessionContext
      )
    ).resolves.toMatchObject({
      username: "profile_zenith",
      emailVerified: true
    });
    await expect(service.getSettings(sessionContext)).resolves.toMatchObject({
      username: "profile_zenith",
      mfaEnabled: false
    });

    usersRepository.data.push({
      id: "other-user",
      username: "taken_name",
      email: "taken@example.com",
      displayName: null,
      globalRole: "user",
      status: "active",
      emailVerifiedAt: new Date(),
      bio: null,
      avatarMediaId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      authIdentities: [],
      passwordAuthenticators: [],
      sessions: [],
      emailVerifications: [],
      totpSecrets: [],
      recoveryCodes: [],
      authorizationGrants: [],
      avatarMedia: null
    });

    await expect(
      service.updateSettings(
        {
          username: "taken_name"
        },
        sessionContext
      )
    ).rejects.toThrowError("This username is already in use.");
  });

  it("applies reusable account ACL/global-role authorization for cross-account access", async () => {
    const { service, usersRepository, authorizationGrantsRepository } = createService();

    const ownerRegistration = await service.registerAccount({
      email: "owner@example.com",
      username: "owner_user",
      password: "owner-super-secure-password"
    });
    await service.verifyEmailToken(ownerRegistration.emailVerification.token!);
    const ownerLogin = expectPasswordSession(
      await service.loginWithPassword(
        { email: "owner@example.com", password: "owner-super-secure-password" },
        {}
      )
    );

    const peerRegistration = await service.registerAccount({
      email: "peer@example.com",
      username: "peer_user",
      password: "peer-super-secure-password"
    });
    await service.verifyEmailToken(peerRegistration.emailVerification.token!);
    const peerLogin = expectPasswordSession(
      await service.loginWithPassword(
        { email: "peer@example.com", password: "peer-super-secure-password" },
        {}
      )
    );
    const peerContext = { cookieHeader: `sfus_session=${peerLogin.sessionToken}` };

    await expect(service.getProfile(peerContext, ownerRegistration.user.id)).rejects.toThrowError(
      "Authorization denied: access-denied."
    );

    authorizationGrantsRepository.data.push({
      id: crypto.randomUUID(),
      subjectUserId: peerRegistration.user.id,
      resourceType: "account",
      resourceId: ownerRegistration.user.id,
      role: "viewer",
      grantedByUserId: ownerRegistration.user.id,
      createdAt: new Date(),
      subjectUser: usersRepository.data.find((entry) => entry.id === peerRegistration.user.id)!,
      grantedByUser: usersRepository.data.find((entry) => entry.id === ownerRegistration.user.id)!
    });
    await expect(service.getProfile(peerContext, ownerRegistration.user.id)).resolves.toMatchObject({
      username: "owner_user"
    });
    await expect(
      service.updateProfile(
        {
          displayName: "Unauthorized Edit"
        },
        peerContext,
        ownerRegistration.user.id
      )
    ).rejects.toThrowError("Authorization denied: access-denied.");

    const ownerUser = usersRepository.data.find((entry) => entry.id === ownerRegistration.user.id)!;
    ownerUser.globalRole = "admin";
    await expect(service.updateSettings({ username: "owner_admin" }, { cookieHeader: `sfus_session=${ownerLogin.sessionToken}` }))
      .resolves.toMatchObject({ username: "owner_admin" });
    await expect(
      service.updateProfile(
        {
          displayName: "Owner Updated By Admin"
        },
        { cookieHeader: `sfus_session=${ownerLogin.sessionToken}` },
        peerRegistration.user.id
      )
    ).resolves.toMatchObject({ displayName: "Owner Updated By Admin" });
  });
});
