import { logger } from "../lib/logger.js";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: (err: unknown) => boolean;
}

const DEFAULT_RETRY_ON = (err: unknown): boolean => {
  const msg = String(err).toLowerCase();
  // Retry on transient network errors, rate limits, and 5xx
  return (
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("429") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
};

/**
 * Execute an async function with exponential-backoff retry.
 *
 * Does NOT retry on 4xx auth/validation errors — only transient failures
 * (network, rate-limit 429, 502/503/504 gateway errors).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 400,
    maxDelayMs  = 10_000,
    retryOn     = DEFAULT_RETRY_ON,
  } = options;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (attempt === maxAttempts || !retryOn(err)) {
        logger.warn({ err: String(err), attempt, maxAttempts }, "retryFetch: giving up");
        throw err;
      }

      const jitter   = Math.random() * 200;
      const delay    = Math.min(baseDelayMs * Math.pow(2, attempt - 1) + jitter, maxDelayMs);
      logger.warn({ err: String(err), attempt, nextDelayMs: Math.round(delay) }, "retryFetch: retrying");
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastErr;
}

/**
 * Wrap a fetch call with automatic retry on transient failures.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: RetryOptions,
): Promise<Response> {
  return withRetry(async () => {
    const res = await fetch(url, init);
    // Surface 5xx as thrown errors so the retry loop can catch them
    if (res.status >= 500) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return res;
  }, options);
}
