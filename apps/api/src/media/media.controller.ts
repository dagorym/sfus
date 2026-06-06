import fs from "node:fs";

import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import multer from "multer";

const { memoryStorage } = multer;
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request, Response } from "express";

import { AuthService } from "../auth/auth.service";
import type { AllowedResourceType } from "./media.service";
import { ALLOWED_RESOURCE_TYPES, MediaService } from "./media.service";

/** Resource types that require an admin-level global role to upload. */
const ADMIN_ONLY_RESOURCE_TYPES: AllowedResourceType[] = ["blog-post", "standalone-page"];

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
   * Authorization rules (role-scoped):
   *  - blog-post / standalone-page: requires admin global role.
   *  - blog-comment: requires any authenticated user.
   *  - unauthenticated requests: rejected with 401.
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
  @ApiForbiddenResponse({ description: "Insufficient role for the requested resource type." })
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

    // Role-scoped upload authorization: blog-post and standalone-page require admin.
    if (ADMIN_ONLY_RESOURCE_TYPES.includes(resourceType as AllowedResourceType)) {
      const globalRole = session.user.globalRole;
      if (globalRole !== "admin") {
        throw new ForbiddenException(
          `Uploading images for resource type '${resourceType}' requires the admin role.`
        );
      }
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

  /**
   * Serve a stored media file by its ID.
   *
   * The file path is resolved from the stored storageKey (server-generated),
   * never from any user-supplied path, preventing path traversal.
   * Only MIME types in the configured allow-list are served.
   * This endpoint is public (no authentication required for reading).
   */
  @Get(":id")
  @ApiOperation({ summary: "Retrieve a stored media file by ID." })
  @ApiParam({ name: "id", description: "Media reference UUID." })
  @ApiOkResponse({ description: "The image file." })
  @ApiNotFoundResponse({ description: "Media not found." })
  @ApiBadRequestResponse({ description: "Invalid or disallowed media." })
  async serveImage(@Param("id") id: string, @Res() res: Response) {
    const media = await this.mediaService.getImageForServing(id);

    res.setHeader("Content-Type", media.mimeType);
    res.setHeader("Content-Length", media.sizeBytes);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${media.originalFilename.replace(/"/g, '\\"')}"`
    );

    const stream = fs.createReadStream(media.filePath);

    stream.on("error", (err: NodeJS.ErrnoException) => {
      // If response headers have already been flushed (partial body sent) we
      // cannot write a new HTTP status line — destroy the socket to signal an
      // incomplete response to the client.
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (err.code === "ENOENT") {
        // File vanished between the DB lookup and the stream open (TOCTOU race).
        // Return a controlled 404 instead of letting the error propagate as an
        // unhandled stream error or leaving the connection hung.
        res.status(404).json({ statusCode: 404, message: "Media file not found." });
        return;
      }
      // For unexpected I/O errors send a 500 so the connection is closed cleanly.
      res.status(500).json({ statusCode: 500, message: "Internal server error." });
    });

    stream.pipe(res);
  }
}
