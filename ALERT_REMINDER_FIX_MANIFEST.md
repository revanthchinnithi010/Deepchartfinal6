# Reminder Fix Manifest

Modified:
- lib/db/src/schema/alerts.ts
- lib/db/src/schema/zones.ts
- lib/db/src/schema/trendlines.ts
- artifacts/api-server/src/lib/migrate.ts
- artifacts/api-server/src/services/AlertEngine.ts
- artifacts/api-server/src/services/TelegramService.ts
- artifacts/api-server/src/routes/alerts.ts
- artifacts/api-server/src/routes/zones.ts
- artifacts/api-server/src/routes/trendlines.ts
- artifacts/trading-journal/src/store/alertStore.ts
- artifacts/trading-journal/src/components/SelectAlertTypeOverlay.tsx
- artifacts/trading-journal/src/components/charts/AlertCenterModal.tsx
- artifacts/trading-journal/src/components/charts/DrawingAlertModal.tsx
- artifacts/trading-journal/src/lib/repeatEngine.ts
- artifacts/trading-journal/src/hooks/useRepeatEngine.ts

New:
- ALERT_REMINDER_FIX.md

Behavior:
Three Reminders = immediate + 5 minutes + 5 minutes, then DB row is deleted.
The reminder schedule is persisted in PostgreSQL and claimed atomically.
