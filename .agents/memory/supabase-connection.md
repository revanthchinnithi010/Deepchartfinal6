---
name: Supabase connection pattern
description: How the project connects to Supabase PostgreSQL; pooler URL requirement and SSL setup.
---

# Supabase connection pattern

## Rule
`DATABASE_URL` is the single connection source. Set it to the **Session Mode pooler URL** from Supabase Dashboard → Settings → Database → Connection pooling (port 5432 on `aws-1-ap-south-1.pooler.supabase.com`).

**Why:** Supabase's direct host (`db.{ref}.supabase.co`) resolves to IPv6 only. Replit containers have no IPv6 outbound (EAFNOSUPPORT). The session-mode pooler has IPv4 and supports DDL (migrations). Transaction-mode pooler (port 6543) rejected the tenant — use session mode.

## SSL
Both `lib/db/src/index.ts` and `lib/db/drizzle.config.ts` detect Supabase hosts automatically:
```ts
const ssl = hostname.endsWith('.supabase.co') || hostname.endsWith('.supabase.com')
  ? { rejectUnauthorized: false }
  : undefined;
```
This is safe because the Replit internal host (`helium`) does not use SSL.

## Schema push
`pnpm --filter @workspace/db run push-force` fails non-interactively (TTY prompt issue in drizzle-kit 0.31.10). The API server's built-in migration runner creates all tables at startup — 22 tables created on first boot against Supabase.

## How to apply
- Never revert to `SUPABASE_DB_URL` — use only `DATABASE_URL`.
- If schema push is needed non-interactively, use `drizzle-kit migrate` (not `push`) after generating migrations with `drizzle-kit generate`.
- `alert_events` table has `condition` as NOT NULL — always include it in inserts.
