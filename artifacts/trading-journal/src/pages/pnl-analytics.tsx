import { memo, useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, BarChart2, Activity,
  CalendarDays, Target, Flame, Zap, Trophy, ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  useGetStatsSummary, useGetEquityCurve, useGetCalendarHeatmap,
} from "@workspace/api-client-react";
import {
  DEMO_STATS, DEMO_EQUITY_CURVE, getDemoCalendarHeatmap,
} from "@/data/demoAnalyticsData";
import {
  Bar, BarChart as RechartsBarChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis, Area, AreaChart, Cell, ReferenceLine,
} from "recharts";
import { useCurrencyFormatter, useCurrencyAxisFormatter, useCurrencyStore } from "@/store/currencyStore";
import { toArray } from "@/lib/safeArray";
import { n } from "@/lib/safeNumber";

// ── Colours ────────────────────────────────────────────────────────────────
const GREEN  = "hsl(145 58% 52%)";
const RED    = "hsl(0 68% 58%)";
const BLUE   = "#60a5fa";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  borderColor:     "rgba(57, 91, 67, 0.3)",
  borderRadius:    "12px",
  boxShadow:       "0 8px 28px rgba(7, 17, 13, 0.65)",
  fontSize:        "12px",
  padding:         "8px 12px",
};

// ── Time filter ────────────────────────────────────────────────────────────
type TimeFilter = "today" | "7d" | "30d" | "3m" | "6m" | "1y" | "all";

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d",   label: "7D"   },
  { id: "30d",  label: "30D"  },
  { id: "3m",   label: "3M"   },
  { id: "6m",   label: "6M"   },
  { id: "1y",   label: "1Y"   },
  { id: "all",  label: "All"  },
];

/** Returns YYYY-MM-DD in the local calendar, free from UTC-offset drift. */
function localDateStr(d: Date): string {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function getCutoffDate(filter: TimeFilter): { cutoff: string | null; todayOnly: boolean } {
  const now = new Date();
  if (filter === "all")   return { cutoff: null, todayOnly: false };
  if (filter === "today") return { cutoff: localDateStr(now), todayOnly: true };
  const d = new Date(now);
  if (filter === "7d")   d.setDate(d.getDate() - 6);
  if (filter === "30d")  d.setDate(d.getDate() - 29);
  if (filter === "3m")   d.setMonth(d.getMonth() - 3);
  if (filter === "6m")   d.setMonth(d.getMonth() - 6);
  if (filter === "1y")   d.setFullYear(d.getFullYear() - 1);
  return { cutoff: localDateStr(d), todayOnly: false };
}

function fShortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fLongDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Tooltip components ─────────────────────────────────────────────────────
const BarTooltip = memo(function BarTooltip({
  active, payload, label, labelPrefix = "",
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  active?: boolean; payload?: any[]; label?: string; labelPrefix?: string;
}) {
  const fc = useCurrencyFormatter();
  if (!active || !payload?.length) return null;
  const val = payload[0].value as number;
  return (
    <div style={tooltipStyle} className="border border-white/[0.08]">
      <p className="text-muted-foreground text-[11px] mb-1">{labelPrefix}{label}</p>
      <p className={`font-bold text-sm ${val >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {val >= 0 ? "+" : ""}{fc(val)}
      </p>
    </div>
  );
});

const CumTooltip = memo(function CumTooltip({
  active, payload, label,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  active?: boolean; payload?: any[]; label?: string;
}) {
  const fc = useCurrencyFormatter();
  if (!active || !payload?.length) return null;
  const val = payload[0].value as number;
  return (
    <div style={tooltipStyle} className="border border-white/[0.08]">
      <p className="text-muted-foreground text-[11px] mb-1">{label}</p>
      <p className={`font-bold text-sm ${val >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {val >= 0 ? "+" : ""}{fc(val)}
      </p>
    </div>
  );
});

// ── KPI card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, positive, icon: Icon }: {
  label: string; value: string; sub?: string; positive?: boolean;
  icon: React.ElementType; index: number;
}) {
  return (
    <div className="stat-card-neutral p-4 relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--stat-title)" }}>
          {label}
        </span>
        <div className="stat-icon-neutral w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5" style={{ color: "var(--stat-icon)" }} />
        </div>
      </div>
      <div
        className="text-[22px] font-black leading-none tracking-tight"
        style={{
          color: positive === true ? "#22C55E" : positive === false ? "#EF4444" : "var(--stat-value)",
        }}
      >
        {value}
      </div>
      {sub && <p className="text-[10px] mt-1.5" style={{ color: "var(--stat-sub)" }}>{sub}</p>}
    </div>
  );
}

// ── Calendar heatmap ───────────────────────────────────────────────────────
const CalendarHeatmap = memo(function CalendarHeatmap({
  data, year, month,
}: { data: Array<{ date: string; pnl: number; trades: number }>; year: number; month: number }) {
  const fc         = useCurrencyFormatter();
  const axisFormatter = useCurrencyAxisFormatter();

  // See dashboard.tsx's CalendarHeatmap for the rationale: `data` is typed
  // as an array but that's not runtime-guaranteed (API/demo-data shape
  // drift, in-flight query states, etc.), so normalize once at the top.
  const safeData = useMemo(() => toArray(data, "pnl-analytics.CalendarHeatmap.data"), [data]);

  const dayMap = useMemo(() => {
    const m: Record<string, { pnl: number; trades: number }> = {};
    safeData.forEach(d => { m[d.date] = { pnl: d.pnl, trades: d.trades }; });
    return m;
  }, [safeData]);

  const maxAbs     = useMemo(() => Math.max(...safeData.map(d => Math.abs(d.pnl)), 1), [safeData]);
  const firstDay   = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);
  const daysInMonth= useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const monthName  = useMemo(() =>
    new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  [year, month]);

  const cellStyles = useMemo(() => {
    const s: Record<string, React.CSSProperties> = {};
    Object.entries(dayMap).forEach(([dt, d]) => {
      if (!d || d.trades === 0) return;
      const intensity = Math.min(Math.abs(d.pnl) / maxAbs, 1);
      if (d.pnl > 0) {
        s[dt] = { backgroundColor: `rgba(52,211,153,${0.12 + intensity * 0.55})`, borderColor: `rgba(52,211,153,${0.2 + intensity * 0.3})` };
      } else if (d.pnl < 0) {
        s[dt] = { backgroundColor: `rgba(248,113,113,${0.12 + intensity * 0.55})`, borderColor: `rgba(248,113,113,${0.2 + intensity * 0.3})` };
      } else {
        s[dt] = { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" };
      }
    });
    return s;
  }, [dayMap, maxAbs]);

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e-${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const dt    = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const entry = dayMap[dt];
    cells.push(
      <div
        key={dt}
        className="relative rounded-lg aspect-square flex flex-col items-center justify-center cursor-default group/cell border border-transparent"
        style={cellStyles[dt]}
      >
        <span className="text-[10px] font-semibold leading-none text-foreground/60">{d}</span>
        {entry && entry.trades > 0 && (
          <span className={`text-[8px] font-bold leading-none mt-0.5 ${entry.pnl > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {entry.pnl > 0 ? "+" : ""}{axisFormatter(Math.abs(entry.pnl))}
          </span>
        )}
        {entry && entry.trades > 0 && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 hidden group-hover/cell:block pointer-events-none">
            <div className="glass-card px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-xl border-white/10">
              <p className={`font-bold ${entry.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fc(entry.pnl)}</p>
              <p className="text-muted-foreground">{entry.trades} trade{entry.trades !== 1 ? "s" : ""}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-3">{monthName}</p>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground/60 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">{cells}</div>
    </div>
  );
});

// ── Chart section header ───────────────────────────────────────────────────
function ChartHeader({ icon: Icon, title, right }: {
  icon: React.ElementType; title: string; right?: React.ReactNode;
}) {
  return (
    <div className="p-5 pb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="text-[13px] font-semibold text-white">{title}</span>
      </div>
      {right}
    </div>
  );
}

// ── Empty chart state ──────────────────────────────────────────────────────
function EmptyChart({ h = 180 }: { h?: number }) {
  return (
    <div className="flex items-center justify-center text-[12px] text-muted-foreground/40" style={{ height: h }}>
      No data for this period
    </div>
  );
}

// ── Stat item ──────────────────────────────────────────────────────────────
function StatItem({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">{label}</p>
      <p className="text-[16px] font-black leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/45 mt-1">{sub}</p>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function PnlAnalytics() {
  const [, navigate]  = useLocation();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const fc            = useCurrencyFormatter();
  const axisFormatter = useCurrencyAxisFormatter();
  const currency      = useCurrencyStore(s => s.currency);
  const setCurrency   = useCurrencyStore(s => s.setCurrency);

  const { data: liveStats,  isFetched: statsFetched  } = useGetStatsSummary();
  const { data: liveEquity, isFetched: equityFetched } = useGetEquityCurve();

  const now = useMemo(() => new Date(), []);
  const { data: liveCalData, isFetched: calFetched } = useGetCalendarHeatmap({
    year: now.getFullYear(), month: now.getMonth() + 1,
  });

  // ── Single state machine: "loading" | "live" | "demo" ─────────────────────
  // All three queries must settle before we decide; this prevents flashing demo
  // content while live data is still in-flight.
  //
  // To swap in live data: remove the pageState block and the IS_DEMO / demo
  // data lines below, then use liveStats/liveEquity/liveCalData directly.
  const queriesSettled = statsFetched && equityFetched && calFetched;
  const hasLiveData    = (liveEquity?.length ?? 0) > 0 || (liveStats?.totalTrades ?? 0) > 0;
  type PageState = "loading" | "live" | "demo";
  const pageState: PageState = !queriesSettled ? "loading" : hasLiveData ? "live" : "demo";
  const IS_DEMO = pageState === "demo";

  const stats   = pageState === "live" ? liveStats   : pageState === "demo" ? DEMO_STATS   : undefined;
  const equity  = pageState === "live" ? liveEquity  : pageState === "demo" ? DEMO_EQUITY_CURVE : undefined;
  const calData = pageState === "live" ? liveCalData : pageState === "demo" ? getDemoCalendarHeatmap(now.getFullYear(), now.getMonth() + 1) : undefined;

  // ── All daily PNL points from equity curve, sorted ascending ───────────
  type RawEquityPoint = { date: string; pnl: number; equity: number };
  const allDaily = useMemo(() => {
    const pts = toArray(equity, "pnl-analytics.equity").map((p) => ({ date: (p as RawEquityPoint).date, pnl: (p as RawEquityPoint).pnl }));
    // Sort ascending so cumulative accumulation and chart order are always correct.
    pts.sort((a, b) => a.date.localeCompare(b.date));
    return pts;
  }, [equity]);

  // ── Apply time filter ──────────────────────────────────────────────────
  const filteredDaily = useMemo(() => {
    const { cutoff, todayOnly } = getCutoffDate(timeFilter);
    if (!cutoff) return allDaily;
    if (todayOnly) return allDaily.filter(p => p.date === cutoff);
    return allDaily.filter(p => p.date >= cutoff);
  }, [allDaily, timeFilter]);

  // ── Weekly grouping from filtered daily ───────────────────────────────
  const weeklyData = useMemo(() => {
    const map = new Map<string, number>();
    filteredDaily.forEach(({ date, pnl }) => {
      const d   = new Date(date + "T00:00:00");
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      const key = localDateStr(mon);
      map.set(key, (map.get(key) ?? 0) + pnl);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, pnl]) => ({
        pnl,
        label: fShortDate(week),
      }));
  }, [filteredDaily]);

  // ── Monthly grouping from filtered daily ──────────────────────────────
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    filteredDaily.forEach(({ date, pnl }) => {
      const key = date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + pnl);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, pnl]) => ({
        pnl,
        label: new Date(month + "-01T00:00:00").toLocaleDateString("en-US", {
          month: "short", year: "2-digit",
        }),
      }));
  }, [filteredDaily]);

  // ── Cumulative PNL ────────────────────────────────────────────────────
  const cumulativeData = useMemo(() => {
    let cum = 0;
    return filteredDaily.map(({ date, pnl }) => {
      cum += pnl;
      return { label: fShortDate(date), cumPnl: cum };
    });
  }, [filteredDaily]);

  // ── Summary KPI values (always full dataset, local-calendar dates) ──────
  const todayStr   = useMemo(() => localDateStr(now), [now]);
  const weekCutoff = useMemo(() => {
    const d   = new Date(now);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return localDateStr(d);
  }, [now]);
  const monthCutoff = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const yearStr     = useMemo(() => String(now.getFullYear()), [now]);

  const todayPnl = useMemo(
    () => allDaily.filter(p => p.date === todayStr).reduce((s, p) => s + p.pnl, 0),
    [allDaily, todayStr],
  );
  const weekPnl = useMemo(
    () => allDaily.filter(p => p.date >= weekCutoff).reduce((s, p) => s + p.pnl, 0),
    [allDaily, weekCutoff],
  );
  const monthPnl = useMemo(
    () => allDaily.filter(p => p.date.startsWith(monthCutoff)).reduce((s, p) => s + p.pnl, 0),
    [allDaily, monthCutoff],
  );
  const yearPnl = useMemo(
    () => allDaily.filter(p => p.date.startsWith(yearStr)).reduce((s, p) => s + p.pnl, 0),
    [allDaily, yearStr],
  );
  const allTimePnl = stats?.netPnl ?? 0;

  // ── Stats from filtered data ──────────────────────────────────────────
  const activeDays        = filteredDaily.filter(d => d.pnl !== 0).length;
  const totalFilteredPnl  = filteredDaily.reduce((s, d) => s + d.pnl, 0);

  const bestDay  = filteredDaily.length
    ? filteredDaily.reduce((b, d) => d.pnl > b.pnl ? d : b)
    : null;
  const worstDay = filteredDaily.length
    ? filteredDaily.reduce((w, d) => d.pnl < w.pnl ? d : w)
    : null;

  const avgDailyPnl   = activeDays      > 0 ? totalFilteredPnl / activeDays      : 0;
  const avgWeeklyPnl  = weeklyData.length  > 0 ? weeklyData.reduce((s, w) => s + w.pnl, 0) / weeklyData.length  : 0;
  const avgMonthlyPnl = monthlyData.length > 0 ? monthlyData.reduce((s, m) => s + m.pnl, 0) / monthlyData.length : 0;

  const pnlSign = (v: number) => (v > 0 ? "+" : "");

  // ── All hooks must appear before any early returns ────────────────────
  const filterLabel = TIME_FILTERS.find(f => f.id === timeFilter)?.label ?? "All";

  // ── Daily chart data ──────────────────────────────────────────────────
  const dailyChartData = useMemo(
    () => filteredDaily.map(d => ({ ...d, label: fShortDate(d.date) })),
    [filteredDaily],
  );

  // ── Minimum bar chart widths (for scrolling) ──────────────────────────
  const dailyMinW   = Math.max(520, dailyChartData.length * 26);
  const weeklyMinW  = Math.max(360, weeklyData.length  * 44);
  const monthlyMinW = Math.max(360, monthlyData.length * 56);
  const cumMinW     = Math.max(520, cumulativeData.length * 22);

  // ── Derived per-trade stats ───────────────────────────────────────────
  const grossProfit = (stats?.averageWin  ?? 0) * (stats?.winCount  ?? 0);
  const grossLoss   = (stats?.averageLoss ?? 0) * (stats?.lossCount ?? 0);

  // ── Loading skeleton — shown while data is loading OR entry animation is in-flight ──
  // The full-page skeleton covers the header area too, so the real header and
  // cards all appear together in one shot instead of the header popping in first.
  const showSkeleton = pageState === "loading";

  if (showSkeleton) {
    return (
      <div className="flex flex-col h-full" style={{ background: "#000000" }}>
        {/* Header placeholder */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-5"
          style={{ height: 56, borderBottom: "1px solid #262626" }}
        >
          <div className="w-8 h-8 rounded-full shimmer-loading" />
          <div className="h-4 w-36 rounded-lg shimmer-loading" />
          <div style={{ width: 32 }} />
        </div>
        {/* Content placeholder */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          <div className="space-y-4 pb-12 px-4 sm:px-6 pt-4">
            <div className="grid grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-2xl shimmer-loading" />)}
            </div>
            <div className="h-8 w-80 rounded-xl shimmer-loading" />
            {[...Array(3)].map((_, i) => <div key={i} className="h-52 rounded-2xl shimmer-loading" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#000000" }}>

      {/* ── Secondary header ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5"
        style={{ height: 56, borderBottom: "1px solid #262626" }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 32, height: 32, background: "transparent" }}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "#E8E8E8" }} />
        </button>
        <span className="font-semibold" style={{ color: "#F3F3F3", fontSize: 17 }}>
          Net PNL Analytics
        </span>
        <button
          onClick={() => setCurrency(currency === "USD" ? "INR" : "USD")}
          className="flex items-center gap-1 active:scale-95 transition-transform"
          style={{
            height:       28,
            padding:      "0 10px",
            borderRadius: 8,
            background:   currency === "INR" ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.07)",
            border:       currency === "INR" ? "1px solid rgba(251,191,36,0.35)" : "1px solid rgba(255,255,255,0.12)",
          }}
          aria-label="Toggle currency"
        >
          <span style={{
            fontSize:   11,
            fontWeight: 700,
            color:      currency === "INR" ? "rgba(251,191,36,0.9)" : "#9ca3af",
            letterSpacing: "0.04em",
          }}>
            {currency === "USD" ? "$ USD" : "₹ INR"}
          </span>
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        {<div className="space-y-4 pt-4 pb-12 px-4 sm:px-6">

      {/* ── Demo data banner ── */}
      {IS_DEMO && (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[11px] font-semibold"
          style={{
            background: "rgba(251,191,36,0.07)",
            border: "1px solid rgba(251,191,36,0.22)",
            color: "rgba(251,191,36,0.85)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 flex-shrink-0 animate-pulse" />
          Demo data — connect your broker or record trades to see your real analytics
        </div>
      )}

      {/* ── Top 6 KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          index={0} label="Net PNL" icon={allTimePnl >= 0 ? TrendingUp : TrendingDown}
          value={fc(allTimePnl)}
          positive={allTimePnl > 0 ? true : allTimePnl < 0 ? false : undefined}
          sub="All time"
        />
        <KpiCard
          index={1} label="Today" icon={Activity}
          value={`${pnlSign(todayPnl)}${fc(todayPnl)}`}
          positive={todayPnl > 0 ? true : todayPnl < 0 ? false : undefined}
          sub={todayStr}
        />
        <KpiCard
          index={2} label="This Week" icon={BarChart2}
          value={`${pnlSign(weekPnl)}${fc(weekPnl)}`}
          positive={weekPnl > 0 ? true : weekPnl < 0 ? false : undefined}
        />
        <KpiCard
          index={3} label="This Month" icon={CalendarDays}
          value={`${pnlSign(monthPnl)}${fc(monthPnl)}`}
          positive={monthPnl > 0 ? true : monthPnl < 0 ? false : undefined}
          sub={now.toLocaleDateString("en-US", { month: "long" })}
        />
        <KpiCard
          index={4} label="This Year" icon={Zap}
          value={`${pnlSign(yearPnl)}${fc(yearPnl)}`}
          positive={yearPnl > 0 ? true : yearPnl < 0 ? false : undefined}
          sub={yearStr}
        />
        <KpiCard
          index={5} label="All Time" icon={Flame}
          value={fc(allTimePnl)}
          positive={allTimePnl > 0 ? true : allTimePnl < 0 ? false : undefined}
        />
      </div>

      {/* ── Time filter pills ── */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
        style={{ scrollbarWidth: "none" }}
      >
        {TIME_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTimeFilter(f.id)}
            className="shrink-0 px-4 py-1.5 rounded-xl text-[12px] font-bold transition-all duration-150"
            style={{
              background:  timeFilter === f.id ? "hsl(var(--primary) / 0.15)" : "rgba(255,255,255,0.04)",
              border:      timeFilter === f.id ? "1px solid hsl(var(--primary) / 0.35)" : "1px solid rgba(255,255,255,0.07)",
              color:       timeFilter === f.id ? "hsl(var(--primary))" : "hsl(128 8% 42%)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── 1. Daily Net PNL Bar Chart ── */}
      <div className="glass-card overflow-hidden">
        <ChartHeader
          icon={BarChart2}
          title="Daily Net PNL"
          right={
            filteredDaily.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {filteredDaily.length} day{filteredDaily.length !== 1 ? "s" : ""}
              </span>
            ) : undefined
          }
        />
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {dailyChartData.length === 0 ? (
            <EmptyChart h={200} />
          ) : (
            <div style={{ minWidth: dailyMinW, height: 200, paddingBottom: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={dailyChartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    stroke="transparent"
                    tick={{ fill: "hsl(128 8% 40%)", fontSize: 9 }}
                    tickLine={false} axisLine={false}
                    interval={dailyChartData.length > 30 ? "preserveStartEnd" : 0}
                  />
                  <YAxis
                    stroke="transparent"
                    tick={{ fill: "hsl(128 8% 40%)", fontSize: 10 }}
                    tickLine={false} axisLine={false}
                    tickFormatter={axisFormatter}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 2" />
                  <Tooltip
                    content={({ active, payload, label }) => (
                      <BarTooltip active={active} payload={payload} label={label} />
                    )}
                    cursor={{ fill: "rgba(255,255,255,0.025)" }}
                  />
                  <Bar dataKey="pnl" radius={[3, 3, 1, 1]} maxBarSize={20} isAnimationActive={false}>
                    {dailyChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.pnl >= 0 ? GREEN : RED} fillOpacity={0.9} />
                    ))}
                  </Bar>
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── 2 & 3. Weekly | Monthly ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Weekly */}
        <div className="glass-card overflow-hidden">
          <ChartHeader icon={BarChart2} title="Weekly Net PNL" />
          <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {weeklyData.length === 0 ? (
              <EmptyChart />
            ) : (
              <div style={{ minWidth: weeklyMinW, height: 180, paddingBottom: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={weeklyData} margin={{ top: 8, right: 16, left: -24, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      stroke="transparent"
                      tick={{ fill: "hsl(128 8% 40%)", fontSize: 9 }}
                      tickLine={false} axisLine={false}
                    />
                    <YAxis
                      stroke="transparent"
                      tick={{ fill: "hsl(128 8% 40%)", fontSize: 10 }}
                      tickLine={false} axisLine={false}
                      tickFormatter={axisFormatter}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 2" />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <BarTooltip active={active} payload={payload} label={label} labelPrefix="Week of " />
                      )}
                      cursor={{ fill: "rgba(255,255,255,0.025)" }}
                    />
                    <Bar dataKey="pnl" radius={[4, 4, 2, 2]} maxBarSize={32} isAnimationActive={false}>
                      {weeklyData.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? GREEN : RED} fillOpacity={0.88} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Monthly */}
        <div className="glass-card overflow-hidden">
          <ChartHeader icon={CalendarDays} title="Monthly Net PNL" />
          <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {monthlyData.length === 0 ? (
              <EmptyChart />
            ) : (
              <div style={{ minWidth: monthlyMinW, height: 180, paddingBottom: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={monthlyData} margin={{ top: 8, right: 16, left: -24, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      stroke="transparent"
                      tick={{ fill: "hsl(128 8% 40%)", fontSize: 9 }}
                      tickLine={false} axisLine={false}
                    />
                    <YAxis
                      stroke="transparent"
                      tick={{ fill: "hsl(128 8% 40%)", fontSize: 10 }}
                      tickLine={false} axisLine={false}
                      tickFormatter={axisFormatter}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 2" />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <BarTooltip active={active} payload={payload} label={label} />
                      )}
                      cursor={{ fill: "rgba(255,255,255,0.025)" }}
                    />
                    <Bar dataKey="pnl" radius={[4, 4, 2, 2]} maxBarSize={40} isAnimationActive={false}>
                      {monthlyData.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? GREEN : RED} fillOpacity={0.88} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Cumulative PNL (Equity Curve) ── */}
      <div className="glass-card overflow-hidden">
        <ChartHeader
          icon={Activity}
          title="Cumulative Net PNL"
          right={
            cumulativeData.length > 0 ? (
              <span
                className={`text-[13px] font-black ${
                  cumulativeData[cumulativeData.length - 1].cumPnl >= 0
                    ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {pnlSign(cumulativeData[cumulativeData.length - 1].cumPnl)}
                {fc(cumulativeData[cumulativeData.length - 1].cumPnl)}
              </span>
            ) : undefined
          }
        />
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {cumulativeData.length === 0 ? (
            <EmptyChart h={200} />
          ) : (
            <div style={{ minWidth: cumMinW, height: 200, paddingBottom: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={BLUE} stopOpacity={0.28} />
                      <stop offset="60%"  stopColor={BLUE} stopOpacity={0.05} />
                      <stop offset="100%" stopColor={BLUE} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    stroke="transparent"
                    tick={{ fill: "hsl(128 8% 40%)", fontSize: 9 }}
                    tickLine={false} axisLine={false}
                    interval={cumulativeData.length > 30 ? "preserveStartEnd" : 0}
                  />
                  <YAxis
                    stroke="transparent"
                    tick={{ fill: "hsl(128 8% 40%)", fontSize: 10 }}
                    tickLine={false} axisLine={false}
                    tickFormatter={axisFormatter}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 2" />
                  <Tooltip content={<CumTooltip />} />
                  <Area
                    type="monotone" dataKey="cumPnl"
                    stroke={BLUE} strokeWidth={2}
                    fill="url(#cumGrad)" dot={false}
                    activeDot={{ r: 4, fill: BLUE, stroke: "hsl(var(--background))", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. PNL Calendar Heatmap ── */}
      <div className="glass-card overflow-hidden">
        <ChartHeader
          icon={CalendarDays}
          title="PNL Calendar"
          right={
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-emerald-400/60 inline-block" />Profit
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-red-400/60 inline-block" />Loss
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-white/10 inline-block" />No trades
              </span>
            </div>
          }
        />
        <div className="px-5 pb-5">
          <CalendarHeatmap
            data={toArray(calData, "pnl-analytics.calData")}
            year={now.getFullYear()}
            month={now.getMonth() + 1}
          />
        </div>
      </div>

      {/* ── Trade Statistics grid ── */}
      <div className="glass-card overflow-hidden">
        <ChartHeader icon={Trophy} title="Trade Statistics" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 border-t border-border/50 divide-y divide-border/40">

          {/* Row 1 */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-border/40">
            <StatItem
              label="Win Rate"
              value={stats ? `${n(stats.winRate).toFixed(1)}%` : "—"}
              sub="Trades closed positive"
              color="#34d399"
            />
            <StatItem
              label="Profit Factor"
              value={stats ? n(stats.profitFactor).toFixed(2) : "—"}
              sub="Gross profit / gross loss"
              color={stats && n(stats.profitFactor) >= 1 ? "#34d399" : "#f87171"}
            />
            <StatItem
              label="Avg Risk / Reward"
              value={stats ? `${n(stats.averageRR).toFixed(2)}R` : "—"}
              sub="Average RR across winners"
              color="#60a5fa"
            />
            <StatItem
              label="Total Trades"
              value={stats ? String(n(stats.totalTrades)) : "—"}
              sub={stats ? `${n(stats.winCount)}W · ${n(stats.lossCount)}L${n(stats.breakevenCount) ? ` · ${n(stats.breakevenCount)}B` : ""}` : undefined}
            />
          </div>

          {/* Row 2 */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-border/40 border-t border-border/40">
            <StatItem
              label="Average Win"
              value={stats && stats.averageWin > 0 ? `+${fc(stats.averageWin)}` : "—"}
              sub="Per winning trade"
              color="#34d399"
            />
            <StatItem
              label="Average Loss"
              value={stats && stats.averageLoss > 0 ? `-${fc(stats.averageLoss)}` : "—"}
              sub="Per losing trade"
              color="#f87171"
            />
            <StatItem
              label="Best Trade"
              value={stats && stats.largestWin > 0 ? `+${fc(stats.largestWin)}` : "—"}
              sub="Single trade high"
              color="#34d399"
            />
            <StatItem
              label="Worst Trade"
              value={stats && stats.largestLoss > 0 ? `-${fc(stats.largestLoss)}` : "—"}
              sub="Single trade low"
              color="#f87171"
            />
          </div>

          {/* Row 3 */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-border/40 border-t border-border/40">
            <StatItem
              label="Net Profit"
              value={stats ? `${pnlSign(stats.netPnl)}${fc(stats.netPnl)}` : "—"}
              sub="Gross profit − gross loss"
              color={stats && stats.netPnl >= 0 ? "#34d399" : "#f87171"}
            />
            <StatItem
              label="Gross Profit"
              value={grossProfit > 0 ? `+${fc(grossProfit)}` : "—"}
              sub={`${stats?.winCount ?? 0} winning trades`}
              color="#34d399"
            />
            <StatItem
              label="Gross Loss"
              value={grossLoss > 0 ? `-${fc(grossLoss)}` : "—"}
              sub={`${stats?.lossCount ?? 0} losing trades`}
              color="#f87171"
            />
            <StatItem
              label="Win Streak"
              value={stats && stats.currentStreak > 0 ? `+${stats.currentStreak}` : stats && stats.currentStreak < 0 ? String(stats.currentStreak) : "—"}
              sub="Current streak"
              color={stats && stats.currentStreak > 0 ? "#34d399" : stats && stats.currentStreak < 0 ? "#f87171" : undefined}
            />
          </div>

        </div>
      </div>

      {/* ── Daily / Period stats grid ── */}
      <div className="glass-card overflow-hidden">
        <ChartHeader
          icon={Target}
          title="PNL Statistics"
          right={
            <span className="text-[10px] text-muted-foreground bg-white/[0.04] rounded-full px-2.5 py-0.5 border border-white/[0.06]">
              {filterLabel} range
            </span>
          }
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border/50">
          <StatItem
            label="Best Profit Day"
            value={bestDay && bestDay.pnl > 0 ? fLongDate(bestDay.date) : "—"}
            sub={bestDay && bestDay.pnl > 0 ? `+${fc(bestDay.pnl)}` : undefined}
            color={bestDay && bestDay.pnl > 0 ? "#34d399" : undefined}
          />
          <StatItem
            label="Worst Loss Day"
            value={worstDay && worstDay.pnl < 0 ? fLongDate(worstDay.date) : "—"}
            sub={worstDay && worstDay.pnl < 0 ? fc(worstDay.pnl) : undefined}
            color={worstDay && worstDay.pnl < 0 ? "#f87171" : undefined}
          />
          <StatItem
            label="Highest Daily Profit"
            value={bestDay && bestDay.pnl > 0 ? `+${fc(bestDay.pnl)}` : "—"}
            sub={bestDay && bestDay.pnl > 0 ? fLongDate(bestDay.date) : undefined}
            color={bestDay && bestDay.pnl > 0 ? "#34d399" : undefined}
          />
          <StatItem
            label="Highest Daily Loss"
            value={worstDay && worstDay.pnl < 0 ? fc(worstDay.pnl) : "—"}
            sub={worstDay && worstDay.pnl < 0 ? fLongDate(worstDay.date) : undefined}
            color={worstDay && worstDay.pnl < 0 ? "#f87171" : undefined}
          />
          <StatItem
            label="Avg Daily Net PNL"
            value={activeDays > 0 ? `${pnlSign(avgDailyPnl)}${fc(avgDailyPnl)}` : "—"}
            sub={activeDays > 0 ? `${activeDays} active day${activeDays !== 1 ? "s" : ""}` : undefined}
            color={avgDailyPnl >= 0 ? "#34d399" : "#f87171"}
          />
          <StatItem
            label="Avg Weekly Net PNL"
            value={weeklyData.length > 0 ? `${pnlSign(avgWeeklyPnl)}${fc(avgWeeklyPnl)}` : "—"}
            sub={weeklyData.length > 0 ? `${weeklyData.length} week${weeklyData.length !== 1 ? "s" : ""}` : undefined}
            color={avgWeeklyPnl >= 0 ? "#34d399" : "#f87171"}
          />
          <StatItem
            label="Avg Monthly Net PNL"
            value={monthlyData.length > 0 ? `${pnlSign(avgMonthlyPnl)}${fc(avgMonthlyPnl)}` : "—"}
            sub={monthlyData.length > 0 ? `${monthlyData.length} month${monthlyData.length !== 1 ? "s" : ""}` : undefined}
            color={avgMonthlyPnl >= 0 ? "#34d399" : "#f87171"}
          />
          <StatItem
            label="Total Net PNL"
            value={`${pnlSign(totalFilteredPnl)}${fc(totalFilteredPnl)}`}
            sub={filterLabel !== "All" ? `${filterLabel} period` : "All time"}
            color={totalFilteredPnl >= 0 ? "#34d399" : "#f87171"}
          />
        </div>
      </div>

    </div>}
      </div>
    </div>
  );
}
