import type { BrokerPosition } from "@/types/broker";
import type { TickState } from "@/store/tickStore";
import { classifyBrokerForSymbol } from "@/lib/brokerClassification";

/**
 * Resolves the tickStore key for a broker position's symbol.
 * cTrader symbols (NAS100, GBPJPY, XAUUSD, ...) are used as-is; crypto
 * symbols get the USDT/PERP-stripping + "USD" suffix normalization.
 */
export function tickKeyForPosition(symbol: string): string {
  return classifyBrokerForSymbol(symbol) === "ctrader"
    ? symbol
    : symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
}

/**
 * Live, tick-driven unrealized PnL for a single open position — uses the
 * latest tickStore price instead of the position's last-polled `markPrice`,
 * falling back to `markPrice` when no tick has arrived yet.
 */
export function livePnlForPosition(pos: BrokerPosition, ticks: Record<string, TickState>): number {
  const livePrice = ticks[tickKeyForPosition(pos.symbol)]?.price ?? pos.markPrice;
  return pos.side === "Long"
    ? (livePrice - pos.entryPrice) * pos.size
    : (pos.entryPrice - livePrice) * pos.size;
}

/**
 * Sums live unrealized PnL across a list of open positions. Falls back to
 * `fallbackUSD` (e.g. the balance snapshot's `unrealisedPnl`) when there are
 * no open positions to sum — the balance may still carry PnL from a source
 * other than the currently-open positions list.
 */
export function liveUnrealizedPnlUSD(
  positions: BrokerPosition[],
  ticks: Record<string, TickState>,
  fallbackUSD: number,
): number {
  return positions.length > 0
    ? positions.reduce((sum, pos) => sum + livePnlForPosition(pos, ticks), 0)
    : fallbackUSD;
}
