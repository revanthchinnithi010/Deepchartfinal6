import type { ConnectionStatus } from "@/types/broker";
import type { PortfolioBrokerId } from "@/lib/brokerClassification";

/**
 * Normalized per-broker account snapshot consumed by the Portfolio account
 * cards and the combined portfolio store. All monetary fields are in USD —
 * conversion to the display currency is broker-specific (see `toINR`).
 */
export interface AccountSnapshot {
  brokerId: PortfolioBrokerId;
  label: string;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;

  availableBalanceUSD: number;
  marginUsedUSD: number;
  unrealizedPnlUSD: number;
  realizedPnlUSD: number;
  accountValueUSD: number;

  /** Converts a USD amount to INR using this broker's conversion rule. */
  toINR: (usd: number) => number;
  /** Short label describing the conversion rule (shown in the UI). */
  rateLabel: string;
}
