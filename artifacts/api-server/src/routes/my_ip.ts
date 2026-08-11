import { Router } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * GET /api/my-ip
 *
 * Returns the outbound public IP address of this Replit backend server.
 * Use this IP for Delta Exchange India API key whitelisting — all exchange
 * requests originate from the backend, NOT from the user's browser.
 *
 * No-cache headers are set so every call fetches the latest IP
 * (important after redeploy, GitHub import, or account change).
 */
router.get("/my-ip", async (_req, res) => {
  logger.info("my-ip: fetching outbound public IP via api.ipify.org");

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "TradeVault/1.0" },
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "my-ip: ipify returned non-OK status");
      res.status(502).json({ error: `ipify returned HTTP ${response.status}` });
      return;
    }

    const data = await response.json() as { ip: string };
    const timestamp = new Date().toISOString();

    logger.info({ ip: data.ip, timestamp }, "my-ip: outbound IP detected");

    res.json({
      ip: data.ip,
      provider: "Replit",
      timestamp,
    });
  } catch (err) {
    const msg = String(err);
    const isTimeout = msg.includes("TimeoutError") || msg.includes("timeout");
    logger.error({ err: msg }, "my-ip: failed to fetch outbound IP");
    res.status(502).json({
      error: isTimeout
        ? "Request to ipify timed out — try again"
        : `Failed to detect IP: ${msg}`,
    });
  }
});

export { router as myIpRouter };
