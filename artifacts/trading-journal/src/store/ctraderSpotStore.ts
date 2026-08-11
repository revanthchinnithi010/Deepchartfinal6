/**
 * ctraderSpotStore
 *
 * Zustand store for cTrader live spot data.
 * Receives updates via WebSocket messages (ctrader_tick, ctrader_status).
 *
 * Kept separate from tickStore so bid/ask/spread are accessible independently
 * without touching the main tick pipeline.
 */

import { create } from "zustand";

export type CtraderConnStatus =
  | "idle" | "connecting" | "app_auth" | "acct_auth"
  | "subscribing" | "streaming" | "reconnecting" | "error" | "stopped" | "unknown";

export interface CtraderSpotTick {
  symbol:    string;
  symbolId:  number;
  bid:       number;
  ask:       number;
  spread:    number;
  mid:       number;
  timestamp: number;
  receivedAt: number;
}

interface CtraderSpotState {
  connStatus:   CtraderConnStatus;
  accountId:    number;
  isLive:       boolean;
  subscribedCount: number;
  reconnectCount: number;
  connectedAt:  number | null;
  lastTickAt:   number | null;
  tickCounts:   Record<string, number>;
  error:        string | undefined;

  spots: Record<string, CtraderSpotTick>;   // keyed by symbolName

  setStatus:  (payload: Partial<CtraderSpotState>) => void;
  setSpotTick: (tick: CtraderSpotTick) => void;
}

export const useCtraderSpotStore = create<CtraderSpotState>((set) => ({
  connStatus:      "unknown",
  accountId:       0,
  isLive:          false,
  subscribedCount: 0,
  reconnectCount:  0,
  connectedAt:     null,
  lastTickAt:      null,
  tickCounts:      {},
  error:           undefined,
  spots:           {},

  setStatus: (payload) => set(s => ({ ...s, ...payload })),

  setSpotTick: (tick) =>
    set(s => ({ spots: { ...s.spots, [tick.symbol]: tick } })),
}));

export function useCtraderSpot(symbol: string): CtraderSpotTick | null {
  return useCtraderSpotStore(s => s.spots[symbol] ?? null);
}

export function useCtraderConnStatus(): CtraderConnStatus {
  return useCtraderSpotStore(s => s.connStatus);
}
