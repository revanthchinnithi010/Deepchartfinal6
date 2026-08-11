import { useState, useMemo, useEffect, useLayoutEffect, useRef, memo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  useListTrades,
  useCreateTrade,
  useDeleteTrade,
  getListTradesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrencyFormatter } from "@/store/currencyStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Trash2, Eye, ExternalLink, ImageIcon, TrendingUp,
  X, ChevronDown, Tag, AlertTriangle, FileText, Link as LinkIcon,
  SlidersHorizontal, ArrowLeft,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  BROKER_MAP,
  ALL_SYMBOLS,
  SETUP_TAG_OPTIONS,
  MISTAKE_TAG_OPTIONS,
  TV_LINKS
} from "@/data/sampleData";
import { useIsMobile } from "@/hooks/use-mobile";
import { toArray } from "@/lib/safeArray";
import {
  PageTransition,
  AnimatedList,
  AnimatedListItem,
  AnimatedPresenceList,
  AnimatedButton,
  AnimatedIconButton,
  LoadingSpinner,
  FadeIn
} from "@/components/animations";

const tradeSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  side: z.enum(["long", "short"]),
  entryPrice: z.coerce.number().min(0),
  exitPrice: z.coerce.number().min(0),
  quantity: z.coerce.number().min(1),
  stopLoss: z.coerce.number().optional().nullable(),
  takeProfit: z.coerce.number().optional().nullable(),
  entryDate: z.string().min(1, "Entry date is required"),
  exitDate: z.string().min(1, "Exit date is required"),
  tvLink: z.string().optional().nullable(),
  screenshot: z.string().optional().nullable(),
  setupTags: z.string().optional().nullable(),
  mistakeTags: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type TradeFormValues = z.infer<typeof tradeSchema>;

type ModalTab = "details" | "analysis";

function MultiSelectChips({
  options,
  value,
  onChange,
  activeClass = "bg-primary/20 text-primary border-primary/35",
  inactiveClass = "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:text-white hover:bg-white/[0.08]"
}: {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  activeClass?: string;
  inactiveClass?: string;
}) {
  const selected = value ? value.split(",").filter(Boolean) : [];
  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter(s => s !== opt).join(","));
    else onChange([...selected, opt].join(","));
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const isSelected = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all duration-150 ${isSelected ? activeClass : inactiveClass}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function FilterPill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  const isMobile = useIsMobile();

  const mobileActiveStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(220,228,255,0.92) 50%, rgba(255,255,255,0.88) 100%)",
    border: "1.5px solid rgba(255,255,255,0.85)",
    color: "#0a0a0f",
    boxShadow: "0 2px 12px rgba(255,255,255,0.22), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(190,205,255,0.35)",
  };

  return (
    <button
      onClick={onClick}
      style={active && isMobile ? mobileActiveStyle : undefined}
      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 ${
        active
          ? "bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/10"
          : "bg-white/[0.03] border-white/[0.07] text-muted-foreground hover:text-white hover:bg-white/[0.06]"
      }`}
    >
      {label}
    </button>
  );
}

// ── MiniRangePicker — compact inline date-range calendar ─────────────────
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// activeInput: which slot the user is filling ("from" | "to")
// onSelect: called with the chosen YYYY-MM-DD string
function MiniRangePicker({
  from, to, activeInput, onSelect,
}: {
  from: string;
  to: string;
  activeInput: "from" | "to";
  onSelect: (date: string) => void;
}) {
  const today = new Date();
  // Start calendar on the month relevant to the active input
  const seedDate = activeInput === "to" && to
    ? new Date(to + "T00:00:00")
    : activeInput === "from" && from
      ? new Date(from + "T00:00:00")
      : today;

  const [viewYear,  setViewYear]  = useState(() => seedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => seedDate.getMonth());

  const fromDate = from ? new Date(from + "T00:00:00") : null;
  const toDate   = to   ? new Date(to   + "T00:00:00") : null;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const firstDay  = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMon }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const toYMD = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const isFrom  = (d: number) => toYMD(viewYear, viewMonth, d) === from;
  const isTo    = (d: number) => toYMD(viewYear, viewMonth, d) === to;
  const inRange = (d: number) => {
    if (!fromDate || !toDate) return false;
    const t = new Date(viewYear, viewMonth, d).getTime();
    return t > fromDate.getTime() && t < toDate.getTime();
  };
  const isToday = (d: number) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const COL = `${100 / 7}%`;

  return (
    <div style={{ userSelect: "none" }}>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" onClick={prevMonth} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 400 }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{MONTHS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 400 }}>›</button>
      </div>

      {/* Weekday row */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${COL})`, marginBottom: 4 }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.4)", paddingBottom: 4, letterSpacing: "0.04em" }}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${COL})`, gap: "2px 0" }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const start  = isFrom(day);
          const end    = isTo(day);
          const middle = inRange(day);
          const todayC = isToday(day);
          const isSelected = start || end;

          return (
            <div key={idx} style={{ position: "relative", height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Range band */}
              {middle && <div style={{ position: "absolute", inset: "4px 0", background: "rgba(255,255,255,0.08)", zIndex: 0 }} />}
              {start && to && <div style={{ position: "absolute", top: 4, bottom: 4, left: "50%", right: 0, background: "rgba(255,255,255,0.08)", zIndex: 0 }} />}
              {end && from && <div style={{ position: "absolute", top: 4, bottom: 4, left: 0, right: "50%", background: "rgba(255,255,255,0.08)", zIndex: 0 }} />}
              <button
                type="button"
                onClick={() => onSelect(toYMD(viewYear, viewMonth, day))}
                style={{
                  position: "relative", zIndex: 1,
                  width: 30, height: 30,
                  borderRadius: "50%",
                  background: isSelected ? "rgba(255,255,255,0.92)" : "transparent",
                  border: "none",
                  color: isSelected ? "#0a0a0f" : todayC ? "#fff" : "rgba(255,255,255,0.72)",
                  fontWeight: isSelected || todayC ? 700 : 400,
                  fontSize: 12.5,
                  cursor: "pointer",
                  transition: "background 0.12s",
                  outline: "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: todayC && !isSelected ? "inset 0 0 0 1px rgba(255,255,255,0.25)" : "none",
                }}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── FilterBottomSheet — mobile-only filter panel ──────────────────────────
// Opens from below with a spring slide. All filters live here on mobile.
// Uses draft state: changes are staged until "Apply" is tapped.

const BROKER_OPTS = [
  { value: "all",            label: "All",           color: undefined },
  { value: "Delta Exchange", label: "Delta",         color: "#f97316" },
  { value: "FusionMarkets",  label: "Fusion Markets",color: "#3b82f6" },
  { value: "cTrader",        label: "cTrader",       color: "#a78bfa" },
] as const;

function FilterBottomSheet({
  open,
  onClose,
  outcomeFilter,
  sideFilter,
  brokerFilter,
  dateFrom,
  dateTo,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  outcomeFilter: string;
  sideFilter: string;
  brokerFilter: string;
  dateFrom: string;
  dateTo: string;
  onApply: (outcome: string, side: string, broker: string, dateFrom: string, dateTo: string) => void;
}) {
  const [draftOutcome,  setDraftOutcome]  = useState(outcomeFilter);
  const [draftSide,     setDraftSide]     = useState(sideFilter);
  const [draftBroker,   setDraftBroker]   = useState(brokerFilter);
  const [draftDateFrom, setDraftDateFrom] = useState(dateFrom);
  const [draftDateTo,   setDraftDateTo]   = useState(dateTo);
  const [activeInput,   setActiveInput]   = useState<"from" | "to" | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const calendarAnchorRef  = useRef<HTMLDivElement>(null);

  // Scroll calendar into view when it opens.
  // behavior:"instant" (not "smooth") — smooth scroll runs a JS-driven RAF
  // animation that competes with the calendar's own expand transition on the
  // main thread, doubling the layout work and causing the jank the user sees.
  // Instant scroll is a single synchronous layout read+write, invisible to the
  // user while the calendar is still fading in via the opacity transition.
  useEffect(() => {
    if (!activeInput) return;
    const id = setTimeout(() => {
      calendarAnchorRef.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
    }, 80); // after max-height transition has opened enough to be measurable
    return () => clearTimeout(id);
  }, [activeInput]);

  // ── Sheet-open lifecycle ──────────────────────────────────────────────────

  // 1. Reset scroll position BEFORE the first paint when the sheet opens.
  //
  // Root cause of the "suddenly closed / flickering" bug:
  //   When the user opens the date-range calendar, scrollIntoView() moves the
  //   sheet's inner scroll container down to show the calendar. After they
  //   select both dates and tap Apply, the sheet closes — but the scrollTop
  //   is preserved (the component is always mounted; only CSS shows/hides it).
  //   The next time the sheet opens, the scroll container starts at that old
  //   offset: the filter chips (Outcome / Side / Broker / Range inputs) are
  //   scrolled off the TOP of the viewport, and the visible area shows only
  //   empty space below the collapsed calendar — exactly the "blank / suddenly
  //   closed" appearance the user reported.
  //
  // useLayoutEffect fires synchronously after DOM commit but BEFORE the browser
  // paints, so the scroll is corrected in the same frame the sheet starts
  // sliding up. The user never sees the stale scroll position.
  // No setState here — pure DOM mutation — so no extra React render is triggered.
  useLayoutEffect(() => {
    if (!open) return;
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [open]);

  // 2. Sync draft filter values when the sheet opens (after commit).
  //
  // useEffect (not useLayoutEffect) intentionally — these are React state
  // updates, and scheduling them after the paint means the slide-up CSS
  // transition plays correctly before any draft re-render happens.
  // Deps intentionally omit the filter props: sync only on open, not on every
  // parent filter change (which would clobber in-progress draft edits).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    setDraftOutcome(outcomeFilter);
    setDraftSide(sideFilter);
    setDraftBroker(brokerFilter);
    setDraftDateFrom(dateFrom);
    setDraftDateTo(dateTo);
    setActiveInput(null);
  }, [open]); // ← only `open` is intentional; see comment above

  // 3. After the close animation finishes, reset activeInput and scroll as a
  //    safety net — covers the case where the user closed without selecting
  //    both dates (activeInput still "from"/"to") or navigated away while the
  //    sheet was open. The 360ms delay is the 320ms CSS close transition + a
  //    small buffer. If the sheet reopens before this fires, the cleanup
  //    cancels the timeout and step 1+2 above handle the reset on open.
  useEffect(() => {
    if (open) return;
    const id = setTimeout(() => {
      setActiveInput(null);
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    }, 360);
    return () => clearTimeout(id);
  }, [open]);

  const handleReset = () => {
    setDraftOutcome("all");
    setDraftSide("all");
    setDraftBroker("all");
    setDraftDateFrom("");
    setDraftDateTo("");
    setActiveInput(null);
  };

  // Called when user picks a day in the calendar
  const handleDateSelect = (date: string) => {
    if (activeInput === "from") {
      setDraftDateFrom(date);
      // If new from > existing to, clear to
      if (draftDateTo && date > draftDateTo) setDraftDateTo("");
      setActiveInput("to");
    } else {
      // "to"
      if (draftDateFrom && date < draftDateFrom) {
        // Swapped — treat as new "from"
        setDraftDateFrom(date);
        setDraftDateTo("");
        setActiveInput("to");
      } else {
        setDraftDateTo(date);
        setActiveInput(null);
      }
    }
  };

  const handleApply = () => {
    onApply(draftOutcome, draftSide, draftBroker, draftDateFrom, draftDateTo);
    onClose();
  };

  // ── Chip helper ──────────────────────────────────────────────────────────
  const Chip = ({
    label, active, accent, onClick,
  }: { label: string; active: boolean; accent?: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      style={active && accent ? {
        background: `${accent}18`,
        border: `1.5px solid ${accent}55`,
        color: accent,
      } : active ? {
        background: "rgba(255,255,255,0.12)",
        border: "1.5px solid rgba(255,255,255,0.40)",
        color: "#ffffff",
      } : undefined}
      className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-semibold border transition-all duration-150 ${
        active
          ? ""
          : "bg-white/[0.04] border-white/[0.09] text-white/50 hover:text-white hover:bg-white/[0.08]"
      }`}
    >
      {label}
    </button>
  );

  // ── Section header ────────────────────────────────────────────────────────
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(148,163,184,0.5)", marginBottom: 8, textTransform: "uppercase" }}>
      {children}
    </p>
  );

  // Always render in the DOM — CSS handles show/hide (no unmount/remount lag)
  return createPortal(
    <>
      {/* Backdrop — CSS opacity transition */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 400,
          background: "rgba(0,0,0,0.72)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.24s ease",
        }}
      />

      {/* Sheet — CSS transform transition, GPU-composited */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 401,
          background: "#000000",
          borderTop: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -16px 64px rgba(0,0,0,0.85)",
          paddingBottom: "max(env(safe-area-inset-bottom, 16px), 16px)",
          display: "flex", flexDirection: "column",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
          willChange: "transform",
          pointerEvents: open ? "auto" : "none",
        }}
      >
            {/* Handle pill */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
              <div style={{ width: 36, height: 4, borderRadius: 9999, background: "rgba(255,255,255,0.18)" }} />
            </div>

            {/* Title row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 18px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.01em" }}>
                Filters
              </span>
              <button
                onClick={onClose}
                style={{
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 8, padding: "6px 8px", cursor: "pointer", lineHeight: 0,
                  color: "rgba(148,163,184,0.55)",
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Filter groups — scrollable */}
            <div ref={scrollContainerRef} style={{
              flex: 1, overflowY: "auto", overflowX: "hidden",
              padding: "18px 18px 8px",
              display: "flex", flexDirection: "column", gap: 20,
              WebkitOverflowScrolling: "touch",
            }}>
              {/* Trade Result */}
              <div>
                <SectionLabel>Trade Result</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { v: "all",       label: "All" },
                    { v: "win",       label: "Win",       accent: "#10b981" },
                    { v: "loss",      label: "Loss",      accent: "#ef4444" },
                    { v: "breakeven", label: "Breakeven", accent: "#f59e0b" },
                  ].map(({ v, label, accent }) => (
                    <Chip key={v} label={label} accent={accent} active={draftOutcome === v} onClick={() => setDraftOutcome(v)} />
                  ))}
                </div>
              </div>

              {/* Trade Side */}
              <div>
                <SectionLabel>Trade Side</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { v: "all",   label: "All Sides" },
                    { v: "long",  label: "Long",  accent: "#60a5fa" },
                    { v: "short", label: "Short", accent: "#f97316" },
                  ].map(({ v, label, accent }) => (
                    <Chip key={v} label={label} accent={accent} active={draftSide === v} onClick={() => setDraftSide(v)} />
                  ))}
                </div>
              </div>

              {/* Broker */}
              <div>
                <SectionLabel>Broker</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {BROKER_OPTS.map(({ value, label, color }) => (
                    <Chip key={value} label={label} accent={color as string | undefined} active={draftBroker === value} onClick={() => setDraftBroker(value)} />
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div>
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <SectionLabel>Range</SectionLabel>
                  {(draftDateFrom || draftDateTo) && (
                    <button type="button" onClick={() => { setDraftDateFrom(""); setDraftDateTo(""); setActiveInput(null); }}
                      style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      Clear
                    </button>
                  )}
                </div>

                {/* From / To tap inputs */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {(["from", "to"] as const).map(slot => {
                    const val   = slot === "from" ? draftDateFrom : draftDateTo;
                    const label = slot === "from" ? "From" : "To";
                    const isActive = activeInput === slot;
                    const hasVal   = Boolean(val);
                    return (
                      <button
                        key={slot} type="button"
                        onClick={() => setActiveInput(isActive ? null : slot)}
                        style={{
                          flex: 1, height: 42, borderRadius: 10, cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "flex-start",
                          justifyContent: "center", padding: "0 12px", gap: 1,
                          background: isActive ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
                          border: isActive
                            ? "1.5px solid rgba(255,255,255,0.35)"
                            : hasVal
                              ? "1px solid rgba(255,255,255,0.18)"
                              : "1px solid rgba(255,255,255,0.08)",
                          transition: "border 0.15s, background 0.15s",
                        }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: isActive ? "rgba(255,255,255,0.55)" : "rgba(148,163,184,0.4)" }}>
                          {label}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: hasVal ? 500 : 400, color: hasVal ? "#f1f5f9" : "rgba(148,163,184,0.35)", lineHeight: 1 }}>
                          {val ? new Date(val + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Calendar — max-height clip + opacity fade.
                    grid-template-rows 0fr→1fr was the original approach but it
                    requires the browser to re-measure content height on EVERY
                    animation frame (layout reflow per frame), causing visible
                    jank on mobile WebView. max-height with a fixed pixel value
                    costs one layout calculation when it changes, then only
                    opacity (GPU-composited) animates every frame. */}
                <div ref={calendarAnchorRef} style={{
                  maxHeight: activeInput ? "400px" : "0px",
                  overflow: "hidden",
                  opacity: activeInput ? 1 : 0,
                  pointerEvents: activeInput ? "auto" : "none",
                  transition: "max-height 0.2s ease, opacity 0.18s ease",
                }}>
                  <p style={{ fontSize: 11, color: "rgba(148,163,184,0.45)", marginBottom: 8, marginTop: 2 }}>
                    {activeInput === "from" ? "Tap a start date" : "Tap an end date"}
                  </p>
                  <div style={{ padding: "10px 6px 8px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <MiniRangePicker
                      from={draftDateFrom}
                      to={draftDateTo}
                      activeInput={activeInput ?? "from"}
                      onSelect={handleDateSelect}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer actions — pinned */}
            <div style={{
              flexShrink: 0,
              display: "flex", gap: 10, padding: "14px 18px 4px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}>
              <button
                onClick={handleReset}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "rgba(148,163,184,0.8)", fontSize: 13.5, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reset Filters
              </button>
              <button
                onClick={handleApply}
                style={{
                  flex: 2, height: 44, borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(220,228,255,0.92) 50%, rgba(255,255,255,0.88) 100%)",
                  border: "1.5px solid rgba(255,255,255,0.85)",
                  color: "#0a0a0f", fontSize: 13.5, fontWeight: 700,
                  boxShadow: "0 2px 12px rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,1)",
                  cursor: "pointer",
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </>,
        document.body,
      );
}

// ── AddTradeSheet ─────────────────────────────────────────────────────────
// Isolated as a memo component so form.watch() subscriptions and portal
// re-renders never cascade into the Trades list.

const AT_INPUT = "bg-white/[0.04] border-white/[0.09] rounded-xl h-10 text-[13px] focus:border-primary/50 focus:ring-0 placeholder:text-muted-foreground/50 transition-colors";
const AT_LABEL = "text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider";

interface AddTradeSheetProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<TradeFormValues>;
  onSubmit: (data: TradeFormValues) => void;
  isPending: boolean;
}

const AddTradeSheet = memo(function AddTradeSheet({
  open, onClose, form, onSubmit, isPending,
}: AddTradeSheetProps) {
  const [modalTab, setModalTab] = useState<ModalTab>("details");

  // Scoped watch — updates only re-render this component, not the trade list
  const watchedSymbol  = form.watch("symbol");
  const watchedSide    = form.watch("side");
  const screenshotUrl  = form.watch("screenshot");
  const setupTagsVal   = form.watch("setupTags") ?? "";
  const mistakeTagsVal = form.watch("mistakeTags") ?? "";

  // Reset tab every time the sheet is opened
  useEffect(() => {
    if (open) setModalTab("details");
  }, [open]);

  const tagCount =
    setupTagsVal.split(",").filter(Boolean).length +
    mistakeTagsVal.split(",").filter(Boolean).length;

  return createPortal(
    <>
      {/* Full-screen sheet */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 501,
          background: "#000000",
          display: "flex", flexDirection: "column",
          // Enter: spring up from 48px below + scale up from 0.97 + fade in
          // Exit:  snap down 24px + scale down to 0.98 + fade out — different
          //        easing and duration per direction so open feels responsive
          //        and close feels instant.
          opacity:    open ? 1 : 0,
          transform:  open
            ? "translate3d(0,0,0) scale(1)"
            : "translate3d(0,48px,0) scale(0.97)",
          transition: open
            ? "opacity 0.18s cubic-bezier(0.22,1,0.36,1), transform 0.22s cubic-bezier(0.22,1,0.36,1)"
            : "opacity 0.14s cubic-bezier(0.4,0,1,1), transform 0.16s cubic-bezier(0.4,0,1,1)",
          willChange:               "transform, opacity",
          backfaceVisibility:       "hidden",
          WebkitBackfaceVisibility: "hidden",
          pointerEvents: open ? "auto" : "none",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Nav bar — back button + centred title */}
        <div style={{
          display: "flex", alignItems: "center",
          height: 56,
          paddingLeft: 8, paddingRight: 16,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          position: "relative",
        }}>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: "50%",
              background: "transparent", border: "none",
              color: "rgba(255,255,255,0.7)", cursor: "pointer",
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <span style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            fontSize: 15, fontWeight: 600, color: "#f1f5f9", letterSpacing: "-0.01em",
            pointerEvents: "none",
          }}>
            Add Trade
          </span>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px 0", flexShrink: 0 }}>
          {(["details", "analysis"] as ModalTab[]).map((tab, i) => (
            <div key={tab} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                opacity: modalTab === tab ? 1 : 0.35,
                transition: "opacity 0.2s",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: modalTab === tab ? "hsl(var(--primary))" : "rgba(255,255,255,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700,
                  color: modalTab === tab ? "#fff" : "rgba(255,255,255,0.5)",
                  transition: "background 0.2s",
                }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: modalTab === tab ? "#f1f5f9" : "rgba(148,163,184,0.6)" }}>
                  {tab === "details" ? "Trade Details" : "Analysis & Tags"}
                </span>
              </div>
              {i === 0 && (
                <div style={{ width: 24, height: 1, background: "rgba(255,255,255,0.10)" }} />
              )}
            </div>
          ))}
        </div>

        {/* Scrollable Form Body */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "18px 18px 8px", WebkitOverflowScrolling: "touch" as any }}>
          <Form {...form}>
            <form id="tradeForm" onSubmit={form.handleSubmit(onSubmit)}>
              <AnimatePresence mode="wait" initial={false}>
                {modalTab === "details" && (
                  <motion.div
                    key="details"
                    initial={{ x: "-100%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: "-100%", opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-4"
                    style={{ willChange: "transform" }}
                  >
                    {/* Symbol + Side + Broker */}
                    <div className="grid grid-cols-3 gap-3">
                      <FormField control={form.control} name="symbol" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Asset</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className={AT_INPUT}><SelectValue placeholder="Select asset" /></SelectTrigger>
                            </FormControl>
                            <SelectContent className="border-0 rounded-xl" style={{ background: "hsl(var(--card))", border: "1px solid var(--surface-btn-border)" }}>
                              {ALL_SYMBOLS.map(sym => <SelectItem key={sym} value={sym} className="text-[13px]">{sym}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="side" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Direction</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className={AT_INPUT}><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent className="border-0 rounded-xl" style={{ background: "hsl(var(--card))", border: "1px solid var(--surface-btn-border)" }}>
                              <SelectItem value="long" className="text-[13px]">Long (Buy)</SelectItem>
                              <SelectItem value="short" className="text-[13px]">Short (Sell)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div>
                        <p className={`${AT_LABEL} mb-1.5`}>Broker</p>
                        <div className={`${AT_INPUT} flex items-center gap-2 px-3 border`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            BROKER_MAP[watchedSymbol] === "Delta Exchange" ? "bg-orange-400" :
                            BROKER_MAP[watchedSymbol] === "FusionMarkets"  ? "bg-blue-400"   :
                            BROKER_MAP[watchedSymbol] === "Groww"          ? "bg-teal-400"   :
                            "bg-muted-foreground/40"
                          }`} />
                          <span className="text-[13px] text-muted-foreground truncate">
                            {BROKER_MAP[watchedSymbol] || "Auto-detected"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Source Badge */}
                    <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                      <span className="text-[11px] text-muted-foreground font-medium">Source:</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.09] text-[11px] font-bold text-white/80">
                        <FileText className="w-3 h-3 text-muted-foreground" /> Manual Entry
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground/60">Sync source: Manual</span>
                    </div>

                    {/* Entry / Exit / Qty */}
                    <div className="grid grid-cols-3 gap-3">
                      <FormField control={form.control} name="entryPrice" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Entry Price</FormLabel>
                          <FormControl><Input type="number" step="0.0001" {...field} className={AT_INPUT} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="exitPrice" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Exit Price</FormLabel>
                          <FormControl><Input type="number" step="0.0001" {...field} className={AT_INPUT} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="quantity" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Qty / Lots</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} className={AT_INPUT} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* SL / TP */}
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="stopLoss" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Stop Loss</FormLabel>
                          <FormControl><Input type="number" step="0.0001" placeholder="Optional" {...field} value={field.value ?? ""} className={AT_INPUT} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="takeProfit" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Take Profit</FormLabel>
                          <FormControl><Input type="number" step="0.0001" placeholder="Optional" {...field} value={field.value ?? ""} className={AT_INPUT} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="entryDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Entry Date & Time</FormLabel>
                          <FormControl><Input type="datetime-local" {...field} className={AT_INPUT} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="exitDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Exit Date & Time</FormLabel>
                          <FormControl><Input type="datetime-local" {...field} className={AT_INPUT} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </motion.div>
                )}

                {modalTab === "analysis" && (
                  <motion.div
                    key="analysis"
                    initial={{ x: "100%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: "100%", opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-5"
                    style={{ willChange: "transform" }}
                  >
                    {/* TradingView Link */}
                    <FormField control={form.control} name="tvLink" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={AT_LABEL + " flex items-center gap-1.5"}>
                          <LinkIcon className="w-3 h-3" /> TradingView Chart Link
                        </FormLabel>
                        <div className="relative">
                          <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
                          <FormControl>
                            <Input placeholder="https://www.tradingview.com/chart/..." {...field} value={field.value ?? ""} className={`${AT_INPUT} pl-9`} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Screenshot */}
                    <FormField control={form.control} name="screenshot" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={AT_LABEL + " flex items-center gap-1.5"}>
                          <ImageIcon className="w-3 h-3" /> Screenshot URL
                        </FormLabel>
                        <div className="relative">
                          <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                          <FormControl>
                            <Input placeholder="https://..." {...field} value={field.value ?? ""} className={`${AT_INPUT} pl-9`} />
                          </FormControl>
                        </div>
                        {screenshotUrl && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-white/[0.08] aspect-video max-h-36">
                            <img src={screenshotUrl} alt="Preview" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Setup Tags */}
                    <FormField control={form.control} name="setupTags" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={AT_LABEL + " flex items-center gap-1.5"}>
                          <Tag className="w-3 h-3" /> Setup Tags
                        </FormLabel>
                        <FormControl>
                          <MultiSelectChips options={SETUP_TAG_OPTIONS} value={setupTagsVal} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Mistake Tags */}
                    <FormField control={form.control} name="mistakeTags" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={AT_LABEL + " flex items-center gap-1.5"}>
                          <AlertTriangle className="w-3 h-3 text-red-400/70" /> Mistake Tags
                        </FormLabel>
                        <FormControl>
                          <MultiSelectChips options={MISTAKE_TAG_OPTIONS} value={mistakeTagsVal} onChange={field.onChange} activeClass="bg-red-500/15 text-red-400 border-red-500/30" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Notes */}
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className={AT_LABEL + " flex items-center gap-1.5"}>
                          <FileText className="w-3 h-3" /> Journal Notes
                        </FormLabel>
                        <FormControl>
                          <Textarea placeholder="What was your thesis? How did the trade go?" {...field} value={field.value ?? ""} rows={4} className="bg-white/[0.04] border-white/[0.09] rounded-xl text-[13px] focus:border-primary/50 focus:ring-0 resize-none placeholder:text-muted-foreground/40" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </Form>
        </div>

        {/* Pinned Footer */}
        <div style={{
          flexShrink: 0, padding: "14px 18px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 8,
              fontSize: 11, fontWeight: 700,
              background: watchedSide === "long" ? "rgba(96,165,250,0.12)" : "rgba(249,115,22,0.12)",
              color:      watchedSide === "long" ? "#60a5fa"               : "#f97316",
            }}>
              {watchedSide?.toUpperCase()}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{watchedSymbol}</span>
            {modalTab === "analysis" && tagCount > 0 && (
              <span style={{ fontSize: 11, color: "rgba(148,163,184,0.55)" }}>
                · {tagCount} tag{tagCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {modalTab === "details" ? (
              <button
                type="button"
                onClick={() => setModalTab("analysis")}
                style={{
                  padding: "0 20px", height: 40, borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(220,228,255,0.92) 50%, rgba(255,255,255,0.88) 100%)",
                  border: "1.5px solid rgba(255,255,255,0.85)",
                  color: "#0a0a0f", fontSize: 13.5, fontWeight: 700,
                  boxShadow: "0 2px 12px rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,1)",
                  cursor: "pointer",
                }}
              >
                Next →
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setModalTab("details")}
                  style={{ padding: "0 16px", height: 40, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(148,163,184,0.8)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  ← Back
                </button>
                <button
                  type="submit" form="tradeForm" disabled={isPending}
                  style={{
                    padding: "0 20px", height: 40, borderRadius: 12,
                    background: "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(220,228,255,0.92) 50%, rgba(255,255,255,0.88) 100%)",
                    border: "1.5px solid rgba(255,255,255,0.85)",
                    color: "#0a0a0f", fontSize: 13.5, fontWeight: 700,
                    boxShadow: "0 2px 12px rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,1)",
                    cursor: isPending ? "not-allowed" : "pointer",
                    opacity: isPending ? 0.5 : 1,
                  }}
                >
                  {isPending ? "Saving..." : "Save Trade"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
});

export default function Trades() {
  const [page, setPage] = useState(1);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [brokerFilter, setBrokerFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const fc       = useCurrencyFormatter();

  // Count non-default active filters for the badge
  const activeFilterCount =
    (outcomeFilter !== "all" ? 1 : 0) +
    (sideFilter    !== "all" ? 1 : 0) +
    (brokerFilter  !== "all" ? 1 : 0) +
    (dateFrom || dateTo     ? 1 : 0);

  const queryClient = useQueryClient();

  const { data: tradesResponse } = useListTrades({
    page,
    limit: 20,
    symbol: symbolFilter || undefined,
    outcome: outcomeFilter !== "all" ? (outcomeFilter as "win" | "loss" | "breakeven") : undefined,
  });

  const createTrade = useCreateTrade({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        setIsModalOpen(false);
        form.reset();
      }
    }
  });

  const deleteTrade = useDeleteTrade({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        setSelectedTradeId(null);
      }
    }
  });

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(tradeSchema),
    defaultValues: {
      symbol: "NAS100",
      side: "long",
      entryPrice: 0,
      exitPrice: 0,
      quantity: 1,
      entryDate: new Date().toISOString().slice(0, 16),
      exitDate: new Date().toISOString().slice(0, 16),
      tvLink: "",
      screenshot: "",
      setupTags: "",
      mistakeTags: "",
      notes: "",
    }
  });

  const onSubmit = useCallback((data: TradeFormValues) => {
    createTrade.mutate({ data });
  }, [createTrade]);

  const openModal  = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const selectedTrade = toArray(tradesResponse?.trades, "trades.tradesResponse.trades").find(t => t.id === selectedTradeId);

  const filteredTrades = useMemo(() => {
    if (!tradesResponse) return [];
    const fromMs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
    const toMs   = dateTo   ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
    return toArray(tradesResponse.trades, "trades.filteredTrades").filter(t => {
      const broker  = BROKER_MAP[t.symbol] || "";
      const entryMs = new Date(t.entryDate).getTime();
      return t.exitPrice != null &&
             (sideFilter   === "all" || t.side === sideFilter) &&
             (brokerFilter === "all" || broker === brokerFilter) &&
             (fromMs === null || entryMs >= fromMs) &&
             (toMs   === null || entryMs <= toMs);
    });
  }, [tradesResponse, sideFilter, brokerFilter, dateFrom, dateTo]);

  const inputCls = "bg-white/[0.04] border-white/[0.09] rounded-xl h-10 text-[13px] focus:border-primary/50 focus:ring-0 placeholder:text-muted-foreground/50 transition-colors";
  const labelCls = "text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#000000" }}>

      {/* ── Secondary header ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4"
        style={{ height: 56, borderBottom: "1px solid #262626" }}
      >
        <span className="font-semibold" style={{ color: "#F3F3F3", fontSize: 17 }}>Trades</span>
        <div className="flex items-center gap-2">
          {/* Filter icon with active-count badge */}
          <AnimatedIconButton
            onClick={() => setFilterSheetOpen(true)}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl border border-white/[0.10] bg-white/[0.04] text-muted-foreground hover:text-white hover:bg-white/[0.08] transition-all shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-black"
                style={{ background: "rgba(255,255,255,0.92)" }}
              >
                {activeFilterCount}
              </span>
            )}
          </AnimatedIconButton>
          {/* Add Trade */}
          <AnimatedButton
            onClick={openModal}
            className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl border-2 border-white bg-white text-black text-[13px] font-semibold hover:bg-white/90 shadow-md shadow-black/10 shrink-0"
          >
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-black">
              <Plus className="w-2.5 h-2.5 text-white" />
            </span>
            Add Trade
          </AnimatedButton>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div
        className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        <div
          className="py-4 px-2 space-y-4 mx-auto max-w-[1400px]"
          style={{ paddingBottom: isMobile ? 80 : 40 }}
        >

          {/* ── Search + desktop filter pills ── */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
              <Input
                placeholder="Search symbol…"
                className="pl-8.5 w-full bg-white/[0.04] border-white/[0.08] rounded-xl h-10 text-[13px] focus:border-primary/40 placeholder:text-muted-foreground/50"
                value={symbolFilter}
                onChange={(e) => { setSymbolFilter(e.target.value); setPage(1); }}
              />
            </div>
            {!isMobile && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {["all", "win", "loss", "breakeven"].map(v => (
                    <FilterPill
                      key={v}
                      label={v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
                      active={outcomeFilter === v}
                      onClick={() => { setOutcomeFilter(v); setPage(1); }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 ml-1">
                  {["all", "long", "short"].map(v => (
                    <FilterPill
                      key={v}
                      label={v === "all" ? "All Sides" : v.charAt(0).toUpperCase() + v.slice(1)}
                      active={sideFilter === v}
                      onClick={() => setSideFilter(v)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wider">Broker:</span>
                  {[
                    { value: "all",            label: "All" },
                    { value: "Delta Exchange", label: "Delta" },
                    { value: "FusionMarkets",  label: "Fusion" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setBrokerFilter(value)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 ${
                        brokerFilter === value
                          ? value === "Delta Exchange" ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                          : value === "FusionMarkets"  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                          : "bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/10"
                          : "bg-white/[0.03] border-white/[0.07] text-muted-foreground hover:text-white hover:bg-white/[0.06]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

      {/* ── Mobile filter bottom sheet ── */}
      <FilterBottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        outcomeFilter={outcomeFilter}
        sideFilter={sideFilter}
        brokerFilter={brokerFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onApply={(outcome, side, broker, from, to) => {
          setOutcomeFilter(outcome);
          setSideFilter(side);
          setBrokerFilter(broker);
          setDateFrom(from);
          setDateTo(to);
          setPage(1);
        }}
      />

      {/* ── Trade list ── */}
      <div>

        {/* Loading skeleton */}
        {!tradesResponse ? (
          <div>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 8px",
                  borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.055)" : "none",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-28 rounded-lg shimmer-loading" />
                  <div className="h-4 w-16 rounded-lg shimmer-loading" />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="h-3 w-20 rounded shimmer-loading" />
                  <div className="h-3 w-14 rounded shimmer-loading" />
                </div>
              </div>
            ))}
          </div>

        ) : filteredTrades.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            No trades match your filters.
          </div>

        ) : (
          <AnimatedList>
            {filteredTrades.map((trade, idx) => {
              const isLast    = idx === filteredTrades.length - 1;
              const rr        = trade.riskRewardRatio || 0;
              const setupTags = trade.setupTags ? trade.setupTags.split(",").filter(Boolean) : [];
              const isWin     = trade.pnl >= 0;
              const pnlColor  = isWin ? "#35C37A" : "#E0524F";
              const dateStr   = new Date(trade.entryDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const fPrice    = (v: number) => v < 1 ? v.toFixed(4) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });

              return (
                <AnimatedListItem
                  key={trade.id}
                  index={idx}
                  onClick={() => setSelectedTradeId(trade.id)}
                  className="cursor-pointer hover:bg-white/[0.025]"
                  style={{
                    padding:                 "12px 8px",
                    borderBottom:            isLast ? "none" : "1px solid rgba(255,255,255,0.12)",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <div>
                  {/* Row 1 — Symbol + side badge | PNL */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-semibold leading-none"
                        style={{ fontSize: 15, color: "#F0F0F0" }}
                      >
                        {trade.symbol}
                      </span>
                      <span
                        className="font-semibold leading-none"
                        style={{
                          fontSize:      10,
                          color:         trade.side === "long" ? "#35C37A" : "#E0524F",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {trade.side === "long" ? "LONG" : "SHORT"}
                      </span>
                    </div>
                    <span
                      className="font-semibold leading-none tabular-nums"
                      style={{ fontSize: 15, color: "rgba(255,255,255,0.55)" }}
                    >
                      {isWin ? "+" : ""}{fc(trade.pnl)}
                    </span>
                  </div>

                  {/* Row 2 — Entry price + meta | Date */}
                  <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                    <div className="flex items-center gap-0.5">
                      <span
                        className="font-medium tabular-nums"
                        style={{ fontSize: 12, color: "#6B6B6B" }}
                      >
                        {fPrice(trade.entryPrice)}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: "0 2px" }}>→</span>
                      <span
                        className="font-medium tabular-nums"
                        style={{ fontSize: 12, color: "#6B6B6B" }}
                      >
                        {trade.exitPrice != null ? fPrice(trade.exitPrice) : "—"}
                      </span>
                    </div>
                    <span
                      className="font-medium tabular-nums"
                      style={{ fontSize: 12, color: "#6B6B6B" }}
                    >
                      {dateStr}
                    </span>
                  </div>
                  </div>
                </AnimatedListItem>
              );
            })}
          </AnimatedList>
        )}

        {/* Pagination */}
        {tradesResponse && tradesResponse.total > 20 && (
          <div
            className="flex items-center justify-between"
            style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.055)" }}
          >
            <p className="text-[12px] text-muted-foreground">
              {(page - 1) * 20 + 1}–{Math.min(page * 20, tradesResponse.total)} of {tradesResponse.total}
            </p>
            <div className="flex gap-2">
              <AnimatedButton variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="rounded-xl border-white/[0.08] bg-white/[0.03] h-8 text-xs hover:bg-white/[0.07]">
                Previous
              </AnimatedButton>
              <AnimatedButton variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= tradesResponse.total}
                className="rounded-xl border-white/[0.08] bg-white/[0.03] h-8 text-xs hover:bg-white/[0.07]">
                Next
              </AnimatedButton>
            </div>
          </div>
        )}

      </div>{/* /glass-card */}
        </div>{/* /inner padding div */}
      </div>{/* /scroll container */}

      {/* ── Add Trade Bottom Sheet ── */}
      <AddTradeSheet
        open={isModalOpen}
        onClose={closeModal}
        form={form}
        onSubmit={onSubmit}
        isPending={createTrade.isPending}
      />

      {/* ── Trade Detail Drawer ── */}
      <Sheet open={!!selectedTradeId} onOpenChange={(open) => !open && setSelectedTradeId(null)}>
        <SheetContent
          className="w-full sm:max-w-[420px] p-0 flex flex-col overflow-hidden [&>button:first-child]:hidden"
          style={{
            background:   "#000000",
            borderLeft:   "1px solid rgba(255,255,255,0.07)",
            // ── Slide in from right → left (open), slide out left → right (close) ──
            // Restore the default sheetVariants translateX(100%) → translateX(0)
            // enter and translateX(0) → translateX(100%) exit, pure CSS transform,
            // no opacity fade.
            "--tw-enter-translate-x" : "100%",
            "--tw-exit-translate-x"  : "100%",
            "--tw-enter-opacity"     : "1",
            "--tw-exit-opacity"      : "1",
            animationDuration        : "260ms",
            animationTimingFunction  : "cubic-bezier(0.22, 1, 0.36, 1)",
          } as React.CSSProperties}
        >
          {selectedTrade && (
            <>
              {/* ── Custom Nav Header ── */}
              <div className="flex items-center px-4 h-14 shrink-0 relative" style={{ background: "#000000" }}>
                <button
                  onClick={() => setSelectedTradeId(null)}
                  className="flex items-center justify-center w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold text-white tracking-tight">Trade Details</span>
              </div>

              {/* ── Summary header: symbol + side ── */}
              <div className="mx-4 mt-2 mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-0.5">Symbol</p>
                  <h2 className="text-2xl font-black tracking-tight text-white leading-none">{selectedTrade.symbol}</h2>
                </div>
                <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                  selectedTrade.side === "long"
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                    : "bg-orange-500/15 text-orange-400 border border-orange-500/20"
                }`}>
                  {selectedTrade.side === "long" ? "LONG" : "SHORT"}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6" style={{ background: "#000000" }}>
                {/* Date + PnL — open strip, no card box */}
                <div className="flex items-center justify-between px-1 pb-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <p className="text-[9px] font-semibold text-white/35 uppercase tracking-widest mb-0.5">Date</p>
                    <p className="text-[13px] font-semibold text-white/80">
                      {new Date(selectedTrade.entryDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-semibold text-white/35 uppercase tracking-widest mb-0.5">
                      {selectedTrade.pnl >= 0 ? "Profit" : "Loss"}
                    </p>
                    <p className="text-[20px] font-black leading-tight" style={{ color: selectedTrade.pnl >= 0 ? "#34d399" : "#f87171" }}>
                      {selectedTrade.pnl >= 0 ? "+" : ""}{fc(selectedTrade.pnl)}
                    </p>
                  </div>
                </div>
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: "Entry", value: fc(selectedTrade.entryPrice), mono: true },
                    { label: "Exit", value: selectedTrade.exitPrice == null ? "—" : fc(selectedTrade.exitPrice), mono: true },
                    { label: "Risk / Reward", value: selectedTrade.riskRewardRatio ? `${selectedTrade.riskRewardRatio.toFixed(2)}R` : "—", mono: true },
                    { label: "Quantity", value: String(selectedTrade.quantity), mono: true },
                    { label: "Stop Loss", value: selectedTrade.stopLoss ? fc(selectedTrade.stopLoss) : "—", mono: true },
                    { label: "Take Profit", value: selectedTrade.takeProfit ? fc(selectedTrade.takeProfit) : "—", mono: true },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="p-3 rounded-xl border" style={{ background: "#111111", borderColor: "rgba(255,255,255,0.09)" }}>
                      <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">{label}</p>
                      <p className={`text-[14px] font-bold ${mono ? "font-mono" : ""} text-white leading-tight`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* TradingView Link */}
                <div className="space-y-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Analysis</p>
                  {(selectedTrade.tvLink || TV_LINKS[selectedTrade.symbol]) ? (
                    <button
                      className="tv-chart-btn w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[13px] font-semibold"
                      onClick={() => window.open(selectedTrade.tvLink || TV_LINKS[selectedTrade.symbol], "_blank")}
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Open TradingView Chart
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </button>
                  ) : (
                    <div className="px-4 py-2.5 rounded-xl border border-dashed border-white/[0.08] text-[12px] text-muted-foreground/60 italic">
                      No chart linked for this trade
                    </div>
                  )}

                  {/* Screenshot */}
                  {selectedTrade.screenshot ? (
                    <div
                      className="rounded-xl overflow-hidden border border-white/[0.08] cursor-pointer group relative"
                      onClick={() => window.open(selectedTrade.screenshot!, "_blank")}
                    >
                      <img
                        src={selectedTrade.screenshot}
                        alt="Trade Screenshot"
                        className="w-full max-h-44 object-cover group-hover:opacity-90 transition-opacity"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <ExternalLink className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-20 rounded-xl border border-dashed border-white/[0.07] flex items-center justify-center gap-2 text-[12px] text-muted-foreground/50 italic">
                      <ImageIcon className="w-4 h-4 opacity-50" /> No screenshot attached
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Tags</p>
                  {selectedTrade.setupTags && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Tag className="w-3 h-3" /> Setup
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTrade.setupTags.split(",").filter(Boolean).map(tag => (
                          <span key={tag} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-primary/12 text-primary border border-primary/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedTrade.mistakeTags && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-red-400/70" /> Mistakes
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTrade.mistakeTags.split(",").filter(Boolean).map(tag => (
                          <span key={tag} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!selectedTrade.setupTags && !selectedTrade.mistakeTags && (
                    <p className="text-[12px] text-muted-foreground/50 italic">No tags recorded</p>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Journal Notes
                  </p>
                  {selectedTrade.notes ? (
                    <div className="p-4 rounded-xl text-[13px] leading-relaxed text-white/70" style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.09)" }}>
                      {selectedTrade.notes}
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground/50 italic">No notes recorded for this trade.</p>
                  )}
                </div>
              </div>

            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
