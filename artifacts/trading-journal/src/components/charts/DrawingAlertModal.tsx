import { useState, useEffect, useCallback, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, TrendingUp, ArrowRight, Minus, Square, Columns2,
  Check, Clock, AlertTriangle, ChevronUp, ChevronDown,
} from "lucide-react";
import type { Drawing } from "@/types/drawing";
import { useAlertStore } from "@/store/alertStore";
import type { TrendlineAlert } from "@/data/alertsData";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DrawingType = "trendline" | "ray" | "horizontal_line" | "rectangle" | "channel";

export interface DrawingAlertRow {
  id: number;
  symbol: string;
  timeframe: string;
  drawingType: string;
  condition: string;
  alertStatus: string;
  point1Price: number;
  point1Time: string;
  point2Price: number;
  point2Time: string;
  notes: string | null;
  telegramEnabled: boolean;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt: string | null;
  triggeredPrice: number | null;
  cooldownUntil: string | null;
  repeatMode?: import("@/data/alertsData").RepeatMode;
  createdAt: string;
  /** Display ID of the chart drawing this alert was created from (e.g. "TL-004"). */
  drawingDisplayId?: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

const DRAWING_OPTIONS: { value: DrawingType; label: string; icon: React.ElementType }[] = [
  { value: "trendline",       label: "Trendline", icon: TrendingUp },
  { value: "ray",             label: "Ray",        icon: ArrowRight },
  { value: "horizontal_line", label: "H. Line",    icon: Minus },
  { value: "rectangle",       label: "Zone",       icon: Square },
  { value: "channel",         label: "Channel",    icon: Columns2 },
];

const CONDITIONS: Record<DrawingType, { value: string; label: string }[]> = {
  trendline:       [
    { value: "cross_above", label: "Cross ↑" },
    { value: "cross_below", label: "Cross ↓" },
    { value: "touch",       label: "Touch" },
    { value: "break",       label: "Break" },
    { value: "retest",      label: "Retest" },
    { value: "rejection",   label: "Rejection" },
    { value: "atr_proximity", label: "ATR Proximity" },
  ],
  ray:             [
    { value: "cross_above", label: "Cross ↑" },
    { value: "cross_below", label: "Cross ↓" },
    { value: "touch",       label: "Touch" },
    { value: "break",       label: "Break" },
    { value: "retest",      label: "Retest" },
    { value: "rejection",   label: "Rejection" },
    { value: "atr_proximity", label: "ATR Proximity" },
  ],
  horizontal_line: [
    { value: "above_price", label: "Above" },
    { value: "below_price", label: "Below" },
    { value: "touch_price", label: "Touch" },
  ],
  rectangle:       [
    { value: "enter_zone",  label: "Enter" },
    { value: "exit_zone",   label: "Exit" },
    { value: "breakout",    label: "Break" },
    { value: "rejection",   label: "Reject" },
  ],
  channel:         [
    { value: "cross_above", label: "Cross ↑" },
    { value: "cross_below", label: "Cross ↓" },
    { value: "touch",       label: "Touch" },
    { value: "break",       label: "Break" },
    { value: "retest",      label: "Retest" },
    { value: "rejection",   label: "Rejection" },
    { value: "atr_proximity", label: "ATR Proximity" },
  ],
};

const TIMEFRAMES = ["1m","5m","15m","30m","1H","4H","1D","1W"];

// ── UTC helpers ───────────────────────────────────────────────────────────────

/** Returns { dateStr:"YYYY-MM-DD", hh:"HH", mm:"MM" } in UTC for given ms */
function msToUtcParts(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateStr: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hh: pad(d.getUTCHours()),
    mm: pad(d.getUTCMinutes()),
  };
}

/** Combine dateStr + hh + mm → UTC ISO string */
function partsToISO(dateStr: string, hh: string, mm: string): string | null {
  if (!dateStr || hh === "" || mm === "") return null;
  const iso = `${dateStr}T${hh.padStart(2,"0")}:${mm.padStart(2,"0")}:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse existing ISO → parts */
function isoToParts(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateStr: `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`,
    hh: pad(d.getUTCHours()),
    mm: pad(d.getUTCMinutes()),
  };
}

// ── Custom 24h DateTime Picker ────────────────────────────────────────────────

interface DTState { dateStr: string; hh: string; mm: string }

interface DateTimePickerProps {
  label: string;
  value: DTState;
  onChange: (v: DTState) => void;
  presets?: { label: string; offsetMs: number }[];
  error?: boolean;
}

const DATE_TIME_PRESETS = [
  { label: "Now",  offsetMs: 0 },
  { label: "+5m",  offsetMs: 5 * 60_000 },
  { label: "+15m", offsetMs: 15 * 60_000 },
  { label: "+1H",  offsetMs: 60 * 60_000 },
];

const DateTimePicker = memo(function DateTimePicker({ label, value, onChange, error }: DateTimePickerProps) {
  const hhRef = useRef<HTMLInputElement>(null);
  const mmRef = useRef<HTMLInputElement>(null);

  const applyPreset = useCallback((offsetMs: number) => {
    const parts = msToUtcParts(Date.now() + offsetMs);
    onChange(parts);
  }, [onChange]);

  const setHH = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    if (raw === "") { onChange({ ...value, hh: "" }); return; }
    if (isNaN(n) || n < 0 || n > 23) return;
    const hh = String(n).padStart(2, "0");
    onChange({ ...value, hh });
    if (raw.length >= 2) mmRef.current?.focus();
  }, [value, onChange]);

  const setMM = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    if (raw === "") { onChange({ ...value, mm: "" }); return; }
    if (isNaN(n) || n < 0 || n > 59) return;
    onChange({ ...value, mm: String(n).padStart(2, "0") });
  }, [value, onChange]);

  const baseInputStyle: React.CSSProperties = {
    background: "rgba(13,28,22,0.9)",
    border: `1px solid ${error ? "rgba(239,68,68,0.5)" : "rgba(57,91,67,0.4)"}`,
    borderRadius: 10,
    color: "#F3FFF3",
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9px] font-bold uppercase tracking-widest"
        style={{ color: "rgba(167,184,169,0.5)" }}>{label}</span>

      {/* Preset chips */}
      <div className="flex gap-1.5 flex-wrap">
        {DATE_TIME_PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.offsetMs)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95"
            style={{
              background: "rgba(183,255,90,0.08)",
              border: "1px solid rgba(183,255,90,0.22)",
              color: "#B7FF5A",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.18)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 8px rgba(183,255,90,0.2)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(183,255,90,0.08)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date + Time row */}
      <div className="flex items-center gap-2">
        {/* Calendar date */}
        <div className="flex-1 relative">
          <input
            type="date"
            value={value.dateStr}
            onChange={e => onChange({ ...value, dateStr: e.target.value })}
            className="w-full h-10 px-3 text-[12px] font-mono rounded-xl appearance-none"
            style={{
              ...baseInputStyle,
              colorScheme: "dark",
              minWidth: 0,
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = "rgba(183,255,90,0.6)";
              e.currentTarget.style.boxShadow = "0 0 0 2px rgba(183,255,90,0.12), 0 0 16px rgba(183,255,90,0.08)";
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = error ? "rgba(239,68,68,0.5)" : "rgba(57,91,67,0.4)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {/* 24h time — HH : MM */}
        <div className="flex items-center gap-1 flex-shrink-0"
          style={{
            background: "rgba(13,28,22,0.9)",
            border: `1px solid ${error ? "rgba(239,68,68,0.5)" : "rgba(57,91,67,0.4)"}`,
            borderRadius: 10,
            padding: "0 8px",
            height: 40,
          }}>
          <input
            ref={hhRef}
            type="number"
            min={0} max={23}
            value={value.hh}
            onChange={e => setHH(e.target.value)}
            placeholder="HH"
            inputMode="numeric"
            className="w-8 h-full text-center text-[13px] font-mono font-bold bg-transparent border-none outline-none"
            style={{ color: value.hh ? "#B7FF5A" : "rgba(167,184,169,0.35)", MozAppearance: "textfield" }}
          />
          <span className="text-[14px] font-bold pb-0.5" style={{ color: "rgba(167,184,169,0.4)" }}>:</span>
          <input
            ref={mmRef}
            type="number"
            min={0} max={59}
            value={value.mm}
            onChange={e => setMM(e.target.value)}
            placeholder="MM"
            inputMode="numeric"
            className="w-8 h-full text-center text-[13px] font-mono font-bold bg-transparent border-none outline-none"
            style={{ color: value.mm ? "#B7FF5A" : "rgba(167,184,169,0.35)", MozAppearance: "textfield" }}
          />
          <span className="text-[9px] font-bold ml-1" style={{ color: "rgba(167,184,169,0.3)" }}>UTC</span>
        </div>
      </div>

      {/* Formatted preview */}
      {value.dateStr && value.hh !== "" && value.mm !== "" && (
        <p className="text-[9.5px] font-mono pl-1" style={{ color: "rgba(167,184,169,0.45)" }}>
          {value.dateStr} {String(value.hh).padStart(2,"0")}:{String(value.mm).padStart(2,"0")} UTC
        </p>
      )}
    </div>
  );
});

// ── Spinner toggle ────────────────────────────────────────────────────────────

function NumberStepper({
  label, value, onChange, min = 0, step = 1, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  min?: number; step?: number; placeholder?: string;
}) {
  const inc = () => {
    const n = parseFloat(value) || 0;
    onChange(String(Math.round((n + step) * 1e6) / 1e6));
  };
  const dec = () => {
    const n = parseFloat(value) || 0;
    const next = Math.round((n - step) * 1e6) / 1e6;
    if (next < min) return;
    onChange(String(next));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest"
        style={{ color: "rgba(167,184,169,0.5)" }}>{label}</span>
      <div className="flex items-center rounded-xl overflow-hidden h-10"
        style={{
          background: "rgba(13,28,22,0.9)",
          border: "1px solid rgba(57,91,67,0.4)",
        }}>
        <input
          type="number"
          step={step}
          min={min}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode="decimal"
          className="flex-1 h-full px-3 text-[12.5px] font-mono bg-transparent border-none outline-none"
          style={{ color: "#F3FFF3", MozAppearance: "textfield" }}
          onFocus={e => {
            (e.currentTarget.parentElement as HTMLElement).style.borderColor = "rgba(183,255,90,0.6)";
            (e.currentTarget.parentElement as HTMLElement).style.boxShadow = "0 0 0 2px rgba(183,255,90,0.12)";
          }}
          onBlur={e => {
            (e.currentTarget.parentElement as HTMLElement).style.borderColor = "rgba(57,91,67,0.4)";
            (e.currentTarget.parentElement as HTMLElement).style.boxShadow = "none";
          }}
        />
        <div className="flex flex-col border-l h-full"
          style={{ borderColor: "rgba(57,91,67,0.3)" }}>
          <button type="button" onClick={inc}
            className="flex-1 flex items-center justify-center px-2 transition-colors hover:bg-white/[0.06]">
            <ChevronUp className="w-3 h-3" style={{ color: "rgba(167,184,169,0.5)" }} />
          </button>
          <div style={{ height: 1, background: "rgba(57,91,67,0.25)" }} />
          <button type="button" onClick={dec}
            className="flex-1 flex items-center justify-center px-2 transition-colors hover:bg-white/[0.06]">
            <ChevronDown className="w-3 h-3" style={{ color: "rgba(167,184,169,0.5)" }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pill selector ─────────────────────────────────────────────────────────────

function PillSelector<T extends string>({
  label, options, value, onChange, accent = "#B7FF5A",
}: {
  label: string;
  options: { value: T; label: string; icon?: React.ElementType }[];
  value: T;
  onChange: (v: T) => void;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9px] font-bold uppercase tracking-widest"
        style={{ color: "rgba(167,184,169,0.5)" }}>{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(opt => {
          const Icon   = opt.icon;
          const active = value === opt.value;
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "tween", duration: 0.09, ease: "easeOut" }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-colors min-h-[36px]"
              style={{
                background: active ? `${accent}18` : "rgba(13,28,22,0.8)",
                border:     `1px solid ${active ? `${accent}55` : "rgba(57,91,67,0.35)"}`,
                color:      active ? accent : "rgba(167,184,169,0.65)",
                boxShadow:  active ? `0 0 12px ${accent}18` : "none",
              }}
            >
              {Icon && <Icon className="w-3 h-3 shrink-0" />}
              {opt.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative shrink-0 transition-colors"
      style={{
        width: 44, height: 24,
        background: checked ? "#B7FF5A" : "rgba(57,91,67,0.35)",
        borderRadius: 12,
        boxShadow: checked ? "0 0 12px rgba(183,255,90,0.3)" : "none",
        transition: "background 0.2s, box-shadow 0.2s",
      }}
    >
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="absolute top-1 w-4 h-4 rounded-full bg-white"
        style={{ left: checked ? 24 : 4, boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
      />
    </button>
  );
}

// ── Live UTC clock ────────────────────────────────────────────────────────────

function useUtcClock() {
  const [parts, setParts] = useState(() => msToUtcParts(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setParts(msToUtcParts(Date.now())), 15_000);
    return () => clearInterval(id);
  }, []);
  return parts;
}

// ── localStorage persistence ──────────────────────────────────────────────────

function usePersisted<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : fallback;
    } catch { return fallback; }
  });
  const set = useCallback((v: T) => {
    setState(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key]);
  return [state, set];
}

// ── toolType → DrawingType helper ─────────────────────────────────────────────

function toolTypeToDrawingType(toolType: string): DrawingType {
  const map: Record<string, DrawingType> = {
    trendline:  "trendline",
    ray:        "ray",
    hline:      "horizontal_line",
    rect:       "rectangle",
    channel:    "channel",
    extended:   "trendline",
  };
  return map[toolType] ?? "trendline";
}

// ── Main Modal ────────────────────────────────────────────────────────────────

const EMPTY_DT: DTState = { dateStr: "", hh: "", mm: "" };

interface Props {
  symbol: string;
  currentInterval: string;
  currentPrice: number | null;
  onClose: () => void;
  onCreated: () => void;
  editItem?: DrawingAlertRow | null;
  prefillDrawing?: Drawing;
}

export function DrawingAlertModal({
  symbol, currentInterval, currentPrice, onClose, onCreated, editItem, prefillDrawing,
}: Props) {
  const utcClock = useUtcClock();

  // ── Persisted preferences ───────────────────────────────────────────────────
  const defaultTF = editItem?.timeframe
    ?? (() => {
      const map: Record<string,string> = {
        "1":"1m","5":"5m","15":"15m","30":"30m","60":"1H","240":"4H","D":"1D","W":"1W",
      };
      return map[currentInterval] ?? "1H";
    })();
  const defaultCond = editItem?.condition ?? "cross_above";

  const [drawingType, setDrawingType]   = useState<DrawingType>(() => {
    if (editItem) return (editItem.drawingType ?? "trendline") as DrawingType;
    if (prefillDrawing) return toolTypeToDrawingType(prefillDrawing.toolType);
    return "trendline";
  });
  const [timeframe,   setTimeframe]     = usePersisted<string>("dal_tf",   defaultTF);
  const [condition,   setCondition]     = usePersisted<string>("dal_cond", defaultCond);
  const [telegram,    setTelegram]      = useState(editItem?.telegramEnabled ?? true);
  const [notes,       setNotes]         = useState(editItem?.notes ?? "");
  const [saving,      setSaving]        = useState(false);
  const [error,       setError]         = useState("");

  // Price states — auto-fill from prefillDrawing if available
  const defaultP1 = String(
    editItem?.point1Price ??
    prefillDrawing?.points[0]?.price ??
    currentPrice ?? ""
  );
  const defaultP2 = String(
    editItem?.point2Price ??
    prefillDrawing?.points[1]?.price ??
    currentPrice ?? ""
  );
  const [p1Price,  setP1Price]  = useState(defaultP1);
  const [p2Price,  setP2Price]  = useState(defaultP2);

  // Datetime states — auto-fill from prefillDrawing points (time is in Unix seconds)
  const [p1DT, setP1DT] = useState<DTState>(() => {
    if (editItem) return isoToParts(editItem.point1Time);
    if (prefillDrawing?.points[0]?.time) return msToUtcParts(prefillDrawing.points[0].time * 1000);
    return EMPTY_DT;
  });
  const [p2DT, setP2DT] = useState<DTState>(() => {
    if (editItem) return isoToParts(editItem.point2Time);
    if (prefillDrawing?.points[1]?.time) return msToUtcParts(prefillDrawing.points[1].time * 1000);
    return EMPTY_DT;
  });

  const isHLine = drawingType === "horizontal_line";

  // Sync condition when drawing type changes
  useEffect(() => {
    const conds = CONDITIONS[drawingType];
    if (!conds.some(c => c.value === condition)) {
      setCondition(conds[0].value);
    }
  }, [drawingType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time time validation
  const p1ISO = partsToISO(p1DT.dateStr, p1DT.hh, p1DT.mm);
  const p2ISO = partsToISO(p2DT.dateStr, p2DT.hh, p2DT.mm);
  const timeOrderError = !isHLine && p1ISO && p2ISO && new Date(p1ISO) >= new Date(p2ISO)
    ? "Point 2 must be after Point 1"
    : null;

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");

    const p1p = parseFloat(p1Price);
    const p2p = isHLine ? p1p : parseFloat(p2Price);
    if (isNaN(p1p) || p1p <= 0) { setError("Enter a valid Point 1 price."); return; }
    if (!isHLine && (isNaN(p2p) || p2p <= 0)) { setError("Enter a valid Point 2 price."); return; }
    if (!isHLine && !p1ISO) { setError("Enter Point 1 date and time (UTC)."); return; }
    if (!isHLine && !p2ISO) { setError("Enter Point 2 date and time (UTC)."); return; }
    if (timeOrderError) { setError(timeOrderError); return; }

    const body: Record<string, unknown> = {
      symbol,
      timeframe,
      drawingType,
      condition,
      point1Price: p1p,
      point1Time:  isHLine ? new Date(Date.now() - 3_600_000).toISOString() : p1ISO!,
      point2Price: p2p,
      point2Time:  isHLine ? new Date().toISOString() : p2ISO!,
      telegramEnabled: telegram,
      repeatMode: editItem?.repeatMode ?? "three_reminders",
      notes: notes.trim() || undefined,
      ...(prefillDrawing?.displayId ? { drawingDisplayId: prefillDrawing.displayId } : {}),
    };

    setSaving(true);
    try {
      const url    = editItem ? `/api/trendlines/${editItem.id}` : "/api/trendlines";
      const method = editItem ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? `Server error (${res.status})`); return;
      }
      const saved = await res.json().catch(() => ({})) as Record<string, unknown>;
      // Sync to the global store using the same t_<db-id> convention used by
      // /api/trendlines. This is critical: delete/pause actions can now resolve
      // the correct backend table instead of accidentally calling /api/alerts.
      const serverId = (saved.id as number | undefined);
      const storeAlert: TrendlineAlert = {
        id: `t_${serverId ?? Date.now()}`,
        type: "trendline",
        symbol: String(saved.symbol ?? symbol),
        timeframe: String(saved.timeframe ?? timeframe),
        condition: (String(saved.condition ?? condition) as TrendlineAlert["condition"]),
        point1Price: Number(saved.point1Price ?? p1p),
        point1Time: String(saved.point1Time ?? (isHLine ? new Date(Date.now() - 3_600_000).toISOString() : p1ISO!)),
        point2Price: Number(saved.point2Price ?? p2p),
        point2Time: String(saved.point2Time ?? (isHLine ? new Date().toISOString() : p2ISO!)),
        notes: String(saved.notes ?? notes.trim() ?? ""),
        status: saved.isTriggered ? "triggered" : saved.isActive === false ? "paused" : "active",
        createdAt: String(saved.createdAt ?? new Date().toISOString()),
        triggeredAt: (saved.triggeredAt as string | null) ?? null,
        repeatMode: (saved.repeatMode as TrendlineAlert["repeatMode"]) ?? editItem?.repeatMode ?? "three_reminders",
        atrPeriod: Number(saved.atrPeriod ?? 14),
        atrMultiplier: Number(saved.atrMultiplier ?? 0.15),
      };
      if (editItem) {
        useAlertStore.getState().updateAlert(storeAlert.id, storeAlert);
      } else {
        useAlertStore.getState().addAlert(storeAlert);
      }
      onCreated(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally { setSaving(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        data-drawing-popup
        className="fixed inset-0 z-[250] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Panel */}
        <motion.div
          key="panel"
          initial={{ opacity: 0, scale: 0.985, y: 16 }}
          animate={{ opacity: 1, scale: 1,     y: 0 }}
          exit={{   opacity: 0, scale: 0.985,  y: 16 }}
          transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
          className="w-full max-w-[500px] max-h-[92dvh] flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: "rgba(7,17,13,0.96)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(183,255,90,0.12)",
            boxShadow: "0 0 0 1px rgba(57,91,67,0.2), 0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(183,255,90,0.04)",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 py-4 shrink-0"
            style={{ borderBottom: "1px solid rgba(57,91,67,0.18)" }}>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{
                  background: "rgba(183,255,90,0.1)",
                  border: "1px solid rgba(183,255,90,0.25)",
                  boxShadow: "0 0 12px rgba(183,255,90,0.1)",
                }}>
                <TrendingUp className="w-3.5 h-3.5" style={{ color: "#B7FF5A" }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-bold text-white leading-none">
                    {editItem ? "Edit Alert" : "New Drawing Alert"}
                  </p>
                  {prefillDrawing?.displayId && !editItem && (
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(183,255,90,0.12)",
                        border:     "1px solid rgba(183,255,90,0.3)",
                        color:      "#B7FF5A",
                      }}
                    >
                      {prefillDrawing.displayId}
                    </span>
                  )}
                </div>
                <p className="text-[10px] mt-0.5 font-mono" style={{ color: "rgba(167,184,169,0.5)" }}>
                  {symbol}
                </p>
              </div>
            </div>
            {/* Live UTC */}
            <div className="flex items-center gap-2 mr-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: "rgba(13,28,22,0.8)", border: "1px solid rgba(57,91,67,0.3)" }}>
                <Clock className="w-2.5 h-2.5" style={{ color: "rgba(167,184,169,0.5)" }} />
                <span className="font-mono text-[10.5px] font-bold tabular-nums" style={{ color: "#B7FF5A" }}>
                  {utcClock.hh}:{utcClock.mm}
                </span>
                <span className="text-[8.5px]" style={{ color: "rgba(167,184,169,0.4)" }}>UTC</span>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/[0.08]"
                style={{ color: "rgba(167,184,169,0.5)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Body (scrollable) ── */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5"
            style={{ scrollbarWidth: "none" }}>

            {/* Chart UTC notice */}
            <p className="text-[9.5px] text-center py-1.5 rounded-lg"
              style={{
                background: "rgba(56,189,248,0.06)",
                border: "1px solid rgba(56,189,248,0.15)",
                color: "rgba(56,189,248,0.75)",
              }}>
              Chart time uses UTC. Enter the exact candle time shown on TradingView.
            </p>

            {/* Drawing type */}
            <PillSelector
              label="Drawing Type"
              value={drawingType}
              onChange={(v) => setDrawingType(v as DrawingType)}
              options={DRAWING_OPTIONS}
            />

            {/* Condition */}
            <PillSelector
              label="Alert Condition"
              value={condition as DrawingType}
              onChange={setCondition as (v: DrawingType) => void}
              options={CONDITIONS[drawingType]}
            />

            {/* Timeframe */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest"
                style={{ color: "rgba(167,184,169,0.5)" }}>Timeframe</span>
              <div className="flex gap-1.5 flex-wrap">
                {TIMEFRAMES.map(tf => {
                  const active = timeframe === tf;
                  return (
                    <motion.button
                      key={tf}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: "tween", duration: 0.09, ease: "easeOut" }}
                      onClick={() => setTimeframe(tf)}
                      className="min-w-[40px] px-2.5 py-2 rounded-xl text-[11px] font-bold transition-colors"
                      style={{
                        background: active ? "rgba(183,255,90,0.14)" : "rgba(13,28,22,0.8)",
                        border:     `1px solid ${active ? "rgba(183,255,90,0.45)" : "rgba(57,91,67,0.3)"}`,
                        color:      active ? "#B7FF5A" : "rgba(167,184,169,0.6)",
                        boxShadow:  active ? "0 0 10px rgba(183,255,90,0.15)" : "none",
                      }}
                    >
                      {tf}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* ── Coordinates ── */}
            {isHLine ? (
              <NumberStepper
                label="Price Level"
                value={p1Price}
                onChange={setP1Price}
                min={0}
                step={0.0001}
                placeholder="e.g. 1.16384"
              />
            ) : (
              <>
                {/* Point 1 */}
                <div className="rounded-xl p-4 space-y-4"
                  style={{
                    background: "rgba(13,28,22,0.6)",
                    border: "1px solid rgba(57,91,67,0.25)",
                  }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "rgba(167,184,169,0.45)" }}>Point 1</p>
                  <NumberStepper
                    label="Price"
                    value={p1Price}
                    onChange={setP1Price}
                    min={0}
                    step={0.0001}
                    placeholder="Price"
                  />
                  <DateTimePicker
                    label="Time (UTC)"
                    value={p1DT}
                    onChange={setP1DT}
                    error={!!timeOrderError}
                  />
                </div>

                {/* Validation warning between the two */}
                <AnimatePresence>
                  {timeOrderError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl overflow-hidden"
                      style={{
                        background: "rgba(251,191,36,0.08)",
                        border: "1px solid rgba(251,191,36,0.25)",
                      }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "#fbbf24" }} />
                      <p className="text-[10.5px] font-semibold" style={{ color: "#fbbf24" }}>
                        {timeOrderError}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Point 2 */}
                <div className="rounded-xl p-4 space-y-4"
                  style={{
                    background: "rgba(13,28,22,0.6)",
                    border: "1px solid rgba(57,91,67,0.25)",
                  }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "rgba(167,184,169,0.45)" }}>Point 2</p>
                  <NumberStepper
                    label="Price"
                    value={p2Price}
                    onChange={setP2Price}
                    min={0}
                    step={0.0001}
                    placeholder="Price"
                  />
                  <DateTimePicker
                    label="Time (UTC)"
                    value={p2DT}
                    onChange={setP2DT}
                    error={!!timeOrderError}
                  />
                </div>
              </>
            )}

            {/* Telegram toggle */}
            <div className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{
                background: "rgba(13,28,22,0.8)",
                border: "1px solid rgba(57,91,67,0.25)",
              }}>
              <div>
                <p className="text-[12px] font-semibold text-white">Telegram Alert</p>
                <p className="text-[9.5px] mt-0.5" style={{ color: "rgba(167,184,169,0.45)" }}>
                  Push notification when triggered
                </p>
              </div>
              <Toggle checked={telegram} onChange={setTelegram} />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest"
                style={{ color: "rgba(167,184,169,0.5)" }}>Notes (optional)</span>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Setup description, trade thesis…"
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl text-[12px] text-[#F3FFF3] resize-none"
                style={{
                  background: "rgba(13,28,22,0.9)",
                  border: "1px solid rgba(57,91,67,0.35)",
                  outline: "none",
                  lineHeight: 1.5,
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = "rgba(183,255,90,0.5)";
                  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(183,255,90,0.1)";
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = "rgba(57,91,67,0.35)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                  }}
                >
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-[11.5px] text-red-400">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center gap-3 px-5 py-4 shrink-0"
            style={{ borderTop: "1px solid rgba(57,91,67,0.18)" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-11 rounded-xl text-[12px] font-semibold transition-colors hover:bg-white/[0.06]"
              style={{
                color: "rgba(167,184,169,0.7)",
                border: "1px solid rgba(57,91,67,0.3)",
              }}
            >
              Cancel
            </button>
            <motion.button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !!timeOrderError}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "tween", duration: 0.09, ease: "easeOut" }}
              className="flex-[2] flex items-center justify-center gap-2 h-11 rounded-xl text-[13px] font-bold transition-all"
              style={{
                background: saving || timeOrderError ? "rgba(183,255,90,0.3)" : "#B7FF5A",
                color: "#07110D",
                boxShadow: saving || timeOrderError ? "none" : "0 0 20px rgba(183,255,90,0.25)",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? (
                <div className="w-4 h-4 rounded-full border-2 border-[#07110D]/40 border-t-[#07110D] animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {editItem ? "Save Changes" : "Create Alert"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
