import { useMemo } from "react";
import { useListTrades } from "@workspace/api-client-react";
import { useBrokerStore } from "./brokerStore";
import { useTickStore } from "./tickStore";
import { classifyBrokerForSymbol } from "@/lib/brokerClassification";
import { liveUnrealizedPnlUSD } from "@/lib/livePnl";
import type { AccountSnapshot } from "./accountTypes";
import type { BrokerPosition } from "@/types/broker";
import { toArray } from "@/lib/safeArray";

/** Delta Exchange always converts USD → INR at a fixed rate, per product spec. */
export const DELTA_FIXED_USD_INR_RATE = 85;

// Module-level stable reference for the "no positions yet" fallback.
//
// WHY THIS MATTERS: Zustand v5's `useStore(selector)` is built on React's
// `useSyncExternalStore`, which re-renders the component whenever the
// selector's return value differs by `Object.is` from the previous one.
// `s.brokerPositions["delta"] ?? []` used to allocate a BRAND NEW array
// literal every single time the selector ran (which is on every store
// notification AND on every render while `brokerStore`'s brokerPositions
// map has no "delta" entry yet — i.e. the common case before a broker is
// connected). `[] !== []`, so useSyncExternalStore saw a "changed" snapshot
// on literally every check, scheduled a re-render, ran the selector again,
// got yet another new `[]`, saw another "change" — an infinite synchronous
// render loop (React error #185 "Maximum update depth exceeded").
//
// Because this hook is called unconditionally by useCombinedPortfolio(),
// which Dashboard (a permanently-mounted keep-alive page — see App.tsx)
// calls on every render, the loop fires on initial load for any account
// with no open positions yet, well before the user ever navigates anywhere.
//
// Fix: fall back to this single shared, never-mutated array instance
// instead of a fresh literal, so repeated selector calls with no positions
// yield the SAME reference and useSyncExternalStore correctly sees no change.
const EMPTY_POSITIONS: BrokerPosition[] = [];

/**
 * Derived, read-only view of the Delta Exchange account.
 * Pulls from the shared `brokerStore` (which already owns fetching/polling
 * for the "delta" broker key) — no duplicate network requests.
 */
export function useDeltaAccount(): AccountSnapshot {
  const balance = useBrokerStore(s => s.brokerBalances["delta"] ?? null);
  const status  = useBrokerStore(s => s.brokerStatuses["delta"] ?? "disconnected");
  const account = useBrokerStore(s => s.connectedAccounts["delta"] ?? null);
  const positions = useBrokerStore(s => s.brokerPositions["delta"] ?? EMPTY_POSITIONS);
  const ticks = useTickStore(s => s.ticks);
  const { data: tradeRes } = useListTrades({ limit: 500 });

  return useMemo<AccountSnapshot>(() => {
    const availableBalanceUSD = parseFloat(balance?.availableToWithdraw ?? "0") || 0;
    const walletBalanceUSD    = parseFloat(balance?.walletBalance ?? "0") || 0;
    // Tick-driven live unrealized PnL — avoids the "stuck" balance snapshot
    // that only refreshes on the 3s REST poll (see brokerStore.ts POLL_INTERVAL).
    const polledUnrealizedPnlUSD = parseFloat(balance?.unrealisedPnl ?? "0") || 0;
    const unrealizedPnlUSD    = liveUnrealizedPnlUSD(positions, ticks, polledUnrealizedPnlUSD);
    const equityFromApi       = parseFloat(balance?.equity ?? "");
    const accountValueUSD     = Number.isFinite(equityFromApi) && balance?.equity
      ? equityFromApi - polledUnrealizedPnlUSD + unrealizedPnlUSD
      : walletBalanceUSD + unrealizedPnlUSD;
    const marginUsedUSD = Math.max(0, walletBalanceUSD - availableBalanceUSD);

    const realizedPnlUSD = toArray(tradeRes?.trades, "deltaAccountStore.tradeRes.trades").reduce((sum: number, t: unknown) => {
      const trade = t as { symbol?: string; exitPrice?: number | null; pnl?: number };
      if (trade.exitPrice == null) return sum;
      if (classifyBrokerForSymbol(trade.symbol) !== "delta") return sum;
      return sum + (trade.pnl ?? 0);
    }, 0);

    return {
      brokerId: "delta",
      label: "Delta Exchange",
      isConnected: !!account && status === "connected",
      connectionStatus: status,
      availableBalanceUSD,
      marginUsedUSD,
      unrealizedPnlUSD,
      realizedPnlUSD,
      accountValueUSD,
      toINR: (usd: number) => usd * DELTA_FIXED_USD_INR_RATE,
      rateLabel: `Fixed · 1 USD = ₹${DELTA_FIXED_USD_INR_RATE}`,
    };
  }, [balance, status, account, tradeRes, positions, ticks]);
}
