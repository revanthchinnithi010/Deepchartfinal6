import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

interface WindowEntry {
  count: number;
  resetAt: number;
}

// Module-level store: key → sliding window entry
const store = new Map<string, WindowEntry>();

// Prune stale entries every 5 minutes to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
  /** Human-readable description for error messages */
  label?: string;
}

/**
 * Returns an Express middleware that rate-limits by a key derived from the request.
 *
 * keyFn is called per request — use it to extract account ID, IP, etc.
 */
export function createRateLimiter(
  keyFn: (req: Request) => string,
  config: RateLimitConfig,
) {
  const { limit, windowSec, label = "requests" } = config;
  const windowMs = windowSec * 1000;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyFn(req);
    const now = Date.now();

    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      store.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Limit",     String(limit));
      res.setHeader("X-RateLimit-Remaining", String(limit - 1));
      res.setHeader("X-RateLimit-Reset",     String(Math.ceil((now + windowMs) / 1000)));
      next();
      return;
    }

    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      logger.warn({ key, count: entry.count, limit, retryAfter }, "rateLimiter: blocked");
      res.setHeader("Retry-After",           String(retryAfter));
      res.setHeader("X-RateLimit-Limit",     String(limit));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset",     String(Math.ceil(entry.resetAt / 1000)));
      res.status(429).json({
        ok: false,
        error: `Rate limit exceeded: max ${limit} ${label} per ${windowSec}s. Retry after ${retryAfter}s.`,
      });
      return;
    }

    entry.count += 1;
    res.setHeader("X-RateLimit-Limit",     String(limit));
    res.setHeader("X-RateLimit-Remaining", String(limit - entry.count));
    res.setHeader("X-RateLimit-Reset",     String(Math.ceil(entry.resetAt / 1000)));
    next();
  };
}

// ── Pre-built limiters ─────────────────────────────────────────────────────

/** Order placement / cancellation — 20 per 10 s per account */
export const orderWriteLimiter = createRateLimiter(
  req => `order_write:${req.headers["x-broker-account-id"] ?? req.ip}`,
  { limit: 20, windowSec: 10, label: "order mutations" },
);

/** Data reads (balance, positions, orders) — 60 per 60 s per account */
export const dataReadLimiter = createRateLimiter(
  req => `data_read:${req.headers["x-broker-account-id"] ?? req.ip}`,
  { limit: 60, windowSec: 60, label: "data reads" },
);

/** Connection / validation endpoints — 5 per 30 s per IP */
export const connectLimiter = createRateLimiter(
  req => `connect:${req.ip ?? "unknown"}`,
  { limit: 5, windowSec: 30, label: "connection attempts" },
);
