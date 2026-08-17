/**
 * Zustand tick store — replaces React context state for live price ticks.
 *
 * Benefits over React context:
 *  - Per-symbol selector isolation: `useSymbolTick("BTCUSD")` only re-renders
 *    when BTCUSD's tick changes — not when any other symbol ticks.
 *  - Direct getState() reads inside RAF loops / event handlers without hooks.
 *  - Removes the context re-render cascade that hit all 7+ context consumers
 *    on every single tick.
 */
import { create } from "zustand";

export type FlashDir = "up" | "down" | null;

export interface TickState {
  price:     number;
  prevPrice: number | null;
  openPrice: number;
  change:    number;
  changePct: number;
  history:   number[];
  lastTick:  number;
  flashDir:  FlashDir;
  flashKey:  number;
  tickCount: number;
  bid?:      number;
  ask?:      number;
  spread?:   number;
  volume?:   number;
  high?:     number;
  low?:      number;
  markPrice?: number;
}

interface TickStoreState {
  ticks: Record<string, TickState>;
  _setTick: (symbol: string, tick: TickState) => void;
  _setMany: (many: Record<string, TickState>) => void;
}

export const useTickStore = create<TickStoreState>((set) => ({
  ticks:    {},
  _setTick: (symbol, tick) =>
    set(s => ({ ticks: { ...s.ticks, [symbol]: tick } })),
  _setMany: (many) =>
    set(s => ({ ticks: { ...s.ticks, ...many } })),
}));

/**
 * Per-symbol hook — only re-renders when THIS symbol's data changes.
 * Use this in components that display a single symbol's price.
 */
export function useSymbolTick(symbol: string): TickState | null {
  return useTickStore(s => s.ticks[symbol] ?? null);
}

/**
 * Read a tick without subscribing (for event handlers, RAF loops, etc.).
 * Zero overhead — reads directly from the store's internal state.
 */
export function getSymbolTick(symbol: string): TickState | null {
  return useTickStore.getState().ticks[symbol] ?? null;
}
