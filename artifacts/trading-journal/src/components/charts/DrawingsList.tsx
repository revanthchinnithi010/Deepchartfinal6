import { memo, useState } from "react";
import {
  TrendingUp, ArrowRight, Minus, AlignCenter,
  Square, GitMerge, Eye, EyeOff, Trash2, Layers,
} from "lucide-react";
import { useDrawingStore } from "@/store/drawingStore";
import type { Drawing } from "@/types/drawing";
import { AnimatedList, AnimatedListItem } from "@/components/animations";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TOOL_ICONS: Record<string, React.ElementType> = {
  trendline: TrendingUp,
  ray:       ArrowRight,
  hline:     Minus,
  vline:     AlignCenter,
  rect:      Square,
  fib:       GitMerge,
};

const TOOL_LABELS: Record<string, string> = {
  trendline: "Trendline",
  ray:       "Ray",
  hline:     "H. Line",
  vline:     "V. Line",
  rect:      "Rectangle",
  fib:       "Fibonacci",
};

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

function DrawingRow({ drawing }: { drawing: Drawing }) {
  const { updateDrawing, removeDrawing } = useDrawingStore();
  const [deleting, setDeleting] = useState(false);

  const Icon   = TOOL_ICONS[drawing.toolType] ?? TrendingUp;
  const label  = TOOL_LABELS[drawing.toolType] ?? drawing.toolType;
  const anchor = drawing.points[0];
  const priceStr = anchor
    ? anchor.price.toFixed(anchor.price > 1000 ? 2 : 5)
    : "—";

  const handleToggle = async () => {
    const next = !drawing.isVisible;
    updateDrawing(drawing.id, { isVisible: next });
    try {
      await fetch(`${BASE}/api/drawings/${drawing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVisible: next }),
      });
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    setDeleting(true);
    // Always remove locally and persist to deleted-set first (ensures no ghost after refresh)
    removeDrawing(drawing.id);
    try { await fetch(`${BASE}/api/drawings/${drawing.id}`, { method: "DELETE" }); } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  return (
    <div
      className="group flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-white/[0.02]"
      style={{
        borderBottom: "1px solid rgba(57,91,67,0.08)",
        opacity: drawing.isVisible ? 1 : 0.45,
      }}
    >
      {/* Tool icon */}
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
        style={{
          background: `${drawing.style.color}14`,
          border:     `1px solid ${drawing.style.color}30`,
        }}
      >
        <Icon className="w-3 h-3" style={{ color: drawing.style.color }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-semibold" style={{ color: "#F3FFF3" }}>
            {label}
          </span>
          {drawing.points.length > 1 && (
            <span className="text-[8.5px] px-1 rounded" style={{
              background: "rgba(57,91,67,0.2)",
              color: "rgba(167,184,169,0.6)",
            }}>
              {drawing.points.length}pt
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-mono" style={{ color: "rgba(167,184,169,0.5)" }}>
            @ {priceStr}
          </span>
          {drawing.createdAt && (
            <span className="text-[8.5px]" style={{ color: "rgba(167,184,169,0.3)" }}>
              · {timeAgo(drawing.createdAt)}
            </span>
          )}
        </div>
      </div>

      {/* Color swatch */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: drawing.style.color, boxShadow: `0 0 4px ${drawing.style.color}60` }}
      />

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleToggle}
          title={drawing.isVisible ? "Hide" : "Show"}
          className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:bg-white/[0.08]"
          style={{ color: "rgba(167,184,169,0.5)" }}
        >
          {drawing.isVisible
            ? <Eye className="w-3 h-3" />
            : <EyeOff className="w-3 h-3" />}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Delete"
          className="w-5 h-5 flex items-center justify-center rounded transition-colors hover:bg-red-500/20"
          style={{ color: "rgba(248,113,113,0.6)" }}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

interface Props {
  symbol:    string;
  timeframe: string;
}

export const DrawingsList = memo(function DrawingsList({ symbol, timeframe }: Props) {
  const { drawings } = useDrawingStore();

  const filtered = drawings.filter(
    (d) => d.symbol === symbol && d.timeframe === timeframe,
  );

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
        <Layers className="w-6 h-6" style={{ color: "rgba(167,184,169,0.2)" }} />
        <p className="text-[11px]" style={{ color: "rgba(167,184,169,0.4)" }}>
          No drawings on this chart
        </p>
        <p className="text-[9.5px]" style={{ color: "rgba(167,184,169,0.25)" }}>
          Use the toolbar on the left to draw trendlines, Fibonacci, and more
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#07110D" }}>
      {/* Column headers */}
      <div
        className="flex items-center px-4 py-1.5 shrink-0"
        style={{ borderBottom: "1px solid rgba(57,91,67,0.1)" }}
      >
        <span className="flex-1 text-[8.5px] font-bold uppercase tracking-wider" style={{ color: "rgba(167,184,169,0.35)" }}>
          Drawing / Price
        </span>
        <span className="text-[8.5px] font-bold uppercase tracking-wider mr-2" style={{ color: "rgba(167,184,169,0.35)" }}>
          {filtered.length} total
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "none" }}>
        <AnimatedList>
          {filtered.map((d) => (
            <AnimatedListItem key={d.id}>
              <DrawingRow drawing={d} />
            </AnimatedListItem>
          ))}
        </AnimatedList>
      </div>
    </div>
  );
});
