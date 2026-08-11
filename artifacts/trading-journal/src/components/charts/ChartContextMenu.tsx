import { useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";
import {
  RotateCcw, EyeOff, Lock, Trash2, Camera,
  Settings, Ruler,
  TrendingUp, TrendingDown,
  Zap,
} from "lucide-react";
import { useChartStore } from "@/store/chartStore";
import { chartApiRef } from "@/lib/chartApiRef";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const NEON   = "#B7FF5A";
const BG     = "rgba(7,17,13,0.97)";
const BORDER = "rgba(183,255,90,0.13)";
const SEP    = "rgba(183,255,90,0.07)";
const LABEL  = "rgba(167,184,169,0.38)";
const ITEM   = "#C8E4CC";
const ICON   = "rgba(167,184,169,0.5)";

interface Props {
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
  onScreenshot: () => void;
  onShowSettings: () => void;
  onSelectInterval: (v: string) => void;
}

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

const ChartContextMenu = memo(function ChartContextMenu({
  x, y, isOpen, onClose, onScreenshot, onShowSettings, onSelectInterval,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { interval: currentInterval } = useChartStore();

  useEffect(() => {
    if (!isOpen) return;
    const onKey  = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown",    onKey);
    document.addEventListener("mousedown",  onDown, true);
    return () => {
      document.removeEventListener("keydown",   onKey);
      document.removeEventListener("mousedown", onDown, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const menuW = 210;
  const vw    = window.innerWidth;
  const vh    = window.innerHeight;
  const px    = x + menuW  + 8 > vw ? x - menuW  : x;
  const py    = y + 310    + 8 > vh ? y - 310     : y;

  const run = (fn: () => void) => { fn(); onClose(); };

  const resetChart = () => {
    const chart = chartApiRef.current;
    if (!chart) return;
    chart.timeScale().resetTimeScale();
    chart.timeScale().fitContent();
  };

  const hideAllDrawings = async () => {
    const { useDrawingStore } = await import("@/store/drawingStore");
    const { drawings, updateDrawing } = useDrawingStore.getState();
    const hasVisible = drawings.some(d => d.isVisible !== false);
    for (const d of drawings) {
      updateDrawing(d.id, { isVisible: !hasVisible });
      fetch(`${BASE}/api/drawings/${d.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVisible: !hasVisible }),
      }).catch(() => {});
    }
  };

  const lockAllDrawings = async () => {
    const { useDrawingStore } = await import("@/store/drawingStore");
    const { drawings, updateDrawing } = useDrawingStore.getState();
    const hasUnlocked = drawings.some(d => !d.isLocked);
    for (const d of drawings) {
      updateDrawing(d.id, { isLocked: hasUnlocked });
      fetch(`${BASE}/api/drawings/${d.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: hasUnlocked }),
      }).catch(() => {});
    }
  };

  const removeAllDrawings = async () => {
    const { useDrawingStore } = await import("@/store/drawingStore");
    const { drawings, removeDrawing } = useDrawingStore.getState();
    for (const d of drawings) {
      removeDrawing(d.id);
      fetch(`${BASE}/api/drawings/${d.id}`, { method: "DELETE" }).catch(() => {});
    }
  };

  const activateRuler = async () => {
    const { useDrawingStore } = await import("@/store/drawingStore");
    useDrawingStore.getState().setActiveTool("ruler");
  };

  return createPortal(
    <div
      ref={menuRef}
      data-chart-context-menu
      onContextMenu={e => e.preventDefault()}
      style={{
        position:   "fixed",
        top:        py,
        left:       px,
        width:      menuW,
        zIndex:     9999,
        background: BG,
        backdropFilter:        "blur(28px)",
        WebkitBackdropFilter:  "blur(28px)",
        border:     `1px solid ${BORDER}`,
        borderRadius: 10,
        boxShadow:  "0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(183,255,90,0.05)",
        overflow:   "hidden",
        userSelect: "none",
        animation:  "ctxFadeIn 0.11s cubic-bezier(0.16,1,0.3,1) both",
      }}
    >
      <style>{`
        @keyframes ctxFadeIn {
          from { opacity:0; transform:scale(0.95) translateY(-3px); }
          to   { opacity:1; transform:scale(1)    translateY(0); }
        }
        .cmi {
          display:flex; align-items:center; gap:8px;
          padding:5px 11px; width:100%;
          background:transparent; border:none; text-align:left; cursor:pointer;
          font-family:inherit; transition:background 80ms;
        }
        .cmi:hover { background:rgba(183,255,90,0.09); }
        .cmi:hover .cml { color:${NEON}; }
        .cmi:hover .cmi-icon { color:${NEON}; }
        .cmi.danger:hover { background:rgba(239,68,68,0.1); }
        .cmi.danger:hover .cml { color:#f87171; }
        .cmi.danger:hover .cmi-icon { color:#f87171; }
        .ctx-sep { height:1px; background:${SEP}; margin:2px 0; }
        .ctx-lbl { padding:6px 11px 2px; font-size:9px; font-weight:800; letter-spacing:.09em; color:${LABEL}; }
        .ctx-tf { display:flex; flex-wrap:wrap; gap:3px; padding:5px 9px 7px; }
        .ctf {
          padding:3px 7px; border-radius:5px;
          border:1px solid rgba(183,255,90,0.13); background:transparent;
          color:rgba(167,184,169,0.65); font-size:10.5px; font-weight:700;
          cursor:pointer; font-family:inherit; transition:all 100ms;
          display:flex; align-items:center; gap:3px;
        }
        .ctf:hover  { background:rgba(183,255,90,0.1); border-color:rgba(183,255,90,0.32); color:${NEON}; }
        .ctf.active { background:rgba(183,255,90,0.16); border-color:rgba(183,255,90,0.45); color:${NEON}; }
      `}</style>

      {/* SECTION 1 — TIMEFRAMES */}
      <div className="ctx-lbl">TIMEFRAME</div>
      <div className="ctx-tf">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.value}
            className={`ctf${currentInterval === tf.value ? " active" : ""}`}
            onClick={() => run(() => onSelectInterval(tf.value))}
          >
            <Zap style={{ width: 7, height: 7 }} />
            {tf.label}
          </button>
        ))}
      </div>

      <div className="ctx-sep" />

      {/* SECTION 2 — CHART ACTIONS */}
      <div className="ctx-lbl">CHART ACTIONS</div>
      <Btn icon={RotateCcw} label="Reset Chart View"    onClick={() => run(resetChart)} />
      <Btn icon={EyeOff}    label="Hide Drawings"       onClick={() => run(hideAllDrawings)} />
      <Btn icon={Lock}      label="Lock Drawings"       onClick={() => run(lockAllDrawings)} />
      <Btn icon={Trash2}    label="Remove All Drawings" onClick={() => run(removeAllDrawings)} danger />
      <Btn icon={Camera}    label="Screenshot Chart"    onClick={() => run(onScreenshot)} />

      <div className="ctx-sep" />

      {/* SECTION 3 — DRAWING TOOLS */}
      <div className="ctx-lbl">DRAWING TOOLS</div>
      <Btn
        icon={TrendingUp}
        label="Long Position"
        accent="#22c55e"
        onClick={() => run(async () => {
          const { useDrawingStore } = await import("@/store/drawingStore");
          useDrawingStore.getState().setActiveTool("position_long");
        })}
      />
      <Btn
        icon={TrendingDown}
        label="Short Position"
        accent="#f87171"
        onClick={() => run(async () => {
          const { useDrawingStore } = await import("@/store/drawingStore");
          useDrawingStore.getState().setActiveTool("position_short");
        })}
      />
      <Btn icon={Ruler} label="Measure Tool" onClick={() => run(activateRuler)} />

      <div className="ctx-sep" />

      {/* SECTION 4 — SETTINGS */}
      <div className="ctx-lbl">SETTINGS</div>
      <Btn icon={Settings} label="Chart Settings" onClick={() => run(onShowSettings)} />
    </div>,
    document.body
  );
});

function Btn({
  icon: Icon, label, onClick, danger, accent,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  danger?: boolean;
  accent?: string;
}) {
  return (
    <button className={`cmi${danger ? " danger" : ""}`} onClick={onClick}>
      <Icon className="cmi-icon" style={{ width: 12, height: 12, color: accent ?? ICON, flexShrink: 0 }} />
      <span className="cml" style={{ fontSize: 12, fontWeight: 500, color: ITEM }}>{label}</span>
    </button>
  );
}

export default ChartContextMenu;
