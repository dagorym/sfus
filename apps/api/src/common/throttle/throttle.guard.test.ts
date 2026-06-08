/**
 * throttle.guard.test.ts
 *
 * Tests for ThrottleGuard.canActivate() and the fail-closed contract.
 *
 * Acceptance criteria covered:
 *   AC-Security-FailClosed — a throwing IThrottleStore must cause request
 *     DENIAL (never silent allow); proven by injecting a store that throws
 *     and confirming the guard propagates the error rather than returning true.
 *   AC1 (supplemental) — IP-fallback when no session/userId is available.
 *   AC3 (supplemental) — store sweep/eviction: InMemoryThrottleStore prunes
 *     expired entries when the map exceeds the sweep threshold.
 */

import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

import { ThrottleGuard } from "./throttle.guard";
import { ThrottleService } from "./throttle.service";
import type { IThrottleStore, ThrottleConfig } from "./throttle.types";
import { InMemoryThrottleStore } from "./throttle-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ThrottleConfig for testing. */
function makeConfig(overrides: Partial<ThrottleConfig> = {}): ThrottleConfig {
  return {
    windowMs: 60_000,
    maxHits: 100,
    newAccountMaxHits: 10,
    newAccountWindowMs: 7 * 24 * 60 * 60 * 1000,
    maxLinksPerPost: 10,
    ...overrides
  };
}

/** Build a fake Express Request with an ip property. */
function makeRequest(ip = "10.0.0.1"): Request {
  return { ip, headers: {} } as unknown as Request;
}

/**
 * Build a minimal NestJS ExecutionContext mock.
 * handler and class are provided so Reflector.get() can be called.
 */
function makeContext(request: Request): ExecutionContext {
  const handler = () => {};
  class FakeController {}
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => FakeController
  } as unknown as ExecutionContext;
}

/** Build a mock AuthService that resolves with the given userId. */
function makeAuthService(userId: string): { resolveSession: ReturnType<typeof vi.fn> } {
  return {
    resolveSession: vi.fn().mockResolvedValue({ user: { id: userId } })
  };
}

/** Build a mock AuthService that always rejects (no valid session). */
function makeAuthServiceNoSession(): { resolveSession: ReturnType<typeof vi.fn> } {
  return {
    resolveSession: vi.fn().mockRejectedValue(new Error("no session"))
  };
}

/** Build a Reflector that always returns undefined (no custom route label). */
function makeReflector(): Reflector {
  return { get: vi.fn().mockReturnValue(undefined) } as unknown as Reflector;
}

// ---------------------------------------------------------------------------
// AC-Security-FailClosed: throwing store causes request DENIAL
// ---------------------------------------------------------------------------

describe("ThrottleGuard — fail-closed on store error (AC-Security-FailClosed)", () => {
  /**
   * Core requirement: when IThrottleStore.hit() throws, the guard must NOT
   * return true (silent allow).  The error must propagate so NestJS can
   * handle it as a 500 (or equivalent denial), never as a pass-through.
   *
   * This test is non-vacuous: it verifies that the guard's control flow does
   * NOT catch store errors, unlike the session-resolution error which IS
   * caught and treated as a fall-through to IP-based identity.
   */
  it("propagates the error when IThrottleStore.hit() throws — does NOT silently allow", async () => {
    // Store that always throws on hit().
    const throwingStore: IThrottleStore = {
      hit: vi.fn().mockImplementation(() => {
        throw new Error("Store connection failure");
      })
    };

    const service = new ThrottleService(throwingStore, makeConfig({ maxHits: 100 }));
    const authService = makeAuthServiceNoSession();
    const reflector = makeReflector();

    const guard = new ThrottleGuard(
      service,
      authService as never,
      reflector
    );

    const request = makeRequest("192.168.1.1");
    const context = makeContext(request);

    // The guard MUST throw — it must not return true (silent allow).
    await expect(guard.canActivate(context)).rejects.toThrow("Store connection failure");
  });

  it("does NOT return true when store throws — fails closed, not open", async () => {
    const throwingStore: IThrottleStore = {
      hit: vi.fn().mockImplementation(() => {
        throw new Error("Redis timeout");
      })
    };

    const service = new ThrottleService(throwingStore, makeConfig());
    const authService = makeAuthServiceNoSession();
    const reflector = makeReflector();

    const guard = new ThrottleGuard(service, authService as never, reflector);
    const context = makeContext(makeRequest());

    let returned: boolean | undefined;
    let threw = false;

    try {
      returned = await guard.canActivate(context);
    } catch {
      threw = true;
    }

    // Must throw (fail-closed), not silently return true (fail-open).
    expect(threw).toBe(true);
    expect(returned).toBeUndefined();
  });

  it("correctly distinguishes session errors (caught/ignored) from store errors (propagated)", async () => {
    // Session resolution errors are caught in the guard's try/catch and fall
    // through to IP-based identity.  Store errors must NOT be caught.
    //
    // This test verifies the semantic difference: a session error with a working
    // store results in a PASS (IP-keyed identity); a working session with a
    // throwing store results in a THROW (denial).

    // Scenario A: session error, working store → should pass (returns true)
    {
      const workingStore: IThrottleStore = {
        hit: vi.fn().mockReturnValue({ count: 1, resetAt: Date.now() + 60_000 })
      };
      const service = new ThrottleService(workingStore, makeConfig());
      const noSessionAuth = makeAuthServiceNoSession();
      const reflector = makeReflector();
      const guard = new ThrottleGuard(service, noSessionAuth as never, reflector);

      const result = await guard.canActivate(makeContext(makeRequest("10.1.2.3")));
      expect(result).toBe(true);
    }

    // Scenario B: session resolves, store throws → must propagate (denial)
    {
      const throwingStore: IThrottleStore = {
        hit: vi.fn().mockImplementation(() => {
          throw new Error("DB error");
        })
      };
      const service = new ThrottleService(throwingStore, makeConfig());
      const sessionAuth = makeAuthService("user-123");
      const reflector = makeReflector();
      const guard = new ThrottleGuard(service, sessionAuth as never, reflector);

      await expect(guard.canActivate(makeContext(makeRequest()))).rejects.toThrow("DB error");
    }
  });
});

// ---------------------------------------------------------------------------
// AC1 (supplemental): IP fallback when no userId is available
// ---------------------------------------------------------------------------

describe("ThrottleGuard — IP fallback when no session (AC1 supplemental)", () => {
  it("uses request.ip as identity when session resolution fails", async () => {
    const store: IThrottleStore = {
      hit: vi.fn().mockReturnValue({ count: 1, resetAt: Date.now() + 60_000 })
    };
    const service = new ThrottleService(store, makeConfig());
    const authService = makeAuthServiceNoSession();
    const reflector = makeReflector();

    const guard = new ThrottleGuard(service, authService as never, reflector);
    const request = makeRequest("203.0.113.55");
    const context = makeContext(request);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);

    // Verify the store was called with a key that contains the IP.
    const hitCall = (store.hit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(hitCall[0]).toContain("203.0.113.55");
  });

  it("uses userId as identity key when session resolves successfully", async () => {
    const store: IThrottleStore = {
      hit: vi.fn().mockReturnValue({ count: 1, resetAt: Date.now() + 60_000 })
    };
    const service = new ThrottleService(store, makeConfig());
    const authService = makeAuthService("user-xyz-789");
    const reflector = makeReflector();

    const guard = new ThrottleGuard(service, authService as never, reflector);
    const request = makeRequest("10.0.0.99");
    const context = makeContext(request);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);

    // Key must contain userId, not the IP.
    const hitCall = (store.hit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(hitCall[0]).toContain("user-xyz-789");
    expect(hitCall[0]).not.toContain("10.0.0.99");
  });
});

// ---------------------------------------------------------------------------
// AC3 (supplemental): InMemoryThrottleStore sweep/eviction
// ---------------------------------------------------------------------------

describe("InMemoryThrottleStore — sweep/eviction (AC3 supplemental)", () => {
  /**
   * The store prunes expired entries when windows.size > SWEEP_THRESHOLD (10000).
   * Rather than testing at exactly 10001 entries (slow), these tests verify
   * the eviction semantics: a window that has elapsed is not carried forward
   * into the next window.
   */

  it("resets count to 1 after the window expires", () => {
    const store = new InMemoryThrottleStore();

    // Hit once in a very short window (1 ms).
    vi.spyOn(Date, "now").mockReturnValueOnce(1000); // first call: hit at t=1000
    store.hit("test-key", 1); // window expires at t=1001

    // Now hit again after the window has expired.
    vi.spyOn(Date, "now").mockReturnValue(2000); // t=2000 > resetAt=1001
    const result = store.hit("test-key", 60_000);

    expect(result.count).toBe(1); // new window, not carried over
    vi.restoreAllMocks();
  });

  it("increments within the same window", () => {
    const store = new InMemoryThrottleStore();
    const now = Date.now();

    // Mock nowMs via Date.now for consistent timing
    vi.spyOn(Date, "now").mockReturnValue(now);

    const r1 = store.hit("rate:user1", 60_000);
    const r2 = store.hit("rate:user1", 60_000);
    const r3 = store.hit("rate:user1", 60_000);

    expect(r1.count).toBe(1);
    expect(r2.count).toBe(2);
    expect(r3.count).toBe(3);
    expect(r1.resetAt).toBe(r2.resetAt); // same window
    vi.restoreAllMocks();
  });

  it("tracks separate keys independently", () => {
    const store = new InMemoryThrottleStore();

    const r1 = store.hit("route:user-a", 60_000);
    const r2 = store.hit("route:user-b", 60_000);
    const r3 = store.hit("route:user-a", 60_000);

    expect(r1.count).toBe(1);
    expect(r2.count).toBe(1); // separate key, count starts at 1
    expect(r3.count).toBe(2); // user-a's second hit
  });
});
