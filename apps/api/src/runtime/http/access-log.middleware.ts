import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { REQUEST_ID_HEADER } from "./request-id";

const logger = new Logger("HTTP");

/**
 * One log line per request, carrying the same id the response header
 * does. M-11 (docs/STRATEGY_B_EXECUTION_LEDGER.md): the correlation id
 * has existed on every request/response since `request-id.ts` was
 * written, and nothing ever logged it -- "it failed around 3pm" was
 * still the only trace an incident had, because no line anywhere named
 * which request that was. Logged on `finish` rather than at the start,
 * so the line carries the status and duration a start-of-request log
 * cannot know yet.
 *
 * A health-check path is excluded on purpose: a load balancer polling
 * `/api/v1/health` every few seconds would otherwise drown every real
 * request's line in noise within minutes.
 */
export function accessLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === "/api/v1/health") {
    next();
    return;
  }

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const requestId = res.getHeader(REQUEST_ID_HEADER) ?? "unknown";
    logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms rid=${requestId}`);
  });

  next();
}
