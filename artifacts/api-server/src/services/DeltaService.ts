import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { MarketDataService } from "./MarketDataService.js";

const KEY_CONNECTED  = "delta_connected";
const KEY_API_KEY    = "delta_api_key";
const KEY_API_SECRET = "delta_api_secret";

const DELTA_SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "PEPEUSD"];

export type DeltaStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "reconnecting"
  | "error";

function maskSecret(s: string): string {
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

async function dbSet(key: string, value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}

async function dbDel(key: string): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.key, key));
}

async function dbGet(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

export class DeltaService {
  private status: DeltaStatus = "disconnected";
  private apiKey: string | undefined;
  private apiSecret: string | undefined;
  private tickCount   = 0;
  private reconnectCount = 0;
  private lastTickAt: number | null = null;

  constructor(private marketData: MarketDataService) {
    marketData.on("tick", (tick: { provider?: string }) => {
      if (tick.provider === "delta") {
        this.tickCount++;
        this.lastTickAt = Date.now();
      }
    });

    marketData.on("provider_status", (s: { provider: string; status: string }) => {
      if (s.provider !== "delta") return;
      if (s.status === "connected")    this.status = "connected";
      if (s.status === "disconnected") this.status = "disconnected";
      if (s.status === "reconnecting") { this.status = "reconnecting"; this.reconnectCount++; }
      if (s.status === "error")        this.status = "error";
    });
  }

  async init(): Promise<void> {
    try {
      const [connected, storedKey, storedSecret] = await Promise.all([
        dbGet(KEY_CONNECTED),
        dbGet(KEY_API_KEY),
        dbGet(KEY_API_SECRET),
      ]);

      // Replit Secrets take priority; fall back to DB-stored keys
      const envKey    = process.env["DELTA_API_KEY"]    || undefined;
      const envSecret = process.env["DELTA_API_SECRET"] || undefined;

      this.apiKey    = envKey    ?? storedKey    ?? undefined;
      this.apiSecret = envSecret ?? storedSecret ?? undefined;

      if (envKey && envSecret) {
        logger.info("DeltaService: credentials found in Replit Secrets — auto-connecting");
        this._enableFeed();
      } else if (connected === "true") {
        logger.info("DeltaService: restoring previous connection from DB");
        this._enableFeed();
      } else {
        logger.info("DeltaService: not previously connected — waiting for manual connect");
      }
    } catch (err) {
      logger.warn({ err }, "DeltaService: init error");
    }
  }

  async connect(apiKey?: string, apiSecret?: string): Promise<{ success: boolean; error?: string }> {
    if (apiKey)    this.apiKey    = apiKey;
    if (apiSecret) this.apiSecret = apiSecret;

    try {
      await dbSet(KEY_CONNECTED, "true");
      if (apiKey)    await dbSet(KEY_API_KEY,    apiKey);
      if (apiSecret) await dbSet(KEY_API_SECRET, apiSecret);
    } catch (err) {
      logger.warn({ err }, "DeltaService: could not persist state");
    }

    this.tickCount      = 0;
    this.reconnectCount = 0;
    this._enableFeed();

    return { success: true };
  }

  async disconnect(): Promise<void> {
    try {
      await Promise.all([dbDel(KEY_CONNECTED), dbDel(KEY_API_KEY), dbDel(KEY_API_SECRET)]);
    } catch (err) {
      logger.warn({ err }, "DeltaService: error clearing DB state");
    }

    this.apiKey    = undefined;
    this.apiSecret = undefined;
    this.status    = "disconnected";
    this.tickCount = 0;
    this.marketData.disableDelta();
    logger.info("DeltaService: disconnected");
  }

  async test(): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
    if (this.status !== "connected" && this.status !== "reconnecting") {
      return { success: false, error: "Not connected — click Connect first" };
    }
    const latencyMs = this.lastTickAt ? Date.now() - this.lastTickAt : null;
    return { success: true, latencyMs: latencyMs ?? undefined };
  }

  getStatus(): {
    connected: boolean;
    status: DeltaStatus;
    apiKeyMasked: string | null;
    apiSecretMasked: string | null;
    tickCount: number;
    reconnectCount: number;
    lastTickAgo: number | null;
    symbols: string[];
  } {
    return {
      connected:       this.status === "connected" || this.status === "reconnecting",
      status:          this.status,
      apiKeyMasked:    this.apiKey    ? maskSecret(this.apiKey)    : null,
      apiSecretMasked: this.apiSecret ? maskSecret(this.apiSecret) : null,
      tickCount:       this.tickCount,
      reconnectCount:  this.reconnectCount,
      lastTickAgo:     this.lastTickAt ? Date.now() - this.lastTickAt : null,
      symbols:         DELTA_SYMBOLS,
    };
  }

  private _enableFeed(): void {
    this.status = "connecting";
    this.marketData.enableDelta(DELTA_SYMBOLS);
  }
}
