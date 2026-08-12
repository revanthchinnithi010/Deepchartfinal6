import type { MarketDataService } from "./MarketDataService.js";
import type { WSManager } from "../ws/WSManager.js";
import type { TelegramService } from "./TelegramService.js";
import type { ProviderStats } from "./providers/BaseProvider.js";
import { logger } from "../lib/logger.js";

const STALE_THRESHOLD_MS = 60_000;
const HEALTH_BROADCAST_INTERVAL_MS = 10_000;
const STARTUP_GRACE_MS = 120_000;

export interface SymbolHealth {
  symbol: string;
  provider: string;
  lastTickAt: number | null;
  lastPrice: number | null;
  isStale: boolean;
  staleSinceMs: number | null;
  neverReceived: boolean;
}

export interface FeedHealth {
  feedConnected: boolean;
  feedEnabled: boolean;
  lastUpdatedAt: number;
  symbols: Record<string, SymbolHealth>;
  staleCount: number;
  activeCount: number;
  providers: ProviderStats[];
}

export class FeedHealthMonitor {
  private lastTickAt: Map<string, number> = new Map();
  private lastPrice: Map<string, number> = new Map();
  private feedConnectedAt: number | null = null;
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private staleAlertSent: Set<string> = new Set();

  constructor(
    private marketData: MarketDataService,
    private wsManager: WSManager,
    private telegram: TelegramService,
  ) {}

  start(): void {
    this.marketData.on("tick", (tick: { symbol: string; price: number; receivedAt: number }) => {
      this.lastTickAt.set(tick.symbol, tick.receivedAt);
      this.lastPrice.set(tick.symbol, tick.price);
    });

    this.marketData.on("feed_status", (status: { status: string }) => {
      if (status.status === "connected" && this.feedConnectedAt === null) {
        this.feedConnectedAt = Date.now();
      }
    });

    this.broadcastTimer = setInterval(() => {
      const health = this.getHealth();
      this.wsManager.broadcast({ type: "feed_health", ...health });
      this.checkStaleAlerts(health);
    }, HEALTH_BROADCAST_INTERVAL_MS);

    logger.info("FeedHealthMonitor: started");
  }

  stop(): void {
    if (this.broadcastTimer) { clearInterval(this.broadcastTimer); this.broadcastTimer = null; }
  }

  getHealth(): FeedHealth {
    const now = Date.now();
    const subscriptions = this.marketData.getSubscriptions();
    const symbolHealth: Record<string, SymbolHealth> = {};
    let staleCount = 0;
    let activeCount = 0;

    const inGracePeriod =
      this.feedConnectedAt !== null && now - this.feedConnectedAt < STARTUP_GRACE_MS;
    void inGracePeriod;

    for (const sym of subscriptions) {
      const lastAt = this.lastTickAt.get(sym) ?? null;
      const price = this.lastPrice.get(sym) ?? null;
      const neverReceived = lastAt === null;
      const provider = this.marketData.getProviderForSymbol(sym) ?? "unknown";

      // A cTrader spot subscription is not a continuous heartbeat. cTrader's
      // first spot event contains the latest quote and, when the market is
      // closed, the API may send only that single event. Therefore a missing
      // cTrader tick must NOT be treated as a broken feed or used to trigger a
      // Telegram stale-feed alert. Connection health is handled by the
      // dedicated cTrader engine status stream instead.
      const isCtrader = provider.toLowerCase() === "ctrader";
      const isStale = !isCtrader && !neverReceived && (now - lastAt!) > STALE_THRESHOLD_MS;
      const staleSinceMs = isStale ? now - lastAt! : null;

      symbolHealth[sym] = {
        symbol: sym,
        provider,
        lastTickAt: lastAt,
        lastPrice: price,
        isStale,
        staleSinceMs,
        neverReceived,
      };

      if (isStale) staleCount++;
      else if (!neverReceived) activeCount++;
    }

    return {
      feedConnected: this.marketData.isConnected(),
      feedEnabled: this.marketData.isFeedEnabled(),
      lastUpdatedAt: now,
      symbols: symbolHealth,
      staleCount,
      activeCount,
      providers: this.marketData.getProviderStats(),
    };
  }

  private checkStaleAlerts(health: FeedHealth): void {
    for (const [sym, sh] of Object.entries(health.symbols)) {
      // Never send symbol-level stale Telegram alerts for cTrader. A cTrader
      // spot stream can legitimately have no new tick for a period, including
      // when a market/session is closed. The dedicated cTrader connection
      // status is the correct signal for an actual feed outage.
      const isCtrader = sh.provider.toLowerCase() === "ctrader";
      if (isCtrader) {
        this.staleAlertSent.delete(sym);
        continue;
      }

      if (sh.isStale && !sh.neverReceived && !this.staleAlertSent.has(sym)) {
        this.staleAlertSent.add(sym);
        this.telegram
          .sendFeedAlert(`Symbol <b>${sym}</b> feed has gone stale — no tick received for over 60 seconds.`)
          .catch(() => {});
      } else if (!sh.isStale && this.staleAlertSent.has(sym)) {
        this.staleAlertSent.delete(sym);
      }
    }
  }
}
