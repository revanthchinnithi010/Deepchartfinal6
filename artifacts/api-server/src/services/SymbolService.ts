import { logger } from "../lib/logger.js";

export type SymbolCategory = "perpetual" | "future" | "option" | "spot" | "other";

export interface SymbolInfo {
  symbol:       string;
  name:         string;
  contractType: string;
  category:     SymbolCategory;
  broker:       string;
  underlying:   string;
  quoteAsset:   string;
  active:       boolean;
}

interface DeltaProduct {
  symbol:           string;
  description?:     string;
  contract_type:    string;
  trading_status:   string;
  underlying_asset?: { symbol: string };
  settling_asset?:  { symbol: string };
}

const DELTA_INDIA_REST = "https://api.india.delta.exchange";
const CACHE_TTL_MS = 10 * 60 * 1_000;

// Delta contract_type → normalized category
const CONTRACT_CATEGORY: Record<string, SymbolCategory> = {
  perpetual_futures: "perpetual",
  futures:           "future",
  call_options:      "option",
  put_options:       "option",
  move_options:      "option",
  spot:              "spot",
};

// Include these contract types in the catalog
const INCLUDED_TYPES = new Set([
  "perpetual_futures",
  "futures",
]);

interface DeltaCacheEntry {
  symbols:   SymbolInfo[];
  fetchedAt: number;
}

export class SymbolService {
  private deltaCache:    DeltaCacheEntry | null = null;
  private fetchPromise:  Promise<SymbolInfo[]>  | null = null;

  async getDeltaSymbols(forceRefresh = false): Promise<SymbolInfo[]> {
    if (!forceRefresh && this.deltaCache && Date.now() - this.deltaCache.fetchedAt < CACHE_TTL_MS) {
      logger.debug({ count: this.deltaCache.symbols.length }, "SymbolService: Delta India cache hit");
      return this.deltaCache.symbols;
    }

    if (this.fetchPromise) {
      logger.debug("SymbolService: waiting for in-flight Delta India fetch");
      return this.fetchPromise;
    }

    this.fetchPromise = this._fetchDeltaIndia().finally(() => {
      this.fetchPromise = null;
    });

    return this.fetchPromise;
  }

  private async _fetchDeltaIndia(): Promise<SymbolInfo[]> {
    logger.info("SymbolService: fetching Delta India product catalog");
    try {
      const url = `${DELTA_INDIA_REST}/v2/products?states=live`;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: {
          "Accept": "application/json",
          "User-Agent": "TradeVault/1.0",
        },
      });

      if (!resp.ok) {
        throw new Error(`Delta India REST returned HTTP ${resp.status}`);
      }

      const body = await resp.json() as { result?: DeltaProduct[]; success?: boolean };
      const products: DeltaProduct[] = Array.isArray(body.result) ? body.result : [];

      const symbols: SymbolInfo[] = products
        .filter(p =>
          INCLUDED_TYPES.has(p.contract_type) &&
          p.trading_status === "operational" &&
          p.symbol,
        )
        .map(p => ({
          symbol:       p.symbol,
          name:         p.description ?? p.symbol,
          contractType: p.contract_type,
          category:     CONTRACT_CATEGORY[p.contract_type] ?? "other",
          broker:       "delta",
          underlying:   p.underlying_asset?.symbol ?? p.symbol.replace(/USDT?$/, ""),
          quoteAsset:   p.settling_asset?.symbol ?? "USDT",
          active:       true,
        }))
        // Sort: perpetuals first (by name), then futures (by name)
        .sort((a, b) => {
          if (a.category !== b.category) {
            const order: SymbolCategory[] = ["perpetual", "future", "option", "spot", "other"];
            return order.indexOf(a.category) - order.indexOf(b.category);
          }
          return a.symbol.localeCompare(b.symbol);
        });

      logger.info({ count: symbols.length }, "SymbolService: Delta India symbols loaded");

      this.deltaCache = { symbols, fetchedAt: Date.now() };
      return symbols;
    } catch (err) {
      logger.error({ err }, "SymbolService: failed to fetch Delta India symbols — returning cached or fallback");

      if (this.deltaCache) return this.deltaCache.symbols;

      return this._fallbackDeltaSymbols();
    }
  }

  private _fallbackDeltaSymbols(): SymbolInfo[] {
    logger.warn("SymbolService: using hardcoded Delta India fallback symbols (API unreachable)");
    const fallback = [
      "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
      "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
      "LINKUSDT", "LTCUSDT", "UNIUSDT", "ATOMUSDT", "NEARUSDT",
    ];
    return fallback.map(sym => ({
      symbol:       sym,
      name:         sym,
      contractType: "perpetual_futures",
      category:     "perpetual" as SymbolCategory,
      broker:       "delta",
      underlying:   sym.replace(/USDT?$/, ""),
      quoteAsset:   "USDT",
      active:       true,
    }));
  }

  async getAllSymbols(): Promise<{ delta: SymbolInfo[] }> {
    const delta = await this.getDeltaSymbols();
    return { delta };
  }
}
