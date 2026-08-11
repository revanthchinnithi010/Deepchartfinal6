import { memo, useMemo, useEffect, useRef, useState, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import {
  useListTrades,
  useGetCalendarHeatmap,
} from "@workspace/api-client-react";
import { useCurrencyFormatter, useCurrencyAxisFormatter } from "@/store/currencyStore";
import { Activity, ChevronRight, ChevronLeft, X, ArrowLeft, TrendingUp, ExternalLink, ImageIcon, Tag, AlertTriangle, FileText } from "lucide-react";
import AccountValueWidget from "@/components/AccountValueWidget";
import DashboardSegmentedControl from "@/components/DashboardSegmentedControl";
import { useCombinedPortfolio } from "@/store/combinedPortfolioStore";
import { useBrokerStore } from "@/store/brokerStore";
import { Link as _Link, useLocation } from "wouter"; // kept for potential future use
import deltaLogoUrl from "@/assets/delta-exchange-logo.svg";
import fusionLogoUrl from "@/assets/fusion-plus-logo.svg";
import { BROKER_MAP, BROKER_INFO, TV_LINKS } from "@/data/sampleData";
import { motion, AnimatePresence } from "motion/react";
import { useTickStore } from "@/store/tickStore";
import { useChartStore } from "@/store/chartStore";
import {
  PageTransition,
} from "@/components/animations";
import { AppHeader } from "@/components/AppHeader";

// Lazy-loaded so it doesn't pull Alerts into the Dashboard chunk
const AlertsPage  = lazy(() => import("@/pages/alerts"));
const MarketsPage = lazy(() => import("@/pages/markets"));

import { SelectAlertTypeOverlay } from "@/components/SelectAlertTypeOverlay";

// ── Dashboard Alerts Overlay ──────────────────────────────────────────────────
// Full-screen portal rendered on top of Dashboard (and bottom nav) without
// navigating away from "/". Bottom nav stays on Dashboard, state is shared
// via the global useAlertStore Zustand store.
const DashboardAlertsOverlay = memo(function DashboardAlertsOverlay() {
  const open    = useChartStore(s => s.dashboardAlertsOpen);
  const setOpen = useChartStore(s => s.setDashboardAlertsOpen);

  // Prevent rendering until first open (avoids blank portal on mount)
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  // Entrance / exit CSS transition — same double-rAF pattern as DayDetailSheet
  const [visible, setVisible] = useState(false);
  const setOpenRef = useRef(setOpen);
  useEffect(() => { setOpenRef.current = setOpen; }, [setOpen]);

  useEffect(() => {
    if (open) {
      let rafId: number;
      const t = setTimeout(() => { rafId = requestAnimationFrame(() => setVisible(true)); }, 0);
      return () => { clearTimeout(t); cancelAnimationFrame(rafId); };
    }
    setVisible(false);
    return undefined;
  }, [open]);

  // Body scroll-lock while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ESC key closes the overlay
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenRef.current(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!hasOpenedRef.current) return null;

  return createPortal(
    <div
      aria-hidden={!open}
      style={{ position: "fixed", inset: 0, zIndex: 90, pointerEvents: open ? "auto" : "none" }}
    >
      {/* Backdrop */}
      <div
        onClick={() => setOpenRef.current(false)}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.45)",
          opacity: visible ? 1 : 0,
          transition: `opacity ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? EASE_OPEN : EASE_CLOSE}`,
        }}
      />

      {/* Full-screen panel — slides up from bottom */}
      <div
        className="transform-gpu"
        style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          background: "var(--dash-overlay-bg)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? EASE_OPEN : EASE_CLOSE}`,
          willChange: "transform",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <AppHeader title="Alerts" onBack={() => setOpenRef.current(false)} />

        {/* ── Scrollable Alerts content ── */}
        <div
          style={{
            flex: 1, overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            willChange: "scroll-position",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="px-5 pt-3 pb-20 md:px-6 md:pt-4 mx-auto max-w-[1400px]">
            <Suspense fallback={null}>
              <AlertsPage />
            </Suspense>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
});

// ── Dashboard Markets Overlay ─────────────────────────────────────────────────
// Full-screen portal rendered on top of Dashboard (and bottom nav) without
// navigating away from "/". Bottom nav stays on Dashboard tab.
//
// When a coin in the Watchlist is tapped, instead of navigating to /charts we
// show the SelectAlertTypeOverlay (push from right) so the user can pick an
// alert type for that symbol.
const DashboardMarketsOverlay = memo(function DashboardMarketsOverlay({
  onWatchlistTap,
  onCloseAll,
}: {
  onWatchlistTap: (symbol: string) => void;
  /** Exits the entire Alerts flow and returns to Dashboard. */
  onCloseAll: () => void;
}) {
  const open    = useChartStore(s => s.dashboardMarketsOpen);
  const setOpen = useChartStore(s => s.setDashboardMarketsOpen);

  // Prevent rendering until first open (avoids blank portal on mount)
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  // Entrance / exit CSS transition — same double-rAF pattern as DashboardAlertsOverlay
  const [visible, setVisible] = useState(false);
  const setOpenRef = useRef(setOpen);
  useEffect(() => { setOpenRef.current = setOpen; }, [setOpen]);

  useEffect(() => {
    if (open) {
      let rafId: number;
      const t = setTimeout(() => { rafId = requestAnimationFrame(() => setVisible(true)); }, 0);
      return () => { clearTimeout(t); cancelAnimationFrame(rafId); };
    }
    setVisible(false);
    return undefined;
  }, [open]);

  // Body scroll-lock while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ESC key closes the overlay
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenRef.current(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!hasOpenedRef.current) return null;

  return createPortal(
    <div
      aria-hidden={!open}
      style={{ position: "fixed", inset: 0, zIndex: 90, pointerEvents: open ? "auto" : "none" }}
    >
      {/* Full-screen panel — slides in from right */}
      <div
        className="transform-gpu"
        style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          background: "var(--dash-overlay-bg)",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: `transform ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? EASE_OPEN : EASE_CLOSE}`,
          willChange: "transform",
          overflow: "hidden",
        }}
      >
        {/* ── Markets content — back button lives inside SharedMarketSelector header ── */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <Suspense fallback={null}>
            <MarketsPage
              onBack={() => setOpenRef.current(false)}
              onWatchlistTap={onWatchlistTap}
              onCloseAll={onCloseAll}
            />
          </Suspense>
        </div>
      </div>
    </div>,
    document.body,
  );
});

const DASHBOARD_TIMEOUT_MS = 2_000;


const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  borderColor: "rgba(57, 91, 67, 0.3)",
  borderRadius: "12px",
  boxShadow: "0 8px 28px rgba(7, 17, 13, 0.65)",
  fontSize: "12px",
  padding: "8px 12px",
};


// ── Calendar Heatmap ──────────────────────────────────────────────────────────
// ── Day Detail Sheet ──────────────────────────────────────────────────────────
import { COMPOSITOR_EASE as EASE_OPEN, COMPOSITOR_EASE_CLOSE as EASE_CLOSE, tweenStandard, TAP_TRANSITION } from "@/animations/motion";
const DUR_OPEN   = 320; // sheet-level open — larger surface needs more time
const DUR_CLOSE  = 240;

type DashTrade = {
  id: number; symbol: string; side: string; pnl?: number | null;
  entryPrice?: number | null; exitPrice?: number | null; quantity: number;
  riskRewardRatio?: number | null; stopLoss?: number | null; takeProfit?: number | null;
  entryDate: string; tvLink?: string | null; screenshot?: string | null;
  setupTags?: string | null; mistakeTags?: string | null; notes?: string | null;
};

const DayDetailSheet = memo(function DayDetailSheet({
  date, open, onClose,
}: {
  date: string;
  open: boolean;
  onClose: () => void;
}) {
  const fc  = useCurrencyFormatter();
  const { data, isLoading } = useListTrades(
    { date, limit: 100 },
    { query: { enabled: open && !!date } },
  );
  const dayTrades = (data?.trades ?? []) as DashTrade[];
  const wins      = dayTrades.filter((t: DashTrade) => (t.pnl ?? 0) > 0).length;
  const losses    = dayTrades.filter((t: DashTrade) => (t.pnl ?? 0) < 0).length;
  const dailyPnl  = dayTrades.reduce((sum: number, t: DashTrade) => sum + (t.pnl ?? 0), 0);

  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const selectedTrade = selectedTradeId != null
    ? (dayTrades.find(t => t.id === selectedTradeId) ?? null)
    : null;

  /* hasOpenedRef prevents a null/empty render before the first open */
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  /* visible drives the CSS transition — double-rAF guarantees the browser
     paints the closed position (translateY 100%) before the slide starts */
  const [visible, setVisible] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (open) {
      let raf: number;
      const t = setTimeout(() => { raf = requestAnimationFrame(() => setVisible(true)); }, 0);
      return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    }
    setVisible(false);
    setSelectedTradeId(null);
    return undefined;
  }, [open]);

  /* Body scroll-lock */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  /* ESC key */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  const label = useMemo(() => {
    if (!date) return "";
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }, [date]);

  const stopProp = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  if (!hasOpenedRef.current) return null;

  return createPortal(
    <div
      aria-hidden={!open}
      style={{ position: "fixed", inset: 0, zIndex: 75, pointerEvents: open ? "auto" : "none" }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          opacity: visible ? 1 : 0,
          transition: `opacity ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? EASE_OPEN : EASE_CLOSE}`,
        }}
      />

      {/* Sheet — slides up from bottom */}
      <div
        onClick={stopProp}
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          height: "85dvh",
          display: "flex", flexDirection: "column",
          background: "var(--dash-sheet-bg)",
          borderRadius: "20px 20px 0 0",
          borderTop: "1px solid var(--dash-sheet-border)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? EASE_OPEN : EASE_CLOSE}`,
          willChange: "transform",
          overflow: "hidden",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className="transform-gpu"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--dash-handle-bg)" }} />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 mt-1 mb-4 flex-shrink-0">
          <div>
            <p className="text-[11px] text-muted-foreground/60 uppercase tracking-widest mb-0.5">Daily Summary</p>
            <p className="text-[15px] font-semibold text-foreground">{label}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary row */}
        <div className="flex gap-2 px-5 mb-4 flex-shrink-0">
          <div className="dash-account-card dash-account-card-dim flex-1 p-3">
            <p className="text-[10px] mb-1" style={{ color: "var(--stat-sub)" }}>Net P&amp;L</p>
            <p className={`text-[16px] font-bold ${dailyPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {dailyPnl >= 0 ? "+" : ""}{fc(dailyPnl)}
            </p>
            {dailyPnl > 0 && <p className="text-[10px] mt-1" style={{ color: "var(--stat-sub)" }}>Congrats, your day is profitable!</p>}
            {dailyPnl < 0 && <p className="text-[10px] mt-1" style={{ color: "var(--stat-sub)" }}>Stay disciplined. Better trades ahead.</p>}
          </div>
          <div className="flex-1 p-3 pt-5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[13px] text-muted-foreground font-semibold">Total Trades:</span>
              <span className="inline-flex items-center justify-center h-[18px] px-3.5 rounded-full bg-primary/20 text-primary text-[11px] font-bold leading-none">{dayTrades.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] text-muted-foreground font-semibold">Win:</span>
                <span className="inline-flex items-center justify-center h-[22px] px-3 rounded-lg text-[12px] font-bold leading-none" style={{ background: "rgba(16,185,129,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>{wins}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] text-muted-foreground font-semibold">Loss:</span>
                <span className="inline-flex items-center justify-center h-[22px] px-3 rounded-lg text-[12px] font-bold leading-none" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>{losses}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trade list header */}
        <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
          <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Trades</p>
          {!isLoading && dayTrades.length > 0 && (
            <span className="text-[11px] font-semibold text-muted-foreground/60">{dayTrades.length}</span>
          )}
        </div>

        {/* Trade list */}
        <div className="overflow-y-auto flex-1 pb-8 px-5" style={{ overscrollBehavior: "contain" }}>
          <div className="dash-account-card dash-account-card-dim overflow-hidden">
            {isLoading && (
              <div>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ padding: "12px 20px", borderBottom: i < 2 ? `1px solid var(--dash-metric-border)` : "none" }}>
                    <div className="flex items-center justify-between">
                      <div className="h-4 w-28 rounded-lg shimmer-loading" />
                      <div className="h-4 w-16 rounded-lg shimmer-loading" />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="h-3 w-20 rounded shimmer-loading" />
                      <div className="h-3 w-14 rounded shimmer-loading" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isLoading && dayTrades.length === 0 && (
              <div className="text-center py-10">
                <p className="text-white/40 text-sm">No trades for this day.</p>
              </div>
            )}
            {!isLoading && dayTrades.map((trade, idx) => {
              const isLast  = idx === dayTrades.length - 1;
              const pnl     = trade.pnl ?? 0;
              const isWin   = pnl >= 0;
              const fPrice  = (v: number) => v < 1 ? v.toFixed(4) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
              const dateStr = trade.entryDate
                ? new Date(trade.entryDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                : "";
              return (
                <div
                  key={trade.id}
                  onClick={() => setSelectedTradeId(trade.id)}
                  style={{
                    padding: "12px 20px",
                    borderBottom: isLast ? "none" : "1px solid var(--dash-metric-border)",
                    WebkitTapHighlightColor: "transparent",
                    transition: "background 0.15s",
                    cursor: "pointer",
                  }}
                  onPointerDown={e => (e.currentTarget.style.background = "var(--elevate-2)")}
                  onPointerUp={e => (e.currentTarget.style.background = "transparent")}
                  onPointerLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold leading-none text-foreground" style={{ fontSize: 15 }}>{trade.symbol}</span>
                      <span className="font-semibold leading-none" style={{ fontSize: 10, color: trade.side === "long" ? "#22C55E" : "#EF4444", letterSpacing: "0.06em" }}>
                        {trade.side === "long" ? "LONG" : "SHORT"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold leading-none tabular-nums" style={{ fontSize: 14, color: isWin ? "#22C55E" : "#EF4444" }}>
                        {isWin ? "+" : ""}{fc(pnl)}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-foreground/20" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                    <div className="flex items-center gap-0.5">
                      <span className="font-medium tabular-nums text-muted-foreground" style={{ fontSize: 12 }}>{fPrice(trade.entryPrice ?? 0)}</span>
                      <span className="text-foreground/25 mx-0.5" style={{ fontSize: 11 }}>→</span>
                      <span className="font-medium tabular-nums text-muted-foreground" style={{ fontSize: 12 }}>
                        {trade.exitPrice != null ? fPrice(trade.exitPrice) : "—"}
                      </span>
                    </div>
                    <span className="font-medium tabular-nums text-muted-foreground" style={{ fontSize: 12 }}>{dateStr}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trade detail overlay — slides in from the right */}
        <AnimatePresence>
          {selectedTrade && (
            <motion.div
              key="trade-detail"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={tweenStandard}
              style={{
                position: "absolute", inset: 0,
                background: "var(--dash-overlay-bg)",
                zIndex: 10,
                display: "flex", flexDirection: "column",
                overflowY: "auto",
                borderRadius: "inherit",
              }}
            >
              {/* Nav header — symbol + side badge folded in */}
              <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0" style={{ background: "var(--dash-overlay-bg)", borderBottom: "1px solid var(--dash-metric-divider)" }}>
                <button
                  onClick={() => setSelectedTradeId(null)}
                  className="flex items-center justify-center w-8 h-8 rounded-full text-foreground/70 hover:text-foreground hover:bg-foreground/10 transition-colors flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-foreground leading-tight truncate">{selectedTrade.symbol}</p>
                  <p className="text-[10px] font-semibold leading-tight" style={{ color: selectedTrade.side === "long" ? "#22C55E" : "#EF4444" }}>
                    {selectedTrade.side === "long" ? "LONG" : "SHORT"}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ${selectedTrade.side === "long" ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" : "bg-orange-500/15 text-orange-400 border border-orange-500/20"}`}>
                  Trade Details
                </span>
              </div>

              {/* Metrics + rest — no gap, content starts immediately */}
              <div className="px-4 pt-3 pb-4 space-y-5">
                {/* Date + PnL — open strip, no card box */}
                <div className="flex items-center justify-between px-1 pb-1" style={{ borderBottom: "1px solid var(--dash-metric-divider)" }}>
                  <div>
                    <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-0.5">Date</p>
                    <p className="text-[13px] font-semibold text-foreground/80">
                      {new Date(selectedTrade.entryDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-0.5">
                      {(selectedTrade.pnl ?? 0) >= 0 ? "Profit" : "Loss"}
                    </p>
                    <p className="text-[20px] font-black leading-tight" style={{ color: (selectedTrade.pnl ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>
                      {(selectedTrade.pnl ?? 0) >= 0 ? "+" : ""}{fc(selectedTrade.pnl ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: "Entry",         value: fc(selectedTrade.entryPrice ?? 0) },
                    { label: "Exit",          value: selectedTrade.exitPrice == null ? "—" : fc(selectedTrade.exitPrice) },
                    { label: "Risk / Reward", value: selectedTrade.riskRewardRatio ? `${selectedTrade.riskRewardRatio.toFixed(2)}R` : "—" },
                    { label: "Quantity",      value: String(selectedTrade.quantity) },
                    { label: "Stop Loss",     value: selectedTrade.stopLoss ? fc(selectedTrade.stopLoss) : "—" },
                    { label: "Take Profit",   value: selectedTrade.takeProfit ? fc(selectedTrade.takeProfit) : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 rounded-xl border" style={{ background: "var(--dash-metric-bg)", borderColor: "var(--dash-metric-border)" }}>
                      <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">{label}</p>
                      <p className="text-[14px] font-bold font-mono leading-tight text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Analysis</p>
                  {(selectedTrade.tvLink || TV_LINKS[selectedTrade.symbol as keyof typeof TV_LINKS]) ? (
                    <button className="tv-chart-btn w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[13px] font-semibold"
                      onClick={() => window.open(selectedTrade.tvLink || TV_LINKS[selectedTrade.symbol as keyof typeof TV_LINKS], "_blank")}>
                      <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4" />Open TradingView Chart</div>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </button>
                  ) : (
                    <div className="px-4 py-2.5 rounded-xl border border-dashed border-border text-[12px] text-muted-foreground italic">No chart linked</div>
                  )}
                  {selectedTrade.screenshot ? (
                    <div className="rounded-xl overflow-hidden border border-border cursor-pointer group relative" onClick={() => window.open(selectedTrade.screenshot!, "_blank")}>
                      <img src={selectedTrade.screenshot} alt="Trade Screenshot" className="w-full max-h-44 object-cover group-hover:opacity-90 transition-opacity" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30"><ExternalLink className="w-5 h-5 text-white" /></div>
                    </div>
                  ) : (
                    <div className="h-20 rounded-xl border border-dashed border-border flex items-center justify-center gap-2 text-[12px] text-muted-foreground italic">
                      <ImageIcon className="w-4 h-4 opacity-50" /> No screenshot attached
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Tags</p>
                  {selectedTrade.setupTags && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1"><Tag className="w-3 h-3" /> Setup</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTrade.setupTags.split(",").filter(Boolean).map(tag => (
                          <span key={tag} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-primary/12 text-primary border border-primary/20">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedTrade.mistakeTags && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-destructive/70" /> Mistakes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTrade.mistakeTags.split(",").filter(Boolean).map(tag => (
                          <span key={tag} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-destructive/10 text-destructive border border-destructive/20">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!selectedTrade.setupTags && !selectedTrade.mistakeTags && (
                    <p className="text-[12px] text-muted-foreground italic">No tags recorded</p>
                  )}
                </div>
                <div className="space-y-2 pb-8">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1"><FileText className="w-3 h-3" /> Journal Notes</p>
                  {selectedTrade.notes ? (
                    <div className="p-4 rounded-xl text-[13px] leading-relaxed text-foreground/70" style={{ background: "var(--dash-metric-bg)", border: "1px solid var(--dash-metric-border)" }}>{selectedTrade.notes}</div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground italic">No notes recorded for this trade.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
});

// ── Calendar Heatmap ──────────────────────────────────────────────────────────
const CalendarHeatmap = memo(function CalendarHeatmap({
  data, year, month, onPrev, onNext, onDateClick,
}: { data: Array<{ date: string; pnl: number; trades: number }>; year: number; month: number; onPrev: () => void; onNext: () => void; onDateClick: (date: string) => void }) {
  const fc            = useCurrencyFormatter();
  const axisFormatter = useCurrencyAxisFormatter();

  // `data` comes from the calendar-heatmap API response. It is typed as an
  // array, but that's only a compile-time guarantee — if the backend ever
  // returns an error envelope, a paginated wrapper object, null, or the
  // query simply hasn't resolved yet, `data` can arrive as something other
  // than an array at runtime. Normalize once here so every array method
  // below (.forEach/.map/.reduce/.length) is guaranteed to have an array,
  // instead of throwing "x.forEach is not a function".
  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const dayMap = useMemo(() => {
    const m: Record<string, { pnl: number; trades: number }> = {};
    safeData.forEach((d) => { m[d.date] = { pnl: d.pnl, trades: d.trades }; });
    return m;
  }, [safeData]);

  const maxAbs = useMemo(() => Math.max(...safeData.map((d) => Math.abs(d.pnl)), 1), [safeData]);
  const firstDay = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const monthName = useMemo(
    () => new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [year, month]
  );

  const [statsTooltip, setStatsTooltip] = useState(false);

  useEffect(() => {
    if (!statsTooltip) return;
    const close = () => setStatsTooltip(false);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("touchmove", close, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("touchmove", close, { capture: true });
    };
  }, [statsTooltip]);

  const monthlyPnl = useMemo(() => safeData.reduce((sum, d) => sum + d.pnl, 0), [safeData]);

  const remainingDays = useMemo(() => {
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    if (!isCurrentMonth) return 0;
    return daysInMonth - today.getDate();
  }, [year, month, daysInMonth]);

  const cellStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    Object.entries(dayMap).forEach(([dateStr, d]) => {
      if (!d || d.trades === 0) return;
      const intensity = Math.min(Math.abs(d.pnl) / maxAbs, 1);
      if (d.pnl > 0) styles[dateStr] = { backgroundColor: `rgba(52,211,153,${0.12 + intensity * 0.55})`, borderColor: `rgba(52,211,153,${0.2 + intensity * 0.3})` };
      else if (d.pnl < 0) styles[dateStr] = { backgroundColor: `rgba(248,113,113,${0.12 + intensity * 0.55})`, borderColor: `rgba(248,113,113,${0.2 + intensity * 0.3})` };
      else styles[dateStr] = { backgroundColor: "var(--dash-metric-bg)", borderColor: "var(--dash-metric-border)" };
    });
    return styles;
  }, [dayMap, maxAbs]);

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  const days: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const entry = dayMap[dateStr];
    const isToday = dateStr === todayStr;
    days.push(
      <div
        key={dateStr}
        onClick={() => entry && entry.trades > 0 && onDateClick(dateStr)}
        className={`relative rounded-lg aspect-square flex flex-col items-center justify-center border transition-opacity active:opacity-60 ${
          entry && entry.trades > 0 ? "cursor-pointer" : "cursor-default"
        }`}
        style={{
          ...cellStyles[dateStr],
          ...(isToday ? { outline: "2px solid #f97316", outlineOffset: "-1px" } : {}),
        }}
      >
        <span className="text-[10px] font-semibold leading-none" style={{ color: "var(--dash-cal-day-color)" }}>{d}</span>
        {entry && entry.trades > 0 && (
          <span className="text-[9px] font-bold leading-none mt-0.5" style={{ color: "var(--dash-cal-day-color)" }}>
            {entry.pnl > 0 ? "+" : entry.pnl < 0 ? "-" : ""}{axisFormatter(Math.abs(entry.pnl))}
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 flex items-center justify-between mb-3">
        {/* left: month navigator */}
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground px-1">{monthName}</span>
          <button
            onClick={onNext}
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {/* right: monthly stats */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setStatsTooltip((v) => !v)}
              className="text-[11px] font-medium text-muted-foreground border-b border-dashed border-muted-foreground/50 leading-none pb-px cursor-pointer select-none"
            >
              Monthly stats:
            </button>
            {statsTooltip && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setStatsTooltip(false)} />
                <div className="absolute right-0 top-full mt-2 z-40 w-52 rounded-xl border border-border shadow-2xl px-3 py-2.5" style={{ background: "var(--dash-tooltip-bg)" }}>
                  <p className="text-[11px] font-semibold text-foreground mb-1">Monthly Stats</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Total realised P&L for the selected month, calculated from all closed trades on trading days.
                  </p>
                  {remainingDays > 0 && (
                    <p className="text-[10px] text-primary mt-1.5">
                      {remainingDays} trading days remaining this month.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          {safeData.length > 0 && (
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                monthlyPnl >= 0
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {monthlyPnl >= 0 ? "+" : ""}{axisFormatter(monthlyPnl)}
            </span>
          )}
          {remainingDays > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary">
              {remainingDays} days
            </span>
          )}
        </div>
      </div>
      <div className="px-3">
        <div className="grid grid-cols-7 gap-1 mb-1.5">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-0.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">{days}</div>
      </div>
    </div>
  );
});

const Dashboard = memo(function Dashboard() {
  const mountTimeRef  = useRef(performance.now());
  const [timedOut,          setTimedOut]          = useState(false);
  const ticks         = useTickStore(s => s.ticks);
  const fc            = useCurrencyFormatter();
  const setDashboardMarketsOpen = useChartStore(s => s.setDashboardMarketsOpen);
  const [, navigate]  = useLocation();

  useEffect(() => {
    console.log("[Dashboard] mount");
    const t = setTimeout(() => {
      console.log("[Dashboard] loading timeout reached — rendering with available data");
      setTimedOut(true);
    }, DASHBOARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const { isLoading: tradesLoading, isError: tradesError }
    = useListTrades({ limit: 1 });

  const combined = useCombinedPortfolio();
  const brokerOrdersCount = useBrokerStore(s =>
    Object.values(s.brokerOrders).reduce((sum, o) => sum + o.length, 0));

  useEffect(() => {
    if (!tradesLoading && !timedOut) {
      const elapsed = Math.round(performance.now() - mountTimeRef.current);
      console.log(`[Dashboard] loading complete in ${elapsed}ms — trades:${!tradesError}`);
      setTimedOut(true);
    }
  }, [tradesLoading, timedOut, tradesError]);

  const now = useMemo(() => new Date(), []);
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  const handleCalPrev = useCallback(() => {
    setCalMonth((m) => { if (m === 1) { setCalYear((y) => y - 1); return 12; } return m - 1; });
  }, []);
  const handleCalNext = useCallback(() => {
    setCalMonth((m) => { if (m === 12) { setCalYear((y) => y + 1); return 1; } return m + 1; });
  }, []);

  const { data: calData } = useGetCalendarHeatmap({ year: calYear, month: calMonth });

  // ── Select Alert Type state — lifted here so SelectAlertTypeOverlay is a
  //    top-level portal sibling (same level as DashboardAlertsOverlay), NOT
  //    nested inside DashboardMarketsOverlay's portal tree. This prevents any
  //    containing-block leakage from DashboardMarketsOverlay's inner panel.
  const [alertSymbol, setAlertSymbol] = useState<string | null>(null);
  const handleWatchlistTap   = useCallback((symbol: string) => setAlertSymbol(symbol), []);
  const handleAlertTypeClose = useCallback(() => setAlertSymbol(null), []);

  // Close the entire Alerts flow: dismiss Markets overlay + Select Alert Type overlay.
  const handleCloseAlertsFlow = useCallback(() => {
    setDashboardMarketsOpen(false);
    setAlertSymbol(null);
  }, [setDashboardMarketsOpen]);

  const setDashboardSheetOpen = useChartStore(s => s.setDashboardSheetOpen);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [sheetOpen,    setSheetOpen]    = useState(false);

  const openSheet = useCallback((v: boolean) => {
    setSheetOpen(v);
    setDashboardSheetOpen(v);
  }, [setDashboardSheetOpen]);

  const handleDateClick = useCallback((date: string) => {
    setSelectedDate(date);
    openSheet(true);
  }, [openSheet]);

  const isStillLoading = !timedOut && tradesLoading;

  const openPositionsCount = useBrokerStore(s =>
    Object.values(s.brokerPositions).reduce((sum, p) => sum + p.length, 0));

  if (isStillLoading) {
    // Structurally mirrors every section of the real content below, at the
    // same fixed heights (AccountValueWidget ≈176px, calendar card ≈302px,
    // recent trades table). Matching heights exactly means the eventual
    // swap to real content never shifts layout — this only ever runs once
    // now that Dashboard is kept mounted (see DASHBOARD_NODE in App.tsx),
    // not on every tab switch.
    return (
      <div className="min-h-full space-y-4 pb-12" style={{ background: "var(--dash-bg)" }}>
        <div className="dash-card shimmer-loading" style={{ height: 176 }} />
        <div className="dash-card shimmer-loading" style={{ height: 302 }} />
      </div>
    );
  }

  const apiOffline = tradesError;

  return (
    <PageTransition className="space-y-4 pb-12" style={{ minHeight: "100%", background: "var(--dash-bg)" }} fill={false}>

      {apiOffline && (
        <div className="dash-card px-5 py-3 flex items-center gap-3 border-amber-500/20 bg-amber-500/[0.04]">
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <p className="text-[12px] text-amber-400 font-medium">
            API server offline — dashboard showing cached or empty data
          </p>
        </div>
      )}

      {/* ── Segmented control — Dashboard / Reports ──
          Selection is derived from the current route, not local state, so
          it self-corrects when the user navigates back from Reports. */}
      <DashboardSegmentedControl />

      {/* ── Account Value Widget — -mt-2 closes the gap with the segmented control ── */}
      <div className="-mt-2">
        <AccountValueWidget
          accountValueUSD={combined.usd.accountValue}
          accountValueDisplay={combined.display.accountValue}
          upnlUSD={combined.usd.unrealizedPnl}
          upnlDisplay={combined.display.unrealizedPnl}
          realizedPnlUSD={combined.usd.realizedPnl}
          realizedPnlDisplay={combined.display.realizedPnl}
          netPnlUSD={combined.usd.netPnl}
          netPnlDisplay={combined.display.netPnl}
          openPositions={openPositionsCount}
          openOrders={brokerOrdersCount}
        />
      </div>

      {/* ── Quick Access Row: Alerts · Fusion+ · Delta ── */}
      <div className="flex items-center gap-3">
        {/* Alerts — unchanged */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          transition={TAP_TRANSITION}
          onClick={() => setDashboardMarketsOpen(true)}
          className="flex flex-col items-center gap-2"
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "var(--dash-quick-btn-bg)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 478 501" width={34} height={34}>
              <path d="m49.7 49.8l-49.7 49.7 10.2 9.6c5.7 5.3 10.5 9.5 10.7 9.3 0.5-0.5-0.9-1.8-12.7-12.3l-7.3-6.5 49.8-49.8c27.4-27.4 49.6-49.8 49.3-49.8-0.3 0-22.9 22.4-50.3 49.8zm51.3-48.5c0 0.2 4.5 4.1 10 8.7 5.5 4.5 10 8.4 10 8.5 0 0.1-21.8 22-48.5 48.7-26.7 26.7-48.5 49-48.5 49.7 0 0.6 3.2-2.4 7.1-6.6 4-4.3 26-26.5 49-49.4 23.1-22.9 41.9-41.9 41.9-42.2 0-0.6-19.8-17.7-20.5-17.7-0.3 0-0.5 0.1-0.5 0.3zm271.1 7.8c-12.8 10.6-12.8 10.6-11.2 12.1 1 1.1 1.1 1 0.6-0.3-0.4-1.2 2-3.8 9.1-9.5 5.4-4.4 10.2-8.2 10.8-8.6 0.6-0.4 0.8-0.9 0.6-1.1-0.3-0.2-4.7 3.1-9.9 7.4zm11.5-5.1c3.4 5 65.7 82.9 70.8 88.5 2 2.2-12.8-16.7-33-42-32.5-40.9-41.3-51.7-37.8-46.5zm-15.5 26.7c2.9 3.8 8 10.2 11.4 14.3 3.4 4.1 11.4 14.3 17.8 22.7 6.5 8.4 12.3 15.6 12.9 15.9 0.7 0.4-1-2.1-3.8-5.5-2.7-3.5-6.5-8.4-8.4-11-6.7-8.9-34.2-43.1-34.7-43.1-0.3 0 1.9 3 4.8 6.7zm-151.9 20c4.8 0.2 12.9 0.2 18 0 5.1-0.1 1.2-0.3-8.7-0.3-9.9 0-14.1 0.2-9.3 0.3zm-23.2 1.6c-3.6 0.5-6 1.1-5.5 1.3 0.6 0.2 5.3-0.2 10.5-1 5.2-0.8 7.7-1.4 5.5-1.4-2.2 0-6.9 0.5-10.5 1.1zm51.1-0.9c0.2 0.2 3.8 0.6 7.9 0.9 4.4 0.3 6.3 0.2 4.5-0.3-3-0.8-13.2-1.3-12.4-0.6zm19.4 2.6c1.7 0.4 3.9 0.8 5 0.8 1.6 0 1.5-0.2-0.5-0.8-1.4-0.4-3.6-0.8-5-0.8-2.2 0-2.2 0.1 0.5 0.8zm-81.2 0.7c0.9 0.2 2.3 0.2 3 0 0.6-0.3-0.1-0.5-1.8-0.5-1.6 0-2.2 0.2-1.2 0.5zm-6.8 1.3c-1.3 0.5-1.4 0.9-0.5 0.9 0.8 0 2.4-0.4 3.5-0.9 1.3-0.5 1.4-0.9 0.5-0.9-0.8 0-2.4 0.4-3.5 0.9zm100 0.6c2.8 0.7 5.7 1.3 6.5 1.3 0.8 0-0.7-0.7-3.5-1.5-2.7-0.7-5.7-1.3-6.5-1.3-0.8 0 0.8 0.7 3.5 1.5zm-114.8 3.6c-4.9 1.6-8.7 3.2-8.5 3.4 0.2 0.2 5.1-1.2 10.8-3.1 5.8-1.9 9.6-3.4 8.5-3.4-1.1 0-6 1.4-10.8 3.1zm129.7 0.4c3.8 1.3 7.1 2.2 7.3 2 0.5-0.5-11.6-4.6-13.1-4.5-0.6 0 2 1.1 5.8 2.5zm-148.9 7c-4.4 1.9-8.4 3.9-8.9 4.4-0.9 0.9 17.2-6.7 18.3-7.6 1.3-1.2-2.4 0.1-9.4 3.2zm167.6-0.2c0.2 0.2 1.5 0.9 2.9 1.5 2.4 1.1 2.4 1.1 0.6-0.3-1.6-1.3-4.9-2.4-3.5-1.2zm6 3c1 0.9 6.9 3.6 6.9 3.2 0-0.6-5.5-3.6-6.6-3.6-0.4 0-0.5 0.2-0.3 0.4zm-189.8 5.6c-2.9 1.7-5.3 3.3-5.3 3.6 0 0.6 8.8-4.2 10.5-5.7 1.6-1.6 0.1-0.9-5.2 2.1zm199.7-0.7c0.3 0.3 4.8 3.3 10 6.7 5.2 3.4 12.9 8.9 17 12.2 6.1 4.8 6.6 5.1 2.5 1.3-6.1-5.6-33.1-24.1-29.5-20.2zm-99.7 4.4c1.5 0.2 3.9 0.2 5.5 0 1.5-0.2 0.2-0.4-2.8-0.4-3 0-4.3 0.2-2.7 0.4zm-112.5 4.2c-14 9.8-28.1 22.3-38.4 34-10.4 11.8-25.1 33.9-28.5 42.9-1.6 4.1-0.4 2.4 4.2-6.3 14.5-27.6 36.8-51.8 67-72.7 1.3-0.9 2.1-1.7 1.8-1.7-0.3-0.1-3.1 1.7-6.1 3.8zm97.5-3.2c1.5 0.2 3.9 0.2 5.5 0 1.5-0.2 0.2-0.4-2.8-0.4-3 0-4.3 0.2-2.7 0.4zm27.5 0c1.7 0.2 4.7 0.2 6.5 0 1.7-0.2 0.3-0.4-3.3-0.4-3.6 0-5 0.2-3.2 0.4zm-45.2 1.9c-3.8 0.7-7.1 1.6-7.5 2-0.3 0.3 1 0.3 2.9-0.1 1.9-0.4 7.1-1.4 11.5-2 5.1-0.9 6.6-1.3 4-1.3-2.2 0-7.1 0.6-10.9 1.4zm56.7-0.9c0.9 0.2 2.5 0.2 3.5 0 0.9-0.3 0.1-0.5-1.8-0.5-1.9 0-2.7 0.2-1.7 0.5zm6.5 1c0.6 0.2 1.8 0.2 2.5 0 0.6-0.3 0.1-0.5-1.3-0.5-1.4 0-1.9 0.2-1.2 0.5zm6.7 1.3c1.7 0.4 3.9 0.8 5 0.8 1.6 0 1.5-0.2-0.5-0.8-1.4-0.4-3.6-0.8-5-0.8-2.2 0-2.2 0.1 0.5 0.8zm-88 3.4c-13.5 4.5-31 12.4-36.5 16.6-1.4 1 3.6-1.2 11-4.9 7.5-3.7 18.5-8.4 24.5-10.4 6.1-2 10.3-3.6 9.5-3.6-0.8 0-4.6 1-8.5 2.3zm97-1.4c1.1 0.5 2.7 0.9 3.5 0.9 0.9 0 0.8-0.4-0.5-0.9-1.1-0.5-2.7-0.9-3.5-0.9-0.9 0-0.8 0.4 0.5 0.9zm141 1c1 1.1 2 2 2.3 2 0.3 0-0.3-0.9-1.3-2-1-1.1-2-2-2.3-2-0.3 0 0.3 0.9 1.3 2zm-134 1c2.7 1.2 4.3 1.2 2.5 0-0.8-0.5-2.2-0.9-3-0.9-1 0-0.8 0.3 0.5 0.9zm4.5 1.3c0.3 0.3 4.1 1.9 8.5 3.7 4.4 1.7 9.5 4 11.3 5.1 4.1 2.3 5.5 2.5 2.3 0.3-3.6-2.6-23.7-10.8-22.1-9.1zm-241.6 1.6c-20.7 14.8-38.4 36-51 60.9-5.4 10.8-4.1 9.7 1.8-1.5 13.3-25.2 27.1-41.7 48-57.3 4-3 7.6-5.8 8.2-6.3 2.1-2-0.4-0.5-7 4.2zm193.5-2.7c0 0.2 0.8 1 1.8 1.7 1.5 1.3 1.6 1.2 0.3-0.4-1.3-1.6-2.1-2.1-2.1-1.3zm7 5.3c15.6 12.7 25.5 22.9 35.1 36.3 8.3 11.6 9 12.6 8.3 11-5.2-10.9-30.7-39.5-41.9-46.8-4.2-2.8-4.4-2.9-1.5-0.5zm-256 5.4c0 2.5 0.2 3.5 0.4 2.2 0.2-1.2 0.2-3.2 0-4.5-0.2-1.2-0.4-0.2-0.4 2.3zm17.4-3.3l9.2 0.4 0.4 5.2 0.3 5.2 0.2-5.8 0.2-5.7-9.7 0.2-9.8 0.2zm-18.3 21.3c0 6.3 0.1 8.9 0.3 5.7 0.2-3.1 0.2-8.3 0-11.5-0.2-3.1-0.3-0.5-0.3 5.8zm27 6c0 8.5 0.2 12 0.3 7.7 0.2-4.2 0.2-11.2 0-15.5-0.1-4.2-0.3-0.7-0.3 7.8zm-187.7 10.6c0 7.4 0.1 10.5 0.3 6.7 0.2-3.7 0.2-9.7 0-13.5-0.2-3.7-0.3-0.6-0.3 6.8zm156.1-5c0.9 1.6 1.8 3 2.1 3 0.2 0-0.2-1.4-1.1-3-0.9-1.7-1.8-3-2.1-3-0.2 0 0.2 1.3 1.1 3zm203.4 7c0 7.7 0.2 10.7 0.3 6.7 0.2-4 0.2-10.3 0-14-0.2-3.7-0.3-0.4-0.3 7.3zm-208.2 13v10.4l-5.7 0.4-5.8 0.3 6.3 0.2 6.2 0.2v-11c0-6.1-0.2-11-0.5-11-0.3 0-0.5 4.7-0.5 10.5zm209.3-6c0 2.2 0.2 3 0.4 1.7 0.2-1.2 0.2-3 0-4-0.3-0.9-0.5 0.1-0.4 2.3zm-397 9.5c0 4.1 0.2 5.8 0.4 3.7 0.2-2 0.2-5.4 0-7.5-0.2-2-0.4-0.3-0.4 3.8zm33-1.5c0 2.7 0.2 3.8 0.4 2.2 0.2-1.5 0.2-3.7 0-5-0.2-1.2-0.4 0-0.4 2.8zm181.7 12.5c0 9.5 0.2 17.1 0.5 16.9 0.6-0.7 0.8-33 0.1-33.6-0.3-0.4-0.6 7.2-0.6 16.7zm183.3-11.5c0 2.7 0.2 3.8 0.4 2.2 0.2-1.5 0.2-3.7 0-5-0.2-1.2-0.4 0-0.4 2.8zm-365.9 14.5c0 5.8 0.1 8.1 0.3 5.2 0.2-2.8 0.2-7.6 0-10.5-0.2-2.8-0.3-0.5-0.3 5.3zm78.2-8.4c-0.3 0.9-0.5 6.1-0.4 11.7l0.2 10.2 0.5-11 0.6-11 6.5-0.6 6.5-0.6-6.6-0.1c-5.3-0.2-6.8 0.1-7.3 1.4zm21.2 0.1c3.4 0.2 8.8 0.2 12 0 3.1-0.2 0.3-0.3-6.3-0.3-6.6 0-9.2 0.1-5.7 0.3zm267.6 12.3c0 7.4 0.1 10.5 0.3 6.7 0.2-3.7 0.2-9.7 0-13.5-0.2-3.7-0.3-0.6-0.3 6.8zm-243.6-11.3c3.4 0.2 8.8 0.2 12 0 3.1-0.2 0.3-0.3-6.3-0.3-6.6 0-9.2 0.1-5.7 0.3zm-156.5 7.8c0 3.8 0.2 5.3 0.4 3.2 0.2-2 0.2-5.2 0-7-0.2-1.7-0.4-0.1-0.4 3.8zm0.8 14.6c0 3.5 0.4 8.2 0.8 10.4 0.6 2.6 0.7 0.5 0.3-6-0.6-11.4-1.2-13.9-1.1-4.4zm33.1 1.4c-0.1 2.7 0.5 7.9 1.3 11.5 1.2 5.5 1.3 5.7 0.8 1.5-0.3-2.8-0.9-7.9-1.3-11.5-0.7-6.3-0.7-6.3-0.8-1.5zm180.8 2.5c0 1.8-0.8 2-14.2 2.3l-14.3 0.3 14.8 0.2 14.7 0.2v-2.5c0-1.4-0.2-2.5-0.5-2.5-0.3 0-0.5 0.9-0.5 2zm-98.2-0.3c2.8 0.2 7.6 0.2 10.5 0 2.8-0.2 0.5-0.3-5.3-0.3-5.8 0-8.1 0.1-5.2 0.3zm282.5 3.3c0 2.5 0.2 3.5 0.4 2.2 0.2-1.2 0.2-3.2 0-4.5-0.2-1.2-0.4-0.2-0.4 2.3zm-251.8-2c8.3 0.4 19.7 0.7 25.5 0.7 10.3 0 10.2-0.1-3.5-0.8-7.7-0.3-19.2-0.6-25.5-0.6l-11.5 0.1zm221.5 5.2c0 0.5 1.8 0.8 4 0.8 2.2 0 4-0.2 4-0.4 0-0.2-1.8-0.6-4-0.8-2.2-0.2-4 0-4 0.4zm14.3 1.5c2.6 0.2 6.8 0.2 9.5 0 2.6-0.2 0.4-0.3-4.8-0.3-5.2 0-7.4 0.1-4.7 0.3zm-380.2 4.8c-0.1 2.3 2.8 16.7 3.5 17.4 0.8 0.8 0.3-2.3-1.6-10.9-1-4.7-1.9-7.6-1.9-6.5zm34.5 7c1.4 9.9 13.9 41.1 18.8 47 0.9 1.1-0.3-1.8-2.8-6.5-5.5-10.6-10.8-23.9-14.1-35.6-1.4-4.9-2.3-7.1-1.9-4.9zm276 23.2c-0.4 10.3-1.1 26.7-1.6 36.3-0.5 9.6-0.9 20.9-0.8 25 0.1 5.3 0.3 3.6 0.9-6 1.5-28.4 3.2-73.1 2.7-73.6-0.3-0.3-0.9 8-1.2 18.3zm9.2-18c2.9 0.2 7.4 0.2 10 0 2.6-0.2 0.2-0.3-5.3-0.3-5.5 0-7.6 0.1-4.7 0.3zm21.5 5.8c0 3.3 0.2 4.5 0.4 2.7 0.2-1.8 0.2-4.5 0-6-0.2-1.5-0.4 0-0.4 3.3zm-337.2 2.1c0 1.1 0.3 1.4 0.6 0.6 0.3-0.7 0.2-1.6-0.1-1.9-0.3-0.4-0.6 0.2-0.5 1.3zm0.9 3.1c-0.1 3.7 16.7 43.3 18.4 43.3 0.4 0-0.9-3-2.8-6.8-4.3-8.5-8-17.3-12.2-28.7-1.8-5-3.3-8.5-3.4-7.8zm335.4 12.8c0 6.6 0.1 9.2 0.3 5.7 0.2-3.4 0.2-8.8 0-12-0.2-3.1-0.3-0.3-0.3 6.3zm-1 24.5c0 6.9 0.1 9.7 0.3 6.2 0.2-3.4 0.2-9 0-12.5-0.2-3.4-0.3-0.6-0.3 6.3zm-283.9-3c1.5 2.7 9.6 14 10.1 14 0.3 0-1.6-3-4.2-6.8-4.9-6.9-7.4-10-5.9-7.2zm-30.1 12.7c0.9 1.7 2.1 3.5 2.7 3.9 1.3 0.8-0.1-2.1-2.6-5.1-1.5-1.9-1.5-1.8-0.1 1.2zm46.4 8.9c5.3 6.2 14.9 15.1 21.8 20.3 1.1 0.9-0.5-0.6-3.5-3.3-3.1-2.7-9.8-9.3-15-14.5-8.1-8.3-8.6-8.6-3.3-2.5zm266.2 3.2c0 4.4-0.3 11.3-0.6 15.5l-0.7 7.7 9.4-0.2 9.4-0.2-8.7-0.3-8.6-0.4 0.5-14.9c0.3-8.3 0.3-15 0-15-0.4 0-0.7 3.5-0.7 7.8zm-308.5-5.8c1.5 2.6 11.5 16 12 16 0.3 0-2-3.5-5.1-7.8-5.8-7.9-8.4-11-6.9-8.2zm16.6 21.5c2.4 2.7 6.4 7.1 8.9 9.8 4.9 5.4 22 19.7 27.8 23.4 3.6 2.3 3.6 2.3 0.8 0.1-15.7-12.4-20.6-16.7-30.5-26.7-6.3-6.4-9.5-9.4-7-6.6zm-97.4-3.9c0 0.7 15.9 8 19 8.8l2.5 0.6-2.5-1.2c-11.3-5.3-19-8.6-19-8.2zm171.2 7c0 3.3 0.2 4.5 0.4 2.7 0.2-1.8 0.2-4.5 0-6-0.2-1.5-0.4 0-0.4 3.3zm4.5-4.8c1.7 0.2 4.7 0.2 6.5 0 1.7-0.2 0.3-0.4-3.3-0.4-3.6 0-5 0.2-3.2 0.4zm-134.6 16.4c-0.5 12.8-0.6 23.6-0.3 23.8 0.6 0.7 2.1-44 1.5-45.7-0.3-0.8-0.8 9.1-1.2 21.9z" fill="rgba(255,255,255,0.55)"/>
              <path d="m51.2 49.7c-27.1 26.9-49.2 49.2-49.2 49.5 0 0.3 4.5 4.7 10 9.8l10 9.2 8.1-8.9c4.5-4.8 26.7-27.1 49.2-49.4 37.3-36.9 41-40.9 39.7-42.4-0.8-1-4.8-4.5-9-7.8-4.1-3.4-8-6.8-8.6-7.5-0.8-1.1-11.3 8.7-50.2 47.5zm321.7-39.6c-4.6 3.9-9.2 7.7-10.2 8.4-1.7 1.2-0.7 2.8 12.8 19.6 8.1 10.1 15.4 19.3 16.3 20.4 1 1.1 3.1 3.8 4.7 6 1.6 2.2 9.7 12.5 18 23 15.5 19.6 22.3 28.3 33.5 42.9l6.4 8.4 3.1-2.1c1.6-1.1 3.2-2.4 3.5-2.7 0.3-0.3 3.8-3.2 7.8-6.4 3.9-3.2 7.2-6.2 7.2-6.6 0-0.8-13.7-18.3-21.7-27.6-2.4-2.9-5.3-6.5-6.6-8.2-3.6-4.9-65.7-82.2-66-82.2-0.2 0-4.1 3.2-8.8 7.1zm-163.4 41.6c-20.3 2.4-29.1 4.1-43.5 8.3-30.7 9.2-57.1 25.2-81.6 49.5-17 16.9-26.9 30.6-36.8 50.9-13.2 27-19.6 55.2-19.6 86.3 0 59.5 25.5 112.9 72.5 151.8 22.3 18.4 46 30.7 74.1 38.5 17.6 4.8 52.1 9.1 53.6 6.7 0.4-0.7 0.8-4.8 0.8-9.3 0-4.5 0.3-10.8 0.6-14.1l0.6-5.9-13.8-1.2c-38.4-3.1-67.7-14.6-96.9-38.1-23.9-19.2-41.9-45.3-52.1-75.5-1.9-5.5-4.1-13.4-5-17.5-1.9-9-4.3-33-3.9-38 0.2-2 0.6-7 1-11.1 3.3-39.8 20.8-78.7 47.4-105 47.8-47.3 119.5-61.8 182.9-37.1 43.7 17 82.1 57.3 97.9 102.6 6.8 19.7 9.3 38.3 8.5 63.7l-0.4 13.8 7.8 0.1c4.4 0.1 10.7 0.3 14.1 0.5 3.5 0.1 6.5-0.2 6.8-0.7 0.4-0.5 0.6-9.4 0.6-19.8 0-29.5-4-52.1-13.4-75.1-15.8-39.1-39.7-68.7-74.3-92-10.7-7.3-33.4-18.4-45.4-22.3-14-4.6-32.9-8.5-47-9.7-10.9-0.9-29-1.1-35.5-0.3z" fill="white"/>
              <path d="m219.6 134.7c-0.3 7.6-1.1 29.5-1.6 48.8-0.6 19.2-1.3 40-1.6 46.2l-0.6 11.2-2.6-0.4c-1.5-0.3-15.7-1-31.7-1.6-15.9-0.5-32-1.2-35.7-1.4l-6.6-0.3-0.7 12.5c-0.6 10.1-0.5 12.7 0.6 13.4 0.8 0.5 4.8 0.9 8.9 0.9 4.1 0 26.6 0.7 49.9 1.5 23.3 0.9 42.5 1.5 42.6 1.3 0.5-0.5 2-44.8 4.1-120.8 0.3-11.3 0.7-21.5 1-22.7 0.4-2.1 0.2-2.1-12.5-2.2l-12.8-0.1zm121.5 164c-0.1 4.9-0.6 18.2-1.1 29.8-0.5 11.5-1.2 28.3-1.6 37.3l-0.7 16.3-13.1-0.5c-30.4-1.4-59.7-2.6-68.1-2.8l-9-0.3-0.8 12.9c-0.4 7.1-0.6 13.1-0.4 13.2 0.2 0.2 16.7 1 36.8 1.9 20 0.8 40.1 1.8 44.7 2.1l8.3 0.6-0.5 5.6c-0.3 3.2-0.8 10.9-1.1 17.2-2 45.3-2.7 66.1-2.3 66.5 0.3 0.3 6.8 0.8 14.5 1.2l14.1 0.6 0.6-6.4c0.3-3.5 1-18.3 1.6-32.9 0.5-14.6 1.3-32.1 1.6-38.9l0.6-12.4 17.7 0.7c9.7 0.4 29.8 1.3 44.6 2.1 14.9 0.7 27.3 1 27.6 0.7 0.4-0.4 0.9-6.6 1.1-13.7l0.3-13-7.5-0.2c-35-1-82.1-3.2-82.9-3.9-0.2-0.2 0.1-12.8 0.8-28.1 0.6-15.3 1.4-34.8 1.7-43.3 0.3-8.5 0.7-16.4 0.9-17.6 0.4-2-0.1-2.1-9.3-2.7-5.3-0.4-11.8-0.7-14.3-0.7h-4.6z" fill="white"/>
            </svg>
          </div>
          <span className="text-[12px] font-semibold text-muted-foreground">Alerts</span>
        </motion.button>

        {/* cTrader broker card */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          transition={TAP_TRANSITION}
          onClick={() => navigate("/ctrader-integration")}
          className="flex flex-col items-center gap-2"
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "var(--dash-quick-btn-bg)" }}
          >
            <img src={fusionLogoUrl} alt="cTrader" style={{ width: 38, height: 38, objectFit: "contain" }} />
          </div>
          <span className="text-[12px] font-semibold text-muted-foreground">cTrader</span>
        </motion.button>

        {/* Delta Exchange broker card */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          transition={TAP_TRANSITION}
          onClick={() => navigate("/delta-integration")}
          className="flex flex-col items-center gap-2"
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "var(--dash-quick-btn-bg)" }}
          >
            <img src={deltaLogoUrl} alt="Delta Exchange" style={{ width: 38, height: 38, objectFit: "contain", filter: "grayscale(1) brightness(1.6)" }} />
          </div>
          <span className="text-[12px] font-semibold text-muted-foreground">Delta</span>
        </motion.button>
      </div>

      {/* ── Trading Calendar ── */}
      <div className="-mx-4">
        <p className="px-4 pb-2 text-[16px] font-semibold text-foreground">Trading Calendar</p>
        <CalendarHeatmap data={Array.isArray(calData) ? calData : []} year={calYear} month={calMonth} onPrev={handleCalPrev} onNext={handleCalNext} onDateClick={handleDateClick} />
      </div>

      {/* ── Day Detail Sheet ── */}
      <DayDetailSheet
        date={selectedDate}
        open={sheetOpen}
        onClose={() => openSheet(false)}
      />

      {/* ── Alerts Overlay ── full-screen portal, dashboard tab stays active ── */}
      <DashboardAlertsOverlay />

      {/* ── Markets Overlay ── full-screen portal, dashboard tab stays active ── */}
      <DashboardMarketsOverlay onWatchlistTap={handleWatchlistTap} onCloseAll={handleCloseAlertsFlow} />

      {/* ── Select Alert Type — top-level portal sibling, NOT nested inside
           DashboardMarketsOverlay. Keeping it here (same React fiber level as
           DashboardAlertsOverlay) means its createPortal call is processed
           independently from the Markets overlay's portal context, which
           eliminates any containing-block or stacking-context leakage from
           DashboardMarketsOverlay's inner panel (will-change:transform). ── */}
      <SelectAlertTypeOverlay
        open={!!alertSymbol}
        symbol={alertSymbol ?? ""}
        onClose={handleAlertTypeClose}
        onCloseAll={handleCloseAlertsFlow}
      />

    </PageTransition>
  );
});

export default Dashboard;
