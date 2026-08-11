import { EventEmitter } from "events";
import { BaseProvider, type ProviderTick, type ProviderStats } from "./providers/BaseProvider.js";
import { DeltaExchangeProvider, type DeltaSymbolEntry } from "./providers/DeltaExchangeProvider.js";
import { SymbolService } from "./SymbolService.js";
import { logger } from "../lib/logger.js";

const MAX_TICKS_PER_SYMBOL = 500;

export interface UnifiedTick extends ProviderTick {}

export interface FeedManagerStats {
  providers:           ProviderStats[];
  totalSymbols:        number;
  totalTicks:          number;
  allProvidersHealthy: boolean;
}

// ── Asset class classification ─────────────────────────────────────────────────
type AssetClass = "crypto" | "forex" | "metal" | "index" | "commodity" | "unknown";
type PriorityProvider = "delta";

const METALS      = new Set(["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"]);
const INDICES     = new Set([
  "US30", "NAS100", "SPX500", "GER40", "UK100", "JP225", "AUS200", "STOXX50",
  "HK50", "CN50", "USTECH", "USTEC", "US500", "US2000", "EU50",
  "DE40", "FR40", "IT40", "ES35", "CH20", "NETH25", "SE30",
]);
const COMMODITIES = new Set([
  "USOIL", "UKOIL", "NGAS", "COPPER", "WHEAT", "CORN", "SUGAR", "COFFEE",
  "COCOA", "COTTON", "SOYBEANS", "LUMBER",
]);
const FOREX_PAIRS = new Set([
  "EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF",
  "EURGBP","GBPJPY","EURJPY","EURAUD","GBPAUD","NZDUSD",
  "USDSGD","USDHKD","USDMXN","USDZAR","USDNOK","USDSEK",
  "AUDCAD","AUDCHF","AUDNZD","CADCHF","CADJPY","CHFJPY",
  "EURNZD","EURCAD","EURCHF","GBPCAD","GBPCHF","GBPNZD",
  "NZDCAD","NZDCHF","NZDJPY",
]);

function classifySymbol(symbol: string): AssetClass {
  const s = symbol.toUpperCase().replace(/\.(pro|raw|ecn|std)$/i, "");
  if (METALS.has(s))      return "metal";
  if (INDICES.has(s))     return "index";
  if (COMMODITIES.has(s)) return "commodity";
  if (FOREX_PAIRS.has(s)) return "forex";
  if (/^[A-Z0-9]{2,12}USDT$/.test(s)) return "crypto";
  if (/^[A-Z0-9]{2,8}USD$/.test(s) && !FOREX_PAIRS.has(s) && !METALS.has(s)) return "crypto";
  if (/^[A-Z]{6}$/.test(s)) return "forex";
  if (/^(US30|NAS|SPX|GER|UK1|JP2|AUS|DOW|DAX|CAC|FTSE|IBEX|DE4|FR4|IT4|ES3|EU5|CH2|SE3|NETH)/.test(s)) return "index";
  if (/^(OIL|GAS|WTI|BRENT|NGAS|USOIL|UKOIL|COPP|WHEAT|CORN|SUGAR|COFFEE|COCOA|COTTON)/.test(s)) return "commodity";
  return "unknown";
}

function priorityProviderFor(assetClass: AssetClass): PriorityProvider | null {
  if (assetClass === "crypto") return "delta";
  return null;
}

function routingReasonFor(assetClass: AssetClass, provider: PriorityProvider): string {
  switch (assetClass) {
    case "crypto": return "Crypto symbols always use Delta Exchange";
    default:       return `First available provider: ${provider}`;
  }
}

export const PROVIDER_METADATA: Record<string, { displayName: string; badge: string; color: string }> = {
  delta: { displayName: "Delta Exchange India", badge: "delta", color: "#8B5CF6" },
};

export class MarketFeedManager extends EventEmitter {
  private providers:         Map<string, BaseProvider>  = new Map();
  private latestTicks:       Map<string, UnifiedTick>   = new Map();
  private tickHistory:       Map<string, UnifiedTick[]> = new Map();
  private subscribedSymbols: Set<string>                = new Set();
  private symbolRouting:     Map<string, string>        = new Map();
  private routingReasons:    Map<string, string>        = new Map();
  private symbolClasses:     Map<string, AssetClass>    = new Map();
  private totalTicks = 0;

  readonly symbolService: SymbolService = new SymbolService();

  constructor() {
    super();
  }

  /**
   * Inject a tick from an external engine (e.g. cTrader) into the feed manager.
   * Updates the latest-tick cache and emits a "tick" event so all listeners
   * (including AlertEngine) see the price without needing a MarketFeedManager
   * provider subscription.
   */
  injectExternalTick(tick: UnifiedTick): void {
    this.latestTicks.set(tick.symbol, tick);
    const history = this.tickHistory.get(tick.symbol) ?? [];
    history.push(tick);
    if (history.length > MAX_TICKS_PER_SYMBOL) history.shift();
    this.tickHistory.set(tick.symbol, history);
    this.totalTicks++;
    this.emit("tick", tick);
  }

  async start(defaultSymbols: string[] = []): Promise<void> {
    this.buildStaticProviders();

    for (const sym of defaultSymbols) {
      this.subscribedSymbols.add(sym);
    }

    for (const [name, provider] of this.providers) {
      const symbolsForProvider = defaultSymbols.filter(s => this.symbolRouting.get(s) === name);
      this.wireProvider(provider);
      for (const sym of symbolsForProvider) provider.subscribe(sym);
      provider.connect();
    }

    logger.info(
      { providers: [...this.providers.keys()], symbols: defaultSymbols },
      "MarketFeedManager: started",
    );

    this._bootstrapDeltaIndia(defaultSymbols).catch(err =>
      logger.error({ err }, "MarketFeedManager: Delta India bootstrap error"),
    );
  }

  private async _bootstrapDeltaIndia(defaultSymbols: string[]): Promise<void> {
    try {
      const catalog = await this.symbolService.getDeltaSymbols();
      const entries: DeltaSymbolEntry[] = catalog.map(s => ({
        internalSymbol: s.symbol,
        deltaSymbol:    s.symbol,
      }));

      for (const { internalSymbol } of entries) {
        this._applyPriorityRoute(internalSymbol, "delta");
      }

      const deltaProvider = this.providers.get("delta");
      if (deltaProvider && deltaProvider instanceof DeltaExchangeProvider) {
        deltaProvider.refreshSymbols(entries);
        logger.info({ count: entries.length }, "MarketFeedManager: Delta India symbol map refreshed");
        for (const sym of defaultSymbols) {
          if (this.symbolRouting.get(sym) === "delta") deltaProvider.subscribe(sym);
        }
      } else {
        const delta = new DeltaExchangeProvider(entries);
        this.wireProvider(delta);
        this.providers.set("delta", delta);
        for (const sym of defaultSymbols) {
          if (this.symbolRouting.get(sym) === "delta") delta.subscribe(sym);
        }
        delta.connect();
        logger.info({ count: entries.length }, "MarketFeedManager: Delta India provider created with full catalog");
      }
    } catch (err) {
      logger.error({ err }, "MarketFeedManager: failed to bootstrap Delta India catalog");
    }
  }

  private _applyPriorityRoute(symbol: string, candidateProvider: "delta"): boolean {
    const s          = symbol.toUpperCase();
    const cls        = classifySymbol(s);
    const priority   = priorityProviderFor(cls);
    this.symbolClasses.set(s, cls);

    if (priority !== null && priority !== candidateProvider) {
      logger.debug(
        { symbol: s, candidateProvider, priority, cls },
        "MarketFeedManager: routing blocked by priority rule",
      );
      return false;
    }

    const winner = priority ?? candidateProvider;
    const reason = priority
      ? routingReasonFor(cls, winner)
      : `First available provider: ${winner}`;

    this.symbolRouting.set(s, winner);
    this.routingReasons.set(s, reason);
    return true;
  }

  subscribe(symbol: string): boolean {
    const s        = symbol.toUpperCase();
    const cls      = classifySymbol(s);
    const priority = priorityProviderFor(cls);

    let providerName = this.symbolRouting.get(s);

    if (!providerName) {
      if (priority) {
        providerName = priority;
        this.symbolRouting.set(s, priority);
        this.symbolClasses.set(s, cls);
        this.routingReasons.set(s, routingReasonFor(cls, priority));
        logger.info({ symbol: s, providerName, cls }, "MarketFeedManager: priority-routed on subscribe");
      } else if (/^[A-Z0-9]+USDT?$/.test(s)) {
        providerName = "delta";
        this.symbolRouting.set(s, "delta");
        this.symbolClasses.set(s, "crypto");
        this.routingReasons.set(s, "Crypto symbols always use Delta Exchange");
        logger.info({ symbol: s }, "MarketFeedManager: auto-routed new crypto symbol → delta");
      } else {
        logger.debug({ symbol: s, cls }, "MarketFeedManager: no provider available for symbol");
        return false;
      }
    }

    this.subscribedSymbols.add(s);
    const provider = this.providers.get(providerName);
    if (!provider) {
      logger.debug({ symbol: s, providerName }, "MarketFeedManager: provider not yet active — subscription queued");
      return false;
    }
    provider.subscribe(s);
    this.emit("subscription_update", {
      symbol: s, action: "subscribed", provider: providerName,
      subscriptions: this.getSubscriptions(),
    });
    return true;
  }

  unsubscribe(symbol: string): boolean {
    const s = symbol.toUpperCase();
    if (!this.subscribedSymbols.has(s)) return false;
    const providerName = this.symbolRouting.get(s);
    if (providerName) this.providers.get(providerName)?.unsubscribe(s);
    this.subscribedSymbols.delete(s);
    this.emit("subscription_update", { symbol: s, action: "unsubscribed", subscriptions: this.getSubscriptions() });
    return true;
  }

  enableDelta(symbols: string[]): void {
    const existing = this.providers.get("delta");
    if (existing) { existing.destroy(); this.providers.delete("delta"); }

    const entries: DeltaSymbolEntry[] = symbols.map(sym => ({
      internalSymbol: sym,
      deltaSymbol:    sym.replace("USD", "USDT"),
    }));

    const delta = new DeltaExchangeProvider(entries);
    this.wireProvider(delta);
    this.providers.set("delta", delta);
    for (const sym of symbols) {
      this._applyPriorityRoute(sym, "delta");
      this.subscribedSymbols.add(sym);
      delta.subscribe(sym);
    }
    delta.connect();

    this.symbolService.getDeltaSymbols().then(catalog => {
      const fullEntries: DeltaSymbolEntry[] = catalog.map(s => ({
        internalSymbol: s.symbol,
        deltaSymbol:    s.symbol,
      }));
      delta.refreshSymbols(fullEntries);
      for (const { internalSymbol } of fullEntries) {
        this._applyPriorityRoute(internalSymbol, "delta");
      }
    }).catch(err => logger.error({ err }, "MarketFeedManager: Delta catalog refresh failed"));
  }

  disableDelta(): void {
    const existing = this.providers.get("delta");
    if (existing) {
      existing.destroy();
      this.providers.delete("delta");
      this.emit("provider_status", { provider: "delta", status: "disconnected" });
    }
  }

  getLatestTick(symbol: string): UnifiedTick | undefined  { return this.latestTicks.get(symbol); }
  getAllLatestTicks(): Record<string, UnifiedTick>         { return Object.fromEntries(this.latestTicks.entries()); }
  getTickHistory(symbol: string): UnifiedTick[]           { return this.tickHistory.get(symbol) ?? []; }
  getSubscriptions(): string[]                            { return [...this.subscribedSymbols]; }
  getSupportedSymbols(): string[]                         { return [...this.symbolRouting.keys()]; }
  getProviderForSymbol(symbol: string): string | undefined { return this.symbolRouting.get(symbol); }
  getProviderStats(): ProviderStats[]                     { return [...this.providers.values()].map(p => p.getStats()); }

  getFeedManagerStats(): FeedManagerStats {
    const stats = this.getProviderStats();
    return {
      providers:           stats,
      totalSymbols:        this.subscribedSymbols.size,
      totalTicks:          this.totalTicks,
      allProvidersHealthy: stats.every(s => s.status === "connected"),
    };
  }

  isAnyConnected(): boolean { return [...this.providers.values()].some(p => p.isConnected()); }
  isFeedEnabled(): boolean  { return this.providers.size > 0; }

  getDiagnostics() {
    const allTicks = this.getAllLatestTicks();
    const now      = Date.now();

    const perSymbol: Record<string, {
      provider:     string | undefined;
      assetClass:   string;
      routingReason: string;
      subscribed:   boolean;
      lastTickAt:   number | null;
      lastPrice:    number | null;
      lastTickAgo:  number | null;
      symbolId:     string | undefined;
    }> = {};

    for (const sym of this.symbolRouting.keys()) {
      const tick         = allTicks[sym];
      const providerName = this.symbolRouting.get(sym);
      const assetClass   = this.symbolClasses.get(sym) ?? classifySymbol(sym);
      const reason       = this.routingReasons.get(sym) ?? "Unknown";

      perSymbol[sym] = {
        provider:      providerName,
        assetClass,
        routingReason: reason,
        subscribed:    this.subscribedSymbols.has(sym),
        lastTickAt:    tick?.timestamp ?? null,
        lastPrice:     tick?.price    ?? null,
        lastTickAgo:   tick ? now - tick.timestamp : null,
        symbolId:      undefined,
      };
    }

    return {
      providers:     this.getProviderStats(),
      symbolRouting: Object.fromEntries(this.symbolRouting.entries()),
      perSymbol,
      subscriptions: [...this.subscribedSymbols],
      totalTicks:    this.totalTicks,
      ts:            now,
    };
  }

  stop(): void {
    for (const provider of this.providers.values()) provider.destroy();
    this.providers.clear();
  }

  private buildStaticProviders(): void {
    this.providers.set("delta", new DeltaExchangeProvider([]));
  }

  private wireProvider(provider: BaseProvider): void {
    provider.on("tick", (tick: ProviderTick) => {
      const unified: UnifiedTick = tick;
      this.latestTicks.set(tick.symbol, unified);
      this.totalTicks++;

      const history = this.tickHistory.get(tick.symbol) ?? [];
      history.push(unified);
      if (history.length > MAX_TICKS_PER_SYMBOL) history.shift();
      this.tickHistory.set(tick.symbol, history);

      this.emit("tick", unified);
    });

    provider.on("connected", () => {
      this.emit("provider_status", { provider: provider.name, status: "connected" });
    });
    provider.on("disconnected", (info: { code?: number }) => {
      this.emit("provider_status", { provider: provider.name, status: "disconnected", ...info });
    });
    provider.on("reconnecting", (info: { delay: number }) => {
      this.emit("provider_status", { provider: provider.name, status: "reconnecting", ...info });
    });
    provider.on("error", (err: Error) => {
      this.emit("provider_status", { provider: provider.name, status: "error", message: err.message });
    });
  }
}
