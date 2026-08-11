import { memo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Drawing, DrawingStyle, DrawingPoint } from "@/types/drawing";
import { ColorPickerGlass } from "@/components/ColorPickerGlass";
import { toArray } from "@/lib/safeArray";
import thalamSvg    from "@assets/thalam1_1780601317178.svg";
import alertSvg     from "@assets/new_alert1_1780601317242.svg";
import dotsSvg      from "@assets/new3dots1_1780601317279.svg";
import templateSvg  from "@assets/newtemplate1_1780601317314.svg";
import draggingSvg  from "@assets/newdragging1_1780601317349.svg";
import binSvg       from "@assets/newbin1_1780601317380.svg";
import bucketSvg    from "@assets/bucket1_1780601317406.svg";
import settingSvg   from "@assets/setting1_1780601636025.svg";

// ── Constants ──────────────────────────────────────────────────────────────

const PROFIT_DEFAULT = "#089981";
const STOP_DEFAULT   = "#f23645";

const TIMEFRAME_OPTIONS = [
  { label: "1m",  value: "1"   },
  { label: "5m",  value: "5"   },
  { label: "15m", value: "15"  },
  { label: "30m", value: "30"  },
  { label: "1H",  value: "60"  },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D"   },
  { label: "1W",  value: "W"   },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || PROFIT_DEFAULT).replace("#", "").slice(0, 6).padEnd(6, "0");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Button ─────────────────────────────────────────────────────────────────

function PtBtn({
  children, title, active = false, danger = false, onClick, btnRef,
}: {
  children: React.ReactNode;
  title?: string;
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
  btnRef?: React.RefObject<HTMLDivElement>;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      ref={btnRef}
      title={title}
      onClick={onClick}
      onPointerDown={e => e.stopPropagation()}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 36, borderRadius: 7, cursor: "pointer", flexShrink: 0,
        color: danger
          ? (hov ? "#f56565" : "rgba(220,80,80,0.75)")
          : active
            ? "#b7ff5a"
            : (hov ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.62)"),
        background: hov
          ? (danger ? "rgba(220,60,60,0.14)" : "rgba(255,255,255,0.09)")
          : (active ? "rgba(183,255,90,0.10)" : "transparent"),
        transition: "background .1s, color .1s",
      }}
    >
      {children}
    </div>
  );
}

function PtSep() {
  return (
    <div style={{
      width: 1, height: 22, background: "rgba(255,255,255,0.09)",
      flexShrink: 0, margin: "0 3px",
    }} />
  );
}

// ── More Menu ──────────────────────────────────────────────────────────────

function MoreMenu({
  anchorRect, onClose, onDuplicate, onHide, onReverse, onLock, isLocked,
}: {
  anchorRect: DOMRect | null;
  onClose: () => void;
  onDuplicate: () => void;
  onHide: () => void;
  onReverse: () => void;
  onLock: () => void;
  isLocked: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!ref.current) return;
      const t = e.target as Node;
      if (!ref.current.contains(t)) onClose();
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [onClose]);

  const left = anchorRect ? Math.max(8, anchorRect.right - 168) : 100;
  const top  = anchorRect ? Math.max(8, anchorRect.top - 8)     : 100;

  const items = [
    {
      label: "Clone",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      ),
      action: () => { onDuplicate(); onClose(); },
    },
    {
      label: "Reverse",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 16V4m0 0L3 8m4-4 4 4"/>
          <path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
        </svg>
      ),
      action: () => { onReverse(); onClose(); },
    },
    {
      label: isLocked ? "Unlock" : "Lock",
      icon: isLocked ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b7ff5a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
        </svg>
      ),
      action: () => { onLock(); onClose(); },
      highlight: isLocked,
    },
    {
      label: "Hide",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      ),
      action: () => { onHide(); onClose(); },
      highlight: false,
    },
  ];

  return createPortal(
    <div
      ref={ref}
      data-drawing-popup
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: "fixed", left, top: top - items.length * 34 - 8,
        zIndex: 230,
        background: "rgba(16,18,21,0.98)", backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.75)", padding: "4px",
        minWidth: 160,
        animation: "ptPop .12s cubic-bezier(0.16,1,0.3,1) both",
      }}
    >
      {items.map(item => (
        <button
          key={item.label}
          onClick={item.action}
          style={{
            display: "flex", alignItems: "center", gap: 9, width: "100%",
            padding: "7px 10px", background: "transparent", border: "none",
            cursor: "pointer", borderRadius: 7,
            color: (item as { highlight?: boolean }).highlight ? "rgba(183,255,90,0.9)" : "rgba(200,205,215,0.85)",
            fontSize: 12.5, textAlign: "left",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ opacity: 0.8, display: "flex", alignItems: "center" }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}

// ── Settings Modal ─────────────────────────────────────────────────────────

type SettingsTab = "inputs" | "style" | "visibility";

function PositionSettingsModal({
  drawing, pos, onUpdate, onUpdatePoints, onClose,
}: {
  drawing:        Drawing;
  pos:            { x: number; y: number };
  onUpdate:       (patch: Partial<DrawingStyle>) => void;
  onUpdatePoints: (pts: DrawingPoint[]) => void;
  onClose:        () => void;
}) {
  const [tab, setTab]     = useState<SettingsTab>("inputs");
  const S = drawing.style;
  const pts = drawing.points;

  // Inputs tab state
  const [entryVal, setEntryVal] = useState(pts[0]?.price?.toString() ?? "");
  const [tpVal,    setTpVal]    = useState(pts[1]?.price?.toString() ?? "");
  const [slVal,    setSlVal]    = useState(pts[2]?.price?.toString() ?? (pts[0] && pts[1]
    ? (drawing.toolType === "position_long"
      ? (pts[0].price - Math.abs(pts[1].price - pts[0].price) * 0.5).toFixed(6)
      : (pts[0].price + Math.abs(pts[1].price - pts[0].price) * 0.5).toFixed(6))
    : ""));

  // Style tab color picker state
  const [showProfitCP, setShowProfitCP] = useState(false);
  const [showStopCP,   setShowStopCP]   = useState(false);
  const profitSwatchRef = useRef<HTMLDivElement>(null);
  const stopSwatchRef   = useRef<HTMLDivElement>(null);

  const profitHex = S.profitColor ?? PROFIT_DEFAULT;
  const stopHex   = S.stopColor   ?? STOP_DEFAULT;

  const commitEntry = () => {
    const v = parseFloat(entryVal);
    if (isNaN(v)) { setEntryVal(pts[0]?.price?.toString() ?? ""); return; }
    const newPts = pts.map(p => ({ ...p }));
    if (newPts[0]) newPts[0] = { ...newPts[0], price: v };
    if (newPts[2]) newPts[2] = { ...newPts[2], price: v + (pts[2]?.price ?? 0) - (pts[0]?.price ?? 0) };
    onUpdatePoints(newPts);
  };

  const commitTp = () => {
    const v = parseFloat(tpVal);
    if (isNaN(v)) { setTpVal(pts[1]?.price?.toString() ?? ""); return; }
    const newPts = pts.map(p => ({ ...p }));
    if (newPts[1]) newPts[1] = { ...newPts[1], price: v };
    onUpdatePoints(newPts);
  };

  const commitSl = () => {
    const v = parseFloat(slVal);
    if (isNaN(v)) return;
    const newPts = pts.map(p => ({ ...p }));
    if (newPts[2]) newPts[2] = { ...newPts[2], price: v };
    else if (newPts[0]) newPts.push({ time: newPts[0].time, price: v });
    onUpdatePoints(newPts);
  };

  const isTFVisible = (value: string) => {
    const vt = toArray<string>(S.visibleTimeframes, "PositionToolbar.isTFVisible");
    return vt.length === 0 || vt.includes(value);
  };

  const toggleTF = (value: string) => {
    const cur = toArray<string>(S.visibleTimeframes, "PositionToolbar.toggleTF");
    let next: string[];
    if (cur.length === 0) {
      next = TIMEFRAME_OPTIONS.map(t => t.value).filter(v => v !== value);
    } else if (cur.includes(value)) {
      next = cur.filter(v => v !== value);
      if (next.length === TIMEFRAME_OPTIONS.length) next = [];
    } else {
      const added = [...cur, value];
      next = added.length === TIMEFRAME_OPTIONS.length ? [] : added;
    }
    onUpdate({ visibleTimeframes: next });
  };

  const MW = 320;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = pos.x - MW / 2;
  let top  = pos.y - 460;
  left = Math.max(8, Math.min(left, vw - MW - 8));
  if (top < 8) top = pos.y + 60;
  top = Math.max(8, Math.min(top, vh - 460));

  const tabStyle = (id: SettingsTab): React.CSSProperties => ({
    flex: 1, padding: "8px 2px 9px", background: "transparent", border: "none",
    cursor: "pointer", fontSize: 12.5, fontFamily: "'Inter',system-ui,sans-serif",
    fontWeight: 500, transition: "color .1s",
    color: tab === id ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.38)",
    borderBottom: tab === id ? "2px solid rgba(183,255,90,0.7)" : "2px solid transparent",
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", fontSize: 12.5,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8,
    color: "rgba(255,255,255,0.85)", fontFamily: "ui-monospace,'JetBrains Mono',monospace",
    outline: "none",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "9px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12.5, color: "rgba(200,205,215,0.65)",
    fontFamily: "'Inter',system-ui,sans-serif",
  };

  return createPortal(
    <div
      data-drawing-popup
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: "fixed", left, top, zIndex: 225,
        width: MW,
        background: "rgba(12,16,22,0.98)",
        backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
        border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14,
        boxShadow: "0 24px 80px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.04) inset",
        overflow: "hidden", userSelect: "none",
        animation: "ptPop .15s cubic-bezier(0.16,1,0.3,1) both",
      }}
    >
      <style>{`
        @keyframes ptPop{from{opacity:0;transform:translateY(7px) scale(0.97)}to{opacity:1;transform:none}}
        .pt-input:focus{border-color:rgba(183,255,90,0.35)!important;outline:none}
        .pt-input::-webkit-inner-spin-button,.pt-input::-webkit-outer-spin-button{-webkit-appearance:none}
      `}</style>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: drawing.toolType === "position_long" ? "#089981" : "#f23645",
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontFamily: "'Inter',system-ui,sans-serif" }}>
            {drawing.toolType === "position_long" ? "Long" : "Short"} Position
          </span>
        </div>
        <button onClick={onClose} style={{
          border: "none", background: "rgba(255,255,255,0.06)", cursor: "pointer",
          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 7, color: "rgba(255,255,255,0.5)",
        }}>
          <svg width={9} height={9} viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", padding: "0 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <button style={tabStyle("inputs")}   onClick={() => setTab("inputs")}>Inputs</button>
        <button style={tabStyle("style")}    onClick={() => setTab("style")}>Style</button>
        <button style={tabStyle("visibility")} onClick={() => setTab("visibility")}>Visibility</button>
      </div>

      {/* Tab content */}
      <div style={{ padding: "4px 0 8px" }}>

        {/* ── Inputs tab ── */}
        {tab === "inputs" && (
          <div style={{ padding: "4px 0" }}>
            {[
              { label: "Entry", val: entryVal, set: setEntryVal, commit: commitEntry },
              { label: "Take Profit", val: tpVal, set: setTpVal, commit: commitTp },
              { label: "Stop Loss", val: slVal, set: setSlVal, commit: commitSl },
            ].map(({ label, val, set, commit }) => (
              <div key={label} style={{ ...rowStyle, gap: 12 }}>
                <span style={{ ...labelStyle, width: 80, flexShrink: 0 }}>{label}</span>
                <input
                  className="pt-input"
                  type="number"
                  value={val}
                  onChange={e => set(e.target.value)}
                  onBlur={commit}
                  onKeyDown={e => { if (e.key === "Enter") commit(); }}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Style tab ── */}
        {tab === "style" && (
          <div style={{ padding: "4px 0" }}>
            {/* Profit color */}
            <div style={rowStyle}>
              <span style={labelStyle}>Profit zone</span>
              <div ref={profitSwatchRef} style={{ cursor: "pointer" }} onClick={() => { setShowProfitCP(v => !v); setShowStopCP(false); }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 7,
                  background: hexToRgba(profitHex, 0.9),
                  border: "2px solid rgba(255,255,255,0.18)",
                  boxShadow: showProfitCP ? `0 0 0 2px ${hexToRgba(profitHex,0.5)}` : "none",
                }} />
              </div>
            </div>

            {/* Stop color */}
            <div style={rowStyle}>
              <span style={labelStyle}>Stop zone</span>
              <div ref={stopSwatchRef} style={{ cursor: "pointer" }} onClick={() => { setShowStopCP(v => !v); setShowProfitCP(false); }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 7,
                  background: hexToRgba(stopHex, 0.9),
                  border: "2px solid rgba(255,255,255,0.18)",
                  boxShadow: showStopCP ? `0 0 0 2px ${hexToRgba(stopHex,0.5)}` : "none",
                }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Visibility tab ── */}
        {tab === "visibility" && (
          <div style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TIMEFRAME_OPTIONS.map(({ label, value }) => {
              const on = isTFVisible(value);
              return (
                <button
                  key={value}
                  onClick={() => toggleTF(value)}
                  style={{
                    padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                    fontSize: 12, fontWeight: 500,
                    background: on ? "rgba(183,255,90,0.12)" : "rgba(255,255,255,0.05)",
                    border: on ? "1px solid rgba(183,255,90,0.3)" : "1px solid rgba(255,255,255,0.08)",
                    color: on ? "rgba(183,255,90,0.9)" : "rgba(200,205,215,0.45)",
                    transition: "all .1s",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Style tab color pickers */}
      {showProfitCP && (
        <ColorPickerGlass
          value={profitHex}
          onChange={c => onUpdate({ profitColor: c })}
          onClose={() => setShowProfitCP(false)}
          anchorRect={profitSwatchRef.current?.getBoundingClientRect() ?? null}
        />
      )}
      {showStopCP && (
        <ColorPickerGlass
          value={stopHex}
          onChange={c => onUpdate({ stopColor: c })}
          onClose={() => setShowStopCP(false)}
          anchorRect={stopSwatchRef.current?.getBoundingClientRect() ?? null}
        />
      )}
    </div>,
    document.body
  );
}

// ── Main PositionToolbar ───────────────────────────────────────────────────

export const PositionToolbar = memo(function PositionToolbar({
  pos, drawing, visible = true,
  onUpdate, onUpdatePoints, onDelete, onLock, onHide, onDuplicate, onReverse,
}: {
  pos:            { x: number; y: number };
  drawing:        Drawing;
  visible?:       boolean;
  onUpdate:       (patch: Partial<DrawingStyle>) => void;
  onUpdatePoints: (pts: DrawingPoint[]) => void;
  onDelete:       () => void;
  onLock:         () => void;
  onHide:         () => void;
  onDuplicate:    () => void;
  onReverse:      () => void;
}) {
  const [showProfitCP, setShowProfitCP] = useState(false);
  const [showStopCP,   setShowStopCP]   = useState(false);
  const [showMore,     setShowMore]     = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [userPos,      setUserPos]      = useState<{ x: number; y: number } | null>(null);

  const prevIdRef      = useRef(drawing.id);
  const isDraggingRef  = useRef(false);
  const dragOriginRef  = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const dragElemRef    = useRef<HTMLElement | null>(null);
  const dragPointerRef = useRef<number | null>(null);
  const dragRafRef     = useRef<number | null>(null);

  const profitBtnRef = useRef<HTMLDivElement>(null);
  const stopBtnRef   = useRef<HTMLDivElement>(null);
  const moreBtnRef   = useRef<HTMLDivElement>(null);

  const S = drawing.style;
  const profitHex = S.profitColor ?? PROFIT_DEFAULT;
  const stopHex   = S.stopColor   ?? STOP_DEFAULT;

  // Reset position when drawing changes
  useEffect(() => {
    if (drawing.id !== prevIdRef.current) {
      prevIdRef.current = drawing.id;
      setUserPos(null);
    }
  }, [drawing.id]);

  // Close sub-popups when toolbar hides
  useEffect(() => {
    if (!visible) {
      setShowProfitCP(false);
      setShowStopCP(false);
      setShowMore(false);
      setShowSettings(false);
    }
  }, [visible]);

  // ── Toolbar positioning ──────────────────────────────────────────────────
  const TW = 460, TH = 46;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = pos.x - TW / 2;
  let top  = pos.y - TH - 14;
  left = Math.max(8, Math.min(left, vw - TW - 8));
  if (top < 8) top = Math.min(pos.y + 16, vh - TH - 8);
  top = Math.max(8, Math.min(top, vh - TH - 8));

  const finalLeft = userPos ? userPos.x : left;
  const finalTop  = userPos ? userPos.y : top;

  // ── Toolbar drag ─────────────────────────────────────────────────────────
  const onToolbarPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.2) {
      dragOriginRef.current = { startX: e.clientX, startY: e.clientY, originX: finalLeft, originY: finalTop };
      dragElemRef.current   = e.currentTarget as HTMLElement;
      dragPointerRef.current = e.pointerId;
    }
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragOriginRef.current) return;
    const dx = e.clientX - dragOriginRef.current.startX;
    const dy = e.clientY - dragOriginRef.current.startY;
    if (!isDraggingRef.current) {
      if (Math.hypot(dx, dy) < 4) return;
      isDraggingRef.current = true;
      dragElemRef.current?.setPointerCapture(dragPointerRef.current!);
    }
    const nx = Math.max(4, Math.min(vw - TW - 4, dragOriginRef.current.originX + dx));
    const ny = Math.max(4, Math.min(vh - TH - 4, dragOriginRef.current.originY + dy));
    if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
    dragRafRef.current = requestAnimationFrame(() => setUserPos({ x: nx, y: ny }));
  };
  const onDragUp = () => {
    dragOriginRef.current  = null;
    isDraggingRef.current  = false;
    dragElemRef.current    = null;
    dragPointerRef.current = null;
  };

  const closeAllPickers = () => {
    setShowProfitCP(false);
    setShowStopCP(false);
  };

  return createPortal(
    <>
      <style>{`
        @keyframes ptPop{from{opacity:0;transform:translateY(6px) scale(0.97)}to{opacity:1;transform:none}}
      `}</style>

      <div
        data-drawing-popup
        data-drawing-toolbar
        onClick={e => e.stopPropagation()}
        onPointerDown={onToolbarPointerDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        onPointerCancel={onDragUp}
        style={{
          position: "fixed", left: finalLeft, top: finalTop, zIndex: 200,
          display: "flex", alignItems: "center", gap: 2,
          background: "rgba(28,28,30,0.97)", backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10,
          padding: "5px 8px",
          boxShadow: "0 4px 28px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.04) inset",
          animation: visible ? "ptPop .14s cubic-bezier(0.16,1,0.3,1) both" : "none",
          userSelect: "none",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "all" : "none",
          transition: visible ? "none" : "opacity 0.08s ease",
          willChange: "transform, opacity",
          cursor: isDraggingRef.current ? "grabbing" : "default",
          touchAction: "none",
        }}
      >
        {/* ── 1. Drag handle ── */}
        <div
          title="Drag to reposition"
          style={{
            position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, paddingLeft: 2, paddingRight: 7, marginRight: 1,
            borderRight: "1px solid rgba(255,255,255,0.08)", cursor: "grab",
          }}
        >
          <img src={draggingSvg} style={{ width: 11, height: 24, filter: "brightness(0) invert(1)", opacity: 0.55, display: "block" }} draggable={false} />
        </div>

        {/* ── 2. Object list (grid) ── */}
        <PtBtn title="Objects tree">
          <img src={templateSvg} style={{ width: 15, height: 15, filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} draggable={false} />
        </PtBtn>

        {/* ── 3. Text style ── */}
        <PtBtn title="Text style">
          <img src={thalamSvg} style={{ width: 18, height: 18, filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} draggable={false} />
        </PtBtn>

        <PtSep />

        {/* ── 4. Profit fill color ── */}
        <div ref={profitBtnRef} style={{ display: "inline-flex" }}>
          <PtBtn
            title="Profit zone color"
            active={showProfitCP}
            onClick={() => { setShowProfitCP(v => !v); setShowStopCP(false); }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <img src={bucketSvg} style={{ width: 18, height: 18, filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} draggable={false} />
              <div style={{ width: 16, height: 3, borderRadius: 1.5, background: hexToRgba(profitHex, 0.95) }} />
            </div>
          </PtBtn>
        </div>

        {/* ── 5. Stop fill color ── */}
        <div ref={stopBtnRef} style={{ display: "inline-flex" }}>
          <PtBtn
            title="Stop zone color"
            active={showStopCP}
            onClick={() => { setShowStopCP(v => !v); setShowProfitCP(false); }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <img src={bucketSvg} style={{ width: 18, height: 18, filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} draggable={false} />
              <div style={{ width: 16, height: 3, borderRadius: 1.5, background: hexToRgba(stopHex, 0.95) }} />
            </div>
          </PtBtn>
        </div>

        <PtSep />

        {/* ── 6. Reverse ── */}
        <PtBtn title={drawing.toolType === "position_long" ? "Flip to short" : "Flip to long"} onClick={onReverse}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16V4m0 0L3 8m4-4 4 4"/>
            <path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
          </svg>
        </PtBtn>

        {/* ── 7. Alert ── */}
        <PtBtn title="Create alert">
          <img src={alertSvg} style={{ width: 18, height: 18, filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} draggable={false} />
        </PtBtn>

        {/* ── 7b. Settings ── */}
        <PtBtn title="Position settings" active={showSettings} onClick={() => { setShowSettings(v => !v); closeAllPickers(); }}>
          <img src={settingSvg} style={{ width: 18, height: 18, filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} draggable={false} />
        </PtBtn>

        <PtSep />

        {/* ── 9. Delete ── */}
        <PtBtn title="Delete position" danger onClick={onDelete}>
          <img src={binSvg} style={{ width: 18, height: 18, filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} draggable={false} />
        </PtBtn>

        <PtSep />

        {/* ── 10. More ── */}
        <div ref={moreBtnRef} style={{ display: "inline-flex" }}>
          <PtBtn title="More options" active={showMore} onClick={() => { setShowMore(v => !v); closeAllPickers(); }}>
            <img src={dotsSvg} style={{ width: 17, height: 5, filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} draggable={false} />
          </PtBtn>
        </div>
      </div>

      {/* Profit color picker */}
      {showProfitCP && (
        <ColorPickerGlass
          value={profitHex}
          onChange={c => onUpdate({ profitColor: c })}
          onClose={() => setShowProfitCP(false)}
          anchorRect={profitBtnRef.current?.getBoundingClientRect() ?? null}
        />
      )}

      {/* Stop color picker */}
      {showStopCP && (
        <ColorPickerGlass
          value={stopHex}
          onChange={c => onUpdate({ stopColor: c })}
          onClose={() => setShowStopCP(false)}
          anchorRect={stopBtnRef.current?.getBoundingClientRect() ?? null}
        />
      )}

      {/* More menu */}
      {showMore && (
        <MoreMenu
          anchorRect={moreBtnRef.current?.getBoundingClientRect() ?? null}
          onClose={() => setShowMore(false)}
          onDuplicate={onDuplicate}
          onHide={() => { onHide(); }}
          onReverse={() => { onReverse(); }}
          onLock={onLock}
          isLocked={drawing.isLocked ?? false}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <PositionSettingsModal
          drawing={drawing}
          pos={{ x: finalLeft + TW / 2, y: finalTop }}
          onUpdate={onUpdate}
          onUpdatePoints={onUpdatePoints}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>,
    document.body
  );
});
