import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import { MediaReferenceEntity } from "./entities/media-reference.entity";

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

/** Resource type values accepted as the resource context for an upload. */
export const ALLOWED_RESOURCE_TYPES = ["blog-post", "standalone-page", "blog-comment"] as const;
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
    this.assertValidFileSize(file.size);
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

  assertValidFileSize(sizeBytes: number): void {
    if (sizeBytes > this.environment.media.uploadMaxSizeBytes) {
      const maxMb = (this.environment.media.uploadMaxSizeBytes / (1024 * 1024)).toFixed(1);
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
