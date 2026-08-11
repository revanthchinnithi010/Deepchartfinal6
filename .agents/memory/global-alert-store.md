---
name: Global alert store
description: Unified Zustand store for all alert systems; replaces four separate localStorage/API-backed states
---

## Rule
All alert reads and writes go through `useAlertStore` from `src/store/alertStore.ts`. The store is the single source of truth with localStorage key `"tj_global_alerts_v1"`, initialized from `ALL_ALERTS` sample data on first load.

**Why:** Previously AlertCenterModal used `"tj_alert_center_alerts"` LS key, alerts.tsx fetched from API with SAMPLE fallback, DrawingAlertModal wrote to API only, and RightToolbar counted wsAlertEvents — four completely disconnected systems. The bell popup always showed empty while the Alerts page showed real data.

**How to apply:**
- `AlertCenterModal.tsx` — uses `useAlertStore()` directly (no local state for alerts)
- `alerts.tsx` — derives `priceAlerts/zoneAlerts/trendlineAlerts` by filtering `useAlertStore().alerts` by type; create handlers call `addAlert()`; API calls are fire-and-forget side effects
- `charts.tsx` — `alertCount={useAlertStore().alerts.filter(a => a.status === "active").length}` (not alertEvents.length)
- `DrawingAlertModal.tsx` — after successful API save, calls `useAlertStore.getState().addAlert(...)` converting the response to a TrendlineAlert with id `"tl-{numericId}"`
- Store actions: `addAlert`, `updateAlert(id, patch)`, `deleteAlert(id)`, `setAlerts`
- When adding new alert-related UI, always consume `useAlertStore`; never create a new localStorage key for alerts
