/**
 * symbolRegistry.ts — single source of truth for non-crypto (cTrader) symbols.
 *
 * Both the Markets page and the Chart Symbol Selector (MobileChartLayout MarketWatchlistSheet)
 * import from here so the two surfaces always show identical symbol lists.
 */

export interface RegistryEntry {
  symbol:       string;
  name:         string;
  contractType: string;
}

export const REGISTRY_FOREX: RegistryEntry[] = [
  { symbol: "EURUSD", name: "EUR/USD", contractType: "forex" },
  { symbol: "GBPUSD", name: "GBP/USD", contractType: "forex" },
  { symbol: "USDJPY", name: "USD/JPY", contractType: "forex" },
  { symbol: "AUDUSD", name: "AUD/USD", contractType: "forex" },
  { symbol: "USDCHF", name: "USD/CHF", contractType: "forex" },
];

export const REGISTRY_METALS: RegistryEntry[] = [
  { symbol: "XAUUSD", name: "XAU/USD", contractType: "metal" },
  { symbol: "XAGUSD", name: "XAG/USD", contractType: "metal" },
];

export const REGISTRY_COMMODITIES: RegistryEntry[] = [
  { symbol: "USOIL",  name: "US Oil",  contractType: "commodity" },
  { symbol: "UKOIL",  name: "UK Oil",  contractType: "commodity" },
  { symbol: "NATGAS", name: "Nat Gas", contractType: "commodity" },
];

export const REGISTRY_INDICES: RegistryEntry[] = [
  { symbol: "US30",   name: "US 30",   contractType: "index" },
  { symbol: "NAS100", name: "NAS100",  contractType: "index" },
  { symbol: "US500",  name: "S&P 500", contractType: "index" },
  { symbol: "GER40",  name: "GER 40",  contractType: "index" },
  { symbol: "UK100",  name: "UK 100",  contractType: "index" },
];

/** Flat list of all non-crypto symbols, in display order */
export const ALL_NON_CRYPTO: RegistryEntry[] = [
  ...REGISTRY_FOREX,
  ...REGISTRY_METALS,
  ...REGISTRY_COMMODITIES,
  ...REGISTRY_INDICES,
];

/** Quick lookup: symbol string → registry entry */
export const REGISTRY_MAP: Record<string, RegistryEntry> = Object.fromEntries(
  ALL_NON_CRYPTO.map(e => [e.symbol, e]),
);
