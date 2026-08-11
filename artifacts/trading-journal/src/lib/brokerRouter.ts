/**
 * brokerRouter.ts — single source of truth for symbol→broker routing.
 *
 * Every symbol belongs to exactly one broker:
 *   - Delta Exchange  → crypto perpetuals (BTCUSD, ETHUSD, SOLUSD, …)
 *   - cTrader         → forex, indices, metals, commodities (EURUSD, NAS100, XAUUSD, …)
 *
 * Keep CTRADER_SYMBOL_SET in sync with api-server/src/routes/candles.ts CTRADER_SYMBOLS.
 * The backend already routes candles using the same logic.
 */

export type ResolvedBroker = "delta" | "ctrader";

/** All symbols routed to cTrader. Covers forex majors/minors, metals, energy, global indices. */
const CTRADER_SYMBOL_SET = new Set<string>([
  // ── Forex majors ──────────────────────────────────────────────────────────
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  // ── Forex minors / crosses ────────────────────────────────────────────────
  "EURGBP", "EURJPY", "EURAUD", "EURCAD", "EURCHF", "EURNZD",
  "GBPJPY", "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD",
  "AUDJPY", "AUDCAD", "AUDCHF", "AUDNZD",
  "CADJPY", "CADCHF", "CHFJPY", "NZDJPY", "NZDCAD", "NZDCHF",
  "EURCZK", "EURHUF", "EURPLN", "EURTRY",
  "USDHUF", "USDMXN", "USDNOK", "USDSEK", "USDDKK", "USDTRY",
  "USDPLN", "USDCZK", "USDZAR", "USDRUB", "USDSGD", "USDHKD",
  // ── Metals & commodities ──────────────────────────────────────────────────
  "XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD",
  "USOIL", "UKOIL", "NATGAS", "BRENTOIL",
  "COPPER", "ALUMINIUM",
  // ── Global equity indices ─────────────────────────────────────────────────
  "NAS100", "US30", "US500", "SPX500", "DOW30",
  "GER40", "DE40", "UK100", "JP225", "AUS200",
  "FRA40", "EUSTX50", "SPA35", "ESP35",
  "HK50", "CHINA50", "SING30",
  "SWISS20", "NETH25", "ITAL40",
  "NDX100", "USDIDX", "GBPIDX",
]);

/**
 * Pattern-based fallback for index symbols not in the explicit set.
 * Catches common styles like US30, GER40, NAS100, UK100, JP225, AUS200.
 */
function matchesCtraderPattern(s: string): boolean {
  // Standard index abbreviation + number (e.g. US30, GER40, UK100, JP225)
  if (/^(US|NAS|NDX|UK|GER|DE|AUS|JPN?|FRA|SPA|ESP|HK|SG|IT|CH|DK|NO|SE|FI|NL|EU)\d+$/.test(s)) return true;
  // Continuous futures notation (e.g. CL1!, GC1!, NG1!)
  if (s.endsWith("!")) return true;
  // 6-char forex pair that is all letters (no digits) — AAABBB
  if (/^[A-Z]{6}$/.test(s) && !s.endsWith("USD")) return true;
  return false;
}

/**
 * Resolves which broker owns a given symbol.
 *
 * Deterministic — based purely on symbol string, no runtime state.
 * This is the canonical routing function; every feature must use it.
 */
export function resolveBroker(symbol: string): ResolvedBroker {
  const s = symbol.toUpperCase().trim();
  if (CTRADER_SYMBOL_SET.has(s) || matchesCtraderPattern(s)) return "ctrader";
  return "delta";
}

/** Convenience predicates */
export const isDeltaSymbol   = (symbol: string): boolean => resolveBroker(symbol) === "delta";
export const isCtraderSymbol = (symbol: string): boolean => resolveBroker(symbol) === "ctrader";

/**
 * Human-readable broker label for UI display.
 * "delta" → "Delta Exchange"
 * "ctrader" → "cTrader"
 */
export function brokerLabel(broker: ResolvedBroker): string {
  return broker === "delta" ? "Delta Exchange" : "cTrader";
}
