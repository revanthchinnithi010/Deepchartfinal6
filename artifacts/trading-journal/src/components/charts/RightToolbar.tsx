import {
  memo, useState, useEffect, useRef, useCallback,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  List, Bell, LayoutGrid, Bookmark, Calculator,
  Eye, EyeOff, Lock, Trash2, Search, X,
  TrendingUp, ArrowRight, Minus, AlignCenter, Square, GitMerge,
  ChevronDown, ChevronRight, LayoutTemplate, Link2, Unlink2,
  Camera, Maximize2, Minimize2, Settings,
} from "lucide-react";
import { useDrawingStore } from "@/store/drawingStore";
import { type NamedLayout } from "@/hooks/useNamedLayouts";
import { fmtPrice } from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { BrokerWatchlist } from "@/components/charts/BrokerWatchlist";
import watchlistSvgUrl    from "@assets/watchlist1_1780332961307.svg";
import icoBellUrl         from "@assets/bell1_1780282162732.svg";
import icoObjectTreeUrl   from "@assets/objecttree1_1780282162698.svg";
import icoSettingsUrl     from "@assets/setting1_1780282162661.svg";
import icoCalculatorUrl   from "@assets/calculator1_1780282162626.svg";
import { motion, AnimatePresence } from "motion/react";
import { AnimatedList, AnimatedListItem } from "@/components/animations";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────
type PanelId = "watchlist" | "objects" | "layout" | null;

export type ChartLayoutType = 1 | 2 | 3 | 4;

export interface RightToolbarProps {
  activeSymbol:    string;
  activeTimeframe: string;
  alertCount:      number;
  onSelectSymbol:  (sym: string) => void;
  layoutCount:     ChartLayoutType;
  onLayoutChange:  (n: ChartLayoutType) => void;
  syncTF:          boolean;
  onSyncTFChange:  (v: boolean) => void;
  onAlertClick?:   () => void;
  onScreenshot?:   () => void;
  onCopyLiveLink?: () => void;
  onFullscreen?:   () => void;
  onSettings?:     () => void;
  isFullscreen?:   boolean;
  showSettings?:   boolean;
  namedLayouts:         NamedLayout[];
  defaultLayoutName:    string;
  onSaveNamedLayout:    (name: string) => void;
  onLoadNamedLayout:    (layout: NamedLayout) => void;
  onRenameNamedLayout:  (id: string, name: string) => void;
  onDeleteNamedLayout:  (id: string) => void;
  activeLayoutId:       string | null;
}

/** Width of the icon rail column */
export const TOOLBAR_W = 52;

// ── Drawing labels & icons ─────────────────────────────────────────────────────
const TOOL_ICONS: Record<string, React.ElementType> = {
  trendline: TrendingUp, ray: ArrowRight, hline: Minus,
  vline: AlignCenter, rect: Square, fib: GitMerge,
};
const TOOL_LABELS: Record<string, string> = {
  trendline: "Trendline", ray: "Ray", extended: "Extended",
  hline: "H. Line", vline: "V. Line", arrow: "Arrow",
  channel: "Channel", fib: "Fib", fib_ext: "Fib Ext",
  rect: "Rectangle", ellipse: "Circle", text: "Text",
};

// ── Icon button ───────────────────────────────────────────────────────────────
function ToolBtn({
  icon: Icon, label, active, badge, onClick, disabled, btnSize = 44, iconSize = 22,
}: {
  icon: React.ElementType; label: string; active?: boolean;
  badge?: number; onClick?: () => void; disabled?: boolean;
  btnSize?: number; iconSize?: number;
}) {
  const [pressed, setPressed] = useState(false);

  const base: CSSProperties = {
    width: btnSize, height: btnSize, borderRadius: 4,
    border: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: disabled ? "default" : "pointer", position: "relative",
    flexShrink: 0,
    transition: "background 0.12s, transform 0.1s",
    transform: pressed ? "scale(0.92)" : "scale(1)",
    background: active ? "rgba(255,255,255,0.14)" : "transparent",
    boxShadow: "none",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={base}
      onMouseEnter={e => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.04)";
        }
      }}
      onMouseLeave={e => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.transform = pressed ? "scale(0.92)" : "scale(1)";
        }
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <Icon style={{
        width: iconSize, height: iconSize,
        color: "#ffffff",
        transition: "color 0.12s",
      }} />
      {badge !== undefined && badge > 0 && (
        <div style={{
          position: "absolute", top: 6, right: 6,
          minWidth: 15, height: 15, borderRadius: 8, padding: "0 3px",
          background: badge > 0 && label === "Alerts" ? "#ef4444" : "rgba(183,255,90,0.9)",
          border: "1.5px solid rgba(7,17,13,0.8)",
          fontSize: 8, fontWeight: 900,
          color: label === "Alerts" ? "#fff" : "#07110D",
          display: "flex", alignItems: "center", justifyContent: "center",
          letterSpacing: "-0.02em",
        }}>
          {badge > 9 ? "9+" : badge}
        </div>
      )}
    </button>
  );
}

// ── Custom Watchlist icon (user-supplied SVG) ─────────────────────────────────
// Rendered as <img> with a brightness+invert CSS filter so it renders as pure
// white on the dark sidebar. Opacity drops to 0.65 in the inactive state,
// matching the dim-white colour ToolBtn applies to Lucide icons.
function WatchlistIcon({ style }: { style?: CSSProperties }) {
  const isActive = style?.color === "#ffffff";
  return (
    <img
      src={watchlistSvgUrl}
      alt=""
      draggable={false}
      style={{
        width:         25,
        height:        25,
        objectFit:     "contain",
        display:       "block",
        filter:        "brightness(0) invert(1)",
        opacity:       isActive ? 1 : 0.9,
        transition:    "opacity 0.12s",
        flexShrink:    0,
        userSelect:    "none",
        pointerEvents: "none",
      }}
    />
  );
}

// ── Custom SVG icon helpers (img + white filter) ──────────────────────────────
function SvgIcon({ src, size = 25 }: { src: string; size?: number }) {
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{
        width: size, height: size,
        display: "block",
        filter: "brightness(0) invert(1)",
        flexShrink: 0,
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
}
const BellIcon       = () => <SvgIcon src={icoBellUrl} size={23} />;
const ObjectTreeIcon = () => <SvgIcon src={icoObjectTreeUrl} size={23} />;
const SettingsIcon   = () => <SvgIcon src={icoSettingsUrl} size={23} />;
const CalculatorIcon = () => <SvgIcon src={icoCalculatorUrl} />;

function SvgPanelIcon({ src, style }: { src: string; style?: React.CSSProperties }) {
  const w = (style?.width as number) ?? 14;
  const h = (style?.height as number) ?? 14;
  return (
    <img src={src} alt="" draggable={false} style={{
      width: w, height: h, display: "block",
      filter: "brightness(0) invert(1)",
      userSelect: "none", pointerEvents: "none",
    }} />
  );
}
const ObjectTreePanelIcon = ({ style }: { style?: React.CSSProperties }) =>
  <SvgPanelIcon src={icoObjectTreeUrl} style={style} />;

// ── Slide panel wrapper ────────────────────────────────────────────────────────
// Rendered inside the parent container which must have position:relative.
// data-right-panel="true" lets the close-outside handler ignore clicks inside panels.
function SlidePanel({ open, width = 300, children }: {
  open: boolean; width?: number; children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="right-panel"
          data-right-panel="true"
          initial={{ x: width + TOOLBAR_W, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: width + TOOLBAR_W, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          style={{
            position: "absolute", top: 0, right: TOOLBAR_W, bottom: 0,
            width, zIndex: 60,
            background: "rgba(6,10,8,0.98)", backdropFilter: "blur(28px)",
            borderLeft: "1px solid rgba(57,91,67,0.28)",
            boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Panel header ──────────────────────────────────────────────────────────────
function PanelHeader({ title, icon: Icon, onClose }: {
  title: string; icon: React.ElementType; onClose: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9,
      padding: "13px 14px 11px",
      borderBottom: "1px solid rgba(57,91,67,0.18)",
      flexShrink: 0,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: "rgba(183,255,90,0.08)",
        boxShadow: "0 0 0 1px rgba(183,255,90,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon style={{ width: 14, height: 14, color: "#B7FF5A" }} />
      </div>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "#F3FFF3", letterSpacing: "0.01em" }}>
        {title}
      </span>
      <button onClick={onClose}
        style={{
          width: 26, height: 26, borderRadius: 7, cursor: "pointer",
          background: "transparent", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.14)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        <X style={{ width: 13, height: 13, color: "rgba(167,184,169,0.45)" }} />
      </button>
    </div>
  );
}

// ── Watchlist slide ───────────────────────────────────────────────────────────
const WatchlistSlide = memo(function WatchlistSlide({
  activeSymbol, onSelect, onClose,
}: { activeSymbol: string; onSelect: (s: string) => void; onClose: () => void }) {
  const ticks = useTickStore(s => s.ticks);
  const { items, loading } = useWatchlist();
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? items.filter(i =>
        i.symbol.toLowerCase().includes(query.toLowerCase()) ||
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        i.badge.toLowerCase().includes(query.toLowerCase()))
    : items;

  const sorted = [...filtered].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return a.position - b.position;
  });

  return (
    <>
      <PanelHeader title="Watchlist" icon={Bookmark} onClose={onClose} />

      <div style={{ padding: "10px 12px 8px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search style={{ position: "absolute", left: 9, top: 9, width: 12, height: 12, color: "rgba(167,184,169,0.35)" }} />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search symbols…"
            style={{
              width: "100%", height: 32, paddingLeft: 28, paddingRight: 10,
              borderRadius: 9, boxSizing: "border-box",
              background: "rgba(13,28,22,0.7)", border: "1px solid rgba(57,91,67,0.28)",
              color: "#F3FFF3", fontSize: 11, outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", padding: "2px 12px 7px", flexShrink: 0 }}>
        <span style={{ flex: 1, fontSize: 8.5, fontWeight: 700, color: "rgba(167,184,169,0.28)", textTransform: "uppercase", letterSpacing: "0.09em" }}>Symbol</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(167,184,169,0.28)", textTransform: "uppercase", letterSpacing: "0.09em", width: 76, textAlign: "right" }}>Price</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(167,184,169,0.28)", textTransform: "uppercase", letterSpacing: "0.09em", width: 54, textAlign: "right" }}>Chg%</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 60 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(183,255,90,0.25)", borderTopColor: "#B7FF5A", animation: "spin 0.7s linear infinite" }} />
          </div>
        )}
        {!loading && (
          <AnimatedList>
            {sorted.map(entry => {
              const tick = ticks[entry.symbol];
              const active = entry.symbol === activeSymbol;
              const isPos = (tick?.changePct ?? 0) >= 0;
              return (
                <AnimatedListItem key={entry.symbol}>
                  <button onClick={() => onSelect(entry.symbol)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      padding: "7px 12px", border: "none", cursor: "pointer",
                      background: active ? "rgba(183,255,90,0.06)" : "transparent",
                      borderLeft: `2.5px solid ${active ? "#B7FF5A" : "transparent"}`,
                      transition: "all 0.1s",
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.1)"; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginRight: 9,
                      background: active ? "rgba(183,255,90,0.12)" : "rgba(13,22,17,0.9)",
                      boxShadow: active ? "0 0 0 1px rgba(183,255,90,0.3)" : "0 0 0 1px rgba(57,91,67,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 7.5, fontWeight: 900, color: active ? "#B7FF5A" : "rgba(167,184,169,0.7)",
                    }}>{entry.badge.slice(0, 4)}</div>

                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: active ? "#B7FF5A" : "#F3FFF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.badge}
                      </p>
                      <p style={{ margin: 0, fontSize: 9, color: "rgba(167,184,169,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.market}
                      </p>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: "#F3FFF3", fontFamily: "monospace" }}>
                        {tick && tick.price > 0 ? fmtPrice(tick.price, entry.symbol) : "—"}
                      </p>
                      <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: isPos ? "#B7FF5A" : "#ef4444" }}>
                        {tick ? `${isPos ? "+" : ""}${tick.changePct.toFixed(2)}%` : ""}
                      </p>
                    </div>
                  </button>
                </AnimatedListItem>
              );
            })}
          </AnimatedList>
        )}
        {!loading && sorted.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontSize: 11, color: "rgba(167,184,169,0.35)" }}>
            {query ? "No symbols found" : "Watchlist is empty"}
          </div>
        )}
      </div>

      <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(57,91,67,0.1)", flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 9, color: "rgba(167,184,169,0.22)", textAlign: "center" }}>
          {sorted.length} symbol{sorted.length !== 1 ? "s" : ""}
        </p>
      </div>
    </>
  );
});

// ── Object tree slide ─────────────────────────────────────────────────────────
const ObjectsSlide = memo(function ObjectsSlide({
  symbol, timeframe, onClose,
}: { symbol: string; timeframe: string; onClose: () => void }) {
  const { drawings, updateDrawing, removeDrawing } = useDrawingStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = drawings.filter(d => d.symbol === symbol && d.timeframe === timeframe);

  const byType = filtered.reduce<Record<string, typeof filtered>>((acc, d) => {
    if (!acc[d.toolType]) acc[d.toolType] = [];
    acc[d.toolType].push(d);
    return acc;
  }, {});

  const handleDelete = async (id: number) => {
    removeDrawing(id);
    try { await fetch(`${BASE}/api/drawings/${id}`, { method: "DELETE" }); } catch { /* */ }
  };

  return (
    <>
      <PanelHeader title="Object Tree" icon={ObjectTreePanelIcon} onClose={onClose} />

      {/* Symbol + timeframe context badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 14px 6px", flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
          color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5,
          padding: "2px 7px",
        }}>{symbol}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.03em",
          color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5,
          padding: "2px 7px",
        }}>{timeframe}</span>
        <span style={{ flex: 1 }} />
        {filtered.length > 0 && (
          <span style={{
            fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,0.28)",
            letterSpacing: "0.02em",
          }}>{filtered.length} object{filtered.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", paddingTop: 4 }}>
        {filtered.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 12, padding: 32,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img src={icoObjectTreeUrl} alt="" draggable={false} style={{
                width: 20, height: 20, display: "block",
                filter: "brightness(0) invert(1)", opacity: 0.22,
                userSelect: "none", pointerEvents: "none",
              }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)", margin: "0 0 5px" }}>No objects</p>
              <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.18)", margin: 0, lineHeight: 1.6 }}>
                Drawings placed on the chart<br />will appear here
              </p>
            </div>
          </div>
        ) : (
          Object.entries(byType).map(([type, items]) => {
            const Icon = TOOL_ICONS[type] ?? TrendingUp;
            const label = TOOL_LABELS[type] ?? type.replace(/_/g, " ");
            const isCollapsed = collapsed[type];
            const allVisible = items.every(d => d.isVisible !== false);

            return (
              <div key={type} style={{ marginBottom: 2 }}>
                {/* ── Group header ── */}
                <div
                  onClick={() => setCollapsed(p => ({ ...p, [type]: !p[type] }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "0 10px 0 12px", height: 34, cursor: "pointer",
                    background: "rgba(255,255,255,0.03)",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    borderBottom: isCollapsed ? "1px solid rgba(255,255,255,0.05)" : "none",
                    userSelect: "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
                >
                  {/* Chevron */}
                  <div style={{
                    width: 14, height: 14, display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0,
                    transition: "transform 0.15s",
                    transform: isCollapsed ? "rotate(-90deg)" : "none",
                  }}>
                    <ChevronDown style={{ width: 11, height: 11, color: "rgba(255,255,255,0.28)" }} />
                  </div>

                  {/* Tool icon */}
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon style={{ width: 12, height: 12, color: "rgba(255,255,255,0.7)" }} />
                  </div>

                  {/* Label */}
                  <span style={{
                    flex: 1, fontSize: 11.5, fontWeight: 600,
                    color: "rgba(255,255,255,0.72)", letterSpacing: "0.01em",
                  }}>{label}</span>

                  {/* Count pill */}
                  <span style={{
                    fontSize: 9.5, fontWeight: 700,
                    color: "rgba(255,255,255,0.38)",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 20, padding: "1px 7px",
                    letterSpacing: "0.02em",
                  }}>{items.length}</span>

                  {/* Group eye toggle */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      items.forEach(d => updateDrawing(d.id, { isVisible: !allVisible }));
                    }}
                    title={allVisible ? "Hide all" : "Show all"}
                    style={{
                      width: 26, height: 26, borderRadius: 7, border: "none",
                      background: "transparent", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginLeft: 2, flexShrink: 0,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    {allVisible
                      ? <Eye    style={{ width: 13, height: 13, color: "rgba(255,255,255,0.45)" }} />
                      : <EyeOff style={{ width: 13, height: 13, color: "rgba(255,255,255,0.22)" }} />}
                  </button>
                </div>

                {/* ── Drawing rows ── */}
                {!isCollapsed && (
                  <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    {items.map((d, i) => {
                      const priceStr = d.points[0]?.price
                        ? (d.points[0].price > 1000
                          ? d.points[0].price.toFixed(2)
                          : d.points[0].price.toFixed(5))
                        : null;
                      return (
                        <div key={d.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "0 8px 0 34px", height: 34,
                            background: "transparent",
                            opacity: d.isVisible !== false ? 1 : 0.4,
                            transition: "opacity 0.15s, background 0.1s",
                            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                        >
                          {/* Color swatch */}
                          <div style={{
                            width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                            background: d.style.color,
                            boxShadow: `0 0 6px ${d.style.color}66`,
                          }} />

                          {/* Label: price or index */}
                          <span style={{
                            flex: 1, fontSize: 11, fontWeight: 500,
                            color: "rgba(255,255,255,0.55)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            fontVariantNumeric: "tabular-nums",
                          }}>
                            {priceStr ?? `${label} ${i + 1}`}
                          </span>

                          {/* Action buttons */}
                          <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                            {/* Visibility */}
                            <button
                              title={d.isVisible !== false ? "Hide" : "Show"}
                              onClick={() => updateDrawing(d.id, { isVisible: !(d.isVisible !== false) })}
                              style={{
                                width: 26, height: 26, borderRadius: 6, border: "none",
                                background: "transparent", cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "background 0.1s",
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            >
                              {d.isVisible !== false
                                ? <Eye    style={{ width: 12, height: 12, color: "rgba(255,255,255,0.4)" }} />
                                : <EyeOff style={{ width: 12, height: 12, color: "rgba(255,255,255,0.2)" }} />}
                            </button>

                            {/* Lock */}
                            <button
                              title={d.isLocked ? "Unlock" : "Lock"}
                              onClick={() => updateDrawing(d.id, { isLocked: !d.isLocked })}
                              style={{
                                width: 26, height: 26, borderRadius: 6, border: "none",
                                background: "transparent", cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "background 0.1s",
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            >
                              <Lock style={{
                                width: 12, height: 12,
                                color: d.isLocked ? "#B7FF5A" : "rgba(255,255,255,0.28)",
                              }} />
                            </button>

                            {/* Delete */}
                            <button
                              title="Delete"
                              onClick={() => handleDelete(d.id)}
                              style={{
                                width: 26, height: 26, borderRadius: 6, border: "none",
                                background: "transparent", cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "background 0.1s",
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.14)"; (e.currentTarget as HTMLButtonElement).querySelector("svg")!.style.color = "#f87171"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).querySelector("svg")!.style.color = "rgba(255,255,255,0.25)"; }}
                            >
                              <Trash2 style={{ width: 12, height: 12, color: "rgba(255,255,255,0.25)", transition: "color 0.1s" }} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer — hide all / show all */}
      {filtered.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <button
            onClick={() => filtered.forEach(d => updateDrawing(d.id, { isVisible: false }))}
            style={{
              flex: 1, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.09)",
              background: "rgba(255,255,255,0.04)", cursor: "pointer",
              fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              transition: "background 0.1s, border-color 0.1s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
          >
            <EyeOff style={{ width: 11, height: 11 }} /> Hide all
          </button>
          <button
            onClick={() => filtered.forEach(d => updateDrawing(d.id, { isVisible: true }))}
            style={{
              flex: 1, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.09)",
              background: "rgba(255,255,255,0.04)", cursor: "pointer",
              fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              transition: "background 0.1s, border-color 0.1s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
          >
            <Eye style={{ width: 11, height: 11 }} /> Show all
          </button>
        </div>
      )}
    </>
  );
});

// ── Layout previews ───────────────────────────────────────────────────────────
const LAYOUT_PREVIEWS = [
  () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 2, width: "100%", height: "100%" }}>
      <div style={{ background: "rgba(183,255,90,0.18)", borderRadius: 3 }} />
    </div>
  ),
  () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, width: "100%", height: "100%" }}>
      {[0,1].map(i => <div key={i} style={{ background: "rgba(183,255,90,0.14)", borderRadius: 3 }} />)}
    </div>
  ),
  () => (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gridTemplateRows: "1fr 1fr", gap: 2, width: "100%", height: "100%" }}>
      <div style={{ gridRow: "1 / 3", background: "rgba(183,255,90,0.14)", borderRadius: 3 }} />
      {[0,1].map(i => <div key={i} style={{ background: "rgba(183,255,90,0.14)", borderRadius: 3 }} />)}
    </div>
  ),
  () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 2, width: "100%", height: "100%" }}>
      {[0,1,2,3].map(i => <div key={i} style={{ background: "rgba(183,255,90,0.14)", borderRadius: 3 }} />)}
    </div>
  ),
];
const LAYOUT_LABELS = ["Single", "Side by Side", "Large + 2", "4 Charts"];

const LayoutSlide = memo(function LayoutSlide({
  current, onChange, onClose, syncTF, onSyncTFChange,
  namedLayouts, defaultLayoutName, onSaveNamedLayout, onLoadNamedLayout,
  onRenameNamedLayout, onDeleteNamedLayout, activeLayoutId,
}: {
  current: ChartLayoutType; onChange: (n: ChartLayoutType) => void; onClose: () => void;
  syncTF: boolean; onSyncTFChange: (v: boolean) => void;
  namedLayouts: NamedLayout[];
  defaultLayoutName: string;
  onSaveNamedLayout: (name: string) => void;
  onLoadNamedLayout: (layout: NamedLayout) => void;
  onRenameNamedLayout: (id: string, name: string) => void;
  onDeleteNamedLayout: (id: string) => void;
  activeLayoutId: string | null;
}) {
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const handleSave = () => {
    if (!saveName.trim()) return;
    onSaveNamedLayout(saveName.trim());
    setSaveName("");
    setShowSave(false);
  };

  return (
    <>
      <PanelHeader title="Layout Manager" icon={LayoutTemplate} onClose={onClose} />

      <div style={{ padding: "14px 14px 10px", flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        <p style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, color: "rgba(167,184,169,0.32)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Chart Grid
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {([1, 2, 3, 4] as ChartLayoutType[]).map((n, idx) => {
            const Preview = LAYOUT_PREVIEWS[idx];
            const active = current === n;
            return (
              <button key={n} onClick={() => { onChange(n); }}
                style={{
                  padding: 10, borderRadius: 11, cursor: "pointer",
                  background: active ? "rgba(183,255,90,0.09)" : "rgba(57,91,67,0.07)",
                  boxShadow: active
                    ? "0 0 0 1.5px rgba(183,255,90,0.4), 0 0 20px rgba(183,255,90,0.08)"
                    : "0 0 0 1px rgba(57,91,67,0.2)",
                  display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.13)"; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.07)"; } }}
              >
                <div style={{ width: "100%", height: 52 }}>
                  <Preview />
                </div>
                <span style={{ fontSize: 10, fontWeight: active ? 800 : 600, color: active ? "#B7FF5A" : "rgba(167,184,169,0.6)" }}>
                  {LAYOUT_LABELS[idx]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Timeframe sync toggle — only visible in multi-chart mode */}
        {current > 1 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, color: "rgba(167,184,169,0.32)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              Timeframe Sync
            </p>
            <button
              onClick={() => onSyncTFChange(!syncTF)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: "none",
                background: syncTF ? "rgba(183,255,90,0.08)" : "rgba(57,91,67,0.07)",
                boxShadow: syncTF
                  ? "0 0 0 1.5px rgba(183,255,90,0.35), 0 0 16px rgba(183,255,90,0.07)"
                  : "0 0 0 1px rgba(57,91,67,0.2)",
                transition: "all 0.15s",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                background: syncTF ? "rgba(183,255,90,0.12)" : "rgba(57,91,67,0.12)",
                boxShadow: syncTF ? "0 0 0 1px rgba(183,255,90,0.3)" : "0 0 0 1px rgba(57,91,67,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {syncTF
                  ? <Link2   style={{ width: 15, height: 15, color: "#B7FF5A" }} />
                  : <Unlink2 style={{ width: 15, height: 15, color: "rgba(167,184,169,0.45)" }} />}
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: syncTF ? "#B7FF5A" : "#F3FFF3" }}>
                  {syncTF ? "Synced" : "Independent"}
                </p>
                <p style={{ margin: 0, fontSize: 9.5, color: "rgba(167,184,169,0.4)", marginTop: 1, lineHeight: 1.4 }}>
                  {syncTF ? "All charts match main timeframe" : "Each chart has own timeframe"}
                </p>
              </div>
              <div style={{
                width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                background: syncTF ? "#B7FF5A" : "rgba(57,91,67,0.3)",
                position: "relative", transition: "background 0.2s",
              }}>
                <div style={{
                  position: "absolute", top: 3, width: 14, height: 14, borderRadius: "50%",
                  background: syncTF ? "#07110D" : "rgba(167,184,169,0.6)",
                  left: syncTF ? 19 : 3,
                  transition: "left 0.2s, background 0.2s",
                }} />
              </div>
            </button>
          </div>
        )}

        {current > 1 && !syncTF && (
          <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 9, background: "rgba(57,91,67,0.05)", boxShadow: "0 0 0 1px rgba(57,91,67,0.15)" }}>
            <p style={{ margin: 0, fontSize: 10, color: "rgba(167,184,169,0.42)", lineHeight: 1.5 }}>
              Click the symbol badge in each chart to change its symbol or timeframe independently.
            </p>
          </div>
        )}

        {/* ── Saved Layouts ── */}
        <div style={{ marginTop: 16, borderTop: "1px solid rgba(57,91,67,0.18)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: "rgba(167,184,169,0.32)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              Saved Layouts
            </p>
            {!showSave && (
              <button
                onClick={() => { setShowSave(true); setSaveName(defaultLayoutName); }}
                style={{ fontSize: 10, fontWeight: 700, color: "#B7FF5A", background: "rgba(183,255,90,0.08)", border: "1px solid rgba(183,255,90,0.22)", borderRadius: 7, padding: "3px 9px", cursor: "pointer" }}
              >
                + Save Current
              </button>
            )}
          </div>

          {showSave && (
            <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowSave(false); }}
                placeholder="Layout name…"
                style={{ flex: 1, height: 28, borderRadius: 7, border: "1px solid rgba(57,91,67,0.35)", background: "rgba(57,91,67,0.14)", color: "#F3FFF3", fontSize: 11, padding: "0 8px", outline: "none" }}
              />
              <button onClick={handleSave}
                style={{ height: 28, padding: "0 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(183,255,90,0.12)", border: "1px solid rgba(183,255,90,0.32)", color: "#B7FF5A" }}>
                Save
              </button>
              <button onClick={() => setShowSave(false)}
                style={{ height: 28, padding: "0 8px", borderRadius: 7, fontSize: 11, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(167,184,169,0.5)" }}>
                ✕
              </button>
            </div>
          )}

          {namedLayouts.length === 0 ? (
            <p style={{ fontSize: 11, color: "rgba(167,184,169,0.28)", textAlign: "center", margin: "14px 0", lineHeight: 1.6 }}>
              No saved layouts yet.<br />Save your current chart state to restore it later.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {namedLayouts.map(layout => {
                const isActive = layout.id === activeLayoutId;
                console.log("[LayoutCard]", { activeLayoutId, layoutId: layout.id, isActive });
                return (
                  <div key={layout.id} style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "7px 8px", borderRadius: 9,
                    background: isActive ? "rgba(59,130,246,0.12)" : "rgba(57,91,67,0.07)",
                    boxShadow: isActive
                      ? "0 0 0 2px #3b82f6 inset, 0 0 14px rgba(59,130,246,0.2)"
                      : "0 0 0 1px rgba(57,91,67,0.18)",
                    transform: isActive ? "scale(1.02)" : "none",
                    transition: "all 0.15s",
                  }}>
                    {renameId === layout.id ? (
                      <input
                        autoFocus
                        value={renameName}
                        onChange={e => setRenameName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { onRenameNamedLayout(layout.id, renameName || layout.name); setRenameId(null); }
                          if (e.key === "Escape") setRenameId(null);
                        }}
                        onBlur={() => { onRenameNamedLayout(layout.id, renameName || layout.name); setRenameId(null); }}
                        style={{ flex: 1, height: 22, borderRadius: 5, border: "1px solid rgba(183,255,90,0.35)", background: "rgba(57,91,67,0.2)", color: "#F3FFF3", fontSize: 11, padding: "0 6px", outline: "none" }}
                      />
                    ) : (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 11, fontWeight: isActive ? 700 : 600, color: isActive ? "#93c5fd" : "#F3FFF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{layout.name}</div>
                            {isActive && (
                              <span style={{ fontSize: 8.5, fontWeight: 800, color: "#3b82f6", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em", flexShrink: 0 }}>
                                ✓ Active
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 9, color: isActive ? "rgba(147,197,253,0.55)" : "rgba(167,184,169,0.38)", marginTop: 1 }}>{layout.symbol} · {layout.interval}</div>
                        </div>
                        <button
                          onClick={() => { onLoadNamedLayout(layout); onClose(); }}
                          style={{ height: 22, padding: "0 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", background: isActive ? "rgba(59,130,246,0.15)" : "rgba(183,255,90,0.1)", border: isActive ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(183,255,90,0.28)", color: isActive ? "#93c5fd" : "#B7FF5A", flexShrink: 0 }}
                        >
                          {isActive ? "Reload" : "Load"}
                        </button>
                        <button
                          onClick={() => { setRenameId(layout.id); setRenameName(layout.name); }}
                          title="Rename"
                          style={{ width: 22, height: 22, borderRadius: 5, fontSize: 11, cursor: "pointer", background: "transparent", border: "none", color: "rgba(167,184,169,0.5)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >✏</button>
                        <button
                          onClick={() => onDeleteNamedLayout(layout.id)}
                          title="Delete"
                          style={{ width: 22, height: 22, borderRadius: 5, fontSize: 11, cursor: "pointer", background: "transparent", border: "none", color: "rgba(239,68,68,0.5)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >🗑</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
});

// ── Main RightToolbar ──────────────────────────────────────────────────────────
// Renders as a flex column child (not absolute) so the chart area is naturally narrowed.
// Slide panels are positioned absolute relative to the parent container
// (which must have position:relative).
const RightToolbar = memo(function RightToolbar({
  activeSymbol, activeTimeframe, alertCount, onSelectSymbol,
  layoutCount, onLayoutChange, syncTF, onSyncTFChange, onAlertClick,
  onScreenshot, onCopyLiveLink, onFullscreen, onSettings, isFullscreen, showSettings,
  namedLayouts, defaultLayoutName, onSaveNamedLayout, onLoadNamedLayout,
  onRenameNamedLayout, onDeleteNamedLayout, activeLayoutId,
}: RightToolbarProps) {
  const [openPanel, setOpenPanel] = useState<PanelId>(null);
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const cameraMenuRef = useRef<HTMLDivElement>(null);
  const cameraBtnRef  = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const openCameraMenu = useCallback(() => {
    if (cameraBtnRef.current) {
      const r = cameraBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.top, right: window.innerWidth - r.left + 8 });
    }
    setShowCameraMenu(true);
  }, []);

  const closeCameraMenu = useCallback(() => setShowCameraMenu(false), []);
  const { drawings } = useDrawingStore();
  const drawingCount = drawings.filter(d => d.symbol === activeSymbol && d.timeframe === activeTimeframe).length;

  const toggle = useCallback((panel: PanelId) => {
    setOpenPanel(prev => prev === panel ? null : panel);
  }, []);

  // Close panel when clicking outside the rail AND outside any slide panel
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openPanel) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      const inRail  = railRef.current?.contains(target) ?? false;
      const inPanel = !!target.closest?.("[data-right-panel]");
      if (!inRail && !inPanel) setOpenPanel(null);
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 80);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [openPanel]);

  // Close camera dropdown when clicking/touching outside both the button and the menu
  useEffect(() => {
    if (!showCameraMenu) return;
    const close = (e: MouseEvent | TouchEvent) => {
      const target = ("touches" in e ? e.touches[0]?.target : e.target) as Element | null;
      if (!target) return;
      const inBtn  = cameraBtnRef.current?.contains(target)  ?? false;
      const inMenu = cameraMenuRef.current?.contains(target) ?? false;
      if (!inBtn && !inMenu) setShowCameraMenu(false);
    };
    const id = setTimeout(() => {
      document.addEventListener("mousedown", close);
      document.addEventListener("touchstart", close as EventListener);
    }, 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close as EventListener);
    };
  }, [showCameraMenu]);

  return (
    <>
      {/* Slide panels (absolute, relative to parent container) */}
      <SlidePanel open={openPanel === "watchlist"}>
        <BrokerWatchlist
          activeSymbol={activeSymbol}
          onSelect={s => { onSelectSymbol(s); }}
          onClose={() => setOpenPanel(null)}
        />
      </SlidePanel>

      <SlidePanel open={openPanel === "objects"}>
        <ObjectsSlide
          symbol={activeSymbol}
          timeframe={activeTimeframe}
          onClose={() => setOpenPanel(null)}
        />
      </SlidePanel>

      <SlidePanel open={openPanel === "layout"} width={272}>
        <LayoutSlide
          current={layoutCount}
          onChange={n => { onLayoutChange(n); setOpenPanel(null); }}
          onClose={() => setOpenPanel(null)}
          syncTF={syncTF}
          onSyncTFChange={onSyncTFChange}
          namedLayouts={namedLayouts}
          defaultLayoutName={defaultLayoutName}
          onSaveNamedLayout={onSaveNamedLayout}
          onLoadNamedLayout={onLoadNamedLayout}
          onRenameNamedLayout={onRenameNamedLayout}
          onDeleteNamedLayout={onDeleteNamedLayout}
          activeLayoutId={activeLayoutId}
        />
      </SlidePanel>

      {/* Icon rail — flex column, NOT absolute; overflows scroll on small screens */}
      <div
        ref={railRef}
        data-right-toolbar="true"
        style={{
          width: TOOLBAR_W, flexShrink: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 5,
          paddingTop: 8, paddingBottom: 8,
          overflowY: "auto", overflowX: "hidden",
          scrollbarWidth: "none",
          background: "#0a0a0a",
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          position: "relative", zIndex: 61,
        }}
      >
        <ToolBtn
          icon={WatchlistIcon}
          label="Watchlist"
          active={openPanel === "watchlist"}
          onClick={() => toggle("watchlist")}
        />

        <ToolBtn
          icon={BellIcon}
          label="Alerts"
          onClick={onAlertClick}
        />

        <ToolBtn
          icon={ObjectTreeIcon}
          label="Object Tree"
          active={openPanel === "objects"}
          onClick={() => toggle("objects")}
        />

        <ToolBtn
          icon={LayoutGrid}
          label="Layout"
          active={openPanel === "layout"}
          badge={layoutCount > 1 ? layoutCount : undefined}
          onClick={() => toggle("layout")}
        />

        <ToolBtn
          icon={CalculatorIcon}
          label="Calculator"
          onClick={() => console.log("Calculator panel coming soon")}
        />

        <div style={{ width: 28, height: 1, background: "rgba(255,255,255,0.08)", margin: "5px auto" }} />

        {/* Screenshot button — portal dropdown escapes stacking context */}
        <div ref={cameraBtnRef}>
          <ToolBtn
            icon={Camera}
            label="Screenshot"
            active={showCameraMenu}
            onClick={() => showCameraMenu ? closeCameraMenu() : openCameraMenu()}
          />
        </div>

        {showCameraMenu && createPortal(
          <div
            ref={cameraMenuRef}
            style={{
              position: "fixed",
              top: menuPos.top,
              right: menuPos.right,
              width: 216,
              background: "rgba(8,16,12,0.97)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(183,255,90,0.15)",
              borderRadius: 14,
              boxShadow: "0 16px 56px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04) inset",
              padding: "6px",
              zIndex: 99999,
              pointerEvents: "all",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "6px 12px 8px",
              fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "rgba(183,255,90,0.45)",
            }}>
              Chart Export
            </div>

            {/* Snapshot */}
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { closeCameraMenu(); onScreenshot?.(); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10, border: "none",
                background: "transparent", cursor: "pointer", transition: "background 0.12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(183,255,90,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: "rgba(183,255,90,0.1)", border: "1px solid rgba(183,255,90,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Camera style={{ width: 30, height: 30, color: "#B7FF5A" }} />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#F3FFF3" }}>Snapshot</div>
                <div style={{ fontSize: 10, color: "rgba(167,184,169,0.5)", marginTop: 1 }}>Save full chart image</div>
              </div>
            </button>

            <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "4px 8px" }} />

            {/* Copy Live Chart Link */}
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { closeCameraMenu(); onCopyLiveLink?.(); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10, border: "none",
                background: "transparent", cursor: "pointer", transition: "background 0.12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,179,237,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: "rgba(99,179,237,0.1)", border: "1px solid rgba(99,179,237,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Link2 style={{ width: 14, height: 14, color: "#63B3ED" }} />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#F3FFF3" }}>Copy Live Chart Link</div>
                <div style={{ fontSize: 10, color: "rgba(167,184,169,0.5)", marginTop: 1 }}>Share current view</div>
              </div>
            </button>
          </div>,
          document.body
        )}

        <ToolBtn
          icon={isFullscreen ? Minimize2 : Maximize2}
          label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          onClick={onFullscreen}
        />

        <ToolBtn
          icon={SettingsIcon}
          label="Settings"
          active={showSettings}
          onClick={onSettings}
        />

        {/* Active layout indicator — pinned at bottom */}
        {layoutCount > 1 && (
          <div style={{ marginTop: "auto", paddingTop: 4, paddingBottom: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              width: 20, height: 20,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridTemplateRows: layoutCount >= 3 ? "1fr 1fr" : "1fr",
              gap: 2,
            }}>
              {Array.from({ length: layoutCount }).map((_, i) => (
                <div key={i} style={{ background: "rgba(183,255,90,0.35)", borderRadius: 2 }} />
              ))}
            </div>
            <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(183,255,90,0.5)", marginTop: 3 }}>
              {layoutCount}×
            </span>
          </div>
        )}
      </div>
    </>
  );
});

export default RightToolbar;
