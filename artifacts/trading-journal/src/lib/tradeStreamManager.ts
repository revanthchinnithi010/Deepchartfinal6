/**
 * tradeStreamManager.ts
 *
 * Routes real-time `tick` WebSocket messages to per-symbol handlers.
 *
 * The backend broadcasts a `tick` message for every incoming trade from all
 * providers (Delta Exchange all_trades, cTrader, etc.). This manager:
 *   1. Registers ONE handler with `subscribeToMessages` — no WS per-symbol
 *   2. Dispatches ticks to per-symbol callbacks in O(1)
 *   3. Tracks latency (exchange timestamp → client receipt) + ticks/sec
 *   4. Deduplicates per-symbol: consecutive identical prices are dropped
 *
 * Usage:
 *   const mgr = new TradeStreamManager(subscribeToMessages);
 *   const unsub = mgr.subscribe("BTCUSD", (price, vol, tsSec) => { ... });
 *   // On unmount:
 *   unsub();
 *   mgr.destroy();
 */

import { toMs } from "./realtimeTradeAggregator.js";

export interface RawTick {
  symbol:     string;
  price:      number;
  volume:     number;
  tsSec:      number;  // unix seconds
  receivedAt: number;  // Date.now() at WS receipt
  latencyMs:  number;  // exchange → client latency
}

type TickHandler = (tick: RawTick) => void;

interface PerSymbolState {
  handlers:  Set<TickHandler>;
  lastPrice: number | null;
}

export class TradeStreamManager {
  private symbols:    Map<string, PerSymbolState> = new Map();
  private unsubscribeWs: (() => void) | null = null;

  // ── Performance metrics (read by perf overlay) ─────────────────────────────
  latencyMs   = 0;
  ticksPerSec = 0;
  private _tickCount  = 0;
  private _window     = 0;
  private _windowTimer: ReturnType<typeof setInterval> | null = null;

  constructor(subscribeToMessages: (handler: (msg: unknown) => void) => () => void) {
    this.unsubscribeWs = subscribeToMessages(this._onWsMessage);
    this._windowTimer  = setInterval(() => {
      this.ticksPerSec = this._window;
      this._window     = 0;
    }, 1_000);
  }

  /**
   * Subscribe to tick events for a specific symbol.
   * Multiple handlers per symbol are supported.
   * Returns an unsubscribe function.
   */
  subscribe(symbol: string, handler: TickHandler): () => void {
    let state = this.symbols.get(symbol);
    if (!state) {
      state = { handlers: new Set(), lastPrice: null };
      this.symbols.set(symbol, state);
    }
    state.handlers.add(handler);
    return () => {
      const s = this.symbols.get(symbol);
      if (!s) return;
      s.handlers.delete(handler);
      if (s.handlers.size === 0) this.symbols.delete(symbol);
    };
  }

  /** Total ticks processed since construction */
  get totalTicks(): number { return this._tickCount; }

  /** Clean up — call on component unmount */
  destroy(): void {
    this.unsubscribeWs?.();
    this.unsubscribeWs = null;
    this.symbols.clear();
    if (this._windowTimer) { clearInterval(this._windowTimer); this._windowTimer = null; }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private _onWsMessage = (raw: unknown): void => {
    if (!raw || typeof raw !== "object") return;
    const msg = raw as Record<string, unknown>;
    if (msg["type"] !== "tick") return;

    const symbol = msg["symbol"] as string | undefined;
    const price  = msg["price"]  as number | undefined;
    if (!symbol || typeof price !== "number" || price <= 0) return;

    const state = this.symbols.get(symbol);
    if (!state || state.handlers.size === 0) return;

    // Per-symbol price deduplication
    if (price === state.lastPrice) return;
    state.lastPrice = price;

    const volume     = typeof msg["volume"] === "number" ? msg["volume"] : 1;
    const rawTs      = msg["timestamp"] as number | undefined;
    const tsSec      = rawTs ? (rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs) : Math.floor(Date.now() / 1000);
    const receivedAt = Date.now();

    // Latency: exchange timestamp → client wall-clock
    const exchangeMs = rawTs ? toMs(rawTs) : receivedAt;
    const lat        = Math.max(0, receivedAt - exchangeMs);
    if (lat < 300_000) this.latencyMs = lat; // reject obviously wrong values

    this._tickCount++;
    this._window++;

    const tick: RawTick = { symbol, price, volume, tsSec, receivedAt, latencyMs: this.latencyMs };

    for (const handler of state.handlers) {
      try { handler(tick); } catch { /* isolate handler errors */ }
    }
  };
}
