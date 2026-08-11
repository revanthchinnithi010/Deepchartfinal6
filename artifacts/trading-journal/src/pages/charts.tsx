import {
  memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import html2canvas from "html2canvas";
import {
  ChevronDown, ChevronUp,
  Globe, BarChart2, Droplets,
  GripHorizontal,
  Plus, X, Star, Search, BellPlus,
  List, Bitcoin,
  ChevronRight, Undo2, Redo2, RotateCcw, Menu,
  Download, Copy, Share2, Camera, Plug,
} from "lucide-react";
import icoCandlesticks   from "@/assets/icon-candlesticks.svg?url";
import icoHeikinAshi     from "@/assets/icon-heikinashi.svg?url";
import icoLine           from "@/assets/icon-line.svg?url";
import icoLineMarkers    from "@/assets/icon-linewithmarkers.svg?url";
import icoIndicator      from "@/assets/icon-indicator.svg?url";
import icoAlert          from "@/assets/icon-alert.svg?url";
import icoReplay         from "@/assets/icon-replay.svg?url";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toArray } from "@/lib/safeArray";
import { useChartFocusMode } from "@/contexts/ChartFocusContext";
import {
  useLiveMarketContext, fmtPrice,
  type TickState,
} from "@/contexts/LiveMarketContext";
import { useTickStore, useSymbolTick } from "@/store/tickStore";
import { getCrosshair, subscribeCrosshair } from "@/lib/crosshairState";
import {
  useWatchlist, SYMBOL_CATALOG,
  type WatchlistEntry,
} from "@/contexts/WatchlistContext";
import { DrawingAlertModal } from "@/components/charts/DrawingAlertModal";
import { TFDropdown, tfLabel, sortTFs } from "@/components/charts/TFDropdown";
import DrawingOverlay from "@/components/charts/DrawingOverlay";
import DrawingToolbar from "@/components/charts/DrawingToolbar";
import CustomChart from "@/components/charts/CustomChart";
import BuySellPanel from "@/components/charts/BuySellPanel";
import IndicatorsPanel from "@/components/charts/IndicatorsPanel";
import IndicatorTags from "@/components/charts/IndicatorTags";
import IndicatorRenderer from "@/components/charts/IndicatorRenderer";
import CustomIndicatorRenderer from "@/components/charts/CustomIndicatorRenderer";
import SettingsPanel from "@/components/charts/SettingsPanel";
import { DEFAULT_CHART_SETTINGS, type ChartSettings } from "@/components/charts/chartSettingsTypes";
import RightToolbar, { type ChartLayoutType } from "@/components/charts/RightToolbar";
import AlertCenterModal from "@/components/charts/AlertCenterModal";
import MiniChart from "@/components/charts/MiniChart";
import ChartContextMenu from "@/components/charts/ChartContextMenu";
import ReplayControls from "@/components/charts/ReplayControls";
import { FeedDiagnostics } from "@/components/charts/FeedDiagnostics";
import { useChartStore, type ChartType, type OHLCBar } from "@/store/chartStore";
import { useDrawingStore } from "@/store/drawingStore";
import { useAlertStore } from "@/store/alertStore";
import { chartApiRef } from "@/lib/chartApiRef";
import { playNotificationSound as playAlertSound } from "@/lib/notificationManager";
import type { Drawing } from "@/types/drawing";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNamedLayouts, type NamedLayout } from "@/hooks/useNamedLayouts";
import { MobileChartLayout } from "@/components/charts/MobileChartLayout";
import { useBrokerStore } from "@/store/brokerStore";
import { BrokerSelectModal } from "@/components/broker/BrokerSelectModal";
import { BrokerAuthModal } from "@/components/broker/BrokerAuthModal";
import { BrokerStatusBar } from "@/components/broker/BrokerStatusBar";
import { PositionsList } from "@/components/broker/PositionsList";
import { OrdersList } from "@/components/broker/OrdersList";
import { PlaceOrderPanel } from "@/components/broker/PlaceOrderPanel";
import { BrokerTabs } from "@/components/charts/BrokerTabs";
import { ConnectionStatus } from "@/components/charts/ConnectionStatus";
import {
  PageTransition,
  AnimatedModal,
  AnimatedButton,
  AnimatedIconButton,
  AnimatedList,
  AnimatedListItem,
  FadeIn,
} from "@/components/animations";

// ── Replay selector — draggable vertical line overlay ─────────────────────────
const ReplaySelector = memo(function ReplaySelector({
  replayAllBars, onConfirm, onCancel,
}: {
  replayAllBars: OHLCBar[];
  onConfirm: (idx: number) => void;
  onCancel: () => void;
}) {
  const overlayRef  = useRef<HTMLDivElement>(null);
  const [lineX, setLineX] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const dragging = useRef(false);

  // Initialise line at 60% of container width on mount
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    const initX = Math.round(w * 0.60);
    setLineX(initX);
    updateLabel(initX);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateLabel(x: number) {
    const ts = chartApiRef.current?.timeScale().coordinateToTime(x);
    if (!ts) { setLabel(""); return; }
    const t = typeof ts === "string" ? parseInt(ts) : (ts as number);
    const d = new Date(t * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    setLabel(`${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())}  ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`);
  }

  function resolveIdx(x: number): number {
    const ts = chartApiRef.current?.timeScale().coordinateToTime(x);
    if (!ts) return 0;
    const t = typeof ts === "string" ? parseInt(ts) : (ts as number);
    let idx = replayAllBars.findIndex(b => b.time >= t);
    if (idx < 0) idx = replayAllBars.length - 1;
    return Math.max(0, idx);
  }

  function onMouseDownHandle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    dragging.current = true;
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setLineX(x);
    updateLabel(x);
  }

  function onMouseUp() {
    dragging.current = false;
  }

  // touch support
  function onTouchMoveHandle(e: React.TouchEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.touches[0].clientX - rect.left, rect.width));
    setLineX(x);
    updateLabel(x);
  }

  const overlayW = overlayRef.current?.getBoundingClientRect().width ?? 0;

  return (
    <div
      ref={overlayRef}
      style={{ position: "absolute", inset: 0, zIndex: 40, cursor: dragging.current ? "ew-resize" : "default", userSelect: "none" }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Future-bar mask — right of line */}
      {lineX !== null && (
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: lineX, right: 0,
          background: "rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }} />
      )}

      {/* The vertical line */}
      {lineX !== null && (
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: lineX - 1, width: 2,
          background: "#B7FF5A",
          boxShadow: "0 0 8px rgba(183,255,90,0.55)",
          pointerEvents: "none",
        }}>
          {/* Date label at top */}
          <div style={{
            position: "absolute", top: 10,
            left: "50%", transform: "translateX(-50%)",
            background: "rgba(7,17,13,0.95)",
            border: "1px solid rgba(183,255,90,0.35)",
            borderRadius: 7, padding: "4px 10px",
            fontSize: 11, fontWeight: 700, color: "#B7FF5A",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 18px rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }}>
            {label || "—"}
          </div>
        </div>
      )}

      {/* Drag handle — centred on the line, mid-height */}
      {lineX !== null && (
        <div
          onMouseDown={onMouseDownHandle}
          onTouchMove={onTouchMoveHandle}
          onTouchEnd={() => { dragging.current = false; }}
          style={{
            position: "absolute",
            top: "50%", left: lineX,
            transform: "translate(-50%, -50%)",
            width: 28, height: 28, borderRadius: "50%",
            background: "#B7FF5A",
            boxShadow: "0 0 16px rgba(183,255,90,0.7)",
            border: "3px solid rgba(7,17,13,0.9)",
            cursor: "ew-resize",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 2,
          }}
        >
          {/* Double-arrow icon */}
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path d="M3 5H9M1 5L3.5 2.5M1 5L3.5 7.5M11 5L8.5 2.5M11 5L8.5 7.5" stroke="#07110D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      {/* Bottom action bar */}
      {lineX !== null && (
        <div style={{
          position: "absolute", bottom: 22, left: "50%",
          transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: 8,
          pointerEvents: "all",
        }}>
          <button
            onClick={() => onConfirm(resolveIdx(lineX))}
            style={{
              height: 34, padding: "0 20px", borderRadius: 10,
              background: "#B7FF5A", border: "none",
              cursor: "pointer", outline: "none",
              fontSize: 12, fontWeight: 800, color: "#07110D",
              boxShadow: "0 4px 18px rgba(183,255,90,0.35)",
            }}
          >
            ▶  Start Replay
          </button>
          <button
            onClick={onCancel}
            style={{
              height: 34, padding: "0 16px", borderRadius: 10,
              background: "rgba(7,17,13,0.92)",
              border: "1px solid rgba(183,255,90,0.2)",
              cursor: "pointer", outline: "none",
              fontSize: 12, fontWeight: 600, color: "rgba(183,220,190,0.7)",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Top instruction hint */}
      <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
        background: "rgba(7,17,13,0.85)",
        border: "1px solid rgba(183,255,90,0.12)",
        borderRadius: 8, padding: "5px 14px",
        fontSize: 11, fontWeight: 500, color: "rgba(183,220,190,0.65)",
        pointerEvents: "none", whiteSpace: "nowrap",
      }}>
        Drag the line to set replay start · <span style={{ color: "rgba(183,255,90,0.5)" }}>Esc</span> to cancel
      </div>

      {/* Invisible wide hit-area for dragging anywhere on the line */}
      {lineX !== null && (
        <div
          onMouseDown={onMouseDownHandle}
          style={{
            position: "absolute", top: 0, bottom: 0,
            left: lineX - 8, width: 16,
            cursor: "ew-resize",
          }}
        />
      )}
    </div>
  );
});

// ── Symbol metadata helpers ───────────────────────────────────────────────────
function getEntry(key: string, watchlist: WatchlistEntry[]): WatchlistEntry {
  const wl = watchlist.find(e => e.symbol === key);
  if (wl) return wl;
  const cat = SYMBOL_CATALOG[key];
  return {
    id: -1, symbol: key, provider: "ctrader", position: 0,
    isFavorite: false, createdAt: "",
    tv: cat?.tv ?? key, label: cat?.label ?? key,
    badge: cat?.badge ?? key.slice(0, 4), market: cat?.market ?? "Other",
  };
}

const MARKET_ICONS: Record<string, React.ElementType> = {
  Crypto: Bitcoin, Forex: Globe, Indices: BarChart2, Commodities: Droplets,
};

const TIMEFRAMES = [
  { label: "1m",  value: "1"   },
  { label: "5m",  value: "5"   },
  { label: "15m", value: "15"  },
  { label: "30m", value: "30"  },
  { label: "1H",  value: "60"  },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D"   },
  { label: "1W",  value: "W"   },
];

const BOTTOM_MIN  = 90;
const BOTTOM_MAX  = 420;
const HANDLE_H    = 36;

// ── Realtime clock & candle countdown ────────────────────────────────────────
function intervalToMs(interval: string): number {
  if (interval === "D") return 24 * 60 * 60 * 1000;
  if (interval === "W") return 7 * 24 * 60 * 60 * 1000;
  return parseInt(interval, 10) * 60 * 1000;
}

function calcCountdown(interval: string): string {
  const now = Date.now();
  let remaining: number;
  if (interval === "W") {
    const d = new Date();
    const dayOfWeek = d.getUTCDay();
    const daysLeft = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    remaining = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysLeft) - now;
  } else if (interval === "D") {
    const d = new Date();
    remaining = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
  } else {
    const ms = intervalToMs(interval);
    remaining = ms - (now % ms);
  }
  const totalSec = Math.max(0, Math.floor(remaining / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getUTCClock(): string {
  const d = new Date();
  return [
    String(d.getUTCHours()).padStart(2, "0"),
    String(d.getUTCMinutes()).padStart(2, "0"),
    String(d.getUTCSeconds()).padStart(2, "0"),
  ].join(":");
}

function useRealtimeClock(interval: string) {
  const [utcTime, setUtcTime] = useState(() => getUTCClock());
  const [countdown, setCountdown] = useState(() => calcCountdown(interval));
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  useEffect(() => {
    const tick = () => { setUtcTime(getUTCClock()); setCountdown(calcCountdown(intervalRef.current)); };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);
  return { utcTime, countdown };
}

// ── Mini Sparkline SVG ────────────────────────────────────────────────────────
function MiniSparkline({ data, positive, width = 56, height = 22 }: {
  data: number[]; positive: boolean; width?: number; height?: number;
}) {
  if (data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 3) - 1.5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", flexShrink: 0 }}>
      <polyline points={pts} fill="none"
        stroke={positive ? "#B7FF5A" : "#ef4444"}
        strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}

// ── Add Symbol Modal ──────────────────────────────────────────────────────────
function AddSymbolModal({ onClose, existing }: { onClose: () => void; existing: string[] }) {
  const { addSymbol } = useWatchlist();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const available = Object.entries(SYMBOL_CATALOG).filter(([key]) => !existing.includes(key) && !added.has(key));
  const filtered = search.trim()
    ? available.filter(([key, meta]) =>
        key.toLowerCase().includes(search.toLowerCase()) ||
        meta.label.toLowerCase().includes(search.toLowerCase()) ||
        meta.badge.toLowerCase().includes(search.toLowerCase()))
    : available;

  const grouped = filtered.reduce<Record<string, [string, typeof SYMBOL_CATALOG[string]][]>>((acc, entry) => {
    const m = entry[1].market;
    if (!acc[m]) acc[m] = [];
    acc[m].push(entry);
    return acc;
  }, {});

  const handleAdd = async (symbol: string) => {
    setAdding(symbol);
    const result = await addSymbol(symbol);
    setAdding(null);
    if (result.ok) {
      setAdded(prev => new Set([...prev, symbol]));
    } else {
      setErrors(prev => ({ ...prev, [symbol]: result.error ?? "Failed" }));
      setTimeout(() => setErrors(prev => { const next = { ...prev }; delete next[symbol]; return next; }), 3000);
    }
  };

  return (
    <AnimatedModal open onClose={onClose} mode="dialog" zIndex={2000}>
      <div className="w-80 rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "hsl(var(--background))", border: "1px solid var(--surface-btn-border)" }}>
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid rgba(57,91,67,0.15)" }}>
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4" style={{ color: "#B7FF5A" }} />
            <span className="text-sm font-bold text-white">Add Symbol</span>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.08] text-muted-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5" style={{ color: "rgba(167,184,169,0.45)" }} />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search symbols…"
              className="w-full h-8 pl-8 pr-3 rounded-lg text-[12px] text-[#F3FFF3] placeholder:text-[#A7B8A9]/40 focus:outline-none"
              style={{ background: "#0D1C16", border: "1px solid var(--surface-btn-border)" }} />
          </div>
        </div>
        <div className="overflow-y-auto max-h-72 pb-2" style={{ scrollbarWidth: "none" }}>
          {Object.entries(grouped).map(([market, syms]) => (
            <div key={market}>
              <div className="px-4 pt-2 pb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: "rgba(167,184,169,0.45)" }}>{market}</span>
              </div>
              <AnimatedList>
                {syms.map(([key, meta]) => (
                  <AnimatedListItem key={key}>
                    <button onClick={() => handleAdd(key)} disabled={!!adding || added.has(key)}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/[0.04] transition-colors text-left disabled:opacity-50">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-black"
                        style={{ background: "rgba(13,28,22,0.9)", color: "#A7B8A9" }}>{meta.badge.slice(0, 4)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-white leading-none">{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground/50 leading-none mt-0.5">{key}</p>
                      </div>
                      <div className="shrink-0">
                        {adding === key ? <div className="w-4 h-4 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
                        : errors[key] ? <span className="text-[9px] text-red-400">Failed</span>
                        : added.has(key) ? <span className="text-[9px] text-foreground/60">✓</span>
                        : <Plus className="w-3.5 h-3.5" style={{ color: "rgba(167,184,169,0.4)" }} />}
                      </div>
                    </button>
                  </AnimatedListItem>
                ))}
              </AnimatedList>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-6 text-center text-[11px] text-muted-foreground/40">
              {search ? "No symbols match your search" : "All available symbols are in your watchlist"}
            </div>
          )}
        </div>
      </div>
    </AnimatedModal>
  );
}

// ── Symbol Picker Overlay ─────────────────────────────────────────────────────
function SymbolPicker({ items, activeKey, onSelect, onClose }: {
  items: WatchlistEntry[]; activeKey: string;
  onSelect: (k: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30);
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const id = setTimeout(() => document.addEventListener("pointerdown", h), 80);
    return () => { clearTimeout(id); document.removeEventListener("pointerdown", h); };
  }, [onClose]);

  const lc = query.toLowerCase();
  const filtered = query
    ? items.filter(e =>
        e.symbol.toLowerCase().includes(lc) ||
        e.label.toLowerCase().includes(lc) ||
        e.badge.toLowerCase().includes(lc))
    : items;

  const MARKET_ORDER = ["Indices", "Forex", "Crypto", "Commodities", "Other"];
  const grouped = filtered.reduce<Record<string, WatchlistEntry[]>>((acc, e) => {
    if (!acc[e.market]) acc[e.market] = [];
    acc[e.market].push(e); return acc;
  }, {});
  const sortedMarkets = Object.keys(grouped).sort(
    (a, b) => (MARKET_ORDER.indexOf(a) + 99) % 99 - (MARKET_ORDER.indexOf(b) + 99) % 99);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 80,
        width: 280, maxHeight: 380, overflow: "hidden",
        background: "rgba(7,11,9,0.98)", backdropFilter: "blur(24px)",
        border: "1px solid rgba(57,91,67,0.35)", borderRadius: 14,
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid rgba(57,91,67,0.15)" }}>
        <div style={{ position: "relative" }}>
          <Search style={{ position: "absolute", left: 8, top: 7, width: 13, height: 13, color: "rgba(167,184,169,0.4)" }} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search symbol…"
            style={{
              width: "100%", height: 30, paddingLeft: 26, paddingRight: 8, borderRadius: 8,
              background: "rgba(13,28,22,0.8)", border: "1px solid var(--surface-btn-border)",
              color: "#F3FFF3", fontSize: 12, outline: "none",
            }} />
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, scrollbarWidth: "none" }}>
        {sortedMarkets.map(market => (
          <div key={market}>
            <div style={{ padding: "8px 12px 4px", display: "flex", alignItems: "center", gap: 6 }}>
              {(() => { const Icon = MARKET_ICONS[market] ?? Globe; return <Icon style={{ width: 10, height: 10, color: "rgba(167,184,169,0.4)" }} />; })()}
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(167,184,169,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{market}</span>
            </div>
            {grouped[market].map(entry => {
              const tick = useTickStore.getState().ticks[entry.symbol] ?? null;
              const active = entry.symbol === activeKey;
              const isPos = (tick?.changePct ?? 0) >= 0;
              return (
                <button key={entry.symbol} onClick={() => { onSelect(entry.symbol); onClose(); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 12px", cursor: "pointer",
                    background: active ? "rgba(183,255,90,0.08)" : "transparent",
                    border: "none", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.15)"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: active ? "rgba(183,255,90,0.15)" : "rgba(13,28,22,0.9)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 8, fontWeight: 900, color: active ? "#B7FF5A" : "#A7B8A9",
                  }}>{entry.badge.slice(0, 4)}</div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: active ? "#B7FF5A" : "#F3FFF3", margin: 0, lineHeight: 1 }}>{entry.badge}</p>
                    <p style={{ fontSize: 9.5, color: "rgba(167,184,169,0.5)", margin: "2px 0 0", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.label}</p>
                  </div>
                  {tick && tick.price > 0 && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: "#F3FFF3", margin: 0, lineHeight: 1, fontFamily: "monospace" }}>{fmtPrice(tick.price, entry.symbol)}</p>
                      <p style={{ fontSize: 9, fontWeight: 700, color: isPos ? "#B7FF5A" : "#ef4444", margin: "2px 0 0", lineHeight: 1 }}>
                        {isPos ? "+" : ""}{tick.changePct.toFixed(2)}%
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "20px", textAlign: "center", fontSize: 11, color: "rgba(167,184,169,0.4)" }}>
            {query ? "No symbols found" : "Watchlist is empty"}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Watchlist row ─────────────────────────────────────────────────────────────
const WatchlistRow = memo(function WatchlistRow({
  entry, active, tick, onSelect, onRemove, onToggleFavorite,
}: {
  entry: WatchlistEntry; active: boolean; tick: TickState | null;
  onSelect: (k: string) => void; onRemove: (id: number) => void;
  onToggleFavorite: (id: number, current: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hasPrice = tick !== null && tick.price > 0;
  const isPositive = (tick?.changePct ?? 0) >= 0;

  return (
    <div className="relative group flex items-center gap-2 px-2 py-1.5 mx-1 transition-all"
      style={{
        width: "calc(100% - 8px)", borderRadius: 10,
        background: active ? "rgba(183,255,90,0.09)" : hovered ? "rgba(13,28,22,0.7)" : "transparent",
        border: `1px solid ${active ? "rgba(183,255,90,0.22)" : "transparent"}`,
      }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button onClick={e => { e.stopPropagation(); onToggleFavorite(entry.id, entry.isFavorite); }}
        className="shrink-0 w-3.5 h-3.5 flex items-center justify-center"
        style={{ opacity: entry.isFavorite ? 1 : hovered ? 0.5 : 0 }}>
        <Star className="w-3 h-3" style={{ color: entry.isFavorite ? "#B7FF5A" : "#A7B8A9", fill: entry.isFavorite ? "#B7FF5A" : "none" }} />
      </button>
      <button onClick={() => onSelect(entry.symbol)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[8px] font-black"
          style={{ background: active ? "rgba(183,255,90,0.15)" : "rgba(13,28,22,0.9)", color: active ? "#B7FF5A" : "#A7B8A9" }}>
          {entry.badge.slice(0, 4)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold leading-none truncate" style={{ color: active ? "#B7FF5A" : "#F3FFF3" }}>{entry.badge}</p>
          <p className="text-[9px] leading-none mt-0.5 truncate" style={{ color: "rgba(167,184,169,0.55)" }}>{entry.label}</p>
        </div>
        {hasPrice && (
          <div className="text-right shrink-0" style={{ minWidth: 52 }}>
            <p key={tick!.flashKey} className={cn("font-mono leading-none",
              tick!.flashDir === "up" ? "tick-flash-up" : tick!.flashDir === "down" ? "tick-flash-down" : "")}
              style={{ fontSize: 10, fontWeight: 800, color: "#F3FFF3" }}>
              {fmtPrice(tick!.price, entry.symbol)}
            </p>
            <p className="leading-none mt-0.5" style={{ fontSize: 8.5, fontWeight: 700, color: isPositive ? "#B7FF5A" : "#ef4444" }}>
              {isPositive ? "+" : ""}{tick!.changePct.toFixed(2)}%
            </p>
          </div>
        )}
        {!hasPrice && active && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#B7FF5A", boxShadow: "0 0 5px #B7FF5A80" }} />}
      </button>
      {hovered && entry.id !== -1 && (
        <button onClick={e => { e.stopPropagation(); onRemove(entry.id); }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors">
          <X className="w-2.5 h-2.5" style={{ color: "rgba(248,113,113,0.7)" }} />
        </button>
      )}
    </div>
  );
});


// ── Bottom tab content ────────────────────────────────────────────────────────
const BOTTOM_TABS = ["Positions", "Orders"] as const;
type BottomTab = typeof BOTTOM_TABS[number];

const BottomContent = memo(function BottomContent({
  tab,
}: { tab: BottomTab; symbol: string; currentInterval: string; currentPrice: number | null }) {
  return (
    <div className="flex-1 flex items-center justify-center overflow-hidden">
      <div className="text-center">
        <div className="w-9 h-9 rounded-xl mx-auto mb-2 flex items-center justify-center"
          style={{ background: "rgba(57,91,67,0.12)", border: "1px solid rgba(57,91,67,0.22)" }}>
          <List className="w-4 h-4" style={{ color: "rgba(167,184,169,0.4)" }} />
        </div>
        <p className="text-[12px] font-semibold" style={{ color: "rgba(167,184,169,0.55)" }}>No open {tab.toLowerCase()}</p>
        <p className="text-[10px] mt-0.5" style={{ color: "rgba(167,184,169,0.3)" }}>Broker execution panel coming soon</p>
      </div>
    </div>
  );
});

// ── DB-backed chart layout persistence ───────────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LAYOUT_SLOT = "main";

interface ChartLayout {
  symbol: string; interval: string; market: string;
  bottomOpen: boolean; bottomHeight: number;
}

function useChartLayout() {
  const [layout, setLayout] = useState<ChartLayout>({
    symbol: localStorage.getItem("tv_symbol") ?? "BTCUSD",
    interval: localStorage.getItem("tv_interval") ?? "60",
    market: localStorage.getItem("tv_market") ?? "Crypto",
    bottomOpen: localStorage.getItem("tv_bot") !== "false",
    bottomHeight: Number(localStorage.getItem("tv_botH")) || 190,
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/chart-layouts/${LAYOUT_SLOT}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: ChartLayout | null) => {
        if (data) {
          // localStorage wins over DB for symbol/interval/market: navigation flows
          // (Markets, Watchlist, Search) write to localStorage *before* routing here,
          // so the localStorage value is always the user's intended selection.
          const sym = localStorage.getItem("tv_symbol")   ?? data.symbol;
          const itv = localStorage.getItem("tv_interval") ?? data.interval;
          const mkt = localStorage.getItem("tv_market")   ?? data.market;
          // chartStore is THE source of truth — sync DB/localStorage into it
          const store = useChartStore.getState();
          if (store.symbol   !== sym) store.setSymbol(sym);
          if (store.interval !== itv) store.setInterval(itv);
          setLayout({
            symbol: sym, interval: itv, market: mkt,
            bottomOpen:   data.bottomOpen,
            bottomHeight: data.bottomHeight,
          });
        }
      })
      .catch(() => {});
  }, []);

  const saveToDb = useCallback((patch: Partial<ChartLayout>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`${BASE}/api/chart-layouts/${LAYOUT_SLOT}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {});
    }, 600);
  }, []);

  return { layout, setLayout, saveToDb };
}

// ── OHLCV info bar — DOM-mutation driven, ZERO re-renders on crosshair move ──
function OHLCVBar({ symbol }: { symbol: string }) {
  // PERF: Do NOT subscribe to livePrice as React state — that would cause a full
  // OHLCVBar (and parent Charts) re-render on every WS tick (~60fps).
  // Instead: read the initial value from getState() for static render, then keep
  // a ref in sync via a Zustand store.subscribe() listener (zero React renders).
  const lpRef  = useRef<number | null>(useChartStore.getState().livePrice);
  const symRef = useRef(symbol);
  symRef.current = symbol;

  const priceRef   = useRef<HTMLSpanElement>(null);
  const ohlcRowRef = useRef<HTMLDivElement>(null);
  const oRef = useRef<HTMLSpanElement>(null);
  const hRef = useRef<HTMLSpanElement>(null);
  const lRef = useRef<HTMLSpanElement>(null);
  const cRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      const ch  = getCrosshair();
      const has = ch.open !== null;
      const C   = has ? ch.close : lpRef.current;
      const O   = has ? ch.open  : null;
      const H   = has ? ch.high  : null;
      const L   = has ? ch.low   : null;
      const isUp = O !== null && C !== null ? C >= O : true;
      const fmt  = (v: number | null) => v !== null ? fmtPrice(v, symRef.current) : "—";

      if (priceRef.current) {
        priceRef.current.textContent = `${has ? "●" : "◉"} ${fmt(C)}`;
        priceRef.current.style.color = isUp ? "#B7FF5A" : "#ef4444";
      }
      if (ohlcRowRef.current) ohlcRowRef.current.style.display = O !== null ? "flex" : "none";
      if (oRef.current) oRef.current.textContent = fmt(O);
      if (hRef.current) hRef.current.textContent = fmt(H);
      if (lRef.current) lRef.current.textContent = fmt(L);
      if (cRef.current) cRef.current.textContent = fmt(C);
    };
    update();
    const unsubCrosshair = subscribeCrosshair(update);

    // Track live price updates without React re-renders:
    // Zustand store.subscribe fires synchronously on state change — no RAF needed.
    const unsubStore = useChartStore.subscribe(state => {
      const price = state.livePrice;
      if (price === lpRef.current) return;
      lpRef.current = price;
      if (getCrosshair().open === null && priceRef.current && price !== null) {
        priceRef.current.textContent = `◉ ${fmtPrice(price, symRef.current)}`;
      }
    });

    return () => { unsubCrosshair(); unsubStore(); };
  }, []); // intentionally empty — all live values read via refs/subscriptions

  // Initial snapshot for static render — read from store snapshot, not subscription
  const initCh  = getCrosshair();
  const initHas = initCh.open !== null;
  const initC   = initHas ? initCh.close : useChartStore.getState().livePrice;
  const initO   = initHas ? initCh.open  : null;
  const initIsUp = initO !== null && initC !== null ? initC >= initO : true;
  const initFmt  = (v: number | null) => v !== null ? fmtPrice(v, symbol) : "—";

  if (initC === null && !initHas) return null;

  return (
    <div className="flex items-center gap-3 px-3 shrink-0"
      style={{ height: 22, background: "rgba(7,17,13,0.85)", borderBottom: "1px solid rgba(57,91,67,0.1)" }}>
      <span ref={priceRef} className="text-[10px] font-bold" style={{ color: initIsUp ? "#B7FF5A" : "#ef4444" }}>
        {initHas ? "●" : "◉"} {initFmt(initC)}
      </span>
      <div ref={ohlcRowRef} className="flex items-center gap-3" style={{ display: initO !== null ? "flex" : "none" }}>
        <span className="text-[9.5px]" style={{ color: "rgba(167,184,169,0.6)" }}>O <span ref={oRef} style={{ color: "#F3FFF3" }}>{initFmt(initO)}</span></span>
        <span className="text-[9.5px]" style={{ color: "rgba(167,184,169,0.6)" }}>H <span ref={hRef} style={{ color: "#B7FF5A" }}>{initFmt(initHas ? initCh.high : null)}</span></span>
        <span className="text-[9.5px]" style={{ color: "rgba(167,184,169,0.6)" }}>L <span ref={lRef} style={{ color: "#ef4444" }}>{initFmt(initHas ? initCh.low : null)}</span></span>
        <span className="text-[9.5px]" style={{ color: "rgba(167,184,169,0.6)" }}>C <span ref={cRef} style={{ color: "#F3FFF3" }}>{initFmt(initC)}</span></span>
      </div>
    </div>
  );
}

// ── Snapshot Preview Popup ────────────────────────────────────────────────────
function SnapshotPreviewPopup({ url, filename, onClose }: {
  url: string; filename: string; onClose: () => void;
}) {
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    toast("Downloaded successfully");
  };

  const handleCopyImage = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Image copied to clipboard");
    } catch {
      toast("Copy not supported — downloading instead");
      handleDownload();
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], filename, { type: "image/png" });
        await navigator.share({ files: [file], title: "TradeVault Chart" });
      } else {
        handleDownload();
      }
    } catch { /* user cancelled */ }
  };

  const btnStyle = (accent: string): React.CSSProperties => ({
    flex: 1, height: 38, borderRadius: 10, border: `1px solid ${accent}`,
    background: "rgba(255,255,255,0.03)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    fontSize: 12, fontWeight: 700, color: "#F3FFF3",
    transition: "background 0.15s, box-shadow 0.15s",
  });

  return (
    <AnimatedModal open onClose={onClose} mode="dialog" zIndex={9999}>
      <div style={{
        width: 520, maxWidth: "92vw",
        background: "rgba(8,16,12,0.97)",
        border: "1px solid rgba(183,255,90,0.15)",
        borderRadius: 18,
        boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03) inset",
        padding: "20px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "rgba(183,255,90,0.1)", border: "1px solid rgba(183,255,90,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Camera style={{ width: 13, height: 13, color: "#B7FF5A" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#F3FFF3" }}>Chart Snapshot</span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)",
              background: "rgba(255,255,255,0.03)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X style={{ width: 13, height: 13, color: "rgba(167,184,169,0.7)" }} />
          </button>
        </div>

        {/* Preview thumbnail */}
        <div style={{
          borderRadius: 12, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.07)",
          background: "#07110D",
          lineHeight: 0,
        }}>
          <img src={url} alt="Chart snapshot" style={{ width: "100%", display: "block" }} />
        </div>

        {/* Filename hint */}
        <div style={{ fontSize: 10, color: "rgba(167,184,169,0.4)", textAlign: "center" }}>
          {filename}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={btnStyle("rgba(183,255,90,0.2)")}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.08)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(183,255,90,0.1)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
            onClick={handleDownload}
          >
            <Download style={{ width: 13, height: 13, color: "#B7FF5A" }} />
            Download
          </button>
          <button
            style={btnStyle("rgba(99,179,237,0.2)")}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,179,237,0.08)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(99,179,237,0.1)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
            onClick={handleCopyImage}
          >
            <Copy style={{ width: 13, height: 13, color: "#63B3ED" }} />
            Copy Image
          </button>
          <button
            style={btnStyle("rgba(167,139,250,0.2)")}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(167,139,250,0.08)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(167,139,250,0.1)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
            onClick={handleShare}
          >
            <Share2 style={{ width: 13, height: 13, color: "#A78BFA" }} />
            Share
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}

// ── Main Charts page ──────────────────────────────────────────────────────────
export default function Charts() {
  // ── Startup performance timings ───────────────────────────────────────────
  // These mark the wall-clock time at which the Charts component mounts.
  // Pair with "[PERF] LWC createChart" and "[PERF] candles" in console to
  // identify the exact bottleneck (route nav / JS parse / LWC init / fetch).
  useEffect(() => {
    performance.mark("tj:charts:mount");
    console.debug(`[PERF] Charts component mounted at ${performance.now().toFixed(1)} ms since page load`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMobile = useIsMobile();
  const { openSidebar } = useChartFocusMode();
  const { wsStatus, alertEvents } = useLiveMarketContext();

  const {
    activeAccount, connectionStatus: brokerStatus,
    showSelectModal, showAuthModal, showPositions, showOrders, showPlaceOrder,
    openSelectModal, setShowPlaceOrder,
  } = useBrokerStore();
  const { items: watchlistItems } = useWatchlist();
  const connected = wsStatus === "connected";
  const { canUndo, canRedo, undo, redo } = useDrawingStore();
  const activeAlertsCount = useAlertStore(s => s.alerts.filter(a => a.status === "active").length);
  const hydrateAlerts = useAlertStore(s => s.hydrateFromApi);

  useEffect(() => {
    void hydrateAlerts();
  }, [hydrateAlerts]);

  const { layout, setLayout, saveToDb } = useChartLayout();
  // ── Single source of truth: chartStore drives symbol + interval ──────────
  // Do NOT read from layout.symbol / layout.interval here — they're kept only
  // for DB persistence and market inference, not for driving the UI.
  const activeKey  = useChartStore(s => s.symbol);
  const interval   = useChartStore(s => s.interval);
  const activeTick = useSymbolTick(activeKey);
  const bottomOpen = layout.bottomOpen;
  const bottomH    = layout.bottomHeight;

  const [bottomTab,       setBottomTab]       = useState<BottomTab>("Positions");
  const [isFullscreen,    setIsFullscreen]    = useState(false);
  const [showPicker,    setShowPicker]    = useState(false);
  const [showAlertCenter, setShowAlertCenter] = useState(false);
  const [showQuickAlert, setShowQuickAlert] = useState(false);
  const [alertDrawing,   setAlertDrawing]   = useState<Drawing | null>(null);
  const [alertDrawingIds, setAlertDrawingIds] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem("tv_alert_drawing_ids");
      return raw ? new Set<number>(JSON.parse(raw) as number[]) : new Set<number>();
    } catch { return new Set<number>(); }
  });

  const addAlertDrawingId = useCallback((id: number) => {
    setAlertDrawingIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("tv_alert_drawing_ids", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleDrawingAlert = useCallback((drawing: Drawing) => {
    setAlertDrawing(drawing);
  }, []);

  const closeAlertModal = useCallback(() => {
    setShowQuickAlert(false);
    setAlertDrawing(null);
  }, []);
  const indicatorsBtnRef = useRef<HTMLButtonElement>(null);
  const chartAreaRef     = useRef<HTMLDivElement>(null);
  const [snapshotPreview, setSnapshotPreview] = useState<{ show: boolean; url: string; filename: string }>({ show: false, url: "", filename: "" });
  const [showBuySell,        setShowBuySell]        = useState(false);
  const [showIndicators,     setShowIndicators]     = useState(false);
  const [showSettings,       setShowSettings]       = useState(false);

  // ── Chart context menu (desktop right-click only) ────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; open: boolean }>({ x: 0, y: 0, open: false });

  const closeCtxMenu = useCallback(() => {
    setCtxMenu(prev => ({ ...prev, open: false }));
  }, []);

  const handleChartContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (e.button !== 2) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, open: true });
  }, []);
  const [chartSettings, setChartSettings] = useState<ChartSettings>(() => {
    // Always start from the hardcoded defaults — ignore any previously-saved values.
    // Clear stale localStorage keys so they never drift back in.
    try {
      localStorage.removeItem("tv_chart_settings");
      localStorage.removeItem("tv_chart_settings_default");
    } catch { /* ok in SSR / private-browsing */ }
    return DEFAULT_CHART_SETTINGS;
  });

  const [layoutCount, setLayoutCount] = useState<ChartLayoutType>(() => {
    const n = Number(localStorage.getItem("tv_layout_count") ?? 1);
    return ([1, 2, 3, 4].includes(n) ? n : 1) as ChartLayoutType;
  });

  const [activeChartSlot, setActiveChartSlot] = useState(0);

  // Per-slot symbol + interval tracking for secondary chart panels
  const [slotSymbols,   setSlotSymbols]   = useState<string[]>(["ETHUSD", "SOLUSD", "DOGEUSD"]);
  const [slotIntervals, setSlotIntervals] = useState<string[]>(() => [interval, interval, interval]);

  // Seed slot symbols once from watchlist (excluding the primary symbol)
  const slotInitRef = useRef(false);
  useEffect(() => {
    if (slotInitRef.current || watchlistItems.length === 0) return;
    slotInitRef.current = true;
    const candidates = watchlistItems.filter(w => w.symbol !== activeKey);
    setSlotSymbols([
      candidates[0]?.symbol ?? "ETHUSD",
      candidates[1]?.symbol ?? "SOLUSD",
      candidates[2]?.symbol ?? "DOGEUSD",
    ]);
  }, [watchlistItems.length]); // eslint-disable-line

  const [syncTF, setSyncTF] = useState<boolean>(() => localStorage.getItem("tv_sync_tf") === "1");

  // ── Bar Replay state ──────────────────────────────────────────────────────
  type ReplayPhase = "off" | "selecting" | "active";
  const [replayPhase,    setReplayPhase]    = useState<ReplayPhase>("off");
  const [replayAllBars,  setReplayAllBars]  = useState<OHLCBar[]>([]);
  const [replayIdx,      setReplayIdx]      = useState(0);
  const [replayPlaying,  setReplayPlaying]  = useState(false);
  const [replaySpeed,    setReplaySpeed]    = useState(1);
  const [replayLoading,  setReplayLoading]  = useState(false);
  const replayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const exitReplay = useCallback(() => {
    setReplayPhase("off");
    setReplayAllBars([]);
    setReplayIdx(0);
    setReplayPlaying(false);
  }, []);

  const enterReplay = useCallback(async () => {
    if (replayPhase !== "off") { exitReplay(); return; }
    setReplayLoading(true);
    try {
      const resp = await fetch(`${BASE}/api/candles/${activeKey}/${interval}`);
      if (!resp.ok) throw new Error("fetch failed");
      const raw = toArray<OHLCBar>(await resp.json(), "charts.enterReplay:/api/candles");
      const bars = [...new Map(raw.map(b => [b.time, b])).values()].sort((a, b) => a.time - b.time);
      if (bars.length === 0) { toast("No data for replay"); return; }
      setReplayAllBars(bars);
      setReplayPhase("selecting");
    } catch {
      toast("Failed to load replay data");
    } finally {
      setReplayLoading(false);
    }
  }, [replayPhase, exitReplay, activeKey, interval]);

  // Auto-play timer
  useEffect(() => {
    if (!replayPlaying || replayPhase !== "active") return;
    const ms = Math.round(1000 / replaySpeed);
    replayIntervalRef.current = setInterval(() => {
      setReplayIdx(prev => {
        if (prev >= replayAllBars.length - 1) {
          setReplayPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, ms);
    return () => {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, [replayPlaying, replaySpeed, replayPhase, replayAllBars.length]);

  // Keyboard: Escape exits replay, Left/Right arrow steps
  useEffect(() => {
    if (replayPhase === "off") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { exitReplay(); return; }
      if (replayPhase !== "active") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setReplayIdx(prev => Math.min(prev + 1, replayAllBars.length - 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setReplayIdx(prev => Math.max(prev - 1, 0));
      }
      if (e.key === " ") {
        e.preventDefault();
        setReplayPlaying(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replayPhase, replayAllBars.length, exitReplay]);

  // The bar slice passed to CustomChart during active replay
  const replayBarSlice = useMemo<OHLCBar[] | null>(() => {
    if (replayPhase !== "active") return null;
    return replayAllBars.slice(0, replayIdx + 1);
  }, [replayPhase, replayAllBars, replayIdx]);

  const handleSyncTFChange = useCallback((v: boolean) => {
    setSyncTF(v);
    localStorage.setItem("tv_sync_tf", v ? "1" : "0");
  }, []);

  const handleLayoutChange = useCallback((n: ChartLayoutType) => {
    setLayoutCount(n);
    localStorage.setItem("tv_layout_count", String(n));
    setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
  }, []);

  // useCallback: stable references prevent ChartSettingsSheet's `p` callback
  // from getting a new reference on every chart.tsx re-render, which would
  // cause ALL ColorBoxes / Toggles in the settings sheet to re-render.
  const handleSettings = useCallback((s: ChartSettings) => {
    setChartSettings(s);
  }, []);

  const handleSaveAsDefault = useCallback((s: ChartSettings) => {
    setChartSettings(s);
  }, []);

  const currentPrice  = activeTick?.price ?? null;
  const prevAlertCount = useRef(0);

  // NOTE: the old layout→chartStore sync effect has been removed.
  // chartStore IS the single source of truth; no bridging effect needed.

  // ── Resize drag state ─────────────────────────────────────────────────────
  const dragging      = useRef(false);
  const dragStartY    = useRef(0);
  const dragStartH    = useRef(0);
  const dragAnimFrame = useRef(0);
  const toolbarRef    = useRef<HTMLDivElement>(null);

  // ── Topbar: mouse-wheel → horizontal scroll (trackpad + scroll wheel) ──────
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    let velocity = 0;
    let rafId = 0;
    const tick = () => {
      if (Math.abs(velocity) < 0.5) { velocity = 0; return; }
      el.scrollLeft += velocity;
      velocity *= 0.88;
      rafId = requestAnimationFrame(tick);
    };
    const onWheel = (e: WheelEvent) => {
      // Only intercept when the delta is primarily vertical (mouse wheel)
      // Trackpads emit deltaX natively — honour them directly
      const isTrackpadHorz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (isTrackpadHorz) return; // let native horizontal scroll work
      e.preventDefault();
      e.stopPropagation();
      velocity += e.deltaY * 0.6;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const [isDragging, setIsDragging] = useState(false);

  const sym = getEntry(activeKey, watchlistItems);
  const livePriceDisplay = activeTick?.price ?? useChartStore.getState().livePrice;
  const liveChangePct = activeTick?.changePct ?? 0;
  const isUp = liveChangePct >= 0;

  // selectSymbol: chartStore.setSymbol is the single write path (persists to localStorage).
  // layout is updated only to keep market in sync for DB persistence.
  // No self-guard ref or subscription needed — charts.tsx reads activeKey directly
  // from chartStore via useChartStore(s => s.symbol), so external changes (Markets page,
  // named layouts, watchlist) are picked up automatically by the Zustand selector.
  const selectSymbol = useCallback((key: string) => {
    const e = watchlistItems.find(i => i.symbol === key);
    const market = e?.market ?? layout.market;
    useChartStore.getState().setSymbol(key); // single source of truth + localStorage
    if (e) localStorage.setItem("tv_market", market);
    setLayout(prev => ({ ...prev, symbol: key, market }));
    saveToDb({ symbol: key, market });
  }, [watchlistItems, layout.market, setLayout, saveToDb]);

  const selectInterval = useCallback((v: string) => {
    useChartStore.getState().setInterval(v); // single source of truth + localStorage
    setLayout(prev => ({ ...prev, interval: v }));
    saveToDb({ interval: v });
  }, [setLayout, saveToDb]);

  // ── Slot-aware interval/symbol handlers ───────────────────────────────────
  // FIX: previously selectInterval/selectSymbol were called directly from all
  // toolbar actions, hardwiring them to the main chart regardless of which
  // chart panel the user had tapped. These handlers route to the correct slot.
  const handleSlotSelectInterval = useCallback((v: string) => {
    console.log(`[ChartSelect] Timeframe Change Target: slot=${activeChartSlot} tf=${v}`);
    if (activeChartSlot === 0 || layoutCount <= 1) {
      selectInterval(v);
    } else {
      setSlotIntervals(prev => {
        const next = [...prev]; next[activeChartSlot - 1] = v; return next;
      });
    }
  }, [activeChartSlot, layoutCount, selectInterval]);

  const handleSlotSelectSymbol = useCallback((key: string) => {
    console.log(`[ChartSelect] Symbol Change Target: slot=${activeChartSlot} sym=${key}`);
    if (activeChartSlot === 0 || layoutCount <= 1) {
      selectSymbol(key);
    } else {
      setSlotSymbols(prev => {
        const next = [...prev]; next[activeChartSlot - 1] = key; return next;
      });
    }
  }, [activeChartSlot, layoutCount, selectSymbol]);

  const TF_FAV_KEY = "tj_tf_favorites_v1";
  const DEFAULT_FAVS = ["1", "5", "15", "30", "60", "240", "D", "W"];
  const [tfFavorites, setTfFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(TF_FAV_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : null;
      return Array.isArray(parsed) && parsed.length > 0 ? sortTFs(parsed) : sortTFs(DEFAULT_FAVS);
    } catch { return sortTFs(DEFAULT_FAVS); }
  });

  const updateFavorites = useCallback((favs: string[]) => {
    setTfFavorites(favs);
    localStorage.setItem(TF_FAV_KEY, JSON.stringify(favs));
  }, []);

  const toggleBottom = useCallback(() => {
    setLayout(prev => {
      const next = !prev.bottomOpen;
      saveToDb({ bottomOpen: next });
      localStorage.setItem("tv_bot", String(next));
      setTimeout(() => window.dispatchEvent(new Event("resize")), 300);
      return { ...prev, bottomOpen: next };
    });
  }, [setLayout, saveToDb]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const onDragStart = useCallback((clientY: number) => {
    dragging.current = true;
    dragStartY.current = clientY;
    dragStartH.current = bottomH;
    setIsDragging(true);
  }, [bottomH]);

  useEffect(() => {
    const onMove = (clientY: number) => {
      if (!dragging.current) return;
      cancelAnimationFrame(dragAnimFrame.current);
      dragAnimFrame.current = requestAnimationFrame(() => {
        const delta = dragStartY.current - clientY;
        const newH = Math.max(BOTTOM_MIN, Math.min(BOTTOM_MAX, dragStartH.current + delta));
        setLayout(prev => ({ ...prev, bottomHeight: newH }));
      });
    };
    const onEnd = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setIsDragging(false);
      cancelAnimationFrame(dragAnimFrame.current);
      localStorage.setItem("tv_botH", String(bottomH));
      saveToDb({ bottomHeight: bottomH });
      window.dispatchEvent(new Event("resize"));
    };
    const pm = (e: PointerEvent) => onMove(e.clientY);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [bottomH]); // eslint-disable-line

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  useEffect(() => {
    if (alertEvents.length > prevAlertCount.current) {
      const ev = alertEvents[0];
      const condLabel = ev.conditionLabel ?? ev.condition.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const dtLabel = ev.drawingType?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? "Alert";
      const isUpEv = ev.direction?.includes("above") || ev.condition.includes("above") || ev.condition.includes("cross_above");
      const isDownEv = ev.direction?.includes("below") || ev.condition.includes("below") || ev.condition.includes("cross_below");
      playAlertSound(isUpEv ? "up" : isDownEv ? "down" : "neutral");
      toast(
        `${isUpEv ? "🟢" : isDownEv ? "🔴" : "🔔"} ${dtLabel} — ${condLabel}`,
        {
          description: `${ev.symbol} · ${fmtPrice(ev.triggeredPrice, ev.symbol)}`,
          duration: 8000,
          action: {
            label: "View",
            onClick: () => { setBottomTab("Positions"); if (!bottomOpen) toggleBottom(); },
          },
        }
      );
    }
    prevAlertCount.current = alertEvents.length;
  }, [alertEvents, bottomOpen, toggleBottom]);

  const bottomTotalH = bottomOpen ? HANDLE_H + bottomH : HANDLE_H;

  // ── Screenshot / Snapshot ─────────────────────────────────────────────────
  const handleScreenshot = useCallback(async () => {
    const el = chartAreaRef.current;
    if (!el) { toast("Chart area not ready"); return; }
    const filename = `tradevault-${activeKey}-${interval}-${Date.now()}.png`;
    // Force high-DPI export — minimum 3× regardless of screen pixel ratio
    const EXPORT_SCALE = Math.max(window.devicePixelRatio || 1, 3);

    // Primary: html2canvas — captures canvas + SVG overlays + DOM elements
    try {
      const captured = await html2canvas(el, {
        backgroundColor: "#07110D",
        useCORS: true,
        allowTaint: true,
        scale: EXPORT_SCALE,
        logging: false,
        imageTimeout: 15000,
      });
      captured.toBlob(blob => {
        if (!blob) { toast("Snapshot failed"); return; }
        const url = URL.createObjectURL(blob);
        setSnapshotPreview({ show: true, url, filename });
      }, "image/png", 1.0);
      return;
    } catch (err) {
      console.warn("html2canvas failed, using canvas-layer fallback:", err);
    }

    // Fallback: direct canvas-layer merge (candles + price scale only)
    try {
      const elRect = el.getBoundingClientRect();
      const W = Math.round(elRect.width);
      const H = Math.round(elRect.height);
      const out = document.createElement("canvas");
      out.width  = W * EXPORT_SCALE;
      out.height = H * EXPORT_SCALE;
      const ctx  = out.getContext("2d")!;
      ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
      ctx.fillStyle = "#07110D";
      ctx.fillRect(0, 0, W, H);
      el.querySelectorAll<HTMLCanvasElement>("canvas").forEach(c => {
        const cr = c.getBoundingClientRect();
        try { ctx.drawImage(c, cr.left - elRect.left, cr.top - elRect.top, cr.width, cr.height); } catch { /* tainted — skip */ }
      });
      out.toBlob(blob => {
        if (!blob) { toast("Snapshot failed"); return; }
        const url = URL.createObjectURL(blob);
        setSnapshotPreview({ show: true, url, filename });
      }, "image/png", 1.0);
    } catch (err) {
      console.error("Snapshot fallback error:", err);
      toast("Snapshot failed — please try again");
    }
  }, [activeKey, interval]);

  // ── Copy Live Chart Link ──────────────────────────────────────────────────
  const handleCopyLiveLink = useCallback(() => {
    const chartStore = useChartStore.getState();
    const base = window.location.origin + (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const params = new URLSearchParams({
      symbol: activeKey,
      tf:     interval,
      type:   chartStore.chartType ?? "candles",
      theme:  "dark",
    });
    const url = `${base}/charts?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      toast("Live chart link copied");
    }).catch(() => {
      toast("Copy failed — clipboard not available");
    });
  }, [activeKey, interval]);

  // ── Named layouts ─────────────────────────────────────────────────────────────
  const { layouts: namedLayouts, saveLayout, renameLayout, deleteLayout, activeLayoutId, setActiveLayoutId } = useNamedLayouts();

  const handleSaveNamedLayout = useCallback((name: string) => {
    const store = useChartStore.getState();
    saveLayout({
      name,
      symbol: activeKey,
      interval,
      chartType: store.chartType,
      indicators: store.indicators,
      chartSettings,
      layoutCount,
    });
    toast(`Layout "${name}" saved`);
  }, [saveLayout, activeKey, interval, chartSettings, layoutCount]);

  const handleLoadNamedLayout = useCallback((layoutData: NamedLayout) => {
    console.log("[loadLayout] CALLED — Selected Layout ID:", layoutData.id, "| Current Active Layout ID:", activeLayoutId, "| layout name:", layoutData.name);
    const store = useChartStore.getState();

    console.log("[loadLayout] step 1 — setChartType:", layoutData.chartType);
    store.setChartType(layoutData.chartType);

    console.log("[loadLayout] step 2 — setIndicators:", layoutData.indicators);
    (Object.keys(layoutData.indicators) as (keyof typeof layoutData.indicators)[]).forEach(key => {
      store.setIndicator(key, layoutData.indicators[key]);
    });

    console.log("[loadLayout] step 3 — selectSymbol:", layoutData.symbol);
    selectSymbol(layoutData.symbol);

    console.log("[loadLayout] step 4 — selectInterval:", layoutData.interval);
    selectInterval(layoutData.interval);

    console.log("[loadLayout] step 5 — handleSettings:", layoutData.chartSettings);
    handleSettings(layoutData.chartSettings);

    console.log("[loadLayout] step 6 — handleLayoutChange:", layoutData.layoutCount);
    handleLayoutChange(layoutData.layoutCount as ChartLayoutType);

    setActiveLayoutId(layoutData.id);
    console.log("[loadLayout] COMPLETE — Stored Layout ID set to:", layoutData.id);
    toast(`Layout "${layoutData.name}" loaded`);
  }, [selectSymbol, selectInterval, handleSettings, handleLayoutChange, activeLayoutId, setActiveLayoutId]);

  // ── Mobile layout early-return ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <MobileChartLayout
        activeKey={activeKey}
        interval={interval}
        selectInterval={selectInterval}
        selectSymbol={selectSymbol}
        chartSettings={chartSettings}
        handleSettings={handleSettings}
        handleSaveAsDefault={handleSaveAsDefault}
        replayBarSlice={replayBarSlice}
        alertDrawingIds={alertDrawingIds}
        handleDrawingAlert={handleDrawingAlert}
        addAlertDrawingId={addAlertDrawingId}
        showIndicators={showIndicators}
        setShowIndicators={setShowIndicators}
        showAlertCenter={showAlertCenter}
        setShowAlertCenter={setShowAlertCenter}
        showQuickAlert={showQuickAlert}
        setShowQuickAlert={setShowQuickAlert}
        alertDrawing={alertDrawing}
        closeAlertModal={closeAlertModal}
        openSidebar={openSidebar}
        handleScreenshot={handleScreenshot}
        chartAreaRef={chartAreaRef}
        onBarReplay={enterReplay}
        layoutCount={layoutCount}
        onLayoutChange={handleLayoutChange}
        syncTF={syncTF}
        onSyncTFChange={handleSyncTFChange}
        namedLayouts={namedLayouts}
        defaultLayoutName={`${activeKey} ${tfLabel(interval)}`}
        onSaveNamedLayout={handleSaveNamedLayout}
        onLoadNamedLayout={handleLoadNamedLayout}
        onRenameNamedLayout={renameLayout}
        onDeleteNamedLayout={deleteLayout}
        activeLayoutId={activeLayoutId}
      />
    );
  }

  // ── Toolbar icon button style (TradingView flat style) ───────────────────────────
  const tbBtn = (active = false, disabled = false): React.CSSProperties => ({
    height: 34, minWidth: 34, borderRadius: 4, padding: "0 8px",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
    cursor: disabled ? "default" : "pointer", flexShrink: 0,
    transition: "background 0.12s",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    border: "none",
    boxShadow: "none",
    opacity: disabled ? 0.35 : 1,
  });

  const tbDivider = (
    <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.35)", flexShrink: 0, margin: "0 6px" }} />
  );

  return (
    <PageTransition>
      <div className="flex flex-col" style={{
        height: "100%", background: "#0a0a0a",
        cursor: isDragging ? "ns-resize" : "default",
        userSelect: isDragging ? "none" : "auto",
      }}>

        {/* ── TOP TOOLBAR — TradingView flat style ── */}
      <div ref={toolbarRef} style={{
        height: 52, display: "flex", alignItems: "center",
        background: "#0a0a0a",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "none",
        borderRadius: 0,
        margin: 0,
        paddingLeft: 6,
        paddingRight: 10,
        flexShrink: 0, position: "relative", gap: 2,
        overflowX: "auto", overflowY: "visible",
        scrollbarWidth: "none",
      }}>

        {/* Menu button — opens sidebar overlay */}
        <button
          onClick={openSidebar}
          style={{
            width: 34, height: 34, borderRadius: 4, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none",
            cursor: "pointer", transition: "background 0.12s",
            marginRight: 4,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <Menu style={{ width: 16, height: 16, color: "#ffffff" }} />
        </button>

        {/* Timeframes (favorites-driven) + dropdown */}
        <div style={{ display: "flex", gap: 1, alignItems: "center", flexShrink: 0 }}>
          {tfFavorites.map(v => {
            const active = v === interval;
            return (
              <button key={v} onClick={() => handleSlotSelectInterval(v)}
                style={{
                  padding: "0 5px", height: 34, borderRadius: 4,
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                  color: "#ffffff",
                  border: "none",
                  boxShadow: "none",
                  cursor: "pointer", transition: "background 0.12s", flexShrink: 0,
                }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; } }}
              >
                {tfLabel(v)}
              </button>
            );
          })}
          <TFDropdown
            interval={interval}
            favorites={tfFavorites}
            onSelect={handleSlotSelectInterval}
            onFavoritesChange={updateFavorites}
          />
        </div>

        {tbDivider}

        {/* Chart type */}
        <div style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }}>
          {([
            { type: "candles"          as ChartType, src: icoCandlesticks, label: "Candlesticks" },
            { type: "heikin_ashi"      as ChartType, src: icoHeikinAshi,   label: "Heikin Ashi" },
            { type: "line"             as ChartType, src: icoLine,          label: "Line" },
            { type: "line_with_markers" as ChartType, src: icoLineMarkers,  label: "Line With Markers" },
          ]).map(({ type, src, label }) => {
            const active = useChartStore.getState().chartType === type;
            return (
              <button key={type} onClick={() => useChartStore.getState().setChartType(type)}
                title={label}
                style={tbBtn(active)}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <img src={src} width={22} height={22} style={{ width: 22, height: 22, display: "block", filter: "brightness(0) invert(1)" }} alt={label} draggable={false} />
              </button>
            );
          })}
        </div>

        {tbDivider}

        {/* Indicators */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            ref={indicatorsBtnRef}
            title="Indicators"
            onClick={() => { setShowIndicators(v => !v); setShowSettings(false); }}
            style={{ ...tbBtn(showIndicators), touchAction: "manipulation", gap: 4, padding: "0 7px" }}
            onMouseEnter={e => { if (!showIndicators) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={e => { if (!showIndicators) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <img src={icoIndicator} width={23} height={23} style={{ width: 23, height: 23, display: "block", filter: "brightness(0) invert(1)", flexShrink: 0 }} alt="Indicators" draggable={false} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#ffffff", letterSpacing: "0.01em" }}>Indicators</span>
            <ChevronDown style={{ width: 11, height: 11, color: "rgba(255,255,255,0.55)", flexShrink: 0 }} />
          </button>
          {showIndicators && (
            <IndicatorsPanel
              anchorEl={indicatorsBtnRef.current}
              onClose={() => setShowIndicators(false)}
            />
          )}
        </div>

        {/* Alert */}
        <button
          title="Alert"
          onClick={() => setShowQuickAlert(true)}
          style={tbBtn(false)}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <img src={icoAlert} width={25} height={25} style={{ width: 25, height: 25, display: "block", filter: "brightness(0) invert(1)" }} alt="Alert" draggable={false} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#ffffff" }}>Alert</span>
        </button>

        {/* Replay */}
        <button
          title="Bar Replay"
          onClick={() => { void enterReplay(); }}
          disabled={replayLoading}
          style={tbBtn(replayPhase !== "off")}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = replayPhase !== "off" ? "rgba(255,255,255,0.12)" : "transparent"; }}
        >
          <img src={icoReplay} width={23} height={23} style={{ width: 23, height: 23, display: "block", filter: "brightness(0) invert(1)", animation: replayLoading ? "spin 1s linear infinite" : "none" }} alt="Replay" draggable={false} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#ffffff" }}>Replay</span>
        </button>

        {tbDivider}

        {/* Undo */}
        <button
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => undo()}
          style={tbBtn(false, !canUndo)}
          onMouseEnter={e => { if (canUndo) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <Undo2 style={{ width: 16, height: 16, color: "#ffffff" }} />
        </button>

        {/* Redo */}
        <button
          title="Redo (Ctrl+Y)"
          disabled={!canRedo}
          onClick={() => redo()}
          style={tbBtn(false, !canRedo)}
          onMouseEnter={e => { if (canRedo) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <Redo2 style={{ width: 16, height: 16, color: "#ffffff" }} />
        </button>

        {tbDivider}
        <BrokerTabs />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* RIGHT SECTION */}

        {/* Broker Connect/Manage button — always opens broker management modal */}
        <button
          onClick={openSelectModal}
          title={activeAccount ? "Manage broker connection" : "Connect a broker"}
          style={{
            height: 34, padding: "0 12px", borderRadius: 8, cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 6,
            background: activeAccount
              ? brokerStatus === "connected" ? "rgba(74,222,128,0.12)" : "rgba(245,158,11,0.12)"
              : "rgba(183,255,90,0.08)",
            border: `1px solid ${activeAccount
              ? brokerStatus === "connected" ? "rgba(74,222,128,0.3)" : "rgba(245,158,11,0.3)"
              : "rgba(183,255,90,0.2)"}`,
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = activeAccount
            ? brokerStatus === "connected" ? "rgba(74,222,128,0.2)" : "rgba(245,158,11,0.2)"
            : "rgba(183,255,90,0.15)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = activeAccount
            ? brokerStatus === "connected" ? "rgba(74,222,128,0.12)" : "rgba(245,158,11,0.12)"
            : "rgba(183,255,90,0.08)"; }}
        >
          {activeAccount ? (
            <>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: brokerStatus === "connected" ? "#4ade80" : "#f59e0b",
                boxShadow: `0 0 5px ${brokerStatus === "connected" ? "#4ade80" : "#f59e0b"}`,
              }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: brokerStatus === "connected" ? "#4ade80" : "#f59e0b" }}>
                {activeAccount.broker_id === "delta" ? "Δ Delta" : "MT5"}
              </span>
            </>
          ) : (
            <>
              <Plug style={{ width: 13, height: 13, color: "rgba(183,255,90,0.75)" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(183,255,90,0.75)" }}>Connect Broker</span>
            </>
          )}
        </button>

        {tbDivider}
        <ConnectionStatus compact />

        {/* Trade */}
        <button onClick={() => setShowBuySell(v => !v)}
          style={{
            height: 40, padding: "0 16px", borderRadius: 12, cursor: "pointer", flexShrink: 0,
            background: showBuySell ? "rgba(183,255,90,0.18)" : "rgba(183,255,90,0.10)",
            border: `1px solid ${showBuySell ? "rgba(183,255,90,0.45)" : "rgba(183,255,90,0.22)"}`,
            boxShadow: showBuySell ? "0 0 16px rgba(183,255,90,0.22)" : "none",
            transition: "background 0.15s, box-shadow 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.18)"; }}
          onMouseLeave={e => { if (!showBuySell) (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.10)"; }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: showBuySell ? "#B7FF5A" : "rgba(183,255,90,0.85)" }}>Trade</span>
        </button>
      </div>

      {/* ── Main body ── */}
      <div className="flex flex-1 min-h-0" style={{ paddingBottom: bottomTotalH, touchAction: "none" }}>

        {/* Chart area — flex row so toolbar never overlaps price scale */}
        <div className="flex-1 min-w-0 flex relative" style={{ background: "#07110D", touchAction: "none", overflow: "hidden" }}>

          {/* ── LEFT: Drawing toolbar — always visible in all layouts ── */}
          <DrawingToolbar />

          {/* ── Chart content column ── always position:relative so absolute children fill it ── */}
          <div
            ref={chartAreaRef}
            style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden", touchAction: "none", overscrollBehavior: "none" }}
            onContextMenu={handleChartContextMenu}
          >

            {/* ── Applied indicator tags (top-left, TradingView style) ── */}
            {/* topOffset pushes tags below the floating symbol panel (≈72px) in single-chart mode */}
            <IndicatorTags topOffset={layoutCount === 1 ? 72 : 8} />

            {/* ── Feed diagnostics overlay (bottom-left corner) ── */}
            {layoutCount === 1 && <FeedDiagnostics symbol={activeKey} />}


            {/* ── Floating symbol info overlay — glassmorphism panel above candles ── */}
            {layoutCount === 1 && (
              <div style={{
                position: "absolute", top: 10, left: 10, zIndex: 10,
                pointerEvents: "none",
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 14px",
                background: "rgba(10,18,14,0.45)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                borderRadius: 12,
                border: "1px solid rgba(183,255,90,0.14)",
                boxShadow: "0 0 24px rgba(183,255,90,0.04), 0 4px 20px rgba(0,0,0,0.45)",
                willChange: "transform",
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: "rgba(183,255,90,0.14)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 900, color: "#B7FF5A",
                }}>{sym.badge.slice(0, 4)}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#F3FFF3", margin: 0, lineHeight: 1.2 }}>{sym.badge}</p>
                  {livePriceDisplay !== null && (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 800, color: "#F3FFF3" }}>
                        {fmtPrice(livePriceDisplay, activeKey)}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isUp ? "#B7FF5A" : "#ef4444" }}>
                        {isUp ? "▲" : "▼"} {Math.abs(liveChangePct).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginLeft: 2,
                  background: connected ? "#60a5fa" : "#f87171",
                  boxShadow: connected ? "0 0 6px #60a5fa" : "none",
                }} />
              </div>
            )}


            {/* ── Panel border overlay — rendered above chart canvas, no pointer events ── */}
            {chartSettings.panelBorderVisible !== false && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none",
                border: `${chartSettings.panelBorderThickness ?? 1}px solid ${chartSettings.panelBorderColor ?? "rgba(255,255,255,0.22)"}`,
                boxShadow: "inset 0 0 10px rgba(255,255,255,0.04)",
              }} />
            )}

            {/* Inner absolutely-pinned container — used as CSS grid root in multi-chart mode.
                position:absolute + inset:0 gives it explicit pixel dimensions so 1fr rows resolve. */}
            <div style={{
              position: "absolute", inset: 0,
              ...(layoutCount > 1 ? {
                display: "grid",
                gridTemplateColumns: layoutCount === 3 ? "2fr 1fr" : "1fr 1fr",
                gridTemplateRows: layoutCount >= 3 ? "1fr 1fr" : "1fr",
                gap: 2,
                background: "rgba(57,91,67,0.15)",
              } : {}),
            }}>

              {/* Single chart layout */}
              {layoutCount === 1 && (
                <CustomChart settings={chartSettings} replayBars={replayBarSlice}>
                  <DrawingOverlay
                    symbol={activeKey}
                    timeframe={interval}
                    onDrawingAlert={handleDrawingAlert}
                    alertDrawingIds={alertDrawingIds}
                  />
                  <IndicatorRenderer />
                  <CustomIndicatorRenderer />
                </CustomChart>
              )}

              {/* Multi chart layout — grid items */}
              {layoutCount > 1 && (
                <>
                  {/* Slot 0: main chart (spans both rows in 3-chart layout) */}
                  <div
                    onPointerDownCapture={() => {
                      console.log("[PANE TAP]", 0);
                      setActiveChartSlot(0);
                      console.log("[ACTIVE CHART]", 0);
                    }}
                    style={{
                      position: "relative", overflow: "hidden", minHeight: 0,
                      gridRow: layoutCount === 3 ? "1 / 3" : undefined,
                      cursor: "pointer",
                      outline: activeChartSlot === 0
                        ? "2px solid #38bdf8"
                        : "1px solid rgba(255,255,255,0.06)",
                      outlineOffset: "-1px",
                      boxShadow: activeChartSlot === 0
                        ? "0 0 0 4px rgba(56,189,248,0.18)"
                        : "none",
                      zIndex: activeChartSlot === 0 ? 2 : 1,
                      transition: "outline 0.15s, box-shadow 0.15s",
                    }}
                  >
                    <CustomChart settings={chartSettings} replayBars={replayBarSlice}>
                      <DrawingOverlay
                        symbol={activeKey}
                        timeframe={interval}
                        onDrawingAlert={handleDrawingAlert}
                        alertDrawingIds={alertDrawingIds}
                      />
                      <IndicatorRenderer />
                      <CustomIndicatorRenderer />
                    </CustomChart>
                  </div>

                  {/* Extra MiniChart slots — full engine with DrawingOverlay + indicators */}
                  {Array.from({ length: layoutCount - 1 }).map((_, i) => (
                    <div
                      key={i}
                      onPointerDownCapture={() => {
                        console.log("[PANE TAP]", i + 1);
                        setActiveChartSlot(i + 1);
                        console.log("[ACTIVE CHART]", i + 1);
                      }}
                      style={{
                        position: "relative", overflow: "hidden", minHeight: 0,
                        cursor: "pointer",
                        outline: activeChartSlot === i + 1
                          ? "2px solid #38bdf8"
                          : "1px solid rgba(255,255,255,0.06)",
                        outlineOffset: "-1px",
                        boxShadow: activeChartSlot === i + 1
                          ? "0 0 0 4px rgba(56,189,248,0.18)"
                          : "none",
                        zIndex: activeChartSlot === i + 1 ? 2 : 1,
                        transition: "outline 0.15s, box-shadow 0.15s",
                      }}
                    >
                      <MiniChart
                        defaultSymbol={slotSymbols[i] ?? "ETHUSD"}
                        defaultInterval={interval}
                        syncedInterval={syncTF ? interval : undefined}
                        controlledInterval={syncTF ? undefined : slotIntervals[i]}
                        controlledSymbol={slotSymbols[i]}
                        settings={chartSettings}
                        onSymbolChange={sym => setSlotSymbols(prev => { const n = [...prev]; n[i] = sym; return n; })}
                        onIntervalChange={iv => setSlotIntervals(prev => { const n = [...prev]; n[i] = iv; return n; })}
                      >
                        <DrawingOverlay
                          symbol={slotSymbols[i] ?? "ETHUSD"}
                          timeframe={syncTF ? interval : (slotIntervals[i] ?? interval)}
                          onDrawingAlert={handleDrawingAlert}
                          alertDrawingIds={alertDrawingIds}
                        />
                        <IndicatorRenderer />
                        <CustomIndicatorRenderer />
                      </MiniChart>
                    </div>
                  ))}
                </>
              )}

              {showSettings && (
                <SettingsPanel
                  settings={chartSettings}
                  onChange={handleSettings}
                  onSaveAsDefault={handleSaveAsDefault}
                  onClose={() => setShowSettings(false)} />
              )}

              {showBuySell && (
                <div style={{ position: "absolute", top: 12, right: 12, zIndex: 30, pointerEvents: "all" }}>
                  <BuySellPanel
                    symbol={activeKey}
                    currentPrice={currentPrice}
                    onClose={() => setShowBuySell(false)} />
                </div>
              )}

              {/* ── Broker Place Order floating panel ── */}
              {showPlaceOrder && activeAccount && (
                <div style={{ position: "absolute", top: 12, right: 12, zIndex: 30, pointerEvents: "all" }}>
                  <PlaceOrderPanel symbol={activeKey} />
                </div>
              )}

              {/* ── Replay: draggable start-line selector ── */}
              {replayPhase === "selecting" && (
                <ReplaySelector
                  replayAllBars={replayAllBars}
                  onConfirm={idx => {
                    setReplayIdx(idx);
                    setReplayPhase("active");
                    setReplayPlaying(false);
                  }}
                  onCancel={exitReplay}
                />
              )}

              {/* ── Replay: controls bar (active phase) ── */}
              {replayPhase === "active" && (
                <ReplayControls
                  currentBar={replayAllBars[replayIdx] ?? null}
                  playing={replayPlaying}
                  speed={replaySpeed}
                  currentIdx={replayIdx}
                  totalBars={replayAllBars.length}
                  interval={interval}
                  onPlay={() => setReplayPlaying(true)}
                  onPause={() => setReplayPlaying(false)}
                  onStepBack={() => { setReplayPlaying(false); setReplayIdx(prev => Math.max(prev - 1, 0)); }}
                  onStepForward={() => { setReplayPlaying(false); setReplayIdx(prev => Math.min(prev + 1, replayAllBars.length - 1)); }}
                  onSpeedChange={setReplaySpeed}
                  onExit={exitReplay}
                />
              )}

            </div>
          </div>

          {/* ── Chart context menu (right-click / long-press) ── */}
          <ChartContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            isOpen={ctxMenu.open}
            onClose={closeCtxMenu}
            onScreenshot={handleScreenshot}
            onShowSettings={() => setShowSettings(true)}
            onSelectInterval={selectInterval}
          />

          {/* ── Broker side panels (desktop: fixed-width column; mobile: via bottom sheet below) ── */}
          {(showPositions || showOrders) && activeAccount && !isMobile && (
            <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(57,91,67,0.2)", overflow: "hidden" }}>
              {showPositions && <PositionsList />}
              {showOrders && <OrdersList />}
            </div>
          )}

          {/* ── Right toolbar column (52px) — slide panels are absolute relative to the flex parent above ── */}
          {!showSelectModal && !showAuthModal && (
            <RightToolbar
              activeSymbol={activeKey}
              activeTimeframe={interval}
              alertCount={activeAlertsCount}
              onSelectSymbol={handleSlotSelectSymbol}
              layoutCount={layoutCount}
              onLayoutChange={handleLayoutChange}
              syncTF={syncTF}
              onSyncTFChange={handleSyncTFChange}
              namedLayouts={namedLayouts}
              defaultLayoutName={`${activeKey} ${tfLabel(interval)}`}
              onSaveNamedLayout={handleSaveNamedLayout}
              onLoadNamedLayout={handleLoadNamedLayout}
              onRenameNamedLayout={renameLayout}
              onDeleteNamedLayout={deleteLayout}
              activeLayoutId={activeLayoutId}
              onAlertClick={() => setShowAlertCenter(true)}
              onScreenshot={handleScreenshot}
              onCopyLiveLink={handleCopyLiveLink}
              onFullscreen={toggleFullscreen}
              onSettings={() => { setShowSettings(v => !v); setShowIndicators(false); }}
              isFullscreen={isFullscreen}
              showSettings={showSettings}
            />
          )}
        </div>
      </div>

      {/* ── Broker Status Bar ── */}
      <BrokerStatusBar />

      {/* ── Bottom panel ── */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col"
        style={{
          height: bottomTotalH,
          background: "rgba(6,12,9,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(183,255,90,0.1)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.45), 0 -1px 0 rgba(183,255,90,0.04) inset",
          zIndex: 10,
        }}>

        <div className="shrink-0 flex items-center px-2 gap-1"
          style={{ height: HANDLE_H, borderBottom: bottomOpen ? "1px solid rgba(57,91,67,0.12)" : "none" }}>

          {/* Drag handle */}
          <button
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onDragStart(e.clientY); }}
            className="cursor-ns-resize p-1 rounded hover:bg-white/[0.05] transition-colors shrink-0"
            style={{ touchAction: "none", userSelect: "none" }}>
            <GripHorizontal className="w-3 h-3" style={{ color: "rgba(167,184,169,0.28)" }} />
          </button>

          {/* Tabs — left aligned */}
          <div className="flex gap-0.5">
            {BOTTOM_TABS.map(tab => {
              const active = bottomTab === tab && bottomOpen;
              return (
                <button key={tab} onClick={() => { setBottomTab(tab); if (!bottomOpen) toggleBottom(); }}
                  style={{
                    padding: "0 10px", height: 24, borderRadius: 6,
                    fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                    transition: "all 0.15s",
                    background: active ? "rgba(183,255,90,0.1)" : "transparent",
                    color: active ? "#B7FF5A" : "rgba(167,184,169,0.55)",
                    border: `1px solid ${active ? "rgba(183,255,90,0.22)" : "transparent"}`,
                    cursor: "pointer",
                  }}>
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Collapse toggle */}
          <button onClick={toggleBottom}
            className="ml-auto w-5 h-5 rounded flex items-center justify-center hover:bg-white/[0.06] transition-colors shrink-0">
            {bottomOpen
              ? <ChevronDown className="w-3 h-3" style={{ color: "rgba(167,184,169,0.45)" }} />
              : <ChevronUp   className="w-3 h-3" style={{ color: "rgba(167,184,169,0.45)" }} />}
          </button>
        </div>

        {bottomOpen && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <BottomContent
              tab={bottomTab} symbol={activeKey}
              currentInterval={interval} currentPrice={currentPrice} />
          </div>
        )}
      </div>

      {/* ── Snapshot Preview Popup ── */}
      {snapshotPreview.show && (
        <SnapshotPreviewPopup
          url={snapshotPreview.url}
          filename={snapshotPreview.filename}
          onClose={() => {
            URL.revokeObjectURL(snapshotPreview.url);
            setSnapshotPreview({ show: false, url: "", filename: "" });
          }}
        />
      )}

      {/* ── Alert Center Modal ── */}
      {showAlertCenter && (
        <AlertCenterModal onClose={() => setShowAlertCenter(false)} />
      )}

      {/* ── Broker Modals ── */}
      {showSelectModal && <BrokerSelectModal />}
      {showAuthModal && <BrokerAuthModal />}

      {/* ── Broker Mobile Bottom Sheet (positions / orders on mobile) ── */}
      {(showPositions || showOrders) && activeAccount && isMobile && (
        <div
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
            background: "rgba(5,12,9,0.98)",
            borderTop: "1px solid rgba(57,91,67,0.3)",
            borderRadius: "16px 16px 0 0",
            maxHeight: "55vh",
            display: "flex", flexDirection: "column",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(167,184,169,0.25)", margin: "10px auto 0" }} />
          <div style={{ flex: 1, overflowY: "auto" }}>
            {showPositions && <PositionsList />}
            {showOrders && <OrdersList />}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {(showQuickAlert || alertDrawing !== null) && (
        <DrawingAlertModal
          symbol={activeKey}
          currentInterval={interval}
          currentPrice={currentPrice}
          prefillDrawing={alertDrawing ?? undefined}
          onClose={closeAlertModal}
          onCreated={() => {
            if (alertDrawing) addAlertDrawingId(alertDrawing.id);
            closeAlertModal();
          }}
        />
      )}
    </div>
    </PageTransition>
  );
}
