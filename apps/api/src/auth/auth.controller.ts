import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request, Response } from "express";

import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import {
  type AuthenticatedSessionPayload,
  type AuthenticatedUserPayload,
  AuthService
} from "./auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(API_ENVIRONMENT)
    private readonly environment: ApplicationEnvironment
  ) {}

  @Post("register")
  @ApiOperation({ summary: "Register a local account with email and password." })
  @ApiOkResponse({ description: "Registration succeeded and email verification is required." })
  async register(
    @Body() body: unknown
  ): Promise<{
    user: AuthenticatedUserPayload;
    emailVerification: { required: true; expiresAt: string; token?: string };
  }> {
    return this.authService.registerAccount(body);
  }

  @Post("verify-email")
  @ApiOperation({ summary: "Verify the primary email address with a verification token." })
  @ApiOkResponse({ description: "Email verification succeeded." })
  async verifyEmail(@Body() body: unknown): Promise<{
    user: AuthenticatedUserPayload;
    verified: true;
  }> {
    const result = await this.authService.verifyEmailToken(body);
    return {
      user: result.user,
      verified: true
    };
  }

  @Post("login")
  @ApiOperation({ summary: "Authenticate and start an HTTP-only session." })
  @ApiOkResponse({ description: "Login succeeded and a secure session cookie was issued." })
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<
    | { user: AuthenticatedUserPayload; session: AuthenticatedSessionPayload }
    | {
        mfa: {
          required: true;
          challengeToken: string;
          expiresAt: string;
          nextPath: string;
        };
      }
  > {
    const result = await this.authService.loginWithPassword(body, {
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    });

    if ("mfa" in result) {
      return { mfa: result.mfa };
    }

    this.setSessionCookie(response, result.sessionToken, result.session.expiresAt);
    return {
      user: result.user,
      session: result.session
    };
  }

  @Post("mfa/challenge")
  @ApiOperation({ summary: "Complete MFA challenge and issue an authenticated session." })
  @ApiOkResponse({ description: "MFA verification succeeded and a secure session cookie was issued." })
  async verifyMfaChallenge(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<{
    user: AuthenticatedUserPayload;
    session: AuthenticatedSessionPayload;
    redirectPath: string;
  }> {
    const result = await this.authService.verifyMfaChallenge(body, {
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    });
    this.setSessionCookie(response, result.sessionToken, result.session.expiresAt);
    return {
      user: result.user,
      session: result.session,
      redirectPath: result.redirectPath
    };
  }

  @Post("mfa/enroll")
  @ApiOperation({ summary: "Start MFA enrollment by issuing a TOTP secret for the authenticated user." })
  @ApiOkResponse({ description: "MFA enrollment secret and otpauth URI returned." })
  async startMfaEnrollment(@Req() request: Request): Promise<{
    secret: string;
    otpauthUrl: string;
    issuer: string;
  }> {
    return this.authService.startMfaEnrollment({
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    });
  }

  @Post("mfa/enroll/verify")
  @ApiOperation({ summary: "Verify TOTP enrollment and issue recovery codes." })
  @ApiOkResponse({ description: "MFA is enabled and recovery codes are returned once." })
  async verifyMfaEnrollment(
    @Body() body: unknown,
    @Req() request: Request
  ): Promise<{ enabled: true; recoveryCodes: string[] }> {
    return this.authService.verifyMfaEnrollment(body, {
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    });
  }

  @Post("mfa/recovery/regenerate")
  @ApiOperation({ summary: "Regenerate recovery codes for an authenticated MFA-enabled account." })
  @ApiOkResponse({ description: "Recovery codes were regenerated and returned." })
  async regenerateRecoveryCodes(
    @Body() body: unknown,
    @Req() request: Request
  ): Promise<{ regenerated: true; recoveryCodes: string[] }> {
    return this.authService.regenerateMfaRecoveryCodes(body, {
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    });
  }

  @Post("mfa/disable")
  @ApiOperation({ summary: "Disable MFA for the authenticated account after MFA proof." })
  @ApiOkResponse({ description: "MFA disabled and recovery codes removed." })
  async disableMfa(@Body() body: unknown, @Req() request: Request): Promise<{ disabled: true }> {
    return this.authService.disableMfa(body, {
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    });
  }

  @Post("logout")
  @ApiOperation({ summary: "Revoke the current session and clear the session cookie." })
  @ApiOkResponse({ description: "Logout succeeded." })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ success: true }> {
    await this.authService.logout({
      cookieHeader: request.headers.cookie
    });
    this.clearSessionCookie(response);
    return { success: true };
  }

  @Get("session")
  @ApiOperation({ summary: "Return the authenticated user and active session details." })
  @ApiOkResponse({ description: "Session is valid and authenticated user details are returned." })
  @ApiUnauthorizedResponse({ description: "Authentication is required or the session is expired." })
  async getCurrentSession(
    @Req() request: Request
  ): Promise<{ user: AuthenticatedUserPayload; session: AuthenticatedSessionPayload }> {
    const result = await this.authService.resolveSession({
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    });
    return {
      user: result.user,
      session: result.session
    };
  }

  @Get("profile")
  @ApiOperation({ summary: "Return profile basics for the authenticated user." })
  @ApiOkResponse({ description: "Profile basics resolved." })
  @ApiForbiddenResponse({ description: "Authenticated user is not authorized for the requested profile." })
  async getProfile(@Req() request: Request): Promise<{
    username: string;
    email: string;
    displayName: string | null;
  }> {
    return this.authService.getProfile({
      cookieHeader: request.headers.cookie
    }, this.readTargetUserId(request.query.userId));
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update profile basics for the authenticated user." })
  @ApiOkResponse({ description: "Profile basics updated." })
  @ApiForbiddenResponse({ description: "Authenticated user is not authorized for the requested profile." })
  async updateProfile(
    @Body() body: unknown,
    @Req() request: Request
  ): Promise<{ username: string; email: string; displayName: string | null }> {
    return this.authService.updateProfile(body, {
      cookieHeader: request.headers.cookie
    }, this.readTargetUserId(request.query.userId));
  }

  @Get("settings")
  @ApiOperation({ summary: "Return account settings basics for the authenticated user." })
  @ApiOkResponse({ description: "Account settings basics resolved." })
  @ApiForbiddenResponse({ description: "Authenticated user is not authorized for the requested settings." })
  async getSettings(@Req() request: Request): Promise<{
    username: string;
    email: string;
    emailVerified: boolean;
    mfaEnabled: boolean;
  }> {
    return this.authService.getSettings({
      cookieHeader: request.headers.cookie
    }, this.readTargetUserId(request.query.userId));
  }

  @Patch("settings")
  @ApiOperation({ summary: "Update account settings basics for the authenticated user." })
  @ApiOkResponse({ description: "Account settings basics updated." })
  @ApiForbiddenResponse({ description: "Authenticated user is not authorized for the requested settings." })
  async updateSettings(
    @Body() body: unknown,
    @Req() request: Request
  ): Promise<{ username: string; email: string; emailVerified: boolean; mfaEnabled: boolean }> {
    return this.authService.updateSettings(body, {
      cookieHeader: request.headers.cookie
    }, this.readTargetUserId(request.query.userId));
  }

  @Get("external/:provider/start")
  @ApiOperation({ summary: "Start Google/GitHub authentication by redirecting to the provider." })
  async startExternalAuth(
    @Param("provider") provider: string,
    @Query("next") nextPath: string | undefined,
    @Req() _request: Request,
    @Res() response: Response
  ): Promise<void> {
    const result = this.authService.startExternalAuth(provider, nextPath);
    this.setExternalAuthStateCookie(response, result.stateCookieValue, result.stateCookieExpiresAt);
    response.redirect(result.authorizationUrl);
  }

  @Get("external/:provider/callback")
  @ApiOperation({ summary: "Handle provider callback, link accounts, and start a session." })
  async externalAuthCallback(
    @Param("provider") provider: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const requestContext = {
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    };
    let result: Awaited<ReturnType<AuthService["loginWithExternalProvider"]>>;
    try {
      result = await this.authService.loginWithExternalProvider(
        {
          provider,
          code,
          state
        },
        requestContext
      );
    } finally {
      this.clearExternalAuthStateCookie(response);
    }
    if ("mfa" in result) {
      response.redirect(this.buildMfaRedirect(result.mfa));
      return;
    }

    this.setSessionCookie(response, result.sessionToken, result.session.expiresAt);
    response.redirect(result.redirectPath);
  }

  @Post("onboarding/username")
  @ApiOperation({ summary: "Complete first-login external onboarding by choosing a username." })
  async completeOnboarding(
    @Body() body: unknown,
    @Req() request: Request
  ): Promise<{ user: AuthenticatedUserPayload; session: AuthenticatedSessionPayload }> {
    const result = await this.authService.completeExternalOnboarding(body, {
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    });
    return {
      user: result.user,
      session: result.session
    };
  }

  private setSessionCookie(response: Response, token: string, expiresAt: string): void {
    response.cookie(this.authService.getSessionCookieName(), token, {
      httpOnly: true,
      secure: this.environment.nodeEnv === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt)
    });
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(this.authService.getSessionCookieName(), {
      httpOnly: true,
      secure: this.environment.nodeEnv === "production",
      sameSite: "lax",
      path: "/"
    });
  }

  private setExternalAuthStateCookie(response: Response, state: string, expiresAt: string): void {
    response.cookie(this.authService.getExternalAuthStateCookieName(), state, {
      httpOnly: true,
      secure: this.environment.nodeEnv === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt)
    });
  }

  private clearExternalAuthStateCookie(response: Response): void {
    response.clearCookie(this.authService.getExternalAuthStateCookieName(), {
      httpOnly: true,
      secure: this.environment.nodeEnv === "production",
      sameSite: "lax",
      path: "/"
    });
  }

  private buildMfaRedirect(challenge: {
    challengeToken: string;
    nextPath: string;
  }): string {
    const params = new URLSearchParams({
      mfa: "required",
      challenge: challenge.challengeToken,
      next: challenge.nextPath
    });
    return `/login?${params.toString()}`;
  }

  private readTargetUserId(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }
}
