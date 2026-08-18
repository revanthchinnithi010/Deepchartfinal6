import { memo, useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { X, TrendingUp, Trash2, Plus, Activity, ChevronLeft } from "lucide-react";
import { useIndicatorStore, type IndicatorType } from "@/store/indicatorStore";
import { motion } from "motion/react";
import { AnimatedModal, AnimatedList, AnimatedListItem } from "@/components/animations";

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

const EMA_PRESETS = [
  { period: 9, color: "#f59e0b" }, { period: 21, color: "#38bdf8" },
  { period: 50, color: "#a78bfa" }, { period: 100, color: "#fb923c" },
  { period: 200, color: "#f87171" },
];
const SMA_PRESETS = [
  { period: 20, color: "#60a5fa" }, { period: 50, color: "#818cf8" }, { period: 200, color: "#c084fc" },
];
const OTHER_PRESETS: { type: IndicatorType; label: string; color: string; settings: Record<string, unknown> }[] = [
  { type: "RSI", label: "RSI (14)", color: "#c084fc", settings: { period: 14 } },
  { type: "VWAP", label: "VWAP", color: "#60a5fa", settings: {} },
  { type: "SUPERTREND", label: "Supertrend", color: "#22c55e", settings: { period: 10, multiplier: 3 } },
];

interface CustomModalProps { onClose: () => void; onAdd: (name: string, pineCode: string) => void; }
const CustomIndicatorModal = memo(function CustomIndicatorModal({ onClose, onAdd }: CustomModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const handleAdd = () => { if (!name.trim()) return; onAdd(name.trim(), code.trim()); onClose(); };
  return (
    <AnimatedModal isOpen={true} onClose={onClose} title="Add Custom Indicator" mode="dialog">
      <div style={{ padding: 18 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Indicator name</label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. My EMA, BOS, FVG"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={fieldLabel}>Pine Script</label>
          <div style={{ marginBottom: 7, fontSize: 10, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>
            Supports EMA, SMA, RSI, VWAP, BOS/CHoCH, FVG, Order Blocks and Liquidity.
          </div>
          <textarea
            value={code} onChange={e => setCode(e.target.value)}
            placeholder={`indicator("My Strategy")\n\nplot(ta.ema(close, 200))`}
            rows={8} style={textareaStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={secondaryButton}>Cancel</button>
          <button onClick={handleAdd} disabled={!name.trim()} style={{ ...primaryButton, opacity: name.trim() ? 1 : 0.4 }}>
            Add indicator
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
});

const fieldLabel: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.58)",
  marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em",
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "#0a0b0e", border: "1px solid rgba(255,255,255,0.11)",
  borderRadius: 9, padding: "10px 12px", fontSize: 12, color: "#f4f5f7", outline: "none", fontFamily: "inherit",
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: "vertical", fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace", lineHeight: 1.6, minHeight: 140,
};
const secondaryButton: React.CSSProperties = {
  background: "#111318", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9, cursor: "pointer", padding: "9px 15px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.62)",
};
const primaryButton: React.CSSProperties = {
  background: "#b7ff5a", border: "1px solid rgba(183,255,90,0.45)", borderRadius: 9, cursor: "pointer", padding: "9px 16px", fontSize: 11, fontWeight: 800, color: "#07110d",
};

interface Props { anchorEl: HTMLElement | null; onClose: () => void; }
const IndicatorsPanel = memo(function IndicatorsPanel({ anchorEl, onClose }: Props) {
  const { appliedIndicators, addIndicator, removeIndicator } = useIndicatorStore();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const fullscreen = !anchorEl;

  const computePos = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const panelW = 286;
    const left = Math.max(6, Math.min(rect.left, window.innerWidth - panelW - 8));
    setPos({ top: rect.bottom + 7, left });
  }, [anchorEl]);

  useEffect(() => { computePos(); }, [computePos]);
  useEffect(() => {
    if (!anchorEl) return;
    window.addEventListener("scroll", computePos, { passive: true, capture: true });
    window.addEventListener("resize", computePos, { passive: true });
    return () => {
      window.removeEventListener("scroll", computePos, { capture: true });
      window.removeEventListener("resize", computePos);
    };
  }, [computePos, anchorEl]);
  useEffect(() => {
    if (!anchorEl) return;
    const h = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (anchorEl.contains(e.target as Node)) return;
      if (showCustomModal) return;
      onClose();
    };
    const id = setTimeout(() => document.addEventListener("pointerdown", h, { capture: true }), 120);
    return () => { clearTimeout(id); document.removeEventListener("pointerdown", h, { capture: true }); };
  }, [onClose, anchorEl, showCustomModal]);

  const handleDelete = (id: string) => {
    setDeletingIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      removeIndicator(id);
      setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 220);
  };
  const handleAddCustom = (name: string, pineCode: string) => {
    addIndicator("CUSTOM", name, { label: name, color: "#b7ff5a", settings: {}, pineCode });
  };
  const getAppliedEma = (period: number) => appliedIndicators.find(i => i.type === "EMA" && Number(i.settings.period) === period);
  const getAppliedSma = (period: number) => appliedIndicators.find(i => i.type === "SMA" && Number(i.settings.period) === period);
  const getAppliedOther = (type: IndicatorType) => appliedIndicators.find(i => i.type === type);
  const appliedWT = appliedIndicators.find(i => i.type === "CUSTOM" && (i.label === "WaveTrend" || (i.pineCode as string | undefined)?.includes("WaveTrend")));
  const customInds = appliedIndicators.filter(i => i.type === "CUSTOM" && i.id !== appliedWT?.id);

  if (!fullscreen && !pos) return null;

  return (
    <>
      {createPortal(
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: fullscreen ? "100%" : -6, scale: fullscreen ? 1 : 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: fullscreen ? "100%" : -6, scale: fullscreen ? 1 : 0.985 }}
          transition={{ duration: fullscreen ? 0.25 : 0.14, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "fixed",
            ...(fullscreen
              ? { inset: 0, width: "100vw", height: "100dvh", borderRadius: 0 }
              : { top: pos!.top, left: pos!.left, width: 286, borderRadius: 14 }),
            background: "#050608",
            color: "#f4f5f7",
            border: fullscreen ? "none" : "1px solid rgba(255,255,255,0.09)",
            boxShadow: fullscreen ? "none" : "0 18px 50px rgba(0,0,0,0.62)",
            overflow: "hidden", zIndex: 999999, pointerEvents: "auto",
            maxHeight: fullscreen ? "100dvh" : "80vh", overflowY: "auto",
            fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: fullscreen ? "0 16px" : "12px 13px", height: fullscreen ? 60 : 48,
            boxSizing: "border-box", borderBottom: "1px solid rgba(255,255,255,0.075)",
            position: "sticky", top: 0, background: "#050608", zIndex: 2, flexShrink: 0,
          }}>
            <button onClick={onClose} style={{
              display: "flex", alignItems: "center", gap: fullscreen ? 5 : 6, padding: fullscreen ? "8px 4px" : "5px 7px",
              borderRadius: 8, background: "transparent", border: "none", color: "#8fb7ff", cursor: "pointer",
              fontSize: fullscreen ? 13 : 11, fontWeight: 700, touchAction: "manipulation",
            }}>
              {fullscreen ? <ChevronLeft style={{ width: 17, height: 17 }} /> : <TrendingUp style={{ width: 13, height: 13, color: "#8fb7ff" }} />}
              <span>{fullscreen ? "Back" : "Indicators"}</span>
            </button>
            {fullscreen && <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 16, fontWeight: 750, letterSpacing: "-0.02em", color: "#f4f5f7", pointerEvents: "none" }}>Indicators</div>}
            {!fullscreen && <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 5, display: "flex" }}><X style={{ width: 14, height: 14, color: "rgba(255,255,255,0.42)" }} /></button>}
            {fullscreen && <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 9, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)", color: "#e8eaed", fontSize: 11, fontWeight: 750, cursor: "pointer", touchAction: "manipulation" }}>Done</button>}
          </div>

          {fullscreen && <div style={{ height: 8 }} />}
          <SectionLabel>Moving averages</SectionLabel>
          <div style={{ padding: "4px 0 8px" }}>
            <AnimatedList>{EMA_PRESETS.map(({ period, color }) => {
              const ind = getAppliedEma(period); const deleting = ind ? deletingIds.has(ind.id) : false;
              return <AnimatedListItem key={period}><PresetRow color={color} label={`EMA ${period}`} applied={!!ind} isDeleting={deleting} onAdd={() => { addIndicator("EMA", "EMA", { color, settings: { period, source: "close", offset: 0 }, label: `EMA (${period})` }); onClose(); }} onDelete={ind ? () => handleDelete(ind.id) : undefined} /></AnimatedListItem>;
            })}</AnimatedList>
          </div>

          <SectionLabel>Simple moving averages</SectionLabel>
          <div style={{ padding: "4px 0 8px" }}>
            <AnimatedList>{SMA_PRESETS.map(({ period, color }) => {
              const ind = getAppliedSma(period); const deleting = ind ? deletingIds.has(ind.id) : false;
              return <AnimatedListItem key={period}><PresetRow color={color} label={`SMA ${period}`} applied={!!ind} isDeleting={deleting} onAdd={() => { addIndicator("SMA", "SMA", { color, settings: { period, source: "close", offset: 0 }, label: `SMA (${period})` }); onClose(); }} onDelete={ind ? () => handleDelete(ind.id) : undefined} /></AnimatedListItem>;
            })}</AnimatedList>
          </div>

          <SectionLabel>Oscillators & overlays</SectionLabel>
          <div style={{ padding: "4px 0 8px" }}>
            <AnimatedList>
              {OTHER_PRESETS.map(({ type, label, color, settings }) => {
                const ind = getAppliedOther(type); const deleting = ind ? deletingIds.has(ind.id) : false;
                return <AnimatedListItem key={type}><PresetRow color={color} label={label} applied={!!ind} isDeleting={deleting} onAdd={() => { addIndicator(type, label, { color, settings, label }); onClose(); }} onDelete={ind ? () => handleDelete(ind.id) : undefined} /></AnimatedListItem>;
              })}
              {(() => {
                const deleting = appliedWT ? deletingIds.has(appliedWT.id) : false;
                return <AnimatedListItem key="WaveTrend"><PresetRow color="#22c55e" label="WaveTrend" applied={!!appliedWT} isDeleting={deleting} paneBadge onAdd={() => { addIndicator("CUSTOM", "WaveTrend", { label: "WaveTrend", color: "#22c55e", settings: {}, pineCode: WAVETREND_CODE }); onClose(); }} onDelete={appliedWT ? () => handleDelete(appliedWT.id) : undefined} /></AnimatedListItem>;
              })()}
            </AnimatedList>
          </div>

          {customInds.length > 0 && <>
            <SectionLabel>Custom indicators</SectionLabel>
            <div style={{ padding: "4px 0 8px" }}><AnimatedList>{customInds.map(ind => <AnimatedListItem key={ind.id}><PresetRow color={ind.color} label={ind.label} applied isDeleting={deletingIds.has(ind.id)} customBadge onDelete={() => handleDelete(ind.id)} /></AnimatedListItem>)}</AnimatedList></div>
          </>}

          <div style={{ padding: fullscreen ? "14px 16px 26px" : "9px 10px 11px", borderTop: "1px solid rgba(255,255,255,0.065)" }}>
            <button onClick={() => setShowCustomModal(true)} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: fullscreen ? "11px 14px" : "9px 12px", background: "#0a0c0f",
              border: "1px solid rgba(183,255,90,0.30)", borderRadius: 10, cursor: "pointer", touchAction: "manipulation",
            }}>
              <Plus style={{ width: 13, height: 13, color: "#b7ff5a" }} />
              <span style={{ fontSize: 11, fontWeight: 750, color: "#b7ff5a", letterSpacing: "-0.01em" }}>Add custom indicator</span>
            </button>
          </div>
        </motion.div>, document.body
      )}
      {showCustomModal && <CustomIndicatorModal onClose={() => setShowCustomModal(false)} onAdd={handleAddCustom} />}
    </>
  );
});

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{
    padding: "12px 14px 6px", fontSize: 9, fontWeight: 750, letterSpacing: "0.12em",
    color: "rgba(255,255,255,0.38)", textTransform: "uppercase", borderTop: "1px solid rgba(255,255,255,0.045)",
  }}>{children}</div>;
}

function PresetRow({ color, label, applied, isDeleting, onAdd, onDelete, customBadge, paneBadge }: {
  color: string; label: string; applied: boolean; isDeleting: boolean; onAdd?: () => void; onDelete?: () => void; customBadge?: boolean; paneBadge?: boolean;
}) {
  return <div style={{ display: "flex", alignItems: "center", opacity: isDeleting ? 0 : 1, transform: isDeleting ? "translateX(-12px)" : "none", transition: "opacity .22s ease, transform .22s ease" }}>
    <button
      onClick={() => !applied && onAdd?.()}
      style={{
        flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11, padding: "9px 14px",
        background: applied ? "rgba(255,255,255,0.018)" : "transparent", border: "none", cursor: applied ? "default" : "pointer",
        textAlign: "left", borderRadius: 8, opacity: applied ? 0.58 : 1, transition: "background .12s, opacity .12s", touchAction: "manipulation",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}35` }} />
      <span style={{ fontSize: 13, fontWeight: 650, color: "#e7e9ed", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{label}</span>
      {applied && !customBadge && !paneBadge && <span style={statusStyle}>Active</span>}
      {customBadge && <span style={{ ...statusStyle, color: "rgba(183,255,90,0.72)" }}>Custom</span>}
      {paneBadge && !applied && <span style={{ ...statusStyle, color: "rgba(103,202,255,0.72)", background: "rgba(56,189,248,0.08)" }}>Pane</span>}
      {paneBadge && applied && <span style={statusStyle}>Active</span>}
    </button>
    {applied && onDelete && <button onClick={onDelete} title="Remove indicator" aria-label={`Remove ${label}`} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "7px 12px 7px 4px", display: "flex", alignItems: "center", color: "rgba(255,255,255,0.28)", flexShrink: 0 }}><Trash2 style={{ width: 13, height: 13 }} /></button>}
  </div>;
}

const statusStyle: React.CSSProperties = {
  marginLeft: "auto", fontSize: 9, fontWeight: 650, color: "rgba(255,255,255,0.34)",
  background: "rgba(255,255,255,0.045)", padding: "3px 6px", borderRadius: 5, letterSpacing: "0.02em",
};

// ── Direct mobile launcher ───────────────────────────────────────────────────
const launcherRoots = new WeakMap<HTMLElement, Root>();

function MobileIndicatorsLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button aria-label="Indicators" title="Indicators" onClick={() => setOpen(true)}
        style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid transparent", color: "rgba(255,255,255,0.82)", cursor: "pointer", touchAction: "manipulation", transition: "background .15s, transform .2s" }}
        onPointerDown={e => { e.currentTarget.style.transform = "scale(.84)"; }}
        onPointerUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
        onPointerCancel={e => { e.currentTarget.style.transform = "scale(1)"; }}>
        <Activity style={{ width: 17, height: 17 }} />
      </button>
      {open && <IndicatorsPanel anchorEl={null} onClose={() => setOpen(false)} />}
    </>
  );
}

function mountLauncher(bar: HTMLElement) {
  if (bar.dataset.indicatorsLauncherMounted === "1") return;
  const buttons = Array.from(bar.querySelectorAll("button"));
  const brokerButton = buttons[4];
  if (!brokerButton) return;
  const host = document.createElement("span");
  host.dataset.indicatorsLauncherHost = "1";
  host.style.cssText = "display:flex;align-items:center;justify-content:center;flex-shrink:0";
  bar.insertBefore(host, brokerButton);
  bar.dataset.indicatorsLauncherMounted = "1";
  const root = createRoot(host);
  launcherRoots.set(host, root);
  root.render(<MobileIndicatorsLauncher />);
}

if (typeof document !== "undefined") {
  const boot = () => document.querySelectorAll<HTMLElement>(".tj-ctrl-bar-inner").forEach(mountLauncher);
  const observer = new MutationObserver(boot);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  requestAnimationFrame(boot);
}

export default IndicatorsPanel;
