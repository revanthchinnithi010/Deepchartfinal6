---
name: Multi-account portfolio architecture
description: How Delta Exchange and cTrader accounts are combined for Portfolio and Dashboard display; per-broker currency conversion rules.
---

# Multi-account portfolio architecture

## Rule
Delta Exchange and cTrader each have an `AccountSnapshot` hook (`useDeltaAccount`, `useCtraderAccount`) built on top of `brokerStore` per-broker maps — no separate fetch/poll logic. A `useCombinedPortfolio()` hook aggregates both into `{ usd, display }` metric sets. The Dashboard reads ONLY from `useCombinedPortfolio()`.

**Why:** User explicitly required separate account visibility on Portfolio + a single combined source of truth on Dashboard. Builds on existing `brokerStore` to avoid duplicating network calls.

## Currency conversion split
- **Delta Exchange**: always converts USD → INR at `DELTA_FIXED_USD_INR_RATE = 85` (constant in `deltaAccountStore.ts`). Never uses live `currencyStore.exchangeRate` for Delta amounts.
- **cTrader**: uses live `currencyStore.exchangeRate` for USD → INR.
- `useCombinedPortfolio` exposes `display` metrics pre-converted using per-account rules. `usd` metrics are raw USD.

**Critical:** Consumers MUST use `combined.display.*` for rendering — NOT `combined.usd.*` → then re-multiply by global `exchangeRate`. That would double-convert Delta amounts. `AccountValueWidget` accepts explicit `*Display` props for this reason.

**How to apply:** Any new widget showing combined account value must accept pre-converted display values and call `formatAmount(displayValue, currency)` directly, not `useCurrencyFormatter()(usdValue)`.

## Realized PnL attribution
Symbol-based heuristic in `src/lib/brokerClassification.ts`. Crypto prefix allowlist → Delta; everything else → cTrader. This is approximate (no broker_id on Trade type). Centralized so one change covers all callers.

## File locations
- `src/lib/brokerClassification.ts` — symbol classifier
- `src/store/accountTypes.ts` — `AccountSnapshot` interface
- `src/store/deltaAccountStore.ts` — `useDeltaAccount()`
- `src/store/ctraderAccountStore.ts` — `useCtraderAccount()`
- `src/store/combinedPortfolioStore.ts` — `useCombinedPortfolio()`
- `src/components/portfolio/AccountCard.tsx` — reusable per-broker account card
