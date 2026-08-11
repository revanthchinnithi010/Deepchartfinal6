# Changes

## Railway scoping (deploy only trading-journal + api-server)

- `railway.toml` — frontend service config. Install step now uses
  `pnpm install --filter "@workspace/trading-journal..."` so only the frontend
  and its actual workspace deps (lib/db, lib/api-zod, lib/api-client-react)
  are installed/built. Added `watchPatterns` so unrelated changes elsewhere in
  the repo don't trigger a rebuild.
- `railway.api-server.toml` (new) — backend service config, same pattern,
  filtered to `@workspace/api-server`. Point a second Railway service at this
  file (Settings → Config-as-code path). See `RAILWAY_DEPLOY.md`.
- `artifacts/api-server/src/app.ts` — CORS allowlist now also accepts
  `*.up.railway.app` / `*.railway.app`, plus an optional `CORS_ALLOWED_ORIGINS`
  env var. Needed once frontend and backend are on separate Railway domains.
- `artifacts/trading-journal/src/main.tsx` — calls `setBaseUrl()` from
  `@workspace/api-client-react` when `VITE_API_BASE_URL` is set, so the
  deployed frontend can reach the backend on its own domain. No-op (falls back
  to relative `/api/...`) if the env var isn't set, so this doesn't change
  behavior for any other consumer of the app (dev, single-origin setups).

## TypeScript compile-error fixes

- `artifacts/api-server/src/brokers/MT5TradingAdapter.ts` — `placeOrder` read
  `params.stopLoss` / `params.takeProfit`, which don't exist on
  `PlaceOrderParams` (the real fields are `stopLossPrice` / `takeProfitPrice`).
  Fixed to read the correct fields. Values sent to the MT5 gateway are
  unchanged (still keyed `stopLoss`/`takeProfit` in the outgoing request body).
- `artifacts/api-server/src/brokers/BybitTradingAdapter.ts` — same
  `stopLoss`/`takeProfit` → `stopLossPrice`/`takeProfitPrice` fix. Also,
  `placeOrder` read `params.category`, which isn't a field on
  `PlaceOrderParams` either; nothing in the codebase ever passes it, so at
  runtime it always evaluated to `undefined` and fell back to `"linear"`.
  Replaced with the literal `"linear"` — identical runtime behavior, no more
  reference to a nonexistent property.

### Scope of the TypeScript audit

I don't have network access in this sandbox, so I can't run `pnpm install` or
`pnpm run build` here to get a definitive error list — the fixes above come
from manually cross-checking `PlaceOrderParams` (in `BrokerAdapter.ts`)
against every place that constructs or reads it, plus a close read of
`MT5TradingAdapter.ts`, `BybitTradingAdapter.ts`, `DeltaTradingAdapter.ts`,
`ctrader_oauth.ts`, `deltaAuth.ts`, `deltaSigner.ts`, `BrokerService.ts`,
`BrokerEncryption.ts`, `retryFetch.ts`, and the `lib/db` package. Those two
were the only genuine type errors I could find in that pass — `ctrader_oauth.ts`
and `deltaAuth.ts` (the other two files you named) check out clean against
their dependencies.

api-server is ~17,000 lines and I couldn't manually verify all of it against
a real compiler. **Please run `pnpm run build` (or trigger the Railway build)
and paste me any remaining errors** — with the actual `tsc` output I can fix
the rest precisely rather than guessing at more of the codebase.
