import { describe, expect, it } from "vitest";

import {
  describeLoginError,
  describeRegistrationError,
  duplicateAccountErrorMessage,
  serviceUnavailableMessage,
  toApiRequestError
} from "./auth-client";

// ---------------------------------------------------------------------------
// Runtime tests for auth error-mapping helpers (auth-client.ts)
// Acceptance criteria: deferred-cleanup subtask-9
// ---------------------------------------------------------------------------

describe("describeRegistrationError", () => {
  // AC1: 400 validation mapping
  it("returns the error message when statusCode is 400", () => {
    const error = Object.assign(new Error("Email is not valid."), { statusCode: 400 });
    expect(describeRegistrationError(error)).toBe("Email is not valid.");
  });

  // AC2: 409 duplicate-email messaging
  it("returns duplicateAccountErrorMessage when statusCode is 409", () => {
    const error = Object.assign(new Error("conflict"), { statusCode: 409 });
    expect(describeRegistrationError(error)).toBe(duplicateAccountErrorMessage);
  });

  // AC3: 5xx masking — registration side
  it("returns serviceUnavailableMessage when statusCode is 500", () => {
    const error = Object.assign(new Error("Internal Server Error"), { statusCode: 500 });
    expect(describeRegistrationError(error)).toBe(serviceUnavailableMessage);
  });

  it("returns serviceUnavailableMessage when statusCode is 503", () => {
    const error = Object.assign(new Error("Service Unavailable"), { statusCode: 503 });
    expect(describeRegistrationError(error)).toBe(serviceUnavailableMessage);
  });

  // AC4: statusCode === null network-failure branch
  it("returns serviceUnavailableMessage when statusCode is null (network failure)", () => {
    const error = Object.assign(new Error("fetch failed"), { statusCode: null });
    expect(describeRegistrationError(error)).toBe(serviceUnavailableMessage);
  });
});

describe("describeLoginError", () => {
  // AC3: 5xx masking — login side
  it("returns serviceUnavailableMessage when status is 500", () => {
    expect(describeLoginError(500)).toBe(serviceUnavailableMessage);
  });

  it("returns serviceUnavailableMessage when status is 502", () => {
    expect(describeLoginError(502)).toBe(serviceUnavailableMessage);
  });

  it("returns credential failure message when status is 401", () => {
    expect(describeLoginError(401)).toBe("Sign-in failed. Verify your credentials and try again.");
  });

  it("returns credential failure message when status is 400", () => {
    expect(describeLoginError(400)).toBe("Sign-in failed. Verify your credentials and try again.");
  });
});

describe("toApiRequestError", () => {
  // Verify the async helper can be driven with mocked Response objects.

  it("assigns statusCode from JSON payload error.statusCode when present", async () => {
    const mockResponse = new Response(
      JSON.stringify({ error: { message: "Validation failed.", statusCode: 400 } }),
      { status: 422 }
    );
    const err = await toApiRequestError(mockResponse, "fallback");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Validation failed.");
  });

  it("falls back to response.status for statusCode when payload has none", async () => {
    const mockResponse = new Response(JSON.stringify({ error: {} }), { status: 409 });
    const err = await toApiRequestError(mockResponse, "fallback");
    expect(err.statusCode).toBe(409);
  });

  it("uses fallback message when payload has no error.message", async () => {
    const mockResponse = new Response(JSON.stringify({}), { status: 500 });
    const err = await toApiRequestError(mockResponse, "fallback message");
    expect(err.message).toBe("fallback message");
  });

  it("uses response.status as statusCode when JSON parse fails (null statusCode path from caller)", async () => {
    const mockResponse = new Response("not json", { status: 503 });
    const err = await toApiRequestError(mockResponse, "fallback");
    expect(err.statusCode).toBe(503);
  });
});
