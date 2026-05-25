import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import {
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
  ): Promise<{ user: AuthenticatedUserPayload; session: AuthenticatedSessionPayload }> {
    const result = await this.authService.loginWithPassword(body, {
      cookieHeader: request.headers.cookie,
      ipAddress: request.ip || null,
      userAgent: request.headers["user-agent"] || null
    });

    this.setSessionCookie(response, result.sessionToken, result.session.expiresAt);
    return {
      user: result.user,
      session: result.session
    };
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

  @Get("external/:provider/start")
  @ApiOperation({ summary: "Start Google/GitHub authentication by redirecting to the provider." })
  async startExternalAuth(
    @Param("provider") provider: string,
    @Query("next") nextPath: string | undefined,
    @Res() response: Response
  ): Promise<void> {
    const result = this.authService.startExternalAuth(provider, nextPath);
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
    const result = await this.authService.loginWithExternalProvider(
      {
        provider,
        code,
        state
      },
      {
        cookieHeader: request.headers.cookie,
        ipAddress: request.ip || null,
        userAgent: request.headers["user-agent"] || null
      }
    );
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
}
