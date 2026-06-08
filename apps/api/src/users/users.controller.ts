/**
 * users.controller.ts
 *
 * UsersController (ST14) — two public-facing, security-sensitive endpoints:
 *
 * 1. GET /users/suggest?q=
 *    Session-gated, throttled username prefix-suggest.
 *    Returns at most 10 active users matching the prefix.
 *    Response: { users: Array<{ username, displayName, avatarUrl }> }
 *    - 400 when `q` is not a string.
 *    - 401 when no active session is present.
 *    - 429 when the caller has exceeded the throttle limit.
 *    Never includes email, globalRole, status, id, or any other field.
 *
 * 2. GET /users/:username
 *    Minimal public profile for an active user.
 *    Response: { profile: { username, displayName, avatar, bio, joinDate } }
 *    - 400 when `:username` is not a non-empty string.
 *    - 404 for both nonexistent and inactive users (uniform — no enumeration oracle).
 *    Never includes email, globalRole, status, id, or any other field.
 *
 * Security (P12):
 *   - Suggest: 400 guard first, then 401 auth gate, then throttle, then DB.
 *     Field allowlist enforced in UsersService.suggestByPrefix.
 *   - Profile: uniform 404 for nonexistent/inactive (no enumeration oracle).
 *     Field allowlist enforced in UsersService.findPublicProfile.
 */

import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { ThrottleService } from "../common/throttle/throttle.service";
import { UsersService } from "./users.service";
import type { PublicProfileShape, UserSuggestResponse } from "./users.types";

/** Route label for the suggest throttle key. */
const THROTTLE_LABEL_SUGGEST = "user-suggest";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly throttleService: ThrottleService
  ) {}

  // ===========================================================================
  // GET /users/suggest?q=  (ST14 — session-gated, throttled)
  // ===========================================================================

  /**
   * Username prefix-suggest for active users.
   *
   * Security order: 400 → 401 → throttle → DB.
   *
   * Requires an active session (401 before any DB work).
   * Throttled via ThrottleService with session userId + createdAt for the
   * new-account tier (ST9 pattern).
   *
   * Returns at most 10 results matching the prefix on active users only.
   * Response exposes ONLY username/displayName/avatarUrl — never email, role,
   * status, or any other field (allowlist enforced in service).
   *
   * @param q Prefix string (empty string → capped list of active users).
   */
  @Get("suggest")
  @ApiOperation({ summary: "Prefix-suggest active usernames (session-gated, throttled)." })
  @ApiOkResponse({
    description:
      "Up to 10 active users matching the prefix. " +
      "Response contains ONLY username/displayName/avatarUrl."
  })
  @ApiBadRequestResponse({ description: "Missing or non-string `q` query parameter." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded." })
  async suggest(@Req() request: Request, @Query("q") q: unknown): Promise<UserSuggestResponse> {
    // 400 guard — q must be a string (missing query param yields undefined).
    if (typeof q !== "string") {
      throw new BadRequestException("Query parameter `q` is required and must be a string.");
    }

    // 401 gate — resolveSession throws UnauthorizedException when no valid session.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });

    // Throttle with userId + createdAt for new-account tier (ST9 pattern).
    const userEntity = await this.usersService.findById(session.user.id);
    this.throttleService.checkRequest({
      routeLabel: THROTTLE_LABEL_SUGGEST,
      request,
      userId: session.user.id,
      userCreatedAt: userEntity?.createdAt ?? null
    });

    const users = await this.usersService.suggestByPrefix(q);
    return { users };
  }

  // ===========================================================================
  // GET /users/:username  (ST14 — minimal public profile)
  // ===========================================================================

  /**
   * Minimal public profile for an active user.
   *
   * Returns exactly five fields: username, displayName, avatar, bio, joinDate.
   * Avatar is the /api/media/<id> URL or null.
   *
   * Returns a uniform 404 for both nonexistent users and users that exist but
   * are inactive — no enumeration oracle (P12).
   *
   * No authentication required (public endpoint).
   *
   * @param username The username to look up.
   */
  @Get(":username")
  @ApiOperation({ summary: "Minimal public profile for an active user." })
  @ApiOkResponse({
    description:
      "Public profile with exactly five fields: username, displayName, avatar, bio, joinDate."
  })
  @ApiBadRequestResponse({ description: "Missing or non-string `:username` param." })
  @ApiNotFoundResponse({
    description:
      "User not found or inactive. Message is identical for both cases (enumeration parity)."
  })
  async getPublicProfile(
    @Param("username") username: unknown
  ): Promise<{ profile: PublicProfileShape }> {
    // 400 guard — username must be a non-empty string.
    if (typeof username !== "string" || username.trim() === "") {
      throw new BadRequestException("Parameter `username` must be a non-empty string.");
    }

    // Uniform 404 for nonexistent and inactive — no enumeration oracle (P12).
    const profile = await this.usersService.findPublicProfile(username);
    if (!profile) {
      throw new NotFoundException("User not found.");
    }

    return { profile };
  }
}
