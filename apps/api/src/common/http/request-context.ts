import type { Request } from "express";

export type ApiRequest = Request & {
  correlationId?: string;
};

export const getRequestPath = (request: Request): string => {
  return request.originalUrl || request.url;
};
