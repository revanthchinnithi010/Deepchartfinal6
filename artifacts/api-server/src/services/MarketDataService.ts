import { EventEmitter } from "events";
import { MarketFeedManager, type UnifiedTick } from "./MarketFeedManager.js";
import type { ProviderStats } from "./providers/BaseProvider.js";
import { BybitProvider } from "./providers/BybitProvider.js";
import { logger } from "../lib/logger.js";
import { marketSubscriptionBus } from "./marketSubscriptionBus.js";

export type { UnifiedTick as LatestTick };

function isCryptoSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase().trim().replace(/\.(pro|raw|ecn|std)$/i, "");
  if (!/^[A-Z0-9]{2,12}(USD|USDT)$/.test(s)) return false;
  const base = s.endsWith("USDT") ? s.slice(0, -4) : s.slice(0, -3);
  const nonCrypto = new Set([
    "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNH", "HKD", "SGD",
    "NOK", "SEK", "DKK", "PLN", "CZK", "HUF", "ZAR", "MXN", "TRY", "ILS",
    "AED", "SAR", "THB", "INR", "XAU", "XAG", "XPT", "XPD",
    "USOIL", "UKOIL", "NATGAS", "WTI", "BRENT",
    "US500", "SPX500", "NAS100", "US30", "GER40", "DE40", "UK100",
    "JP225", "AUS200", "FRA40", "EU50", "HK50", "STOXX50",
  ]);
  return !nonCrypto.has(base);
}

export class MarketDataService extends EventEmitter {
  private feedManager: MarketFeedManager;
  private bybitProvider: BybitProvider;

  constructor() {
    super();
    this.feedManager = new MarketFeedManager();
    // Keep one dedicated Bybit linear feed for ALL crypto symbols. This avoids
    // crypto charts being dependent on the generic multi-provider router.
    this.bybitProvider = new BybitProvider();

    this.bybitProvider.on("tick", (tick: UnifiedTick) => {
      // All Bybit crypto trades enter the same unified pipeline used by the
      // rest of the application, so candles, alerts and live-price UI share
      // one canonical tick stream.
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

    // Non-crypto symbols stay on their normal Delta/provider routing.
    // Crypto symbols are handled exclusively by the dedicated Bybit provider.
    const nonCryptoSymbols = defaultSymbols.filter(s => !isCryptoSymbol(s));
    await this.feedManager.start(nonCryptoSymbols);

    const cryptoSymbols = defaultSymbols.filter(isCryptoSymbol);
    for (const symbol of cryptoSymbols) this.bybitProvider.subscribe(symbol);

    // Always bring up the Bybit transport during server startup. Persistent
    // watchlist restoration and browser subscriptions can happen after startup;
    // an already-open transport avoids a startup race where the frontend sees
    // "offline" before the first symbol subscription arrives.
    this.bybitProvider.connect();

    logger.info(
      { symbols: defaultSymbols, nonCryptoSymbols, cryptoSymbols },
      "MarketDataService: started",
    );
  }

  subscribe(symbol: string): boolean {
    const s = symbol.toUpperCase().trim();

    if (isCryptoSymbol(s)) {
      const accepted = this.bybitProvider.subscribe(s);
      if (!this.bybitProvider.isConnected()) this.bybitProvider.connect();
      if (accepted) {
        this.emit("subscription_update", { symbol: s, action: "subscribed", provider: "bybit" });
        logger.info({ symbol: s }, "MarketDataService: routed crypto live subscription to dedicated Bybit feed");
      }
      return accepted;
    }

    return this.feedManager.subscribe(s);
  }

  unsubscribe(symbol: string): boolean {
    const s = symbol.toUpperCase().trim();

    if (isCryptoSymbol(s)) {
      const accepted = this.bybitProvider.unsubscribe(s);
      if (accepted) {
        this.emit("subscription_update", { symbol: s, action: "unsubscribed", provider: "bybit" });
      }
      return accepted;
    }

    return this.feedManager.unsubscribe(s);
  }

  getLatestTick(symbol: string): UnifiedTick | undefined {
    return this.feedManager.getLatestTick(symbol);
  }

  getAllLatestTicks(): Record<string, UnifiedTick> {
    return this.feedManager.getAllLatestTicks();
  }

  getTickHistory(symbol: string): UnifiedTick[] {
    return this.feedManager.getTickHistory(symbol);
  }

  getSubscriptions(): string[] {
    const subscriptions = this.feedManager.getSubscriptions();
    const cryptoSubscriptions = this.bybitProvider.getStats().subscriptions;
    return [...new Set([...subscriptions, ...cryptoSubscriptions])];
  }

  getSupportedSymbols(): string[] {
    return [...new Set([...this.feedManager.getSupportedSymbols(), ...this.bybitProvider.supportedSymbols])];
  }

  getProviderStats(): ProviderStats[] {
    // The generic feed manager also owns a Bybit provider instance, but crypto
    // subscriptions are intentionally isolated to this dedicated provider.
    return [...this.feedManager.getProviderStats(), this.bybitProvider.getStats()];
  }

  getFeedManagerStats() {
    return this.feedManager.getFeedManagerStats();
  }

  getProviderForSymbol(symbol: string): string | undefined {
    return isCryptoSymbol(symbol) ? "bybit" : this.feedManager.getProviderForSymbol(symbol);
  }

  isConnected(): boolean {
    return this.feedManager.isAnyConnected() || this.bybitProvider.isConnected();
  }

  isFeedEnabled(): boolean {
    return this.feedManager.isFeedEnabled() || this.bybitProvider.isConnected();
  }

  enableDelta(symbols: string[]): void {
    this.feedManager.enableDelta(symbols.filter(s => !isCryptoSymbol(s)));
  }

  disableDelta(): void {
    this.feedManager.disableDelta();
  }

  injectExternalTick(tick: UnifiedTick): void {
    this.feedManager.injectExternalTick(tick);
  }

  getSymbolService() {
    return this.feedManager.symbolService;
  }

  getDiagnostics() {
    return this.feedManager.getDiagnostics();
  }

  stop(): void {
    this.bybitProvider.destroy();
    this.feedManager.stop();
  }
}
