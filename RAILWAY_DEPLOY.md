# Railway deployment — production services only

This repo now has two Railway config files, one per service. `mockup-sandbox`,
`trading-journal-tablet`, and any Replit preview services are never installed,
built, or deployed by either — the `pnpm install --filter "<pkg>..."` in each
buildCommand only pulls in that service's own workspace dependencies.

## 1. Frontend service — `@workspace/trading-journal`

- Config-as-code path: `railway.toml` (repo root, the default — nothing to change
  if this is your existing frontend service).
- Env vars:
  - `VITE_API_BASE_URL` — the backend service's public Railway URL (e.g.
    `https://api-server-production-xxxx.up.railway.app`). Required once the two
    services are on different domains, otherwise the frontend's API calls
    (relative `/api/...`) have nowhere to land.

## 2. Backend service — `@workspace/api-server`

- Create a second Railway service from the same GitHub repo.
- In that service's Settings → Config-as-code, set the path to:
  `railway.api-server.toml`
- Env vars (see `.env.example` for the full list): `DATABASE_URL`, `PORT` is
  auto-provided by Railway, `SESSION_SECRET`, `BROKER_ENCRYPTION_KEY`, and any
  broker/market-data keys you use (`CTRADER_CLIENT_ID`, `FINNHUB_API_KEY`, etc.)
- `CORS_ALLOWED_ORIGINS` (optional) — comma-separated extra origins to allow,
  in case the frontend ends up on a custom domain instead of `*.up.railway.app`.
  `*.up.railway.app` / `*.railway.app` are already allowed by default (see
  `app.ts`), alongside the existing Replit domains and `localhost`.

## Why cross-origin works

The session cookie is already set with `secure: true; sameSite: "none"`, which
is what's required for a cookie to be sent from the frontend's origin to the
backend's origin. The only piece that was missing was the CORS allowlist not
including Railway domains, and the frontend not having a way to point at a
different origin for its API calls — both are fixed in this change (see
`CHANGES.md`).

## Nixpacks / Node version

`nixpacks.toml` at the repo root pins `NIXPACKS_NODE_VERSION = "22"` and
applies to both services automatically since neither config sets a custom
root directory.
