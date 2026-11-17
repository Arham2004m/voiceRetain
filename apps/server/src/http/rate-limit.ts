import { rateLimit } from "express-rate-limit";

/** 20 requests per minute per IP, answering with the standard error shape. */
export function perMinuteLimiter(limit = 20) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json({ error: { code: "RATE_LIMITED", message: "Too many requests, slow down" } });
    },
  });
}
