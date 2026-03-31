import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Response } from "express";

import { getRequestPath, type ApiRequest } from "../http/request-context";
import { JsonLogger } from "../logger/json-logger.service";

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: JsonLogger) {}

  use(request: ApiRequest, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    response.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      this.logger.info(
        "request.completed",
        {
          correlationId: request.correlationId,
          method: request.method,
          path: getRequestPath(request),
          statusCode: response.statusCode,
          durationMs: Number(durationMs.toFixed(3)),
          userAgent: request.get("user-agent") || null
        },
        "HttpRequest"
      );
    });

    next();
  }
}
