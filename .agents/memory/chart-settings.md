---
name: Chart settings architecture
description: How ChartSettings flows from SettingsPanel through to the lightweight-charts instance
---

## Rule
`ChartSettings` is defined and exported from `SettingsPanel.tsx`. It is stored in `charts.tsx` state (`chartSettings`), passed as a `settings` prop to `<CustomChart settings={chartSettings}>`, and applied reactively inside `CustomChart.tsx` via a dedicated `useEffect([settings])`.

**Why:** lightweight-charts is created once; settings must be applied via `chart.applyOptions()` and `series.applyOptions()` after creation. Passing as a prop and watching in a useEffect keeps the chart singleton stable while allowing dynamic updates.

**Fields added beyond the original:**
- `upBorderColor`, `downBorderColor`, `upWickColor`, `downWickColor` — candle border/wick colors
- `bgType` — "solid" | "gradient"
- `gridStyle` — "both" | "vertical" | "horizontal" | "none" (replaces `gridVisible`)
- `crosshairColor`, `crosshairStyle`, `crosshairWidth` — crosshair appearance
- `textColor`, `fontSize`, `linesColor` — scale label and grid line styling

**DEFAULT_CHART_SETTINGS** is exported as a const (not a component) from SettingsPanel.tsx — Vite's fast-refresh will always show an "incompatible" HMR warning for this file, but it's harmless; the full module reloads correctly.
