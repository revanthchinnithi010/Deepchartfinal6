import {
  memo, useRef, useEffect, useLayoutEffect, useState, useCallback,
} from "react";
import { X, ChevronDown } from "lucide-react";
import icoSettingsUrl from "@assets/setting1_1780282162661.svg";
import { ColorPickerGlass } from "@/components/ColorPickerGlass";
import { AnimatedModal, AnimatedList, AnimatedListItem } from "@/components/animations";

import type { ChartSettings } from "@/components/charts/chartSettingsTypes";
import { DEFAULT_CHART_SETTINGS } from "@/components/charts/chartSettingsTypes";

// ── Design tokens — match the app's dark glassmorphism system ─────────────────
const T = {
  accent:        "#60A5FA",
  accentBg:      "rgba(96,165,250,0.10)",
  accentBorder:  "rgba(96,165,250,0.28)",
  accentGlow:    "rgba(96,165,250,0.20)",
  modalBg:       "rgba(10,10,15,0.99)",
  sectionBg:     "rgba(255,255,255,0.04)",
  sectionBorder: "rgba(255,255,255,0.08)",
  rowDivider:    "rgba(255,255,255,0.06)",
  rowHover:      "rgba(255,255,255,0.04)",
  btnBg:         "rgba(255,255,255,0.06)",
  btnBorder:     "rgba(255,255,255,0.10)",
  textHi:        "rgba(255,255,255,0.92)",
  textMed:       "rgba(255,255,255,0.65)",
  textDim:       "rgba(255,255,255,0.40)",
  textXDim:      "rgba(255,255,255,0.25)",
  divider:       "rgba(255,255,255,0.08)",
} as const;

function safeColor(v: unknown, fallback = "#000000"): string {
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

// ── One-at-a-time color picker registry ───────────────────────────────────────
const _colorBoxClosers = new Map<symbol, () => void>();

function _registerColorBoxCloser(id: symbol, fn: () => void) {
  _colorBoxClosers.set(id, fn);
  return () => { _colorBoxClosers.delete(id); };
}

function _closeAllColorBoxes(exceptId?: symbol) {
  _colorBoxClosers.forEach((fn, id) => { if (id !== exceptId) fn(); });
}

// ── Color box trigger ─────────────────────────────────────────────────────────
export interface ColorBoxProps {
  value:      string;
  onChange:   (v: string) => void;
  label?:     string;
  fallback?:  string;
  autoOpen?:  boolean;    // start with picker visible (for ColorSwatch lazy pattern)
  onDismiss?: () => void; // called when picker closes — parent unmounts us
}

export const ColorBox = memo(function ColorBox({ value, onChange, label, fallback = "#000000", autoOpen, onDismiss }: ColorBoxProps) {
  const safe   = safeColor(value, fallback);
  const [open, setOpen]     = useState(autoOpen ?? false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const idRef  = useRef<symbol>(Symbol());

  // When mounted via ColorSwatch (autoOpen=true), capture the button rect on
  // the first layout pass so the picker appears immediately without a flash.
  // useLayoutEffect fires before paint, so this is a synchronous flush.
  useLayoutEffect(() => {
    if (autoOpen && btnRef.current) {
      setAnchor(btnRef.current.getBoundingClientRect());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return _registerColorBoxCloser(idRef.current, () => setOpen(false));
  }, []);

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect() ?? null;
    setAnchor(rect);
    _closeAllColorBoxes(idRef.current);
    setOpen(prev => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    onDismiss?.();
  }, [onDismiss]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        title={label ?? safe}
        style={{
          width: 32, height: 20, borderRadius: 5, cursor: "pointer",
          background: safe,
          border: open
            ? `2px solid ${T.accent}`
            : `1.5px solid ${T.btnBorder}`,
          boxShadow: open ? `0 0 0 3px ${T.accentBg}` : undefined,
          transition: "box-shadow 0.12s, border 0.12s",
          flexShrink: 0,
          padding: 0,
          outline: "none",
        }}
      />
      {open && anchor && (
        <ColorPickerGlass
          value={safe}
          onChange={onChange}
          onClose={handleClose}
          anchorRect={anchor}
        />
      )}
    </>
  );
});

// ── ColorSwatch: lightweight lazy wrapper ─────────────────────────────────────
// The hot-path replacement for ColorBox in all settings rows.
// On initial render: just a color swatch <button> + 3 hooks (vs ColorBox's 8).
// The full ColorBox (ColorPickerGlass, useRef×2, useCallback, useEffect) is
// created ONLY when the user taps the swatch — zero eager picker instances.
//
// One-at-a-time: registers in the same _colorBoxClosers registry so tapping a
// new swatch automatically collapses any other open picker.
const _ColorSwatchImpl = memo(function ColorSwatchImpl({ value, onChange, label, fallback = "#000000" }: ColorBoxProps) {
  const safe = safeColor(value, fallback);
  const [pickerOpen, setPickerOpen] = useState(false);
  const idRef = useRef<symbol>(Symbol());

  useEffect(() => {
    return _registerColorBoxCloser(idRef.current, () => setPickerOpen(false));
  }, []);

  return (
    <>
      <button
        onClick={e => {
          e.stopPropagation();
          _closeAllColorBoxes(idRef.current);
          setPickerOpen(true);
        }}
        title={label ?? safe}
        style={{
          width: 32, height: 20, borderRadius: 5, cursor: "pointer",
          background: safe,
          border: `1.5px solid ${T.btnBorder}`,
          flexShrink: 0, padding: 0, outline: "none",
        }}
      />
      {pickerOpen && (
        <ColorBox
          value={value}
          onChange={onChange}
          label={label}
          fallback={fallback}
          autoOpen
          onDismiss={() => setPickerOpen(false)}
        />
      )}
    </>
  );
});

export const ColorSwatch = (props: ColorBoxProps) => <_ColorSwatchImpl {...props} />;

// ── Section container ─────────────────────────────────────────────────────────
export const Section = memo(function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        margin: "0 0 7px",
        fontSize: 9, fontWeight: 700,
        color: T.textXDim,
        textTransform: "uppercase", letterSpacing: "0.12em",
      }}>
        {title}
      </p>
      <div style={{
        background: T.sectionBg,
        borderRadius: 10,
        border: `1px solid ${T.sectionBorder}`,
        overflow: "visible",
      }}>
        {children}
      </div>
    </div>
  );
});

// ── Setting row ───────────────────────────────────────────────────────────────
// Row: memo'd to avoid full re-renders when sibling rows change.
// Hover state removed — on touchscreen it causes pointless re-renders on every
// finger contact. Color highlight is irrelevant on mobile.
export const Row = memo(function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: last ? "none" : `1px solid ${T.rowDivider}`,
      }}>
      <span style={{ fontSize: 12, color: T.textMed, fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{children}</div>
    </div>
  );
});

// ── Color pair (bull + bear) ──────────────────────────────────────────────────
// ColorPair: memo'd with stable onBull/onBear from the h-handler object.
// When upColor changes, only the "Body" ColorPair re-renders; "Borders" bails out.
export const ColorPair = memo(function ColorPair({ label, bull, bear, onBull, onBear, last }: {
  label: string; bull: string; bear: string;
  onBull: (v: string) => void; onBear: (v: string) => void; last?: boolean;
}) {
  return (
    <Row label={label} last={last}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 9, color: T.textDim, fontWeight: 700 }}>▲</span>
        <ColorSwatch value={bull} onChange={onBull} label={`${label} Bullish`} />
      </div>
      <div style={{ width: 1, height: 14, background: T.divider, margin: "0 2px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 9, color: "rgba(239,68,68,0.55)", fontWeight: 700 }}>▼</span>
        <ColorSwatch value={bear} onChange={onBear} label={`${label} Bearish`} />
      </div>
    </Row>
  );
});

// ── Styled select ─────────────────────────────────────────────────────────────
// StyledSelect: memo'd. Requires stable `options` arrays (define at module scope,
// never inline in JSX) and stable `onChange` from the h-handler object.
const _StyledSelectImpl = memo(function StyledSelectImpl({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: "none", WebkitAppearance: "none",
          background: T.btnBg,
          border: `1px solid ${T.btnBorder}`,
          borderRadius: 7, color: T.textHi,
          fontSize: 11, fontWeight: 600,
          padding: "5px 28px 5px 10px",
          cursor: "pointer", outline: "none",
          transition: "border-color 0.12s",
        }}
        onFocus={e => { (e.currentTarget as HTMLSelectElement).style.borderColor = T.accentBorder; }}
        onBlur={e =>  { (e.currentTarget as HTMLSelectElement).style.borderColor = T.btnBorder; }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: "#0a0a0f" }}>{o.label}</option>
        ))}
      </select>
      <ChevronDown style={{
        position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
        width: 12, height: 12, color: T.textDim, pointerEvents: "none",
      }} />
    </div>
  );
});

export const StyledSelect = (props: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
  <_StyledSelectImpl {...props} />
);

// ── Toggle ────────────────────────────────────────────────────────────────────
// Toggle: memo'd with stable onChange from h-handler — only re-renders when
// its own `checked` value changes, not when other settings change.
export const Toggle = memo(function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: "pointer", border: "none",
        background: checked ? T.accentBg : T.btnBg,
        position: "relative", transition: "background 0.2s",
        outline: `1px solid ${checked ? T.accentBorder : T.btnBorder}`,
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: checked ? 18 : 3,
        width: 14, height: 14, borderRadius: "50%",
        background: checked ? T.accent : T.textDim,
        transition: "left 0.18s, background 0.18s",
        boxShadow: checked ? `0 0 6px ${T.accentGlow}` : "none",
      }} />
    </button>
  );
});

// ── Thickness buttons ─────────────────────────────────────────────────────────
// ThicknessButtons: memo'd with stable onChange — only re-renders when its own
// `value` changes.
export const ThicknessButtons = memo(function ThicknessButtons({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3].map(w => (
        <button key={w} onClick={() => onChange(w)}
          style={{
            width: 30, height: 28, borderRadius: 7, cursor: "pointer", border: "none",
            background: value === w ? T.accentBg : T.btnBg,
            outline: value === w
              ? `1.5px solid ${T.accentBorder}`
              : `1px solid ${T.btnBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.12s",
          }}>
          <div style={{
            width: "60%", height: w,
            background: value === w ? T.accent : T.textDim,
            borderRadius: 1,
          }} />
        </button>
      ))}
    </div>
  );
});

// ── Toggle Row ────────────────────────────────────────────────────────────────
// Convenience component: a Row that contains exactly one Toggle.
// Tracked separately so the profiler can distinguish toggle rows from other
// row content types. Using ToggleRow instead of <Row><Toggle/></Row> also lets
// memo bail out at the row level when checked/onChange don't change.
export const ToggleRow = memo(function ToggleRow({
  label, checked, onChange, last,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <Row label={label} last={last}>
      <Toggle checked={checked} onChange={onChange} />
    </Row>
  );
});

// ── Desktop sidebar nav item ──────────────────────────────────────────────────
export type SidebarSection = "Symbol" | "Canvas" | "Scale";

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "9px 14px",
        background: active ? T.accentBg : "transparent",
        border: "none",
        borderLeft: `2px solid ${active ? T.accent : "transparent"}`,
        cursor: "pointer", textAlign: "left",
        transition: "all 0.12s",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = T.rowHover; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <span style={{
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        color: active ? T.accent : T.textMed,
      }}>
        {label}
      </span>
    </button>
  );
}

// ── Save-as-default button ────────────────────────────────────────────────────
export function SaveAsDefaultButton({ settings, onSaveAsDefault }: {
  settings: ChartSettings;
  onSaveAsDefault: (s: ChartSettings) => void;
}) {
  const [saved, setSaved] = useState(false);
  const handleClick = () => {
    onSaveAsDefault(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  return (
    <button onClick={handleClick}
      style={{
        padding: "7px 16px", borderRadius: 9,
        background: saved ? T.accentBg : "transparent",
        border: `1px solid ${saved ? T.accentBorder : T.btnBorder}`,
        color: saved ? T.accent : T.textMed,
        fontSize: 11, fontWeight: 600, cursor: "pointer",
        transition: "all 0.18s", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!saved) { (e.currentTarget as HTMLButtonElement).style.borderColor = T.accentBorder; (e.currentTarget as HTMLButtonElement).style.color = T.textHi; } }}
      onMouseLeave={e => { if (!saved) { (e.currentTarget as HTMLButtonElement).style.borderColor = T.btnBorder; (e.currentTarget as HTMLButtonElement).style.color = T.textMed; } }}
    >
      {saved ? "✓ Saved as Default" : "Save as Default"}
    </button>
  );
}

// ── Desktop modal ─────────────────────────────────────────────────────────────
interface Props {
  settings: ChartSettings;
  onChange: (s: ChartSettings) => void;
  onSaveAsDefault?: (s: ChartSettings) => void;
  onClose:  () => void;
}

const SettingsPanel = memo(function SettingsPanel({ settings, onChange, onSaveAsDefault, onClose }: Props) {
  const [section, setSection] = useState<SidebarSection>("Symbol");

  const p = useCallback((patch: Partial<ChartSettings>) => onChange({ ...settings, ...patch }), [settings, onChange]);

  const symbolContent = (
    <AnimatedList>
      <AnimatedListItem>
        <Section title="Candles">
          <ColorPair label="Body" bull={settings.upColor} bear={settings.downColor} onBull={v => p({ upColor: v })} onBear={v => p({ downColor: v })} />
          <ColorPair label="Borders" bull={settings.upBorderColor} bear={settings.downBorderColor} onBull={v => p({ upBorderColor: v })} onBear={v => p({ downBorderColor: v })} />
          <ColorPair label="Wick" bull={settings.upWickColor} bear={settings.downWickColor} onBull={v => p({ upWickColor: v })} onBear={v => p({ downWickColor: v })} last />
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Price Label">
          <ColorPair label="Background" bull={settings.priceLabelBullColor ?? "#22c55e"} bear={settings.priceLabelBearColor ?? "#ef4444"} onBull={v => p({ priceLabelBullColor: v })} onBear={v => p({ priceLabelBearColor: v })} />
          <Row label="Text Color"><ColorBox value={settings.priceLabelTextColor ?? "#ffffff"} onChange={v => p({ priceLabelTextColor: v })} label="Price Label Text" fallback="#ffffff" /></Row>
          <Row label="Line Color" last><ColorBox value={settings.priceLabelLineColor ?? "rgba(255,255,255,0.4)"} onChange={v => p({ priceLabelLineColor: v })} label="Price Line" fallback="rgba(255,255,255,0.4)" /></Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Timezone">
          <Row label="Display Timezone" last>
            <StyledSelect value={settings.timezone} onChange={v => p({ timezone: v as ChartSettings["timezone"] })}
              options={[{ value: "UTC", label: "UTC" }, { value: "IST", label: "IST (India)" }, { value: "Exchange", label: "Exchange" }, { value: "Local", label: "Local Time" }]}
            />
          </Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Price Precision">
          <Row label="Decimal Places" last>
            <StyledSelect value={settings.precision} onChange={v => p({ precision: v as ChartSettings["precision"] })}
              options={[{ value: "2", label: "2 decimals" }, { value: "4", label: "4 decimals" }, { value: "5", label: "5 decimals" }, { value: "8", label: "8 decimals" }]}
            />
          </Row>
        </Section>
      </AnimatedListItem>
    </AnimatedList>
  );

  const canvasContent = (
    <AnimatedList>
      <AnimatedListItem>
        <Section title="Background">
          <Row label="Type">
            <StyledSelect value={settings.bgType} onChange={v => p({ bgType: v as ChartSettings["bgType"] })}
              options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]}
            />
          </Row>
          <Row label="Color" last><ColorBox value={settings.bgColor} onChange={v => p({ bgColor: v })} label="Background Color" /></Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Grid Lines">
          <Row label="Display">
            <StyledSelect value={settings.gridStyle} onChange={v => p({ gridStyle: v as ChartSettings["gridStyle"], gridVisible: v !== "none" })}
              options={[{ value: "both", label: "Vertical + Horizontal" }, { value: "vertical", label: "Vertical Only" }, { value: "horizontal", label: "Horizontal Only" }, { value: "none", label: "None" }]}
            />
          </Row>
          <Row label="Color" last><ColorBox value={settings.gridColor ?? settings.linesColor} onChange={v => p({ gridColor: v })} label="Grid Color" /></Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Axis Borders">
          <Row label="Visible"><Toggle checked={settings.bordersVisible ?? true} onChange={v => p({ bordersVisible: v })} /></Row>
          <Row label="Color" last><ColorBox value={settings.borderColor ?? settings.linesColor} onChange={v => p({ borderColor: v })} label="Axis Border Color" /></Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Chart Panel Border">
          <Row label="Visible"><Toggle checked={settings.panelBorderVisible ?? true} onChange={v => p({ panelBorderVisible: v })} /></Row>
          <Row label="Color"><ColorBox value={settings.panelBorderColor ?? "rgba(255,255,255,0.22)"} onChange={v => p({ panelBorderColor: v })} label="Panel Border Color" /></Row>
          <Row label="Thickness" last><ThicknessButtons value={settings.panelBorderThickness ?? 1} onChange={v => p({ panelBorderThickness: v })} /></Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Crosshair">
          <Row label="Color"><ColorBox value={settings.crosshairColor} onChange={v => p({ crosshairColor: v })} label="Crosshair Color" /></Row>
          <Row label="Mode">
            <StyledSelect value={settings.crosshair} onChange={v => p({ crosshair: v as ChartSettings["crosshair"] })}
              options={[{ value: "normal", label: "Normal" }, { value: "magnet", label: "Magnet" }]}
            />
          </Row>
          <Row label="Line Style">
            <StyledSelect value={settings.crosshairStyle} onChange={v => p({ crosshairStyle: v as ChartSettings["crosshairStyle"] })}
              options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]}
            />
          </Row>
          <Row label="Thickness" last><ThicknessButtons value={settings.crosshairWidth ?? 1} onChange={v => p({ crosshairWidth: v })} /></Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Text">
          <Row label="Color"><ColorBox value={settings.textColor} onChange={v => p({ textColor: v })} label="Text Color" /></Row>
          <Row label="Font Size" last>
            <StyledSelect value={String(settings.fontSize)} onChange={v => p({ fontSize: Number(v) })}
              options={[{ value: "9", label: "9px" }, { value: "10", label: "10px" }, { value: "11", label: "11px (default)" }, { value: "12", label: "12px" }, { value: "13", label: "13px" }, { value: "14", label: "14px" }]}
            />
          </Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Scale Labels">
          <Row label="Label Color" last><ColorBox value={settings.linesColor} onChange={v => p({ linesColor: v })} label="Scale Label Color" /></Row>
        </Section>
      </AnimatedListItem>
    </AnimatedList>
  );

  const scaleContent = (
    <AnimatedList>
      <AnimatedListItem>
        <Section title="Price Scale Mode">
          <Row label="Scale Type">
            <StyledSelect value={settings.scaleMode} onChange={v => p({ scaleMode: v as ChartSettings["scaleMode"] })}
              options={[{ value: "normal", label: "Normal" }, { value: "log", label: "Logarithmic" }, { value: "percent", label: "Percentage" }, { value: "indexed", label: "Indexed to 100" }]}
            />
          </Row>
          <Row label="Auto Scale" last><Toggle checked={settings.priceScaleAutoScale} onChange={v => p({ priceScaleAutoScale: v })} /></Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Interaction">
          <Row label="Drag Price Scale" last>
            <div style={{ fontSize: 11, color: T.textDim, fontStyle: "italic" }}>Drag the right axis up/down</div>
          </Row>
        </Section>
      </AnimatedListItem>
      <AnimatedListItem>
        <Section title="Reset">
          <Row label="Double-click Axis" last>
            <div style={{ fontSize: 11, color: T.textDim, fontStyle: "italic" }}>Double-click price axis to reset</div>
          </Row>
        </Section>
      </AnimatedListItem>
    </AnimatedList>
  );

  return (
    <AnimatedModal
      isOpen={true}
      onClose={onClose}
      title="Chart Settings"
      mode="dialog"
    >
      <div style={{ display: "flex", flex: 1, overflow: "hidden", borderRadius: "0 0 18px 18px" }}>

        {/* Sidebar */}
        <div style={{
          width: 152, borderRight: `1px solid ${T.divider}`,
          flexShrink: 0, paddingTop: 10, paddingBottom: 10,
          background: "rgba(255,255,255,0.02)",
          borderRadius: "0 0 0 18px",
        }}>
          <p style={{
            margin: "4px 14px 10px", fontSize: 9, fontWeight: 700,
            color: T.textXDim,
            textTransform: "uppercase", letterSpacing: "0.12em",
          }}>Sections</p>
          {(["Symbol", "Canvas", "Scale"] as SidebarSection[]).map(s => (
            <NavItem key={s} label={s} active={section === s} onClick={() => setSection(s)} />
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", scrollbarWidth: "none" }}>
          {section === "Symbol" && symbolContent}
          {section === "Canvas" && canvasContent}
          {section === "Scale"  && scaleContent}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 20px",
        borderTop: `1px solid ${T.divider}`,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
        flexShrink: 0,
        borderRadius: "0 0 18px 18px",
        background: "rgba(255,255,255,0.02)",
      }}>
        <button onClick={() => onChange(DEFAULT_CHART_SETTINGS)}
          style={{
            padding: "7px 16px", borderRadius: 9,
            background: "transparent", border: `1px solid ${T.btnBorder}`,
            color: T.textDim, fontSize: 11, fontWeight: 600, cursor: "pointer",
            transition: "all 0.12s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.22)"; (e.currentTarget as HTMLButtonElement).style.color = T.textMed; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.btnBorder; (e.currentTarget as HTMLButtonElement).style.color = T.textDim; }}
        >
          Reset Defaults
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {onSaveAsDefault && (
            <SaveAsDefaultButton settings={settings} onSaveAsDefault={onSaveAsDefault} />
          )}
          <button onClick={onClose}
            style={{
              padding: "7px 20px", borderRadius: 9,
              background: T.accentBg, border: `1px solid ${T.accentBorder}`,
              color: T.accent, fontSize: 11, fontWeight: 800, cursor: "pointer",
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(96,165,250,0.18)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 14px ${T.accentGlow}`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.accentBg; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
          >
            Done
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
});

export default SettingsPanel;
