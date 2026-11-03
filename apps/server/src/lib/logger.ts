import pino from "pino";

const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
const isDev = process.env.NODE_ENV !== "production" && !isTest;

export const logger = pino({
  level: isTest ? "silent" : (process.env.LOG_LEVEL ?? "info"),
  redact: {
    paths: ["phone", "*.phone", "GEMINI_API_KEY", "*.GEMINI_API_KEY"],
    censor: "[redacted]",
  },
  ...(isDev ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
});
