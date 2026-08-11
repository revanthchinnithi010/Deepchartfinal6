import { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useGetCalendarHeatmap, useListTrades } from "@workspace/api-client-react";
import { useCurrencyFormatter } from "@/store/currencyStore";
import { motion, AnimatePresence } from "motion/react";
import { tweenFast } from "@/animations/motion";
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Calendar, BarChart2,
  ArrowLeft, ExternalLink, ImageIcon, Tag, AlertTriangle, FileText,
} from "lucide-react";
import { PageTransition, AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/animations";
import { useTheme } from "@/contexts/ThemeContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TV_LINKS } from "@/data/sampleData";
import { toArray } from "@/lib/safeArray";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ─── intensity heat style ───────────────────────────────────────────────────── */

function getIntensityStyle(pnl: number, trades: number, maxAbs: number, isLight: boolean): React.CSSProperties {
  if (trades === 0) return {};
  const intensity = Math.min(Math.abs(pnl) / Math.max(maxAbs, 1), 1);
  if (pnl > 0) {
    return isLight
      ? {
          backgroundColor: `rgba(22,163,74,${0.06 + intensity * 0.22})`,
          borderColor:      `rgba(22,163,74,${0.18 + intensity * 0.32})`,
          boxShadow:        intensity > 0.5 ? `0 2px 8px rgba(22,163,74,${intensity * 0.16})` : "none",
        }
      : {
          backgroundColor: `rgba(52,211,153,${0.1 + intensity * 0.5})`,
          borderColor:      `rgba(52,211,153,${0.2 + intensity * 0.4})`,
          boxShadow:        intensity > 0.5 ? `0 0 12px rgba(52,211,153,${intensity * 0.2})` : "none",
        };
  }
  if (pnl < 0) {
    return isLight
      ? {
          backgroundColor: `rgba(220,38,38,${0.06 + intensity * 0.18})`,
          borderColor:      `rgba(220,38,38,${0.18 + intensity * 0.28})`,
          boxShadow:        intensity > 0.5 ? `0 2px 8px rgba(220,38,38,${intensity * 0.14})` : "none",
        }
      : {
          backgroundColor: `rgba(248,113,113,${0.1 + intensity * 0.5})`,
          borderColor:      `rgba(248,113,113,${0.2 + intensity * 0.4})`,
          boxShadow:        intensity > 0.5 ? `0 0 12px rgba(248,113,113,${intensity * 0.2})` : "none",
        };
  }
  return isLight
    ? { backgroundColor: "rgba(0,0,0,0.03)", borderColor: "rgba(0,0,0,0.07)" }
    : { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" };
}

/* ─── animation constants ────────────────────────────────────────────────────── */
import { COMPOSITOR_EASE as EASE_OPEN, COMPOSITOR_EASE_CLOSE as EASE_CLOSE } from "@/animations/motion";
const DUR_OPEN  = 320;
const DUR_CLOSE = 240;

/* ─── Trade type (local subset from API) ────────────────────────────────────── */

type Trade = {
  id: number;
  symbol: string;
  side: string;
  pnl: number;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  riskRewardRatio?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  entryDate: string;
  exitDate?: string | null;
  tvLink?: string | null;
  screenshot?: string | null;
  setupTags?: string | null;
  mistakeTags?: string | null;
  /** legacy field from mock — treated same as setupTags */
  tags?: string | null;
  notes?: string | null;
};

/* ─── helpers ────────────────────────────────────────────────────────────────── */

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

/* ─── DailySummarySheet ──────────────────────────────────────────────────────── */

interface DailySummarySheetProps {
  date: string | null;          // "YYYY-MM-DD" or null (closed)
  onClose: () => void;
  onSelectTrade: (id: number) => void;
  fc: (v: number) => string;
}

const DailySummarySheet = memo(function DailySummarySheet({
  date, onClose, onSelectTrade, fc,
}: DailySummarySheetProps) {
  const hasOpenedRef = useRef(false);
  if (date) hasOpenedRef.current = true;

  /* visible drives the CSS transition */
  const [visible, setVisible] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (date) {
      let raf: number;
      const t = setTimeout(() => { raf = requestAnimationFrame(() => setVisible(true)); }, 0);
      return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    } else {
      setVisible(false);
    }
  }, [date]);

  /* Body scroll-lock */
  useEffect(() => {
    if (!date) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [date]);

  /* ESC key */
  useEffect(() => {
    if (!date) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [date]);

  /* Android back button */
  useEffect(() => {
    if (!date) return;
    window.history.pushState({ tjDailySummary: true }, "");
    const h = () => onCloseRef.current();
    window.addEventListener("popstate", h);
    return () => {
      window.removeEventListener("popstate", h);
      if (window.history.state?.tjDailySummary) window.history.back();
    };
  }, [date]);

  /* Fetch trades for this date */
  const { data: tradesRes, isLoading } = useListTrades(
    { date: date ?? undefined, limit: 100 },
    { query: { enabled: !!date } },
  );
  const trades: Trade[] = toArray(tradesRes?.trades, "calendar.tradesRes.trades") as Trade[];

  /* Derived day stats */
  const dayStats = useMemo(() => {
    if (!trades.length) return null;
    const totalPnl    = trades.reduce((s, t) => s + t.pnl, 0);
    const wins        = trades.filter(t => t.pnl > 0);
    const losses      = trades.filter(t => t.pnl < 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss   = losses.reduce((s, t) => s + t.pnl, 0);
    const rrValues    = trades.map(t => t.riskRewardRatio).filter((v): v is number => v != null);
    const avgRR       = rrValues.length > 0 ? rrValues.reduce((s, v) => s + v, 0) / rrValues.length : null;
    const winRate     = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    return {
      totalPnl, grossProfit, grossLoss, avgRR, winRate,
      wins: wins.length, losses: losses.length, count: trades.length,
    };
  }, [trades]);

  /* Friendly date label */
  const dateLabel = date
    ? new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "";

  const stopProp = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  if (!hasOpenedRef.current) return null;

  return createPortal(
    <div
      aria-hidden={!date}
      style={{
        position: "fixed", inset: 0, zIndex: 75,
        pointerEvents: date ? "auto" : "none",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.60)",
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
          position: "absolute",
          left: 0, right: 0, bottom: 0,
          maxHeight: "88dvh",
          display: "flex", flexDirection: "column",
          background: "#0a0a0a",
          borderRadius: "20px 20px 0 0",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? EASE_OPEN : EASE_CLOSE}`,
          willChange: "transform",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className="transform-gpu"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ height: 52, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div>
            <p className="text-[15px] font-bold text-white leading-tight">{dateLabel}</p>
            {dayStats && (
              <p className="text-[11px] text-white/40 mt-0.5">
                {dayStats.count} trade{dayStats.count !== 1 ? "s" : ""} · {dayStats.wins}W {dayStats.losses}L
              </p>
            )}
          </div>
          {dayStats && (
            <span className={`text-[17px] font-black ${dayStats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {dayStats.totalPnl >= 0 ? "+" : ""}{fc(dayStats.totalPnl)}
            </span>
          )}
        </div>

        {/* ── Stats Grid ── */}
        {dayStats && (
          <div
            className="shrink-0 grid grid-cols-3 gap-px"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)" }}
          >
            {/* Row 1 */}
            {[
              { label: "Total Trades", value: String(dayStats.count), color: "text-white" },
              { label: "Wins",         value: String(dayStats.wins),  color: "text-emerald-400" },
              { label: "Losses",       value: String(dayStats.losses), color: dayStats.losses > 0 ? "text-red-400" : "text-white/50" },
            ].map(s => (
              <div key={s.label} className="py-3 px-3 flex flex-col items-center" style={{ background: "#0a0a0a" }}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 mb-1">{s.label}</p>
                <p className={`text-[15px] font-black leading-none ${s.color}`}>{s.value}</p>
              </div>
            ))}
            {/* Row 2 */}
            {[
              { label: "Win Rate",    value: `${dayStats.winRate.toFixed(0)}%`,
                color: dayStats.winRate >= 50 ? "text-emerald-400" : "text-red-400" },
              { label: "Gross Profit", value: dayStats.grossProfit > 0 ? `+${fc(dayStats.grossProfit)}` : "—",
                color: "text-emerald-400" },
              { label: "Gross Loss",   value: dayStats.grossLoss < 0 ? fc(dayStats.grossLoss) : "—",
                color: dayStats.grossLoss < 0 ? "text-red-400" : "text-white/50" },
            ].map(s => (
              <div key={s.label} className="py-3 px-3 flex flex-col items-center" style={{ background: "#0a0a0a" }}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 mb-1">{s.label}</p>
                <p className={`text-[13px] font-black leading-none ${s.color}`}>{s.value}</p>
              </div>
            ))}
            {/* Row 3 */}
            {[
              { label: "Net P&L",  value: `${dayStats.totalPnl >= 0 ? "+" : ""}${fc(dayStats.totalPnl)}`,
                color: dayStats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400" },
              { label: "Avg RR",   value: dayStats.avgRR != null ? `${dayStats.avgRR.toFixed(2)}R` : "—",
                color: "text-white/80" },
              { label: "Total Fees", value: "—", color: "text-white/50" },
            ].map(s => (
              <div key={s.label} className="py-3 px-3 flex flex-col items-center" style={{ background: "#0a0a0a" }}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 mb-1">{s.label}</p>
                <p className={`text-[13px] font-black leading-none ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Trade list */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl shimmer-loading" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <BarChart2 className="w-10 h-10 mb-3" style={{ color: "rgba(255,255,255,0.15)" }} />
              <p className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>No trades on this day</p>
            </div>
          ) : (
            <AnimatedList className="px-3 py-3 space-y-2">
              {trades.map((trade, idx) => {
                const isWin = trade.pnl >= 0;
                return (
                  <AnimatedListItem key={trade.id} index={idx}>
                  <div
                    onClick={() => onSelectTrade(trade.id)}
                    style={{
                      background: "rgba(255,255,255,0.035)",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.07)",
                      padding: "12px 14px",
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                      transition: "background 0.12s",
                    }}
                    onPointerDown={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                    onPointerUp={e => (e.currentTarget.style.background = "rgba(255,255,255,0.035)")}
                    onPointerLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.035)")}
                  >
                    <div className="flex items-center justify-between">
                      {/* Left: symbol + side */}
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-white">{trade.symbol}</span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: trade.side === "long" ? "#35C37A" : "#E0524F" }}
                        >
                          {trade.side}
                        </span>
                      </div>
                      {/* Right: PnL + chevron */}
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[15px] font-bold tabular-nums"
                          style={{ color: isWin ? "#35C37A" : "#E0524F" }}
                        >
                          {isWin ? "+" : ""}{fc(trade.pnl)}
                        </span>
                        <ChevronRight className="w-4 h-4" style={{ color: "rgba(255,255,255,0.25)" }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Entry {trade.entryPrice < 1
                          ? trade.entryPrice.toFixed(4)
                          : trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        {trade.exitPrice != null && (
                          <> → {trade.exitPrice < 1
                            ? trade.exitPrice.toFixed(4)
                            : trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {trade.riskRewardRatio != null && (
                          <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.30)" }}>
                            {trade.riskRewardRatio.toFixed(2)}R
                          </span>
                        )}
                        {trade.entryDate && (
                          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                            {fmtTime(trade.entryDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  </AnimatedListItem>
                );
              })}
            </AnimatedList>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
});

/* ─── TradeDetailSheet ─────────────────────────────────────────────────────── */

interface TradeDetailSheetProps {
  trade: Trade | null;
  onClose: () => void;
  fc: (v: number) => string;
}

const TradeDetailSheet = memo(function TradeDetailSheet({ trade, onClose, fc }: TradeDetailSheetProps) {
  /* Resolve tags: API uses setupTags/mistakeTags; mock may use legacy `tags` */
  const setupTags   = trade?.setupTags   ?? trade?.tags   ?? null;
  const mistakeTags = trade?.mistakeTags ?? null;

  return (
    <Sheet open={!!trade} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-full sm:max-w-[420px] p-0 flex flex-col overflow-hidden [&>button:first-child]:hidden"
        style={{
          background:   "#000000",
          borderLeft:   "1px solid rgba(255,255,255,0.07)",
          "--tw-enter-translate-x" : "0px",
          "--tw-exit-translate-x"  : "0px",
          "--tw-enter-opacity"     : "0.96",
          "--tw-exit-opacity"      : "0",
          animationDuration        : "220ms",
          animationTimingFunction  : EASE_OPEN,
        } as React.CSSProperties}
      >
        {trade && (
          <>
            {/* Nav header */}
            <div className="flex items-center gap-3 px-4 h-14 shrink-0" style={{ background: "#000000", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-white leading-tight truncate">{trade.symbol}</p>
                <p className="text-[10px] font-semibold leading-tight" style={{ color: trade.side === "long" ? "#35C37A" : "#E0524F" }}>
                  {trade.side === "long" ? "LONG" : "SHORT"}
                </p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ${trade.side === "long" ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" : "bg-orange-500/15 text-orange-400 border border-orange-500/20"}`}>
                Trade Details
              </span>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 pt-3 pb-5 space-y-6" style={{ background: "#000000" }}>

              {/* Date/Time + PnL strip */}
              <div className="flex items-start justify-between px-1 pb-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="space-y-1">
                  <div>
                    <p className="text-[9px] font-semibold text-white/35 uppercase tracking-widest mb-0.5">Entry</p>
                    <p className="text-[13px] font-semibold text-white/80">{fmtDate(trade.entryDate)}</p>
                    <p className="text-[11px] text-white/45">{fmtTime(trade.entryDate)}</p>
                  </div>
                  {trade.exitDate && (
                    <div>
                      <p className="text-[9px] font-semibold text-white/35 uppercase tracking-widest mb-0.5">Exit</p>
                      <p className="text-[13px] font-semibold text-white/80">{fmtDate(trade.exitDate)}</p>
                      <p className="text-[11px] text-white/45">{fmtTime(trade.exitDate)}</p>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-semibold text-white/35 uppercase tracking-widest mb-0.5">
                    {trade.pnl >= 0 ? "Profit" : "Loss"}
                  </p>
                  <p className="text-[22px] font-black leading-tight" style={{ color: trade.pnl >= 0 ? "#34d399" : "#f87171" }}>
                    {trade.pnl >= 0 ? "+" : ""}{fc(trade.pnl)}
                  </p>
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "Entry",         value: trade.entryPrice < 1 ? trade.entryPrice.toFixed(5) : fc(trade.entryPrice) },
                  { label: "Exit",          value: trade.exitPrice == null ? "—" : trade.exitPrice < 1 ? trade.exitPrice.toFixed(5) : fc(trade.exitPrice) },
                  { label: "Risk / Reward", value: trade.riskRewardRatio ? `${trade.riskRewardRatio.toFixed(2)}R` : "—" },
                  { label: "Quantity",      value: String(trade.quantity) },
                  { label: "Stop Loss",     value: trade.stopLoss ? fc(trade.stopLoss) : "—" },
                  { label: "Take Profit",   value: trade.takeProfit ? fc(trade.takeProfit) : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 rounded-xl border" style={{ background: "#111111", borderColor: "rgba(255,255,255,0.09)" }}>
                    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-[14px] font-bold font-mono leading-tight text-white">{value}</p>
                  </div>
                ))}
              </div>

              {/* TradingView link + screenshot */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Analysis</p>
                {(trade.tvLink || TV_LINKS[trade.symbol as keyof typeof TV_LINKS]) ? (
                  <button
                    className="tv-chart-btn w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[13px] font-semibold"
                    onClick={() => window.open(trade.tvLink || TV_LINKS[trade.symbol as keyof typeof TV_LINKS], "_blank")}
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Open TradingView Chart
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </button>
                ) : (
                  <div className="px-4 py-2.5 rounded-xl border border-dashed border-white/[0.08] text-[12px] text-muted-foreground/60 italic">
                    No chart linked for this trade
                  </div>
                )}
                {trade.screenshot ? (
                  <div
                    className="rounded-xl overflow-hidden border border-white/[0.08] cursor-pointer group relative"
                    onClick={() => window.open(trade.screenshot!, "_blank")}
                  >
                    <img src={trade.screenshot} alt="Trade Screenshot" className="w-full max-h-44 object-cover group-hover:opacity-90 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                      <ExternalLink className="w-5 h-5 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="h-20 rounded-xl border border-dashed border-white/[0.07] flex items-center justify-center gap-2 text-[12px] text-muted-foreground/50 italic">
                    <ImageIcon className="w-4 h-4 opacity-50" /> No screenshot attached
                  </div>
                )}
              </div>

              {/* Tags */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Tags</p>
                {setupTags && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Tag className="w-3 h-3" /> Setup
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {setupTags.split(",").filter(Boolean).map(tag => (
                        <span key={tag} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-primary/12 text-primary border border-primary/20">{tag.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
                {mistakeTags && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-400/70" /> Mistakes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {mistakeTags.split(",").filter(Boolean).map(tag => (
                        <span key={tag} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">{tag.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
                {!setupTags && !mistakeTags && (
                  <p className="text-[12px] text-muted-foreground/50 italic">No tags recorded</p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Journal Notes
                </p>
                {trade.notes ? (
                  <div className="p-4 rounded-xl text-[13px] leading-relaxed text-white/70" style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.09)" }}>
                    {trade.notes}
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground/50 italic">No notes recorded for this trade.</p>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
});

/* ─── Main CalendarPage ─────────────────────────────────────────────────────── */

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const fc = useCurrencyFormatter();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const { data: heatmap } = useGetCalendarHeatmap({ year, month });

  const prevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month, 1));

  const daysInMonth     = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();

  const dayMap = useMemo(() => {
    const m: Record<string, { pnl: number; trades: number }> = {};
    toArray(heatmap, "calendar.heatmap").forEach((d) => { m[d.date.slice(0, 10)] = { pnl: d.pnl, trades: d.trades }; });
    return m;
  }, [heatmap]);

  const maxAbs = useMemo(() => Math.max(...Object.values(dayMap).map((d) => Math.abs(d.pnl)), 1), [dayMap]);

  const monthSummary = useMemo(() => {
    const entries     = Object.values(dayMap).filter((d) => d.trades > 0);
    const totalPnl    = entries.reduce((s, d) => s + d.pnl, 0);
    const totalTrades = entries.reduce((s, d) => s + d.trades, 0);
    const winDays     = entries.filter((d) => d.pnl > 0).length;
    const lossDays    = entries.filter((d) => d.pnl < 0).length;
    const tradingDays = entries.length;
    const winRate     = tradingDays > 0 ? (winDays / tradingDays) * 100 : 0;
    return { totalPnl, totalTrades, winDays, lossDays, tradingDays, winRate };
  }, [dayMap]);

  const calendarCells = useMemo(() => {
    const cells: Array<null | { day: number; date: string; data: { pnl: number; trades: number } }> = [];
    for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      cells.push({ day: i, date: dateStr, data: dayMap[dateStr] || { pnl: 0, trades: 0 } });
    }
    return cells;
  }, [year, month, daysInMonth, firstDayOfMonth, dayMap]);

  const weeklyRows = useMemo(() => {
    const rows: Array<typeof calendarCells> = [];
    let row: typeof calendarCells = [];
    calendarCells.forEach((cell, i) => {
      row.push(cell);
      if ((i + 1) % 7 === 0) { rows.push(row); row = []; }
    });
    if (row.length > 0) rows.push(row);
    return rows;
  }, [calendarCells]);

  const monthName      = currentDate.toLocaleString("default", { month: "long", year: "numeric" });
  const isCurrentMonth = new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();
  const todayStr       = new Date().toISOString().slice(0, 10);

  /* Find the trade for the detail sheet from the already-fetched daily list */
  const { data: dayTradesForDetail } = useListTrades(
    { date: selectedDate ?? undefined, limit: 100 },
    { query: { enabled: !!selectedTradeId && !!selectedDate } },
  );
  const selectedTrade = selectedTradeId
    ? (toArray(dayTradesForDetail?.trades, "calendar.dayTradesForDetail.trades") as Trade[]).find(t => t.id === selectedTradeId) ?? null
    : null;

  const closeDailySummary = useCallback(() => setSelectedDate(null), []);
  const closeTradeDetail  = useCallback(() => setSelectedTradeId(null), []);

  /* Also close trade detail when daily summary closes */
  const handleCloseDailySummary = useCallback(() => {
    setSelectedTradeId(null);
    setSelectedDate(null);
  }, []);

  const navBtnClass = isLight
    ? "w-9 h-9 flex items-center justify-center rounded-xl bg-black/[0.04] border border-black/[0.08] text-muted-foreground hover:text-foreground hover:bg-black/[0.07] hover:border-black/[0.14] transition-all"
    : "w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-white hover:bg-white/[0.08] hover:border-white/[0.14] transition-all";

  const iconBoxClass = isLight
    ? "w-8 h-8 rounded-lg bg-black/[0.04] border border-black/[0.07] flex items-center justify-center flex-shrink-0"
    : "w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center flex-shrink-0";

  const legendBorderClass = isLight ? "border-t border-border" : "border-t border-white/[0.05]";

  const profitSwatches = isLight
    ? [0.10, 0.18, 0.24, 0.30, 0.40].map(op => `rgba(22,163,74,${op})`)
    : [0.15, 0.3, 0.5, 0.7, 0.9].map(op => `rgba(52,211,153,${op})`);

  const lossSwatches = isLight
    ? [0.10, 0.16, 0.22, 0.28, 0.36].map(op => `rgba(220,38,38,${op})`)
    : [0.15, 0.3, 0.5, 0.7, 0.9].map(op => `rgba(248,113,113,${op})`);

  return (
    <>
      <PageTransition className="space-y-5 pb-12" fill={false}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground mb-1">Trading Calendar</h1>
            <p className="text-sm text-muted-foreground">Daily performance heatmap · Tap a day to inspect</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className={navBtnClass}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-4 py-2 glass-card text-[13px] font-semibold text-foreground min-w-[160px] text-center">
              {monthName}
            </div>
            <button onClick={nextMonth} className={navBtnClass}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Monthly Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label:    "Month PNL",
              value:    fc(monthSummary.totalPnl),
              positive: monthSummary.totalPnl >= 0,
              icon:     monthSummary.totalPnl >= 0 ? TrendingUp : TrendingDown,
              color:    monthSummary.totalPnl >= 0 ? "text-emerald-400" : "text-red-400",
            },
            {
              label:    "Win Days",
              value:    `${monthSummary.winDays} / ${monthSummary.tradingDays}`,
              positive: true,
              icon:     Calendar,
              color:    "text-emerald-400",
            },
            {
              label:    "Day Win Rate",
              value:    `${monthSummary.winRate.toFixed(0)}%`,
              positive: monthSummary.winRate >= 50,
              icon:     BarChart2,
              color:    monthSummary.winRate >= 50 ? "text-emerald-400" : "text-red-400",
            },
            {
              label:    "Total Trades",
              value:    `${monthSummary.totalTrades}`,
              positive: undefined,
              icon:     BarChart2,
              color:    "text-foreground",
            },
          ].map((s, idx) => (
            <AnimatedCard key={s.label} index={idx} className="glass-card p-4 flex items-center gap-3">
              <div className={iconBoxClass}>
                <s.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{s.label}</p>
                <p className={`text-[15px] font-black leading-none ${s.color}`}>{s.value}</p>
              </div>
            </AnimatedCard>
          ))}
        </div>

        {/* Calendar Grid */}
        <AnimatedCard index={4} className="glass-card p-5">
          {/* Day headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 mb-2">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day} className="text-center text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider py-1">
                {day}
              </div>
            ))}
            <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider py-1 text-right pr-1 hidden sm:block">
              Week
            </div>
          </div>

          {/* Rows */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${year}-${month}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={tweenFast}
              className="space-y-2"
            >
              {weeklyRows.map((row, rowIdx) => {
                const weekCells  = row.filter((c) => c !== null);
                const weekPnl    = weekCells.reduce((s, c) => s + (c?.data.pnl ?? 0), 0);
                const weekTrades = weekCells.reduce((s, c) => s + (c?.data.trades ?? 0), 0);

                return (
                  <div key={rowIdx} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-start">
                    {Array.from({ length: 7 }).map((_, colIdx) => {
                      const cell = row[colIdx];
                      if (!cell) return <div key={`empty-${rowIdx}-${colIdx}`} className="aspect-square" />;

                      const isToday   = isCurrentMonth && cell.date === todayStr;
                      const isHovered = hoveredDate === cell.date;
                      const hasData   = cell.data.trades > 0;

                      const emptyStyle: React.CSSProperties = isLight
                        ? {
                            backgroundColor: isToday ? "rgba(124,58,237,0.06)" : "rgba(0,0,0,0.02)",
                            borderColor:     isToday ? "rgba(124,58,237,0.30)" : "rgba(0,0,0,0.06)",
                          }
                        : {
                            backgroundColor: isToday ? "rgba(183,255,90,0.07)" : "rgba(255,255,255,0.025)",
                            borderColor:     isToday ? "rgba(183,255,90,0.28)" : "rgba(255,255,255,0.05)",
                          };

                      /* Abbreviated PnL for calendar cell — fits on small cells */
                      const pnlAbs = Math.abs(cell.data.pnl);
                      const pnlLabel = pnlAbs >= 1000
                        ? `${cell.data.pnl >= 0 ? "+" : "-"}$${(pnlAbs / 1000).toFixed(1)}k`
                        : `${cell.data.pnl >= 0 ? "+" : "-"}$${pnlAbs.toFixed(0)}`;

                      return (
                        <div
                          key={cell.date}
                          className="relative aspect-square rounded-xl border border-transparent flex flex-col p-1.5 sm:p-2 transition-all duration-200 hover:scale-[1.04] hover:z-10 active:scale-[0.97]"
                          style={{
                            ...(hasData ? getIntensityStyle(cell.data.pnl, cell.data.trades, maxAbs, isLight) : emptyStyle),
                            cursor: hasData ? "pointer" : "default",
                            WebkitTapHighlightColor: "transparent",
                          }}
                          onMouseEnter={() => setHoveredDate(cell.date)}
                          onMouseLeave={() => setHoveredDate(null)}
                          onClick={() => { if (hasData) setSelectedDate(cell.date); }}
                        >
                          <div className={`text-[11px] font-semibold leading-none ${
                            isToday   ? "text-primary" :
                            hasData   ? "text-foreground/80" :
                            "text-muted-foreground/50"
                          }`}>
                            {cell.day}
                          </div>

                          {hasData && (
                            <div className="mt-auto">
                              {/* PnL — shown on all sizes; abbreviated for small cells */}
                              <div className={`text-[9px] sm:text-[10px] font-bold leading-tight truncate ${cell.data.pnl >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                                {pnlLabel}
                              </div>
                              <div className="text-[8px] sm:text-[9px] text-muted-foreground/50 leading-none">
                                {cell.data.trades}t
                              </div>
                            </div>
                          )}

                          {/* Tooltip (desktop hover) */}
                          <AnimatePresence>
                            {isHovered && hasData && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.96, y: 4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.96, y: 4 }}
                                transition={tweenFast}
                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-none"
                              >
                                <div className="glass-modal px-3 py-2 text-[11px] whitespace-nowrap rounded-xl">
                                  <p className="text-muted-foreground mb-1">
                                    {new Date(cell.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                  </p>
                                  <p className={`font-bold text-[13px] ${cell.data.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {cell.data.pnl >= 0 ? "+" : ""}{fc(cell.data.pnl)}
                                  </p>
                                  <p className="text-muted-foreground">{cell.data.trades} trade{cell.data.trades !== 1 ? "s" : ""} · tap to view</p>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}

                    {/* Weekly sum */}
                    <div className="hidden sm:flex flex-col items-end justify-center py-1 min-w-[56px]">
                      {weekTrades > 0 ? (
                        <>
                          <span className={`text-[11px] font-bold ${weekPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {weekPnl >= 0 ? "+" : ""}{fc(weekPnl)}
                          </span>
                          <span className="text-[9px] text-muted-foreground/50">{weekTrades}t</span>
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/30">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>

          {/* Legend */}
          <div className={`flex items-center justify-end gap-4 mt-4 pt-4 ${legendBorderClass}`}>
            <span className="text-[11px] text-muted-foreground">Intensity scale:</span>
            <div className="flex items-center gap-1">
              {profitSwatches.map((color, i) => (
                <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: color }} />
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">Profit</span>
            </div>
            <div className="flex items-center gap-1">
              {lossSwatches.map((color, i) => (
                <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: color }} />
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">Loss</span>
            </div>
          </div>
        </AnimatedCard>
      </PageTransition>

      {/* Daily summary bottom sheet */}
      <DailySummarySheet
        date={selectedDate}
        onClose={handleCloseDailySummary}
        onSelectTrade={(id) => setSelectedTradeId(id)}
        fc={fc}
      />

      {/* Trade detail side sheet */}
      <TradeDetailSheet
        trade={selectedTrade}
        onClose={closeTradeDetail}
        fc={fc}
      />
    </>
  );
}
