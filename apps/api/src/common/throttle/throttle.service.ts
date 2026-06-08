/**
 * throttle.service.ts
 *
 * ThrottleService — identity-keyed rate-limit helper.
 *
 * Responsibility: given a route-class label and an Express request, decide
 * whether the caller has exceeded the configured rate limit and, if so, throw
 * an HttpException(429) with a JsonExceptionFilter-compatible envelope and a
 * Retry-After hint in seconds.
 *
 * Identity resolution (security-critical):
 *   - Prefer the session user id (authenticated user) as the throttle key.
 *   - Fall back to `request.ip` (the Express-resolved client IP) for guests.
 *     `request.ip` is authoritative under `trust proxy=1` (locked MS1 decision).
 *     The guard MUST NOT parse X-Forwarded-For directly; it trusts Express.
 *
 * New-account tier:
 *   - When the caller is authenticated AND their account was created within the
 *     `newAccountWindowMs` window, a stricter limit applies.
 *   - The caller's `createdAt` is read from the UserEntity resolved by
 *     AuthService.resolveSession() (available via the session payload).
 *     ThrottleService.checkRequest() accepts the optional createdAt to keep
 *     the service stateless and easy to unit-test.
 */

import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";

import type { IThrottleStore, ThrottleConfig } from "./throttle.types";
import { THROTTLE_CONFIG, THROTTLE_STORE } from "./throttle.types";

/**
 * Context supplied to checkRequest() by the guard.
 */
export interface ThrottleRequestContext {
  /** Label identifying the route class (e.g. "forum-post", "blog-comment"). */
  routeLabel: string;
  /** Express request — ip used for guest identity. */
  request: Request;
  /** Authenticated user id, if a session is present. */
  userId?: string | null;
  /**
   * Authenticated user's account creation timestamp, if available.
   * When present and within newAccountWindowMs, the stricter tier applies.
   */
  userCreatedAt?: Date | null;
}

@Injectable()
export class ThrottleService {
  constructor(
    @Inject(THROTTLE_STORE) private readonly store: IThrottleStore,
    @Inject(THROTTLE_CONFIG) private readonly config: ThrottleConfig
  ) {}

  /**
   * Check whether the caller is within the rate limit for the given route.
   *
   * Throws HttpException(429) on breach — the response body is shaped to match
   * the JsonExceptionFilter envelope so it is handled consistently.
   *
   * Returns void on pass-through.
   */
  checkRequest(ctx: ThrottleRequestContext): void {
    const { routeLabel, request, userId, userCreatedAt } = ctx;

    // Resolve identity: prefer authenticated user id, fall back to proxy-resolved IP.
    // NEVER parse X-Forwarded-For here — request.ip is already resolved by Express.
    const identity = userId ?? request.ip ?? "unknown";

    const key = `${routeLabel}:${identity}`;

    // Determine which tier applies.
    const isNewAccount =
      !!userId &&
      !!userCreatedAt &&
      Date.now() - userCreatedAt.getTime() < this.config.newAccountWindowMs;

    const maxHits = isNewAccount ? this.config.newAccountMaxHits : this.config.maxHits;

    const result = this.store.hit(key, this.config.windowMs);

    if (result.count > maxHits) {
      const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
      const retryAfter = Math.max(retryAfterSeconds, 1);

      throw new HttpException(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          retryAfter
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }
}
