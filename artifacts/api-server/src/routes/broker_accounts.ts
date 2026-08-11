import { Router } from "express";
import { pool } from "@workspace/db";
import { encrypt } from "../services/BrokerEncryption.js";
import { validateDeltaCredentials } from "../services/deltaAuth.js";
import { MT5TradingAdapter } from "../brokers/MT5TradingAdapter.js";
import { BrokerService } from "../brokers/BrokerService.js";
import { randomBytes } from "crypto";

const router = Router();

router.get("/broker-accounts", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, broker_id, label, is_active, created_at,
              COALESCE(meta->>'ws_url',   '') AS ws_url,
              COALESCE(meta->>'base_url', '') AS base_url,
              COALESCE(meta->>'env_name', '') AS env_name
       FROM broker_accounts ORDER BY created_at DESC`,
    );
    res.json({ ok: true, accounts: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.post("/broker-accounts", async (req, res) => {
  const {
    broker_id,
    label = "",
    api_key,
    api_secret,
    mt5_server,
    mt5_login,
    mt5_password,
  } = req.body as {
    broker_id?: string;
    label?: string;
    api_key?: string;
    api_secret?: string;
    mt5_server?: string;
    mt5_login?: string;
    mt5_password?: string;
  };

  if (!broker_id) {
    res.status(400).json({ ok: false, error: "broker_id is required" });
    return;
  }

  let apiKeyValue: string;
  let apiSecretValue: string;
  let metaValue: Record<string, unknown> = {};

  if (broker_id === "mt5") {
    if (!mt5_server || !mt5_login || !mt5_password) {
      res.status(400).json({
        ok: false,
        error: "mt5_server, mt5_login, and mt5_password are required for MT5",
      });
      return;
    }
    apiKeyValue   = `${mt5_server.trim()}||${mt5_login.trim()}`;
    apiSecretValue = mt5_password;
  } else if (broker_id === "delta") {
    if (!api_key || !api_secret) {
      res.status(400).json({ ok: false, error: "api_key and api_secret are required for Delta Exchange" });
      return;
    }
    apiKeyValue   = api_key.trim();
    apiSecretValue = api_secret.trim();
    metaValue = { auth_mode: "api_key" };
  } else {
    if (!api_key || !api_secret) {
      res.status(400).json({ ok: false, error: "api_key and api_secret are required" });
      return;
    }
    apiKeyValue   = api_key.trim();
    apiSecretValue = api_secret.trim();
  }

  let connected = false;
  let connectionError = "";
  let usdtBalance: string | undefined;

  try {
    if (broker_id === "delta") {
      const result = await validateDeltaCredentials(apiKeyValue, apiSecretValue);
      connected = result.valid;
      if (result.valid) {
        usdtBalance = result.usdtBalance;
        // Store the detected environment so every subsequent call uses the right endpoint
        metaValue = {
          auth_mode: "api_key",
          base_url:  result.restBase,
          ws_url:    result.wsUrl,
          env_name:  result.envName,
        };
      } else {
        connectionError = result.error ?? "Connection test failed";
      }
    } else if (broker_id === "mt5") {
      const adapter = new MT5TradingAdapter(apiKeyValue, apiSecretValue);
      connected = await adapter.testConnection();
      if (!connected && !process.env["MT5_GATEWAY_URL"]) {
        res.status(400).json({
          ok: false,
          error: "MT5_GATEWAY_URL is not configured. Set this environment variable to your MT5 bridge URL.",
        });
        return;
      }
    } else {
      res.status(400).json({ ok: false, error: `Unsupported broker: ${broker_id}` });
      return;
    }
  } catch (err) {
    connected = false;
    connectionError = String(err);
  }

  if (!connected) {
    const hint =
      broker_id === "delta"
        ? connectionError || "Delta credentials invalid — verify your API Key and Secret on delta.exchange or india.delta.exchange"
        : broker_id === "mt5"
        ? "MT5 connection failed — check gateway URL, server, login, and password"
        : "Connection test failed — check your API key and secret";
    res.status(401).json({ ok: false, error: hint });
    return;
  }

  try {
    const apiKeyEnc    = encrypt(apiKeyValue);
    const apiSecretEnc = encrypt(apiSecretValue);
    const apiToken     = randomBytes(32).toString("hex");

    const existing = await pool.query(
      `SELECT id FROM broker_accounts WHERE broker_id=$1`,
      [broker_id],
    );

    if (existing.rows.length > 0) {
      const existingId = existing.rows[0].id as number;
      BrokerService.evict(existingId);
      await pool.query(
        `UPDATE broker_accounts SET api_key_enc=$1, api_secret_enc=$2, label=$3, is_active=true, api_token=$4, meta=$5
         WHERE id=$6`,
        [apiKeyEnc, apiSecretEnc, label, apiToken, JSON.stringify(metaValue), existingId],
      );
      const updated = await pool.query(
        `SELECT id, broker_id, label, is_active, created_at FROM broker_accounts WHERE id=$1`,
        [existingId],
      );
      res.json({ ok: true, account: updated.rows[0], api_token: apiToken, usdtBalance });
      return;
    }

    const result = await pool.query(
      `INSERT INTO broker_accounts (broker_id, label, api_key_enc, api_secret_enc, api_token, is_active, meta)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, broker_id, label, is_active, created_at`,
      [broker_id, label, apiKeyEnc, apiSecretEnc, apiToken, JSON.stringify(metaValue)],
    );
    res.json({ ok: true, account: result.rows[0], api_token: apiToken, usdtBalance });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.delete("/broker-accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"]!, 10);
    BrokerService.evict(id);
    await pool.query(`DELETE FROM broker_accounts WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export { router as brokerAccountsRouter };
