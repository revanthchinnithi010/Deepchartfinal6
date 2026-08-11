import { memo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { Drawing, DrawingStyle, DrawingPoint } from "@/types/drawing";
import { ColorPickerGlass } from "@/components/ColorPickerGlass";
import { toArray } from "@/lib/safeArray";

type Tab = "style" | "text" | "coordinates" | "visibility";

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

const LINE_TOOLS = new Set([
  "trendline","ray","extended","hline","hray","vline","channel",
]);

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24];

const TOOL_NAMES: Record<string, string> = {
  trendline:      "Trendline",
  ray:            "Ray",
  extended:       "Extended Line",
  hline:          "Horizontal Line",
  hray:           "Horizontal Ray",
  vline:          "Vertical Line",
  channel:        "Channel",
  rect:           "Rectangle",
  ellipse:        "Ellipse",
  arrow:          "Arrow",
  text:           "Text",
  note:           "Note",
  fib:            "Fibonacci",
  fib_channel:    "Fib Channel",
  position_long:  "Long Position",
  position_short: "Short Position",
};

export const DrawingSettingsModal = memo(function DrawingSettingsModal({
  drawing,
  pos,
  onUpdate,
  onUpdatePoints,
  onClose,
}: {
  drawing:         Drawing;
  pos:             { x: number; y: number };
  onUpdate:        (patch: Partial<DrawingStyle>) => void;
  onUpdatePoints:  (points: DrawingPoint[]) => void;
  onClose:         () => void;
}) {
  const origStyleRef  = useRef<DrawingStyle>({ ...drawing.style });
  const origPointsRef = useRef<DrawingPoint[]>(drawing.points.map(p => ({ ...p })));

  const [activeTab, setActiveTab]             = useState<Tab>("style");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorAnchor,     setColorAnchor]     = useState<DOMRect | null>(null);
  const [showTextCP,      setShowTextCP]      = useState(false);
  const [textCPAnchor,    setTextCPAnchor]    = useState<DOMRect | null>(null);

  const [pt1Price, setPt1Price] = useState(drawing.points[0]?.price?.toString() ?? "");
  const [pt2Price, setPt2Price] = useState(drawing.points[1]?.price?.toString() ?? "");

  const colorSwatchRef    = useRef<HTMLButtonElement>(null);
  const textColorSwatchRef = useRef<HTMLButtonElement>(null);

  const S          = drawing.style;
  const isLineTool = LINE_TOOLS.has(drawing.toolType);

  const MW = 340;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = pos.x - MW / 2;
  let top  = pos.y - 500;
  left = Math.max(8, Math.min(left, vw - MW - 8));
  if (top < 8) top = pos.y + 54;
  top = Math.max(8, Math.min(top, vh - 520));

  const handleCancel = () => {
    onUpdate(origStyleRef.current);
    onUpdatePoints(origPointsRef.current);
    onClose();
  };

  const commitPt1 = () => {
    const v = parseFloat(pt1Price);
    if (isNaN(v)) { setPt1Price(drawing.points[0]?.price?.toString() ?? ""); return; }
    const pts = drawing.points.map(p => ({ ...p }));
    if (pts[0]) pts[0] = { ...pts[0], price: v };
    onUpdatePoints(pts);
  };
  const commitPt2 = () => {
    const v = parseFloat(pt2Price);
    if (isNaN(v)) { setPt2Price(drawing.points[1]?.price?.toString() ?? ""); return; }
    const pts = drawing.points.map(p => ({ ...p }));
    if (pts[1]) pts[1] = { ...pts[1], price: v };
    onUpdatePoints(pts);
  };

  const isTFVisible = (value: string) => {
    const vt = toArray<string>(S.visibleTimeframes, "DrawingSettingsModal.isTFVisible");
    return vt.length === 0 || vt.includes(value);
  };

  const toggleTF = (value: string) => {
    const cur = toArray<string>(S.visibleTimeframes, "DrawingSettingsModal.toggleTF");
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

  const visibleTFList = toArray<string>(S.visibleTimeframes, "DrawingSettingsModal.visibleTFList");
  const allVisible = visibleTFList.length === 0;
  const activeVTLabels = visibleTFList
    .map(v => TIMEFRAME_OPTIONS.find(t => t.value === v)?.label ?? v)
    .join(", ");

  const TABS: { id: Tab; label: string }[] = [
    { id: "style",       label: "Style"       },
    { id: "text",        label: "Text"        },
    { id: "coordinates", label: "Coordinates" },
    { id: "visibility",  label: "Visibility"  },
  ];

  return createPortal(
    <div
      data-drawing-popup
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      style={{
        position:             "fixed",
        left,
        top,
        zIndex:               220,
        width:                MW,
        background:           "rgba(12,16,22,0.98)",
        backdropFilter:       "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        border:               "1px solid rgba(255,255,255,0.09)",
        borderRadius:         16,
        boxShadow:            "0 28px 90px rgba(0,0,0,0.88), 0 1px 0 rgba(255,255,255,0.04) inset",
        overflow:             "hidden",
        userSelect:           "none",
        animation:            "dsm-pop .15s cubic-bezier(0.16,1,0.3,1) both",
      }}
    >
      <style>{`
        @keyframes dsm-pop{from{opacity:0;transform:translateY(8px) scale(0.97)}to{opacity:1;transform:none}}
        .dsm-input:focus{border-color:rgba(183,255,90,0.4)!important;outline:none}
        .dsm-input::-webkit-inner-spin-button,.dsm-input::-webkit-outer-spin-button{-webkit-appearance:none}
        .dsm-scroll::-webkit-scrollbar{width:3px}
        .dsm-scroll::-webkit-scrollbar-track{background:transparent}
        .dsm-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:2px}
      `}</style>

      {/* ── Header ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "13px 16px 10px",
        borderBottom:   "1px solid rgba(255,255,255,0.07)",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontFamily: "'Inter',system-ui,sans-serif" }}>
          {TOOL_NAMES[drawing.toolType] ?? "Drawing"} Settings
        </span>
        <button onClick={onClose} style={{
          border: "none", background: "rgba(255,255,255,0.06)", cursor: "pointer",
          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 7, color: "rgba(255,255,255,0.55)", transition: "background .1s",
        }}>
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display:      "flex",
        padding:      "0 12px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        gap:          0,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex:        1,
            padding:     "8px 2px 9px",
            border:      "none",
            borderBottom: `2px solid ${activeTab === t.id ? "#B7FF5A" : "transparent"}`,
            background:  "none",
            cursor:      "pointer",
            fontSize:    11,
            fontWeight:  activeTab === t.id ? 700 : 500,
            color:       activeTab === t.id ? "#B7FF5A" : "rgba(255,255,255,0.38)",
            fontFamily:  "'Inter',system-ui,sans-serif",
            letterSpacing: "0.01em",
            transition:  "color .12s, border-color .12s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="dsm-scroll" style={{ overflowY: "auto", maxHeight: 370 }}>

        {/* ════ STYLE TAB ════ */}
        {activeTab === "style" && (
          <>
            <SRow label="Line Color">
              <button ref={colorSwatchRef} onClick={() => {
                if (colorSwatchRef.current) setColorAnchor(colorSwatchRef.current.getBoundingClientRect());
                setShowColorPicker(v => !v);
              }} style={{
                width: 28, height: 28, borderRadius: 8, cursor: "pointer", flexShrink: 0,
                background: S.color,
                border: showColorPicker ? "2px solid rgba(255,255,255,0.9)" : "1.5px solid rgba(255,255,255,0.18)",
                boxShadow: `0 0 8px ${S.color}55`,
                transition: "all .12s",
              }} />
              <div style={{
                flex: 1, height: 28, borderRadius: 8,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", paddingLeft: 9, gap: 4,
              }}>
                <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.22)", fontFamily: "monospace" }}>#</span>
                <span style={{ fontSize: 12, color: "#fff", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, letterSpacing: ".04em" }}>
                  {S.color.replace(/^#/, "").toUpperCase().slice(0, 6)}
                </span>
              </div>
            </SRow>

            <Sep />

            <SRow label="Thickness">
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                {[1,2,3,4,5].map(t => {
                  const act = S.thickness === t;
                  return (
                    <ThkBtn key={t} active={act} onClick={() => onUpdate({ thickness: t })}>
                      <div style={{ width: "62%", height: t, background: act ? "#B7FF5A" : "rgba(200,200,200,0.38)", borderRadius: 2 }} />
                    </ThkBtn>
                  );
                })}
              </div>
            </SRow>

            <SRow label="Style">
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                {(["solid","dashed","dotted"] as const).map(s => {
                  const act = S.lineStyle === s;
                  return (
                    <ThkBtn key={s} active={act} onClick={() => onUpdate({ lineStyle: s })}>
                      <svg width={34} height={6}>
                        <line x1={0} y1={3} x2={34} y2={3}
                          stroke={act ? "#B7FF5A" : "rgba(180,180,180,0.45)"}
                          strokeWidth={1.5}
                          strokeDasharray={s === "dashed" ? "7 3" : s === "dotted" ? "1.5 3.5" : undefined}
                          strokeLinecap="round"
                        />
                      </svg>
                    </ThkBtn>
                  );
                })}
              </div>
            </SRow>

            {isLineTool && (
              <>
                <Sep />
                <SRow label="Extend">
                  <div style={{ display: "flex", gap: 6, flex: 1 }}>
                    <TogBtn active={S.extendLeft ?? false} onClick={() => onUpdate({ extendLeft: !(S.extendLeft ?? false) })}>← Left</TogBtn>
                    <TogBtn active={S.extendRight ?? false} onClick={() => onUpdate({ extendRight: !(S.extendRight ?? false) })}>Right →</TogBtn>
                  </div>
                </SRow>
              </>
            )}

            <Sep />

            {isLineTool && (
              <ChkRow
                label="Middle point"
                checked={S.showMiddlePoint ?? false}
                onChange={v => onUpdate({ showMiddlePoint: v })}
              />
            )}

            <ChkRow
              label="Price labels"
              checked={S.showPriceLabels ?? false}
              onChange={v => onUpdate({ showPriceLabels: v })}
            />
          </>
        )}

        {/* ════ TEXT TAB ════ */}
        {activeTab === "text" && (
          <>
            <SRow label="Text Color">
              <button ref={textColorSwatchRef} onClick={() => {
                if (textColorSwatchRef.current) setTextCPAnchor(textColorSwatchRef.current.getBoundingClientRect());
                setShowTextCP(v => !v);
              }} style={{
                width: 28, height: 28, borderRadius: 8, cursor: "pointer", flexShrink: 0,
                background: S.textColor ?? S.color,
                border: showTextCP ? "2px solid rgba(255,255,255,0.9)" : "1.5px solid rgba(255,255,255,0.18)",
                boxShadow: `0 0 8px ${S.textColor ?? S.color}55`,
              }} />
              <div style={{
                flex: 1, height: 28, borderRadius: 8,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", paddingLeft: 9,
              }}>
                <span style={{ fontSize: 12, color: "#fff", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>
                  {(S.textColor ?? S.color).replace(/^#/, "").toUpperCase().slice(0, 6)}
                </span>
              </div>
            </SRow>

            <Sep />

            <SRow label="Font Size">
              <div style={{ display: "flex", gap: 3, flex: 1, flexWrap: "wrap" }}>
                {FONT_SIZES.map(fs => {
                  const act = (S.fontSize ?? 13) === fs;
                  return (
                    <button key={fs} onClick={() => onUpdate({ fontSize: fs })} style={{
                      minWidth: 32, height: 26, borderRadius: 6, cursor: "pointer",
                      background:  act ? "rgba(183,255,90,0.12)" : "rgba(255,255,255,0.04)",
                      border:      `1px solid ${act ? "rgba(183,255,90,0.5)" : "rgba(255,255,255,0.07)"}`,
                      color:       act ? "#B7FF5A" : "rgba(200,200,200,0.65)",
                      fontSize:    10, fontWeight: act ? 700 : 400,
                      fontFamily:  "'Inter',system-ui,sans-serif",
                    }}>
                      {fs}
                    </button>
                  );
                })}
              </div>
            </SRow>

            <SRow label="Format">
              <div style={{ display: "flex", gap: 6, flex: 1 }}>
                <TogBtn active={S.fontBold ?? false} onClick={() => onUpdate({ fontBold: !(S.fontBold ?? false) })}>
                  <strong style={{ fontFamily: "serif", fontSize: 13 }}>B</strong>
                </TogBtn>
                <TogBtn active={S.fontItalic ?? false} onClick={() => onUpdate({ fontItalic: !(S.fontItalic ?? false) })}>
                  <em style={{ fontFamily: "serif", fontSize: 13 }}>I</em>
                </TogBtn>
              </div>
            </SRow>

            <Sep />

            <div style={{ padding: "8px 16px" }}>
              <p style={labelStyle}>Text</p>
              <textarea
                defaultValue={S.text ?? ""}
                rows={3}
                placeholder="Enter text…"
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                onBlur={e => onUpdate({ text: e.target.value })}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 8, color: "#fff",
                  fontSize: 12, fontFamily: "'Inter',system-ui,sans-serif",
                  padding: "7px 10px", resize: "vertical", outline: "none",
                  lineHeight: 1.55,
                }}
              />
            </div>

            <Sep />

            <SRow label="H Align">
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                {(["left","center","right"] as const).map(a => {
                  const act = (S.textAlignH ?? "left") === a;
                  return (
                    <ThkBtn key={a} active={act} onClick={() => onUpdate({ textAlignH: a })}>
                      <HAlignIcon dir={a} active={act} />
                    </ThkBtn>
                  );
                })}
              </div>
            </SRow>

            <SRow label="V Align">
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                {(["top","middle","bottom"] as const).map(a => {
                  const act = (S.textAlignV ?? "top") === a;
                  return (
                    <ThkBtn key={a} active={act} onClick={() => onUpdate({ textAlignV: a })}>
                      <VAlignIcon dir={a} active={act} />
                    </ThkBtn>
                  );
                })}
              </div>
            </SRow>
          </>
        )}

        {/* ════ COORDINATES TAB ════ */}
        {activeTab === "coordinates" && (
          <div style={{ padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 18 }}>
            {drawing.points[0] && (
              <PointCard label="Point 1" color="rgba(183,255,90,0.85)">
                <CoordField label="Price">
                  <input
                    type="number"
                    className="dsm-input"
                    value={pt1Price}
                    onChange={e => setPt1Price(e.target.value)}
                    onBlur={commitPt1}
                    onKeyDown={e => { if (e.key === "Enter") { commitPt1(); (e.target as HTMLInputElement).blur(); } }}
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    style={coordInput}
                  />
                </CoordField>
                <CoordField label="Time">
                  <div style={{ ...coordInput, cursor: "default", color: "rgba(255,255,255,0.38)", fontSize: 10 }}>
                    {fmtTime(drawing.points[0].time)}
                  </div>
                </CoordField>
              </PointCard>
            )}

            {drawing.points[1] && (
              <PointCard label="Point 2" color="rgba(100,180,255,0.85)">
                <CoordField label="Price">
                  <input
                    type="number"
                    className="dsm-input"
                    value={pt2Price}
                    onChange={e => setPt2Price(e.target.value)}
                    onBlur={commitPt2}
                    onKeyDown={e => { if (e.key === "Enter") { commitPt2(); (e.target as HTMLInputElement).blur(); } }}
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                    style={coordInput}
                  />
                </CoordField>
                <CoordField label="Time">
                  <div style={{ ...coordInput, cursor: "default", color: "rgba(255,255,255,0.38)", fontSize: 10 }}>
                    {fmtTime(drawing.points[1].time)}
                  </div>
                </CoordField>
              </PointCard>
            )}

            {drawing.points.length === 1 && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 8 }}>
                Single-point drawing
              </p>
            )}
          </div>
        )}

        {/* ════ VISIBILITY TAB ════ */}
        {activeTab === "visibility" && (
          <div style={{ padding: "14px 16px" }}>
            <p style={labelStyle}>Visible on timeframes</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
              {TIMEFRAME_OPTIONS.map(tf => {
                const active = isTFVisible(tf.value);
                return (
                  <button key={tf.value} onClick={() => toggleTF(tf.value)} style={{
                    padding:    "5px 14px",
                    borderRadius: 20,
                    cursor:     "pointer",
                    background: active ? "rgba(183,255,90,0.12)" : "rgba(255,255,255,0.04)",
                    border:     `1.5px solid ${active ? "rgba(183,255,90,0.5)" : "rgba(255,255,255,0.08)"}`,
                    color:      active ? "#B7FF5A" : "rgba(255,255,255,0.3)",
                    fontSize:   11.5,
                    fontWeight: active ? 700 : 500,
                    fontFamily: "'Inter',system-ui,sans-serif",
                    transition: "all .12s",
                  }}>
                    {tf.label}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.28)", marginTop: 12, lineHeight: 1.55, fontFamily: "'Inter',system-ui,sans-serif" }}>
              {allVisible
                ? "Showing on all timeframes"
                : `Showing on: ${activeVTLabels}`}
            </p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        display:     "flex",
        gap:         8,
        padding:     "10px 14px 14px",
        borderTop:   "1px solid rgba(255,255,255,0.07)",
      }}>
        <button onClick={handleCancel} style={{
          flex: 1, height: 36, borderRadius: 9, cursor: "pointer",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          color: "rgba(255,255,255,0.7)", fontSize: 12.5, fontWeight: 600,
          fontFamily: "'Inter',system-ui,sans-serif",
          transition: "background .1s",
        }}>Cancel</button>
        <button onClick={onClose} style={{
          flex: 1, height: 36, borderRadius: 9, cursor: "pointer",
          background: "rgba(183,255,90,0.14)", border: "1.5px solid rgba(183,255,90,0.42)",
          color: "#B7FF5A", fontSize: 12.5, fontWeight: 700,
          fontFamily: "'Inter',system-ui,sans-serif",
          transition: "background .1s",
        }}>OK</button>
      </div>

      {/* ── Color pickers (portalled out via ColorPickerGlass itself) ── */}
      {showColorPicker && colorAnchor && (
        <ColorPickerGlass
          value={S.color}
          onChange={c => onUpdate({ color: c })}
          onClose={() => setShowColorPicker(false)}
          anchorRect={colorAnchor}
        />
      )}
      {showTextCP && textCPAnchor && (
        <ColorPickerGlass
          value={S.textColor ?? S.color}
          onChange={c => onUpdate({ textColor: c })}
          onClose={() => setShowTextCP(false)}
          anchorRect={textCPAnchor}
        />
      )}
    </div>,
    document.body
  );
});

// ── Shared sub-components ───────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 9.5,
  color: "rgba(255,255,255,0.35)",
  textTransform: "uppercase",
  letterSpacing: ".09em",
  fontWeight: 700,
  fontFamily: "'Inter',system-ui,sans-serif",
  marginBottom: 7,
};

function SRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 16px", minHeight: 40,
    }}>
      <span style={{
        fontSize: 11, color: "rgba(255,255,255,0.45)",
        fontFamily: "'Inter',system-ui,sans-serif",
        width: 70, flexShrink: 0,
      }}>{label}</span>
      <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "center" }}>{children}</div>
    </div>
  );
}

function Sep() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.055)", margin: "1px 0" }} />;
}

function ThkBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, height: 28, borderRadius: 6, cursor: "pointer",
      background: active ? "rgba(183,255,90,0.11)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${active ? "rgba(183,255,90,0.48)" : "rgba(255,255,255,0.07)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all .1s",
    }}>
      {children}
    </button>
  );
}

function TogBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, height: 28, borderRadius: 6, cursor: "pointer",
      background: active ? "rgba(183,255,90,0.11)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${active ? "rgba(183,255,90,0.48)" : "rgba(255,255,255,0.07)"}`,
      color: active ? "#B7FF5A" : "rgba(200,200,200,0.55)",
      fontSize: 11, fontWeight: active ? 700 : 500,
      fontFamily: "'Inter',system-ui,sans-serif",
      transition: "all .12s",
    }}>
      {children}
    </button>
  );
}

function ChkRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 16px", minHeight: 38, cursor: "pointer",
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        background: checked ? "#B7FF5A" : "rgba(255,255,255,0.05)",
        border: `1.5px solid ${checked ? "#B7FF5A" : "rgba(255,255,255,0.14)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .1s",
      }}>
        {checked && (
          <svg width={9} height={7} viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5l2.5 2.5L8 1" stroke="#0a1510" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <span style={{ fontSize: 12, color: checked ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.62)", fontFamily: "'Inter',system-ui,sans-serif" }}>
        {label}
      </span>
    </div>
  );
}

function PointCard({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.07)", padding: "10px 12px",
    }}>
      <p style={{ ...labelStyle, color, marginBottom: 10 }}>{label}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{children}</div>
    </div>
  );
}

function CoordField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.38)", width: 34, flexShrink: 0, fontFamily: "'Inter',system-ui,sans-serif" }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const coordInput: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  height: 28, borderRadius: 7,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff", fontSize: 12,
  fontFamily: "'JetBrains Mono',monospace",
  padding: "0 9px",
  display: "flex", alignItems: "center",
};

function HAlignIcon({ dir, active }: { dir: "left" | "center" | "right"; active: boolean }) {
  const c = active ? "#B7FF5A" : "rgba(200,200,200,0.5)";
  return (
    <svg width={18} height={14} viewBox="0 0 18 14" fill={c}>
      {dir === "left"   && <><rect x={0} y={0}  width={18} height={2} rx={1}/><rect x={0} y={6}  width={11} height={2} rx={1}/><rect x={0} y={12} width={14} height={2} rx={1}/></>}
      {dir === "center" && <><rect x={0} y={0}  width={18} height={2} rx={1}/><rect x={3.5} y={6}  width={11} height={2} rx={1}/><rect x={2} y={12} width={14} height={2} rx={1}/></>}
      {dir === "right"  && <><rect x={0} y={0}  width={18} height={2} rx={1}/><rect x={7} y={6}  width={11} height={2} rx={1}/><rect x={4} y={12} width={14} height={2} rx={1}/></>}
    </svg>
  );
}

function VAlignIcon({ dir, active }: { dir: "top" | "middle" | "bottom"; active: boolean }) {
  const c = active ? "#B7FF5A" : "rgba(200,200,200,0.5)";
  return (
    <svg width={18} height={16} viewBox="0 0 18 16" fill="none" stroke={c} strokeWidth={1.5} strokeLinecap="round">
      {dir === "top" && (
        <>
          <line x1={0} y1={1} x2={18} y2={1}/>
          <line x1={4} y1={5} x2={14} y2={5}/>
          <line x1={4} y1={9} x2={14} y2={9}/>
          <line x1={9} y1={1} x2={9} y2={4}/>
          <path d="M6.5 3.5L9 1L11.5 3.5" fill="none"/>
        </>
      )}
      {dir === "middle" && (
        <>
          <line x1={0} y1={8} x2={18} y2={8}/>
          <line x1={4} y1={4} x2={14} y2={4}/>
          <line x1={4} y1={12} x2={14} y2={12}/>
          <line x1={9} y1={8} x2={9} y2={5}/>
          <path d="M6.5 6.5L9 4L11.5 6.5" fill="none"/>
          <line x1={9} y1={8} x2={9} y2={11}/>
          <path d="M6.5 9.5L9 12L11.5 9.5" fill="none"/>
        </>
      )}
      {dir === "bottom" && (
        <>
          <line x1={0} y1={15} x2={18} y2={15}/>
          <line x1={4} y1={7} x2={14} y2={7}/>
          <line x1={4} y1={11} x2={14} y2={11}/>
          <line x1={9} y1={15} x2={9} y2={12}/>
          <path d="M6.5 12.5L9 15L11.5 12.5" fill="none"/>
        </>
      )}
    </svg>
  );
}

function fmtTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
