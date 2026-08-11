import { useCallback } from "react";
import { useLocation } from "wouter";
import { useChartStore } from "@/store/chartStore";
import { SharedMarketSelector } from "@/components/SharedMarketSelector";

/**
 * Markets page — full-screen market browser + watchlist.
 *
 * Layout: position:absolute inset:0 so it sits behind the fixed bottom nav bar.
 *
 * Symbol selection:
 * - Watchlist tab tap → onWatchlistTap → sets symbol in chartStore then navigates
 *   directly to /charts. No secondary sheet is opened.
 * - Markets tab tap  → onSelect → just updates chartStore.symbol (no navigation).
 *
 * onBack: optional — when provided the SharedMarketSelector renders a back button
 * in its own header (used by DashboardMarketsOverlay so there's no separate header layer).
 */
export default function Markets({
  onBack,
  onWatchlistTap: onWatchlistTapProp,
  onCloseAll,
}: {
  onBack?: () => void;
  onWatchlistTap?: (symbol: string) => void;
  /** Exits the entire Alerts flow and returns to Dashboard (Alerts flow only). */
  onCloseAll?: () => void;
} = {}) {
  const chartSymbol = useChartStore(s => s.symbol);
  const [, navigate] = useLocation();

  // Watchlist row tap: if an override is provided (e.g. from DashboardMarketsOverlay
  // to open the Select Alert Type screen), call it; otherwise go to Charts.
  const handleWatchlistTap = useCallback((symbol: string) => {
    useChartStore.getState().setSymbol(symbol); // also persists to localStorage internally
    if (onWatchlistTapProp) {
      onWatchlistTapProp(symbol);
    } else {
      navigate("/charts");
    }
  }, [navigate, onWatchlistTapProp]);

  // Markets tab row tap: select symbol only, stay on Markets.
  const handleMarketsSelect = useCallback((symbol: string) => {
    useChartStore.getState().setSymbol(symbol); // also persists to localStorage internally
  }, []);

  return (
    <div style={{
      width: "100%",
      height: "100%",
      background: "#000000",
      overflow: "hidden",
    }}>
      {/* Full-screen market browser (watchlist + all markets) */}
      <SharedMarketSelector
        mode="page"
        activeSymbol={chartSymbol}
        onSelect={handleMarketsSelect}
        onWatchlistTap={handleWatchlistTap}
        backAction={onBack}
        closeAllAction={onCloseAll}
      />
    </div>
  );
}
