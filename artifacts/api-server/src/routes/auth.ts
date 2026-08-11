import { Router, type IRouter } from "express";
import { timingSafeEqual, createHmac } from "crypto";
import { logger } from "../lib/logger.js";

/**
 * Simple PIN gate for personal-use deployments.
 *
 * This is NOT a full auth system — there are no user accounts. It exists
 * because the app's public Railway URL is otherwise reachable by anyone who
 * has (or guesses/finds) the link, and this is a single-user personal app.
 * Setting APP_PIN turns on a lightweight "enter the PIN once per session"
 * gate; leaving APP_PIN unset preserves the previous open-access behavior
 * exactly, so this is fully opt-in and never breaks an existing deployment.
 *
 * The PIN itself lives only in the APP_PIN env var (never sent to the
 * client, never logged). Comparison uses a constant-time check so response
 * timing can't be used to brute-force it digit-by-digit.
 *
 * TOKEN-BASED (not cookie-based) auth: successful verification returns a
 * signed, self-contained bearer token in the JSON response body. The
 * frontend stores it (localStorage) and sends it back as
 * `Authorization: Bearer <token>` on every /api/* request — see
 * installApiBaseUrl.ts. This deliberately avoids the session-cookie
 * approach used previously: mobile browsers (Chrome in particular) block
 * third-party/cross-site cookies (SameSite=None) by default whenever the
 * frontend and backend live on two different Railway domains, which made
 * the PIN "stick" on the entry screen but silently fail to authorize every
 * subsequent /api/* call. A bearer token in a normal header has no
 * cross-site cookie policy to run into, so it works the same whether
 * frontend and backend share an origin or not.
 *
 * The token is a signed HMAC, not a database-backed session, so there's
 * nothing to store server-side and nothing to prune — it's simply valid
 * until it expires or the signing secret changes.
 */

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOKEN_MARKER = "pin-verified";

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

function verifyToken(token: string | undefined | null): boolean {
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

function extractBearerToken(req: import("express").Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function isPinConfigured(): boolean {
  return !!process.env["APP_PIN"];
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

    const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
    if (!pin) {
      res.status(400).json({ ok: false, error: "PIN is required" });
      return;
    }

    if (pinMatches(pin)) {
      const token = issueToken();
      logger.info("auth: PIN verified — token issued");
      res.json({ ok: true, token });
    } else {
      logger.warn("auth: incorrect PIN attempt");
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
  // OAuth provider callbacks must be reachable without the app PIN bearer
  // token. The provider redirects the browser directly to these endpoints,
  // so it cannot attach our application Authorization header. Each callback
  // is independently protected by its OAuth state/code exchange.
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
