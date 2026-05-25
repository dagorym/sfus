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
          emailVerifiedAt: new Date().toISOString()
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
          emailVerifiedAt: new Date().toISOString()
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
});
