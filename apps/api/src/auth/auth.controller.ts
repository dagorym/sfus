import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { Request, Response } from "express";

import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import {
  type AuthenticatedSessionPayload,
  type AuthenticatedUserPayload,
  AuthService
} from "./auth.service";

interface RegisterRequestBody {
  email: string;
  username: string;
  password: string;
}

interface LoginRequestBody {
  email: string;
  password: string;
}

interface VerifyEmailRequestBody {
  token: string;
}

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
    @Body() body: RegisterRequestBody
  ): Promise<{
    user: AuthenticatedUserPayload;
    emailVerification: { required: true; expiresAt: string; token?: string };
  }> {
    return this.authService.registerAccount(body);
  }

  @Post("verify-email")
  @ApiOperation({ summary: "Verify the primary email address with a verification token." })
  @ApiOkResponse({ description: "Email verification succeeded." })
  async verifyEmail(@Body() body: VerifyEmailRequestBody): Promise<{
    user: AuthenticatedUserPayload;
    verified: true;
  }> {
    const result = await this.authService.verifyEmailToken(body.token);
    return {
      user: result.user,
      verified: true
    };
  }

  @Post("login")
  @ApiOperation({ summary: "Authenticate and start an HTTP-only session." })
  @ApiOkResponse({ description: "Login succeeded and a secure session cookie was issued." })
  async login(
    @Body() body: LoginRequestBody,
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
