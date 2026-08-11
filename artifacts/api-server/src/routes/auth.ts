import { Router, type IRouter } from "express";
import { timingSafeEqual, createHmac } from "crypto";
import { logger } from "../lib/logger.js";

/**
 * Lightweight PIN gate for this personal deployment.
 *
 * The PIN is never sent to the client. Successful verification returns a
 * short-lived signed bearer token. The token is used for REST and WebSocket
 * access so a public Railway URL cannot expose the private market/alert feed.
 */

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOKEN_MARKER = "pin-verified";
const MAX_PIN_ATTEMPTS = 5;
const PIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const failedPinAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim();
  return forwardedIp || req.ip || req.socket.remoteAddress || "unknown";
}

function getTokenSecret(): string {
  const secret = process.env["APP_PIN_TOKEN_SECRET"] ?? process.env["SESSION_SECRET"];
  if (!secret) {
    if (process.env["NODE_ENV"] === "production") {
      logger.error("APP_PIN_TOKEN_SECRET (or SESSION_SECRET) is not set — PIN tokens are insecure in production.");
    } else {
      logger.warn("APP_PIN_TOKEN_SECRET is not set — using insecure dev fallback.");
    }
  }
  return secret ?? "dev-fallback-secret-replace-in-prod";
}

function sign(payload: string): string {
  return createHmac("sha256", getTokenSecret()).update(payload).digest("base64url");
}

function issueToken(): string {
  const payload = `${TOKEN_MARKER}.${Date.now() + TOKEN_TTL_MS}`;
  return Buffer.from(`${payload}.${sign(payload)}`, "utf8").toString("base64url");
}

export function verifyToken(token: string | undefined | null): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return false;
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expectedSig = sign(payload);

    const sigBuf = Buffer.from(sig, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return false;
    }

    const [marker, expiresAtStr] = payload.split(".");
    if (marker !== TOKEN_MARKER) return false;
    const expiresAt = Number(expiresAtStr);
    return Number.isFinite(expiresAt) && Date.now() < expiresAt;
  } catch {
    return false;
  }
}

export function isPinConfigured(): boolean {
  return !!process.env["APP_PIN"];
}

function extractBearerToken(req: import("express").Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function pinMatches(candidate: string): boolean {
  const expected = process.env["APP_PIN"] ?? "";
  if (!expected) return false;

  const PAD_LEN = 64;
  const a = Buffer.alloc(PAD_LEN, 0);
  const b = Buffer.alloc(PAD_LEN, 0);
  Buffer.from(candidate, "utf8").copy(a, 0, 0, Math.min(candidate.length, PAD_LEN));
  Buffer.from(expected, "utf8").copy(b, 0, 0, Math.min(expected.length, PAD_LEN));

  const lengthOk = candidate.length === expected.length;
  const bytesOk = timingSafeEqual(a, b);
  return lengthOk && bytesOk;
}

function checkRateLimit(req: import("express").Request): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const key = getClientKey(req);
  const existing = failedPinAttempts.get(key);

  if (!existing || existing.resetAt <= now) {
    failedPinAttempts.set(key, { count: 0, resetAt: now + PIN_ATTEMPT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= MAX_PIN_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function recordFailedAttempt(req: import("express").Request): void {
  const key = getClientKey(req);
  const now = Date.now();
  const current = failedPinAttempts.get(key);
  if (!current || current.resetAt <= now) {
    failedPinAttempts.set(key, { count: 1, resetAt: now + PIN_ATTEMPT_WINDOW_MS });
    return;
  }
  current.count += 1;
}

function clearFailedAttempts(req: import("express").Request): void {
  failedPinAttempts.delete(getClientKey(req));
}

export function createAuthRouter(): IRouter {
  const router: IRouter = Router();

  router.get("/api/auth/status", (req, res) => {
    const pinRequired = isPinConfigured();
    const verified = !pinRequired || verifyToken(extractBearerToken(req));
    res.json({ pinRequired, verified });
  });

  router.post("/api/auth/verify-pin", (req, res) => {
    if (!isPinConfigured()) {
      res.json({ ok: true });
      return;
    }

    const rate = checkRateLimit(req);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      res.status(429).json({ ok: false, error: "Too many incorrect PIN attempts. Try again later." });
      return;
    }

    const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
    if (!pin) {
      res.status(400).json({ ok: false, error: "PIN is required" });
      return;
    }

    if (pinMatches(pin)) {
      clearFailedAttempts(req);
      const token = issueToken();
      logger.info("auth: PIN verified — token issued");
      res.json({ ok: true, token });
    } else {
      recordFailedAttempt(req);
      logger.warn({ attemptsRemaining: Math.max(0, MAX_PIN_ATTEMPTS - (failedPinAttempts.get(getClientKey(req))?.count ?? MAX_PIN_ATTEMPTS)) }, "auth: incorrect PIN attempt");
      res.status(401).json({ ok: false, error: "Incorrect PIN" });
    }
  });

  router.post("/api/auth/lock", (_req, res) => {
    res.json({ ok: true });
  });

  return router;
}

export function requirePinVerified(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  if (!isPinConfigured()) {
    next();
    return;
  }
  // OAuth callbacks must remain reachable without the app bearer token.
  if (
    req.path.startsWith("/api/auth/") ||
    req.path === "/api/ctrader/oauth/callback" ||
    req.path === "/api/delta/oauth/callback"
  ) {
    next();
    return;
  }
  if (verifyToken(extractBearerToken(req))) {
    next();
    return;
  }
  res.status(401).json({ error: "PIN verification required" });
}
