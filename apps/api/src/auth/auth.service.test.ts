import argon2 from "argon2";
import { describe, expect, it } from "vitest";

import type { ApplicationEnvironment } from "../config/environment";
import type { UserEntity } from "../users/entities/user.entity";
import { AuthService } from "./auth.service";
import type { AuthIdentityEntity } from "./entities/auth-identity.entity";
import type { AuthSessionEntity } from "./entities/auth-session.entity";
import type { EmailVerificationEntity } from "./entities/email-verification.entity";
import type { PasswordAuthenticatorEntity } from "./entities/password-authenticator.entity";

type RepositoryLike<T extends { id: string }> = {
  data: T[];
  create: (entityLike: Partial<T>) => T;
  save: (entity: T) => Promise<T>;
  findOne: (input: { where: Partial<T> }) => Promise<T | null>;
};

const createRepository = <T extends { id: string }>(): RepositoryLike<T> => {
  const data: T[] = [];

  return {
    data,
    create: (entityLike: Partial<T>) => entityLike as T,
    save: async (entity: T): Promise<T> => {
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

  it("rejects invalid verification tokens", async () => {
    const { service } = createService();

    await expect(service.verifyEmailToken("not-a-real-token")).rejects.toThrowError(
      "Invalid or expired verification token."
    );
  });
});
