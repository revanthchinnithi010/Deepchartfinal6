import { Router } from "express";
import { pool } from "@workspace/db";
import { AppConfigService, SUPPORTED_KEYS } from "../services/AppConfigService.js";
import { validateDeltaCredentials } from "../services/deltaAuth.js";
import { encrypt } from "../services/BrokerEncryption.js";
import { BrokerService } from "../brokers/BrokerService.js";
import { randomBytes } from "crypto";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/credentials/status", async (_req, res) => {
  try {
    const status = await AppConfigService.getStatus();
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.post("/credentials/import", async (req, res) => {
  const { credentials } = req.body as { credentials?: Record<string, string> };
  if (!credentials || typeof credentials !== "object") {
    res.status(400).json({ ok: false, error: "credentials object required" });
    return;
  }

  const saved: string[] = [];
  const failed: string[] = [];

  for (const key of SUPPORTED_KEYS) {
    const val = credentials[key];
    if (val && typeof val === "string" && val.trim()) {
      try {
        await AppConfigService.set(key, val.trim());
        saved.push(key);
      } catch (err) {
        logger.error({ err, key }, "credentials/import: failed to save");
        failed.push(key);
      }
    }
  }

  logger.info({ saved, failed }, "credentials/import complete");
  res.json({ ok: true, saved, failed });
});

router.delete("/credentials/:key", async (req, res) => {
  const key = req.params["key"]!;
  if (!(SUPPORTED_KEYS as readonly string[]).includes(key)) {
    res.status(400).json({ ok: false, error: "unsupported key" });
    return;
  }
  try {
    await AppConfigService.delete(key);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.post("/credentials/test/delta", async (_req, res) => {
  try {
    const apiKey =
      (await AppConfigService.get("DELTA_API_KEY")) ??
      process.env["DELTA_API_KEY"];
    const apiSecret =
      (await AppConfigService.get("DELTA_API_SECRET")) ??
      process.env["DELTA_API_SECRET"];
    if (!apiKey || !apiSecret) {
      res.json({ ok: false, error: "Delta credentials not imported" });
      return;
    }
    const result = await validateDeltaCredentials(apiKey, apiSecret);
    res.json({
      ok: result.valid,
      error: result.error,
      envName: result.envName,
      usdtBalance: result.usdtBalance,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.post("/credentials/test/telegram", async (_req, res) => {
  try {
    const token =
      (await AppConfigService.get("TELEGRAM_BOT_TOKEN")) ??
      process.env["TELEGRAM_BOT_TOKEN"];
    const chatId =
      (await AppConfigService.get("TELEGRAM_CHAT_ID")) ??
      process.env["TELEGRAM_CHAT_ID"];
    if (!token || !chatId) {
      res.json({ ok: false, error: "Telegram credentials not imported" });
      return;
    }
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getMe`,
    );
    const data = (await response.json()) as {
      ok: boolean;
      result?: { username?: string };
    };
    if (data.ok) {
      res.json({ ok: true, botName: data.result?.username });
    } else {
      res.json({ ok: false, error: "Invalid Telegram bot token" });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.post("/credentials/connect/delta", async (_req, res) => {
  try {
    const apiKey = await AppConfigService.get("DELTA_API_KEY");
    const apiSecret = await AppConfigService.get("DELTA_API_SECRET");

    if (!apiKey || !apiSecret) {
      res.status(400).json({
        ok: false,
        error: "Delta API credentials not imported. Upload a credentials file first.",
      });
      return;
    }

    const result = await validateDeltaCredentials(apiKey, apiSecret);
    if (!result.valid) {
      res.status(401).json({
        ok: false,
        error: result.error ?? "Delta credential validation failed",
      });
      return;
    }

    const meta = {
      auth_mode: "api_key",
      base_url: result.restBase,
      ws_url: result.wsUrl,
      env_name: result.envName,
    };

    const apiKeyEnc = encrypt(apiKey);
    const apiSecretEnc = encrypt(apiSecret);
    const apiToken = randomBytes(32).toString("hex");

    const existing = await pool.query(
      `SELECT id FROM broker_accounts WHERE broker_id='delta'`,
    );
    let accountId: number;

    if (existing.rows.length > 0) {
      accountId = existing.rows[0].id as number;
      BrokerService.evict(accountId);
      await pool.query(
        `UPDATE broker_accounts
         SET api_key_enc=$1, api_secret_enc=$2, label='Delta Exchange',
             is_active=true, api_token=$3, meta=$4
         WHERE id=$5`,
        [apiKeyEnc, apiSecretEnc, apiToken, JSON.stringify(meta), accountId],
      );
    } else {
      const insertResult = await pool.query(
        `INSERT INTO broker_accounts
           (broker_id, label, api_key_enc, api_secret_enc, api_token, is_active, meta)
         VALUES ('delta','Delta Exchange',$1,$2,$3,true,$4)
         RETURNING id`,
        [apiKeyEnc, apiSecretEnc, apiToken, JSON.stringify(meta)],
      );
      accountId = insertResult.rows[0].id as number;
    }

    logger.info({ accountId }, "credentials/connect/delta: connected");
    res.json({
      ok: true,
      accountId,
      apiToken,
      usdtBalance: result.usdtBalance,
      envName: result.envName,
    });
  } catch (err) {
    logger.error({ err }, "credentials/connect/delta failed");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export { router as credentialsRouter };
