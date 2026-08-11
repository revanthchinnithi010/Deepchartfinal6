import { useState, useEffect, useCallback, useRef } from "react";
import { useAlertStore } from "@/store/alertStore";
import {
  TrendingUp, ArrowRight, Minus, Square, Columns2,
  Plus, MoreHorizontal, RotateCcw, Trash2, PauseCircle,
  PlayCircle, Pencil, AlertCircle, CheckCircle2, Clock,
  Copy, History, Activity, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toArray } from "@/lib/safeArray";
import { DrawingAlertModal, type DrawingAlertRow } from "./DrawingAlertModal";
import { fmtPrice, useLiveMarketContext } from "@/contexts/LiveMarketContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const DRAWING_ICONS: Record<string, React.ElementType> = {
  trendline:       TrendingUp,
  ray:             ArrowRight,
  horizontal_line: Minus,
  rectangle:       Square,
  channel:         Columns2,
};

const DRAWING_LABELS: Record<string, string> = {
  trendline:       "Trendline",
  ray:             "Ray",
  horizontal_line: "H. Line",
  rectangle:       "Zone",
  channel:         "Channel",
};

const DRAWING_COLORS: Record<string, string> = {
  trendline:       "#B7FF5A",
  ray:             "#38bdf8",
  horizontal_line: "#fb923c",
  rectangle:       "#a78bfa",
  channel:         "#34d399",
};

const CONDITION_LABELS: Record<string, string> = {
  cross_above: "Cross Above",
  cross_below: "Cross Below",
  touch:       "Touch",
  breakout:    "Breakout",
  above_price: "Above Price",
  below_price: "Below Price",
  touch_price: "Touch Price",
  enter_zone:  "Enter Zone",
  exit_zone:   "Exit Zone",
  rejection:   "Rejection",
  retest:      "Retest",
  break:       "Break",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcProjected(row: DrawingAlertRow, nowMs: number): number | null {
  if (row.drawingType === "horizontal_line") return row.point1Price;
  const t1 = new Date(row.point1Time).getTime();
  const t2 = new Date(row.point2Time).getTime();
  if (t2 === t1) return null;
  const slope = (row.point2Price - row.point1Price) / (t2 - t1);
  return row.point1Price + slope * (nowMs - t1);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, isTriggered }: { status: string; isTriggered: boolean }) {
  if (isTriggered || status === "triggered") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold"
        style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
        <CheckCircle2 className="w-2.5 h-2.5" /> Triggered
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold"
        style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
        <Clock className="w-2.5 h-2.5" /> Paused
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold"
        style={{ background: "rgba(107,114,128,0.2)", color: "#9ca3af" }}>
        <AlertCircle className="w-2.5 h-2.5" /> Expired
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold"
      style={{ background: "rgba(183,255,90,0.12)", color: "#B7FF5A" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-[#B7FF5A] animate-pulse" />
      Active
    </span>
  );
}

function RowMenu({
  row,
  onEdit,
  onDelete,
  onTogglePause,
  onReset,
  onClone,
}: {
  row: DrawingAlertRow;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePause: () => void;
  onReset: () => void;
  onClone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isPaused    = row.alertStatus === "paused";
  const isTriggered = row.isTriggered || row.alertStatus === "triggered";

  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-white/[0.08]"
        style={{ color: "rgba(167,184,169,0.5)" }}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-7 z-50 w-40 rounded-xl overflow-hidden shadow-2xl"
            style={{ background: "#0D1C16", border: "1px solid rgba(57,91,67,0.45)", backdropFilter: "blur(8px)" }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] hover:bg-white/[0.05] text-left transition-colors"
              style={{ color: "rgba(167,184,169,0.9)" }}
            >
              <Pencil className="w-3 h-3" /> Edit Alert
            </button>
            <button
              onClick={() => { setOpen(false); onClone(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] hover:bg-white/[0.05] text-left transition-colors"
              style={{ color: "rgba(167,184,169,0.9)" }}
            >
              <Copy className="w-3 h-3" /> Clone
            </button>
            {isTriggered ? (
              <button
                onClick={() => { setOpen(false); onReset(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] hover:bg-white/[0.05] text-left transition-colors"
                style={{ color: "rgba(167,184,169,0.9)" }}
              >
                <RotateCcw className="w-3 h-3" /> Reset Alert
              </button>
            ) : (
              <button
                onClick={() => { setOpen(false); onTogglePause(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] hover:bg-white/[0.05] text-left transition-colors"
                style={{ color: "rgba(167,184,169,0.9)" }}
              >
                {isPaused ? <PlayCircle className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
                {isPaused ? "Resume" : "Pause"}
              </button>
            )}
            <div style={{ height: 1, background: "rgba(57,91,67,0.22)" }} />
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] hover:bg-red-500/10 text-left transition-colors"
              style={{ color: "rgba(248,113,113,0.8)" }}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Alert History ─────────────────────────────────────────────────────────────

interface AlertHistoryRow {
  id: number;
  sourceId: number | null;
  sourceType: string;
  symbol: string;
  timeframe: string | null;
  drawingType: string | null;
  condition: string;
  priceAtTrigger: number;
  projectedPrice: number | null;
  message: string | null;
  createdAt: string;
}

function HistoryPanel({ symbol, allSymbols, refreshKey }: { symbol: string; allSymbols: boolean; refreshKey: number }) {
  const [rows,    setRows]    = useState<AlertHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = allSymbols
        ? "/api/alert-history"
        : `/api/alert-history?symbol=${symbol}`;
      const res = await fetch(url);
      if (res.ok) setRows(toArray<AlertHistoryRow>(await res.json(), "DrawingAlertsList.HistoryPanel.rows"));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [symbol, allSymbols]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <History className="w-6 h-6" style={{ color: "rgba(167,184,169,0.2)" }} />
        <p className="text-[11px]" style={{ color: "rgba(167,184,169,0.4)" }}>
          No alert history yet
        </p>
        <p className="text-[9.5px]" style={{ color: "rgba(167,184,169,0.25)" }}>
          Alerts will appear here after they fire
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      {rows.map(row => {
        const Icon  = DRAWING_ICONS[row.drawingType ?? ""] ?? AlertCircle;
        const color = DRAWING_COLORS[row.drawingType ?? ""] ?? "#A7B8A9";
        const condLabel = CONDITION_LABELS[row.condition] ?? row.condition;
        return (
          <div
            key={row.id}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
            style={{ borderBottom: "1px solid rgba(57,91,67,0.08)" }}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${color}14`, border: `1px solid ${color}30` }}>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] font-bold" style={{ color: "#F3FFF3" }}>
                  {row.symbol}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                  {condLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px]" style={{ color: "rgba(167,184,169,0.5)" }}>
                  {DRAWING_LABELS[row.drawingType ?? ""] ?? row.drawingType ?? row.sourceType}
                </span>
                {row.timeframe && (
                  <span className="text-[9px]" style={{ color: "rgba(167,184,169,0.35)" }}>
                    · {row.timeframe}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10.5px] font-mono font-bold" style={{ color: "#F3FFF3" }}>
                {fmtPrice(row.priceAtTrigger, row.symbol)}
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: "rgba(167,184,169,0.4)" }}>
                {timeAgo(row.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type DrawingsTab = "active" | "triggered" | "history";

interface Props {
  symbol: string;
  currentInterval: string;
  currentPrice: number | null;
}

export function DrawingAlertsList({ symbol, currentInterval, currentPrice }: Props) {
  const { alertEvents } = useLiveMarketContext();
  const prevAlertCountRef = useRef(0);

  const [rows,       setRows]       = useState<DrawingAlertRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editItem,   setEditItem]   = useState<DrawingAlertRow | null>(null);
  const [projNow,    setProjNow]    = useState(Date.now());
  const [subTab,     setSubTab]     = useState<DrawingsTab>("active");
  const [allSymbols, setAllSymbols] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trendlines");
      if (res.ok) {
        const data = toArray<DrawingAlertRow>(await res.json(), "DrawingAlertsList.main.rows");
        setRows(data);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh list when a new alert fires via WebSocket
  useEffect(() => {
    if (alertEvents.length > prevAlertCountRef.current) {
      prevAlertCountRef.current = alertEvents.length;
      void load();
      setHistoryRefreshKey(k => k + 1);
      // Switch to Triggered tab so user sees the fired alert immediately
      setSubTab("triggered");
    }
  }, [alertEvents, load]);

  useEffect(() => {
    const id = setInterval(() => setProjNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/trendlines/${id}`, { method: "DELETE" });
    if (!res.ok) return;

    setRows(prev => prev.filter(r => r.id !== id));

    // The DB row is already deleted above; only remove it from the global UI
    // store here so Charts/bell/Alerts stay in sync without a second DELETE.
    const current = useAlertStore.getState().alerts;
    useAlertStore.getState().setAlerts(current.filter(a => a.id !== `t_${id}` && a.id !== `tl-${id}`));
  };

  const handleTogglePause = async (row: DrawingAlertRow) => {
    const newStatus = row.alertStatus === "paused" ? "active" : "paused";
    const res = await fetch(`/api/trendlines/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertStatus: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json() as DrawingAlertRow;
      setRows(prev => prev.map(r => r.id === row.id ? updated : r));
    }
  };

  const handleReset = async (row: DrawingAlertRow) => {
    const res = await fetch(`/api/trendlines/${row.id}/reset`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json() as DrawingAlertRow;
      setRows(prev => prev.map(r => r.id === row.id ? updated : r));
    }
  };

  const handleClone = async (row: DrawingAlertRow) => {
    const res = await fetch(`/api/trendlines/${row.id}/clone`, { method: "POST" });
    if (res.ok) { await load(); }
  };

  const baseRows = allSymbols ? rows : rows.filter(r => r.symbol === symbol);

  const activeRows    = baseRows.filter(r => r.isActive && !r.isTriggered && r.alertStatus !== "paused");
  const pausedRows    = baseRows.filter(r => r.alertStatus === "paused" && !r.isTriggered);
  const triggeredRows = baseRows.filter(r => r.isTriggered || r.alertStatus === "triggered");

  const displayRows = subTab === "active"
    ? [...activeRows, ...pausedRows]
    : triggeredRows;

  const activeCount    = activeRows.length;
  const triggeredCount = triggeredRows.length;

  return (
    <div className="flex flex-col h-full" style={{ background: "#07110D" }}>

      {/* ── Sub-header ── */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid rgba(57,91,67,0.15)" }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-0">
          {([
            ["active",    "Active",    activeCount],
            ["triggered", "Triggered", triggeredCount],
            ["history",   "History",   null],
          ] as [DrawingsTab, string, number | null][]).map(([val, label, count]) => (
            <button
              key={val}
              onClick={() => setSubTab(val)}
              className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-[10.5px] font-semibold mr-1 transition-all"
              style={{
                background: subTab === val ? "rgba(183,255,90,0.1)" : "transparent",
                color:      subTab === val ? "#B7FF5A" : "rgba(167,184,169,0.5)",
                border:     `1px solid ${subTab === val ? "rgba(183,255,90,0.25)" : "transparent"}`,
              }}
            >
              {val === "active"    && <Activity className="w-2.5 h-2.5" />}
              {val === "triggered" && <CheckCircle2 className="w-2.5 h-2.5" />}
              {val === "history"   && <History className="w-2.5 h-2.5" />}
              {label}
              {count !== null && count > 0 && (
                <span className="px-1 rounded text-[8px] font-bold"
                  style={{
                    background: val === "triggered" ? "rgba(239,68,68,0.2)" : "rgba(183,255,90,0.15)",
                    color:      val === "triggered" ? "#f87171" : "#B7FF5A",
                  }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* All symbols toggle */}
          <button
            onClick={() => setAllSymbols(v => !v)}
            title={allSymbols ? "Current symbol only" : "All symbols"}
            className="flex items-center gap-1 px-2 h-6 rounded-lg text-[9.5px] font-bold transition-all"
            style={{
              background: allSymbols ? "rgba(56,189,248,0.12)" : "rgba(57,91,67,0.1)",
              border:     `1px solid ${allSymbols ? "rgba(56,189,248,0.3)" : "rgba(57,91,67,0.25)"}`,
              color:      allSymbols ? "#38bdf8" : "rgba(167,184,169,0.55)",
            }}
          >
            <Globe className="w-2.5 h-2.5" />
            {allSymbols ? "All" : symbol}
          </button>

          <button
            onClick={() => { setEditItem(null); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 h-6 rounded-lg text-[10.5px] font-bold transition-all hover:opacity-80"
            style={{ background: "rgba(183,255,90,0.12)", border: "1px solid rgba(183,255,90,0.3)", color: "#B7FF5A" }}
          >
            <Plus className="w-2.5 h-2.5" /> New Alert
          </button>
        </div>
      </div>

      {/* ── History panel ── */}
      {subTab === "history" ? (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <HistoryPanel symbol={symbol} allSymbols={allSymbols} refreshKey={historyRefreshKey} />
        </div>
      ) : (
        <>
          {/* ── Column headers ── */}
          {displayRows.length > 0 && (
            <div className="grid px-4 py-1.5 shrink-0"
              style={{
                gridTemplateColumns: "1fr 88px 72px 72px 32px",
                borderBottom: "1px solid rgba(57,91,67,0.1)",
              }}>
              {["Drawing / Condition", "Projected", "Dist%", "Status", ""].map(h => (
                <span key={h} className="text-[8.5px] font-bold uppercase tracking-wider"
                  style={{ color: "rgba(167,184,169,0.35)" }}>{h}</span>
              ))}
            </div>
          )}

          {/* ── Rows ── */}
          <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "none" }}>
            {loading ? (
              <div className="flex items-center justify-center h-16">
                <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              </div>
            ) : displayRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
                {subTab === "triggered" ? (
                  <>
                    <CheckCircle2 className="w-6 h-6" style={{ color: "rgba(167,184,169,0.2)" }} />
                    <p className="text-[11px]" style={{ color: "rgba(167,184,169,0.4)" }}>
                      No triggered alerts{allSymbols ? "" : ` for ${symbol}`}
                    </p>
                    <p className="text-[9.5px]" style={{ color: "rgba(167,184,169,0.25)" }}>
                      Triggered alerts are preserved here — use Reset to reactivate
                    </p>
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-6 h-6" style={{ color: "rgba(167,184,169,0.2)" }} />
                    <p className="text-[11px]" style={{ color: "rgba(167,184,169,0.4)" }}>
                      No drawing alerts{allSymbols ? "" : ` for ${symbol}`}
                    </p>
                    <button
                      onClick={() => { setEditItem(null); setShowModal(true); }}
                      className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-[10.5px] font-bold transition-all hover:opacity-80 mt-1"
                      style={{ background: "rgba(183,255,90,0.1)", border: "1px solid rgba(183,255,90,0.25)", color: "#B7FF5A" }}
                    >
                      <Plus className="w-3 h-3" /> Create First Alert
                    </button>
                  </>
                )}
              </div>
            ) : (
              displayRows.map(row => {
                const color     = DRAWING_COLORS[row.drawingType] ?? "#A7B8A9";
                const Icon      = DRAWING_ICONS[row.drawingType] ?? TrendingUp;
                const projected = calcProjected(row, projNow);
                const condLabel = CONDITION_LABELS[row.condition] ?? row.condition;
                const dtLabel   = DRAWING_LABELS[row.drawingType] ?? row.drawingType;
                const dist      = projected !== null && currentPrice
                  ? ((currentPrice - projected) / projected) * 100
                  : null;
                const isNear    = dist !== null && Math.abs(dist) < 0.3;
                const isTrig    = row.isTriggered || row.alertStatus === "triggered";
                const isPaused  = row.alertStatus === "paused";

                return (
                  <div
                    key={row.id}
                    className={cn(
                      "grid items-center px-4 py-2 transition-colors",
                      isNear && !isTrig ? "bg-[#B7FF5A]/[0.025]" : "hover:bg-white/[0.02]"
                    )}
                    style={{
                      gridTemplateColumns: "1fr 88px 72px 72px 32px",
                      borderBottom: "1px solid rgba(57,91,67,0.08)",
                      opacity: isPaused || isTrig ? 0.65 : 1,
                      borderLeft: isNear && !isTrig ? `2px solid ${color}` : "2px solid transparent",
                    }}
                  >
                    {/* Drawing type + condition */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: isTrig ? "rgba(239,68,68,0.12)" : `${color}14`,
                          border:     `1px solid ${isTrig ? "rgba(239,68,68,0.3)" : `${color}30`}`,
                        }}>
                        <Icon className="w-3 h-3" style={{ color: isTrig ? "#f87171" : color }} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[10.5px] font-semibold leading-none truncate"
                            style={{ color: isTrig ? "#f87171" : "#F3FFF3" }}>
                            {dtLabel}
                          </p>
                          {row.drawingDisplayId && (
                            <span
                              className="text-[8px] font-mono px-1 py-0.5 rounded shrink-0"
                              style={{
                                background: isTrig ? "rgba(239,68,68,0.12)" : "rgba(183,255,90,0.10)",
                                border:     `1px solid ${isTrig ? "rgba(239,68,68,0.3)" : "rgba(183,255,90,0.25)"}`,
                                color:      isTrig ? "#f87171" : "#B7FF5A",
                              }}
                            >
                              {row.drawingDisplayId}
                            </span>
                          )}
                          {allSymbols && (
                            <span className="text-[8px] px-1 rounded shrink-0"
                              style={{ background: "rgba(57,91,67,0.2)", color: "rgba(167,184,169,0.6)" }}>
                              {row.symbol}
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] leading-none mt-0.5"
                          style={{ color: "rgba(167,184,169,0.55)" }}>
                          {condLabel} · {row.timeframe}
                        </p>
                      </div>
                    </div>

                    {/* Projected price */}
                    <div>
                      {isTrig && row.triggeredPrice ? (
                        <div>
                          <p className="text-[10px] font-mono font-bold" style={{ color: "#f87171" }}>
                            {fmtPrice(row.triggeredPrice, row.symbol)}
                          </p>
                          <p className="text-[8.5px]" style={{ color: "rgba(167,184,169,0.35)" }}>triggered</p>
                        </div>
                      ) : projected !== null ? (
                        <p className="text-[10px] font-mono font-bold" style={{ color: isNear ? color : "rgba(167,184,169,0.8)" }}>
                          {fmtPrice(projected, row.symbol)}
                        </p>
                      ) : (
                        <p className="text-[10px]" style={{ color: "rgba(167,184,169,0.25)" }}>—</p>
                      )}
                    </div>

                    {/* Distance % */}
                    <div>
                      {dist !== null ? (
                        <p className={cn("text-[10px] font-mono font-bold", Math.abs(dist) < 0.5 ? "text-yellow-400" : "")}
                          style={{ color: dist >= 0 ? "#B7FF5A" : "#ef4444" }}>
                          {dist >= 0 ? "+" : ""}{dist.toFixed(2)}%
                        </p>
                      ) : (
                        <p className="text-[10px]" style={{ color: "rgba(167,184,169,0.25)" }}>—</p>
                      )}
                    </div>

                    {/* Status */}
                    <StatusBadge status={row.alertStatus} isTriggered={row.isTriggered} />

                    {/* Menu */}
                    <RowMenu
                      row={row}
                      onEdit={() => { setEditItem(row); setShowModal(true); }}
                      onDelete={() => handleDelete(row.id)}
                      onTogglePause={() => handleTogglePause(row)}
                      onReset={() => handleReset(row)}
                      onClone={() => handleClone(row)}
                    />
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <DrawingAlertModal
          symbol={symbol}
          currentInterval={currentInterval}
          currentPrice={currentPrice}
          editItem={editItem}
          onClose={() => { setShowModal(false); setEditItem(null); }}
          onCreated={() => { void load(); }}
        />
      )}
    </div>
  );
}
