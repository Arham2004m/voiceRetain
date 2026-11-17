import type { ErrorRequestHandler, RequestHandler } from "express";
import { logger } from "../lib/logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (msg: string) => new HttpError(404, "NOT_FOUND", msg);
export const conflict = (msg: string) => new HttpError(409, "CONFLICT", msg);
export const badRequest = (msg: string, details?: unknown) =>
  new HttpError(400, "BAD_REQUEST", msg, details);
export const unprocessable = (msg: string, details?: unknown) =>
  new HttpError(422, "UNPROCESSABLE", msg, details);

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  if ((err as { type?: string } | null)?.type === "entity.too.large") {
    res
      .status(413)
      .json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } });
    return;
  }
  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
