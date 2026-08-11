import { BrokerAdapter } from "./BrokerAdapter.js";
import { DeltaTradingAdapter, type DeltaAuthMode } from "./DeltaTradingAdapter.js";
import { BybitTradingAdapter } from "./BybitTradingAdapter.js";
import { MT5TradingAdapter } from "./MT5TradingAdapter.js";
import { pool } from "@workspace/db";
import { decrypt, EncryptionKeyMissingError } from "../services/BrokerEncryption.js";

interface CachedAdapter {
  adapter: BrokerAdapter;
  accountId: number;
  lastUsed: number;
}

class BrokerServiceSingleton {
  private cache = new Map<number, CachedAdapter>();
  private static TTL_MS = 5 * 60 * 1000;

  async getAdapter(accountId: number, apiToken: string): Promise<BrokerAdapter> {
    const cached = this.cache.get(accountId);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.adapter;
    }

    const row = await this.fetchAndVerify(accountId, apiToken);
    const adapter = this.createAdapter(row.broker_id, row.api_key, row.api_secret, row.meta);
    this.cache.set(accountId, { adapter, accountId, lastUsed: Date.now() });
    this.scheduleEviction();
    return adapter;
  }

  evict(accountId: number): void {
    const cached = this.cache.get(accountId);
    if (cached) {
      cached.adapter.disconnect();
      this.cache.delete(accountId);
    }
  }

  private async fetchAndVerify(
    accountId: number,
    apiToken: string,
  ): Promise<{ broker_id: string; api_key: string; api_secret: string; meta: Record<string, unknown> }> {
    const result = await pool.query(
      `SELECT broker_id, api_key_enc, api_secret_enc, api_token, meta FROM broker_accounts WHERE id = $1`,
      [accountId],
    );
    if (result.rows.length === 0) throw new Error("Broker account not found");
    const row = result.rows[0] as {
      broker_id: string;
      api_key_enc: string;
      api_secret_enc: string;
      api_token: string;
      meta: Record<string, unknown> | null;
    };

    if (row.api_token !== apiToken) throw new Error("Invalid broker account token");

    return {
      broker_id:  row.broker_id,
      api_key:    decrypt(row.api_key_enc),
      api_secret: decrypt(row.api_secret_enc),
      meta:       row.meta ?? {},
    };
  }

  private createAdapter(
    brokerId: string,
    apiKey: string,
    apiSecret: string,
    meta: Record<string, unknown>,
  ): BrokerAdapter {
    if (brokerId === "delta") {
      const authMode  = (meta["auth_mode"]  as DeltaAuthMode | undefined) ?? "api_key";
      const baseOrigin = typeof meta["base_url"] === "string"
        ? meta["base_url"]
        : "https://api.delta.exchange";
      return new DeltaTradingAdapter(apiKey, apiSecret, authMode, baseOrigin);
    }
    if (brokerId === "bybit") return new BybitTradingAdapter(apiKey, apiSecret);
    if (brokerId === "mt5")   return new MT5TradingAdapter(apiKey, apiSecret);
    throw new Error(`Unknown broker: ${brokerId}`);
  }

  private scheduleEviction(): void {
    setTimeout(() => {
      const now = Date.now();
      for (const [id, entry] of this.cache) {
        if (now - entry.lastUsed > BrokerServiceSingleton.TTL_MS) {
          entry.adapter.disconnect();
          this.cache.delete(id);
        }
      }
    }, BrokerServiceSingleton.TTL_MS + 1000);
  }
}

export const BrokerService = new BrokerServiceSingleton();

export async function getBrokerAdapter(
  req: import("express").Request,
  res: import("express").Response,
): Promise<{ adapter: BrokerAdapter; brokerId: string } | null> {
  const accountIdStr = req.headers["x-broker-account-id"] as string;
  const apiToken     = req.headers["x-broker-token"] as string;

  if (!accountIdStr || !apiToken) {
    res.status(400).json({ ok: false, error: "X-Broker-Account-Id and X-Broker-Token headers required" });
    return null;
  }

  const accountId = parseInt(accountIdStr, 10);
  if (isNaN(accountId) || accountId <= 0) {
    res.status(400).json({ ok: false, error: "Invalid X-Broker-Account-Id" });
    return null;
  }

  try {
    const adapter = await BrokerService.getAdapter(accountId, apiToken);
    return { adapter, brokerId: adapter.brokerId };
  } catch (err) {
    if (err instanceof EncryptionKeyMissingError) {
      res.status(503).json({
        ok: false,
        error:
          "Broker credential encryption is not configured. " +
          "Set BROKER_ENCRYPTION_KEY in Replit Secrets (Tools → Secrets) and redeploy.",
      });
    } else {
      const msg = String(err);
      if (msg.includes("not found") || msg.includes("Invalid")) {
        res.status(403).json({ ok: false, error: "Broker account access denied" });
      } else if (
        msg.includes("decryption failed") ||
        msg.includes("BrokerEncryption") ||
        msg.includes("Invalid key length")
      ) {
        res.status(401).json({
          ok: false,
          error:
            "Cannot decrypt stored credentials — the encryption key changed or is missing. " +
            "Set BROKER_ENCRYPTION_KEY in Replit Secrets (Tools → Secrets), then reconnect " +
            "your broker account to re-encrypt with the current key.",
        });
      } else {
        res.status(500).json({ ok: false, error: msg });
      }
    }
    return null;
  }
}
