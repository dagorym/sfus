import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import { MediaReferenceEntity } from "./entities/media-reference.entity";
import { imageMagicBytesMatch } from "./image-magic-bytes";

export interface UploadedFileInput {
  /** Original filename from the upload, used for display only — not trusted for storage. */
  originalname: string;
  /** Reported MIME type from the multipart upload. */
  mimetype: string;
  /** File size in bytes. */
  size: number;
  /** In-memory buffer of the uploaded file. */
  buffer: Buffer;
}

export interface MediaUploadResult {
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
}

export interface MediaServeResult {
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
}

/** Resource type values accepted as the resource context for an upload. */
export const ALLOWED_RESOURCE_TYPES = ["blog-post", "standalone-page", "blog-comment", "avatar"] as const;
export type AllowedResourceType = (typeof ALLOWED_RESOURCE_TYPES)[number];

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaReferenceEntity)
    private readonly mediaRepository: Repository<MediaReferenceEntity>,
    @Inject(API_ENVIRONMENT)
    private readonly environment: ApplicationEnvironment
  ) {}

  /**
   * Validates and stores an uploaded image file. The upload is rejected when:
   * - the MIME type is not in the configured allow-list,
   * - the file's leading bytes do not match the declared MIME type (magic-byte
   *   verification — catches polyglot and mislabelled files even when the
   *   Content-Type header names an allowed type),
   * - the file size exceeds the configured maximum,
   * - the resource type is not one of the milestone-scoped allowed values.
   *
   * Returns a MediaUploadResult with the stored reference data on success.
   */
  async uploadImage(
    ownerUserId: string,
    file: UploadedFileInput,
    resourceType: AllowedResourceType,
    resourceId: string | null
  ): Promise<MediaUploadResult> {
    this.assertValidMimeType(file.mimetype);
    this.assertValidMagicBytes(file.buffer, file.mimetype);
    this.assertValidFileSize(file.size, resourceType);
    this.assertValidResourceType(resourceType);

    const id = randomUUID();
    const ext = this.safeExtensionForMimeType(file.mimetype);
    const storageKey = `${resourceType}/${id}${ext}`;
    const storagePath = path.resolve(this.environment.media.storagePath, storageKey);

    // Ensure the directory exists.
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, file.buffer);

    const entity = this.mediaRepository.create({
      id,
      ownerUserId,
      resourceType,
      resourceId: resourceId ?? null,
      storageKey,
      originalFilename: this.sanitizeFilename(file.originalname),
      mimeType: file.mimetype,
      sizeBytes: file.size
    });
    await this.mediaRepository.save(entity);

    return {
      id: entity.id,
      storageKey: entity.storageKey,
      originalFilename: entity.originalFilename,
      mimeType: entity.mimeType,
      sizeBytes: entity.sizeBytes,
      url: `/api/media/${entity.id}`,
      createdAt: entity.createdAt
    };
  }

  /**
   * Resolves a stored media record by ID and returns a safe file path for
   * streaming. The path is derived from the stored storageKey — never from any
   * user-supplied path — and is resolved relative to the configured storage
   * root so that path traversal attempts embedded in a storageKey in the
   * database are still rejected.
   *
   * Throws NotFoundException when the record does not exist or the file is
   * absent from disk, and BadRequestException when the stored mimeType is not
   * in the allowed list (defence-in-depth).
   */
  async getImageForServing(id: string): Promise<MediaServeResult> {
    const entity = await this.mediaRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException("Media not found.");
    }

    // Defence-in-depth: even though storageKey is server-generated, validate
    // that it does not attempt to escape the storage root.
    const storageRoot = path.resolve(this.environment.media.storagePath);
    const resolvedPath = path.resolve(storageRoot, entity.storageKey);
    if (!resolvedPath.startsWith(storageRoot + path.sep) && resolvedPath !== storageRoot) {
      throw new BadRequestException("Invalid media storage key.");
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new NotFoundException("Media file not found on disk.");
    }

    // Only serve MIME types that are in the configured allow-list.
    this.assertValidMimeType(entity.mimeType);

    return {
      filePath: resolvedPath,
      mimeType: entity.mimeType,
      sizeBytes: entity.sizeBytes,
      originalFilename: entity.originalFilename
    };
  }

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  assertValidMimeType(mimeType: string): void {
    if (!this.environment.media.allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type. Allowed types: ${this.environment.media.allowedMimeTypes.join(", ")}.`
      );
    }
  }

  /**
   * Verifies that the file's leading bytes match the declared MIME type.
   * Rejects (`400`) any upload whose magic-byte signature does not correspond to
   * the client-supplied content-type, catching polyglot and mislabelled files.
   *
   * Applies to every image resourceType handled by this service:
   *   blog-post, standalone-page, blog-comment, avatar.
   *
   * SVG (`image/svg+xml`) is absent from both this check and the MIME allow-list
   * because SVG can embed executable content.
   */
  assertValidMagicBytes(buffer: Buffer, claimedMimeType: string): void {
    if (!imageMagicBytesMatch(buffer, claimedMimeType)) {
      throw new BadRequestException(
        "File content does not match the declared content type. Upload rejected."
      );
    }
  }

  assertValidFileSize(sizeBytes: number, resourceType?: string): void {
    const maxSizeBytes =
      resourceType === "avatar"
        ? this.environment.media.avatarUploadMaxSizeBytes
        : this.environment.media.uploadMaxSizeBytes;
    if (sizeBytes > maxSizeBytes) {
      const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(1);
      throw new BadRequestException(`File too large. Maximum allowed size is ${maxMb} MB.`);
    }
  }

  assertValidResourceType(resourceType: string): void {
    if (!ALLOWED_RESOURCE_TYPES.includes(resourceType as AllowedResourceType)) {
      throw new BadRequestException(
        `Invalid resource type. Allowed values: ${ALLOWED_RESOURCE_TYPES.join(", ")}.`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private safeExtensionForMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp"
    };
    return map[mimeType] ?? "";
  }

  private sanitizeFilename(name: string): string {
    // Keep only the base name, strip directory traversal components, and
    // limit to 255 characters.
    return path.basename(name).replace(/[^\w.-]/g, "_").slice(0, 255);
  }
}
