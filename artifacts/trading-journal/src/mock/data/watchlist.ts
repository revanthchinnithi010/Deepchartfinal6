import { createRng, range } from "../rng";

export type MockMarket = "Crypto" | "Forex" | "Indices" | "Commodities";

export interface MockWatchlistRow {
  id: number;
  symbol: string;
  provider: string;
  position: number;
  isFavorite: boolean;
  createdAt: string;
  price: number;
  changePercent: number;
}

// NOTE: crypto symbols must match Delta Exchange India's real perpetual
// product symbols (no "USDT" suffix — Delta India perpetuals are USD-quoted,
// e.g. "BTCUSD" not "BTCUSDT") so these rows line up with the live tick feed
// broadcast by the backend. Using invented symbols here silently breaks live
// prices on the Markets page even when the real feed is healthy.
const INSTRUMENTS: Array<{ symbol: string; market: MockMarket; base: number }> = [
  { symbol: "BTCUSD",   market: "Crypto",      base: 64842 },
  { symbol: "ETHUSD",   market: "Crypto",      base: 3378 },
  { symbol: "SOLUSD",   market: "Crypto",      base: 145.6 },
  { symbol: "BNBUSD",   market: "Crypto",      base: 612.4 },
  { symbol: "XRPUSD",   market: "Crypto",      base: 0.612 },
  { symbol: "DOGEUSD",  market: "Crypto",      base: 0.1512 },
  { symbol: "EURUSD",   market: "Forex",       base: 1.0912 },
  { symbol: "GBPUSD",   market: "Forex",       base: 1.2718 },
  { symbol: "USDJPY",   market: "Forex",       base: 158.42 },
  { symbol: "AUDUSD",   market: "Forex",       base: 0.6614 },
  { symbol: "USDCHF",   market: "Forex",       base: 0.8951 },
  { symbol: "NAS100",   market: "Indices",     base: 18451.6 },
  { symbol: "US30",     market: "Indices",     base: 39680.2 },
  { symbol: "SPX500",   market: "Indices",     base: 5482.3 },
  { symbol: "GER40",    market: "Indices",     base: 18320.5 },
  { symbol: "XAUUSD",   market: "Commodities", base: 2345.8 },
  { symbol: "XAGUSD",   market: "Commodities", base: 29.42 },
  { symbol: "UKOIL",    market: "Commodities", base: 84.6 },
  { symbol: "USOIL",    market: "Commodities", base: 81.2 },
];

const rng = createRng(20260710);

export const MOCK_WATCHLIST_ROWS: MockWatchlistRow[] = INSTRUMENTS.map((inst, i) => ({
  id: 5000 + i,
  symbol: inst.symbol,
  provider: inst.market === "Crypto" ? "delta" : "ctrader",
  position: i,
  isFavorite: i < 4,
  createdAt: "2026-06-01T00:00:00Z",
  price: Math.round(inst.base * (1 + range(rng, -0.001, 0.001)) * 10000) / 10000,
  changePercent: Math.round(range(rng, -3.2, 3.2) * 100) / 100,
}));

export const MOCK_SYMBOL_STATS = INSTRUMENTS.slice(0, 10).map((inst, i) => ({
  symbol: inst.symbol,
  pnl: Math.round(range(rng, -320, 480) * 100) / 100,
  trades: 3 + Math.floor(rng() * 12),
  winRate: Math.round(range(rng, 42, 82) * 10) / 10,
}));
