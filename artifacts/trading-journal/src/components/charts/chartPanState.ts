/**
 * Shared vertical-pan range for the main chart pane.
 *
 * WHY: LWC unions the autoscaleInfoProvider results from ALL series in a
 * pane to determine the visible price range. If overlay indicators (EMA,
 * SMA…) don't match the candlestick's locked range, LWC expands the view
 * to include their natural data range, making vertical pan feel "limited".
 *
 * HOW: CustomChart calls activatePanRange / updatePanRange as it pans.
 * IndicatorRenderer / CustomIndicatorRenderer subscribe and apply the same
 * autoscaleInfoProvider to their pane-0 series so the union = locked range.
 */

export type PanRange = { lo: number; hi: number } | null;
type Listener = (r: PanRange) => void;

let _current: PanRange = null;
const _listeners = new Set<Listener>();

/** Read the current pan range — called by autoscaleInfoProvider closures. */
export function getPanRange(): PanRange {
  return _current;
}

/**
 * Set range AND notify subscribers.
 * Call on pan START (first vertical frame) and pan END (lift / coast end).
 */
export function activatePanRange(r: PanRange): void {
  _current = r;
  for (const fn of _listeners) fn(r);
}

/**
 * Update the stored range WITHOUT notifying subscribers.
 * Call on every subsequent RAF frame — providers already installed on series
 * will read the new value dynamically via getPanRange().
 */
export function updatePanRange(lo: number, hi: number): void {
  _current = { lo, hi };
}

/** Subscribe to activate / deactivate events. Returns unsubscribe fn. */
export function subscribePanRange(fn: Listener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
