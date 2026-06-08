import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true)
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true)
}));

import type { ApplicationEnvironment } from "../config/environment";
import type { MediaReferenceEntity } from "./entities/media-reference.entity";
import { MediaService } from "./media.service";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type MinimalRepository<T> = {
  create: (partial: Partial<T>) => T;
  save: (entity: T) => Promise<T>;
  findOne: (options: unknown) => Promise<T | null>;
};

const createMinimalMediaRepository = (
  findOneResult: MediaReferenceEntity | null = null
): MinimalRepository<MediaReferenceEntity> => ({
  create: (partial) => ({ ...partial, createdAt: new Date() }) as MediaReferenceEntity,
  save: async (entity) => entity,
  findOne: async () => findOneResult
});

const makeTestEnvironment = (overrides: Partial<ApplicationEnvironment["media"]> = {}): ApplicationEnvironment => ({
  nodeEnv: "test",
  apiPort: 3001,
  swaggerEnabled: false,
  media: {
    uploadMaxSizeBytes: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    storagePath: "/tmp/sfus-test-uploads",
    ...overrides
  },
  throttle: {
    windowMs: 60000,
    maxHits: 60,
    newAccountMaxHits: 10,
    newAccountWindowMs: 604800000,
    maxLinksPerPost: 5
  },
  auth: {
    passwordPepper: "test-pepper-16chars",
    sessionTokenPepper: "test-session-pepper-16chars",
    sessionTtlMinutes: 1440,
    sessionIdleTimeoutMinutes: 120,
    emailVerificationTtlMinutes: 60,
    externalStateTtlMinutes: 10,
    totpIssuer: "SFUS Test",
    recoveryCodeCount: 10,
    recoveryCodeLength: 12,
    externalProviders: {
      google: { clientId: "g-id", clientSecret: "g-secret", callbackUrl: "http://localhost/cb" },
      github: { clientId: "gh-id", clientSecret: "gh-secret", callbackUrl: "http://localhost/cb" }
    }
  },
  db: {
    host: "localhost",
    port: 3306,
    name: "sfus_test",
    user: "sfus",
    password: "changeme",
    connectTimeoutMs: 5000,
    migrationsTableName: "sfus_migrations"
  }
});

const makeMediaService = (
  envOverrides: Partial<ApplicationEnvironment["media"]> = {},
  findOneResult: MediaReferenceEntity | null = null
): MediaService => {
  const env = makeTestEnvironment(envOverrides);
  const repo = createMinimalMediaRepository(findOneResult);
  return new MediaService(repo as never, env as never);
};

const validFile = {
  originalname: "photo.jpg",
  mimetype: "image/jpeg",
  size: 1024,
  // Real JPEG magic bytes (FF D8 FF) followed by filler — required now that
  // magic-byte verification is enforced on every upload (ST11).
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
};

// ---------------------------------------------------------------------------
// Upload validation tests
// ---------------------------------------------------------------------------

describe("MediaService.assertValidMimeType", () => {
  // Acceptance criterion: upload validation enforces configured MIME rules.

  it("accepts allowed MIME types", () => {
    const service = makeMediaService();
    for (const mime of ["image/jpeg", "image/png", "image/gif", "image/webp"]) {
      expect(() => service.assertValidMimeType(mime)).not.toThrow();
    }
  });

  it("rejects an unlisted MIME type", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMimeType("application/pdf")).toThrow(BadRequestException);
  });

  it("rejects text/html as a MIME type", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMimeType("text/html")).toThrow(BadRequestException);
  });

  it("rejects image/svg+xml (not in default allow-list)", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMimeType("image/svg+xml")).toThrow(BadRequestException);
  });

  it("rejects an empty MIME type string", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMimeType("")).toThrow(BadRequestException);
  });
});

describe("MediaService.assertValidFileSize", () => {
  // Acceptance criterion: upload validation enforces configured size rules.

  it("accepts a file within the limit", () => {
    const service = makeMediaService();
    expect(() => service.assertValidFileSize(1024)).not.toThrow();
    expect(() => service.assertValidFileSize(5 * 1024 * 1024)).not.toThrow();
  });

  it("rejects a file exceeding the maximum size", () => {
    const service = makeMediaService();
    expect(() => service.assertValidFileSize(5 * 1024 * 1024 + 1)).toThrow(BadRequestException);
  });

  it("rejects with a meaningful error message", () => {
    const service = makeMediaService();
    try {
      service.assertValidFileSize(100 * 1024 * 1024);
      expect.fail("Expected BadRequestException");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toContain("too large");
    }
  });
});

describe("MediaService.assertValidResourceType", () => {
  // Acceptance criterion: uploads are scoped to approved Milestone 3 resource types.

  it("accepts all allowed resource types", () => {
    const service = makeMediaService();
    for (const rt of ["blog-post", "standalone-page", "blog-comment"]) {
      expect(() => service.assertValidResourceType(rt)).not.toThrow();
    }
  });

  it("rejects an unknown resource type", () => {
    const service = makeMediaService();
    expect(() => service.assertValidResourceType("profile-photo")).toThrow(BadRequestException);
  });

  it("rejects an empty resource type", () => {
    const service = makeMediaService();
    expect(() => service.assertValidResourceType("")).toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// MediaService.assertValidMagicBytes tests (ST11 — magic-byte verification)
// ---------------------------------------------------------------------------

describe("MediaService.assertValidMagicBytes", () => {
  // Acceptance criterion: upload is rejected (400) when the file's leading bytes
  // do not match the declared MIME type even when the content-type is in the allow-list.

  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const gif87aBuf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const gif89aBuf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const webpBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

  it("accepts a valid JPEG buffer with claimed image/jpeg", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMagicBytes(jpegBuf, "image/jpeg")).not.toThrow();
  });

  it("accepts a valid PNG buffer with claimed image/png", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMagicBytes(pngBuf, "image/png")).not.toThrow();
  });

  it("accepts a valid GIF87a buffer with claimed image/gif", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMagicBytes(gif87aBuf, "image/gif")).not.toThrow();
  });

  it("accepts a valid GIF89a buffer with claimed image/gif", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMagicBytes(gif89aBuf, "image/gif")).not.toThrow();
  });

  it("accepts a valid WebP buffer with claimed image/webp", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMagicBytes(webpBuf, "image/webp")).not.toThrow();
  });

  it("throws BadRequestException when PNG bytes are declared as image/jpeg (polyglot)", () => {
    // Non-vacuous polyglot: MIME type is in the allow-list but bytes do not match.
    const service = makeMediaService();
    expect(() => service.assertValidMagicBytes(pngBuf, "image/jpeg")).toThrow(BadRequestException);
  });

  it("throws BadRequestException when JPEG bytes are declared as image/png (polyglot)", () => {
    const service = makeMediaService();
    expect(() => service.assertValidMagicBytes(jpegBuf, "image/png")).toThrow(BadRequestException);
  });

  it("throws BadRequestException for SVG MIME type (not in IMAGE_SIGNATURES)", () => {
    const svgBytes = Buffer.from("<svg xmlns=".padEnd(12, " "));
    const service = makeMediaService();
    expect(() => service.assertValidMagicBytes(svgBytes, "image/svg+xml")).toThrow(BadRequestException);
  });

  it("throws BadRequestException with the expected error message on mismatch", () => {
    const service = makeMediaService();
    try {
      service.assertValidMagicBytes(pngBuf, "image/jpeg");
      expect.fail("Expected BadRequestException");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toContain(
        "File content does not match the declared content type"
      );
    }
  });

  it("throws BadRequestException for a short buffer (fewer than 12 bytes)", () => {
    const shortBuf = Buffer.from([0xff, 0xd8, 0xff]);
    const service = makeMediaService();
    expect(() => service.assertValidMagicBytes(shortBuf, "image/jpeg")).toThrow(BadRequestException);
  });
});

describe("MediaService.uploadImage", () => {
  // Acceptance criterion: combined upload path enforces all validation and writes a reference.

  it("rejects an unsupported MIME type before touching the filesystem", async () => {
    const fsMock = await import("node:fs");
    vi.clearAllMocks();
    const service = makeMediaService();

    await expect(
      service.uploadImage("user-1", { ...validFile, mimetype: "application/pdf" }, "blog-post", null)
    ).rejects.toThrow(BadRequestException);

    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects an oversized file before touching the filesystem", async () => {
    const fsMock = await import("node:fs");
    vi.clearAllMocks();
    const service = makeMediaService();

    await expect(
      service.uploadImage("user-1", { ...validFile, size: 100 * 1024 * 1024 }, "blog-post", null)
    ).rejects.toThrow(BadRequestException);

    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects an invalid resource type", async () => {
    const fsMock = await import("node:fs");
    vi.clearAllMocks();
    const service = makeMediaService();

    await expect(
      service.uploadImage("user-1", validFile, "invalid-type" as never, null)
    ).rejects.toThrow(BadRequestException);

    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it("returns a result with the storage URL and metadata for a valid upload", async () => {
    vi.clearAllMocks();
    const service = makeMediaService();

    const result = await service.uploadImage("user-1", validFile, "blog-post", null);

    expect(result.id).toBeDefined();
    expect(result.url).toMatch(/^\/api\/media\//);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(1024);
    expect(result.originalFilename).toContain("photo");
  });

  it("rejects a polyglot (valid MIME type header but non-matching bytes) before touching the filesystem", async () => {
    // Acceptance criterion: polyglot uploads must be rejected with 400 even
    // when the content-type header is in the allow-list.
    const fsMock = await import("node:fs");
    vi.clearAllMocks();
    const service = makeMediaService();

    // PNG bytes declared as image/jpeg — non-matching, non-vacuous polyglot.
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const polyglotFile = { ...validFile, mimetype: "image/jpeg", buffer: pngBuf };

    await expect(
      service.uploadImage("user-1", polyglotFile, "blog-post", null)
    ).rejects.toThrow(BadRequestException);

    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  // Acceptance criterion: compliant real images for each existing resourceType
  // still upload and serve unchanged (no regression from ST11).

  it("accepts a valid JPEG upload for resourceType blog-post (no regression)", async () => {
    vi.clearAllMocks();
    const service = makeMediaService();
    const result = await service.uploadImage("user-1", validFile, "blog-post", null);
    expect(result.id).toBeDefined();
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.storageKey).toContain("blog-post");
  });

  it("accepts a valid JPEG upload for resourceType standalone-page (no regression)", async () => {
    vi.clearAllMocks();
    const service = makeMediaService();
    const result = await service.uploadImage("user-1", validFile, "standalone-page", null);
    expect(result.id).toBeDefined();
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.storageKey).toContain("standalone-page");
  });

  it("accepts a valid JPEG upload for resourceType blog-comment (no regression)", async () => {
    vi.clearAllMocks();
    const service = makeMediaService();
    const result = await service.uploadImage("user-1", validFile, "blog-comment", null);
    expect(result.id).toBeDefined();
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.storageKey).toContain("blog-comment");
  });

  it("rejects a polyglot for resourceType standalone-page (400)", async () => {
    // Acceptance criterion: polyglot rejection applies to every resourceType.
    const service = makeMediaService();
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const polyglotFile = { ...validFile, mimetype: "image/jpeg", buffer: pngBuf };
    await expect(
      service.uploadImage("user-1", polyglotFile, "standalone-page", null)
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a polyglot for resourceType blog-comment (400)", async () => {
    // Acceptance criterion: polyglot rejection applies to every resourceType.
    const service = makeMediaService();
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const polyglotFile = { ...validFile, mimetype: "image/jpeg", buffer: pngBuf };
    await expect(
      service.uploadImage("user-1", polyglotFile, "blog-comment", null)
    ).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// MediaService.getImageForServing tests
// Acceptance criterion: GET /api/media/:id serves stored files resolved from
// storageKey with path traversal defence; only allowed MIME types served.
// ---------------------------------------------------------------------------

const makeMediaEntity = (overrides: Partial<MediaReferenceEntity> = {}): MediaReferenceEntity => ({
  id: "test-media-id",
  storageKey: "blog-post/test-media-id.jpg",
  originalFilename: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  ownerUserId: "user-1",
  resourceType: "blog-post",
  resourceId: null,
  createdAt: new Date(),
  ...overrides
} as MediaReferenceEntity);

describe("MediaService.getImageForServing", () => {
  it("throws NotFoundException when the media record does not exist", async () => {
    const service = makeMediaService({}, null);
    await expect(service.getImageForServing("nonexistent-id")).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when the file is absent from disk", async () => {
    const fsMock = await import("node:fs");
    vi.mocked(fsMock.default.existsSync).mockReturnValueOnce(false);
    const entity = makeMediaEntity();
    const service = makeMediaService({}, entity);
    await expect(service.getImageForServing(entity.id)).rejects.toThrow(NotFoundException);
  });

  it("rejects a path traversal storageKey that escapes the storage root", async () => {
    // Simulate a tampered storageKey (defence-in-depth: server-generated keys
    // should never contain traversal, but the guard must still reject them).
    const entity = makeMediaEntity({ storageKey: "../../etc/passwd" });
    const service = makeMediaService({ storagePath: "/tmp/sfus-test-uploads" }, entity);
    await expect(service.getImageForServing(entity.id)).rejects.toThrow(BadRequestException);
  });

  it("rejects a storageKey with encoded traversal segments", async () => {
    const entity = makeMediaEntity({ storageKey: "blog-post/../../../etc/passwd" });
    const service = makeMediaService({ storagePath: "/tmp/sfus-test-uploads" }, entity);
    await expect(service.getImageForServing(entity.id)).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when the stored mimeType is not in the allow-list", async () => {
    const fsMock = await import("node:fs");
    vi.mocked(fsMock.default.existsSync).mockReturnValueOnce(true);
    const entity = makeMediaEntity({ mimeType: "application/octet-stream" });
    const service = makeMediaService({}, entity);
    await expect(service.getImageForServing(entity.id)).rejects.toThrow(BadRequestException);
  });

  it("returns filePath, mimeType, sizeBytes and originalFilename for a valid record", async () => {
    const fsMock = await import("node:fs");
    vi.mocked(fsMock.default.existsSync).mockReturnValueOnce(true);
    const entity = makeMediaEntity();
    const service = makeMediaService({ storagePath: "/tmp/sfus-test-uploads" }, entity);
    const result = await service.getImageForServing(entity.id);
    expect(result.filePath).toContain("/tmp/sfus-test-uploads");
    expect(result.filePath).toContain("blog-post");
    // Path must not escape the storage root.
    expect(result.filePath.startsWith("/tmp/sfus-test-uploads")).toBe(true);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(1024);
    expect(result.originalFilename).toBe("photo.jpg");
  });

  it("resolved path remains within the storage root for a valid storageKey", async () => {
    const fsMock = await import("node:fs");
    vi.mocked(fsMock.default.existsSync).mockReturnValueOnce(true);
    const entity = makeMediaEntity({ storageKey: "blog-post/abc-123.png", mimeType: "image/png" });
    const service = makeMediaService({ storagePath: "/tmp/sfus-test-uploads" }, entity);
    const result = await service.getImageForServing(entity.id);
    expect(result.filePath).toBe("/tmp/sfus-test-uploads/blog-post/abc-123.png");
  });
});
