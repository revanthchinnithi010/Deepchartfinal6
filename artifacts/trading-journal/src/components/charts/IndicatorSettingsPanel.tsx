import { useEffect, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useIndicatorStore, type AppliedIndicator } from "@/store/indicatorStore";

interface Props {
  indicator: AppliedIndicator;
  onClose: () => void;
}

type Tab = "Inputs" | "Style" | "Visibility";

const SOURCE_OPTIONS = [
  { value: "close", label: "Close" },
  { value: "open", label: "Open" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "hl2", label: "HL2" },
  { value: "hlc3", label: "HLC3" },
  { value: "ohlc4", label: "OHLC4" },
];

const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "1D", "1W"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 176px", alignItems: "center", gap: 18, minHeight: 64, padding: "0 36px", borderBottom: "1px solid rgba(255,255,255,0.055)" }}>
    <span style={{ fontSize: 16, color: "rgba(255,255,255,.72)" }}>{label}</span>
    <div style={{ display: "flex", justifyContent: "flex-end" }}>{children}</div>
  </div>;
}

function Input({ value, onChange, type = "number" }: { value: string | number; onChange: (v: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ width: 176, height: 50, boxSizing: "border-box", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "#000", color: "#eee", padding: "0 14px", fontSize: 16, outline: "none" }} />;
}

function Select({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return <div style={{ position: "relative", width: 176 }}>
    <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", height: 50, appearance: "none", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "#000", color: "#eee", padding: "0 38px 0 14px", fontSize: 16, outline: "none" }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown size={18} style={{ position: "absolute", right: 12, top: 16, pointerEvents: "none", color: "#999" }} />
  </div>;
}

function CheckBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <button onClick={() => onChange(!checked)} style={{ width: 32, height: 32, borderRadius: 5, border: "1px solid rgba(255,255,255,.35)", background: checked ? "#f2f2f2" : "transparent", color: "#111", display: "grid", placeItems: "center", padding: 0 }}>
    {checked && <Check size={23} strokeWidth={3} />}
  </button>;
}

function Segmented({ value, options, onChange }: { value: string | number; options: (string | number)[]; onChange: (v: string | number) => void }) {
  return <div style={{ display: "flex", border: "1px solid rgba(255,255,255,.25)", borderRadius: 9, overflow: "hidden" }}>
    {options.map((o, i) => <button key={String(o)} onClick={() => onChange(o)} style={{ width: 58, height: 48, border: 0, borderRight: i < options.length - 1 ? "1px solid rgba(255,255,255,.2)" : 0, background: Number(value) === Number(o) || value === o ? "#f1f1f1" : "#050505", color: Number(value) === Number(o) || value === o ? "#111" : "#ddd", fontSize: 15 }}>
      <span style={{ display: "block", height: Number(o), minHeight: 1, background: Number(value) === Number(o) || value === o ? "#111" : "#ddd", width: 34, margin: "auto" }} />
    </button>)}
  </div>;
}

function IndicatorSettingsPanel({ indicator, onClose }: Props) {
  const { updateIndicator } = useIndicatorStore();
  const [tab, setTab] = useState<Tab>("Inputs");
  const [draft, setDraft] = useState(indicator);

  useEffect(() => setDraft(indicator), [indicator]);

  const updateSetting = (key: string, value: unknown) => {
    const settings = { ...draft.settings, [key]: value };
    const next = { ...draft, settings };
    if (key === "period") {
      const base = indicator.label.replace(/\s*\(\d+\)\s*$/, "");
      next.label = `${base} (${Number(value) || 1})`;
    }
    setDraft(next);
    updateIndicator(indicator.id, { settings, label: next.label });
  };

  const updateStyle = (changes: Partial<AppliedIndicator>) => {
    setDraft(d => ({ ...d, ...changes }));
    updateIndicator(indicator.id, changes);
  };

  const inputContent = indicator.type === "VWAP" || indicator.type === "CUSTOM" ? (
    <div style={{ padding: "0 36px", color: "rgba(255,255,255,.5)", fontSize: 16 }}>No configurable inputs for this indicator.</div>
  ) : indicator.type === "SUPERTREND" ? (
    <>
      <Field label="Length"><Input value={Number(draft.settings.period) || 10} onChange={v => updateSetting("period", Math.max(1, Number(v) || 1))} /></Field>
      <Field label="Multiplier"><Input value={Number(draft.settings.multiplier) || 3} onChange={v => updateSetting("multiplier", Math.max(.1, Number(v) || .1))} /></Field>
    </>
  ) : (
    <>
      <Field label="Length"><Input value={Number(draft.settings.period) || (indicator.type === "SMA" ? 20 : 14)} onChange={v => updateSetting("period", Math.max(1, Math.floor(Number(v) || 1)))} /></Field>
      <Field label="Source"><Select value={String(draft.settings.source ?? "close")} options={SOURCE_OPTIONS} onChange={v => updateSetting("source", v)} /></Field>
      <Field label="Offset"><Input value={Number(draft.settings.offset) || 0} onChange={v => updateSetting("offset", Math.floor(Number(v) || 0))} /></Field>
      {indicator.type === "EMA" && <Field label="Wait for timeframe closes"><CheckBox checked={Boolean(draft.settings.waitForClose ?? true)} onChange={v => updateSetting("waitForClose", v)} /></Field>}
    </>
  );

  const styleContent = (
    <>
      <Field label={indicator.type === "EMA" || indicator.type === "SMA" ? indicator.label : indicator.type}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input type="color" value={draft.color} onChange={e => updateStyle({ color: e.target.value })} style={{ width: 52, height: 48, padding: 0, border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, background: "#000" }} />
          <span style={{ width: 46, height: 2, background: draft.color, display: "block" }} />
        </div>
      </Field>
      <Field label="Opacity"><input type="range" min="0" max="100" value={Math.round(draft.opacity * 100)} onChange={e => updateStyle({ opacity: Number(e.target.value) / 100 })} style={{ width: 176 }} /></Field>
      <Field label="Thickness"><Segmented value={draft.lineWidth} options={[1, 2, 3, 4]} onChange={v => updateStyle({ lineWidth: Number(v) })} /></Field>
      <Field label="Line style"><div style={{ display: "flex", border: "1px solid rgba(255,255,255,.25)", borderRadius: 9, overflow: "hidden" }}>{(["solid", "dashed", "dotted"] as const).map((s, i) => <button key={s} onClick={() => updateStyle({ lineStyle: s })} style={{ width: 58, height: 48, border: 0, borderRight: i < 2 ? "1px solid rgba(255,255,255,.2)" : 0, background: draft.lineStyle === s ? "#f1f1f1" : "#050505" }}><span style={{ display: "block", width: 34, margin: "auto", borderTop: `${Math.max(1, draft.lineWidth)}px ${s} ${draft.lineStyle === s ? "#111" : "#ddd"}` }} /></button>)}</div></Field>
      <Field label="Labels on price scale"><CheckBox checked={Boolean(draft.settings.labelsOnPriceScale ?? true)} onChange={v => updateSetting("labelsOnPriceScale", v)} /></Field>
      <Field label="Values in status line"><CheckBox checked={Boolean(draft.settings.valuesInStatusLine ?? true)} onChange={v => updateSetting("valuesInStatusLine", v)} /></Field>
    </>
  );

  const visibilityContent = (
    <>
      <div style={{ padding: "18px 36px 8px", fontSize: 12, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em" }}>Show indicator on these timeframes</div>
      {TIMEFRAMES.map(tf => <Field key={tf} label={tf}><CheckBox checked={draft.visibleTimeframes.length === 0 || draft.visibleTimeframes.includes(tf)} onChange={checked => {
        const all = draft.visibleTimeframes.length === 0 ? [...TIMEFRAMES] : [...draft.visibleTimeframes];
        const next = checked ? Array.from(new Set([...all, tf])) : all.filter(x => x !== tf);
        const final = next.length === TIMEFRAMES.length ? [] : next;
        setDraft(d => ({ ...d, visibleTimeframes: final }));
        updateIndicator(indicator.id, { visibleTimeframes: final });
      }} /></Field>)}
    </>
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10000000, background: "#000", color: "#eee", display: "flex", flexDirection: "column", fontFamily: "Inter, system-ui, sans-serif", paddingTop: "env(safe-area-inset-top)" }}>
      <header style={{ height: 78, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 36px", flexShrink: 0 }}>
        <span style={{ fontSize: 34, fontWeight: 400 }}>{indicator.type === "CUSTOM" ? indicator.label : indicator.type}</span>
        <button onClick={onClose} style={{ border: 0, background: "none", color: "#aaa", padding: 8 }}><X size={34} strokeWidth={1.3} /></button>
      </header>
      <nav style={{ display: "flex", gap: 44, padding: "0 36px", borderBottom: "1px solid rgba(255,255,255,.15)", flexShrink: 0 }}>
        {(["Inputs", "Style", "Visibility"] as Tab[]).map(t => <button key={t} onClick={() => setTab(t)} style={{ position: "relative", height: 66, border: 0, background: "none", color: tab === t ? "#eee" : "#999", fontSize: 19, padding: 0 }}>{t}{tab === t && <span style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 4, borderRadius: 4, background: "#eee" }} />}</button>)}
      </nav>
      <main style={{ flex: 1, overflowY: "auto", paddingTop: 20 }}>
        {tab === "Inputs" ? inputContent : tab === "Style" ? styleContent : visibilityContent}
      </main>
      <footer style={{ minHeight: 88, borderTop: "1px solid rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 20, padding: "12px 36px calc(12px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
        <button onClick={onClose} style={{ height: 58, minWidth: 128, borderRadius: 10, border: "1px solid rgba(255,255,255,.6)", background: "transparent", color: "#eee", fontSize: 18 }}>Cancel</button>
        <button onClick={onClose} style={{ height: 58, minWidth: 128, borderRadius: 10, border: 0, background: "#f1f1f1", color: "#111", fontSize: 18 }}>Ok</button>
      </footer>
    </div>,
    document.body,
  );
}

export default IndicatorSettingsPanel;
