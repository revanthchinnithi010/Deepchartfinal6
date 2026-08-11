Fix the order book flash/color bug in `artifacts/trading-journal/src/components/charts/MobileChartLayout.tsx`, inside the `OrderBook` component.

**Root cause (confirmed by reading the code):** The previous-size tracking used for the flash/diff logic is keyed by **display-slot index**, not by price:

```ts
// Previous sizes for diffing — keyed by display-slot index
const prevBidSizes = useRef<(number | null)[]>(Array(OB_MAX_LEVELS).fill(null));
const prevAskSizes = useRef<(number | null)[]>(Array(OB_MAX_LEVELS).fill(null));
```

Because the best bid/ask shifts on almost every poll, the price level occupying slot `i` is frequently a *different* price than last time — but the code only compares "size at slot i now vs size at slot i last time," so it misreads a price-level reshuffle as a quantity change on every affected row. This causes the flash + ↑/↓ indicator to fire on rows whose actual price level never changed, and during a price shift it fires on most/all rows at once (looks like the whole side flashing for no reason).

**Fix:** Key the previous-size tracking by **price**, not slot index, so a row only flashes when the size at that exact price actually changed.

1. Replace the refs:
```ts
// Previous sizes for diffing — keyed by PRICE, not slot index, so a
// price-level reshuffle is never misread as a quantity change.
const prevBidSizes = useRef<Map<string, number>>(new Map());
const prevAskSizes = useRef<Map<string, number>>(new Map());
```

2. In the ask loop (around where `curSize`/`prevSize`/`changed` are computed for asks), change:
```ts
const curSize  = parseFloat(String(level.size));
const prevSize = prevAskSizes.current[i];
const changed  = prevSize !== null && curSize !== prevSize;
```
to:
```ts
const priceKey = String(level.price);
const curSize  = parseFloat(String(level.size));
const prevSize = prevAskSizes.current.get(priceKey);
const changed  = prevSize !== undefined && curSize !== prevSize;
```
and update the flash/indicator calls to use `priceKey` instead of `i` for their timer keys (e.g. `flash(`a${priceKey}`, ...)`, `showIndicator(`ai${priceKey}`, ...)`), and at the end of the loop body replace:
```ts
prevAskSizes.current[i] = curSize;
```
with:
```ts
prevAskSizes.current.set(priceKey, curSize);
```

3. After the ask loop, prune prices that fell out of the visible book so the map doesn't grow stale:
```ts
const currentAskKeys = new Set(askDisplay.filter(Boolean).map(l => String(l.price)));
for (const key of prevAskSizes.current.keys()) {
  if (!currentAskKeys.has(key)) prevAskSizes.current.delete(key);
}
```

4. Do the exact same three changes for the bid loop (`prevBidSizes`, using `bids` instead of `askDisplay`, flash/indicator keys prefixed `b`/`bi` instead of `a`/`ai`).

5. In the empty-level branch (`if (!level) { ... }`) for both loops, remove the line that resets `prevAskSizes.current[i] = null` / `prevBidSizes.current[i] = null` — that's no longer needed since pruning (step 3) handles cleanup by price now.

Don't change anything else — the depth bar rendering, row layout, and static red/green coloring are correct and should stay as-is. Only the diffing/flash key needs to move from slot-index-based to price-based.
