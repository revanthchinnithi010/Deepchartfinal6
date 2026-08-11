import { memo, useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, TrendingUp, Trash2, Plus } from "lucide-react";
import { useIndicatorStore, type IndicatorType } from "@/store/indicatorStore";
import { motion, AnimatePresence } from "motion/react";
import { AnimatedModal, AnimatedList, AnimatedListItem } from "@/components/animations";

// ── WaveTrend built-in Pine Script ────────────────────────────────────────────

const WAVETREND_CODE = `//@version=6
indicator(title="WaveTrend [Revanth]", shorttitle="WT_LB", overlay=false)
n1 = input.int(10, "Channel Length")
n2 = input.int(21, "Average Length")
obLevel1 = input.int(60, "Over Bought Level 1")
obLevel2 = input.int(53, "Over Bought Level 2")
osLevel1 = input.int(-60, "Over Sold Level 1")
osLevel2 = input.int(-53, "Over Sold Level 2")
ap = hlc3
esa = ta.ema(ap, n1)
d = ta.ema(math.abs(ap - esa), n1)
ci = (ap - esa) / (0.015 * d)
tci = ta.ema(ci, n2)
wt1 = tci
wt2 = ta.sma(wt1, 4)
plot(wt1, color=color.green)
plot(wt2, color=color.red)
plot(wt1 - wt2, color=color.new(color.blue, 80), style=plot.style_area)`;

// ── Preset lists ──────────────────────────────────────────────────────────────

const EMA_PRESETS = [
  { period: 9,   color: "#f59e0b" },
  { period: 21,  color: "#38bdf8" },
  { period: 50,  color: "#a78bfa" },
  { period: 100, color: "#fb923c" },
  { period: 200, color: "#f87171" },
];

const SMA_PRESETS = [
  { period: 20,  color: "#60a5fa" },
  { period: 50,  color: "#818cf8" },
  { period: 200, color: "#c084fc" },
];

const OTHER_PRESETS: { type: IndicatorType; label: string; color: string; settings: Record<string, unknown> }[] = [
  { type: "RSI",        label: "RSI (14)",      color: "#c084fc", settings: { period: 14 } },
  { type: "VWAP",       label: "VWAP",          color: "#60a5fa", settings: {} },
  { type: "SUPERTREND", label: "Supertrend",    color: "#22c55e", settings: { period: 10, multiplier: 3 } },
];

// ── Custom indicator modal ────────────────────────────────────────────────────

interface CustomModalProps { onClose: () => void; onAdd: (name: string, pineCode: string) => void; }

const CustomIndicatorModal = memo(function CustomIndicatorModal({ onClose, onAdd }: CustomModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), code.trim());
    onClose();
  };

  return (
    <AnimatedModal
      isOpen={true}
      onClose={onClose}
      title="Custom Indicator"
      mode="dialog"
    >
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(167,184,169,0.7)", marginBottom: 6, letterSpacing: "0.04em" }}>
            Indicator Name
          </label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My EMA, BOS, FVG"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#d1d4dc", outline: "none", fontFamily: "inherit" }}
            onFocus={e => (e.currentTarget as HTMLInputElement).style.borderColor = "rgba(41,98,255,0.6)"}
            onBlur={e => (e.currentTarget as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)"} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(167,184,169,0.7)", marginBottom: 6, letterSpacing: "0.04em" }}>
            Pine Script Code
          </label>
          <div style={{ marginBottom: 6, fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
            Supports: ta.ema, ta.sma, ta.rsi, ta.vwap, BOS/CHoCH, FVG, OB, Liquidity
          </div>
          <textarea value={code} onChange={e => setCode(e.target.value)}
            placeholder={`indicator("My Strategy")\n\n// Detects BOS/CHoCH automatically\n// FVG, Order Blocks, Liquidity\n// or: plot(ta.ema(close, 200))`}
            rows={8}
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#d1d4dc", outline: "none", resize: "vertical", fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace", lineHeight: 1.6, minHeight: 140 }}
            onFocus={e => (e.currentTarget as HTMLTextAreaElement).style.borderColor = "rgba(41,98,255,0.6)"}
            onBlur={e => (e.currentTarget as HTMLTextAreaElement).style.borderColor = "rgba(255,255,255,0.1)"} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, cursor: "pointer", padding: "8px 16px", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"}>
            Cancel
          </button>
          <button onClick={handleAdd} disabled={!name.trim()}
            style={{ background: name.trim() ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${name.trim() ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius: 8, cursor: name.trim() ? "pointer" : "default", padding: "8px 18px", fontSize: 12, fontWeight: 600, color: name.trim() ? "#22c55e" : "rgba(255,255,255,0.3)", transition: "all 0.15s" }}
            onMouseEnter={e => { if (name.trim()) (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,197,94,0.25)"; }}
            onMouseLeave={e => { if (name.trim()) (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,197,94,0.15)"; }}>
            Add Indicator
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
});

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { anchorEl: HTMLElement | null; onClose: () => void; }

const IndicatorsPanel = memo(function IndicatorsPanel({ anchorEl, onClose }: Props) {
  const { appliedIndicators, addIndicator, removeIndicator } = useIndicatorStore();
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const computePos = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const PANEL_W = 260;
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - PANEL_W - 8));
    setPos({ top: rect.bottom + 6, left });
  }, [anchorEl]);

  useEffect(() => {
    computePos();
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [computePos]);

  useEffect(() => {
    window.addEventListener("scroll", computePos, { passive: true, capture: true });
    window.addEventListener("resize", computePos, { passive: true });
    return () => { window.removeEventListener("scroll", computePos, { capture: true }); window.removeEventListener("resize", computePos); };
  }, [computePos]);

  useEffect(() => {
    const h = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (anchorEl?.contains(e.target as Node)) return;
      if (showCustomModal) return;
      onClose();
    };
    const id = setTimeout(() => document.addEventListener("pointerdown", h, { capture: true }), 120);
    return () => { clearTimeout(id); document.removeEventListener("pointerdown", h, { capture: true }); };
  }, [onClose, anchorEl, showCustomModal]);

  const handleDelete = (id: string) => {
    setDeletingIds(prev => new Set(prev).add(id));
    setTimeout(() => { removeIndicator(id); setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n; }); }, 260);
  };

  const handleAddCustom = (name: string, pineCode: string) => {
    addIndicator("CUSTOM", name, { label: name, color: "#22c55e", settings: {}, pineCode });
  };

  // EMA helpers
  const getAppliedEma = (period: number) => appliedIndicators.find(i => i.type === "EMA" && Number(i.settings.period) === period);
  // SMA helpers
  const getAppliedSma = (period: number) => appliedIndicators.find(i => i.type === "SMA" && Number(i.settings.period) === period);
  // Other built-ins
  const getAppliedOther = (type: IndicatorType) => appliedIndicators.find(i => i.type === type);
  // WaveTrend (stored as CUSTOM)
  const appliedWT = appliedIndicators.find(i => i.type === "CUSTOM" && (i.label === "WaveTrend" || (i.pineCode as string | undefined)?.includes("WaveTrend")));
  // Custom (excluding WaveTrend built-in)
  const customInds = appliedIndicators.filter(i => i.type === "CUSTOM" && i.id !== appliedWT?.id);

  if (!pos) return null;

  return (
    <>
      {createPortal(
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          style={{
            position: "fixed", top: pos.top, left: pos.left, width: 260,
            background: "#131722", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
            overflow: "hidden", zIndex: 999999, pointerEvents: "auto",
            maxHeight: "80vh", overflowY: "auto",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, background: "#131722", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingUp style={{ width: 13, height: 13, color: "#2962FF" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#d1d4dc" }}>Indicators</span>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 6, display: "flex", touchAction: "manipulation" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              <X style={{ width: 12, height: 12, color: "rgba(255,255,255,0.4)" }} />
            </button>
          </div>

          {/* EMA section */}
          <SectionLabel>Moving Averages (EMA)</SectionLabel>
          <div style={{ padding: "4px 0 4px" }}>
            <AnimatedList>
              {EMA_PRESETS.map(({ period, color }) => {
                const ind = getAppliedEma(period);
                const isDeleting = ind ? deletingIds.has(ind.id) : false;
                return (
                  <AnimatedListItem key={period}>
                    <PresetRow
                      color={color} label={`EMA ${period}`}
                      applied={!!ind} isDeleting={isDeleting}
                      onAdd={() => { addIndicator("EMA", "EMA", { color, settings: { period, source: "close", offset: 0 }, label: `EMA (${period})` }); onClose(); }}
                      onDelete={ind ? () => handleDelete(ind.id) : undefined}
                    />
                  </AnimatedListItem>
                );
              })}
            </AnimatedList>
          </div>

          {/* SMA section */}
          <SectionLabel>Moving Averages (SMA)</SectionLabel>
          <div style={{ padding: "4px 0 4px" }}>
            <AnimatedList>
              {SMA_PRESETS.map(({ period, color }) => {
                const ind = getAppliedSma(period);
                const isDeleting = ind ? deletingIds.has(ind.id) : false;
                return (
                  <AnimatedListItem key={period}>
                    <PresetRow
                      color={color} label={`SMA ${period}`}
                      applied={!!ind} isDeleting={isDeleting}
                      onAdd={() => { addIndicator("SMA", "SMA", { color, settings: { period, source: "close", offset: 0 }, label: `SMA (${period})` }); onClose(); }}
                      onDelete={ind ? () => handleDelete(ind.id) : undefined}
                    />
                  </AnimatedListItem>
                );
              })}
            </AnimatedList>
          </div>

          {/* Other built-ins */}
          <SectionLabel>Oscillators & Overlays</SectionLabel>
          <div style={{ padding: "4px 0 4px" }}>
            <AnimatedList>
              {OTHER_PRESETS.map(({ type, label, color, settings }) => {
                const ind = getAppliedOther(type);
                const isDeleting = ind ? deletingIds.has(ind.id) : false;
                return (
                  <AnimatedListItem key={type}>
                    <PresetRow
                      color={color} label={label}
                      applied={!!ind} isDeleting={isDeleting}
                      onAdd={() => { addIndicator(type, label, { color, settings, label }); onClose(); }}
                      onDelete={ind ? () => handleDelete(ind.id) : undefined}
                    />
                  </AnimatedListItem>
                );
              })}
              {/* WaveTrend built-in */}
              {(() => {
                const isDeleting = appliedWT ? deletingIds.has(appliedWT.id) : false;
                return (
                  <AnimatedListItem key="WaveTrend">
                    <PresetRow
                      color="#22c55e" label="WaveTrend"
                      applied={!!appliedWT} isDeleting={isDeleting}
                      paneBadge
                      onAdd={() => {
                        addIndicator("CUSTOM", "WaveTrend", { label: "WaveTrend", color: "#22c55e", settings: {}, pineCode: WAVETREND_CODE });
                        onClose();
                      }}
                      onDelete={appliedWT ? () => handleDelete(appliedWT.id) : undefined}
                    />
                  </AnimatedListItem>
                );
              })()}
            </AnimatedList>
          </div>

          {/* Custom indicators */}
          {customInds.length > 0 && (
            <>
              <SectionLabel>Custom</SectionLabel>
              <div style={{ padding: "4px 0 4px" }}>
                <AnimatedList>
                  {customInds.map(ind => {
                    const isDeleting = deletingIds.has(ind.id);
                    return (
                      <AnimatedListItem key={ind.id}>
                        <PresetRow
                          color={ind.color} label={ind.label}
                          applied isDeleting={isDeleting}
                          customBadge onDelete={() => handleDelete(ind.id)}
                        />
                      </AnimatedListItem>
                    );
                  })}
                </AnimatedList>
              </div>
            </>
          )}

          {/* Add custom button */}
          <div style={{ padding: "8px 10px 10px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <button onClick={() => setShowCustomModal(true)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, cursor: "pointer", transition: "background 0.15s, box-shadow 0.15s, border-color 0.15s", touchAction: "manipulation" }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(34,197,94,0.14)"; b.style.boxShadow = "0 0 12px rgba(34,197,94,0.2)"; b.style.borderColor = "rgba(34,197,94,0.55)"; }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(34,197,94,0.07)"; b.style.boxShadow = "none"; b.style.borderColor = "rgba(34,197,94,0.3)"; }}>
              <Plus style={{ width: 12, height: 12, color: "#22c55e" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#22c55e" }}>Add Custom Indicator</span>
            </button>
          </div>
        </motion.div>,
        document.body
      )}

      {showCustomModal && (
        <CustomIndicatorModal
          onClose={() => setShowCustomModal(false)}
          onAdd={handleAddCustom}
        />
      )}
    </>
  );
});

// ── Helper sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 14px 2px", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(167,184,169,0.38)", textTransform: "uppercase", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      {children}
    </div>
  );
}

function PresetRow({ color, label, applied, isDeleting, onAdd, onDelete, customBadge, paneBadge }: {
  color: string; label: string; applied: boolean; isDeleting: boolean;
  onAdd?: () => void; onDelete?: () => void; customBadge?: boolean; paneBadge?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", opacity: isDeleting ? 0 : 1, transform: isDeleting ? "translateX(-16px)" : "none", transition: "opacity 0.25s ease, transform 0.25s ease" }}>
      <button onClick={() => !applied && onAdd?.()} style={{
        flex: 1, display: "flex", alignItems: "center", gap: 10,
        padding: "7px 14px", background: "none", border: "none",
        cursor: applied ? "default" : "pointer", textAlign: "left",
        opacity: applied ? 0.55 : 1, transition: "background 0.1s", touchAction: "manipulation",
      }}
        onMouseEnter={e => { if (!applied) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#d1d4dc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {applied && !customBadge && !paneBadge && <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>active</span>}
        {customBadge && <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(34,197,94,0.6)" }}>custom</span>}
        {paneBadge && !applied && <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(56,189,248,0.65)", background: "rgba(56,189,248,0.08)", padding: "1px 5px", borderRadius: 4 }}>pane</span>}
        {paneBadge && applied && <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>active</span>}
      </button>
      {applied && onDelete && (
        <button onClick={onDelete} title="Remove"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 12px 6px 4px", display: "flex", alignItems: "center", touchAction: "manipulation", flexShrink: 0, color: "rgba(255,255,255,0.25)" }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#f87171"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.25)"}>
          <Trash2 style={{ width: 12, height: 12, color: "inherit", transition: "color 0.15s" }} />
        </button>
      )}
    </div>
  );
}

export default IndicatorsPanel;
