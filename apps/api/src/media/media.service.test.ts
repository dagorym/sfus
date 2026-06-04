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
  buffer: Buffer.from("fake-image-data")
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
