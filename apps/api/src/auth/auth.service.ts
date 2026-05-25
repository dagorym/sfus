import crypto from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import argon2 from "argon2";
import { Repository } from "typeorm";

import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import { UserEntity } from "../users/entities/user.entity";
import { AuthIdentityEntity } from "./entities/auth-identity.entity";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { EmailVerificationEntity } from "./entities/email-verification.entity";
import { PasswordAuthenticatorEntity } from "./entities/password-authenticator.entity";

const localIdentityProvider = "local-password";
const sessionCookieName = "sfus_session";
const minimumPasswordLength = 12;
const usernamePattern = /^[A-Za-z0-9_.-]{3,32}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SessionRequestContext {
  cookieHeader?: string;
  sessionToken?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthenticatedUserPayload {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  globalRole: string;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
}

export interface AuthenticatedSessionPayload {
  id: string;
  expiresAt: string;
  lastSeenAt: string;
}

export interface RegistrationResult {
  user: AuthenticatedUserPayload;
  emailVerification: {
    required: true;
    expiresAt: string;
    token?: string;
  };
}

export interface VerificationResult {
  user: AuthenticatedUserPayload;
}

export interface AuthenticatedSessionResult {
  user: AuthenticatedUserPayload;
  session: AuthenticatedSessionPayload;
  sessionToken: string;
}

type PersistenceContext = {
  usersRepository: Repository<UserEntity>;
  authIdentitiesRepository: Repository<AuthIdentityEntity>;
  passwordAuthenticatorsRepository: Repository<PasswordAuthenticatorEntity>;
  authSessionsRepository: Repository<AuthSessionEntity>;
  emailVerificationsRepository: Repository<EmailVerificationEntity>;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(AuthIdentityEntity)
    private readonly authIdentitiesRepository: Repository<AuthIdentityEntity>,
    @InjectRepository(PasswordAuthenticatorEntity)
    private readonly passwordAuthenticatorsRepository: Repository<PasswordAuthenticatorEntity>,
    @InjectRepository(AuthSessionEntity)
    private readonly authSessionsRepository: Repository<AuthSessionEntity>,
    @InjectRepository(EmailVerificationEntity)
    private readonly emailVerificationsRepository: Repository<EmailVerificationEntity>,
    @Inject(API_ENVIRONMENT)
    private readonly environment: ApplicationEnvironment
  ) {}

  async registerAccount(input: RegisterInput | unknown): Promise<RegistrationResult> {
    const registrationInput = parseRegistrationInput(input);
    const now = new Date();
    const verificationToken = createToken();
    const verificationExpiresAt = addMinutes(now, this.environment.auth.emailVerificationTtlMinutes);
    const user = await this.withPersistenceContext(async (context) => {
      const existingByEmail = await context.usersRepository.findOne({
        where: { email: registrationInput.email }
      });
      if (existingByEmail) {
        throw new BadRequestException("An account with this email already exists.");
      }

      const existingByUsername = await context.usersRepository.findOne({
        where: { username: registrationInput.username }
      });
      if (existingByUsername) {
        throw new BadRequestException("This username is already in use.");
      }

      const createdUser = await context.usersRepository.save(
        context.usersRepository.create({
          id: crypto.randomUUID(),
          username: registrationInput.username,
          email: registrationInput.email,
          displayName: null,
          status: "active",
          globalRole: "user",
          emailVerifiedAt: null
        })
      );

      await context.authIdentitiesRepository.save(
        context.authIdentitiesRepository.create({
          id: crypto.randomUUID(),
          userId: createdUser.id,
          provider: localIdentityProvider,
          providerSubject: createdUser.id,
          providerEmail: registrationInput.email
        })
      );

      const passwordHash = await argon2.hash(this.withPasswordPepper(registrationInput.password), {
        type: argon2.argon2id
      });

      await context.passwordAuthenticatorsRepository.save(
        context.passwordAuthenticatorsRepository.create({
          id: crypto.randomUUID(),
          userId: createdUser.id,
          passwordHash,
          passwordVersion: 1,
          passwordUpdatedAt: now
        })
      );

      await context.emailVerificationsRepository.save(
        context.emailVerificationsRepository.create({
          id: crypto.randomUUID(),
          userId: createdUser.id,
          purpose: "primary_email",
          tokenHash: this.hashToken(verificationToken),
          expiresAt: verificationExpiresAt,
          consumedAt: null
        })
      );

      return createdUser;
    });

    return {
      user: mapUser(user),
      emailVerification: {
        required: true,
        expiresAt: verificationExpiresAt.toISOString(),
        ...(this.environment.nodeEnv !== "production" ? { token: verificationToken } : {})
      }
    };
  }

  async verifyEmailToken(tokenInput: unknown): Promise<VerificationResult> {
    const normalizedToken = parseVerificationToken(tokenInput);

    const verification = await this.emailVerificationsRepository.findOne({
      where: { tokenHash: this.hashToken(normalizedToken) }
    });
    const now = new Date();

    if (!verification || verification.consumedAt || verification.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException("Invalid or expired verification token.");
    }

    const user = await this.usersRepository.findOne({ where: { id: verification.userId } });
    if (!user) {
      throw new BadRequestException("Invalid or expired verification token.");
    }

    verification.consumedAt = now;
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = now;
      await this.usersRepository.save(user);
    }
    await this.emailVerificationsRepository.save(verification);

    return { user: mapUser(user) };
  }

  async loginWithPassword(
    input: LoginInput | unknown,
    requestContext: SessionRequestContext
  ): Promise<AuthenticatedSessionResult> {
    const { email, password } = parseLoginInput(input);

    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    const authenticator = await this.passwordAuthenticatorsRepository.findOne({
      where: { userId: user.id }
    });
    if (!authenticator) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    const passwordMatches = await argon2.verify(
      authenticator.passwordHash,
      this.withPasswordPepper(password)
    );
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException("Email verification required before login.");
    }

    const now = new Date();
    const expiresAt = addMinutes(now, this.environment.auth.sessionTtlMinutes);
    const sessionToken = createToken();
    const session = await this.authSessionsRepository.save(
      this.authSessionsRepository.create({
        id: crypto.randomUUID(),
        userId: user.id,
        sessionTokenHash: this.hashToken(sessionToken),
        csrfTokenHash: null,
        state: "active",
        lastSeenAt: now,
        expiresAt,
        revokedAt: null,
        ipAddress: requestContext.ipAddress || null,
        userAgent: requestContext.userAgent || null
      })
    );

    return {
      user: mapUser(user),
      session: mapSession(session),
      sessionToken
    };
  }

  async resolveSession(requestContext: SessionRequestContext): Promise<AuthenticatedSessionResult> {
    const sessionToken = this.extractSessionToken(requestContext);
    if (!sessionToken) {
      throw new UnauthorizedException("Authentication required.");
    }

    const authSession = await this.authSessionsRepository.findOne({
      where: {
        sessionTokenHash: this.hashToken(sessionToken)
      }
    });
    const now = new Date();
    if (!authSession || authSession.state !== "active" || authSession.revokedAt) {
      throw new UnauthorizedException("Authentication required.");
    }

    const idleBoundary = addMinutes(authSession.lastSeenAt, this.environment.auth.sessionIdleTimeoutMinutes);
    if (authSession.expiresAt.getTime() <= now.getTime() || idleBoundary.getTime() <= now.getTime()) {
      authSession.state = "revoked";
      authSession.revokedAt = now;
      await this.authSessionsRepository.save(authSession);
      throw new UnauthorizedException("Session has expired.");
    }

    authSession.lastSeenAt = now;
    await this.authSessionsRepository.save(authSession);

    const user = await this.usersRepository.findOne({ where: { id: authSession.userId } });
    if (!user) {
      throw new UnauthorizedException("Authentication required.");
    }

    return {
      user: mapUser(user),
      session: mapSession(authSession),
      sessionToken
    };
  }

  async logout(requestContext: SessionRequestContext): Promise<void> {
    const sessionToken = this.extractSessionToken(requestContext);
    if (!sessionToken) {
      return;
    }

    const session = await this.authSessionsRepository.findOne({
      where: { sessionTokenHash: this.hashToken(sessionToken) }
    });
    if (!session || session.state === "revoked") {
      return;
    }

    session.state = "revoked";
    session.revokedAt = new Date();
    await this.authSessionsRepository.save(session);
  }

  getSessionCookieName(): string {
    return sessionCookieName;
  }

  private async withPersistenceContext<T>(
    operation: (context: PersistenceContext) => Promise<T>
  ): Promise<T> {
    const manager = this.usersRepository.manager;
    if (manager && typeof manager.transaction === "function") {
      return manager.transaction(async (entityManager) => {
        const context: PersistenceContext = {
          usersRepository: entityManager.getRepository(UserEntity),
          authIdentitiesRepository: entityManager.getRepository(AuthIdentityEntity),
          passwordAuthenticatorsRepository: entityManager.getRepository(PasswordAuthenticatorEntity),
          authSessionsRepository: entityManager.getRepository(AuthSessionEntity),
          emailVerificationsRepository: entityManager.getRepository(EmailVerificationEntity)
        };

        return operation(context);
      });
    }

    return operation({
      usersRepository: this.usersRepository,
      authIdentitiesRepository: this.authIdentitiesRepository,
      passwordAuthenticatorsRepository: this.passwordAuthenticatorsRepository,
      authSessionsRepository: this.authSessionsRepository,
      emailVerificationsRepository: this.emailVerificationsRepository
    });
  }

  private withPasswordPepper(password: string): string {
    return `${password}${this.environment.auth.passwordPepper}`;
  }

  private hashToken(token: string): string {
    return crypto
      .createHash("sha256")
      .update(`${token}:${this.environment.auth.sessionTokenPepper}`)
      .digest("hex");
  }

  private extractSessionToken(context: SessionRequestContext): string | null {
    if (context.sessionToken && context.sessionToken.trim()) {
      return context.sessionToken.trim();
    }

    const cookieHeader = context.cookieHeader || "";
    if (!cookieHeader.trim()) {
      return null;
    }

    const parsed = parseCookieHeader(cookieHeader);
    const token = parsed[sessionCookieName];

    return token?.trim() || null;
  }
}

const mapUser = (user: UserEntity): AuthenticatedUserPayload => ({
  id: user.id,
  username: user.username,
  email: user.email,
  displayName: user.displayName,
  globalRole: user.globalRole,
  status: user.status,
  emailVerified: Boolean(user.emailVerifiedAt),
  emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null
});

const mapSession = (session: AuthSessionEntity): AuthenticatedSessionPayload => ({
  id: session.id,
  expiresAt: session.expiresAt.toISOString(),
  lastSeenAt: session.lastSeenAt.toISOString()
});

const normalizeEmail = (email: unknown): string =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const validateRegistrationInput = (email: string, username: string, password: unknown): void => {
  if (!emailPattern.test(email)) {
    throw new BadRequestException("A valid email address is required.");
  }

  if (!usernamePattern.test(username)) {
    throw new BadRequestException(
      "Username must be 3-32 characters and contain only letters, numbers, periods, dashes, or underscores."
    );
  }

  if (typeof password !== "string" || password.length < minimumPasswordLength) {
    throw new BadRequestException(`Password must be at least ${minimumPasswordLength} characters.`);
  }
};

const parseRegistrationInput = (input: unknown): RegisterInput => {
  const record = asRecord(input);
  const email = normalizeEmail(record.email);
  const username = typeof record.username === "string" ? record.username.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";

  validateRegistrationInput(email, username, password);

  return {
    email,
    username,
    password
  };
};

const parseLoginInput = (input: unknown): LoginInput => {
  const record = asRecord(input);
  const email = normalizeEmail(record.email);
  const password = typeof record.password === "string" ? record.password : "";

  if (!emailPattern.test(email) || !password) {
    throw new BadRequestException("Email and password are required.");
  }

  return { email, password };
};

const parseVerificationToken = (tokenInput: unknown): string => {
  const record = asRecord(tokenInput);
  const token = typeof tokenInput === "string" ? tokenInput : typeof record.token === "string" ? record.token : "";
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new BadRequestException("Verification token is required.");
  }

  return normalizedToken;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const createToken = (): string => crypto.randomBytes(32).toString("base64url");

const addMinutes = (date: Date, minutes: number): Date => {
  return new Date(date.getTime() + minutes * 60_000);
};

const parseCookieHeader = (cookieHeader: string): Record<string, string> => {
  return cookieHeader
    .split(";")
    .map((cookiePart) => cookiePart.trim())
    .filter((cookiePart) => cookiePart.length > 0)
    .reduce<Record<string, string>>((accumulator, cookiePart) => {
      const separatorIndex = cookiePart.indexOf("=");
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = cookiePart.slice(0, separatorIndex).trim();
      const value = cookiePart.slice(separatorIndex + 1).trim();
      if (!key) {
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    }, {});
};
