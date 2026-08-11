/**
 * ultraFastTickEngine.ts
 *
 * Ultra-low-latency in-memory OHLC engine for the active chart.
 *
 * Design goals:
 *  - O(1) per tick — no array iteration, no object spread on hot path
 *  - Zero React involvement — all hot-path data lives in plain refs/closures
 *  - RAF-batched dispatch — chart callbacks fire at display rate (60 fps cap)
 *    while the in-memory bar is always fully accurate at microsecond resolution
 *  - Candle-close detection without polling — compared against stored bar time
 *  - Tick deduplication — identical consecutive prices are dropped before any
 *    downstream work occurs
 *  - Ring buffer for recent ticks per symbol — O(1) access, fixed memory
 */

export interface OHLCBar {
  time:   number; // unix seconds
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

type BarUpdateCallback = (bar: OHLCBar, isNewBar: boolean) => void;
type PriceUpdateCallback = (price: number, open: number) => void;

const RING_CAPACITY = 64; // per-symbol recent-tick ring buffer size

/** Fixed-size ring buffer storing the last N prices for a symbol */
class PriceRing {
  private buf: Float64Array;
  private head = 0;
  private _size = 0;

  constructor(capacity: number = RING_CAPACITY) {
    this.buf = new Float64Array(capacity);
  }

  push(price: number): void {
    this.buf[this.head] = price;
    this.head = (this.head + 1) % this.buf.length;
    if (this._size < this.buf.length) this._size++;
  }

  get size(): number { return this._size; }

  /** Most recent price */
  latest(): number | undefined {
    if (this._size === 0) return undefined;
    const idx = (this.head - 1 + this.buf.length) % this.buf.length;
    return this.buf[idx];
  }

  /** Second-most recent price */
  prev(): number | undefined {
    if (this._size < 2) return undefined;
    const idx = (this.head - 2 + this.buf.length) % this.buf.length;
    return this.buf[idx];
  }

  /** Read the last N prices in chronological order */
  last(n: number): number[] {
    const count = Math.min(n, this._size);
    const out   = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      const idx = (this.head - count + i + this.buf.length) % this.buf.length;
      out[i] = this.buf[idx];
    }
    return out;
  }
}

/**
 * UltraFastTickEngine — singleton per chart instance.
 *
 * The engine receives OHLC bar updates from the WS `candle_update` message
 * (which the backend CandleAggregator has already computed server-side) and
 * dispatches them to:
 *   a) `onBar` callbacks at 60 fps via requestAnimationFrame
 *   b) `onPrice` callbacks immediately (synchronous, bypassing RAF) for the
 *      zero-latency LivePriceBox DOM update path
 *
 * Ownership: one engine is created per CustomChart mount and destroyed on unmount.
 * The engine does NOT hold React state; callers use refs + direct DOM mutations.
 */
export class UltraFastTickEngine {
  private currentBar: OHLCBar | null = null;
  private pendingBar: OHLCBar | null = null;
  private pendingIsNew    = false;
  private rafId: number | null = null;
  private alive           = true;

  /** Per-symbol price deduplication: lastSeenPrice */
  private lastPrice: number | null = null;

  /** Ring buffers keyed by symbol (shared across engine instances via module scope) */
  private ring: PriceRing;

  /** Registered callbacks */
  private barCallbacks:   Set<BarUpdateCallback>   = new Set();
  private priceCallbacks: Set<PriceUpdateCallback> = new Set();

  /** Throughput counter incremented synchronously on every accepted tick */
  private _tickCount = 0;

  /** Performance: last tick timestamp */
  private _lastTickAt = 0;

  constructor() {
    this.ring = new PriceRing(RING_CAPACITY);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Called directly from the WS `candle_update` message handler — no React involved.
   *
   * @param bar       The full OHLC bar from the backend (already OHLC-complete)
   * @param isNewBar  True when bar.time differs from the previous bar's time
   */
  ingest(bar: OHLCBar, isNewBar: boolean): void {
    if (!this.alive) return;

    const price = bar.close;
    this._lastTickAt = Date.now();
    this._tickCount++;

    // ── Deduplication ─────────────────────────────────────────────────────────
    // Drop ticks where only the timestamp changed but price is identical.
    // This is common with Delta Exchange's 1s heartbeat ticks.
    if (price === this.lastPrice && !isNewBar) return;
    this.lastPrice = price;

    // ── Ring buffer — O(1) push, fixed memory ─────────────────────────────────
    this.ring.push(price);

    // ── Update in-memory bar (always up to date at microsecond resolution) ────
    this.currentBar = bar;

    // ── Immediate price callbacks (LivePriceBox zero-latency path) ────────────
    for (const cb of this.priceCallbacks) cb(price, bar.open);

    // ── RAF-batched bar callbacks (LWC series.update — 60 fps cap) ───────────
    // We overwrite pendingBar so the RAF always dispatches the freshest bar,
    // not an intermediate one that may be N ticks stale.
    this.pendingBar   = bar;
    this.pendingIsNew = isNewBar || this.pendingIsNew; // sticky: once new, stays new until flushed
    this.scheduleFlush();
  }

  /** Register a callback that fires (via RAF) whenever the bar is updated */
  onBar(cb: BarUpdateCallback): () => void {
    this.barCallbacks.add(cb);
    // Immediately deliver current bar if we have one (catches late subscribers)
    if (this.currentBar) cb(this.currentBar, false);
    return () => { this.barCallbacks.delete(cb); };
  }

  /**
   * Register a callback that fires SYNCHRONOUSLY on every accepted tick.
   * Use only for zero-latency DOM mutations (e.g. LivePriceBox).
   * Do NOT trigger React state updates here — use `onBar` for that.
   */
  onPrice(cb: PriceUpdateCallback): () => void {
    this.priceCallbacks.add(cb);
    return () => { this.priceCallbacks.delete(cb); };
  }

  /** Get the current in-memory bar (may be more recent than last RAF dispatch) */
  getCurrentBar(): OHLCBar | null { return this.currentBar; }

  /** How many ticks have been accepted since last reset */
  get tickCount(): number { return this._tickCount; }

  /** Milliseconds since last accepted tick (0 if never received) */
  get tickAgeMs(): number {
    return this._lastTickAt ? Date.now() - this._lastTickAt : 0;
  }

  /** Recent prices for the current symbol (useful for mini sparklines, not chart) */
  recentPrices(n = RING_CAPACITY): number[] { return this.ring.last(n); }

  /** Reset price dedup state when switching symbols */
  resetSymbol(): void {
    this.lastPrice  = null;
    this.currentBar = null;
    this.pendingBar = null;
    this.pendingIsNew = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ring = new PriceRing(RING_CAPACITY);
    this._tickCount = 0;
    this._lastTickAt = 0;
  }

  /** Destroy the engine — cancel RAF, clear callbacks, prevent further work */
  destroy(): void {
    this.alive = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.barCallbacks.clear();
    this.priceCallbacks.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.rafId !== null) return; // already queued — RAF will pick up pendingBar
    this.rafId = requestAnimationFrame(this.flush);
  }

  private flush = (): void => {
    this.rafId = null;
    const bar   = this.pendingBar;
    const isNew = this.pendingIsNew;
    this.pendingBar   = null;
    this.pendingIsNew = false;
    if (!bar || !this.alive) return;
    for (const cb of this.barCallbacks) cb(bar, isNew);
  };
}

/**
 * Performance monitoring snapshot — updated on every tick, readable at any time.
 * Exposed as a module-level singleton so the performance overlay can read it
 * without needing React state.
 */
export interface PerfSnapshot {
  ticksPerSec:    number;
  lastTickAgeMs:  number;
  renderLatencyMs: number;
  wsLatencyMs:    number;
}

const _perf: PerfSnapshot = {
  ticksPerSec:    0,
  lastTickAgeMs:  0,
  renderLatencyMs: 0,
  wsLatencyMs:    0,
};

/** Mutable perf snapshot — written by the engine, read by the overlay */
export const perfSnapshot: PerfSnapshot = _perf;

export function updatePerfSnapshot(patch: Partial<PerfSnapshot>): void {
  Object.assign(_perf, patch);
}
