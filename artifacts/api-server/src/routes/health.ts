import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import type { DeltaService } from "../services/DeltaService.js";
import type { TelegramService } from "../services/TelegramService.js";
import type { WSManager } from "../ws/WSManager.js";

const DB_CACHE_TTL_MS = 30_000;
let cachedDbResult: { connected: boolean; latencyMs: number | null } | null = null;
let cacheExpiry = 0;

async function probeDb(): Promise<{ connected: boolean; latencyMs: number | null }> {
  const now = Date.now();
  if (cachedDbResult && now < cacheExpiry) return cachedDbResult;
  try {
    const t0 = Date.now();
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    cachedDbResult = { connected: true, latencyMs: Date.now() - t0 };
  } catch {
    cachedDbResult = { connected: false, latencyMs: null };
  }
  cacheExpiry = Date.now() + DB_CACHE_TTL_MS;
  return cachedDbResult;
}

export function createHealthRouter(deps: {
  delta: DeltaService;
  telegram: TelegramService;
  wsManager: WSManager;
}): IRouter {
  const router: IRouter = Router();

  router.get("/", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/health", async (_req, res) => {
    const db = await probeDb();
    const deltaInfo   = deps.delta.getStatus();
    const telegramOk  = deps.telegram.isEnabled();

    res.json({
      status: db.connected ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      database: { connected: db.connected, latencyMs: db.latencyMs },
      delta:    { status: deltaInfo.status },
      telegram: { enabled: telegramOk },
    });
  });

  router.get("/ws-status", (_req, res) => {
    res.json({
      clients: deps.wsManager.getClientCount(),
      uptimeSeconds: process.uptime(),
    });
  });

  router.get("/db-status", async (_req, res) => {
    const db = await probeDb();
    res.json(db);
  });

  return router;
}
