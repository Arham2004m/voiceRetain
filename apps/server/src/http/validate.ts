import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { HttpError } from "./errors";

export function validate(schema: ZodTypeAny, source: "body" | "query" | "params"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new HttpError(400, "VALIDATION_ERROR", "Invalid request", result.error.issues));
      return;
    }
    // Express 5 makes req.query / req.params getters, so redefine instead of assigning.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}
