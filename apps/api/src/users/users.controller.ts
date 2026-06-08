/**
 * users.controller.ts
 *
 * UsersController (ST14, ST15) — self-service profile endpoints:
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
 * 3. PUT /users/me/avatar  (ST15)
 *    Set the calling user's avatar.  Body: { mediaId: string }
 *    - 400 when `mediaId` is missing or not a non-empty string.
 *    - 401 when no active session.
 *    - 403 when the media id does not exist, is not resourceType='avatar',
 *         or is not owned by the caller (uniform — no oracle).
 *    - 200 { avatarUrl: "/api/media/<id>" } on success.
 *
 * 4. DELETE /users/me/avatar  (ST15)
 *    Remove (clear) the calling user's avatar.
 *    - 401 when no active session.
 *    - 200 { avatarUrl: null } on success.
 *
 * Security (P12):
 *   - Suggest: 400 guard first, then 401 auth gate, then throttle, then DB.
 *     Field allowlist enforced in UsersService.suggestByPrefix.
 *   - Profile: uniform 404 for nonexistent/inactive (no enumeration oracle).
 *     Field allowlist enforced in UsersService.findPublicProfile.
 *   - Set-avatar: 400 guard first, then 401 auth gate, then ownership
 *     validation; uniform 403 for nonexistent/wrong-type/foreign ids (no
 *     existence oracle for foreign media).
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  Query,
  Req
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
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
import type {
  PublicProfileShape,
  RemoveAvatarResponse,
  SetAvatarBody,
  SetAvatarResponse,
  UserSuggestResponse
} from "./users.types";

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
  // PUT /users/me/avatar  (ST15 — set avatar, ownership-enforced)
  // ===========================================================================

  /**
   * Set the calling user's avatar by binding a media_references id.
   *
   * Security order: 400 → 401 → ownership validation → DB.
   *
   * Validates that the media id exists, is resourceType='avatar', and is owned
   * by the calling user.  Returns a uniform 403 for all not-allowed cases to
   * avoid leaking the existence of a foreign media id (oracle parity).
   *
   * @param body  { mediaId: string } — the media_references id to bind.
   */
  @Put("me/avatar")
  @HttpCode(200)
  @ApiOperation({ summary: "Set the calling user's avatar (ownership-enforced)." })
  @ApiOkResponse({
    description: "Avatar bound successfully. Returns the resolved /api/media/<id> URL."
  })
  @ApiBadRequestResponse({ description: "Missing or non-string `mediaId` in request body." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiForbiddenResponse({
    description:
      "Media id not found, is not resourceType='avatar', or is not owned by the caller. " +
      "Message is identical for all three cases (no existence oracle)."
  })
  async setAvatar(
    @Body() body: unknown,
    @Req() request: Request
  ): Promise<SetAvatarResponse> {
    // 400 guard — body must be an object with a non-empty string mediaId.
    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as Record<string, unknown>)["mediaId"] !== "string" ||
      ((body as Record<string, unknown>)["mediaId"] as string).trim() === ""
    ) {
      throw new BadRequestException("Request body must contain a non-empty string `mediaId`.");
    }
    const { mediaId } = body as SetAvatarBody;

    // 401 gate — resolveSession throws UnauthorizedException when no valid session.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });

    // Ownership validation — throws ForbiddenException on any not-allowed case.
    const avatarUrl = await this.usersService.setAvatar(session.user.id, mediaId);
    return { avatarUrl };
  }

  // ===========================================================================
  // DELETE /users/me/avatar  (ST15 — remove avatar)
  // ===========================================================================

  /**
   * Remove the calling user's avatar (clears avatar_media_id to null).
   *
   * Security order: 401 → DB.
   *
   * Requires an active session (401 otherwise).
   */
  @Delete("me/avatar")
  @HttpCode(200)
  @ApiOperation({ summary: "Remove the calling user's avatar." })
  @ApiOkResponse({ description: "Avatar cleared. Returns { avatarUrl: null }." })
  @ApiUnauthorizedResponse({ description: "No active session." })
  async removeAvatar(@Req() request: Request): Promise<RemoveAvatarResponse> {
    // 401 gate — resolveSession throws UnauthorizedException when no valid session.
    const session = await this.authService.resolveSession({ cookieHeader: request.headers.cookie });

    await this.usersService.removeAvatar(session.user.id);
    return { avatarUrl: null };
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
