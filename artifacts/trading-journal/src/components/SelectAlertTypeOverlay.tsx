/**
 * SelectAlertTypeOverlay — premium redesign
 *
 * Navigation:
 *   DashboardMarketsOverlay → (watchlist tap) → SelectAlertTypeOverlay
 *                             → (card tap)    → existing creation modal
 *
 * Header pattern matches every other overlay in the app:
 *   single div, height = 60px + safe-area-inset-top, paddingTop = safe-area-inset-top,
 *   alignItems: center  →  content sits perfectly centred in the 60px zone below the notch.
 */

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { AppHeader } from "@/components/AppHeader";
import { useSymbolTick } from "@/store/tickStore";
import { useAlertStore } from "@/store/alertStore";
import { useDrawingStore } from "@/store/drawingStore";
import type { Drawing } from "@/types/drawing";
import {
  FieldRow,
  AlertSelect,
  UTCDateTimePicker,
} from "@/pages/alerts";
import { Input } from "@/components/ui/input";
import { AnimatedButton } from "@/components/animations";
import type { PriceAlert, ZoneAlert, TrendlineAlert, RepeatMode } from "@/data/alertsData";
import { TIMEFRAMES, SYMBOLS } from "@/data/alertsData";
import {
  COMPOSITOR_EASE,
  COMPOSITOR_EASE_CLOSE,
  TAP_TRANSITION,
  EASE,
  DUR_STANDARD,
  tweenFast,
} from "@/animations/motion";
import { useChartStore } from "@/store/chartStore";
import { SYMBOL_CATALOG, deriveMeta } from "@/store/brokerWatchlistStore";
import { TrendingUp, TrendingDown, AlertTriangle, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DUR_OPEN  = 320;
const DUR_CLOSE = 240;

// All timeframes shown in the horizontal pill strip (superset of TIMEFRAMES dropdown)
const TF_PILLS = ["1M", "5M", "10M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"] as const;

// ── Keyframes (injected once) ────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("__sat_kf__")) {
  const s = document.createElement("style");
  s.id = "__sat_kf__";
  s.textContent = `
    @keyframes sat-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.65)} }
    @keyframes sat-ripple { 0%{transform:scale(0);opacity:.28} 100%{transform:scale(3);opacity:0} }
    @keyframes sat-flash  { 0%{opacity:1} 25%{opacity:.5} 100%{opacity:1} }
  `;
  document.head.appendChild(s);
}

// ── Timeframe normalisation ───────────────────────────────────────────────────
// Chart stores interval as numeric minutes ("60", "15", "240" …).
// The alert dropdown uses human labels ("1H", "15M", "4H" …).
// Drawings are saved with whatever format the chart had at draw-time, so we
// must normalise both sides to a canonical numeric-minutes string before comparing.

const TF_TO_MINUTES: Record<string, string> = {
  // numeric → canonical
  "1": "1", "3": "3", "5": "5", "10": "10", "15": "15", "30": "30",
  "45": "45", "60": "60", "120": "120", "240": "240",
  "480": "480", "720": "720", "1440": "1440", "10080": "10080",
  // human labels → canonical
  "1M": "1", "3M": "3", "5M": "5", "10M": "10", "15M": "15", "30M": "30",
  "45M": "45", "1H": "60", "2H": "120", "4H": "240",
  "6H": "360", "8H": "480", "12H": "720", "1D": "1440", "D": "1440",
  "1W": "10080", "W": "10080",
};

/** Convert any interval/timeframe string to canonical numeric-minutes string. */
function toCanonicalMinutes(tf: string): string {
  return TF_TO_MINUTES[tf] ?? TF_TO_MINUTES[tf.toUpperCase()] ?? tf;
}

/** Convert a numeric-minutes interval to the human label used in the dropdown. */
function intervalToHumanTf(interval: string): string {
  const minutesToLabel: Record<string, string> = {
    "1": "1M", "3": "3M", "5": "5M", "10": "10M", "15": "15M", "30": "30M",
    "45": "45M", "60": "1H", "120": "2H", "240": "4H",
    "480": "8H", "720": "12H", "1440": "1D", "10080": "1W",
  };
  const canon = toCanonicalMinutes(interval);
  return minutesToLabel[canon] ?? interval.toUpperCase();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatPrice(p: number): string {
  if (!isFinite(p) || p <= 0) return "—";
  if (p >= 10_000) return p.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (p >= 100)    return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1)      return p.toFixed(4);
  if (p >= 0.001)  return p.toFixed(6);
  return p.toFixed(8);
}

/**
 * Format a drawing price with sane decimal precision based on magnitude.
 * ≥ 1,000  → 2 dp with thousands separator (BTC, ETH, indices)
 * ≥ 100    → 2 dp (gold, mid-cap)
 * ≥ 10     → 3 dp
 * ≥ 1      → 5 dp (forex pairs like EURUSD)
 * < 1      → 6 dp (DOGE, PEPE, micro-alts)
 */
function fmtDrawingPrice(price: number): string {
  if (!isFinite(price) || price <= 0) return "—";
  if (price >= 1_000)  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100)    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 10)     return price.toFixed(3);
  if (price >= 1)      return price.toFixed(5);
  if (price >= 0.001)  return price.toFixed(6);
  return price.toFixed(8);
}

function instrType(sym: string) {
  const s = sym.toUpperCase();
  return s.includes("PERP") ? "PERP" : s.includes("SPOT") ? "SPOT" : "PERP";
}

function coinInitials(sym: string) {
  return sym.replace(/(USDT?|PERP|SPOT)$/i, "").trim().slice(0, 2).toUpperCase();
}

// ── Live symbol card ─────────────────────────────────────────────────────────
const PremiumSymbolCard = memo(function PremiumSymbolCard({ symbol }: { symbol: string }) {
  const tick   = useSymbolTick(symbol);
  const price  = tick?.price ?? 0;
  const change = tick?.changePct ?? 0;
  const isUp   = change >= 0;
  const green  = "#22c55e";

  const priceRef     = useRef<HTMLSpanElement>(null);
  const prevPriceRef = useRef(price);
  useEffect(() => {
    if (price !== prevPriceRef.current && priceRef.current) {
      priceRef.current.style.animation = "none";
      void priceRef.current.offsetHeight;
      priceRef.current.style.animation = "sat-flash .3s ease";
    }
    prevPriceRef.current = price;
  }, [price]);

  return (
    <div style={{ margin: "16px 16px 0" }}>
      {/* Selected label — outside card */}
      <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#fb923c", letterSpacing: ".09em", textTransform: "uppercase", lineHeight: 1, marginBottom: 8 }}>
        ✅ Selected Symbol
      </span>
    <div style={{
      minHeight: 86,
      padding: "14px 16px",
      borderRadius: 18,
      background: "linear-gradient(135deg,rgba(255,255,255,.05) 0%,rgba(255,255,255,.02) 100%)",
      border: "1px solid rgba(255,255,255,.09)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      boxShadow: "0 6px 32px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      flexShrink: 0,
    }}>
      {/* LEFT */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: ".01em", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {symbol}
        </span>
        {SYMBOL_CATALOG[symbol]?.description && (
          <span style={{ fontSize: 11.5, fontWeight: 400, color: "rgba(148,163,184,.6)", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {SYMBOL_CATALOG[symbol].description}
          </span>
        )}
      </div>

      {/* RIGHT */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span ref={priceRef} style={{
          display: "block",
          fontSize: 22, fontWeight: 800, color: "#fff",
          letterSpacing: "-.02em", lineHeight: 1,
          fontFamily: "'SF Pro Display','Inter',monospace",
        }}>
          {price > 0 ? formatPrice(price) : "—"}
        </span>
        <div style={{ marginTop: 3, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: isUp ? green : "#f87171", letterSpacing: "-.01em" }}>
            {tick ? `${isUp ? "+" : ""}${change.toFixed(2)}%` : "—"}
          </span>
        </div>
        {/* LIVE */}
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: green, boxShadow: `0 0 5px ${green}`,
            animation: "sat-dot 1.6s ease-in-out infinite", flexShrink: 0,
          }}/>
          <div style={{
            padding: "1px 6px", borderRadius: 4,
            background: "rgba(34,197,94,.11)", border: "1px solid rgba(34,197,94,.20)",
            fontSize: 8.5, fontWeight: 700, color: green, letterSpacing: ".08em", lineHeight: 1,
          }}>LIVE</div>
        </div>
      </div>
    </div>
    </div>
  );
});

// ── Ripple ───────────────────────────────────────────────────────────────────
interface Ripple { id: number; x: number; y: number; }

function useRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const counter = useRef(0);
  const trigger = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const id   = ++counter.current;
    setRipples(p => [...p, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 600);
  }, []);
  return { ripples, trigger };
}

// ── Alert type card ──────────────────────────────────────────────────────────
interface CardProps {
  accentColor: string;
  title: string; description: string;
  index: number;
  onPress: () => void;
}

function AlertTypeCard({ accentColor, title, description, index, onPress }: CardProps) {
  const [pressed, setPressed] = useState(false);
  const { ripples, trigger }  = useRipple();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "tween", duration: DUR_STANDARD, ease: EASE, delay: index * 0.055 }}
      style={{ width: "100%" }}
    >
      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={TAP_TRANSITION}
        onPointerDown={e => { setPressed(true); trigger(e); }}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onClick={onPress}
        style={{
          position: "relative", overflow: "hidden",
          display: "flex", alignItems: "center", gap: 14,
          width: "100%", height: 80,
          padding: "0 16px",
          borderRadius: 18,
          border: `1px solid ${pressed ? accentColor + "35" : "rgba(255,255,255,.08)"}`,
          background: pressed
            ? "linear-gradient(135deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,.03) 100%)"
            : "linear-gradient(135deg,rgba(255,255,255,.04) 0%,rgba(255,255,255,.015) 100%)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: pressed
            ? `0 0 0 1px ${accentColor}20,0 0 20px ${accentColor}15,0 10px 32px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06)`
            : "0 2px 16px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.045)",
          cursor: "pointer", textAlign: "left",
          transition: "background .15s ease,border-color .15s ease,box-shadow .18s ease",
          WebkitTapHighlightColor: "transparent",
          willChange: "transform", flexShrink: 0,
        } as React.CSSProperties}
      >
        {/* Ripple */}
        {ripples.map(r => (
          <span key={r.id} style={{
            position: "absolute", left: r.x, top: r.y,
            width: 110, height: 110, marginLeft: -55, marginTop: -55,
            borderRadius: "50%", background: `${accentColor}1e`,
            animation: "sat-ripple .55s cubic-bezier(.22,1,.36,1) forwards",
            pointerEvents: "none",
          }}/>
        ))}

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 600, color: "#fff",
            lineHeight: 1, marginBottom: 6, letterSpacing: "-.01em",
          }}>
            {title}
          </div>
          <div style={{
            fontSize: 12.5, fontWeight: 400,
            color: "rgba(148,163,184,.62)", lineHeight: 1.45,
          }}>
            {description}
          </div>
        </div>

        {/* Chevron */}
        <div style={{
          flexShrink: 0, width: 26, height: 26,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.07)",
          borderRadius: "50%", color: "rgba(255,255,255,.28)",
        }}>
          <svg width="6" height="11" viewBox="0 0 6 11" fill="none">
            <path d="M1 1l4 4.5L1 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </motion.button>
    </motion.div>
  );
}

// ── Drawing selection helpers ─────────────────────────────────────────────────

function drawingDisplayId(d: Drawing): string {
  const pad = String(d.id).padStart(4, "0");
  if (d.toolType === "ray")  return `RAY-${pad}`;
  if (d.toolType === "rect") return `ZONE-${pad}`;
  return `TL-${pad}`;
}
function fmtUtcDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}
function fmtUtcTime(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

// ── Price Alert full-screen screen ───────────────────────────────────────────
const PriceAlertScreen = memo(function PriceAlertScreen({
  open, symbol, onClose, onSave, onCloseAll,
}: {
  open: boolean;
  symbol: string;
  onClose: () => void;
  onSave: (a: PriceAlert) => void;
  onCloseAll?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  useEffect(() => {
    if (open) {
      let raf: number;
      const t = setTimeout(() => { raf = requestAnimationFrame(() => setVisible(true)); }, 0);
      return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    }
    setVisible(false);
    return undefined;
  }, [open]);

  const chartInterval = useChartStore(s => s.interval);
  const chartHumanTf  = intervalToHumanTf(chartInterval);

  const [form, setForm] = useState({
    symbol: symbol ?? "NAS100",
    timeframe: intervalToHumanTf(useChartStore.getState().interval),
    condition: "above" as "above" | "below" | "touch" | "percent_up" | "percent_down",
    targetPrice: "", notes: "", expiry: "",
    repeatMode: "three_reminders" as RepeatMode,
  });

  // Sync symbol and timeframe each time the screen opens.
  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        symbol:    symbol ?? "",
        timeframe: intervalToHumanTf(useChartStore.getState().interval),
      }));
    }
  }, [open, symbol]);

  // Keep timeframe in sync if the user changes chart interval while open.
  useEffect(() => {
    if (open) setForm(f => ({ ...f, timeframe: chartHumanTf }));
  }, [chartHumanTf, open]);

  const canSave = !!form.targetPrice;

  const handleSave = () => {
    if (!canSave) return;
    try {
      onSave({
        id: `pa${Date.now()}`, type: "price",
        symbol: form.symbol, timeframe: form.timeframe,
        condition: form.condition,
        targetPrice: parseFloat(form.targetPrice),
        currentPrice: 0, notes: form.notes,
        status: "active", expiry: form.expiry || null,
        createdAt: new Date().toISOString(), triggeredAt: null,
        repeatMode: form.repeatMode,
      });
      toast.success("Price Alert Created Successfully", {
        description: `${form.symbol} · ${form.condition} · ${form.targetPrice}`,
        duration: 3000,
      });
      onClose();
    } catch {
      toast.error("Failed to create alert", {
        description: "Something went wrong. Please try again.",
        duration: 4000,
      });
    }
  };

  if (!hasOpenedRef.current) return null;

  return createPortal(
    <div
      aria-hidden={!open}
      style={{ position: "fixed", inset: 0, zIndex: 96, pointerEvents: open ? "auto" : "none" }}
    >
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          background: "#000000",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: `transform ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? COMPOSITOR_EASE : COMPOSITOR_EASE_CLOSE}`,
          willChange: "transform",
          overflow: "hidden",
        }}
      >
        <AppHeader title="Create Price Alert" onBack={onClose} onCloseAll={onCloseAll} />

        <div style={{
          flex: 1, overflowY: "auto",
          overscrollBehavior: "none",
          padding: "20px 16px",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
        } as React.CSSProperties}>
          <div className="space-y-4">

            {/* ── SYMBOL DISPLAY ── */}
            {(() => {
              const desc = (SYMBOL_CATALOG[form.symbol]?.description) || deriveMeta(form.symbol).label;
              return (
                <div style={{
                  display: "flex", alignItems: "stretch", gap: 0,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  overflow: "hidden",
                }}>
                  <div style={{ width: 3, background: "#fb923c", flexShrink: 0 }} />
                  <div style={{ padding: "11px 14px" }}>
                    <p style={{
                      fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
                      color: "rgba(255,255,255,0.30)", textTransform: "uppercase",
                      marginBottom: 4,
                    }}>Instrument</p>
                    <p style={{
                      fontSize: 17, fontWeight: 700,
                      color: "rgba(255,255,255,0.92)",
                      letterSpacing: "0.01em", lineHeight: 1,
                    }}>{form.symbol || "—"}</p>
                    <p style={{
                      fontSize: 11, color: "rgba(255,255,255,0.38)",
                      marginTop: 3, letterSpacing: "0.01em",
                    }}>{desc}</p>
                  </div>
                </div>
              );
            })()}

            {/* ── TIMEFRAME PILL STRIP ── */}
            <div style={{
              display: "flex", gap: 6,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              paddingBottom: 2,
              marginBottom: -2,
            } as React.CSSProperties}>
              {TF_PILLS.map(tf => {
                const isActive = toCanonicalMinutes(form.timeframe) === toCanonicalMinutes(tf);
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, timeframe: tf }))}
                    style={{
                      flexShrink: 0,
                      height: 34,
                      minWidth: 44,
                      paddingLeft: 12,
                      paddingRight: 12,
                      borderRadius: 8,
                      border: isActive ? "1.5px solid #fb923c" : "1px solid rgba(255,255,255,0.10)",
                      background: isActive ? "#fb923c" : "rgba(255,255,255,0.03)",
                      color: isActive ? "#ffffff" : "rgba(255,255,255,0.45)",
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      letterSpacing: "0.02em",
                      cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s, color 0.15s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>

            {/* Condition */}
            <FieldRow label="Condition">
              <div className="flex gap-2">
                {([
                  ["above", "Above"],
                  ["below", "Below"],
                  ["touch", "Touch"],
                  ["percent_up", "% Up"],
                  ["percent_down", "% Down"],
                ] as const).map(([c, label]) => (
                  <AnimatedButton key={c} onClick={() => setForm(f => ({ ...f, condition: c }))}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-semibold capitalize border transition-all",
                      form.condition === c
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "border-white/[0.08] text-muted-foreground hover:border-white/20 hover:text-white"
                    )}>
                    {label}
                  </AnimatedButton>
                ))}
              </div>
            </FieldRow>

            {/* ── REPEAT NOTIFICATIONS ── */}
            <div className="space-y-3">
              {/* Section header */}
              <div>
                <p style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.09em",
                  textTransform: "uppercase" as const,
                  color: "rgba(255,255,255,0.45)", marginBottom: 5,
                }}>
                  Repeat Notifications
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.45 }}>
                  Choose how many reminder notifications should be sent after this alert is triggered.
                </p>
              </div>

              {/* Option cards */}
              <div className="space-y-2">
                {([
                  {
                    value: "three_reminders"        as const,
                    title: "Three Reminders",
                    badge: "Recommended" as string | null,
                    desc:  "Receive an alert immediately, then two additional reminder notifications every 5 minutes. The alert is automatically deleted after the third reminder.",
                  },
                  {
                    value: "repeat_until_dismissed" as const,
                    title: "Repeat Until Dismissed",
                    badge: null,
                    desc:  "Receive reminder notifications every 10 minutes until you manually disable or delete the alert.",
                  },
                  {
                    value: "triple_ring"            as const,
                    title: "Triple Ring",
                    badge: null,
                    desc:  "Play the alert sound three consecutive times immediately after the alert triggers. No additional reminders will be sent.",
                  },
                ]).map(({ value, title, badge, desc }) => {
                  const sel = form.repeatMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, repeatMode: value }))}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "14px",
                        borderRadius: 12,
                        border: sel ? "1.5px solid rgba(251,146,60,0.55)" : "1px solid rgba(255,255,255,0.08)",
                        background: sel ? "rgba(251,146,60,0.07)" : "rgba(255,255,255,0.025)",
                        cursor: "pointer",
                        textAlign: "left" as const,
                        transition: "background 0.2s, border-color 0.2s",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {/* Radio indicator */}
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                        marginTop: 2,
                        border: sel ? "2px solid #fb923c" : "2px solid rgba(255,255,255,0.22)",
                        background: sel ? "#fb923c" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, border-color 0.2s",
                      }}>
                        {sel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#000" }} />}
                      </div>
                      {/* Text block */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <p style={{
                            fontSize: 13, fontWeight: 600, lineHeight: 1.2, margin: 0,
                            color: sel ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.72)",
                          }}>
                            {title}
                          </p>
                          {badge && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                              textTransform: "uppercase" as const,
                              color: "#fb923c",
                              background: "rgba(251,146,60,0.12)",
                              border: "1px solid rgba(251,146,60,0.25)",
                              borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                            }}>
                              {badge}
                            </span>
                          )}
                        </div>
                        <p style={{
                          fontSize: 11, lineHeight: 1.45, margin: 0,
                          color: sel ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.33)",
                        }}>
                          {desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Info card */}
              <div style={{
                padding: "11px 13px", borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                  color: "rgba(255,255,255,0.35)", marginBottom: 5,
                }}>
                  How Repeat Notifications Work
                </p>
                <p style={{
                  fontSize: 11, color: "rgba(255,255,255,0.28)", lineHeight: 1.5, margin: 0,
                }}>
                  Repeat settings only affect notification reminders after an alert has been triggered. They do not change how your alert conditions are evaluated.
                </p>
              </div>
            </div>

            {/* Target / Percent */}
            <FieldRow label={form.condition.startsWith("percent_") ? "Target Change (%)" : "Target Price"}>
              <Input type="number" step={form.condition.startsWith("percent_") ? "0.1" : undefined} placeholder={form.condition.startsWith("percent_") ? "e.g. 2.5" : "e.g. 18750"} value={form.targetPrice}
                onChange={e => setForm(f => ({ ...f, targetPrice: e.target.value }))}
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-muted-foreground/50 h-9" />
            </FieldRow>

            {/* Expiry (optional) */}
            <UTCDateTimePicker
              label="Expiry" optional
              value={form.expiry}
              onChange={iso => setForm(f => ({ ...f, expiry: iso }))}
            />

            {/* Notes */}
            <FieldRow label="Notes">
              <textarea rows={2} placeholder="Alert notes..." value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </FieldRow>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <AnimatedButton variant="ghost" className="flex-1 h-9 text-muted-foreground hover:text-white" onClick={onClose}>
                Cancel
              </AnimatedButton>
              <AnimatedButton
                disabled={!canSave}
                className="flex-1 h-9 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderRadius: 999,
                  background: "#60a5fa",
                  color: "#fff",
                  letterSpacing: "0.02em",
                }}
                onClick={handleSave}>
                Create Alert
              </AnimatedButton>
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
});

// ── Zone Alert full-screen screen ────────────────────────────────────────────
const ZoneAlertScreen = memo(function ZoneAlertScreen({
  open, symbol, onClose, onSave, onCloseAll,
}: {
  open: boolean;
  symbol: string;
  onClose: () => void;
  onSave: (a: ZoneAlert) => void;
  onCloseAll?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  useEffect(() => {
    if (open) {
      let raf: number;
      const t = setTimeout(() => { raf = requestAnimationFrame(() => setVisible(true)); }, 0);
      return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    }
    setVisible(false);
    return undefined;
  }, [open]);

  const chartInterval = useChartStore(s => s.interval);
  const chartHumanTf  = intervalToHumanTf(chartInterval);

  const [form, setForm] = useState({
    symbol: symbol ?? "NAS100", zoneType: "supply" as ZoneAlert["zoneType"],
    upperPrice: "", lowerPrice: "", timeframe: chartHumanTf,
    condition: "enter" as ZoneAlert["condition"], notes: "",
    repeatMode: "three_reminders" as RepeatMode,
  });

  // Sync symbol and timeframe each time the screen opens.
  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        symbol:    symbol ?? "",
        timeframe: intervalToHumanTf(useChartStore.getState().interval),
      }));
    }
  }, [open, symbol]);

  // Keep timeframe in sync if the user changes chart interval while open.
  useEffect(() => {
    if (open) setForm(f => ({ ...f, timeframe: chartHumanTf }));
  }, [chartHumanTf, open]);

  // ── Drawing detection — same store as TrendlineAlertScreen ─────────────────
  const allDrawings      = useDrawingStore(s => s.drawings);
  const normalSymbol     = (form.symbol ?? "").trim().toUpperCase();
  const normalTf         = toCanonicalMinutes(form.timeframe);
  const relevantDrawings = allDrawings.filter(d =>
    d.toolType === "rect" &&
    (d.symbol ?? "").trim().toUpperCase() === normalSymbol &&
    toCanonicalMinutes(d.timeframe) === normalTf,
  );

  const [selectedDrawingId, setSelectedDrawingId] = useState<number | null>(null);
  const [manualOpen, setManualOpen]               = useState(false);

  // On open: clear selection; auto-expand manual entry if no rectangles exist.
  useEffect(() => {
    if (open) {
      setSelectedDrawingId(null);
      setManualOpen(
        allDrawings.filter(d =>
          d.toolType === "rect" &&
          (d.symbol ?? "").trim().toUpperCase() === (symbol ?? "").trim().toUpperCase() &&
          toCanonicalMinutes(d.timeframe) === toCanonicalMinutes(intervalToHumanTf(useChartStore.getState().interval)),
        ).length === 0,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-populate upper/lower price whenever a rectangle is selected.
  useEffect(() => {
    if (selectedDrawingId === null) return;
    const d = allDrawings.find(dr => dr.id === selectedDrawingId);
    if (!d) { setSelectedDrawingId(null); return; }
    const p0 = d.points[0], p1 = d.points[1];
    if (!p0 || !p1) return;
    setForm(f => ({
      ...f,
      upperPrice: String(Math.max(p0.price, p1.price)),
      lowerPrice: String(Math.min(p0.price, p1.price)),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDrawingId, allDrawings]);

  const canSave = !!(form.upperPrice && form.lowerPrice);

  const handleSave = () => {
    if (!canSave) return;
    try {
      onSave({
        id: `za${Date.now()}`, type: "zone",
        symbol: form.symbol, zoneType: form.zoneType,
        upperPrice: parseFloat(form.upperPrice), lowerPrice: parseFloat(form.lowerPrice),
        timeframe: form.timeframe, condition: form.condition,
        notes: form.notes, status: "active",
        createdAt: new Date().toISOString(), triggeredAt: null,
        repeatMode: form.repeatMode,
      });
      toast.success("Zone Alert Created Successfully", {
        description: `${form.symbol} · ${form.timeframe} · ${form.condition}`,
        duration: 3000,
      });
      onClose();
    } catch {
      toast.error("Failed to create alert", {
        description: "Something went wrong. Please try again.",
        duration: 4000,
      });
    }
  };

  const zoneTypes = [
    { value: "supply",             label: "Supply" },
    { value: "demand",             label: "Demand" },
    { value: "support_resistance", label: "S/R" },
    { value: "order_block",        label: "Order Block" },
  ] as const;

  if (!hasOpenedRef.current) return null;

  return createPortal(
    <div
      aria-hidden={!open}
      style={{ position: "fixed", inset: 0, zIndex: 96, pointerEvents: open ? "auto" : "none" }}
    >
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          background: "#000000",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: `transform ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? COMPOSITOR_EASE : COMPOSITOR_EASE_CLOSE}`,
          willChange: "transform",
          overflow: "hidden",
        }}
      >
        <AppHeader title="Create Zone Alert" onBack={onClose} onCloseAll={onCloseAll} />

        <div style={{
          flex: 1, overflowY: "auto",
          overscrollBehavior: "none",
          padding: "20px 16px",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
        } as React.CSSProperties}>
          <div className="space-y-4">

            {/* ── SYMBOL DISPLAY ── */}
            {(() => {
              const desc = (SYMBOL_CATALOG[form.symbol]?.description) || deriveMeta(form.symbol).label;
              return (
                <div style={{
                  display: "flex", alignItems: "stretch", gap: 0,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  overflow: "hidden",
                }}>
                  <div style={{ width: 3, background: "#fb923c", flexShrink: 0 }} />
                  <div style={{ padding: "11px 14px" }}>
                    <p style={{
                      fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
                      color: "rgba(255,255,255,0.30)", textTransform: "uppercase",
                      marginBottom: 4,
                    }}>Instrument</p>
                    <p style={{
                      fontSize: 17, fontWeight: 700,
                      color: "rgba(255,255,255,0.92)",
                      letterSpacing: "0.01em", lineHeight: 1,
                    }}>{form.symbol || "—"}</p>
                    <p style={{
                      fontSize: 11, color: "rgba(255,255,255,0.38)",
                      marginTop: 3, letterSpacing: "0.01em",
                    }}>{desc}</p>
                  </div>
                </div>
              );
            })()}

            {/* ── TIMEFRAME PILL STRIP ── */}
            <div style={{
              display: "flex", gap: 6,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              paddingBottom: 2,
              marginBottom: -2,
            } as React.CSSProperties}>
              {TF_PILLS.map(tf => {
                const isActive = toCanonicalMinutes(form.timeframe) === toCanonicalMinutes(tf);
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, timeframe: tf }))}
                    style={{
                      flexShrink: 0,
                      height: 34,
                      minWidth: 44,
                      paddingLeft: 12,
                      paddingRight: 12,
                      borderRadius: 8,
                      border: isActive ? "1.5px solid #fb923c" : "1px solid rgba(255,255,255,0.10)",
                      background: isActive ? "#fb923c" : "rgba(255,255,255,0.03)",
                      color: isActive ? "#ffffff" : "rgba(255,255,255,0.45)",
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      letterSpacing: "0.02em",
                      cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s, color 0.15s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>

            {/* ── SELECT EXISTING ZONE ── */}
            <div style={{ marginTop: 8 }}>
              <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-3">
                Select Existing Zone
              </p>
              {relevantDrawings.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center">
                  <p className="text-xs text-muted-foreground/40">
                    No rectangle zones found for the selected Symbol and Timeframe.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {relevantDrawings.map(d => {
                    const p0 = d.points[0];
                    const p1 = d.points[1];
                    const isSelected  = selectedDrawingId === d.id;
                    const upperP      = p0 && p1 ? Math.max(p0.price, p1.price) : null;
                    const lowerP      = p0 && p1 ? Math.min(p0.price, p1.price) : null;
                    // For time display: p0 is "start" corner, p1 is "end" corner
                    const startPoint  = p0 && p1 ? (p0.time <= p1.time ? p0 : p1) : p0;
                    const endPoint    = p0 && p1 ? (p0.time <= p1.time ? p1 : p0) : p1;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDrawingId(isSelected ? null : d.id)}
                        className={cn(
                          "w-full text-left rounded-xl border transition-colors",
                          isSelected
                            ? "border-orange-500/30 bg-orange-500/[0.05]"
                            : "border-white/[0.06] bg-white/[0.02]",
                        )}
                        style={{ padding: "14px 14px" }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>

                          {/* ── Radio ── */}
                          <div style={{
                            marginTop: 2, width: 18, height: 18, borderRadius: "50%",
                            flexShrink: 0,
                            border: isSelected ? "none" : "2px solid rgba(255,255,255,0.22)",
                            background: isSelected ? "#fb923c" : "transparent",
                            transition: "background 0.15s, border-color 0.15s",
                          }} />

                          {/* ── Two-column body ── */}
                          <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px" }}>

                            {/* LEFT: Zone · ID · Upper Price · start time */}
                            <div>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 10 }}>
                                <span style={{
                                  fontSize: 13, fontWeight: 700, letterSpacing: "0.05em",
                                  textTransform: "uppercase",
                                  color: isSelected ? "#fb923c" : "rgba(255,255,255,0.85)",
                                }}>
                                  Zone
                                </span>
                                <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.32)" }}>
                                  {drawingDisplayId(d)}
                                </span>
                              </div>

                              <p style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
                                textTransform: "uppercase", color: "rgba(255,255,255,0.28)",
                                marginBottom: 5,
                              }}>
                                Upper Price
                              </p>
                              <p style={{
                                fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.92)",
                                fontVariantNumeric: "tabular-nums", lineHeight: 1.15,
                                letterSpacing: "-0.01em",
                              }}>
                                {upperP !== null ? fmtDrawingPrice(upperP) : "—"}
                              </p>
                              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                                {startPoint ? fmtUtcDate(startPoint.time) : "—"}
                              </p>
                              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)" }}>
                                {startPoint ? fmtUtcTime(startPoint.time) : "—"}
                              </p>
                            </div>

                            {/* RIGHT: Lower Price · end time */}
                            <div>
                              {/* Spacer aligns "Lower Price" with "Upper Price" */}
                              <div style={{ height: 33 }} />

                              <p style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
                                textTransform: "uppercase", color: "rgba(255,255,255,0.28)",
                                marginBottom: 5,
                              }}>
                                Lower Price
                              </p>
                              <p style={{
                                fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.92)",
                                fontVariantNumeric: "tabular-nums", lineHeight: 1.15,
                                letterSpacing: "-0.01em",
                              }}>
                                {lowerP !== null ? fmtDrawingPrice(lowerP) : "—"}
                              </p>
                              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                                {endPoint ? fmtUtcDate(endPoint.time) : "—"}
                              </p>
                              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)" }}>
                                {endPoint ? fmtUtcTime(endPoint.time) : "—"}
                              </p>
                            </div>

                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            <FieldRow label="Notes">
              <textarea
                rows={2}
                placeholder="Zone notes..."
                value={form.notes}
                onChange={e => {
                  setForm(f => ({ ...f, notes: e.target.value }));
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                style={{ overflow: "hidden", minHeight: "64px" }}
              />
            </FieldRow>

            {/* Alert Condition */}
            <FieldRow label="Alert Condition">
              <div className="flex gap-2">
                {(["enter", "touch", "break", "retest"] as const).map(c => (
                  <AnimatedButton key={c} onClick={() => setForm(f => ({ ...f, condition: c }))}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-semibold capitalize border transition-all",
                      form.condition === c
                        ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                        : "border-white/[0.08] text-muted-foreground hover:border-white/20 hover:text-white",
                    )}>
                    {c}
                  </AnimatedButton>
                ))}
              </div>
            </FieldRow>

            {/* ── REPEAT NOTIFICATIONS ── */}
            <div className="space-y-3">
              {/* Section header */}
              <div>
                <p style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.09em",
                  textTransform: "uppercase" as const,
                  color: "rgba(255,255,255,0.45)", marginBottom: 5,
                }}>
                  Repeat Notifications
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.45 }}>
                  Choose how many reminder notifications should be sent after this alert is triggered.
                </p>
              </div>

              {/* Option cards */}
              <div className="space-y-2">
                {([
                  {
                    value: "three_reminders"        as const,
                    title: "Three Reminders",
                    badge: "Recommended" as string | null,
                    desc:  "Receive an alert immediately, then two additional reminder notifications every 5 minutes. The alert is automatically deleted after the third reminder.",
                  },
                  {
                    value: "repeat_until_dismissed" as const,
                    title: "Repeat Until Dismissed",
                    badge: null,
                    desc:  "Receive reminder notifications every 10 minutes until you manually disable or delete the alert.",
                  },
                  {
                    value: "triple_ring"            as const,
                    title: "Triple Ring",
                    badge: null,
                    desc:  "Play the alert sound three consecutive times immediately after the alert triggers. No additional reminders will be sent.",
                  },
                ]).map(({ value, title, badge, desc }) => {
                  const sel = form.repeatMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, repeatMode: value }))}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "14px",
                        borderRadius: 12,
                        border: sel ? "1.5px solid rgba(251,146,60,0.55)" : "1px solid rgba(255,255,255,0.08)",
                        background: sel ? "rgba(251,146,60,0.07)" : "rgba(255,255,255,0.025)",
                        cursor: "pointer",
                        textAlign: "left" as const,
                        transition: "background 0.2s, border-color 0.2s",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {/* Radio indicator */}
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                        marginTop: 2,
                        border: sel ? "2px solid #fb923c" : "2px solid rgba(255,255,255,0.22)",
                        background: sel ? "#fb923c" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, border-color 0.2s",
                      }}>
                        {sel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#000" }} />}
                      </div>
                      {/* Text block */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <p style={{
                            fontSize: 13, fontWeight: 600, lineHeight: 1.2, margin: 0,
                            color: sel ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.72)",
                          }}>
                            {title}
                          </p>
                          {badge && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                              textTransform: "uppercase" as const,
                              color: "#fb923c",
                              background: "rgba(251,146,60,0.12)",
                              border: "1px solid rgba(251,146,60,0.25)",
                              borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                            }}>
                              {badge}
                            </span>
                          )}
                        </div>
                        <p style={{
                          fontSize: 11, lineHeight: 1.45, margin: 0,
                          color: sel ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.33)",
                        }}>
                          {desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Info card */}
              <div style={{
                padding: "11px 13px", borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                  color: "rgba(255,255,255,0.35)", marginBottom: 5,
                }}>
                  How Repeat Notifications Work
                </p>
                <p style={{
                  fontSize: 11, color: "rgba(255,255,255,0.28)", lineHeight: 1.5, margin: 0,
                }}>
                  Repeat settings only affect notification reminders after an alert has been triggered. They do not change how your alert conditions are evaluated.
                </p>
              </div>
            </div>

            {/* ── OR ENTER MANUALLY collapsible ── */}
            <div>
              <button
                type="button"
                onClick={() => setManualOpen(o => !o)}
                className="flex items-center gap-3 w-full"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider select-none">
                  or enter manually
                </span>
                <motion.div
                  animate={{ rotate: manualOpen ? 180 : 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                </motion.div>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </button>

              <AnimatePresence initial={false}>
                {manualOpen && (
                  <motion.div
                    key="manual-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.27, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="space-y-4 pt-4">

                      {/* Zone Type */}
                      <FieldRow label="Zone Type">
                        <div className="grid grid-cols-2 gap-2">
                          {zoneTypes.map(z => (
                            <AnimatedButton key={z.value} onClick={() => setForm(f => ({ ...f, zoneType: z.value }))}
                              className={cn(
                                "py-2 rounded-lg text-xs font-semibold border transition-all",
                                form.zoneType === z.value
                                  ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                                  : "border-white/[0.08] text-muted-foreground hover:border-white/20 hover:text-white",
                              )}>
                              {z.label}
                            </AnimatedButton>
                          ))}
                        </div>
                      </FieldRow>

                      {/* Upper / Lower Price */}
                      <div className="grid grid-cols-2 gap-3">
                        <FieldRow label="Upper Price">
                          <Input type="number" placeholder="Upper" value={form.upperPrice}
                            onChange={e => setForm(f => ({ ...f, upperPrice: e.target.value }))}
                            className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-muted-foreground/50 h-9" />
                        </FieldRow>
                        <FieldRow label="Lower Price">
                          <Input type="number" placeholder="Lower" value={form.lowerPrice}
                            onChange={e => setForm(f => ({ ...f, lowerPrice: e.target.value }))}
                            className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-muted-foreground/50 h-9" />
                        </FieldRow>
                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <AnimatedButton variant="ghost" className="flex-1 h-9 text-muted-foreground hover:text-white" onClick={onClose}>
                Cancel
              </AnimatedButton>
              <AnimatedButton
                disabled={!canSave}
                className="flex-1 h-9 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderRadius: 999,
                  background: "#fb923c",
                  color: "#fff",
                  letterSpacing: "0.02em",
                }}
                onClick={handleSave}>
                Create Zone
              </AnimatedButton>
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
});

// ── Trendline Alert full-screen screen ───────────────────────────────────────
const TrendlineAlertScreen = memo(function TrendlineAlertScreen({
  open, symbol, onClose, onSave, onCloseAll,
}: {
  open: boolean;
  symbol: string;
  onClose: () => void;
  onSave: (a: TrendlineAlert) => void;
  onCloseAll?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  useEffect(() => {
    if (open) {
      let raf: number;
      const t = setTimeout(() => { raf = requestAnimationFrame(() => setVisible(true)); }, 0);
      return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    }
    setVisible(false);
    return undefined;
  }, [open]);

  // Read the live chart interval so we can initialise the form timeframe correctly.
  // chartStore stores interval as numeric minutes ("60", "15" …); convert to the
  // human label that matches the TIMEFRAMES dropdown ("1H", "15M" …).
  const chartInterval = useChartStore(s => s.interval);
  const chartHumanTf  = intervalToHumanTf(chartInterval);

  const [form, setForm] = useState(() => {
    const now = new Date();
    const plus1h = new Date(now.getTime() + 60 * 60 * 1000);
    return {
      symbol:       symbol ?? "",
      timeframe:    chartHumanTf,
      p1Price: "", p1Time: now.toISOString(),
      p2Price: "", p2Time: plus1h.toISOString(),
      condition:    "touch" as TrendlineAlert["condition"],
      notes:        "",
      atrPeriod:    14,
      atrMultiplier: 0.15,
      repeatMode:   "three_reminders" as RepeatMode,
    };
  });

  // Sync symbol, timeframe, and default times every time the screen opens so it
  // always reflects the chart that is currently visible — not whatever it was
  // the last time. Times reset to now/+1h so the button is immediately enabled.
  useEffect(() => {
    if (open) {
      const now = new Date();
      const plus1h = new Date(now.getTime() + 60 * 60 * 1000);
      setForm(f => ({
        ...f,
        symbol:    symbol ?? "",
        timeframe: intervalToHumanTf(useChartStore.getState().interval),
        p1Time:    now.toISOString(),
        p2Time:    plus1h.toISOString(),
      }));
    }
  }, [open, symbol]);

  // Keep timeframe in sync if the user changes chart interval while the screen
  // is already mounted (e.g. via the chart control bar behind the overlay).
  useEffect(() => {
    if (open) setForm(f => ({ ...f, timeframe: chartHumanTf }));
  }, [chartHumanTf, open]);

  // ── Drawing selection ───────────────────────────────────────────────────────
  const allDrawings = useDrawingStore(s => s.drawings);

  // Normalize both sides so "60" === "1H", "15" === "15M" etc. all match.
  const normalSymbol   = (form.symbol ?? "").trim().toUpperCase();
  const normalTf       = toCanonicalMinutes(form.timeframe);

  const relevantDrawings = allDrawings.filter(d =>
    (d.toolType === "trendline" || d.toolType === "extended" || d.toolType === "ray") &&
    (d.symbol ?? "").trim().toUpperCase() === normalSymbol &&
    toCanonicalMinutes(d.timeframe) === normalTf
  );

  // ── Debug logging (temporary, per requirements) ─────────────────────────────
  useEffect(() => {
    if (!open) return;
    console.group("[TrendlineAlert] Drawing filter diagnostics");
    console.log("Total drawings in store  :", allDrawings.length);
    console.log("Selected symbol (raw)    :", form.symbol);
    console.log("Selected timeframe (raw) :", form.timeframe);
    console.log("Symbol after normalise   :", normalSymbol);
    console.log("Timeframe after normalise:", normalTf);
    console.log("chartStore.interval      :", chartInterval);
    console.log("Filtered drawings count  :", relevantDrawings.length);
    console.log("Matched drawing IDs      :", relevantDrawings.map(d => d.id));
    if (allDrawings.length > 0) {
      console.log("All drawings (symbol/tf) :", allDrawings.map(d => ({
        id: d.id,
        toolType: d.toolType,
        symbol: d.symbol,
        timeframe: d.timeframe,
        symbolNorm: (d.symbol ?? "").trim().toUpperCase(),
        tfNorm: toCanonicalMinutes(d.timeframe),
      })));
    }
    console.groupEnd();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allDrawings.length, normalSymbol, normalTf]);

  const [selectedDrawingId, setSelectedDrawingId] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Clear selection each time the screen opens; auto-open manual entry when
  // there are no matching drawings so the user can always fill in prices.
  useEffect(() => {
    if (open) {
      setSelectedDrawingId(null);
      setManualOpen(relevantDrawings.length === 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-populate form whenever the selected drawing (or its coords) changes
  useEffect(() => {
    if (selectedDrawingId === null) return;
    const d = allDrawings.find(dr => dr.id === selectedDrawingId);
    if (!d) { setSelectedDrawingId(null); return; }   // drawing deleted
    const p0 = d.points[0], p1 = d.points[1];
    if (!p0 || !p1) return;
    setForm(f => ({
      ...f,
      symbol: d.symbol,
      timeframe: d.timeframe,
      p1Price: String(p0.price),
      p1Time:  new Date(p0.time * 1000).toISOString(),
      p2Price: String(p1.price),
      p2Time:  new Date(p1.time * 1000).toISOString(),
    }));
  }, [selectedDrawingId, allDrawings]); // eslint-disable-line react-hooks/exhaustive-deps

  const timeInvalid = !!(form.p1Time && form.p2Time && new Date(form.p2Time) < new Date(form.p1Time));
  const canSave = !!(form.p1Price && form.p2Price && form.p1Time && form.p2Time && !timeInvalid);

  const handleSave = () => {
    if (!canSave) return;
    try {
      onSave({
        id: `ta${Date.now()}`, type: "trendline",
        symbol: form.symbol, timeframe: form.timeframe,
        point1Price: parseFloat(form.p1Price), point1Time: form.p1Time,
        point2Price: parseFloat(form.p2Price), point2Time: form.p2Time,
        condition: form.condition, notes: form.notes,
        atrPeriod: form.atrPeriod, atrMultiplier: form.atrMultiplier,
        status: "active", createdAt: new Date().toISOString(), triggeredAt: null,
        repeatMode: form.repeatMode,
      });
      const condLabel =
        form.condition === "atr_proximity" ? "ATR Proximity" :
        form.condition === "touch"         ? "Exact Touch"   :
        form.condition === "break"         ? "Trendline Break" :
        form.condition;
      toast.success("Trendline Alert Created Successfully", {
        description: `${form.symbol} · ${form.timeframe} · ${condLabel}`,
        duration: 3000,
      });
      onClose();
    } catch {
      toast.error("Failed to create alert", {
        description: "Something went wrong. Please try again.",
        duration: 4000,
      });
    }
  };

  const slope = form.p1Price && form.p2Price
    ? parseFloat(form.p2Price) > parseFloat(form.p1Price) ? "ascending" : "descending"
    : null;

  if (!hasOpenedRef.current) return null;

  return createPortal(
    <div
      aria-hidden={!open}
      style={{ position: "fixed", inset: 0, zIndex: 96, pointerEvents: open ? "auto" : "none" }}
    >
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          background: "#000000",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: `transform ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? COMPOSITOR_EASE : COMPOSITOR_EASE_CLOSE}`,
          willChange: "transform",
          overflow: "hidden",
        }}
      >
        <AppHeader title="Create Trendline Alert" onBack={onClose} onCloseAll={onCloseAll} />

        <div style={{
          flex: 1, overflowY: "auto",
          overscrollBehavior: "none",
          padding: "20px 16px",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
        } as React.CSSProperties}>
          <div className="space-y-4">

            {/* ── SYMBOL DISPLAY ── */}
            {(() => {
              const desc = (SYMBOL_CATALOG[form.symbol]?.description) || deriveMeta(form.symbol).label;
              return (
                <div style={{
                  display: "flex", alignItems: "stretch", gap: 0,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  overflow: "hidden",
                }}>
                  {/* Left orange accent bar */}
                  <div style={{ width: 3, background: "#fb923c", flexShrink: 0, borderRadius: "0 0 0 0" }} />

                  <div style={{ padding: "11px 14px" }}>
                    <p style={{
                      fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
                      color: "rgba(255,255,255,0.30)", textTransform: "uppercase",
                      marginBottom: 4,
                    }}>
                      Instrument
                    </p>
                    <p style={{
                      fontSize: 17, fontWeight: 700,
                      color: "rgba(255,255,255,0.92)",
                      letterSpacing: "0.01em", lineHeight: 1,
                    }}>
                      {form.symbol}
                    </p>
                    <p style={{
                      fontSize: 11, color: "rgba(255,255,255,0.38)",
                      marginTop: 3, letterSpacing: "0.01em",
                    }}>
                      {desc}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* ── TIMEFRAME PILL STRIP ── */}
            <div style={{
              display: "flex", gap: 6,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              paddingBottom: 2,         // room for focus ring
              marginBottom: -2,
            } as React.CSSProperties}>
              {TF_PILLS.map(tf => {
                const isActive = toCanonicalMinutes(form.timeframe) === toCanonicalMinutes(tf);
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, timeframe: tf }))}
                    style={{
                      flexShrink: 0,
                      height: 34,
                      minWidth: 44,
                      paddingLeft: 12,
                      paddingRight: 12,
                      borderRadius: 8,
                      border: isActive
                        ? "1.5px solid #fb923c"
                        : "1px solid rgba(255,255,255,0.10)",
                      background: isActive
                        ? "#fb923c"
                        : "rgba(255,255,255,0.03)",
                      color: isActive ? "#ffffff" : "rgba(255,255,255,0.45)",
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      letterSpacing: "0.02em",
                      cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s, color 0.15s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>

            {/* ── SELECT EXISTING DRAWING ── */}
            <div style={{ marginTop: 8 }}>
              <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-3">
                Select Existing Drawing
              </p>
              {relevantDrawings.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center">
                  <p className="text-xs text-muted-foreground/40">
                    No Trendlines or Rays found for the selected Symbol and Timeframe.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {relevantDrawings.map(d => {
                    const p0 = d.points[0];
                    const p1 = d.points[1];
                    const isSelected = selectedDrawingId === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDrawingId(isSelected ? null : d.id)}
                        className={cn(
                          "w-full text-left rounded-xl border transition-colors",
                          isSelected
                            ? "border-orange-500/30 bg-orange-500/[0.05]"
                            : "border-white/[0.06] bg-white/[0.02]"
                        )}
                        style={{ padding: "14px 14px" }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>

                          {/* ── Radio ── */}
                          <div style={{
                            marginTop: 2, width: 18, height: 18, borderRadius: "50%",
                            flexShrink: 0,
                            border: isSelected ? "none" : "2px solid rgba(255,255,255,0.22)",
                            background: isSelected ? "#fb923c" : "transparent",
                            transition: "background 0.15s, border-color 0.15s",
                          }} />

                          {/* ── Two-column body ── */}
                          <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px" }}>

                            {/* ── LEFT: Type · ID · First Point ── */}
                            <div>
                              {/* Type + ID */}
                              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 10 }}>
                                <span style={{
                                  fontSize: 13, fontWeight: 700, letterSpacing: "0.05em",
                                  textTransform: "uppercase",
                                  color: isSelected ? "#fb923c" : "rgba(255,255,255,0.85)",
                                }}>
                                  {d.toolType === "ray" ? "Ray" : "Trendline"}
                                </span>
                                <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.32)" }}>
                                  {drawingDisplayId(d)}
                                </span>
                              </div>

                              {/* First Point */}
                              <p style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
                                textTransform: "uppercase", color: "rgba(255,255,255,0.28)",
                                marginBottom: 5,
                              }}>
                                First Point
                              </p>
                              <p style={{
                                fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.92)",
                                fontVariantNumeric: "tabular-nums", lineHeight: 1.15,
                                letterSpacing: "-0.01em",
                              }}>
                                {p0 ? fmtDrawingPrice(p0.price) : "—"}
                              </p>
                              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                                {p0 ? fmtUtcDate(p0.time) : "—"}
                              </p>
                              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)" }}>
                                {p0 ? fmtUtcTime(p0.time) : "—"}
                              </p>
                            </div>

                            {/* ── RIGHT: Second Point · Symbol · Timeframe ── */}
                            <div>
                              {/* Spacer to align "Second Point" with "First Point" */}
                              <div style={{ height: 33 }} />

                              {/* Second Point */}
                              <p style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: "0.1em",
                                textTransform: "uppercase", color: "rgba(255,255,255,0.28)",
                                marginBottom: 5,
                              }}>
                                Second Point
                              </p>
                              <p style={{
                                fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.92)",
                                fontVariantNumeric: "tabular-nums", lineHeight: 1.15,
                                letterSpacing: "-0.01em",
                              }}>
                                {p1 ? fmtDrawingPrice(p1.price) : "—"}
                              </p>
                              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                                {p1 ? fmtUtcDate(p1.time) : "—"}
                              </p>
                              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)" }}>
                                {p1 ? fmtUtcTime(p1.time) : "—"}
                              </p>

                            </div>

                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            <FieldRow label="Notes">
              <textarea
                rows={2}
                placeholder="Trendline notes..."
                value={form.notes}
                onChange={e => {
                  setForm(f => ({ ...f, notes: e.target.value }));
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                style={{ overflow: "hidden", minHeight: "64px" }}
              />
            </FieldRow>

            {/* ── Trendline Alert Condition ── */}
            <FieldRow label="Alert Condition">
              <div className="space-y-3">
                {/* Three condition pills */}
                <div className="flex gap-2 flex-wrap">
                  {([
                    { value: "touch",         label: "Exact Touch" },
                    { value: "break",         label: "Break" },
                    { value: "retest",        label: "Retest" },
                    { value: "cross_above",   label: "Cross ↑" },
                    { value: "cross_below",   label: "Cross ↓" },
                    { value: "rejection",     label: "Rejection" },
                    { value: "atr_proximity", label: "ATR Proximity" },
                  ] as const).map(({ value, label }) => (
                    <AnimatedButton
                      key={value}
                      onClick={() => setForm(f => ({ ...f, condition: value }))}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-semibold border transition-all",
                        form.condition === value
                          ? "bg-primary/20 border-primary/40 text-primary"
                          : "border-white/[0.08] text-muted-foreground hover:border-white/20 hover:text-white"
                      )}>
                      {label}
                    </AnimatedButton>
                  ))}
                </div>

                {/* ATR settings — only shown when ATR Proximity is selected */}
                <AnimatePresence initial={false}>
                  {form.condition === "atr_proximity" && (
                    <motion.div
                      key="atr-settings"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        className="mt-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3"
                      >
                        {/* Helper text */}
                        <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                          Alert triggers when price enters an ATR-based proximity zone around the selected trendline.
                        </p>

                        {/* ATR Period + Multiplier row */}
                        <div className="flex gap-3">
                          {/* ATR Period */}
                          <div className="flex-1 space-y-1.5">
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                              ATR Period
                            </p>
                            <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.04] overflow-hidden h-9">
                              <button
                                type="button"
                                className="px-2.5 h-full text-muted-foreground hover:text-white transition-colors text-sm"
                                onClick={() => setForm(f => ({ ...f, atrPeriod: Math.max(5, f.atrPeriod - 1) }))}
                              >−</button>
                              <span className="flex-1 text-center text-xs font-mono font-semibold text-white tabular-nums">
                                {form.atrPeriod}
                              </span>
                              <button
                                type="button"
                                className="px-2.5 h-full text-muted-foreground hover:text-white transition-colors text-sm"
                                onClick={() => setForm(f => ({ ...f, atrPeriod: Math.min(50, f.atrPeriod + 1) }))}
                              >+</button>
                            </div>
                          </div>

                          {/* ATR Multiplier */}
                          <div className="flex-1 space-y-1.5">
                            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                              ATR Multiplier
                            </p>
                            <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.04] overflow-hidden h-9">
                              <button
                                type="button"
                                className="px-2.5 h-full text-muted-foreground hover:text-white transition-colors text-sm"
                                onClick={() => setForm(f => ({ ...f, atrMultiplier: Math.max(0.05, Math.round((f.atrMultiplier - 0.05) * 100) / 100) }))}
                              >−</button>
                              <span className="flex-1 text-center text-xs font-mono font-semibold text-white tabular-nums">
                                {form.atrMultiplier.toFixed(2)}
                              </span>
                              <button
                                type="button"
                                className="px-2.5 h-full text-muted-foreground hover:text-white transition-colors text-sm"
                                onClick={() => setForm(f => ({ ...f, atrMultiplier: Math.min(1.00, Math.round((f.atrMultiplier + 0.05) * 100) / 100) }))}
                              >+</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </FieldRow>

            {/* ── REPEAT NOTIFICATIONS ── */}
            <div className="space-y-3">
              {/* Section header */}
              <div>
                <p style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.09em",
                  textTransform: "uppercase" as const,
                  color: "rgba(255,255,255,0.45)", marginBottom: 5,
                }}>
                  Repeat Notifications
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.45 }}>
                  Choose how many reminder notifications should be sent after this alert is triggered.
                </p>
              </div>

              {/* Option cards */}
              <div className="space-y-2">
                {([
                  {
                    value: "three_reminders"        as const,
                    title: "Three Reminders",
                    badge: "Recommended" as string | null,
                    desc:  "Receive an alert immediately, then two additional reminder notifications every 5 minutes. The alert is automatically deleted after the third reminder.",
                  },
                  {
                    value: "repeat_until_dismissed" as const,
                    title: "Repeat Until Dismissed",
                    badge: null,
                    desc:  "Receive reminder notifications every 10 minutes until you manually disable or delete the alert.",
                  },
                  {
                    value: "triple_ring"            as const,
                    title: "Triple Ring",
                    badge: null,
                    desc:  "Play the alert sound three consecutive times immediately after the alert triggers. No additional reminders will be sent.",
                  },
                ]).map(({ value, title, badge, desc }) => {
                  const sel = form.repeatMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, repeatMode: value }))}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "14px",
                        borderRadius: 12,
                        border: sel ? "1.5px solid rgba(251,146,60,0.55)" : "1px solid rgba(255,255,255,0.08)",
                        background: sel ? "rgba(251,146,60,0.07)" : "rgba(255,255,255,0.025)",
                        cursor: "pointer",
                        textAlign: "left" as const,
                        transition: "background 0.2s, border-color 0.2s",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {/* Radio indicator */}
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                        marginTop: 2,
                        border: sel ? "2px solid #fb923c" : "2px solid rgba(255,255,255,0.22)",
                        background: sel ? "#fb923c" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s, border-color 0.2s",
                      }}>
                        {sel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#000" }} />}
                      </div>
                      {/* Text block */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <p style={{
                            fontSize: 13, fontWeight: 600, lineHeight: 1.2, margin: 0,
                            color: sel ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.72)",
                          }}>
                            {title}
                          </p>
                          {badge && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                              textTransform: "uppercase" as const,
                              color: "#fb923c",
                              background: "rgba(251,146,60,0.12)",
                              border: "1px solid rgba(251,146,60,0.25)",
                              borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                            }}>
                              {badge}
                            </span>
                          )}
                        </div>
                        <p style={{
                          fontSize: 11, lineHeight: 1.45, margin: 0,
                          color: sel ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.33)",
                        }}>
                          {desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Info card */}
              <div style={{
                padding: "11px 13px", borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                  color: "rgba(255,255,255,0.35)", marginBottom: 5,
                }}>
                  How Repeat Notifications Work
                </p>
                <p style={{
                  fontSize: 11, color: "rgba(255,255,255,0.28)", lineHeight: 1.5, margin: 0,
                }}>
                  Repeat settings only affect notification reminders after an alert has been triggered. They do not change how your alert conditions are evaluated.
                </p>
              </div>
            </div>

            {/* ── OR ENTER MANUALLY collapsible ── */}
            <div>
              {/* Header / toggle */}
              <button
                type="button"
                onClick={() => setManualOpen(o => !o)}
                className="flex items-center gap-3 w-full"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider select-none">
                  or enter manually
                </span>
                <motion.div
                  animate={{ rotate: manualOpen ? 180 : 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                </motion.div>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </button>

              {/* Collapsible content */}
              <AnimatePresence initial={false}>
                {manualOpen && (
                  <motion.div
                    key="manual-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.27, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="space-y-4 pt-4">

                      {/* Slope indicator */}
                      {slope && (
                        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={tweenFast}
                          className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-3">
                          {slope === "ascending"
                            ? <TrendingUp className="w-5 h-5 text-primary flex-shrink-0" />
                            : <TrendingDown className="w-5 h-5 text-primary flex-shrink-0" />}
                          <div>
                            <p className="text-xs font-semibold text-primary capitalize">{slope} Trendline</p>
                            <p className="text-[10px] text-primary/60">
                              Slope: {(parseFloat(form.p2Price) - parseFloat(form.p1Price)).toFixed(2)} pts
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {/* Point 1 */}
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
                        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Point 1 — Anchor</p>
                        <FieldRow label="Price">
                          <Input type="number" placeholder="e.g. 18500" value={form.p1Price}
                            onChange={e => setForm(f => ({ ...f, p1Price: e.target.value }))}
                            className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-muted-foreground/50 h-9" />
                        </FieldRow>
                        <UTCDateTimePicker label="Time (UTC)" value={form.p1Time}
                          onChange={iso => setForm(f => ({ ...f, p1Time: iso }))} />
                      </div>

                      {/* Point 2 */}
                      <div className={cn(
                        "rounded-xl border p-3 space-y-3 transition-colors",
                        timeInvalid ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-white/[0.06] bg-white/[0.02]"
                      )}>
                        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">Point 2 — Direction</p>
                        <FieldRow label="Price">
                          <Input type="number" placeholder="e.g. 18750" value={form.p2Price}
                            onChange={e => setForm(f => ({ ...f, p2Price: e.target.value }))}
                            className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-muted-foreground/50 h-9" />
                        </FieldRow>
                        <UTCDateTimePicker label="Time (UTC)" value={form.p2Time}
                          onChange={iso => setForm(f => ({ ...f, p2Time: iso }))} />
                      </div>

                      {/* Time validation warning */}
                      <AnimatePresence>
                        {timeInvalid && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={tweenFast}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            <p className="text-[11px] text-amber-400">Point 2 time must be after Point 1</p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <AnimatedButton variant="ghost" className="flex-1 h-9 text-muted-foreground hover:text-white" onClick={onClose}>
                Cancel
              </AnimatedButton>
              <AnimatedButton
                disabled={!canSave}
                className="flex-1 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  height: 44,
                  borderRadius: 999,
                  background: "#fb923c",
                  color: "#fff",
                  letterSpacing: "0.02em",
                }}
                onClick={handleSave}>
                Create Trendline
              </AnimatedButton>
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
});

// ── Main overlay ─────────────────────────────────────────────────────────────
export interface SelectAlertTypeOverlayProps {
  open: boolean;
  symbol: string;
  onClose: () => void;
  /** Exits the entire Alerts flow and returns to Dashboard. */
  onCloseAll?: () => void;
}

export const SelectAlertTypeOverlay = memo(function SelectAlertTypeOverlay({
  open, symbol, onClose, onCloseAll,
}: SelectAlertTypeOverlayProps) {
  const { addAlert } = useAlertStore();

  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  const [visible, setVisible] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (open) {
      let raf: number;
      const t = setTimeout(() => { raf = requestAnimationFrame(() => setVisible(true)); }, 0);
      return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    }
    setVisible(false);
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  type Modal = "price" | "zone" | "trendline" | null;
  const [activeModal, setActiveModal] = useState<Modal>(null);

  // Wraps the outer onCloseAll so that activeModal is cleared first.
  // Without this, the create screens (Trendline/Zone/Price) stay mounted and
  // visible after the parent overlays animate away, because their `open` prop
  // is driven by activeModal — not by the outer SelectAlertTypeOverlay open state.
  const handleCloseAll = useCallback(() => {
    setActiveModal(null);
    onCloseAll?.();
  }, [onCloseAll]);

  // Price/trendline/zone saves all go through the real API first. The old
  // price/trendline handlers only updated Zustand/localStorage, which meant
  // the AlertEngine could never see those alerts and refresh would lose them.
  const handlePriceAlertSave = useCallback(async (a: PriceAlert) => {
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: a.symbol,
          condition:
            a.condition === "below" ? "price_below" :
            a.condition === "touch" ? "touch_price" :
            a.condition === "percent_up" ? "percent_change_up" :
            a.condition === "percent_down" ? "percent_change_down" :
            "price_above",
          targetPrice: a.targetPrice,
          message: a.notes || undefined,
          telegramEnabled: true,
          repeatMode: a.repeatMode ?? "three_reminders",
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `Server returned ${res.status}` })) as { error?: string };
        toast.error("Price alert not saved", { description: body.error ?? "API error" });
        return;
      }

      const saved = await res.json() as Record<string, unknown>;
      addAlert({
        ...a,
        id: `p_${saved["id"]}`,
        symbol: String(saved["symbol"] ?? a.symbol),
        targetPrice: Number(saved["targetPrice"] ?? a.targetPrice),
        status: saved["isTriggered"] ? "triggered" : saved["isActive"] === false ? "paused" : "active",
        createdAt: String(saved["createdAt"] ?? a.createdAt),
        triggeredAt: (saved["triggeredAt"] as string | null) ?? null,
        repeatMode: (saved["repeatMode"] as PriceAlert["repeatMode"]) ?? a.repeatMode ?? "three_reminders",
      });
      setActiveModal(null);
      onCloseRef.current();
    } catch {
      toast.error("Price alert not saved", { description: "Network error — check API connection" });
    }
  }, [addAlert]);

  const handleTrendlineAlertSave = useCallback(async (a: TrendlineAlert) => {
    try {
      const res = await fetch("/api/trendlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: a.symbol,
          timeframe: a.timeframe,
          point1Price: a.point1Price,
          point1Time: a.point1Time,
          point2Price: a.point2Price,
          point2Time: a.point2Time,
          condition: a.condition,
          drawingType: "trendline",
          notes: a.notes || undefined,
          telegramEnabled: true,
          repeatMode: a.repeatMode ?? "three_reminders",
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `Server returned ${res.status}` })) as { error?: string };
        toast.error("Trendline alert not saved", { description: body.error ?? "API error" });
        return;
      }

      const saved = await res.json() as Record<string, unknown>;
      const serverCondition = String(saved["condition"] ?? a.condition) as TrendlineAlert["condition"];

      addAlert({
        ...a,
        id: `t_${saved["id"]}`,
        symbol: String(saved["symbol"] ?? a.symbol),
        timeframe: String(saved["timeframe"] ?? a.timeframe),
        condition: serverCondition,
        point1Price: Number(saved["point1Price"] ?? a.point1Price),
        point1Time: String(saved["point1Time"] ?? a.point1Time),
        point2Price: Number(saved["point2Price"] ?? a.point2Price),
        point2Time: String(saved["point2Time"] ?? a.point2Time),
        status: saved["isTriggered"] ? "triggered" : saved["isActive"] === false ? "paused" : "active",
        createdAt: String(saved["createdAt"] ?? a.createdAt),
        triggeredAt: (saved["triggeredAt"] as string | null) ?? null,
        repeatMode: (saved["repeatMode"] as TrendlineAlert["repeatMode"]) ?? a.repeatMode ?? "three_reminders",
      });
      setActiveModal(null);
      onCloseRef.current();
    } catch {
      toast.error("Trendline alert not saved", { description: "Network error — check API connection" });
    }
  }, [addAlert]);

  // Zone alert save — persists to DB so the AlertEngine can watch it in real-time.
  // Falls back to local-only if the network call fails (e.g. symbol not in whitelist).
  const handleZoneAlertSave = useCallback(async (a: ZoneAlert) => {
    try {
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol:          a.symbol,
          upperPrice:      a.upperPrice,
          lowerPrice:      a.lowerPrice,
          zoneType:        a.zoneType,
          timeframe:       a.timeframe,
          condition:       a.condition,
          notes:           a.notes || undefined,
          telegramEnabled: true,
          repeatMode:       a.repeatMode ?? "three_reminders",
        }),
      });
      if (res.ok) {
        const saved = await res.json() as Record<string, unknown>;
        // Use the DB-assigned ID so delete/pause calls resolve correctly.
        addAlert({
          id:         `z_${saved["id"]}`,
          type:       "zone",
          symbol:     saved["symbol"]    as string,
          zoneType:   (saved["zoneType"]  as ZoneAlert["zoneType"])  ?? "support_resistance",
          upperPrice: saved["upperPrice"] as number,
          lowerPrice: saved["lowerPrice"] as number,
          timeframe:  (saved["timeframe"] as string)                 ?? "1H",
          condition:  (saved["condition"] as ZoneAlert["condition"]) ?? "touch",
          notes:      (saved["notes"]     as string)                 ?? "",
          status:     "active",
          createdAt:  saved["createdAt"] as string,
          triggeredAt: null,
          repeatMode: (saved["repeatMode"] as ZoneAlert["repeatMode"]) ?? a.repeatMode ?? "three_reminders",
        });
      } else {
        const body = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        toast.error("Zone alert not saved", {
          description: body.error ?? `Server returned ${res.status}`,
          duration: 5000,
        });
      }
    } catch {
      toast.error("Zone alert not saved", { description: "Network error — check API connection", duration: 5000 });
    }
    setActiveModal(null);
    onCloseRef.current();
  }, [addAlert]);

  if (!hasOpenedRef.current) return null;

  return createPortal(
    <>
      {/* ── Outer shell: positioning only — no transform, no background.
           Matches the two-div pattern used by DashboardAlertsOverlay and
           DashboardMarketsOverlay: keeping transform off the position:fixed
           element prevents WebKit / Android WebView from evaluating
           env(safe-area-inset-top) from a different reference point, which
           was the root cause of the extra vertical space compared to Markets. ── */}
      <div
        aria-hidden={!open}
        style={{
          position: "fixed", inset: 0, zIndex: 95,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* ── Inner panel: animation + layout + background ── */}
        <div
          className="transform-gpu"
          style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            background: "#000000",
            transform: visible ? "translateX(0)" : "translateX(100%)",
            transition: `transform ${visible ? DUR_OPEN : DUR_CLOSE}ms ${visible ? COMPOSITOR_EASE : COMPOSITOR_EASE_CLOSE}`,
            willChange: "transform",
            overflow: "hidden",
          }}
        >
        {/* ── Header ── */}
        <AppHeader title="Select Alert Type" onBack={onClose} onCloseAll={onCloseAll} />

        {/* ── Scrollable content ── */}
        <div style={{
          flex: 1, overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          willChange: "scroll-position",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
        } as React.CSSProperties}>

          {/* Live symbol card */}
          <PremiumSymbolCard symbol={symbol} />

          {/* Section label */}
          <div style={{
            padding: "24px 16px 14px",
            fontSize: 11, fontWeight: 700,
            color: "rgba(255,255,255,.45)",
            letterSpacing: ".09em",
            textTransform: "uppercase",
          }}>
            Choose alert type
          </div>

          {/* Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
            <AlertTypeCard
              index={0}
              accentColor="#B7FF5A"
              title="Trendline Alerts"
              description="Trigger when price touches or crosses a trendline."
              onPress={() => setActiveModal("trendline")}
            />
            <AlertTypeCard
              index={1}
              accentColor="#fb923c"
              title="Zone Alerts"
              description="Trigger when price enters or exits a defined zone."
              onPress={() => setActiveModal("zone")}
            />
            <AlertTypeCard
              index={2}
              accentColor="#60a5fa"
              title="Price Alerts"
              description="Trigger when price reaches a specific price level."
              onPress={() => setActiveModal("price")}
            />
          </div>
        </div>
        </div> {/* inner panel */}
      </div> {/* outer shell */}

      {/* Trendline — full-screen slide-in screen */}
      <TrendlineAlertScreen
        open={activeModal === "trendline"}
        symbol={symbol}
        onClose={() => setActiveModal(null)}
        onSave={handleTrendlineAlertSave}
        onCloseAll={handleCloseAll}
      />

      {/* Zone — full-screen slide-in screen */}
      <ZoneAlertScreen
        open={activeModal === "zone"}
        symbol={symbol}
        onClose={() => setActiveModal(null)}
        onSave={handleZoneAlertSave}
        onCloseAll={handleCloseAll}
      />
      {/* Price — full-screen slide-in screen */}
      <PriceAlertScreen
        open={activeModal === "price"}
        symbol={symbol}
        onClose={() => setActiveModal(null)}
        onSave={handlePriceAlertSave}
        onCloseAll={handleCloseAll}
      />
    </>,
    document.body,
  );
});
