import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter
} from "@nestjs/common";
import type { Response } from "express";

import { getRequestPath, type ApiRequest } from "../http/request-context";
import { JsonLogger } from "../logger/json-logger.service";

interface ErrorPayload {
  error: {
    code: string;
    message: string;
    statusCode: number;
  };
  request: {
    correlationId: string | null;
    method: string;
    path: string;
    timestamp: string;
  };
}

@Catch()
export class JsonExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<ApiRequest>();
    const response = http.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = this.buildPayload(exception, request, statusCode);

    this.logger.error(
      "request.failed",
      {
        correlationId: payload.request.correlationId,
        method: payload.request.method,
        path: payload.request.path,
        statusCode,
        errorCode: payload.error.code,
        errorMessage: payload.error.message,
        ...(exception instanceof Error && exception.stack ? { stack: exception.stack } : {})
      },
      "HttpExceptionFilter"
    );

    response.status(statusCode).json(payload);
  }

  private buildPayload(
    exception: unknown,
    request: ApiRequest,
    statusCode: number
  ): ErrorPayload {
    const timestamp = new Date().toISOString();
    const path = getRequestPath(request);
    const method = request.method;
    const correlationId = request.correlationId || null;
    const defaultMessage = HttpStatus[statusCode] || "Internal Server Error";

    if (!(exception instanceof HttpException)) {
      return {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred.",
          statusCode
        },
        request: {
          correlationId,
          method,
          path,
          timestamp
        }
      };
    }

    const responseBody = exception.getResponse();
    const message = extractMessage(responseBody, defaultMessage);
    const code = extractCode(responseBody, statusCode, defaultMessage);

    return {
      error: {
        code,
        message,
        statusCode
      },
      request: {
        correlationId,
        method,
        path,
        timestamp
      }
    };
  }
}

const extractMessage = (responseBody: string | object, fallback: string): string => {
  if (typeof responseBody === "string") {
    return responseBody;
  }

  const candidate = (responseBody as Record<string, unknown>).message;

  if (Array.isArray(candidate)) {
    return candidate.join(", ");
  }

  if (typeof candidate === "string" && candidate.trim()) {
    return candidate;
  }

  return fallback;
};

const extractCode = (
  responseBody: string | object,
  statusCode: number,
  fallback: string
): string => {
  if (typeof responseBody !== "string") {
    const candidate = (responseBody as Record<string, unknown>).error;

    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeCode(candidate);
    }
  }

  return normalizeCode(HttpStatus[statusCode] || fallback);
};

const normalizeCode = (value: string): string => {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
};
