import { describe, expect, it, vi } from "vitest";

import type { ApplicationEnvironment } from "../config/environment";
import { AuthController } from "./auth.controller";
import type { AuthService } from "./auth.service";

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

describe("AuthController", () => {
  it("sets the secure session cookie on login responses", async () => {
    const authService = {
      loginWithPassword: vi.fn().mockResolvedValue({
        user: {
          id: "user-1",
          username: "user",
          email: "user@example.com",
          displayName: null,
          globalRole: "user",
          status: "active",
          emailVerified: true,
          emailVerifiedAt: new Date().toISOString(),
          onboardingRequired: false
        },
        session: {
          id: "session-1",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          lastSeenAt: new Date().toISOString()
        },
        sessionToken: "session-token"
      }),
      getSessionCookieName: vi.fn().mockReturnValue("sfus_session")
    } as unknown as AuthService;
    const controller = new AuthController(authService, createEnvironment());
    const request = {
      headers: {
        cookie: "sfus_session=session-token",
        "user-agent": "vitest"
      },
      ip: "127.0.0.1"
    };
    const response = {
      cookie: vi.fn()
    };

    await expect(
      controller.login(
        {
          email: "user@example.com",
          password: "super-secure-password"
        },
        request as never,
        response as never
      )
    ).resolves.toMatchObject({
      user: {
        email: "user@example.com"
      },
      session: {
        id: "session-1"
      }
    });

    expect(response.cookie).toHaveBeenCalledWith(
      "sfus_session",
      "session-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: false
      })
    );
  });

  it("returns MFA challenge payload without issuing a session cookie when MFA is required", async () => {
    const authService = {
      loginWithPassword: vi.fn().mockResolvedValue({
        mfa: {
          required: true,
          challengeToken: "challenge-token",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          nextPath: "/app"
        }
      })
    } as unknown as AuthService;
    const controller = new AuthController(authService, createEnvironment());
    const response = {
      cookie: vi.fn()
    };

    await expect(
      controller.login(
        {
          email: "user@example.com",
          password: "super-secure-password"
        },
        {
          headers: {},
          ip: "127.0.0.1"
        } as never,
        response as never
      )
    ).resolves.toEqual({
      mfa: expect.objectContaining({
        challengeToken: "challenge-token",
        required: true
      })
    });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("clears the session cookie on logout", async () => {
    const authService = {
      logout: vi.fn().mockResolvedValue(undefined),
      getSessionCookieName: vi.fn().mockReturnValue("sfus_session")
    } as unknown as AuthService;
    const controller = new AuthController(authService, createEnvironment());
    const response = {
      clearCookie: vi.fn()
    };

    await expect(
      controller.logout(
        {
          headers: {
            cookie: "sfus_session=session-token"
          }
        } as never,
        response as never
      )
    ).resolves.toEqual({ success: true });
    expect(response.clearCookie).toHaveBeenCalledWith(
      "sfus_session",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: false
      })
    );
  });

  it("forwards raw verification request bodies without throwing type errors", async () => {
    const authService = {
      verifyEmailToken: vi.fn().mockResolvedValue({
        user: {
          id: "user-1",
          username: "user",
          email: "user@example.com",
          displayName: null,
          globalRole: "user",
          status: "active",
          emailVerified: true,
          emailVerifiedAt: new Date().toISOString(),
          onboardingRequired: false
        }
      })
    } as unknown as AuthService;
    const controller = new AuthController(authService, createEnvironment());

    await expect(controller.verifyEmail(null as never)).resolves.toEqual({
      user: expect.objectContaining({ email: "user@example.com" }),
      verified: true
    });
    expect(authService.verifyEmailToken).toHaveBeenCalledWith(null);
  });

  it("redirects to provider auth urls and handles callback redirects", async () => {
    const authService = {
      startExternalAuth: vi.fn().mockReturnValue({
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=abc",
        stateCookieValue: "state-token",
        stateCookieExpiresAt: new Date(Date.now() + 60_000).toISOString()
      }),
      loginWithExternalProvider: vi.fn().mockResolvedValue({
        user: {
          id: "user-1",
          username: "pending_user",
          email: "user@example.com",
          displayName: null,
          globalRole: "user",
          status: "onboarding_required",
          emailVerified: true,
          emailVerifiedAt: new Date().toISOString(),
          onboardingRequired: true
        },
        session: {
          id: "session-1",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          lastSeenAt: new Date().toISOString()
        },
        sessionToken: "session-token",
        redirectPath: "/onboarding/username"
      }),
      getSessionCookieName: vi.fn().mockReturnValue("sfus_session"),
      getExternalAuthStateCookieName: vi.fn().mockReturnValue("sfus_external_auth_state")
    } as unknown as AuthService;
    const controller = new AuthController(authService, createEnvironment());
    const redirectResponse = {
      cookie: vi.fn(),
      redirect: vi.fn()
    };

    await controller.startExternalAuth("google", "/app", {} as never, redirectResponse as never);
    expect(authService.startExternalAuth).toHaveBeenCalledWith("google", "/app");
    expect(redirectResponse.cookie).toHaveBeenCalledWith(
      "sfus_external_auth_state",
      "state-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax"
      })
    );
    expect(redirectResponse.redirect).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?state=abc"
    );

    const callbackResponse = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
      redirect: vi.fn()
    };
    await controller.externalAuthCallback(
      "google",
      "auth-code",
      "state-token",
      {
        headers: {
          cookie: "sfus_external_auth_state=state-token; sfus_session=session-token",
          "user-agent": "vitest"
        },
        ip: "127.0.0.1"
      } as never,
      callbackResponse as never
    );
    expect(authService.loginWithExternalProvider).toHaveBeenCalledWith(
      {
        provider: "google",
        code: "auth-code",
        state: "state-token"
      },
      expect.objectContaining({
        cookieHeader: "sfus_external_auth_state=state-token; sfus_session=session-token"
      })
    );
    expect(callbackResponse.clearCookie).toHaveBeenCalledWith(
      "sfus_external_auth_state",
      expect.objectContaining({ httpOnly: true })
    );
    expect(callbackResponse.cookie).toHaveBeenCalledWith(
      "sfus_session",
      "session-token",
      expect.objectContaining({ httpOnly: true })
    );
    expect(callbackResponse.redirect).toHaveBeenCalledWith("/onboarding/username");
  });

  it("redirects callback responses to MFA challenge flow when external login requires MFA", async () => {
    const authService = {
      loginWithExternalProvider: vi.fn().mockResolvedValue({
        mfa: {
          required: true,
          challengeToken: "challenge-token",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          nextPath: "/app"
        }
      }),
      getExternalAuthStateCookieName: vi.fn().mockReturnValue("sfus_external_auth_state")
    } as unknown as AuthService;
    const controller = new AuthController(authService, createEnvironment());
    const callbackResponse = {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
      redirect: vi.fn()
    };

    await controller.externalAuthCallback(
      "google",
      "auth-code",
      "state-token",
      {
        headers: {
          cookie: "sfus_external_auth_state=state-token",
          "user-agent": "vitest"
        },
        ip: "127.0.0.1"
      } as never,
      callbackResponse as never
    );

    expect(callbackResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/login?mfa=required")
    );
    expect(callbackResponse.cookie).not.toHaveBeenCalled();
  });

  it("exposes enrollment, recovery regeneration, disable, and challenge endpoints", async () => {
    const authService = {
      startMfaEnrollment: vi.fn().mockResolvedValue({
        secret: "ABCDEF123456",
        otpauthUrl: "otpauth://totp/SFUS:test@example.com",
        issuer: "SFUS"
      }),
      verifyMfaEnrollment: vi.fn().mockResolvedValue({
        enabled: true,
        recoveryCodes: ["AAAA-BBBB-CCCC"]
      }),
      regenerateMfaRecoveryCodes: vi.fn().mockResolvedValue({
        regenerated: true,
        recoveryCodes: ["DDDD-EEEE-FFFF"]
      }),
      disableMfa: vi.fn().mockResolvedValue({
        disabled: true
      }),
      verifyMfaChallenge: vi.fn().mockResolvedValue({
        user: {
          id: "user-1",
          username: "user",
          email: "user@example.com",
          displayName: null,
          globalRole: "user",
          status: "active",
          emailVerified: true,
          emailVerifiedAt: new Date().toISOString(),
          onboardingRequired: false
        },
        session: {
          id: "session-1",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          lastSeenAt: new Date().toISOString()
        },
        sessionToken: "session-token",
        redirectPath: "/app"
      }),
      getSessionCookieName: vi.fn().mockReturnValue("sfus_session")
    } as unknown as AuthService;
    const controller = new AuthController(authService, createEnvironment());

    await expect(
      controller.startMfaEnrollment({
        headers: {}
      } as never)
    ).resolves.toMatchObject({
      secret: "ABCDEF123456"
    });

    await expect(
      controller.verifyMfaEnrollment(
        {
          code: "123456"
        },
        {
          headers: {}
        } as never
      )
    ).resolves.toMatchObject({
      enabled: true
    });

    await expect(
      controller.regenerateRecoveryCodes(
        {
          totpCode: "123456"
        },
        {
          headers: {}
        } as never
      )
    ).resolves.toMatchObject({
      regenerated: true
    });

    await expect(
      controller.disableMfa(
        {
          totpCode: "123456"
        },
        {
          headers: {}
        } as never
      )
    ).resolves.toEqual({
      disabled: true
    });

    const response = {
      cookie: vi.fn()
    };
    await expect(
      controller.verifyMfaChallenge(
        {
          challengeToken: "challenge-token",
          totpCode: "123456"
        },
        {
          headers: {},
          ip: "127.0.0.1"
        } as never,
        response as never
      )
    ).resolves.toMatchObject({
      redirectPath: "/app"
    });
    expect(response.cookie).toHaveBeenCalledWith(
      "sfus_session",
      "session-token",
      expect.objectContaining({ httpOnly: true })
    );
  });
});
