import {
  BadRequestException,
  Controller,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request } from "express";
// multer is a transitive dep of @nestjs/platform-express. We load it at runtime
// via require() to avoid an explicit peer-dependency. The cast preserves the call
// signature without importing the @types/multer package separately.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const multerModule = require("multer") as { memoryStorage: () => unknown };
const { memoryStorage } = multerModule;

import { AuthService } from "../auth/auth.service";
import type { AllowedResourceType } from "./media.service";
import { ALLOWED_RESOURCE_TYPES, MediaService } from "./media.service";

@ApiTags("media")
@Controller("media")
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly authService: AuthService
  ) {}

  /**
   * Upload an image for use in blog posts, standalone pages, or blog comments.
   *
   * Authorization: requires an active session (authenticated users only).
   * The resourceType query parameter scopes the upload to a Milestone 3
   * content type. Validation enforces the configured MIME and size limits.
   */
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      // A liberal limit here; the real size validation is done in MediaService
      // against the configured value so the limit can change without code churn.
      limits: { fileSize: 20 * 1024 * 1024 }
    })
  )
  @ApiOperation({ summary: "Upload an image for use in Milestone 3 content." })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" }
      }
    }
  })
  @ApiUnauthorizedResponse({ description: "No active session." })
  @ApiBadRequestResponse({ description: "Invalid MIME type, file too large, or invalid resource type." })
  async uploadImage(
    @Req() request: Request,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Query("resourceType") resourceType: string | undefined
  ) {
    // Resolve the session — throws UnauthorizedException when no active session.
    const session = await this.authService.resolveSession({
      cookieHeader: request.headers.cookie
    });

    if (!file) {
      throw new BadRequestException("No file was provided. Send a multipart/form-data request with a 'file' field.");
    }

    if (!resourceType || !ALLOWED_RESOURCE_TYPES.includes(resourceType as AllowedResourceType)) {
      throw new BadRequestException(
        `Invalid or missing resourceType. Allowed values: ${ALLOWED_RESOURCE_TYPES.join(", ")}.`
      );
    }

    const result = await this.mediaService.uploadImage(
      session.user.id,
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer
      },
      resourceType as AllowedResourceType,
      null
    );

    return result;
  }
}
