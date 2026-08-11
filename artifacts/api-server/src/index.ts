import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app.js";
import { WSManager } from "./ws/WSManager.js";
import { deltaSocketManager } from "./ws/deltaSocket.js";
import { MarketDataService } from "./services/MarketDataService.js";
import { CandleAggregator } from "./services/CandleAggregator.js";
import { TelegramService } from "./services/TelegramService.js";
import { DeltaService } from "./services/DeltaService.js";
import { AlertEngine } from "./services/AlertEngine.js";
import { FeedHealthMonitor } from "./services/FeedHealthMonitor.js";
import { runMigrations } from "./lib/migrate.js";
import { logger } from "./lib/logger.js";
import { AppConfigService } from "./services/AppConfigService.js";
import { ctraderTickEngine } from "./services/CtraderTickEngine.js";
import { autoStartCtraderEngine, subscribeWatchlistCtraderSymbols } from "./routes/ctrader_spots.js";
import type { CtraderTick } from "./services/CtraderTickEngine.js";
import type { EngineStatusPayload } from "./services/CtraderTickEngine.js";
import type { ProviderTick } from "./services/providers/BaseProvider.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const wsManager        = new WSManager();
deltaSocketManager.setWsManager(wsManager);
const marketData       = new MarketDataService();
const candleAggregator = new CandleAggregator();
const telegram         = new TelegramService();
const delta            = new DeltaService(marketData);
const alertEngine      = new AlertEngine(marketData, telegram, wsManager, candleAggregator);
const healthMonitor    = new FeedHealthMonitor(marketData, wsManager, telegram);

// Batch buffer: latest price per symbol — flushed every 5 s
const livePriceBatch = new Map<string, { price: number; provider: string }>();

marketData.on("tick", (tick: ProviderTick) => {
  wsManager.clearCandleCache();
  candleAggregator.ingestTick(tick);
  wsManager.broadcast({ type: "tick", ...tick });

  // Collect latest price for batch DB write
  livePriceBatch.set(tick.symbol, { price: tick.price, provider: tick.provider });
});

async function flushLivePrices(): Promise<void> {
  if (livePriceBatch.size === 0) return;
  const entries = [...livePriceBatch.entries()];
  livePriceBatch.clear();
  try {
    const { db: dbClient, livePricesTable } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    for (const [symbol, { price, provider }] of entries) {
      await dbClient
        .insert(livePricesTable)
        .values({ symbol, price, provider, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: livePricesTable.symbol,
          set: {
            price,
            provider,
            updatedAt: sql`NOW()`,
          },
        });
    }
  } catch (err) {
    logger.warn({ err }, "live_prices: batch flush error (non-fatal)");
  }
}

setInterval(() => { flushLivePrices().catch(() => {}); }, 5_000);

candleAggregator.on("candle_update", (update: { symbol: string; interval: string; bar: object }) => {
  wsManager.broadcastCandleUpdate(update.symbol, update.interval, update.bar);
});

marketData.on("feed_status", (status) => {
  wsManager.broadcast({ type: "feed_status", ...status });
});

marketData.on("provider_status", (status) => {
  wsManager.broadcast({ type: "provider_status", ...status });
});

marketData.on("subscription_update", (update) => {
  wsManager.broadcast({ type: "subscription_update", ...update });
});

// ── cTrader tick engine → AlertEngine + CandleAggregator + WebSocket broadcast ─
ctraderTickEngine.on("tick", (tick: CtraderTick) => {
  // Build a unified tick once and reuse it everywhere.
  const ctraderUnifiedTick: ProviderTick = {
    symbol:         tick.symbol,
    providerSymbol: tick.symbol,
    price:          tick.price,
    volume:         1,
    timestamp:      tick.timestamp,
    receivedAt:     Date.now(),
    provider:       "ctrader",
  };

  // ── FIX: forward into MarketDataService so AlertEngine evaluates zones ──
  // Previously cTrader ticks ONLY went to candleAggregator + wsManager.
  // AlertEngine listens exclusively to marketData.on("tick"), so any zone
  // whose symbol is served by cTrader never received a tick → evaluateZones()
  // was never called → zone Enter alerts never fired.
  marketData.injectExternalTick(ctraderUnifiedTick);

  wsManager.clearCandleCache();
  candleAggregator.ingestTick(ctraderUnifiedTick);

  wsManager.broadcast({
    type:     "ctrader_tick",
    symbol:   tick.symbol,
    symbolId: tick.symbolId,
    bid:      tick.bid,
    ask:      tick.ask,
    spread:   tick.spread,
    mid:      tick.mid,
    price:    tick.mid,
    timestamp: tick.timestamp,
    provider: "ctrader",
  });
});

ctraderTickEngine.on("status", (status: EngineStatusPayload) => {
  wsManager.broadcast({ type: "ctrader_status", ...status });
});

marketData.start([]).catch(err =>
  logger.error({ err }, "MarketDataService: async start error"),
);

const app    = createApp({ alertEngine, marketData, healthMonitor, telegram, delta, wsManager, candleAggregator });
const server = createServer(app);

server.on("upgrade", (req, socket, head) => {
  wsManager.handleUpgrade(req, socket as import("net").Socket, head);
});

healthMonitor.start();

(async () => {
  // Start listening FIRST so health checks succeed during migration/injection
  await new Promise<void>((resolve, reject) => {
    server.listen(port, (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        reject(err);
        process.exit(1);
      }
      logger.info({ port }, "Server listening — all feeds require manual connect via Settings");
      resolve();
    });
  });

  try {
    await runMigrations();
  } catch (err) {
    logger.error({ err }, "DB migration failed — services may have limited functionality");
  }

  await AppConfigService.injectToEnv();
  logger.info({
    DELTA_CLIENT_ID:        process.env["DELTA_CLIENT_ID"]        ? "SET" : "NOT SET",
    CTRADER_CLIENT_ID:      process.env["CTRADER_CLIENT_ID"]      ? `SET (${process.env["CTRADER_CLIENT_ID"]!.length} chars)` : "NOT SET ⚠️",
    CTRADER_CLIENT_SECRET:  process.env["CTRADER_CLIENT_SECRET"]  ? `SET (${process.env["CTRADER_CLIENT_SECRET"]!.length} chars)` : "NOT SET ⚠️",
  }, "Startup: credential injection complete — env status after inject");

  await Promise.all([
    telegram.init().then(() => {
      logger.info({ telegramEnabled: telegram.isEnabled() }, "TelegramService: init complete");
    }),
    delta.init().then(() => {
      logger.info("DeltaService: init complete");
    }),
  ]).catch((err) => {
    logger.warn({ err }, "Service init warning");
  });

  alertEngine.start().then(() => {
    logger.info("AlertEngine: started");
  }).catch((err) => {
    logger.error({ err }, "AlertEngine: failed to start");
  });

  // cTrader: auto-start (zero initial subscriptions), then subscribe watchlist symbols
  await autoStartCtraderEngine().catch((err) => {
    logger.warn({ err }, "cTrader auto-start: unexpected error (non-fatal)");
  });
  subscribeWatchlistCtraderSymbols().catch((err) => {
    logger.warn({ err }, "cTrader watchlist subscription: unexpected error (non-fatal)");
  });

  try {
    const { db: dbClient, watchlistTable } = await import("@workspace/db");
    const { asc } = await import("drizzle-orm");
    const items = await dbClient.select({ symbol: watchlistTable.symbol }).from(watchlistTable).orderBy(asc(watchlistTable.position));
    for (const { symbol } of items) {
      marketData.subscribe(symbol);
    }
    if (items.length > 0) {
      logger.info({ count: items.length }, "Startup: subscribed watchlist symbols");
    }
  } catch (err) {
    logger.warn({ err }, "Startup: could not subscribe watchlist symbols — non-fatal");
  }
})();

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  marketData.stop();
  alertEngine.stop().catch(() => {});
  healthMonitor.stop();
  flushLivePrices().catch(() => {}).finally(() => {
    server.close(() => process.exit(0));
  });
});
