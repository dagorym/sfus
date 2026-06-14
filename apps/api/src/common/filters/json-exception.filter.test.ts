/**
 * json-exception.filter.test.ts
 *
 * Unit tests for JsonExceptionFilter (HTTP-layer exception envelope).
 *
 * Acceptance criteria validated:
 *
 * BLOCKING-1 (ST-6 remediation): JsonExceptionFilter must extract the optional
 *   `details` field from an HttpException body and emit it at `error.details`.
 *   When the ConflictException body carries `{ message, details: { lockedByUserId, lockExpiresAt } }`,
 *   the JSON response body must expose `error.details.lockedByUserId` and
 *   `error.details.lockExpiresAt`.
 *
 * Backward compatibility: a ConflictException (or any HttpException) WITHOUT a
 *   `details` field must NOT include `error.details` in the response envelope.
 *
 * General filter contract: non-HttpException exceptions produce
 *   statusCode=500 with INTERNAL_SERVER_ERROR code and no details field.
 */

import { ConflictException, HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";

import { JsonExceptionFilter } from "./json-exception.filter";
import { JsonLogger } from "../logger/json-logger.service";

// ---------------------------------------------------------------------------
// Helpers — minimal mock wiring for ArgumentsHost + Response
// ---------------------------------------------------------------------------

interface CapturedResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Build a minimal ArgumentsHost mock whose HTTP adapter captures the JSON
 * response written via `response.status(code).json(body)`.
 */
function makeHost(
  captured: CapturedResponse,
  overrides?: {
    method?: string;
    url?: string;
    originalUrl?: string;
    correlationId?: string;
  }
): ArgumentsHost {
  const opts = {
    method: "POST",
    url: "/api/docs/page-1/lock",
    originalUrl: "/api/docs/page-1/lock",
    correlationId: undefined as string | undefined,
    ...overrides
  };

  const mockResponse: Partial<Response> & { status: ReturnType<typeof vi.fn> } = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockImplementation((body: unknown) => {
      captured.body = body;
      return mockResponse;
    })
  } as never;

  // Attach the status capture
  (mockResponse.status as ReturnType<typeof vi.fn>).mockImplementation((code: number) => {
    captured.statusCode = code;
    return mockResponse;
  });

  const mockRequest = {
    method: opts.method,
    url: opts.url,
    originalUrl: opts.originalUrl,
    correlationId: opts.correlationId
  };

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse
    })
  } as unknown as ArgumentsHost;
}

/** Build a JsonExceptionFilter with a silent (vi.fn) logger. */
function makeFilter(): JsonExceptionFilter {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  } as unknown as JsonLogger;
  return new JsonExceptionFilter(logger);
}

// ---------------------------------------------------------------------------
// BLOCKING-1: error.details passthrough from ConflictException body
// ---------------------------------------------------------------------------

describe("JsonExceptionFilter — BLOCKING-1: error.details passthrough (ST-6 lock-conflict shape)", () => {
  it("emits error.details.lockedByUserId and error.details.lockExpiresAt when ConflictException body carries a details object (AC2)", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    const lockExpiresAt = new Date("2026-01-01T01:00:00Z");
    const exception = new ConflictException({
      message: "This page is currently locked by another user.",
      details: {
        lockedByUserId: "user-holder",
        lockExpiresAt
      }
    });

    filter.catch(exception, makeHost(captured));

    expect(captured.statusCode).toBe(409);
    const body = captured.body as Record<string, unknown>;
    const errorEnvelope = body["error"] as Record<string, unknown>;
    expect(errorEnvelope).toBeDefined();
    expect(errorEnvelope["message"]).toBe("This page is currently locked by another user.");
    const details = errorEnvelope["details"] as Record<string, unknown>;
    expect(details).toBeDefined();
    expect(details["lockedByUserId"]).toBe("user-holder");
    expect(details["lockExpiresAt"]).toEqual(lockExpiresAt);
  });

  it("statusCode in error envelope matches HTTP status 409 for ConflictException (AC2)", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    const exception = new ConflictException({
      message: "Page locked.",
      details: { lockedByUserId: "user-1", lockExpiresAt: new Date() }
    });

    filter.catch(exception, makeHost(captured));

    const errorEnvelope = (captured.body as Record<string, unknown>)["error"] as Record<string, unknown>;
    expect(errorEnvelope["statusCode"]).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility: no details → no error.details in envelope
// ---------------------------------------------------------------------------

describe("JsonExceptionFilter — backward compatibility: absent details produces no error.details", () => {
  it("does NOT include error.details when ConflictException has no details field (plain message body)", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    // Plain string body — pre-existing usage
    const exception = new ConflictException("A page with this path already exists in this scope.");

    filter.catch(exception, makeHost(captured));

    expect(captured.statusCode).toBe(409);
    const errorEnvelope = (captured.body as Record<string, unknown>)["error"] as Record<string, unknown>;
    expect(errorEnvelope["details"]).toBeUndefined();
  });

  it("does NOT include error.details when ConflictException body is an object without a details key", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    const exception = new ConflictException({
      message: "Conflict occurred."
      // no details key
    });

    filter.catch(exception, makeHost(captured));

    const errorEnvelope = (captured.body as Record<string, unknown>)["error"] as Record<string, unknown>;
    expect(errorEnvelope["details"]).toBeUndefined();
  });

  it("does NOT include error.details when NotFoundException body has no details key", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    const exception = new NotFoundException("Document page not found.");

    filter.catch(exception, makeHost(captured));

    const errorEnvelope = (captured.body as Record<string, unknown>)["error"] as Record<string, unknown>;
    expect(errorEnvelope["details"]).toBeUndefined();
    expect(captured.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// General filter contract: HttpException without details — standard envelope
// ---------------------------------------------------------------------------

describe("JsonExceptionFilter — standard HttpException envelope (no details)", () => {
  it("emits correct status and message for a plain NotFoundException", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    filter.catch(new NotFoundException("Not here."), makeHost(captured));

    expect(captured.statusCode).toBe(404);
    const errorEnvelope = (captured.body as Record<string, unknown>)["error"] as Record<string, unknown>;
    expect(errorEnvelope["statusCode"]).toBe(404);
    expect(errorEnvelope["message"]).toBe("Not here.");
    expect(typeof errorEnvelope["code"]).toBe("string");
  });

  it("includes request envelope with correlationId, method, path, and timestamp fields", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    filter.catch(
      new NotFoundException("Not found."),
      makeHost(captured, { correlationId: "corr-123", method: "GET", url: "/api/docs/page" })
    );

    const body = captured.body as Record<string, unknown>;
    const req = body["request"] as Record<string, unknown>;
    expect(req).toBeDefined();
    expect(req["correlationId"]).toBe("corr-123");
    expect(req["method"]).toBe("GET");
    expect(typeof req["path"]).toBe("string");
    expect(typeof req["timestamp"]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// General filter contract: non-HttpException → 500 INTERNAL_SERVER_ERROR, no details
// ---------------------------------------------------------------------------

describe("JsonExceptionFilter — non-HttpException → 500 INTERNAL_SERVER_ERROR, no details", () => {
  it("returns 500 for a plain Error (not an HttpException)", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    filter.catch(new Error("Something went wrong"), makeHost(captured));

    expect(captured.statusCode).toBe(500);
    const errorEnvelope = (captured.body as Record<string, unknown>)["error"] as Record<string, unknown>;
    expect(errorEnvelope["statusCode"]).toBe(500);
    expect(errorEnvelope["code"]).toBe("INTERNAL_SERVER_ERROR");
  });

  it("does NOT include error.details for a plain Error", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    filter.catch(new Error("unexpected"), makeHost(captured));

    const errorEnvelope = (captured.body as Record<string, unknown>)["error"] as Record<string, unknown>;
    expect(errorEnvelope["details"]).toBeUndefined();
  });

  it("returns 500 for a thrown non-Error value (e.g. a plain string)", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    filter.catch("plain string error" as never, makeHost(captured));

    expect(captured.statusCode).toBe(500);
    const errorEnvelope = (captured.body as Record<string, unknown>)["error"] as Record<string, unknown>;
    expect(errorEnvelope["code"]).toBe("INTERNAL_SERVER_ERROR");
    expect(errorEnvelope["details"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// error.details passthrough for any HttpException type with a details object
// ---------------------------------------------------------------------------

describe("JsonExceptionFilter — error.details passthrough for any HttpException with details", () => {
  it("passes through details object for a custom HttpException subclass with details (generic test)", () => {
    const filter = makeFilter();
    const captured: CapturedResponse = { statusCode: 0, body: undefined };
    // Use a generic 422 HttpException with a details payload to confirm the extraction is type-agnostic.
    const exception = new HttpException(
      {
        message: "Unprocessable entity.",
        details: { field: "slug", reason: "invalid-chars" }
      },
      HttpStatus.UNPROCESSABLE_ENTITY
    );

    filter.catch(exception, makeHost(captured));

    expect(captured.statusCode).toBe(422);
    const errorEnvelope = (captured.body as Record<string, unknown>)["error"] as Record<string, unknown>;
    const details = errorEnvelope["details"] as Record<string, unknown>;
    expect(details).toBeDefined();
    expect(details["field"]).toBe("slug");
    expect(details["reason"]).toBe("invalid-chars");
  });
});
