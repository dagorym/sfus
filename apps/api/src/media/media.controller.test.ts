/**
 * MediaController tests
 *
 * Acceptance criterion: role-scoped upload authorization
 *  - 401 for unauthenticated requests (no active session)
 *  - 403 for non-admin users attempting to upload for blog-post or standalone-page
 *  - 200 for admin users uploading for blog-post or standalone-page
 *  - 200 for any authenticated user uploading for blog-comment
 *
 * Acceptance criterion: TOCTOU read-stream hardening (serveImage)
 *  - ENOENT stream error → 404 response (file vanished after DB lookup)
 *  - Normal stream → piped through unchanged
 */

import fs from "node:fs";
import { EventEmitter, PassThrough, Readable } from "node:stream";

import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthService, AuthenticatedSessionResult } from "../auth/auth.service";
import { MediaController } from "./media.controller";
import type { MediaService } from "./media.service";

// ---------------------------------------------------------------------------
// fs module mock — replaced per-test to simulate stream behaviour
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => ({
  default: {
    createReadStream: vi.fn()
  }
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeAuthenticatedSession = (globalRole: string): AuthenticatedSessionResult => ({
  user: {
    id: "user-1",
    username: "testuser",
    email: "testuser@example.com",
    displayName: null,
    globalRole,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date().toISOString(),
    onboardingRequired: false
  },
  session: {
    id: "session-1",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    lastSeenAt: new Date().toISOString()
  },
  sessionToken: "session-token"
});

const makeMockAuthService = (session: AuthenticatedSessionResult | null): AuthService => ({
  resolveSession: session
    ? vi.fn().mockResolvedValue(session)
    : vi.fn().mockRejectedValue(new UnauthorizedException("Authentication required."))
} as unknown as AuthService);

const makeMockMediaService = (): MediaService =>
  ({
    uploadImage: vi.fn().mockResolvedValue({
      id: "media-id",
      storageKey: "blog-post/media-id.jpg",
      originalFilename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      url: "/api/media/media-id",
      createdAt: new Date()
    }),
    getImageForServing: vi.fn()
  } as unknown as MediaService);

const makeValidFile = () => ({
  originalname: "photo.jpg",
  mimetype: "image/jpeg",
  size: 1024,
  buffer: Buffer.from("fake-image-data")
});

const makeRequest = (cookieHeader = "sfus_session=session-token") => ({
  headers: { cookie: cookieHeader }
});

// ---------------------------------------------------------------------------
// Upload authorization tests
// ---------------------------------------------------------------------------

describe("MediaController.uploadImage authorization", () => {
  it("throws UnauthorizedException (401) when there is no active session", async () => {
    // AC: unauthenticated returns 401
    const authService = makeMockAuthService(null);
    const mediaService = makeMockMediaService();
    const controller = new MediaController(mediaService, authService);

    await expect(
      controller.uploadImage(makeRequest("") as never, makeValidFile(), "blog-post")
    ).rejects.toThrow(UnauthorizedException);
  });

  it("throws ForbiddenException (403) when a non-admin uploads for blog-post", async () => {
    // AC: admin required for blog-post; authenticated user without admin role is rejected
    const session = makeAuthenticatedSession("user");
    const authService = makeMockAuthService(session);
    const mediaService = makeMockMediaService();
    const controller = new MediaController(mediaService, authService);

    await expect(
      controller.uploadImage(makeRequest() as never, makeValidFile(), "blog-post")
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws ForbiddenException (403) when a non-admin uploads for standalone-page", async () => {
    // AC: admin required for standalone-page; authenticated user without admin role is rejected
    const session = makeAuthenticatedSession("user");
    const authService = makeMockAuthService(session);
    const mediaService = makeMockMediaService();
    const controller = new MediaController(mediaService, authService);

    await expect(
      controller.uploadImage(makeRequest() as never, makeValidFile(), "standalone-page")
    ).rejects.toThrow(ForbiddenException);
  });

  it("succeeds (200) when an admin uploads for blog-post", async () => {
    // AC: admin can upload for blog-post
    const session = makeAuthenticatedSession("admin");
    const authService = makeMockAuthService(session);
    const mediaService = makeMockMediaService();
    const controller = new MediaController(mediaService, authService);

    const result = await controller.uploadImage(makeRequest() as never, makeValidFile(), "blog-post");

    expect(result).toMatchObject({ id: "media-id", mimeType: "image/jpeg" });
  });

  it("succeeds (200) when an admin uploads for standalone-page", async () => {
    // AC: admin can upload for standalone-page
    const session = makeAuthenticatedSession("admin");
    const authService = makeMockAuthService(session);
    const mediaService = makeMockMediaService();
    const controller = new MediaController(mediaService, authService);

    const result = await controller.uploadImage(makeRequest() as never, makeValidFile(), "standalone-page");

    expect(result).toMatchObject({ id: "media-id" });
  });

  it("succeeds (200) when an authenticated user (non-admin) uploads for blog-comment", async () => {
    // AC: any authenticated user can upload for blog-comment
    const session = makeAuthenticatedSession("user");
    const authService = makeMockAuthService(session);
    const mediaService = makeMockMediaService();
    const controller = new MediaController(mediaService, authService);

    const result = await controller.uploadImage(makeRequest() as never, makeValidFile(), "blog-comment");

    expect(result).toMatchObject({ id: "media-id" });
  });

  it("succeeds (200) when an admin uploads for blog-comment", async () => {
    // AC: admin can also upload for blog-comment
    const session = makeAuthenticatedSession("admin");
    const authService = makeMockAuthService(session);
    const mediaService = makeMockMediaService();
    const controller = new MediaController(mediaService, authService);

    const result = await controller.uploadImage(makeRequest() as never, makeValidFile(), "blog-comment");

    expect(result).toMatchObject({ id: "media-id" });
  });
});

// ---------------------------------------------------------------------------
// serveImage TOCTOU read-stream hardening tests
// ---------------------------------------------------------------------------

/** Build a fake media record for the serve path */
const makeFakeMedia = () => ({
  filePath: "/storage/uploads/blog-post/media-id.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  originalFilename: "photo.jpg"
});

/** Build a mock Express-like response object that satisfies stream.pipe() */
const makeMockResponse = () => {
  const res = new EventEmitter() as unknown as {
    headersSent: boolean;
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    // Minimal Writable surface needed by stream.pipe()
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  res.headersSent = false;
  res.setHeader = vi.fn();
  const jsonFn = vi.fn();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  res.status = statusFn;
  res.json = jsonFn;
  res.destroy = vi.fn();
  res.write = vi.fn();
  res.end = vi.fn();
  return { res, statusFn, jsonFn };
};

describe("MediaController.serveImage TOCTOU stream hardening", () => {
  it("returns 404 when the file stream emits ENOENT (file vanished after DB lookup)", async () => {
    // Arrange: getImageForServing resolves successfully (DB record exists)
    // but createReadStream emits an ENOENT — the TOCTOU window.
    const mediaService = {
      ...makeMockMediaService(),
      getImageForServing: vi.fn().mockResolvedValue(makeFakeMedia())
    } as unknown as MediaService;
    const authService = makeMockAuthService(makeAuthenticatedSession("admin"));
    const controller = new MediaController(mediaService, authService);

    // Build a fake readable that immediately emits an ENOENT error
    const fakeStream = new Readable({ read() {} });
    vi.mocked(fs.createReadStream).mockReturnValue(fakeStream as unknown as ReturnType<typeof fs.createReadStream>);

    const { res, statusFn, jsonFn } = makeMockResponse();

    // Act: call serveImage and yield so that serveImage's internal
    // await getImageForServing() resolves and the stream error handler
    // is registered before we emit the error.
    const servePromise = controller.serveImage("media-id", res as unknown as import("express").Response);
    await Promise.resolve();

    const enoentErr = Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
    fakeStream.emit("error", enoentErr);

    await servePromise;

    // Assert: a 404 was sent, not a 500 or unhandled error
    expect(statusFn).toHaveBeenCalledWith(404);
    expect(jsonFn).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it("does not send a new response when headers are already flushed during stream error", async () => {
    const mediaService = {
      ...makeMockMediaService(),
      getImageForServing: vi.fn().mockResolvedValue(makeFakeMedia())
    } as unknown as MediaService;
    const authService = makeMockAuthService(makeAuthenticatedSession("admin"));
    const controller = new MediaController(mediaService, authService);

    const fakeStream = new Readable({ read() {} });
    vi.mocked(fs.createReadStream).mockReturnValue(fakeStream as unknown as ReturnType<typeof fs.createReadStream>);

    const { res, statusFn } = makeMockResponse();
    // Simulate headers already sent (partial body flushed)
    res.headersSent = true;

    // Yield so that serveImage's internal await resolves and the stream
    // error handler is registered before we emit the error.
    const servePromise = controller.serveImage("media-id", res as unknown as import("express").Response);
    await Promise.resolve();

    const enoentErr = Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
    fakeStream.emit("error", enoentErr);

    await servePromise;

    // No new status/json call — socket is destroyed instead
    expect(statusFn).not.toHaveBeenCalled();
    expect(res.destroy).toHaveBeenCalled();
  });

  it("returns 500 when the file stream emits a non-ENOENT I/O error", async () => {
    // AC: unexpected I/O errors (non-ENOENT, headers not yet sent) → 500
    const mediaService = {
      ...makeMockMediaService(),
      getImageForServing: vi.fn().mockResolvedValue(makeFakeMedia())
    } as unknown as MediaService;
    const authService = makeMockAuthService(makeAuthenticatedSession("admin"));
    const controller = new MediaController(mediaService, authService);

    const fakeStream = new Readable({ read() {} });
    vi.mocked(fs.createReadStream).mockReturnValue(fakeStream as unknown as ReturnType<typeof fs.createReadStream>);

    const { res, statusFn, jsonFn } = makeMockResponse();

    const servePromise = controller.serveImage("media-id", res as unknown as import("express").Response);
    await Promise.resolve();

    // Emit a generic I/O error (not ENOENT)
    const ioErr = Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
    fakeStream.emit("error", ioErr);

    await servePromise;

    expect(statusFn).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
  });

  it("happy path: sets Content-Type, Content-Length headers and pipes file bytes to response", async () => {
    // NOTE 5 (ms3-review-closeout subtask-6): happy-path coverage for serveImage —
    // verify correct headers are set and that stream bytes flow to the response.
    const fakeMedia = makeFakeMedia();
    const mediaService = {
      ...makeMockMediaService(),
      getImageForServing: vi.fn().mockResolvedValue(fakeMedia)
    } as unknown as MediaService;
    const authService = makeMockAuthService(makeAuthenticatedSession("admin"));
    const controller = new MediaController(mediaService, authService);

    // Build a readable that emits one data chunk then ends
    const fakeStream = new Readable({ read() {} });
    vi.mocked(fs.createReadStream).mockReturnValue(fakeStream as unknown as ReturnType<typeof fs.createReadStream>);

    // Use a PassThrough as the response body sink so that stream.pipe() works
    // correctly (PassThrough implements the full Writable protocol).
    const passThroughSink = new PassThrough();
    const setHeaderFn = vi.fn();
    const res = Object.assign(passThroughSink, {
      headersSent: false,
      setHeader: setHeaderFn,
      status: vi.fn(),
      json: vi.fn(),
      destroy: vi.fn()
    });

    const servePromise = controller.serveImage("media-id", res as unknown as import("express").Response);

    // Yield so serveImage's internal await resolves and pipe() is registered
    await Promise.resolve();

    // Collect piped bytes
    const chunks: Buffer[] = [];
    passThroughSink.on("data", (chunk: Buffer) => chunks.push(chunk));

    // Push data and end the stream
    const payload = Buffer.from("image-bytes");
    fakeStream.push(payload);
    fakeStream.push(null);

    // Wait for both serveImage and the sink to drain
    await servePromise;
    await new Promise<void>((resolve) => passThroughSink.on("end", resolve));

    // Headers must be set before the pipe
    expect(setHeaderFn).toHaveBeenCalledWith("Content-Type", fakeMedia.mimeType);
    expect(setHeaderFn).toHaveBeenCalledWith("Content-Length", fakeMedia.sizeBytes);
    // Bytes were piped through
    const received = Buffer.concat(chunks);
    expect(received).toEqual(payload);
  });
});
