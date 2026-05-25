import argon2 from "argon2";
import { describe, expect, it } from "vitest";

import type { ApplicationEnvironment } from "../config/environment";
import { AuthService } from "./auth.service";
import { AuthIdentityEntity } from "./entities/auth-identity.entity";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { EmailVerificationEntity } from "./entities/email-verification.entity";
import { PasswordAuthenticatorEntity } from "./entities/password-authenticator.entity";
import { UserEntity } from "../users/entities/user.entity";

type EntityClass =
  | typeof UserEntity
  | typeof AuthIdentityEntity
  | typeof PasswordAuthenticatorEntity
  | typeof AuthSessionEntity
  | typeof EmailVerificationEntity;

type RepositoryLike<T extends { id: string }> = {
  data: T[];
  create: (entityLike: Partial<T>) => T;
  save: (entity: T) => Promise<T>;
  findOne: (input: { where: Partial<T> }) => Promise<T | null>;
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
    save: async (entity: T): Promise<T> => {
      if (nextSaveError) {
        const error = nextSaveError;
        nextSaveError = null;
        throw error;
      }

      const existingIndex = data.findIndex((current) => current.id === entity.id);
      if (existingIndex >= 0) {
        data[existingIndex] = entity;
      } else {
        data.push(entity);
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
    failNextSave: (error: Error): void => {
      nextSaveError = error;
    }
  };
};

const createEnvironment = (): ApplicationEnvironment => ({
  nodeEnv: "development",
  apiPort: 3001,
  swaggerEnabled: true,
  auth: {
    passwordPepper: "development-pepper-value",
    sessionTokenPepper: "development-session-token-pepper",
    sessionTtlMinutes: 1440,
    sessionIdleTimeoutMinutes: 120,
    emailVerificationTtlMinutes: 60,
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

const createService = () => {
  const usersRepository = createRepository<UserEntity>();
  const authIdentitiesRepository = createRepository<AuthIdentityEntity>();
  const passwordAuthenticatorsRepository = createRepository<PasswordAuthenticatorEntity>();
  const authSessionsRepository = createRepository<AuthSessionEntity>();
  const emailVerificationsRepository = createRepository<EmailVerificationEntity>();

  const repositoryByEntity = new Map<EntityClass, RepositoryLike<{ id: string }>>([
    [UserEntity, usersRepository as unknown as RepositoryLike<{ id: string }>],
    [AuthIdentityEntity, authIdentitiesRepository as unknown as RepositoryLike<{ id: string }>],
    [
      PasswordAuthenticatorEntity,
      passwordAuthenticatorsRepository as unknown as RepositoryLike<{ id: string }>
    ],
    [AuthSessionEntity, authSessionsRepository as unknown as RepositoryLike<{ id: string }>],
    [EmailVerificationEntity, emailVerificationsRepository as unknown as RepositoryLike<{ id: string }>]
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

  const service = new AuthService(
    usersRepository as never,
    authIdentitiesRepository as never,
    passwordAuthenticatorsRepository as never,
    authSessionsRepository as never,
    emailVerificationsRepository as never,
    createEnvironment()
  );

  return {
    service,
    usersRepository,
    authIdentitiesRepository,
    passwordAuthenticatorsRepository,
    authSessionsRepository,
    emailVerificationsRepository
  };
};

describe("AuthService", () => {
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

    await expect(
      service.registerAccount({
        email: "duplicate@example.com",
        username: "duplicate_two",
        password: "super-secure-password"
      })
    ).rejects.toThrowError("An account with this email already exists.");
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

    const login = await service.loginWithPassword(
      {
        email: "flow@example.com",
        password: "super-secure-password"
      },
      {
        ipAddress: "127.0.0.1",
        userAgent: "vitest"
      }
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
    const login = await service.loginWithPassword(
      {
        email: "absolute-expiry@example.com",
        password: "super-secure-password"
      },
      {}
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
    const login = await service.loginWithPassword(
      {
        email: "idle-expiry@example.com",
        password: "super-secure-password"
      },
      {}
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

  it("rejects invalid verification tokens", async () => {
    const { service } = createService();

    await expect(service.verifyEmailToken("not-a-real-token")).rejects.toThrowError(
      "Invalid or expired verification token."
    );
  });
});
