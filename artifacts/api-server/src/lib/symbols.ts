/**
 * Canonical alert-eligible symbol list shared by all three alert route
 * validators (alerts, zones, trendlines) AND the frontend SYMBOLS list in
 * alertsData.ts.
 *
 * Crypto symbols use the plain "USD" suffix (BTCUSD, ETHUSD, …) because
 * that is the internal symbol name the Delta Exchange provider emits in tick
 * events (confirmed via live logs).  The MarketFeedManager translates to the
 * exchange's "USDT" pair only when subscribing; the symbol stored in
 * latestTicks and emitted as tick.symbol remains the short form.  Using the
 * same name end-to-end means zone.symbol === tick.symbol in evaluateZones().
 */
export const ALERT_SYMBOLS = [
  // Indices
  "NAS100", "US30",
  // Metals / Forex
  "XAUUSD", "EURUSD", "GBPJPY",
  // Commodities
  "USOIL", "UKOIL",
  // Crypto — plain USD suffix, matches tick.symbol from Delta provider
  "BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "PEPEUSD",
] as const;

export type AlertSymbol = (typeof ALERT_SYMBOLS)[number];
