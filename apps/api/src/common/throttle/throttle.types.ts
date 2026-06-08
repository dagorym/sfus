/**
 * throttle.types.ts
 *
 * Shared type definitions for the throttle module.
 * These are the contracts used by the guard, service, and store.
 */

/**
 * The result returned by IThrottleStore.hit().
 */
export interface ThrottleHitResult {
  /** How many hits have been recorded in the current window, including this one. */
  count: number;
  /** Unix epoch ms at which the current window resets. */
  resetAt: number;
}

/**
 * Storage seam for throttle state.
 *
 * Wire the production in-memory implementation via the ThrottleModule.
 * To swap to Redis: implement this interface and provide it via the module.
 * No guard or route change is required.
 */
export interface IThrottleStore {
  /**
   * Record a hit for the given key within the specified sliding window.
   *
   * @param key      Opaque string key: `{routeClass}:{identity}`.
   * @param windowMs The window duration in milliseconds.
   * @returns The updated hit count and the timestamp at which the window resets.
   */
  hit(key: string, windowMs: number): ThrottleHitResult;
}

/** Injection token for IThrottleStore. */
export const THROTTLE_STORE = Symbol("THROTTLE_STORE");

/**
 * Configuration shape injected into ThrottleService / ThrottleGuard.
 *
 * All fields map 1-to-1 to env vars parsed in environment.ts.
 */
export interface ThrottleConfig {
  /** Default window duration in milliseconds. */
  windowMs: number;
  /** Max hits per window for established accounts. */
  maxHits: number;
  /** Max hits per window for new-account tier. */
  newAccountMaxHits: number;
  /**
   * How long (ms) after account creation a user is considered "new" for the
   * stricter new-account tier.
   */
  newAccountWindowMs: number;
  /** Maximum number of URLs allowed in a Markdown post body. */
  maxLinksPerPost: number;
}

/** Injection token for ThrottleConfig. */
export const THROTTLE_CONFIG = Symbol("THROTTLE_CONFIG");
