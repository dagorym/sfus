import crypto from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import argon2 from "argon2";
import { Repository } from "typeorm";

import { API_ENVIRONMENT, AUTH_EXTERNAL_PROVIDER_REGISTRY } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import { UserEntity } from "../users/entities/user.entity";
import { AuthIdentityEntity } from "./entities/auth-identity.entity";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { EmailVerificationEntity } from "./entities/email-verification.entity";
import { PasswordAuthenticatorEntity } from "./entities/password-authenticator.entity";
import { TotpRecoveryCodeEntity } from "./entities/totp-recovery-code.entity";
import { TotpSecretEntity } from "./entities/totp-secret.entity";
import type {
  ExternalAuthProviderRegistry,
  ExternalIdentityProfile
} from "./external-auth-provider.registry";

const localIdentityProvider = "local-password";
const onboardingPendingStatus = "onboarding_required";
const sessionCookieName = "sfus_session";
const externalAuthStateCookieName = "sfus_external_auth_state";
const minimumPasswordLength = 12;
const usernamePattern = /^[A-Za-z0-9_.-]{3,32}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const externalAuthStateVersion = 1;
const mfaChallengeVersion = 1;
const totpWindow = 1;
const mfaChallengePurpose = "mfa-challenge";

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

export interface ExternalCallbackInput {
  provider: string;
  code: string;
  state: string;
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
  onboardingRequired: boolean;
}

export interface AuthenticatedSessionPayload {
  id: string;
  expiresAt: string;
  lastSeenAt: string;
}

export interface UserProfilePayload {
  username: string;
  email: string;
  displayName: string | null;
}

export interface UserSettingsPayload {
  username: string;
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
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

export interface MfaChallengePayload {
  required: true;
  challengeToken: string;
  expiresAt: string;
  nextPath: string;
}

export interface MfaEnrollmentStartResult {
  secret: string;
  otpauthUrl: string;
  issuer: string;
}

export interface MfaEnrollmentVerificationResult {
  enabled: true;
  recoveryCodes: string[];
}

export interface MfaRecoveryRegenerationResult {
  regenerated: true;
  recoveryCodes: string[];
}

export interface MfaDisableResult {
  disabled: true;
}

export interface ExternalAuthStartResult {
  authorizationUrl: string;
  stateCookieValue: string;
  stateCookieExpiresAt: string;
}

export type PasswordLoginResult = AuthenticatedSessionResult | { mfa: MfaChallengePayload };

export type ExternalCallbackResult =
  | (AuthenticatedSessionResult & {
      redirectPath: string;
    })
  | { mfa: MfaChallengePayload };

export interface MfaChallengeVerificationResult extends AuthenticatedSessionResult {
  redirectPath: string;
}

type PersistenceContext = {
  usersRepository: Repository<UserEntity>;
  authIdentitiesRepository: Repository<AuthIdentityEntity>;
  passwordAuthenticatorsRepository: Repository<PasswordAuthenticatorEntity>;
  authSessionsRepository: Repository<AuthSessionEntity>;
  emailVerificationsRepository: Repository<EmailVerificationEntity>;
  totpSecretsRepository: Repository<TotpSecretEntity>;
  totpRecoveryCodesRepository: Repository<TotpRecoveryCodeEntity>;
};

@Injectable()
export class AuthService {
  private readonly consumedExternalAuthStateHashes = new Map<string, number>();
  private readonly consumedMfaChallengeHashes = new Map<string, number>();

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
    @InjectRepository(TotpSecretEntity)
    private readonly totpSecretsRepository: Repository<TotpSecretEntity>,
    @InjectRepository(TotpRecoveryCodeEntity)
    private readonly totpRecoveryCodesRepository: Repository<TotpRecoveryCodeEntity>,
    @Inject(API_ENVIRONMENT)
    private readonly environment: ApplicationEnvironment,
    @Inject(AUTH_EXTERNAL_PROVIDER_REGISTRY)
    private readonly externalProviderRegistry: ExternalAuthProviderRegistry
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

  startExternalAuth(providerInput: unknown, nextPathInput: unknown): ExternalAuthStartResult {
    const provider = parseProvider(providerInput);
    const adapter = this.externalProviderRegistry.resolve(provider);
    const state = this.createExternalAuthState({
      provider,
      nextPath: normalizeNextPath(nextPathInput)
    });
    return {
      authorizationUrl: adapter.getAuthorizationUrl(state.value),
      stateCookieValue: state.value,
      stateCookieExpiresAt: state.expiresAt.toISOString()
    };
  }

  async loginWithExternalProvider(
    input: ExternalCallbackInput | unknown,
    requestContext: SessionRequestContext
  ): Promise<ExternalCallbackResult> {
    const callbackInput = parseExternalCallbackInput(input);
    this.assertExternalAuthStateBoundToRequest(callbackInput.state, requestContext);
    const statePayload = this.parseExternalAuthState(callbackInput.state, callbackInput.provider);
    this.consumeExternalAuthState(callbackInput.state, statePayload.expiresAt);
    const adapter = this.externalProviderRegistry.resolve(callbackInput.provider);
    const identity = await adapter.exchangeCodeForIdentity(callbackInput.code);

    if (identity.provider !== callbackInput.provider) {
      throw new BadRequestException("Provider callback did not match the requested provider.");
    }

    const user = await this.withPersistenceContext((context) =>
      this.resolveExternalIdentityUser(identity, context)
    );
    const redirectPath =
      user.status === onboardingPendingStatus ? "/onboarding/username" : statePayload.nextPath;

    const mfaChallenge = await this.createMfaChallengeForUser(user.id, redirectPath);
    if (mfaChallenge) {
      return {
        mfa: mfaChallenge
      };
    }

    const session = await this.createSession(user, requestContext);

    return {
      user: mapUser(user),
      session: mapSession(session.session),
      sessionToken: session.sessionToken,
      redirectPath
    };
  }

  async completeExternalOnboarding(
    input: unknown,
    requestContext: SessionRequestContext
  ): Promise<AuthenticatedSessionResult> {
    const onboardingInput = parseOnboardingInput(input);
    const resolvedSession = await this.resolveSession(requestContext);

    if (!resolvedSession.user.onboardingRequired) {
      return resolvedSession;
    }

    const user = await this.usersRepository.findOne({ where: { id: resolvedSession.user.id } });
    if (!user) {
      throw new UnauthorizedException("Authentication required.");
    }

    const duplicate = await this.usersRepository.findOne({
      where: { username: onboardingInput.username }
    });
    if (duplicate && duplicate.id !== user.id) {
      throw new BadRequestException("This username is already in use.");
    }

    user.username = onboardingInput.username;
    user.status = "active";
    await this.usersRepository.save(user);

    return {
      user: mapUser(user),
      session: resolvedSession.session,
      sessionToken: resolvedSession.sessionToken
    };
  }

  async loginWithPassword(
    input: LoginInput | unknown,
    requestContext: SessionRequestContext
  ): Promise<PasswordLoginResult> {
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

    const mfaChallenge = await this.createMfaChallengeForUser(user.id, "/app");
    if (mfaChallenge) {
      return {
        mfa: mfaChallenge
      };
    }

    const session = await this.createSession(user, requestContext);
    return {
      user: mapUser(user),
      session: mapSession(session.session),
      sessionToken: session.sessionToken
    };
  }

  async startMfaEnrollment(requestContext: SessionRequestContext): Promise<MfaEnrollmentStartResult> {
    const resolvedSession = await this.resolveSession(requestContext);
    const totpSecret = await this.upsertTotpSecretForEnrollment(resolvedSession.user.id);
    const secret = this.decryptTotpSecret(totpSecret.secretEncrypted);
    const accountName = resolvedSession.user.email;

    return {
      secret,
      issuer: this.environment.auth.totpIssuer,
      otpauthUrl: this.createOtpAuthUri(secret, accountName, totpSecret)
    };
  }

  async verifyMfaEnrollment(
    input: unknown,
    requestContext: SessionRequestContext
  ): Promise<MfaEnrollmentVerificationResult> {
    const mfaInput = parseTotpCodeInput(input);
    const resolvedSession = await this.resolveSession(requestContext);
    const totpSecret = await this.totpSecretsRepository.findOne({
      where: {
        userId: resolvedSession.user.id
      }
    });
    if (!totpSecret) {
      throw new BadRequestException("MFA enrollment has not been started.");
    }

    const secret = this.decryptTotpSecret(totpSecret.secretEncrypted);
    if (!this.verifyTotpCode(secret, mfaInput.code, new Date(), totpSecret)) {
      throw new UnauthorizedException("Invalid authenticator code.");
    }

    totpSecret.verifiedAt = new Date();
    await this.totpSecretsRepository.save(totpSecret);

    const recoveryCodes = await this.replaceRecoveryCodes(resolvedSession.user.id);
    return {
      enabled: true,
      recoveryCodes
    };
  }

  async verifyMfaChallenge(
    input: unknown,
    requestContext: SessionRequestContext
  ): Promise<MfaChallengeVerificationResult> {
    const challengeInput = parseMfaChallengeInput(input);
    const challengePayload = this.parseMfaChallengeToken(challengeInput.challengeToken);
    this.consumeMfaChallenge(challengeInput.challengeToken, challengePayload.expiresAt);
    const user = await this.usersRepository.findOne({ where: { id: challengePayload.userId } });
    if (!user) {
      throw new UnauthorizedException("Authentication required.");
    }

    await this.validateMfaProof({
      userId: user.id,
      totpCode: challengeInput.totpCode,
      recoveryCode: challengeInput.recoveryCode
    });

    const session = await this.createSession(user, requestContext);
    return {
      user: mapUser(user),
      session: mapSession(session.session),
      sessionToken: session.sessionToken,
      redirectPath: challengePayload.nextPath
    };
  }

  async regenerateMfaRecoveryCodes(
    input: unknown,
    requestContext: SessionRequestContext
  ): Promise<MfaRecoveryRegenerationResult> {
    const mfaInput = parseMfaProofInput(input);
    const resolvedSession = await this.resolveSession(requestContext);
    await this.validateMfaProof({
      userId: resolvedSession.user.id,
      totpCode: mfaInput.totpCode,
      recoveryCode: mfaInput.recoveryCode
    });
    const recoveryCodes = await this.replaceRecoveryCodes(resolvedSession.user.id);
    return {
      regenerated: true,
      recoveryCodes
    };
  }

  async disableMfa(input: unknown, requestContext: SessionRequestContext): Promise<MfaDisableResult> {
    const mfaInput = parseMfaProofInput(input);
    const resolvedSession = await this.resolveSession(requestContext);
    await this.validateMfaProof({
      userId: resolvedSession.user.id,
      totpCode: mfaInput.totpCode,
      recoveryCode: mfaInput.recoveryCode
    });
    await this.totpSecretsRepository.delete({ userId: resolvedSession.user.id });
    await this.totpRecoveryCodesRepository.delete({ userId: resolvedSession.user.id });
    return { disabled: true };
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

  async getProfile(requestContext: SessionRequestContext): Promise<UserProfilePayload> {
    const resolvedSession = await this.resolveSession(requestContext);
    return mapProfile(resolvedSession.user);
  }

  async updateProfile(
    input: unknown,
    requestContext: SessionRequestContext
  ): Promise<UserProfilePayload> {
    const profileInput = parseProfileInput(input);
    const resolvedSession = await this.resolveSession(requestContext);
    const user = await this.usersRepository.findOne({ where: { id: resolvedSession.user.id } });
    if (!user) {
      throw new UnauthorizedException("Authentication required.");
    }
    user.displayName = profileInput.displayName;
    const savedUser = await this.usersRepository.save(user);
    return mapProfile(mapUser(savedUser));
  }

  async getSettings(requestContext: SessionRequestContext): Promise<UserSettingsPayload> {
    const resolvedSession = await this.resolveSession(requestContext);
    return this.mapSettings(resolvedSession.user);
  }

  async updateSettings(
    input: unknown,
    requestContext: SessionRequestContext
  ): Promise<UserSettingsPayload> {
    const settingsInput = parseSettingsInput(input);
    const resolvedSession = await this.resolveSession(requestContext);
    const user = await this.usersRepository.findOne({ where: { id: resolvedSession.user.id } });
    if (!user) {
      throw new UnauthorizedException("Authentication required.");
    }

    if (settingsInput.username !== user.username) {
      const duplicate = await this.usersRepository.findOne({
        where: { username: settingsInput.username }
      });
      if (duplicate && duplicate.id !== user.id) {
        throw new BadRequestException("This username is already in use.");
      }
      user.username = settingsInput.username;
    }

    const savedUser = await this.usersRepository.save(user);
    return this.mapSettings(mapUser(savedUser));
  }

  getSessionCookieName(): string {
    return sessionCookieName;
  }

  getExternalAuthStateCookieName(): string {
    return externalAuthStateCookieName;
  }

  private async mapSettings(user: AuthenticatedUserPayload): Promise<UserSettingsPayload> {
    const totpSecret = await this.totpSecretsRepository.findOne({
      where: {
        userId: user.id
      }
    });
    return {
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      mfaEnabled: Boolean(totpSecret?.verifiedAt)
    };
  }

  private async createSession(
    user: UserEntity,
    requestContext: SessionRequestContext
  ): Promise<{ session: AuthSessionEntity; sessionToken: string }> {
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
    return { session, sessionToken };
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
          emailVerificationsRepository: entityManager.getRepository(EmailVerificationEntity),
          totpSecretsRepository: entityManager.getRepository(TotpSecretEntity),
          totpRecoveryCodesRepository: entityManager.getRepository(TotpRecoveryCodeEntity)
        };

        return operation(context);
      });
    }

    return operation({
      usersRepository: this.usersRepository,
      authIdentitiesRepository: this.authIdentitiesRepository,
      passwordAuthenticatorsRepository: this.passwordAuthenticatorsRepository,
      authSessionsRepository: this.authSessionsRepository,
      emailVerificationsRepository: this.emailVerificationsRepository,
      totpSecretsRepository: this.totpSecretsRepository,
      totpRecoveryCodesRepository: this.totpRecoveryCodesRepository
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

  private async resolveExternalIdentityUser(
    identity: ExternalIdentityProfile,
    context: PersistenceContext
  ): Promise<UserEntity> {
    const normalizedEmail = normalizeEmail(identity.email);
    const canLinkByEmail = Boolean(identity.emailVerified && normalizedEmail);
    const existingIdentity = await context.authIdentitiesRepository.findOne({
      where: {
        provider: identity.provider,
        providerSubject: identity.subject
      }
    });
    if (existingIdentity) {
      const existingUser = await context.usersRepository.findOne({
        where: { id: existingIdentity.userId }
      });
      if (!existingUser) {
        throw new NotFoundException("Linked account was not found.");
      }
      return existingUser;
    }

    const userByEmail = canLinkByEmail
      ? await context.usersRepository.findOne({
          where: { email: normalizedEmail }
        })
      : null;

    const now = new Date();
    const user =
      userByEmail ||
      (await context.usersRepository.save(
        context.usersRepository.create({
          id: crypto.randomUUID(),
          username: createPendingUsername(),
          email: canLinkByEmail ? normalizedEmail : createSyntheticExternalEmail(identity),
          displayName: identity.displayName,
          status: onboardingPendingStatus,
          globalRole: "user",
          emailVerifiedAt: canLinkByEmail ? now : null
        })
      ));

    if (userByEmail && !user.emailVerifiedAt) {
      user.emailVerifiedAt = now;
      await context.usersRepository.save(user);
    }

    await context.authIdentitiesRepository.save(
      context.authIdentitiesRepository.create({
        id: crypto.randomUUID(),
        userId: user.id,
        provider: identity.provider,
        providerSubject: identity.subject,
        providerEmail: canLinkByEmail ? normalizedEmail : null
      })
    );
    return user;
  }

  private createExternalAuthState(payload: {
    provider: string;
    nextPath: string;
  }): { value: string; expiresAt: Date } {
    const now = Date.now();
    const expiresAt = new Date(now + this.environment.auth.externalStateTtlMinutes * 60_000);
    const statePayload = {
      v: externalAuthStateVersion,
      p: payload.provider,
      n: payload.nextPath,
      iat: now,
      nonce: createToken()
    };
    const encodedPayload = Buffer.from(JSON.stringify(statePayload)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", this.environment.auth.sessionTokenPepper)
      .update(encodedPayload)
      .digest("base64url");
    return {
      value: `${encodedPayload}.${signature}`,
      expiresAt
    };
  }

  private parseExternalAuthState(
    stateInput: string,
    expectedProvider: string
  ): { nextPath: string; expiresAt: number } {
    const [encodedPayload, signature] = stateInput.split(".");
    if (!encodedPayload || !signature) {
      throw new BadRequestException("Invalid authentication callback state.");
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.environment.auth.sessionTokenPepper)
      .update(encodedPayload)
      .digest("base64url");
    if (!timingSafeEqual(expectedSignature, signature)) {
      throw new BadRequestException("Invalid authentication callback state.");
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      throw new BadRequestException("Invalid authentication callback state.");
    }

    if (
      payload.v !== externalAuthStateVersion ||
      payload.p !== expectedProvider ||
      typeof payload.iat !== "number" ||
      typeof payload.n !== "string"
    ) {
      throw new BadRequestException("Invalid authentication callback state.");
    }

    const expiresAt = payload.iat + this.environment.auth.externalStateTtlMinutes * 60_000;
    if (expiresAt <= Date.now()) {
      throw new BadRequestException("Authentication callback state has expired.");
    }

    return {
      nextPath: normalizeNextPath(payload.n),
      expiresAt
    };
  }

  private assertExternalAuthStateBoundToRequest(
    state: string,
    requestContext: SessionRequestContext
  ): void {
    const cookieHeader = requestContext.cookieHeader || "";
    const parsedCookies = parseCookieHeader(cookieHeader);
    const stateCookie = parsedCookies[externalAuthStateCookieName];
    if (!stateCookie || !timingSafeEqual(stateCookie, state)) {
      throw new BadRequestException("Invalid authentication callback state.");
    }
  }

  private consumeExternalAuthState(state: string, expiresAt: number): void {
    this.pruneConsumedExternalAuthStates();

    const stateHash = this.hashToken(`external-auth-state:${state}`);
    const existingExpiry = this.consumedExternalAuthStateHashes.get(stateHash);
    if (existingExpiry && existingExpiry > Date.now()) {
      throw new BadRequestException("Invalid authentication callback state.");
    }

    this.consumedExternalAuthStateHashes.set(stateHash, expiresAt);
  }

  private pruneConsumedExternalAuthStates(): void {
    const now = Date.now();
    for (const [stateHash, expiresAt] of this.consumedExternalAuthStateHashes.entries()) {
      if (expiresAt <= now) {
        this.consumedExternalAuthStateHashes.delete(stateHash);
      }
    }
  }

  private async createMfaChallengeForUser(
    userId: string,
    nextPath: string
  ): Promise<MfaChallengePayload | null> {
    const verifiedTotpSecret = await this.totpSecretsRepository.findOne({
      where: {
        userId
      }
    });
    if (!verifiedTotpSecret?.verifiedAt) {
      return null;
    }

    const challenge = this.createMfaChallengeToken({ userId, nextPath });
    return {
      required: true,
      challengeToken: challenge.value,
      expiresAt: challenge.expiresAt.toISOString(),
      nextPath
    };
  }

  private async upsertTotpSecretForEnrollment(userId: string): Promise<TotpSecretEntity> {
    const existing = await this.totpSecretsRepository.findOne({
      where: {
        userId
      }
    });
    if (existing?.verifiedAt) {
      throw new BadRequestException("MFA is already enabled.");
    }

    const secret = generateBase32Secret();
    const encryptedSecret = this.encryptTotpSecret(secret);
    const baseRecord = {
      userId,
      secretEncrypted: encryptedSecret,
      algorithm: "SHA1",
      digits: 6,
      periodSeconds: 30,
      verifiedAt: null
    };

    if (existing) {
      Object.assign(existing, baseRecord);
      return this.totpSecretsRepository.save(existing);
    }

    return this.totpSecretsRepository.save(
      this.totpSecretsRepository.create({
        id: crypto.randomUUID(),
        ...baseRecord
      })
    );
  }

  private createOtpAuthUri(secret: string, accountName: string, totpSecret: TotpSecretEntity): string {
    const label = encodeURIComponent(`${this.environment.auth.totpIssuer}:${accountName}`);
    const issuer = encodeURIComponent(this.environment.auth.totpIssuer);
    const algorithm = encodeURIComponent(totpSecret.algorithm);
    return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${issuer}&algorithm=${algorithm}&digits=${totpSecret.digits}&period=${totpSecret.periodSeconds}`;
  }

  private async validateMfaProof(input: {
    userId: string;
    totpCode: string | null;
    recoveryCode: string | null;
  }): Promise<void> {
    const totpSecret = await this.totpSecretsRepository.findOne({
      where: {
        userId: input.userId
      }
    });
    if (!totpSecret?.verifiedAt) {
      throw new BadRequestException("MFA is not enabled for this account.");
    }

    const secret = this.decryptTotpSecret(totpSecret.secretEncrypted);
    if (input.totpCode && this.verifyTotpCode(secret, input.totpCode, new Date(), totpSecret)) {
      return;
    }

    if (input.recoveryCode) {
      const consumed = await this.consumeRecoveryCode(input.userId, input.recoveryCode);
      if (consumed) {
        return;
      }
    }

    throw new UnauthorizedException("Invalid MFA verification code.");
  }

  private async consumeRecoveryCode(userId: string, recoveryCode: string): Promise<boolean> {
    const recoveryCodeHash = this.hashToken(`recovery-code:${normalizeRecoveryCode(recoveryCode)}`);
    const match = await this.totpRecoveryCodesRepository.findOne({
      where: {
        userId,
        codeHash: recoveryCodeHash
      }
    });
    if (!match || match.consumedAt) {
      return false;
    }

    match.consumedAt = new Date();
    await this.totpRecoveryCodesRepository.save(match);
    return true;
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const recoveryCodes = generateRecoveryCodes(
      this.environment.auth.recoveryCodeCount,
      this.environment.auth.recoveryCodeLength
    );
    await this.totpRecoveryCodesRepository.delete({ userId });
    await this.totpRecoveryCodesRepository.save(
      recoveryCodes.map((recoveryCode) =>
        this.totpRecoveryCodesRepository.create({
          id: crypto.randomUUID(),
          userId,
          codeHash: this.hashToken(`recovery-code:${normalizeRecoveryCode(recoveryCode)}`),
          consumedAt: null
        })
      )
    );
    return recoveryCodes;
  }

  private verifyTotpCode(
    secret: string,
    code: string,
    now: Date,
    totpSecret: Pick<TotpSecretEntity, "algorithm" | "digits" | "periodSeconds">
  ): boolean {
    const normalizedCode = normalizeTotpCode(code);
    if (!normalizedCode || normalizedCode.length !== totpSecret.digits) {
      return false;
    }

    const secretBytes = decodeBase32(secret);
    const currentStep = Math.floor(now.getTime() / (totpSecret.periodSeconds * 1_000));
    for (let offset = -totpWindow; offset <= totpWindow; offset += 1) {
      const candidateStep = currentStep + offset;
      if (candidateStep < 0) {
        continue;
      }
      const expected = generateTotpCode(secretBytes, candidateStep, totpSecret.digits, totpSecret.algorithm);
      if (timingSafeEqual(expected, normalizedCode)) {
        return true;
      }
    }

    return false;
  }

  private encryptTotpSecret(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.getTotpEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${authTag.toString("base64url")}`;
  }

  private decryptTotpSecret(secretEncrypted: string): string {
    const [ivInput, encryptedInput, authTagInput] = secretEncrypted.split(".");
    if (!ivInput || !encryptedInput || !authTagInput) {
      throw new BadRequestException("Stored MFA secret is invalid.");
    }

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.getTotpEncryptionKey(),
      Buffer.from(ivInput, "base64url")
    );
    decipher.setAuthTag(Buffer.from(authTagInput, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedInput, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }

  private getTotpEncryptionKey(): Buffer {
    return crypto
      .createHash("sha256")
      .update(`${this.environment.auth.sessionTokenPepper}:${this.environment.auth.passwordPepper}`)
      .digest();
  }

  private createMfaChallengeToken(payload: {
    userId: string;
    nextPath: string;
  }): { value: string; expiresAt: Date } {
    const now = Date.now();
    const expiresAt = new Date(now + this.environment.auth.externalStateTtlMinutes * 60_000);
    const challengePayload = {
      v: mfaChallengeVersion,
      p: mfaChallengePurpose,
      u: payload.userId,
      n: payload.nextPath,
      iat: now,
      nonce: createToken()
    };
    const encodedPayload = Buffer.from(JSON.stringify(challengePayload)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", this.environment.auth.sessionTokenPepper)
      .update(encodedPayload)
      .digest("base64url");
    return {
      value: `${encodedPayload}.${signature}`,
      expiresAt
    };
  }

  private parseMfaChallengeToken(tokenInput: string): {
    userId: string;
    nextPath: string;
    expiresAt: number;
  } {
    const [encodedPayload, signature] = tokenInput.split(".");
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException("Invalid MFA challenge.");
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.environment.auth.sessionTokenPepper)
      .update(encodedPayload)
      .digest("base64url");
    if (!timingSafeEqual(expectedSignature, signature)) {
      throw new UnauthorizedException("Invalid MFA challenge.");
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      throw new UnauthorizedException("Invalid MFA challenge.");
    }

    if (
      payload.v !== mfaChallengeVersion ||
      payload.p !== mfaChallengePurpose ||
      typeof payload.u !== "string" ||
      typeof payload.n !== "string" ||
      typeof payload.iat !== "number"
    ) {
      throw new UnauthorizedException("Invalid MFA challenge.");
    }

    const expiresAt = payload.iat + this.environment.auth.externalStateTtlMinutes * 60_000;
    if (expiresAt <= Date.now()) {
      throw new UnauthorizedException("MFA challenge has expired.");
    }

    return {
      userId: payload.u,
      nextPath: normalizeNextPath(payload.n),
      expiresAt
    };
  }

  private consumeMfaChallenge(challengeToken: string, expiresAt: number): void {
    this.pruneConsumedMfaChallenges();
    const challengeHash = this.hashToken(`mfa-challenge:${challengeToken}`);
    const existingExpiry = this.consumedMfaChallengeHashes.get(challengeHash);
    if (existingExpiry && existingExpiry > Date.now()) {
      throw new UnauthorizedException("MFA challenge has already been used.");
    }

    this.consumedMfaChallengeHashes.set(challengeHash, expiresAt);
  }

  private pruneConsumedMfaChallenges(): void {
    const now = Date.now();
    for (const [challengeHash, expiresAt] of this.consumedMfaChallengeHashes.entries()) {
      if (expiresAt <= now) {
        this.consumedMfaChallengeHashes.delete(challengeHash);
      }
    }
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
  emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
  onboardingRequired: user.status === onboardingPendingStatus
});

const mapSession = (session: AuthSessionEntity): AuthenticatedSessionPayload => ({
  id: session.id,
  expiresAt: session.expiresAt.toISOString(),
  lastSeenAt: session.lastSeenAt.toISOString()
});

const mapProfile = (user: AuthenticatedUserPayload): UserProfilePayload => ({
  username: user.username,
  email: user.email,
  displayName: user.displayName
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

const parseProvider = (providerInput: unknown): string => {
  const normalizedProvider =
    typeof providerInput === "string" ? providerInput.trim().toLowerCase() : "";
  if (!normalizedProvider) {
    throw new BadRequestException("Authentication provider is required.");
  }
  return normalizedProvider;
};

const parseExternalCallbackInput = (input: unknown): ExternalCallbackInput => {
  const record = asRecord(input);
  const provider = parseProvider(record.provider);
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const state = typeof record.state === "string" ? record.state.trim() : "";
  if (!code) {
    throw new BadRequestException("Authorization code is required.");
  }
  if (!state) {
    throw new BadRequestException("Authentication callback state is required.");
  }
  return { provider, code, state };
};

const parseOnboardingInput = (input: unknown): { username: string } => {
  const record = asRecord(input);
  const username = typeof record.username === "string" ? record.username.trim() : "";
  if (!usernamePattern.test(username)) {
    throw new BadRequestException(
      "Username must be 3-32 characters and contain only letters, numbers, periods, dashes, or underscores."
    );
  }
  return { username };
};

const parseProfileInput = (input: unknown): { displayName: string | null } => {
  const record = asRecord(input);
  const displayNameRaw = record.displayName;
  if (displayNameRaw === null || displayNameRaw === undefined) {
    return { displayName: null };
  }
  if (typeof displayNameRaw !== "string") {
    throw new BadRequestException("Display name must be a string.");
  }
  const displayName = displayNameRaw.trim();
  if (displayName.length > 80) {
    throw new BadRequestException("Display name must be 80 characters or fewer.");
  }
  return { displayName: displayName || null };
};

const parseSettingsInput = (input: unknown): { username: string } => {
  const record = asRecord(input);
  const username = typeof record.username === "string" ? record.username.trim() : "";
  if (!usernamePattern.test(username)) {
    throw new BadRequestException(
      "Username must be 3-32 characters and contain only letters, numbers, periods, dashes, or underscores."
    );
  }
  return { username };
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

const parseTotpCodeInput = (input: unknown): { code: string } => {
  const record = asRecord(input);
  const code = normalizeTotpCode(record.code);
  if (!code) {
    throw new BadRequestException("Authenticator code is required.");
  }

  return { code };
};

const parseMfaProofInput = (input: unknown): { totpCode: string | null; recoveryCode: string | null } => {
  const record = asRecord(input);
  const totpCode = normalizeTotpCode(record.totpCode || record.code);
  const recoveryCode = normalizeRecoveryCode(record.recoveryCode || record.recovery);
  if (!totpCode && !recoveryCode) {
    throw new BadRequestException("Provide an authenticator code or a recovery code.");
  }

  return {
    totpCode: totpCode || null,
    recoveryCode: recoveryCode || null
  };
};

const parseMfaChallengeInput = (input: unknown): {
  challengeToken: string;
  totpCode: string | null;
  recoveryCode: string | null;
} => {
  const record = asRecord(input);
  const challengeToken = typeof record.challengeToken === "string" ? record.challengeToken.trim() : "";
  if (!challengeToken) {
    throw new BadRequestException("MFA challenge token is required.");
  }

  return {
    challengeToken,
    ...parseMfaProofInput(input)
  };
};

const normalizeNextPath = (value: unknown): string => {
  if (typeof value !== "string") {
    return "/app";
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/app";
  }
  return trimmed;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const createToken = (): string => crypto.randomBytes(32).toString("base64url");

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const generateBase32Secret = (): string => encodeBase32(crypto.randomBytes(20));

const encodeBase32 = (input: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input.values()) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }
  return output;
};

const decodeBase32 = (value: string): Buffer => {
  const normalized = value.replace(/=+$/g, "").replace(/[^A-Z2-7]/gi, "").toUpperCase();
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) {
      throw new BadRequestException("Stored MFA secret is invalid.");
    }
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const generateTotpCode = (
  secretBytes: Buffer,
  counter: number,
  digits: number,
  algorithm: string
): string => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac(algorithm.toLowerCase(), secretBytes).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
};

const normalizeTotpCode = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.replace(/\s+/g, "").trim();
  return /^\d{6,8}$/.test(normalized) ? normalized : "";
};

const normalizeRecoveryCode = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\s-]+/g, "").trim().toUpperCase();
};

const generateRecoveryCodes = (count: number, length: number): string[] => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const normalizedLength = Math.max(8, Math.min(32, length));
  const codes = new Set<string>();

  while (codes.size < count) {
    const random = crypto.randomBytes(normalizedLength);
    let code = "";
    for (let index = 0; index < normalizedLength; index += 1) {
      code += alphabet[random[index]! % alphabet.length];
    }
    const grouped = code.match(/.{1,4}/g)?.join("-") ?? code;
    codes.add(grouped);
  }

  return [...codes];
};

const createPendingUsername = (): string => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `pending_${suffix}`;
};

const createSyntheticExternalEmail = (identity: ExternalIdentityProfile): string =>
  `${identity.provider}_${identity.subject}@users.noreply.sfus.local`;

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

const timingSafeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
