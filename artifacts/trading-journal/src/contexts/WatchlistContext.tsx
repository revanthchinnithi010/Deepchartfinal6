import { useEffect, type ReactNode } from "react";
import {
  useBrokerWatchlistStore,
  SYMBOL_CATALOG,
  deriveMeta,
} from "@/store/brokerWatchlistStore";

// ── Re-exports for backward compatibility ─────────────────────────────────
export type { WatchlistEntry, CatalogEntry, Market } from "@/store/brokerWatchlistStore";
export { SYMBOL_CATALOG, deriveMeta } from "@/store/brokerWatchlistStore";

// ── useWatchlist — thin hook over the global Zustand store ─────────────────
// All pages (Markets, Charts, MobileChartLayout) read from the same store.
// No prop-drilling or duplicate arrays.
export function useWatchlist() {
  return useBrokerWatchlistStore();
}

// ── WatchlistProvider — triggers initial load, no React state ─────────────
// The store is global; the provider just kicks off refresh() once.
export function WatchlistProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { items, loading, refresh } = useBrokerWatchlistStore.getState();
    if (loading && items.length === 0) {
      // Small delay so the app shell renders first (same as previous context)
      const id = setTimeout(() => { refresh(); }, 1500);
      return () => clearTimeout(id);
    }
  }, []);

  return <>{children}</>;
}

// ── Keep WatchlistEntry interface inline for convenience ───────────────────
// (the real source of truth is brokerWatchlistStore.ts)
export type { BrokerWatchlistState as WatchlistContextValue } from "@/store/brokerWatchlistStore";
