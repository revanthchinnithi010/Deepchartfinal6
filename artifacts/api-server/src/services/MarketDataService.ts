import { EventEmitter } from "events";
import { MarketFeedManager, type UnifiedTick } from "./MarketFeedManager.js";
import type { ProviderStats } from "./providers/BaseProvider.js";
import { BybitProvider } from "./providers/BybitProvider.js";
import { logger } from "../lib/logger.js";
import { marketSubscriptionBus } from "./marketSubscriptionBus.js";

export type { UnifiedTick as LatestTick };

const BYBIT_SYMBOL = "FARTCOINUSD";

export class MarketDataService extends EventEmitter {
  private feedManager: MarketFeedManager;
  private bybitProvider: BybitProvider;

  constructor() {
    super();
    this.feedManager = new MarketFeedManager();
    this.bybitProvider = new BybitProvider();

    this.bybitProvider.on("tick", (tick: UnifiedTick) => {
      // Inject Bybit ticks into the same unified pipeline used by Delta so the
      // chart, alerts and latest-tick cache do not need a second code path.
      this.feedManager.injectExternalTick(tick);
    });
    this.bybitProvider.on("connected", () => {
      this.emit("provider_status", { provider: "bybit", status: "connected" });
      this.emit("feed_status", { provider: "bybit", status: "connected" });
    });
    this.bybitProvider.on("disconnected", (info: { code?: number }) => {
      this.emit("provider_status", { provider: "bybit", status: "disconnected", ...info });
      this.emit("feed_status", { provider: "bybit", status: "disconnected", ...info });
    });
    this.bybitProvider.on("reconnecting", (info: { delay: number }) => {
      this.emit("provider_status", { provider: "bybit", status: "reconnecting", ...info });
      this.emit("feed_status", { provider: "bybit", status: "reconnecting", ...info });
    });
    this.bybitProvider.on("error", (err: Error) => {
      this.emit("provider_status", { provider: "bybit", status: "error", error: err.message });
    });

    marketSubscriptionBus.on("subscribe", (symbol: string) => {
      this.subscribe(symbol);
    });
  }

  async start(defaultSymbols: string[] = []): Promise<void> {
    this.feedManager.on("tick", (tick: UnifiedTick) => {
      this.emit("tick", tick);
    });

    this.feedManager.on("provider_status", (status: { provider: string; status: string }) => {
      this.emit("provider_status", status);
      this.emit("feed_status", status);
    });

    this.feedManager.on("subscription_update", (update: unknown) => {
      this.emit("subscription_update", update);
    });

    // FARTCOINUSD is intentionally removed from the Delta startup list. Its
    // live trade stream is sourced exclusively from Bybit for this test.
    const deltaSymbols = defaultSymbols.filter(s => s.toUpperCase() !== BYBIT_SYMBOL);
    await this.feedManager.start(deltaSymbols);

    if (defaultSymbols.some(s => s.toUpperCase() === BYBIT_SYMBOL)) {
      this.bybitProvider.subscribe(BYBIT_SYMBOL);
      this.bybitProvider.connect();
      logger.info({ symbol: BYBIT_SYMBOL }, "MarketDataService: FARTCOINUSD routed to Bybit");
    }

    logger.info({ symbols: defaultSymbols, deltaSymbols, bybit: defaultSymbols.includes(BYBIT_SYMBOL) }, "MarketDataService: started");
  }

  subscribe(symbol: string): boolean {
    const s = symbol.toUpperCase().trim();
    if (s === BYBIT_SYMBOL) {
      this.bybitProvider.subscribe(s);
      if (!this.bybitProvider.isConnected()) this.bybitProvider.connect();
      this.emit("subscription_update", { symbol: s, action: "subscribed", provider: "bybit" });
      logger.info({ symbol: s }, "MarketDataService: routed live subscription to Bybit");
      return true;
    }
    return this.feedManager.subscribe(s);
  }

  unsubscribe(symbol: string): boolean {
    const s = symbol.toUpperCase().trim();
    if (s === BYBIT_SYMBOL) {
      this.bybitProvider.unsubscribe(s);
      this.emit("subscription_update", { symbol: s, action: "unsubscribed", provider: "bybit" });
      return true;
    }
    return this.feedManager.unsubscribe(s);
  }

  getLatestTick(symbol: string): UnifiedTick | undefined { return this.feedManager.getLatestTick(symbol); }
  getAllLatestTicks(): Record<string, UnifiedTick> { return this.feedManager.getAllLatestTicks(); }
  getTickHistory(symbol: string): UnifiedTick[] { return this.feedManager.getTickHistory(symbol); }
  getSubscriptions(): string[] {
    const subscriptions = this.feedManager.getSubscriptions();
    return this.bybitProvider.getStats().subscriptions.includes(BYBIT_SYMBOL)
      ? [...subscriptions, BYBIT_SYMBOL]
      : subscriptions;
  }
  getSupportedSymbols(): string[] { return [...this.feedManager.getSupportedSymbols(), BYBIT_SYMBOL]; }
  getProviderStats(): ProviderStats[] { return [...this.feedManager.getProviderStats(), this.bybitProvider.getStats()]; }
  getFeedManagerStats() { return this.feedManager.getFeedManagerStats(); }
  getProviderForSymbol(symbol: string): string | undefined {
    return symbol.toUpperCase().trim() === BYBIT_SYMBOL ? "bybit" : this.feedManager.getProviderForSymbol(symbol);
  }
  isConnected(): boolean { return this.feedManager.isAnyConnected() || this.bybitProvider.isConnected(); }
  isFeedEnabled(): boolean { return this.feedManager.isFeedEnabled() || this.bybitProvider.isConnected(); }

  enableDelta(symbols: string[]): void { this.feedManager.enableDelta(symbols.filter(s => s.toUpperCase() !== BYBIT_SYMBOL)); }
  disableDelta(): void { this.feedManager.disableDelta(); }

  injectExternalTick(tick: UnifiedTick): void { this.feedManager.injectExternalTick(tick); }
  getSymbolService() { return this.feedManager.symbolService; }
  getDiagnostics() { return this.feedManager.getDiagnostics(); }

  stop(): void {
    this.bybitProvider.destroy();
    this.feedManager.stop();
  }
}
