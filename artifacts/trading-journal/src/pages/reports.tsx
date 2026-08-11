import {
  useGetStatsSummary,
  useGetSymbolBreakdown,
  useGetEquityCurve,
  useGetWeeklyPnl,
} from "@workspace/api-client-react";
import { useCurrencyFormatter, useCurrencyAxisFormatter } from "@/store/currencyStore";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, Legend, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target, Percent, Zap, Award,
  BarChart2, Activity, Layers, Flame, ArrowUpRight, ArrowDownRight,
  Shield, Clock,
} from "lucide-react";
import { memo, useMemo } from "react";
import { toArray } from "@/lib/safeArray";
import { n } from "@/lib/safeNumber";
import { PROVIDER_MAP } from "@/data/sampleData";
import { PageTransition, AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/animations";
import DashboardSegmentedControl from "@/components/DashboardSegmentedControl";

const GREEN  = "hsl(145 58% 52%)";
const RED    = "hsl(0 68% 58%)";
const PURPLE = "hsl(161 72% 42%)";
const BLUE   = "hsl(210 80% 62%)";
const ORANGE = "hsl(32 85% 58%)";
const MUTED  = "hsl(128 8% 38%)";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid rgba(57, 91, 67, 0.3)",
  borderRadius: "12px",
  boxShadow: "0 12px 40px rgba(7, 17, 13, 0.65)",
  fontSize: "12px",
  padding: "8px 12px",
};

// ── Provider badge ────────────────────────────────────────────────────────────
const ProviderBadge = memo(function ProviderBadge({ symbol }: { symbol: string }) {
  const provider = PROVIDER_MAP[symbol];
  if (!provider) return null;
  return provider === "Delta Exchange" ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/15 text-primary border border-primary/20">
      Δ Delta
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">
      ⊕ cTrader
    </span>
  );
});

// ── Metric Card ───────────────────────────────────────────────────────────────
// `loading` keeps the card shell (label + icon) visible and swaps ONLY the
// value/sub/bar region for a shimmer placeholder — the card itself, and the
// grid it sits in, never disappears while the underlying stat is pending.
const MetricCard = memo(function MetricCard({
  label, value, sub, icon: Icon, color = "text-white", iconBg, iconColor, bar, index = 0, loading = false,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  color?: string; iconBg?: string; iconColor?: string; bar?: number; index?: number; loading?: boolean;
}) {
  return (
    <AnimatedCard index={index} className="stat-card-neutral p-5 h-full relative overflow-hidden transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--stat-title)" }}>{label}</p>
        <div className={`stat-icon-neutral p-1.5 rounded-lg ${iconBg ?? ""}`}>
          <Icon className={`w-3.5 h-3.5 ${iconColor ?? ""}`} style={iconColor ? undefined : { color: "var(--stat-icon)" }} />
        </div>
      </div>
      {loading ? (
        <div className="h-7 w-20 rounded-md shimmer-loading mb-2" />
      ) : (
        <div className={`text-2xl font-black tracking-tight mb-1 ${color}`}>{value}</div>
      )}
      {!loading && bar !== undefined && (
        <div className="my-2 h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(bar, 100)}%`,
              background: bar >= 60
                ? "linear-gradient(90deg, #22C55E99, #22C55E)"
                : bar >= 50
                ? "linear-gradient(90deg, #F59E0B99, #F59E0B)"
                : "linear-gradient(90deg, #EF444499, #EF4444)",
            }}
          />
        </div>
      )}
      {loading ? (
        <div className="h-3 w-24 rounded shimmer-loading" />
      ) : (
        sub && <p className="text-[11px]" style={{ color: "var(--stat-sub)" }}>{sub}</p>
      )}
    </AnimatedCard>
  );
});

// ── Chart placeholder ─────────────────────────────────────────────────────────
// Fills the same footprint as the chart it stands in for, so swapping the
// real chart in never shifts layout.
function ChartSkeleton({ height = 190 }: { height?: number }) {
  return <div className="rounded-xl shimmer-loading" style={{ height }} />;
}

// ── RR Histogram ──────────────────────────────────────────────────────────────
const RRHistogram = memo(function RRHistogram({ symbolStats }: { symbolStats: Array<{ symbol: string; winRate: number; trades: number; pnl: number }> }) {
  const bins = useMemo(() => {
    const b = [
      { label: "0–1R",  count: 0, color: RED },
      { label: "1–2R",  count: 0, color: ORANGE },
      { label: "2–3R",  count: 0, color: PURPLE },
      { label: "3–4R",  count: 0, color: GREEN },
      { label: "4R+",   count: 0, color: BLUE },
    ];
    symbolStats.forEach(s => {
      const rr = s.winRate / 25;
      if (rr < 1) b[0].count += s.trades;
      else if (rr < 2) b[1].count += s.trades;
      else if (rr < 3) b[2].count += s.trades;
      else if (rr < 4) b[3].count += s.trades;
      else b[4].count += s.trades;
    });
    return b;
  }, [symbolStats]);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={bins} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="count" radius={[4, 4, 2, 2]} maxBarSize={32}>
          {bins.map((b, i) => <Cell key={i} fill={b.color} fillOpacity={0.85} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

// ── Radar Chart ───────────────────────────────────────────────────────────────
const PerformanceRadar = memo(function PerformanceRadar({ stats }: { stats: NonNullable<ReturnType<typeof useGetStatsSummary>["data"]> }) {
  const data = useMemo(() => [
    { metric: "Win Rate",      score: Math.min(n(stats.winRate), 100) },
    { metric: "Profit Factor", score: Math.min(n(stats.profitFactor) * 20, 100) },
    { metric: "Avg RR",        score: Math.min(n(stats.averageRR) * 25, 100) },
    { metric: "Consistency",   score: Math.min((n(stats.winCount) / Math.max(n(stats.totalTrades), 1)) * 110, 100) },
    { metric: "Risk Mgmt",     score: n(stats.averageLoss) > 0 ? Math.min(100 - (n(stats.averageLoss) / Math.max(n(stats.averageWin), 1)) * 50, 100) : 70 },
    { metric: "Volume",        score: Math.min(n(stats.totalTrades) * 2.5, 100) },
  ], [stats]);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data}>
        <PolarGrid stroke="rgba(255,255,255,0.06)" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: "hsl(220 10% 50%)", fontSize: 10 }} />
        <Radar name="Score" dataKey="score" stroke={PURPLE} fill={PURPLE} fillOpacity={0.18} strokeWidth={2} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} formatter={(v: number) => [`${v.toFixed(0)}%`, "Score"]} />
      </RadarChart>
    </ResponsiveContainer>
  );
});

// ── Equity Tooltip ────────────────────────────────────────────────────────────
function EqTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  const fc = useCurrencyFormatter();
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle} className="border border-white/[0.08]">
      <p className="text-muted-foreground text-[10px] mb-1">{label ? new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</p>
      <p className="font-bold text-sm text-white">{fc(payload[0].value)}</p>
    </div>
  );
}

// ── Weekly PNL Tooltip ────────────────────────────────────────────────────────
function WkTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  const fc = useCurrencyFormatter();
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div style={tooltipStyle} className="border border-white/[0.08]">
      <p className="text-muted-foreground text-[10px] mb-1">Wk of {label}</p>
      <p className={`font-bold text-sm ${v >= 0 ? "text-emerald-400" : "text-red-400"}`}>{v >= 0 ? "+" : ""}{fc(v)}</p>
    </div>
  );
}

// ── Response normalization ────────────────────────────────────────────────────
// The generated API hooks type their `data` as an array (SymbolStat[],
// WeeklyPnlPoint[], EquityCurvePoint[]) but that's a compile-time assertion
// only — nothing at runtime guarantees the server actually sent an array.
// A non-2xx-but-still-`res.json()`'d error envelope (`{ error: "..." }`),
// a `null` body, or a shape change upstream all land here as a truthy
// non-array value, which used to sail through `!!symbolStats` checks and
// then blow up on the first `.forEach`/`.map` inside a `useMemo`.
//
// Normalizing once here — at the point each query's data enters the Reports
// feature — means every consumer below can keep assuming "array", full stop,
// instead of re-deriving that guarantee (or forgetting to) at each call site.
// ── Session Data (simulated) ──────────────────────────────────────────────────
const SESSIONS = [
  { session: "Asia",   trades: 6,  winRate: 66.7, pnl: 1240 },
  { session: "London", trades: 14, winRate: 85.7, pnl: 6850 },
  { session: "NY AM",  trades: 12, winRate: 83.3, pnl: 5420 },
  { session: "NY PM",  trades: 6,  winRate: 66.7, pnl: 1655 },
];

export default function Reports() {
  // Every hook below resolves from the shared react-query cache instantly on
  // repeat visits (staleTime keeps stats/equity/weekly warm from Dashboard,
  // and symbol-breakdown is prefetched in the background — see App.tsx's
  // preload effect). On a genuinely cold cache these simply stay `undefined`
  // for a beat; nothing here blocks the page shell from rendering.
  const { data: statsRaw }       = useGetStatsSummary();
  const { data: symbolStatsRaw } = useGetSymbolBreakdown();
  const { data: equityRaw }      = useGetEquityCurve();
  const { data: weeklyPnlRaw }   = useGetWeeklyPnl();

  // Normalize once, at the boundary, before any derived state below ever
  // sees these values. `stats` is a single object (or undefined) so it's
  // left as-is; the three list endpoints are coerced to arrays.
  const stats       = statsRaw;
  const symbolStats = useMemo(() => toArray(symbolStatsRaw, "reports.symbolStats"), [symbolStatsRaw]);
  const equity       = useMemo(() => toArray(equityRaw, "reports.equity"), [equityRaw]);
  const weeklyPnl    = useMemo(() => toArray(weeklyPnlRaw, "reports.weeklyPnl"), [weeklyPnlRaw]);

  const hasStats  = !!stats;
  const hasSymbol = symbolStats.length > 0;
  // Distinct from "array has items": this only tracks whether the query has
  // resolved at all, so the chart-vs-skeleton switch below still flips the
  // instant data arrives, even if that data normalizes to an empty array.
  const hasEquity = equityRaw !== undefined;
  const hasWeeklyPnl = weeklyPnlRaw !== undefined;

  const weeklyLabels = useMemo(() =>
    weeklyPnl.map(w => ({
      ...w,
      label: new Date(w.week).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    })),
  [weeklyPnl]);

  const winLossData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Wins",     value: stats.winCount,       color: GREEN },
      { name: "Losses",   value: stats.lossCount,      color: RED },
      { name: "Breakeven",value: stats.breakevenCount, color: MUTED },
    ].filter(d => d.value > 0);
  }, [stats]);

  // Broker performance from symbol stats
  const brokerPerf = useMemo(() => {
    if (symbolStats.length === 0) return [];
    const map: Record<string, { pnl: number; trades: number; wins: number }> = {
      "Delta Exchange": { pnl: 0, trades: 0, wins: 0 },
      "FusionMarkets":  { pnl: 0, trades: 0, wins: 0 },
    };
    symbolStats.forEach(s => {
      const provider = PROVIDER_MAP[s.symbol];
      const key = provider === "Delta Exchange" ? "Delta Exchange" : "FusionMarkets";
      if (map[key]) {
        map[key].pnl    += s.pnl;
        map[key].trades += s.trades;
        map[key].wins   += Math.round(s.trades * s.winRate / 100);
      }
    });
    return Object.entries(map)
      .filter(([, v]) => v.trades > 0)
      .map(([name, v]) => ({
        name,
        pnl: Math.round(v.pnl * 100) / 100,
        trades: v.trades,
        winRate: v.trades > 0 ? Math.round((v.wins / v.trades) * 100) : 0,
      }));
  }, [symbolStats]);

  // Derived scalar stats — expensive-ish (sorts + arithmetic over the full
  // symbol list) so they're memoized and only recomputed when their inputs
  // actually change, not on every render (e.g. currency-formatter re-renders).
  const derived = useMemo(() => {
    if (!stats) {
      return { expectancy: 0, kellyCrit: 0, topSymbol: undefined, worstSymbol: undefined };
    }
    const expectancy = stats.winRate / 100 * stats.averageWin - (1 - stats.winRate / 100) * stats.averageLoss;
    const kellyCrit  = stats.averageLoss > 0
      ? ((stats.winRate / 100) - (1 - stats.winRate / 100) / (stats.averageWin / stats.averageLoss)) * 100
      : 0;
    const topSymbol   = symbolStats.length > 0 ? [...symbolStats].sort((a, b) => b.pnl - a.pnl)[0] : undefined;
    const worstSymbol = symbolStats.length > 0 ? [...symbolStats].sort((a, b) => a.pnl - b.pnl)[0] : undefined;
    return { expectancy, kellyCrit, topSymbol, worstSymbol };
  }, [stats, symbolStats]);

  const fc            = useCurrencyFormatter();
  const axisFormatter = useCurrencyAxisFormatter();

  // ── Page shell renders unconditionally ──────────────────────────────────
  // Previously this component returned an entirely different tree (a bare
  // skeleton grid, no header, no segmented control) while `stats`/
  // `symbolStats` were pending — that swap-in-place of the WHOLE page is
  // exactly what looked like a blank/invisible flash on first open. Now the
  // header, segmented control, and every card shell mount immediately; only
  // the value/chart regions that genuinely depend on network data fall back
  // to a shimmer placeholder sized to match the eventual content, so nothing
  // shifts layout when the real data arrives.
  return (
    <PageTransition className="space-y-5 pb-12" fill={false}>

      {/* ── Segmented control — Dashboard / Reports ──
          Same shared control as the Dashboard page, so it's visible no
          matter which of the two pages the user lands on; its selection
          reflects the current route automatically. */}
      <DashboardSegmentedControl />

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Performance Reports</h1>
          <p className="text-sm text-muted-foreground/60 mt-0.5">Deep-dive analytics across all brokers and asset classes</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-white/[0.04] rounded-lg px-3 py-1.5 border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live data · {hasStats ? stats.totalTrades : "…"} trades
          </span>
        </div>
      </div>

      {/* ── Top-level stat cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          index={0} loading={!hasStats}
          label="Net PNL" value={hasStats ? fc(stats.netPnl) : ""}
          sub="All-time realized" icon={hasStats && stats.netPnl < 0 ? TrendingDown : TrendingUp}
          color={hasStats && stats.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}
          iconBg={hasStats && stats.netPnl >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}
          iconColor={hasStats && stats.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <MetricCard
          index={1} loading={!hasStats}
          label="Win Rate" value={hasStats ? `${n(stats.winRate).toFixed(1)}%` : ""}
          sub={hasStats ? `${stats.winCount}W · ${stats.lossCount}L · ${stats.breakevenCount}BE` : ""}
          icon={Percent} bar={hasStats ? stats.winRate : undefined}
          color={hasStats && stats.winRate >= 60 ? "text-emerald-400" : hasStats && stats.winRate >= 50 ? "text-white" : "text-red-400"}
        />
        <MetricCard
          index={2} loading={!hasStats}
          label="Profit Factor" value={hasStats ? n(stats.profitFactor).toFixed(2) : ""}
          sub="Gross wins / gross losses" icon={Shield}
          color={hasStats && stats.profitFactor >= 2 ? "text-emerald-400" : hasStats && stats.profitFactor >= 1 ? "text-white" : "text-red-400"}
          iconBg="bg-emerald-500/10" iconColor="text-emerald-400"
        />
        <MetricCard
          index={3} loading={!hasStats}
          label="Avg RR" value={hasStats ? `${n(stats.averageRR).toFixed(2)}R` : ""}
          sub="Reward / risk ratio" icon={Target}
          color={hasStats && stats.averageRR >= 2 ? "text-emerald-400" : "text-white"}
        />
        <MetricCard
          index={4} loading={!hasStats}
          label="Avg Win" value={hasStats ? fc(stats.averageWin) : ""}
          sub="Per winning trade" icon={ArrowUpRight}
          color="text-emerald-400" iconBg="bg-emerald-500/10" iconColor="text-emerald-400"
        />
        <MetricCard
          index={5} loading={!hasStats}
          label="Avg Loss" value={hasStats ? fc(stats.averageLoss) : ""}
          sub="Per losing trade" icon={ArrowDownRight}
          color="text-red-400" iconBg="bg-red-500/10" iconColor="text-red-400"
        />
        <MetricCard
          index={6} loading={!hasStats}
          label="Expectancy" value={hasStats ? fc(derived.expectancy) : ""}
          sub="Per trade expected" icon={Zap}
          color={derived.expectancy >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <MetricCard
          index={7} loading={!hasStats}
          label="Kelly %" value={hasStats ? `${n(derived.kellyCrit).toFixed(1)}%` : ""}
          sub="Optimal position size" icon={Award}
          color="text-white"
        />
      </div>

      {/* ── Equity Curve + Win/Loss donut ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AnimatedCard index={8} className="glass-card">
            <div className="p-5 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-[13px] font-semibold text-white">Equity Curve</span>
              </div>
              {equity.length > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  equity[equity.length - 1].equity >= equity[0].equity
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-red-500/15 text-red-400"
                }`}>
                  {fc(equity[equity.length - 1].equity)}
                </span>
              )}
            </div>
            <div className="h-[220px] px-1 pb-3">
              {hasEquity ? (
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={equity} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={PURPLE} stopOpacity={0.28} />
                        <stop offset="60%"  stopColor={PURPLE} stopOpacity={0.04} />
                        <stop offset="100%" stopColor={PURPLE} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="transparent" tick={{ fill: "hsl(128 8% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={v => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                    <YAxis stroke="transparent" tick={{ fill: "hsl(128 8% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={axisFormatter} />
                    <Tooltip content={<EqTooltip />} />
                    <Area type="monotone" dataKey="equity" stroke={PURPLE} strokeWidth={2.5} fill="url(#eqGrad)" dot={false}
                      activeDot={{ r: 5, fill: PURPLE, stroke: "hsl(var(--background))", strokeWidth: 2.5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <ChartSkeleton />}
            </div>
          </AnimatedCard>
        </div>

        <div>
          <AnimatedCard index={9} className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Flame className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Win / Loss Split</span>
            </div>
            <div className="h-[170px]">
              {hasStats ? (
                <ResponsiveContainer width="100%" height={165}>
                  <PieChart>
                    <Pie data={winLossData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={4} dataKey="value" strokeWidth={0}>
                      {winLossData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} formatter={(v: number, n: string) => [`${v} trades`, n]} />
                    <Legend iconType="circle" iconSize={7} formatter={v => <span style={{ fontSize: 10, color: "hsl(220 10% 55%)" }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <ChartSkeleton height={165} />}
            </div>
            <div className="flex justify-around text-center mx-5 mb-5 border-t border-white/[0.06] pt-3">
              <div>
                <p className="text-base font-bold text-emerald-400">{hasStats ? stats.winCount : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Wins</p>
              </div>
              <div className="w-px bg-white/[0.06]" />
              <div>
                <p className="text-base font-bold text-red-400">{hasStats ? stats.lossCount : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Losses</p>
              </div>
              <div className="w-px bg-white/[0.06]" />
              <div>
                <p className="text-base font-bold text-white">{hasStats ? (stats.largestWin > 0 ? fc(stats.largestWin) : "—") : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Best</p>
              </div>
            </div>
          </AnimatedCard>
        </div>
      </div>

      {/* ── Weekly PNL + Symbol Bars ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <AnimatedCard index={10} className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Weekly PNL</span>
            </div>
            <div className="h-[220px] px-1 pb-3">
              {hasWeeklyPnl ? (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={weeklyLabels} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={axisFormatter} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                    <Tooltip content={<WkTooltip />} cursor={{ fill: "rgba(255,255,255,0.025)" }} />
                    <Bar dataKey="pnl" radius={[5, 5, 2, 2]} maxBarSize={28}>
                      {weeklyLabels.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? GREEN : RED} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <ChartSkeleton />}
            </div>
          </AnimatedCard>
        </div>

        <div>
          <AnimatedCard index={11} className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Symbol PNL</span>
            </div>
            <div className="h-[220px] px-1 pb-3">
              {hasSymbol ? (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={symbolStats} layout="vertical" margin={{ top: 4, right: 16, left: 32, bottom: 4 }}>
                    <XAxis type="number" stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={axisFormatter} />
                    <YAxis type="category" dataKey="symbol" stroke="transparent" tick={{ fill: "hsl(220 10% 55%)", fontSize: 10 }} tickLine={false} axisLine={false} width={52} />
                    <ReferenceLine x={0} stroke="rgba(255,255,255,0.08)" />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      formatter={(v: number) => [fc(v), "PNL"]} />
                    <Bar dataKey="pnl" radius={[0, 4, 4, 0]} maxBarSize={14}>
                      {symbolStats.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? GREEN : RED} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <ChartSkeleton />}
            </div>
          </AnimatedCard>
        </div>
      </div>

      {/* ── Performance Radar + RR Dist + Broker Breakdown ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <AnimatedCard index={12} className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Performance Score</span>
            </div>
            <div className="h-[220px]">
              {hasStats ? <PerformanceRadar stats={stats} /> : <ChartSkeleton height={200} />}
            </div>
          </AnimatedCard>
        </div>

        <div>
          <AnimatedCard index={13} className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Target className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">RR Distribution</span>
            </div>
            <div className="h-[220px] px-1 pb-3">
              {hasSymbol ? <RRHistogram symbolStats={symbolStats} /> : <ChartSkeleton />}
            </div>
          </AnimatedCard>
        </div>

        <div>
          <AnimatedCard index={14} className="glass-card">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Broker PNL</span>
            </div>
            <div className="h-[220px] px-1 pb-3">
              {hasSymbol ? (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={brokerPerf} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 9 }} tickLine={false} axisLine={false}
                      tickFormatter={v => v === "Delta Exchange" ? "Delta" : v === "FusionMarkets" ? "Fusion" : v} />
                    <YAxis stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={axisFormatter} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.025)" }}
                      formatter={(v: number, n: string) => [n === "pnl" ? fc(v) : v, n === "pnl" ? "PNL" : n]} />
                    <Bar dataKey="pnl" radius={[5, 5, 2, 2]} maxBarSize={36}>
                      {brokerPerf.map((e, i) => (
                        <Cell key={i} fill={i === 0 ? PURPLE : i === 1 ? BLUE : ORANGE} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <ChartSkeleton />}
            </div>
          </AnimatedCard>
        </div>
      </div>

      {/* ── Trading Session Analysis ─────────────────────────────────────────── */}
      <AnimatedCard index={15}>
        <div className="glass-card">
          <div className="p-5 pb-3 flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[13px] font-semibold text-white">Trading Session Analysis</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-white/[0.04]">
            {SESSIONS.map(s => (
              <div key={s.session} className="px-5 pb-5">
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">{s.session}</p>
                <p className={`text-lg font-bold mb-0.5 ${s.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fc(s.pnl)}</p>
                <p className="text-[11px] text-white/60">{n(s.winRate).toFixed(0)}% win · {n(s.trades)} trades</p>
                <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary/50 to-primary transition-all duration-700"
                    style={{ width: `${n(s.winRate)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimatedCard>

      {/* ── Symbol Details Table ─────────────────────────────────────────────── */}
      <AnimatedCard index={16}>
        <div className="glass-card">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Symbol Details</span>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              {derived.topSymbol && (
                <span className="flex items-center gap-1.5 text-foreground/50">
                  <TrendingUp className="w-3 h-3" /> Best: {derived.topSymbol.symbol}
                </span>
              )}
              {derived.worstSymbol && derived.worstSymbol.pnl < 0 && (
                <span className="flex items-center gap-1.5 text-red-400/80">
                  <TrendingDown className="w-3 h-3" /> Worst: {derived.worstSymbol.symbol}
                </span>
              )}
            </div>
          </div>
          {hasSymbol ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-white/[0.05] bg-white/[0.015]">
                    {["Symbol", "Provider", "Trades", "Win Rate", "Net PNL", "Avg PNL/Trade"].map(h => (
                      <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest ${["Trades","Win Rate","Net PNL","Avg PNL/Trade"].includes(h) ? "text-right" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {symbolStats.map((s, idx) => {
                    const trades  = n(s.trades);
                    const pnl     = n(s.pnl);
                    const winRate = n(s.winRate);
                    const avgPnl  = trades > 0 ? pnl / trades : 0;
                    return (
                      <AnimatedListItem key={s.symbol} as="tr" index={idx} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
                        <td className="px-4 py-3 font-bold text-white text-xs">{s.symbol}</td>
                        <td className="px-4 py-3"><ProviderBadge symbol={s.symbol} /></td>
                        <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground">{trades}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-12 h-1 rounded-full bg-white/[0.06] overflow-hidden hidden sm:block">
                              <div className="h-full rounded-full bg-emerald-400/60" style={{ width: `${winRate}%` }} />
                            </div>
                            <span className={`font-mono text-[11px] font-semibold ${winRate >= 60 ? "text-emerald-400" : winRate >= 50 ? "text-white" : "text-red-400"}`}>
                              {winRate.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-xs font-bold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {fc(pnl)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-[11px] ${avgPnl >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                          {fc(avgPnl)}
                        </td>
                      </AnimatedListItem>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 pb-5 space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-9 rounded-lg shimmer-loading" />)}
            </div>
          )}
        </div>
      </AnimatedCard>

      {/* ── Best/Worst + Advanced Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(hasStats ? [
          { label: "Largest Win",  value: fc(stats.largestWin),  color: "text-emerald-400" as string | undefined, icon: ArrowUpRight,   iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400", sub: undefined as string | undefined },
          { label: "Largest Loss", value: fc(stats.largestLoss), color: "text-red-400" as string | undefined,     icon: ArrowDownRight, iconBg: "bg-red-500/10",     iconColor: "text-red-400", sub: undefined as string | undefined },
          { label: "Current Streak", value: `${Math.abs(stats.currentStreak)}${stats.currentStreak >= 0 ? "W" : "L"}`,
            color: (stats.currentStreak >= 0 ? "text-emerald-400" : "text-red-400") as string | undefined, icon: Zap, iconBg: undefined as string | undefined, iconColor: undefined as string | undefined,
            sub: (stats.currentStreak >= 0 ? "Winning streak" : "Losing streak") as string | undefined },
          { label: "Total Volume", value: `${stats.totalTrades}`, color: "text-white" as string | undefined, icon: Layers, iconBg: undefined as string | undefined, iconColor: undefined as string | undefined, sub: `${stats.winCount + stats.lossCount} decisive` as string | undefined },
        ] : [
          { label: "Largest Win",    value: "", color: undefined as string | undefined, icon: ArrowUpRight,   iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400", sub: undefined as string | undefined },
          { label: "Largest Loss",   value: "", color: undefined as string | undefined, icon: ArrowDownRight, iconBg: "bg-red-500/10",     iconColor: "text-red-400", sub: undefined as string | undefined },
          { label: "Current Streak", value: "", color: undefined as string | undefined, icon: Zap, iconBg: undefined as string | undefined, iconColor: undefined as string | undefined, sub: undefined as string | undefined },
          { label: "Total Volume",   value: "", color: undefined as string | undefined, icon: Layers, iconBg: undefined as string | undefined, iconColor: undefined as string | undefined, sub: undefined as string | undefined },
        ]).map((c, i) => (
          <MetricCard key={c.label} index={17 + i} loading={!hasStats} label={c.label} value={c.value} sub={c.sub}
            icon={c.icon} color={c.color} iconBg={c.iconBg} iconColor={c.iconColor} />
        ))}
      </div>

    </PageTransition>
  );
}
