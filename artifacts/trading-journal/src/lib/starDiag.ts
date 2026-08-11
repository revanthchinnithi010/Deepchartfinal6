/**
 * Lightweight star-button performance diagnostics.
 * Tracks tap → visual update time and tap → database confirm time.
 * Zero dependencies, zero React — pure pub/sub module.
 */

export interface StarDiagEvent {
  id:      number;
  symbol:  string;
  tapAt:   number;        // performance.now() at pointer-down
  uiMs:    number | null; // ms from tap to visual update (rAF after setState)
  dbMs:    number | null; // ms from tap to server response
  success: boolean | null;
}

const MAX_EVENTS = 5;

let seq = 0;
const events: StarDiagEvent[] = [];
const subs = new Set<() => void>();

function emit() {
  subs.forEach(fn => fn());
}

/** Call at pointer-down. Returns tapAt timestamp to pass to recordUi / recordDb. */
export function tapStart(symbol: string): number {
  const tapAt = performance.now();
  events.unshift({ id: ++seq, symbol, tapAt, uiMs: null, dbMs: null, success: null });
  if (events.length > MAX_EVENTS) events.pop();
  emit();
  return tapAt;
}

/** Call inside requestAnimationFrame after the optimistic setState, to measure paint time. */
export function recordUi(tapAt: number) {
  const ev = events.find(e => e.tapAt === tapAt);
  if (ev && ev.uiMs === null) {
    ev.uiMs = Math.round(performance.now() - tapAt);
    emit();
  }
}

/** Call when the API response arrives. */
export function recordDb(tapAt: number, success: boolean) {
  const ev = events.find(e => e.tapAt === tapAt);
  if (ev) {
    ev.dbMs    = Math.round(performance.now() - tapAt);
    ev.success = success;
    emit();
  }
}

export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function getEvents(): readonly StarDiagEvent[] {
  return events;
}
