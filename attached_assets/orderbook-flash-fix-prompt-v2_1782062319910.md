Fix a flicker/flash bug in my order book component (mobile crypto perpetual futures trading UI, React + Tailwind).

**Symptom:** Rows flash/highlight with color even when their value hasn't actually changed. Also, when the price range shifts (best bid/ask moves and the visible rows reorder), the whole order book briefly dims/flickers as a block instead of updating smoothly.

**Root cause (very likely):** The order book rows are keyed by array index (or a non-stable reference) instead of the price level itself. When the underlying array reorders/shifts (new top/bottom rows appear as price moves), React treats existing rows as new elements, unmounts/remounts them, and replays their enter/flash transition — even though that specific price level's quantity never changed. This causes:
1. Rows to flash with no real diff behind them.
2. The entire visible list to flicker together during any price-range shift.

**Required fix:**

1. **Use price as the React key**, not array index:
```jsx
{orderBookRows.map(row => (
  <OrderBookRow key={row.price} {...row} />
))}
```

2. **Track previous quantity per price in a ref/map (not in component state that resets on reorder)**, and only mark a row as "changed" if the quantity for that exact price actually differs from last time:
```jsx
const prevQtyRef = useRef({}); // { [price]: qty } — persists across re-renders/reorders

function getFlashState(price, qty) {
  const prevQty = prevQtyRef.current[price];
  prevQtyRef.current[price] = qty;
  if (prevQty === undefined) return null; // first time seeing this level, don't flash
  if (prevQty === qty) return null; // no real change, don't flash
  return prevQty < qty ? 'increase' : 'decrease';
}
```

3. **Flash should be a one-shot animation tied only to that row's own change**, not a persistent class, and must not retrigger just because the row's position in the list changed:
```css
.flash-update { animation: flashUpdate 400ms ease-out; }
@keyframes flashUpdate {
  from { background-color: rgba(255,255,255,0.15); }
  to   { background-color: transparent; }
}
```
(Use whatever the existing per-side tint is as the "to" base state — the point is the flash should fade back to the row's normal static red/green depth-bar tint, and only play once per genuine quantity change.)

4. **Do not apply enter/mount transitions (fade-in, slide-in, etc.) to rows just because they re-rendered in a new array position.** Only apply them when a price level is genuinely new to the visible book (wasn't present in the previous snapshot at all) or genuinely removed.

5. Make sure removing a price level (it drops out of the visible depth) cleans up its entry in `prevQtyRef` so stale prices don't accumulate.

**Task:** Find the order book component in this project, identify where rows are keyed/mapped and where the flash/highlight classes are applied, and refactor per the above so that color changes only happen on genuine quantity changes for a given price level — never on reordering, remounting, or unrelated re-renders. Keep the existing depth-bar (cumulative width) and static red/green side styling exactly as is — only fix the flash/key logic.
