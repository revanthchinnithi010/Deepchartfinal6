// Net PNL Analytics — redesigned dashboard layout
// Header, back button, and page title are rendered by the shared Layout
// (see components/layout.tsx, keyed on the "/net-pnl" pathname).
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  Flame,
  Calendar,
  Trophy,
  Target,
  ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { DEV_MODE } from "@/mock/config";
import { MOCK_NETPNL_TRADE_ROWS } from "@/mock/data/netpnl";
import { toArray } from "@/lib/safeArray";

// ── Types ─────────────────────────────────────────────────────────────────────
type TimeFilter = "today" | "7d" | "30d" | "3m" | "1y" | "all";

interface TradeRow {
  pnl: number;
  exit_date: string;
}

interface RawPoint {
  label:   string;
  cumPnl:  number;
  sortKey: number;
}

interface ChartPoint {
  label:    string;
  cumPnl:   number;
  sortKey:  number;
  greenPnl: number | null;
  redPnl:   number | null;
}

// ── Mock data (used for all sections below the line chart) ────────────────────
const MOCK_SUMMARY = {
  netPnl:           2192.45,
  netPnlPct:        219.24,
  totalTrades:      128,
  winRate:          62.5,
  bestTrade:        512.32,
  bestTradeSymbol:  "BTCUSDT",
  worstTrade:       -215.43,
  worstTradeSymbol: "ETHUSDT",
};

const MOCK_DISTRIBUTION = { winning: 80, losing: 48 };

const MOCK_MONTHLY = [
  { month: "Jul '25", pnl: -120 },
  { month: "Aug '25", pnl:   50 },
  { month: "Sep '25", pnl: -380 },
  { month: "Oct '25", pnl:  210 },
  { month: "Nov '25", pnl:  480 },
  { month: "Dec '25", pnl:  320 },
  { month: "Jan '26", pnl:  640 },
  { month: "Feb '26", pnl:  520 },
  { month: "Mar '26", pnl:  710 },
  { month: "Apr '26", pnl:  380 },
  { month: "May '26", pnl:  850 },
  { month: "Jun '26", pnl:  960 },
  { month: "Jul '26", pnl: 1100 },
];

const MOCK_TRADING_STATS = {
  bestTrade:          512.32,
  worstTrade:        -215.43,
  avgWin:             128.45,
  avgLoss:            -68.32,
  longestWinStreak:   7,
  longestLossStreak:  4,
};

const MOCK_CUMULATIVE = {
  winningDays:        46,
  losingDays:         28,
  breakEvenDays:       6,
  totalTradingDays:   80,
  longestGreenStreak:  9,
  longestRedStreak:    6,
};

// ── Time filter config ────────────────────────────────────────────────────────
const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d",   label: "7D"   },
  { id: "30d",  label: "30D"  },
  { id: "3m",   label: "3M"   },
  { id: "1y",   label: "1Y"   },
  { id: "all",  label: "All"  },
];

// ── Date helpers ──────────────────────────────────────────────────────────────
function getStartIso(filter: TimeFilter): string | null {
  const now = new Date();
  switch (filter) {
    case "today": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.toISOString();
    }
    case "7d": {
      const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString();
    }
    case "30d": {
      const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString();
    }
    case "3m": {
      const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString();
    }
    case "1y": {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString();
    }
    case "all":
      return null;
  }
}

function getBucketLabel(date: Date, filter: TimeFilter): string {
  switch (filter) {
    case "today":
      return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
    case "7d":
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    case "30d":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "3m": {
      const tmp = new Date(date);
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const jan4 = new Date(tmp.getFullYear(), 0, 4);
      const wk = 1 + Math.round(
        ((tmp.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7,
      );
      return `W${wk} ${tmp.getFullYear()}`;
    }
    case "1y":
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    case "all":
      return String(date.getFullYear());
  }
}

function getBucketSortKey(date: Date, filter: TimeFilter): number {
  switch (filter) {
    case "today":
      return date.getHours() * 60 + date.getMinutes();
    case "7d":
    case "30d":
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    case "3m": {
      const tmp = new Date(date);
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const jan4 = new Date(tmp.getFullYear(), 0, 4);
      const wk = 1 + Math.round(
        ((tmp.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7,
      );
      return tmp.getFullYear() * 1000 + wk;
    }
    case "1y":
      return date.getFullYear() * 12 + date.getMonth();
    case "all":
      return date.getFullYear();
  }
}

// ── Data builders ─────────────────────────────────────────────────────────────
function bucketTrades(trades: TradeRow[], filter: TimeFilter): RawPoint[] {
  const buckets = new Map<string, { pnl: number; sortKey: number }>();
  for (const t of trades) {
    const date    = new Date(t.exit_date);
    const label   = getBucketLabel(date, filter);
    const sortKey = getBucketSortKey(date, filter);
    const existing = buckets.get(label);
    if (existing) {
      existing.pnl += t.pnl;
    } else {
      buckets.set(label, { pnl: t.pnl, sortKey });
    }
  }
  const sorted = Array.from(buckets.entries()).sort((a, b) => a[1].sortKey - b[1].sortKey);
  let cum = 0;
  return sorted.map(([label, { pnl, sortKey }]) => {
    cum += pnl;
    return { label, cumPnl: Math.round(cum * 100) / 100, sortKey };
  });
}

function splitAtZero(raw: RawPoint[]): ChartPoint[] {
  if (raw.length === 0) return [];
  const out: ChartPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const curr = raw[i];
    const prev = i > 0 ? raw[i - 1] : null;
    if (prev !== null) {
      const pv = prev.cumPnl;
      const cv = curr.cumPnl;
      if ((pv > 0 && cv < 0) || (pv < 0 && cv > 0)) {
        const t = pv / (pv - cv);
        out.push({
          label:    "",
          cumPnl:   0,
          sortKey:  prev.sortKey + t * (curr.sortKey - prev.sortKey),
          greenPnl: 0,
          redPnl:   0,
        });
      }
    }
    if (curr.cumPnl === 0) {
      out.push({ ...curr, greenPnl: 0, redPnl: 0 });
    } else if (curr.cumPnl > 0) {
      out.push({ ...curr, greenPnl: curr.cumPnl, redPnl: null });
    } else {
      out.push({ ...curr, greenPnl: null, redPnl: curr.cumPnl });
    }
  }
  return out;
}

function buildChartData(trades: TradeRow[], filter: TimeFilter): ChartPoint[] {
  return splitAtZero(bucketTrades(trades, filter));
}

// ── Formatters ────────────────────────────────────────────────────────────────
function yAxisFmt(v: number): string {
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v}`;
}

function fmtUsd(v: number): string {
  return (v >= 0 ? "+" : "−") + "$" +
    Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUsdShort(v: number): string {
  const abs = Math.abs(v);
  const str = abs >= 1_000
    ? (abs / 1_000).toFixed(1) + "k"
    : abs.toFixed(0);
  return (v >= 0 ? "+" : "−") + "$" + str;
}

// ── Tooltip — line chart ──────────────────────────────────────────────────────
interface TooltipPayloadEntry {
  value:   number | null;
  dataKey: string;
}

function NetPnLTooltip({
  active, payload, label,
}: {
  active?:  boolean;
  payload?: TooltipPayloadEntry[];
  label?:   string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload.find(p => p.value !== null && p.value !== undefined);
  const value = entry?.value ?? null;
  if (value === null) return null;
  const color = value >= 0 ? "#22c55e" : "#ef4444";
  return (
    <div style={{
      background:     "rgba(10,12,16,0.97)",
      border:         "1px solid rgba(255,255,255,0.09)",
      borderRadius:   10,
      padding:        "10px 14px",
      backdropFilter: "blur(16px)",
      boxShadow:      "0 8px 28px rgba(0,0,0,0.55)",
      minWidth:       140,
    }}>
      <p style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 3 }}>Net PNL</p>
      <p style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {fmtUsd(value)}
      </p>
      <p style={{ fontSize: 10, color: "#4b5563", marginTop: 4 }}>Profit / Loss (USD)</p>
    </div>
  );
}

// ── Custom X-axis tick — abbreviated month + year only on year-change ────────
// Recharts passes `index` automatically; we use it to skip labels on mobile
// so they never overlap on narrow screens (≤360 px).
function MonthlyXTick({
  x = 0, y = 0, payload, index = 0,
}: {
  x?: number; y?: number; payload?: { value: string }; index?: number;
}) {
  const isMobile = useIsMobile();
  const total    = MOCK_MONTHLY.length;                        // 13
  const val      = payload?.value ?? "";
  const [mon, shortYr] = val.split(" ");                       // "Jul", "'25"

  // Year-change detection uses index directly — no findIndex overhead
  const prevYr   = index > 0 ? MOCK_MONTHLY[index - 1].month.split(" ")[1] : null;
  const showYear = !!shortYr && prevYr !== null && shortYr !== prevYr;
  const fullYear = shortYr ? "20" + shortYr.replace("'", "") : "";
  const fs       = isMobile ? 11 : 13;

  // Mobile skip-logic: show every 2nd label so 13 ticks → 7 visible labels on
  // a 360 px screen (~39 px apart).  First + last are always forced visible.
  const step         = isMobile ? 2 : 1;
  const isFirst      = index === 0;
  const isLast       = index === total - 1;
  const shouldRender = isFirst || isLast || index % step === 0;

  // Return an invisible placeholder so Recharts layout is undisturbed
  if (!shouldRender) return <g />;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0} y={0} dy={14}
        textAnchor="middle"
        fill="#A1A1AA"
        fontSize={fs}
        fontWeight={500}
      >
        {mon}
      </text>
      {showYear && (
        <text
          x={0} y={0} dy={isMobile ? 28 : 30}
          textAnchor="middle"
          fill="#71717A"
          fontSize={isMobile ? 9 : 11}
          fontWeight={400}
        >
          {fullYear}
        </text>
      )}
    </g>
  );
}

// ── Thin vertical guide-line cursor ──────────────────────────────────────────
function MonthlyCursor({
  x = 0, y = 0, width = 0, height = 0,
}: {
  x?: number; y?: number; width?: number; height?: number;
}) {
  const cx = x + width / 2;
  return (
    <line
      x1={cx} y1={y}
      x2={cx} y2={y + height}
      stroke="rgba(255,255,255,0.18)"
      strokeWidth={1}
      strokeDasharray="4 3"
    />
  );
}

// ── Custom bar shape — rounds the outer corners only (top for +, bottom for -) ─
function MonthlyBarShape(props: {
  x?: number; y?: number; width?: number; height?: number; value?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  if (!width || !height) return null;
  const r = Math.min(4, Math.abs(height) / 2, width / 2);
  const fill   = value >= 0 ? "#22c55e" : "#ef4444";
  const opacity = 0.88;

  let d: string;
  if (value >= 0) {
    // Positive bar: round top-left and top-right corners
    d = [
      `M ${x},${y + height}`,
      `V ${y + r}`,
      `Q ${x},${y} ${x + r},${y}`,
      `H ${x + width - r}`,
      `Q ${x + width},${y} ${x + width},${y + r}`,
      `V ${y + height}`,
      "Z",
    ].join(" ");
  } else {
    // Negative bar: round bottom-left and bottom-right corners
    d = [
      `M ${x},${y}`,
      `H ${x + width}`,
      `V ${y + height - r}`,
      `Q ${x + width},${y + height} ${x + width - r},${y + height}`,
      `H ${x + r}`,
      `Q ${x},${y + height} ${x},${y + height - r}`,
      `V ${y}`,
      "Z",
    ].join(" ");
  }

  return <path d={d} fill={fill} fillOpacity={opacity} />;
}

// ── Tooltip — monthly bar chart ───────────────────────────────────────────────
function MonthlyTooltip({
  active, payload, label,
}: {
  active?:  boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?:   string;
}) {
  if (!active || !payload?.length) return null;
  const val   = payload[0].value as number;
  const isPos = val >= 0;
  // "Jul '25" → "Jul 2025"
  const [mon, shortYr] = (label ?? "").split(" ");
  const fullYear    = shortYr ? "20" + shortYr.replace("'", "") : "";
  const displayLabel = fullYear ? `${mon} ${fullYear}` : mon;

  return (
    <div style={{
      background:    "#111111",
      border:        "1px solid #2A2A2A",
      borderRadius:  14,
      boxShadow:     "0 8px 30px rgba(0,0,0,.45)",
      padding:       14,
      minWidth:      128,
      pointerEvents: "none",
    }}>
      <p style={{
        color:         "#71717A",
        fontSize:      11,
        fontWeight:    500,
        marginBottom:  6,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}>
        {displayLabel}
      </p>
      <p style={{
        fontWeight:    700,
        fontSize:      17,
        color:         isPos ? "#22C55E" : "#EF4444",
        letterSpacing: "-0.02em",
        margin:        0,
      }}>
        {isPos ? "+" : "−"}${Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** 5-column stats summary card */
function SummaryCard({
  label, value, sub, valueColor, subColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  subColor?: string;
}) {
  return (
    <div
      className="stat-card-neutral flex flex-col gap-1 px-4 py-3 transition-all duration-200"
      style={{ borderRadius: 16 }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: "var(--stat-title)" }}>
        {label}
      </span>
      <span
        className="text-[15px] sm:text-[17px] font-black leading-none tracking-tight tabular-nums"
        style={{ color: valueColor ?? "hsl(var(--foreground))" }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="text-[10px] tabular-nums"
          style={{ color: subColor ?? "rgba(161,161,170,0.70)", fontWeight: 500 }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

/** Trading statistics row card */
function TradingStatCard({
  label, value, icon: Icon, positive,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  positive?: boolean;
}) {
  const valueColor =
    positive === true  ? "#22c55e" :
    positive === false ? "#ef4444" :
    "hsl(var(--foreground))";

  const iconBg =
    positive === true  ? "rgba(34,197,94,0.12)"  :
    positive === false ? "rgba(239,68,68,0.12)"  :
    "rgba(255,255,255,0.06)";

  const iconColor =
    positive === true  ? "#22c55e" :
    positive === false ? "#ef4444" :
    "hsl(var(--muted-foreground))";

  return (
    <div
      className="stat-card-neutral flex items-center justify-between p-4 transition-all duration-200 group"
      style={{ borderRadius: 16 }}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--stat-title)" }}>
          {label}
        </span>
        <span
          className="text-[18px] font-black leading-none tabular-nums"
          style={{ color: valueColor }}
        >
          {value}
        </span>
      </div>
      <div
        className="stat-icon-neutral w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ml-3 transition-transform duration-200 group-hover:scale-110"
      >
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
    </div>
  );
}

/** Cumulative statistics card */
function CumulativeStatCard({
  label, value, sub, icon: Icon, valueColor, iconColor, iconBg,
}: {
  label:      string;
  value:      string;
  sub:        string;
  icon:       React.ElementType;
  valueColor: string;
  iconColor:  string;
  iconBg:     string;
}) {
  return (
    <div
      className="stat-card-neutral flex flex-col gap-2 p-4 transition-all duration-200 hover:scale-[1.02] cursor-default"
      style={{ borderRadius: 16 }}
    >
      <div
        className="stat-icon-neutral w-8 h-8 rounded-lg flex items-center justify-center"
      >
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span
          className="text-[22px] font-black leading-none tabular-nums"
          style={{ color: valueColor }}
        >
          {value}
        </span>
        <span className="text-[10px]" style={{ color: "var(--stat-sub)" }}>{sub}</span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--stat-title)" }}>
        {label}
      </span>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border:     "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <h2 className="text-[13px] font-bold text-foreground tracking-tight">{title}</h2>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NetPnLAnalytics() {
  const [, navigate]  = useLocation();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [trades,     setTrades]     = useState<TradeRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Defer heavy chart mount until the page's entry animation (cover-detail,
  // 240ms) has finished. Framer Motion drives that animation on the JS main
  // thread, so committing 5+ Recharts charts mid-animation causes visible
  // stutter — mounting the lightweight skeleton first lets the animation
  // finish smoothly, then swaps in the real charts right after.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const rafId = requestAnimationFrame(() => {
      timerId = setTimeout(() => setChartsReady(true), 260);
    });
    return () => { cancelAnimationFrame(rafId); clearTimeout(timerId); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        if (DEV_MODE) {
          const startIso = getStartIso(timeFilter);
          const rows = startIso
            ? MOCK_NETPNL_TRADE_ROWS.filter(r => r.exit_date >= startIso)
            : MOCK_NETPNL_TRADE_ROWS;
          setTrades(rows);
          return;
        }
        const res = await fetch("/api/stats/equity-curve");
        if (cancelled) return;
        if (!res.ok) { setError(`Failed to load trades (${res.status})`); setTrades([]); return; }
        const points = toArray<{ date: string; pnl: number }>(await res.json(), "NetPnLAnalytics.equity-curve");
        const startIso = getStartIso(timeFilter);
        const startMs = startIso ? new Date(startIso).getTime() : null;
        const valid = points
          .filter((r) => {
            if (typeof r.pnl !== "number" || isNaN(r.pnl)) return false;
            if (!r.date) return false;
            const t = new Date(r.date).getTime();
            if (isNaN(t)) return false;
            return startMs === null || t >= startMs;
          })
          .map((r) => ({ pnl: r.pnl, exit_date: r.date }));
        setTrades(valid);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
        setTrades([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [timeFilter]);

  const chartData = useMemo(() => buildChartData(trades, timeFilter), [trades, timeFilter]);
  const isEmpty   = !loading && !error && chartData.length === 0;

  // axis style tokens
  const axisColor = "rgba(255,255,255,0.12)";
  const tickStyle = { fill: "#9ca3af", fontSize: 11, fontWeight: 500 };
  const gridColor = "rgba(255,255,255,0.055)";

  // distribution donut data
  const total      = MOCK_DISTRIBUTION.winning + MOCK_DISTRIBUTION.losing;
  const winPct     = ((MOCK_DISTRIBUTION.winning / total) * 100).toFixed(1);
  const losePct    = ((MOCK_DISTRIBUTION.losing  / total) * 100).toFixed(1);
  const donutData  = [
    { name: "Winning", value: MOCK_DISTRIBUTION.winning },
    { name: "Losing",  value: MOCK_DISTRIBUTION.losing  },
  ];
  const donutColors = ["#22c55e", "#ef4444"];


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
        <div style={{ width: 32 }} />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        {/* Skeleton shown while trades are being fetched OR the entry animation
             hasn't finished yet (keeps heavy charts off the JS thread mid-animation) */}
        {(loading || !chartsReady) && (
          <div className="space-y-4 px-4 sm:px-6 pt-4 pb-12">
            <div className="grid grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-2xl shimmer-loading" />)}
            </div>
            <div className="h-8 w-64 rounded-xl shimmer-loading" />
            {[...Array(4)].map((_, i) => <div key={i} className="h-52 rounded-2xl shimmer-loading" />)}
          </div>
        )}
        {!loading && chartsReady && <div
      className="py-4 space-y-4 w-full"
      style={{ maxWidth: 1400, margin: "0 auto" }}
    >
      {/* ── Time filter chips ─────────────────────────────────────────── */}
      <div className="px-4 sm:px-6">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
          {TIME_FILTERS.map(f => {
            const active = timeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setTimeFilter(f.id)}
                className="shrink-0 px-4 py-1.5 rounded-xl text-[12px] font-bold transition-all duration-150"
                style={{
                  background: active ? "hsl(var(--primary) / 0.15)" : "rgba(255,255,255,0.04)",
                  border:     active ? "1px solid hsl(var(--primary) / 0.35)" : "1px solid rgba(255,255,255,0.07)",
                  color:      active ? "hsl(var(--primary))" : "#6b7280",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Net PNL Report card ───────────────────────────────────────── */}
      <div
        className="mx-4 sm:mx-6 rounded-2xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.02)",
          border:     "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* chart */}
        <div className="h-[300px] sm:h-[380px] lg:h-[440px] w-full px-1 pt-4">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center px-8">
              <p className="text-[12px] text-red-400/70 text-center">{error}</p>
            </div>
          ) : isEmpty ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-8">
              <p className="text-[13px] text-muted-foreground text-center">No trades found for this period</p>
              <p className="text-[11px] text-muted-foreground/50 text-center">Log trades or connect a broker to see your Net PNL</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 10 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="0" horizontal vertical />
                <XAxis
                  dataKey="label"
                  axisLine={{ stroke: axisColor }}
                  tickLine={{ stroke: axisColor }}
                  tick={tickStyle}
                  interval="preserveStartEnd"
                  minTickGap={48}
                />
                <YAxis
                  axisLine={{ stroke: axisColor }}
                  tickLine={{ stroke: axisColor }}
                  tick={tickStyle}
                  tickFormatter={yAxisFmt}
                  width={44}
                />
                <Tooltip
                  content={<NetPnLTooltip />}
                  cursor={{ stroke: "rgba(255,255,255,0.10)", strokeWidth: 1, strokeDasharray: "4 3" }}
                />
                <Line dataKey="greenPnl" stroke="#22c55e" strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: "#22c55e", stroke: "#0a0c10", strokeWidth: 2 }}
                  connectNulls={false} isAnimationActive animationDuration={700} animationEasing="ease-out" />
                <Line dataKey="redPnl" stroke="#ef4444" strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: "#ef4444", stroke: "#0a0c10", strokeWidth: 2 }}
                  connectNulls={false} isAnimationActive animationDuration={700} animationEasing="ease-out" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* stats summary row */}
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3 sm:p-4 border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <SummaryCard
            label="Net PNL"
            value={fmtUsd(MOCK_SUMMARY.netPnl)}
            sub={`+${MOCK_SUMMARY.netPnlPct.toFixed(2)}% ROI`}
            valueColor="#22c55e"
            subColor="rgba(34,197,94,0.65)"
          />
          <SummaryCard
            label="Total Trades"
            value={String(MOCK_SUMMARY.totalTrades)}
            sub={`${(MOCK_SUMMARY.totalTrades / MOCK_MONTHLY.length).toFixed(1)}/mo avg`}
          />
          <SummaryCard
            label="Best Trade"
            value={fmtUsd(MOCK_SUMMARY.bestTrade)}
            sub={MOCK_SUMMARY.bestTradeSymbol || undefined}
            valueColor="#22c55e"
          />
          <SummaryCard
            label="Worst Trade"
            value={fmtUsd(MOCK_SUMMARY.worstTrade)}
            sub={MOCK_SUMMARY.worstTradeSymbol || undefined}
            valueColor="#ef4444"
          />
        </div>
      </div>

      {/* ── PNL Distribution + Monthly PNL ───────────────────────────── */}
      <div className="mx-4 sm:mx-6 grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* PNL Distribution — doughnut */}
        <Section title="PNL Distribution">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* donut */}
            <div className="relative w-44 h-44 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={0}
                    isAnimationActive
                    animationDuration={700}
                    animationEasing="ease-out"
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={donutColors[i]} fillOpacity={0.9} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-foreground tabular-nums">{total}</span>
                <span className="text-[10px] text-muted-foreground font-medium">Trades</span>
              </div>
            </div>

            {/* legend */}
            <div className="flex flex-col gap-4 flex-1 w-full">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px] text-muted-foreground">Winning Trades</span>
                  <span className="text-[17px] font-black text-emerald-400 tabular-nums">
                    {MOCK_DISTRIBUTION.winning}
                    <span className="text-[11px] font-semibold text-emerald-500/70 ml-1.5">
                      ({winPct}%)
                    </span>
                  </span>
                </div>
              </div>

              {/* win bar */}
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${winPct}%`, opacity: 0.85 }}
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px] text-muted-foreground">Losing Trades</span>
                  <span className="text-[17px] font-black text-red-400 tabular-nums">
                    {MOCK_DISTRIBUTION.losing}
                    <span className="text-[11px] font-semibold text-red-500/70 ml-1.5">
                      ({losePct}%)
                    </span>
                  </span>
                </div>
              </div>

              {/* loss bar */}
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div
                  className="h-full rounded-full bg-red-500"
                  style={{ width: `${losePct}%`, opacity: 0.85 }}
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Monthly PNL — vertical column chart */}
        <Section title="Monthly PNL (USD)">
          <div className="w-full h-[300px] sm:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={MOCK_MONTHLY}
                margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                barCategoryGap="20%"
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray="0"
                  horizontal
                  vertical
                />
                <XAxis
                  dataKey="month"
                  axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                  tickLine={false}
                  tick={<MonthlyXTick />}
                  interval={0}
                  tickMargin={10}
                  height={56}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#A1A1AA", fontSize: 11, fontWeight: 500 }}
                  tickFormatter={(v: number) => fmtUsdShort(v)}
                  width={42}
                />
                <ReferenceLine
                  y={0}
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth={1.5}
                />
                <Tooltip
                  content={<MonthlyTooltip />}
                  cursor={<MonthlyCursor />}
                  allowEscapeViewBox={{ x: false, y: false }}
                  offset={12}
                />
                <Bar
                  dataKey="pnl"
                  maxBarSize={36}
                  isAnimationActive
                  animationDuration={700}
                  shape={<MonthlyBarShape />}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      {/* ── Trading Statistics ────────────────────────────────────────── */}
      <div className="mx-4 sm:mx-6">
        <Section title="Trading Statistics">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TradingStatCard
              label="Best Trade"
              value={fmtUsd(MOCK_TRADING_STATS.bestTrade)}
              icon={TrendingUp}
              positive={true}
            />
            <TradingStatCard
              label="Worst Trade"
              value={fmtUsd(MOCK_TRADING_STATS.worstTrade)}
              icon={TrendingDown}
              positive={false}
            />
            <TradingStatCard
              label="Average Win"
              value={fmtUsd(MOCK_TRADING_STATS.avgWin)}
              icon={BarChart2}
              positive={true}
            />
            <TradingStatCard
              label="Average Loss"
              value={fmtUsd(MOCK_TRADING_STATS.avgLoss)}
              icon={BarChart2}
              positive={false}
            />
            <TradingStatCard
              label="Largest Winning Streak"
              value={String(MOCK_TRADING_STATS.longestWinStreak)}
              icon={Flame}
              positive={true}
            />
            <TradingStatCard
              label="Largest Losing Streak"
              value={String(MOCK_TRADING_STATS.longestLossStreak)}
              icon={Flame}
              positive={false}
            />
          </div>
        </Section>
      </div>

      {/* ── Cumulative Statistics ─────────────────────────────────────── */}
      <div className="mx-4 sm:mx-6">
        <Section title="Cumulative Statistics">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <CumulativeStatCard
              label="Winning Days"
              value={String(MOCK_CUMULATIVE.winningDays)}
              sub={`${((MOCK_CUMULATIVE.winningDays / MOCK_CUMULATIVE.totalTradingDays) * 100).toFixed(1)}% of trading days`}
              icon={Calendar}
              valueColor="#22c55e"
              iconColor="#22c55e"
              iconBg="rgba(34,197,94,0.12)"
            />
            <CumulativeStatCard
              label="Losing Days"
              value={String(MOCK_CUMULATIVE.losingDays)}
              sub={`${((MOCK_CUMULATIVE.losingDays / MOCK_CUMULATIVE.totalTradingDays) * 100).toFixed(1)}% of trading days`}
              icon={Calendar}
              valueColor="#ef4444"
              iconColor="#ef4444"
              iconBg="rgba(239,68,68,0.12)"
            />
            <CumulativeStatCard
              label="Break-even Days"
              value={String(MOCK_CUMULATIVE.breakEvenDays)}
              sub={`${((MOCK_CUMULATIVE.breakEvenDays / MOCK_CUMULATIVE.totalTradingDays) * 100).toFixed(1)}% of trading days`}
              icon={Target}
              valueColor="#eab308"
              iconColor="#eab308"
              iconBg="rgba(234,179,8,0.12)"
            />
            <CumulativeStatCard
              label="Longest Green Streak"
              value={String(MOCK_CUMULATIVE.longestGreenStreak)}
              sub="Days"
              icon={TrendingUp}
              valueColor="#22c55e"
              iconColor="#22c55e"
              iconBg="rgba(34,197,94,0.12)"
            />
            <CumulativeStatCard
              label="Longest Red Streak"
              value={String(MOCK_CUMULATIVE.longestRedStreak)}
              sub="Days"
              icon={TrendingDown}
              valueColor="#ef4444"
              iconColor="#ef4444"
              iconBg="rgba(239,68,68,0.12)"
            />
          </div>
        </Section>
      </div>

      {/* bottom spacing */}
      <div className="h-2" />
    </div>}
    </div>
    </div>
  );
}
