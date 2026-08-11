---
name: ChartSettingsSheet optimization pattern
description: How to eliminate cascade re-renders in settings sheets that hold a settings object + inline onChange lambdas.
---

## The pattern

The root cause of ChartSettingsSheet lag is the `p` callback holding `settings` in its dep array:

```tsx
// BAD — settings in deps means new `p` on every setting change
const p = useCallback((patch) => onChange({ ...settings, ...patch }), [settings, onChange]);
// All children see new onChange → all re-render even if their field didn't change
```

**Fix:** Use a ref to hold settings, remove it from deps:

```tsx
const settingsRef = useRef(settings);
settingsRef.current = settings;   // keep in sync without triggering re-render
const p = useCallback(
  (patch) => onChange({ ...settingsRef.current, ...patch }),
  [onChange],   // stable as long as parent useCallback's onChange
);

// Pre-bind all per-field handlers once — only recreated if p changes (never in practice)
const h = useMemo(() => ({
  upColor:   (v) => p({ upColor: v }),
  downColor: (v) => p({ downColor: v }),
  // ... one per field
}), [p]);
```

## Required companion changes

1. **Parent `onChange` must be `useCallback`** — if `onChange` is a plain arrow in charts.tsx, `p` stays unstable. Wrap `handleSettings` + `handleSaveAsDefault` in `useCallback(fn, [])`.

2. **Module-level options arrays** — StyledSelect receives `options` prop. Inline arrays (`[{value:"UTC",...}]`) are new objects every render. Extract to `const CSS_OPTS_TZ = [...]` outside the component.

3. **Memo all leaf components** — `ColorBox` (already), `ColorPair`, `Toggle`, `ThicknessButtons`, `StyledSelect` all need `memo()`. Row/Section memo is less effective because they receive `children` which is always a new ReactElement.

4. **Remove Row hover state** — `useState(hovered)` in Row causes re-renders on every mouse contact. On mobile this is pointless. Remove entirely; use CSS `:hover` if needed.

## Files

- `artifacts/trading-journal/src/components/charts/SettingsPanel.tsx` — all leaf components
- `artifacts/trading-journal/src/components/charts/MobileChartLayout.tsx` — ChartSettingsSheet
- `artifacts/trading-journal/src/pages/charts.tsx` — handleSettings / handleSaveAsDefault

## Result (estimated)

Per color-pick, Candles tab:
- Before: ~29 component renders (all children of ChartSettingsSheet)
- After: ~10 component renders (ChartSettingsSheet + 4 Sections + 1 ColorPair + 2 Rows + 2 ColorBoxes)
- Bailing out: 3 ColorPairs, 8 ColorBoxes, 2 StyledSelects, all Toggles/ThicknessButtons not affected

**Why:** `memo()` does shallow prop equality. For leaf components with primitive value props (string/boolean/number) + stable function props from `h.xxx`, React skips the render entirely for components whose field didn't change.
