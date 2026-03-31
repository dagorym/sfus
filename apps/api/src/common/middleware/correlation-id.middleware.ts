import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";

import type { ApiRequest } from "../http/request-context";

const correlationHeaderName = "x-correlation-id";
const requestIdHeaderName = "x-request-id";

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: ApiRequest, response: Response, next: NextFunction): void {
    const incomingHeader = request.header(correlationHeaderName) || request.header(requestIdHeaderName);
    const correlationId = incomingHeader?.trim() || randomUUID();

    request.correlationId = correlationId;
    response.setHeader(correlationHeaderName, correlationId);

    next();
  }
}
