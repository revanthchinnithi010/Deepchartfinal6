/**
 * marketSession.ts — detect whether a symbol's market is currently open.
 *
 * Forex / metals / oil (24/5 markets):
 *   Opens:  Sunday 22:00 UTC  (Wellington / Sydney pre-open)
 *   Closes: Friday 22:00 UTC  (New York session end)
 *   Closed: Saturday all day + Sunday before 22:00 UTC
 *
 * Equity indices (simplified weekday session):
 *   Open Mon–Fri 00:00–22:00 UTC (covers EU + US cash sessions)
 *
 * Crypto: always open (24/7/365).
 */
import { useEffect, useRef, useState } from "react";

// ── Symbol classification ──────────────────────────────────────────────────────

export type MarketType = "forex" | "crypto" | "index" | "commodity" | "other";

const MARKET_TYPES: Record<string, MarketType> = {
  // Forex pairs — 24/5, forex session hours
  EURUSD: "forex", GBPUSD: "forex", GBPJPY: "forex",
  USDJPY: "forex", AUDUSD: "forex", USDCAD: "forex",
  NZDUSD: "forex", USDCHF: "forex", EURGBP: "forex",
  EURJPY: "forex", AUDCAD: "forex", CADJPY: "forex",
  AUDNZD: "forex", EURCHF: "forex", GBPAUD: "forex",
  // Metals & energy — also 24/5, same session as forex
  XAUUSD: "commodity", XAGUSD: "commodity",
  USOIL:  "commodity", UKOIL:  "commodity",
  // Equity indices — weekday broad session
  NAS100: "index", US30: "index", SPX500: "index", DE40: "index",
  // Crypto — always open
  BTCUSD:  "crypto", ETHUSD:   "crypto", SOLUSD:   "crypto",
  DOGEUSD: "crypto", PEPEUSD:  "crypto", XRPUSD:   "crypto",
  BNBUSD:  "crypto", ADAUSD:   "crypto", AVAXUSD:  "crypto",
  LTCUSD:  "crypto", LINKUSD:  "crypto", DOTUSD:   "crypto",
  FARTCOINUSD: "crypto",
};

export function getSymbolMarketType(symbol: string): MarketType {
  const s = symbol.toUpperCase();
  if (s in MARKET_TYPES) return MARKET_TYPES[s];
  // Any symbol ending in "USD" that isn't an explicitly-listed forex/index/
  // commodity ticker is a Delta Exchange crypto perpetual (this app's
  // trading venue names them exactly "<COIN>USD", e.g. BTCUSD, JTOUSD,
  // SOLUSD). This must run BEFORE the 6-char forex heuristic below —
  // 3-letter coin tickers like JTO, SOL, ADA all produce exactly 6-char
  // "<COIN>USD" symbols, which used to fall through to the forex regex
  // and get misclassified as a forex pair. A misclassified crypto symbol
  // is treated as closed on weekends/off-hours (real forex behavior),
  // even though Delta crypto perpetuals trade 24/7 — showing an incorrect
  // "Market Closed" banner on an actually-live market.
  if (s.endsWith("USD") && s.length >= 5) return "crypto";
  // 6-char all-alpha heuristic → treat as forex pair (e.g. EURJPY, GBPAUD)
  if (/^[A-Z]{6}$/.test(s)) return "forex";
  return "other";
}

// ── Session detection ──────────────────────────────────────────────────────────

/**
 * Forex / metals / oil open window:
 *   Sunday 22:00 UTC → Friday 22:00 UTC
 */
export function isForexSessionOpen(now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  const hm  = now.getUTCHours() + now.getUTCMinutes() / 60;

  if (day === 6) return false;              // Saturday: always closed
  if (day === 0 && hm < 22) return false;   // Sunday before 22:00: closed
  if (day === 5 && hm >= 22) return false;  // Friday after 22:00: closed
  return true;
}

/**
 * Equity index open window: Mon–Fri 00:00–22:00 UTC.
 */
export function isIndexSessionOpen(now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  return now.getUTCHours() < 22;
}

/** True when the given symbol's market is currently open. */
export function isMarketOpen(symbol: string): boolean {
  switch (getSymbolMarketType(symbol)) {
    case "crypto":    return true;
    case "forex":
    case "commodity": return isForexSessionOpen();
    case "index":     return isIndexSessionOpen();
    default:          return true;
  }
}

// ── React hook ─────────────────────────────────────────────────────────────────

export interface MarketSession {
  isOpen: boolean;
  type:   MarketType;
}

/**
 * Reactive hook — returns live market session status.
 * Re-evaluates every 60 s and immediately on symbol change.
 */
export function useMarketSession(symbol: string): MarketSession {
  const type = getSymbolMarketType(symbol);
  const [isOpen, setIsOpen] = useState(() => isMarketOpen(symbol));

  useEffect(() => {
    const check = () => setIsOpen(isMarketOpen(symbol));
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [symbol]);

  return { isOpen, type };
}
