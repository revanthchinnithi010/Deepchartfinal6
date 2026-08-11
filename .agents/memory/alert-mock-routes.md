---
name: Alert mock routes block real DB alerts
description: Why GET /api/alerts, /api/zones, /api/trendlines must never be in mockApi.ts routes
---

# Alert mock routes block real DB alerts

## The rule
`GET /api/alerts`, `GET /api/zones`, and `GET /api/trendlines` must NOT appear in `src/mock/mockApi.ts` routes. They were removed — do not re-add them.

**Why:** AlertEngine reads exclusively from the database. If `GET /api/zones` returns mock rows, the UI shows fake zones the engine never evaluates. Users create zones, they appear in the UI (mock GET returns stale mock data), but the DB zones table stays empty → zero alerts ever fire. The mock data also used wrong symbol suffixes (BTCUSDT/ETHUSDT) vs real tick symbols (BTCUSD/ETHUSD), causing a secondary symbol-mismatch skip.

**How to apply:** Any time alert/zone/trendline UI appears broken (zones visible but alerts silent), check:
1. `src/mock/mockApi.ts` — confirm no GET routes for /api/alerts, /api/zones, /api/trendlines
2. `SELECT count(*) FROM zones WHERE is_active=true` — must be non-zero for zones to fire
3. AlertEngine logs: look for "✔ tick received — evaluating zones" — absent means activeZones is empty
