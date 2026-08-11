import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCallback } from "react";

export type Currency = "USD" | "INR";

const FALLBACK_RATE = 85;
const LS_KEY = "tj_currency_v1";

interface CurrencyState {
  currency: Currency;
  exchangeRate: number;
  isFetchingRate: boolean;
  setCurrency: (c: Currency) => void;
  fetchRate: () => Promise<void>;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: "USD" as Currency,
      exchangeRate: FALLBACK_RATE,
      isFetchingRate: false,

      setCurrency: (currency) => set({ currency }),

      fetchRate: async () => {
        set({ isFetchingRate: true });
        try {
          const res = await fetch(
            "https://open.er-api.com/v6/latest/USD",
            { signal: AbortSignal.timeout(6000) }
          );
          if (!res.ok) throw new Error("rate API error");
          const data = await res.json();
          const rate = data?.rates?.INR;
          if (typeof rate === "number" && rate > 0) {
            set({ exchangeRate: rate, isFetchingRate: false });
          } else {
            set({ isFetchingRate: false });
          }
        } catch {
          set({ isFetchingRate: false });
        }
      },
    }),
    {
      name: LS_KEY,
      partialize: (s) => ({ currency: s.currency, exchangeRate: s.exchangeRate }),
    }
  )
);

// ── Currency metadata ─────────────────────────────────────────────────────────
export const CURRENCY_META: Record<Currency, {
  symbol: string; locale: string; code: string; label: string;
}> = {
  USD: { symbol: "$",  locale: "en-US", code: "USD", label: "USD" },
  INR: { symbol: "₹", locale: "en-IN", code: "INR", label: "INR" },
};

// ── Future currencies (scaffold) ──────────────────────────────────────────────
// Add EUR, GBP, AED, JPY here — no changes needed elsewhere.
// Each needs: { symbol, locale, code, label } in CURRENCY_META
// and a rate in the fetchRate() response.

// ── Pure utility functions (no hooks, safe anywhere) ─────────────────────────

/** Convert a USD value to the target currency amount. */
export function convertAmount(
  usdValue: number,
  currency: Currency,
  exchangeRate: number
): number {
  return currency === "USD" ? usdValue : usdValue * exchangeRate;
}

/** Format an already-converted native value as a currency string. */
export function formatAmount(value: number, currency: Currency): string {
  const { locale, code } = CURRENCY_META[currency];
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Convert a USD value to the selected currency and format it.
 * This is the all-in-one function for displaying monetary values.
 */
export function formatCurrencyFromUSD(
  usdValue: number,
  currency: Currency,
  exchangeRate: number
): string {
  const converted = convertAmount(usdValue, currency, exchangeRate);
  return formatAmount(converted, currency);
}

/** Compact axis tick formatter (e.g. ₹1.2L, $45.3k). */
export function formatAxisTick(
  usdValue: number,
  currency: Currency,
  exchangeRate: number
): string {
  const v = convertAmount(usdValue, currency, exchangeRate);
  const sym = CURRENCY_META[currency].symbol;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);

  if (currency === "INR") {
    if (abs >= 10_000_000) return `${sign}${sym}${(abs / 10_000_000).toFixed(1)}Cr`;
    if (abs >= 100_000)    return `${sign}${sym}${(abs / 100_000).toFixed(1)}L`;
    if (abs >= 1_000)      return `${sign}${sym}${(abs / 1_000).toFixed(1)}k`;
    return `${sign}${sym}${abs.toFixed(0)}`;
  }
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${sym}${abs.toFixed(0)}`;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Returns `fc(usdValue)` → formatted string in the selected currency.
 * Components using this will re-render instantly when currency changes.
 */
export function useCurrencyFormatter() {
  const currency     = useCurrencyStore(s => s.currency);
  const exchangeRate = useCurrencyStore(s => s.exchangeRate);
  return useCallback(
    (usdValue: number) => formatCurrencyFromUSD(usdValue, currency, exchangeRate),
    [currency, exchangeRate]
  );
}

/**
 * Returns a compact axis tick formatter for recharts axes.
 * Example: $45.3k  |  ₹38.5L
 */
export function useCurrencyAxisFormatter() {
  const currency     = useCurrencyStore(s => s.currency);
  const exchangeRate = useCurrencyStore(s => s.exchangeRate);
  return useCallback(
    (usdValue: number) => formatAxisTick(usdValue, currency, exchangeRate),
    [currency, exchangeRate]
  );
}

/** Returns the currency symbol character ($, ₹, etc.). */
export function useCurrencySymbol() {
  return useCurrencyStore(s => CURRENCY_META[s.currency].symbol);
}

/** Returns the selected Currency code ("USD" | "INR"). */
export function useSelectedCurrency() {
  return useCurrencyStore(s => s.currency);
}
