/**
 * Module-level crosshair pub-sub — ZERO React involvement.
 *
 * CustomChart writes here directly from the LWC subscribeCrosshairMove callback.
 * OHLCVBar (and any other consumer) subscribes and mutates DOM nodes directly —
 * no setState, no Zustand, no re-renders on every mouse pixel.
 */

export interface CrosshairData {
  time:   number | null;
  open:   number | null;
  high:   number | null;
  low:    number | null;
  close:  number | null;
  volume: number | null;
}

const EMPTY: CrosshairData = {
  time: null, open: null, high: null, low: null, close: null, volume: null,
};

let _current: CrosshairData = EMPTY;
const _subs = new Set<() => void>();

/** Read the latest crosshair snapshot (safe to call any time, any context). */
export function getCrosshair(): CrosshairData {
  return _current;
}

/** Write a new crosshair snapshot and notify all subscribers synchronously. */
export function emitCrosshair(data: CrosshairData): void {
  _current = data;
  for (const fn of _subs) {
    try { fn(); } catch { /* ignore */ }
  }
}

/** Reset crosshair to the empty state (call on chart unmount). */
export function resetCrosshair(): void {
  emitCrosshair(EMPTY);
}

/** Subscribe to crosshair changes. Returns an unsubscribe function. */
export function subscribeCrosshair(fn: () => void): () => void {
  _subs.add(fn);
  return () => { _subs.delete(fn); };
}
