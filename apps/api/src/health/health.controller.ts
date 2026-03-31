import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags
} from "@nestjs/swagger";
import type { Response } from "express";
import { Res } from "@nestjs/common";

import { ReadinessService, type ReadinessPayload } from "./readiness.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly readinessService: ReadinessService) {}

  @Get("live")
  @ApiOperation({ summary: "Liveness probe" })
  @ApiOkResponse({ description: "API process is able to serve requests." })
  getLiveness(): { status: "ok"; service: "api"; timestamp: string } {
    return {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString()
    };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe" })
  @ApiOkResponse({ description: "Database connectivity and migration state are ready." })
  @ApiServiceUnavailableResponse({
    description: "Database connectivity or required migration state is not ready."
  })
  async getReadiness(@Res({ passthrough: true }) response: Response): Promise<ReadinessPayload> {
    const readiness = await this.readinessService.check();

    if (readiness.status !== "ok") {
      response.status(503);
    }

    return readiness;
  }
}
