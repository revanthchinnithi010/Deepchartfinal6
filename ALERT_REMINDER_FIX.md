# TradeVault Alert Reminder Fix

## Three Reminders
The reminder scheduler is now backend-authoritative and persisted in PostgreSQL.

When `repeatMode = three_reminders`:
1. Initial trigger: Telegram message immediately (`1/3`).
2. Five minutes later: reminder `2/3`.
3. Five minutes later: reminder `3/3`.
4. After sending `3/3`, the alert row is deleted from the database.

Only one reminder timer exists per alert. Reminder claims use an atomic PostgreSQL UPDATE, so concurrent ticks or multiple API workers cannot send the same reminder slot twice.

## Other modes
- `repeat_until_dismissed`: initial message, then every 10 minutes until the alert is disabled/deleted.
- `triple_ring`: no follow-up Telegram messages; browser sound effect handles the three rings.

## Persistence
The API migration automatically adds:
- `repeat_mode`
- `reminder_count`
- `next_reminder_at`

The scheduler resumes pending reminders from PostgreSQL after an API restart.

## Important
Deploy the updated API server so `runMigrations()` can add the new columns. No manual SQL is required when the normal API startup migration runs.
