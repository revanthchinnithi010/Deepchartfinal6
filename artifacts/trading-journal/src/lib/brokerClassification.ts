/**
 * Best-effort symbol → broker classification.
 *
 * Trades/positions from the trade journal API do not carry a broker id, so we
 * infer it from the traded symbol: crypto perpetuals are always Delta
 * Exchange, everything else (forex/indices/commodities) is cTrader. This
 * mirrors the BROKER_MAP convention already used on the Dashboard.
 */
const DELTA_CRYPTO_BASES = [
  "BTC", "ETH", "SOL", "DOGE", "PEPE", "BNB",
  "XRP", "ADA", "LTC", "AVAX", "MATIC", "DOT", "LINK", "UNI", "ATOM",
];

export type PortfolioBrokerId = "delta" | "ctrader";

export function classifyBrokerForSymbol(symbol: string | undefined | null): PortfolioBrokerId {
  const s = (symbol ?? "").toUpperCase();
  return DELTA_CRYPTO_BASES.some(base => s.startsWith(base)) ? "delta" : "ctrader";
}
