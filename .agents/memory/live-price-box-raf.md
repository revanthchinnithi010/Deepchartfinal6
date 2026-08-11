---
name: LivePriceBox RAF architecture
description: How LivePriceBox achieves 60fps smooth position tracking — RAF loop, direct DOM mutation, single rc ref bag
---

## The rule
`LivePriceBox` must NOT use `useState` for any hot-path values (yPos, price string, color, width). All 60fps updates go through a single `requestAnimationFrame` loop that directly mutates DOM element refs.

## Why
- `setState` → React scheduler → batched render → DOM write. Even if `subscribeVisibleTimeRangeChange` fires every frame, React batches/defers updates, causing visible jank during pan/zoom.
- The old `setInterval(sync, 500)` fallback allowed up to 500ms of positional lag during vertical-scale changes.
- Direct DOM writes sidestep the scheduler entirely — browser renders the mutation at the next composite frame.

## How to apply
Single mutable bag ref pattern:
```ts
const rc = useRef({ price, open, symbol, series, interval, upColor, downColor, textColor, boxWidth,
  _col: "", _tc: "", _w: 0, _px: "" }); // change-detection cache
// Sync every render (runs synchronously before next RAF frame reads):
rc.current.price = livePrice; rc.current.series = series; // etc.
```

RAF loop (empty deps — reads everything via rc):
```ts
useEffect(() => {
  let rafId: number;
  const tick = () => {
    const r = rc.current;
    // 1. hide/show via visibility
    // 2. wrap.style.transform = `translateY(calc(${y}px - 50%))`  (every frame)
    // 3. priceEl.textContent = fmtPrice(...)  (only if changed)
    // 4. color mutation on inner/tri (only if bull/bear flips)
    // 5. width mutation (only if changed)
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}, []); // intentionally empty
```

Countdown stays in a `setInterval(500)` (500ms resolution is plenty for a seconds display).

## What to avoid
- `subscribeVisibleTimeRangeChange` + `setYPos` — replaced by RAF.
- `setInterval(sync, 500)` for position sync — replaced by RAF.
- Any `useState` for yPos, priceStr, cd, boxColor — replaced by direct DOM mutation.
- `willChange: "transform"` on the wrapper div promotes it to its own GPU layer.
