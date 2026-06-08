/**
 * throttle.service.test.ts
 *
 * Tests for ThrottleService.checkRequest().
 *
 * Acceptance criteria covered:
 *   AC1 — Over-limit -> 429 envelope; under-limit passes; identity prefers
 *          session userId, falls back to proxy-resolved request.ip; no XFF
 *          parsing directly; new-account tier applies when account is young.
 *   AC3 — Storage seam: ThrottleService calls only store.hit() — no other
 *          store method; proven by injecting a test-double IThrottleStore.
 */

import { HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

import { ThrottleService } from "./throttle.service";
import type { IThrottleStore, ThrottleConfig } from "./throttle.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ThrottleConfig for testing. */
function makeConfig(overrides: Partial<ThrottleConfig> = {}): ThrottleConfig {
  return {
    windowMs: 60_000,
    maxHits: 5,
    newAccountMaxHits: 2,
    newAccountWindowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxLinksPerPost: 5,
    ...overrides
  };
}

/** Build a fake Express Request with an ip property and optional headers. */
function makeRequest(overrides: { ip?: string; headers?: Record<string, string> } = {}): Request {
  return {
    ip: overrides.ip ?? "127.0.0.1",
    headers: overrides.headers ?? {}
  } as unknown as Request;
}

/** Build an IThrottleStore test double that always returns the given result. */
function makeStore(count: number, resetAt?: number): IThrottleStore {
  return {
    hit: vi.fn().mockReturnValue({
      count,
      resetAt: resetAt ?? Date.now() + 60_000
    })
  };
}

// ---------------------------------------------------------------------------
// AC1 — Under-limit: request passes through
// ---------------------------------------------------------------------------

describe("ThrottleService.checkRequest — under-limit passes through (AC1)", () => {
  it("does not throw when count is below maxHits", () => {
    const store = makeStore(1); // count=1 < maxHits=5
    const service = new ThrottleService(store, makeConfig());

    expect(() =>
      service.checkRequest({ routeLabel: "test", request: makeRequest(), userId: null })
    ).not.toThrow();
  });

  it("does not throw when count equals maxHits (at-limit, not over)", () => {
    const store = makeStore(5); // count=5 === maxHits=5 → at limit, should pass
    const service = new ThrottleService(store, makeConfig({ maxHits: 5 }));

    expect(() =>
      service.checkRequest({ routeLabel: "test", request: makeRequest() })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC1 — Over-limit: 429 response envelope
// ---------------------------------------------------------------------------

describe("ThrottleService.checkRequest — over-limit throws 429 (AC1)", () => {
  it("throws HttpException with status 429 when count exceeds maxHits", () => {
    const store = makeStore(6); // count=6 > maxHits=5
    const service = new ThrottleService(store, makeConfig({ maxHits: 5 }));

    expect(() =>
      service.checkRequest({ routeLabel: "test", request: makeRequest() })
    ).toThrow(HttpException);
  });

  it("throws with status 429 (TOO_MANY_REQUESTS)", () => {
    const store = makeStore(100); // well over limit
    const service = new ThrottleService(store, makeConfig({ maxHits: 5 }));

    let caught: HttpException | undefined;
    try {
      service.checkRequest({ routeLabel: "test", request: makeRequest() });
    } catch (e) {
      caught = e as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught!.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it("response envelope includes error, message, statusCode, and retryAfter fields", () => {
    const resetAt = Date.now() + 30_000; // 30 seconds from now
    const store = makeStore(6, resetAt);
    const service = new ThrottleService(store, makeConfig({ maxHits: 5 }));

    let caught: HttpException | undefined;
    try {
      service.checkRequest({ routeLabel: "test", request: makeRequest() });
    } catch (e) {
      caught = e as HttpException;
    }

    const body = caught!.getResponse() as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "TOO_MANY_REQUESTS",
      statusCode: 429,
      retryAfter: expect.any(Number),
      message: expect.stringContaining("Rate limit exceeded")
    });
    expect((body.retryAfter as number)).toBeGreaterThanOrEqual(1);
  });

  it("retryAfter is at least 1 second even for an already-expired window", () => {
    // resetAt in the past — retryAfter should be clamped to 1.
    const store = makeStore(6, Date.now() - 1000);
    const service = new ThrottleService(store, makeConfig({ maxHits: 5 }));

    let caught: HttpException | undefined;
    try {
      service.checkRequest({ routeLabel: "test", request: makeRequest() });
    } catch (e) {
      caught = e as HttpException;
    }

    const body = caught!.getResponse() as Record<string, unknown>;
    expect(body.retryAfter).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC1 — Identity resolution: userId preferred over request.ip
// ---------------------------------------------------------------------------

describe("ThrottleService.checkRequest — identity resolution (AC1)", () => {
  it("uses userId as the identity key when userId is provided", () => {
    const store = makeStore(1);
    const service = new ThrottleService(store, makeConfig());

    service.checkRequest({
      routeLabel: "forum-post",
      request: makeRequest({ ip: "10.0.0.1" }),
      userId: "user-abc-123"
    });

    // store.hit() should have been called with a key containing the userId.
    const hitCall = (store.hit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(hitCall[0]).toContain("user-abc-123");
    expect(hitCall[0]).not.toContain("10.0.0.1");
  });

  it("falls back to request.ip when userId is null", () => {
    const store = makeStore(1);
    const service = new ThrottleService(store, makeConfig());

    service.checkRequest({
      routeLabel: "forum-post",
      request: makeRequest({ ip: "203.0.113.42" }),
      userId: null
    });

    const hitCall = (store.hit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(hitCall[0]).toContain("203.0.113.42");
    expect(hitCall[0]).not.toContain("null");
  });

  it("falls back to request.ip when userId is undefined", () => {
    const store = makeStore(1);
    const service = new ThrottleService(store, makeConfig());

    service.checkRequest({
      routeLabel: "forum-post",
      request: makeRequest({ ip: "198.51.100.7" })
      // userId omitted → undefined
    });

    const hitCall = (store.hit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(hitCall[0]).toContain("198.51.100.7");
  });

  it("uses 'unknown' when userId is null and request.ip is undefined", () => {
    const store = makeStore(1);
    const service = new ThrottleService(store, makeConfig());
    const requestWithNoIp = { ip: undefined, headers: {} } as unknown as Request;

    service.checkRequest({
      routeLabel: "test",
      request: requestWithNoIp,
      userId: null
    });

    const hitCall = (store.hit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(hitCall[0]).toContain("unknown");
  });

  it("does NOT read X-Forwarded-For directly — uses request.ip only (security: no XFF parsing)", () => {
    // AC1 security note: the guard/service must never parse XFF directly.
    // ThrottleService only reads request.ip (Express-resolved under trust proxy=1).
    // If it were parsing XFF, the key would contain the header value.
    const store = makeStore(1);
    const service = new ThrottleService(store, makeConfig());

    const req = {
      ip: "10.0.0.5",
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }
    } as unknown as Request;

    service.checkRequest({ routeLabel: "test", request: req, userId: null });

    const hitCall = (store.hit as ReturnType<typeof vi.fn>).mock.calls[0];
    // Key must use request.ip (10.0.0.5), not the XFF header value (1.2.3.4).
    expect(hitCall[0]).toContain("10.0.0.5");
    expect(hitCall[0]).not.toContain("1.2.3.4");
  });
});

// ---------------------------------------------------------------------------
// AC1 — New-account tier
// ---------------------------------------------------------------------------

describe("ThrottleService.checkRequest — new-account tier (AC1)", () => {
  it("applies stricter newAccountMaxHits when account is within newAccountWindowMs", () => {
    // Account created 1 hour ago; newAccountWindowMs = 7 days → account is "new".
    const newAccountMaxHits = 2;
    const config = makeConfig({ maxHits: 10, newAccountMaxHits, newAccountWindowMs: 7 * 24 * 3600 * 1000 });
    const store = makeStore(3); // count=3 > newAccountMaxHits=2, but ≤ maxHits=10
    const service = new ThrottleService(store, config);
    const createdOneHourAgo = new Date(Date.now() - 3_600_000);

    expect(() =>
      service.checkRequest({
        routeLabel: "test",
        request: makeRequest(),
        userId: "new-user",
        userCreatedAt: createdOneHourAgo
      })
    ).toThrow(HttpException);
  });

  it("applies regular maxHits when account is older than newAccountWindowMs", () => {
    // Account created 10 days ago; newAccountWindowMs = 7 days → account is "established".
    const config = makeConfig({ maxHits: 10, newAccountMaxHits: 2, newAccountWindowMs: 7 * 24 * 3600 * 1000 });
    const store = makeStore(3); // count=3 ≤ maxHits=10 → should pass for established
    const service = new ThrottleService(store, config);
    const createdTenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000);

    expect(() =>
      service.checkRequest({
        routeLabel: "test",
        request: makeRequest(),
        userId: "established-user",
        userCreatedAt: createdTenDaysAgo
      })
    ).not.toThrow();
  });

  it("does NOT apply new-account tier when userId is falsy (guest request)", () => {
    // Guests cannot be in the new-account tier regardless of userCreatedAt.
    const config = makeConfig({ maxHits: 10, newAccountMaxHits: 2 });
    const store = makeStore(3); // count=3 > newAccountMaxHits=2 but ≤ maxHits=10
    const service = new ThrottleService(store, config);

    // userId=null → guest → should not be throttled at newAccountMaxHits.
    expect(() =>
      service.checkRequest({
        routeLabel: "test",
        request: makeRequest(),
        userId: null,
        userCreatedAt: new Date() // new account date, but no userId → should not apply
      })
    ).not.toThrow();
  });

  it("does NOT apply new-account tier when userCreatedAt is null", () => {
    // Even if userId is present, without userCreatedAt the tier cannot be determined.
    const config = makeConfig({ maxHits: 10, newAccountMaxHits: 2 });
    const store = makeStore(3); // 3 > newAccountMaxHits but ≤ maxHits
    const service = new ThrottleService(store, config);

    expect(() =>
      service.checkRequest({
        routeLabel: "test",
        request: makeRequest(),
        userId: "some-user",
        userCreatedAt: null
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC3 — Storage seam: service calls only store.hit()
// ---------------------------------------------------------------------------

describe("ThrottleService — storage seam: only store.hit() is called (AC3)", () => {
  it("calls store.hit() exactly once per checkRequest invocation", () => {
    const store = makeStore(1);
    const service = new ThrottleService(store, makeConfig());

    service.checkRequest({ routeLabel: "test", request: makeRequest(), userId: null });

    expect(store.hit).toHaveBeenCalledOnce();
  });

  it("passes the composed key and windowMs to store.hit()", () => {
    const store = makeStore(1);
    const config = makeConfig({ windowMs: 30_000 });
    const service = new ThrottleService(store, config);

    service.checkRequest({
      routeLabel: "forum-post",
      request: makeRequest({ ip: "10.1.2.3" }),
      userId: null
    });

    expect(store.hit).toHaveBeenCalledWith("forum-post:10.1.2.3", 30_000);
  });

  it("works with an alternative test-double store without changing service logic (seam proven)", () => {
    // This is the non-vacuous seam test: a completely different IThrottleStore
    // implementation (could be Redis) is swapped in; no service logic changes.
    const alternativeStore: IThrottleStore = {
      hit: vi.fn().mockReturnValue({ count: 1, resetAt: Date.now() + 60_000 })
    };

    const service = new ThrottleService(alternativeStore, makeConfig());

    expect(() =>
      service.checkRequest({ routeLabel: "route", request: makeRequest(), userId: "u1" })
    ).not.toThrow();

    expect(alternativeStore.hit).toHaveBeenCalledOnce();
  });
});
