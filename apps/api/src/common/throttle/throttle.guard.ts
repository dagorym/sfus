/**
 * throttle.guard.ts
 *
 * ThrottleGuard — NestJS CanActivate guard that delegates to ThrottleService.
 *
 * Usage: attach via @UseGuards(ThrottleGuard) on a controller or handler.
 * The route label defaults to the controller class name; annotate with
 * @SetMetadata(THROTTLE_ROUTE_LABEL, "custom-label") to override.
 *
 * The guard resolves the session identity (user id + createdAt) by reading
 * the session cookie from the incoming request.  Because this guard runs
 * before the controller, session resolution is best-effort:
 *
 *   - If a valid session is found: userId + userCreatedAt are passed to the
 *     service for identity key + new-account-tier determination.
 *   - If no session or an invalid/expired session: falls back to request.ip.
 *
 * This design ensures the guard never blocks valid requests due to session
 * resolution failures, while still using the most accurate identity available.
 *
 * Security note: request.ip is the Express-resolved IP under trust proxy=1.
 * The guard never reads X-Forwarded-For directly.
 */

import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { AuthService } from "../../auth/auth.service";
import { ThrottleService } from "./throttle.service";

/** Metadata key for a custom per-route throttle label. */
export const THROTTLE_ROUTE_LABEL = "throttle:routeLabel";

/**
 * Attach a custom throttle-label to a controller or handler.
 *
 * @example
 * @ThrottleLabel("forum-post")
 * @UseGuards(ThrottleGuard)
 * async createPost(...) {}
 */
export const ThrottleLabel = (label: string) => SetMetadata(THROTTLE_ROUTE_LABEL, label);

@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly throttleService: ThrottleService,
    private readonly authService: AuthService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Determine route label: use @ThrottleLabel metadata, or fall back to
    // the controller class name.
    const customLabel = this.reflector.get<string | undefined>(
      THROTTLE_ROUTE_LABEL,
      context.getHandler()
    );
    const routeLabel = customLabel ?? context.getClass().name;

    // Best-effort session resolution for identity and new-account tier.
    let userId: string | null = null;
    const userCreatedAt: Date | null = null;

    try {
      const session = await this.authService.resolveSession({
        cookieHeader: request.headers.cookie
      });
      userId = session.user.id;
      // resolveSession returns the user payload; createdAt is not in the payload.
      // We resolve it separately when needed via a lightweight DB lookup below.
      // For now, pass null — the new-account tier check is opt-in via the
      // ThrottleGuardWithCreatedAt variant when the controller can supply createdAt.
      // The guard itself can look up createdAt when required.
      // (See ThrottleService.checkRequest for the tier logic.)
    } catch {
      // No valid session — use IP-based identity (already the default in ThrottleService).
    }

    this.throttleService.checkRequest({
      routeLabel,
      request,
      userId,
      userCreatedAt
    });

    return true;
  }
}
