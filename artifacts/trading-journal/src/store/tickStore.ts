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
import { bybitPublicWs } from "@/lib/bybitPublicWs";
import { useChartStore } from "@/store/chartStore";

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
 * Direct Bybit V5 publicTrade feed.
 * The WS client is a single browser-wide, self-healing connection. It batches
 * exchange messages to one callback per animation frame, so high-frequency
 * trades do not create a React render for every individual exchange message.
 *
 * This is deliberately separate from the app backend socket: if /api/ws is
 * offline, crypto prices still continue to update from Bybit directly.
 */
bybitPublicWs.onTick((batch) => {
  const current = useTickStore.getState().ticks;
  const next: Record<string, TickState> = {};

  for (const t of batch) {
    const prev = next[t.symbol] ?? current[t.symbol];
    const prevPrice = prev?.price ?? null;
    const openPrice = prev?.openPrice ?? t.price;
    const history = prev
      ? (prev.history.length >= 40 ? [...prev.history.slice(1), t.price] : [...prev.history, t.price])
      : [t.price];
    const change = t.price - openPrice;
    const changePct = openPrice !== 0 ? (change / openPrice) * 100 : 0;
    const flashDir: FlashDir = prevPrice === null ? null : t.price > prevPrice ? "up" : t.price < prevPrice ? "down" : null;

    next[t.symbol] = {
      price: t.price,
      prevPrice,
      openPrice,
      change,
      changePct,
      history,
      lastTick: Date.now(),
      flashDir,
      flashKey: (prev?.flashKey ?? 0) + (flashDir ? 1 : 0),
      tickCount: (prev?.tickCount ?? 0) + 1,
      volume: t.volume || prev?.volume,
      bid: prev?.bid,
      ask: prev?.ask,
      spread: prev?.spread,
      high: prev?.high,
      low: prev?.low,
      markPrice: prev?.markPrice,
    };

    // CustomChart uses chartStore.livePrice for the main pane's price box.
    // Keep it synchronized with the direct Bybit stream for the selected symbol.
    if (useChartStore.getState().symbol === t.symbol) {
      useChartStore.getState().setLivePrice(t.price);
      useChartStore.getState().setLiveOpen(openPrice);
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("bybit:tick", { detail: t }));
    }
  }

  if (Object.keys(next).length) useTickStore.getState()._setMany(next);
});

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
