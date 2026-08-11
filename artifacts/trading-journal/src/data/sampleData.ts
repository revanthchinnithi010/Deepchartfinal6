// ── Market Data Provider routing ──────────────────────────────────────────────
// Crypto assets              →  Delta Exchange WebSocket
// Forex / Indices / Metals / Commodities  →  cTrader ProtoOA

export const DELTA_ASSETS    = ["BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "PEPEUSD", "BNBUSD"];
export const CTRADER_ASSETS  = ["NAS100", "US30", "US500", "EURUSD", "XAUUSD", "USOIL"];

export const PROVIDER_MAP: Record<string, "Delta Exchange" | "cTrader"> = {
  BTCUSD: "Delta Exchange", ETHUSD: "Delta Exchange", SOLUSD: "Delta Exchange",
  DOGEUSD: "Delta Exchange", PEPEUSD: "Delta Exchange", BNBUSD: "Delta Exchange",
  NAS100: "cTrader", US30: "cTrader", US500: "cTrader",
  EURUSD: "cTrader", XAUUSD: "cTrader", USOIL: "cTrader",
};

// Broker display info (name → visual identity)
export const BROKER_INFO: Record<string, { color: string; short: string }> = {
  "Delta Exchange": { color: "#f97316", short: "DEX" },
  "FusionMarkets":  { color: "#3b82f6", short: "FM"  },
  "Groww":          { color: "#14b8a6", short: "GW"  },
};

// Broker attribution (which broker executed the trade)
export const BROKER_MAP: Record<string, string> = {
  // Delta Exchange — crypto-only
  BTCUSD: "Delta Exchange", ETHUSD: "Delta Exchange", SOLUSD: "Delta Exchange",
  DOGEUSD: "Delta Exchange", PEPEUSD: "Delta Exchange", BNBUSD: "Delta Exchange",
  // FusionMarkets — forex, commodities, indices (market data via cTrader)
  EURUSD: "FusionMarkets", "Crude Oil": "FusionMarkets",
  NAS100: "FusionMarkets", US30: "FusionMarkets", US500: "FusionMarkets",
  XAUUSD: "FusionMarkets",
};

export const TV_LINKS: Record<string, string> = {
  NAS100: "https://www.tradingview.com/chart/?symbol=CAPITALCOM%3ANAS100",
  US30: "https://www.tradingview.com/chart/?symbol=CAPITALCOM%3ADJI",
  US500: "https://www.tradingview.com/chart/?symbol=CAPITALCOM%3ASP500",
  XAUUSD: "https://www.tradingview.com/chart/?symbol=OANDA%3AXAUUSD",
  BTCUSD: "https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSD",
  ETHUSD: "https://www.tradingview.com/chart/?symbol=BINANCE%3AETHUSD",
  SOLUSD: "https://www.tradingview.com/chart/?symbol=BINANCE%3ASOLUSDT",
  EURUSD: "https://www.tradingview.com/chart/?symbol=OANDA%3AEURUSD",
  "Crude Oil": "https://www.tradingview.com/chart/?symbol=NYMEX%3ACL1%21",
};

export const SETUP_TAG_OPTIONS: string[] = [
  "Breakout", "Trend", "HOD/LOD", "VWAP", "EMA Bounce",
  "Support/Resistance", "Gap Fill", "Momentum", "Reversal", "Scalp",
];

export const MISTAKE_TAG_OPTIONS: string[] = [
  "Revenge Trade", "FOMO Entry", "No Stop Loss", "Early Exit",
  "Overleverage", "Poor Entry", "Wrong Direction", "News Ignorance",
];

export const ASSET_CATEGORIES: Record<string, string[]> = {
  Indices:     ["NAS100", "US30", "US500"],
  Forex:       ["EURUSD"],
  Commodities: ["XAUUSD", "Crude Oil"],
  Crypto:      ["BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "PEPEUSD", "BNBUSD"],
};

export const ALL_SYMBOLS = Object.values(ASSET_CATEGORIES).flat();

export const BROKER_OPTIONS = ["Delta Exchange", "FusionMarkets", "Groww"] as const;
export type BrokerOption = typeof BROKER_OPTIONS[number];
