/**
 * throttle-store.ts
 *
 * In-memory IThrottleStore implementation.
 *
 * This is the default wired implementation.  The seam is the IThrottleStore
 * interface: to swap to Redis, provide an alternative implementation through
 * the ThrottleModule without changing any guard or route code.
 *
 * Design: fixed window counter.  Each entry tracks the hit count and the
 * timestamp at which the window expires.  On the first hit in a window a new
 * entry is created; after expiry the entry is reset.  A periodic sweep prunes
 * expired entries so memory does not grow without bound.
 */

import { Injectable } from "@nestjs/common";

import type { IThrottleStore, ThrottleHitResult } from "./throttle.types";

interface WindowEntry {
  count: number;
  resetAt: number;
}

/** Sweep expired entries when the map exceeds this size. */
const SWEEP_THRESHOLD = 10_000;

/** @internal Exported for test harness usage only. */
export function nowMs(): number {
  return Date.now();
}

@Injectable()
export class InMemoryThrottleStore implements IThrottleStore {
  private readonly windows = new Map<string, WindowEntry>();

  hit(key: string, windowMs: number): ThrottleHitResult {
    const now = nowMs();
    const existing = this.windows.get(key);

    if (existing && now < existing.resetAt) {
      // Within the current window — increment and return.
      existing.count += 1;
      return { count: existing.count, resetAt: existing.resetAt };
    }

    // Expired or new window — open a fresh window.
    const entry: WindowEntry = { count: 1, resetAt: now + windowMs };
    this.windows.set(key, entry);

    // Opportunistic sweep to prevent unbounded memory growth.
    if (this.windows.size > SWEEP_THRESHOLD) {
      this.sweep(now);
    }

    return { count: 1, resetAt: entry.resetAt };
  }

  /** Remove expired entries.  Called lazily when the map grows large. */
  private sweep(now: number): void {
    for (const [k, entry] of this.windows) {
      if (now >= entry.resetAt) {
        this.windows.delete(k);
      }
    }
  }
}
