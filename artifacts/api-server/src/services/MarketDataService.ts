import { EventEmitter } from "events";
import { MarketFeedManager, type UnifiedTick } from "./MarketFeedManager.js";
import type { ProviderStats } from "./providers/BaseProvider.js";
import { logger } from "../lib/logger.js";

export type { UnifiedTick as LatestTick };

export class MarketDataService extends EventEmitter {
  private feedManager: MarketFeedManager;

  constructor() {
    super();
    this.feedManager = new MarketFeedManager();
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

    await this.feedManager.start(defaultSymbols);
    logger.info({ symbols: defaultSymbols }, "MarketDataService: started");
  }

  subscribe(symbol: string): boolean   { return this.feedManager.subscribe(symbol); }
  unsubscribe(symbol: string): boolean { return this.feedManager.unsubscribe(symbol); }

  getLatestTick(symbol: string): UnifiedTick | undefined { return this.feedManager.getLatestTick(symbol); }
  getAllLatestTicks(): Record<string, UnifiedTick>        { return this.feedManager.getAllLatestTicks(); }
  getTickHistory(symbol: string): UnifiedTick[]          { return this.feedManager.getTickHistory(symbol); }
  getSubscriptions(): string[]                           { return this.feedManager.getSubscriptions(); }
  getSupportedSymbols(): string[]                        { return this.feedManager.getSupportedSymbols(); }
  getProviderStats(): ProviderStats[]                    { return this.feedManager.getProviderStats(); }
  getFeedManagerStats()                                  { return this.feedManager.getFeedManagerStats(); }
  getProviderForSymbol(symbol: string): string | undefined { return this.feedManager.getProviderForSymbol(symbol); }
  isConnected(): boolean                                 { return this.feedManager.isAnyConnected(); }
  isFeedEnabled(): boolean                               { return this.feedManager.isFeedEnabled(); }

  enableDelta(symbols: string[]): void                   { this.feedManager.enableDelta(symbols); }
  disableDelta(): void                                   { this.feedManager.disableDelta(); }

  /** Forward a tick from an external engine (cTrader) into this service's event stream. */
  injectExternalTick(tick: UnifiedTick): void            { this.feedManager.injectExternalTick(tick); }

  getSymbolService()                                     { return this.feedManager.symbolService; }
  getDiagnostics()                                       { return this.feedManager.getDiagnostics(); }

  stop(): void { this.feedManager.stop(); }
}
