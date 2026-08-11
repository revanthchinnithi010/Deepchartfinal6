import { memo, useRef, useState, useCallback, useEffect, useId } from "react";
import { createPortal } from "react-dom";

// ── Animation constants ────────────────────────────────────────────────────────
const EASE_OPEN = "cubic-bezier(0.22,1,0.36,1)";

// ── Helpers ────────────────────────────────────────────────────────────────────

export function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  let h = (hex || "#000000").replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  let a = 1;
  if (h.length === 8) { a = parseInt(h.slice(6, 8), 16) / 255; h = h.slice(0, 6); }
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
    a,
  };
}

function toH2(n: number) {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0").toUpperCase();
}

function hexWithAlpha(hex6: string, alpha: number): string {
  const base = hex6.replace("#", "").slice(0, 6).padEnd(6, "0");
  if (alpha >= 0.999) return `#${base}`;
  return `#${base}${toH2(alpha * 255)}`;
}

function hex6FromValue(val: string): string {
  const v = (val || "#FF9800").trim();
  // Parse rgba() / rgb() strings
  const rgba = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgba) return (toH2(+rgba[1]) + toH2(+rgba[2]) + toH2(+rgba[3])).toUpperCase();
  // Hex
  const h = v.replace("#", "");
  return (h.length >= 6 ? h.slice(0, 6) : h.padEnd(6, "0")).toUpperCase();
}

function alphaFromValue(val: string): number {
  const v = (val || "").trim();
  // Parse rgba() alpha channel
  const rgba = v.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i);
  if (rgba) return Math.max(0, Math.min(1, parseFloat(rgba[1])));
  // 8-digit hex alpha
  const h = v.replace("#", "");
  if (h.length === 8) return parseInt(h.slice(6, 8), 16) / 255;
  return 1;
}

// ── TradingView-style 10×8 color grid ─────────────────────────────────────────

const TV_GRID: string[][] = [
  // Row 1 — Grays
  ["#ffffff","#d6d6d6","#b3b3b3","#8c8c8c","#696969","#494949","#313131","#1e1e1e","#111111","#000000"],
  // Row 2 — Vivid
  ["#f44336","#ff9800","#ffc107","#4caf50","#26a69a","#29b6f6","#2196f3","#9c27b0","#e91e63","#ff5722"],
  // Row 3 — Pastel light
  ["#ffcdd2","#ffe0b2","#fff9c4","#c8e6c9","#b2dfdb","#b3e5fc","#bbdefb","#e1bee7","#fce4ec","#fbe9e7"],
  // Row 4 — Light
  ["#ef9a9a","#ffcc80","#fff59d","#a5d6a7","#80cbc4","#81d4fa","#90caf9","#ce93d8","#f48fb1","#ffab91"],
  // Row 5 — Medium-light
  ["#e57373","#ffa726","#ffee58","#66bb6a","#4db6ac","#4fc3f7","#64b5f6","#ba68c8","#f06292","#ff8a65"],
  // Row 6 — Medium-dark
  ["#e53935","#fb8c00","#fdd835","#43a047","#00897b","#039be5","#1e88e5","#8e24aa","#d81b60","#f4511e"],
  // Row 7 — Dark
  ["#c62828","#e65100","#f9a825","#2e7d32","#00695c","#0277bd","#1565c0","#6a1b9a","#ad1457","#bf360c"],
  // Row 8 — Very dark
  ["#7f0000","#6d3200","#827717","#1b5e20","#004d40","#01427a","#0d47a1","#4a148c","#880e4f","#7c2d12"],
];

// ── Recent colors persistence ─────────────────────────────────────────────────

const RECENTS_KEY = "tj_recent_colors_v1";
const DEFAULT_RECENTS = ["#1A237E","#FFEB3B","#558B2F","#9ACD32","#EF4444","#22C55E","#AB47BC","#000000"];

function loadRecents(): string[] {
  try {
    const s = localStorage.getItem(RECENTS_KEY);
    if (s) return JSON.parse(s) as string[];
  } catch { /**/ }
  return DEFAULT_RECENTS;
}

function saveRecents(list: string[]) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); } catch { /**/ }
}

function pushRecent(list: string[], color: string): string[] {
  const c = "#" + color.replace("#","").toUpperCase();
  const filtered = list.filter(x => x.toUpperCase() !== c.toUpperCase());
  const next = [c, ...filtered].slice(0, 8);
  saveRecents(next);
  return next;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ColorPickerGlassProps {
  value:      string;
  onChange:   (v: string) => void;
  onClose:    () => void;
  anchorRect?: DOMRect | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ColorPickerGlass = memo(function ColorPickerGlass({
  value, onChange, onClose, anchorRect,
}: ColorPickerGlassProps) {
  const uid      = useId().replace(/:/g, "");
  const popRef   = useRef<HTMLDivElement>(null);
  const hexInputRef = useRef<HTMLInputElement>(null);

  const [hex6,    setHex6]    = useState(() => hex6FromValue(value));
  const [alpha,   setAlpha]   = useState(() => alphaFromValue(value));
  const [hexIn,   setHexIn]   = useState(() => hex6FromValue(value));
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [showHexInput, setShowHexInput] = useState(false);

  const currentHex = hexWithAlpha(hex6, alpha);

  const emit = useCallback((h6: string, a: number) => {
    onChange(hexWithAlpha(h6, a));
  }, [onChange]);

  const pickColor = useCallback((raw: string) => {
    const h6 = raw.replace("#","").slice(0,6).toUpperCase();
    setHex6(h6);
    setHexIn(h6);
    setAlpha(1);
    setRecents(prev => pushRecent(prev, h6));
    emit(h6, 1);
  }, [emit]);

  const addCurrentToRecents = useCallback(() => {
    setRecents(prev => pushRecent(prev, hex6));
  }, [hex6]);

  const applyHexInput = useCallback((raw: string) => {
    const clean = raw.replace(/[^0-9a-fA-F]/g,"").slice(0,6);
    if (clean.length === 6) {
      setHex6(clean.toUpperCase());
      emit(clean.toUpperCase(), alpha);
    }
  }, [alpha, emit]);

  // Outside click → close
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    const id = setTimeout(() => document.addEventListener("pointerdown", onDown, true), 120);
    return () => { clearTimeout(id); document.removeEventListener("pointerdown", onDown, true); };
  }, [onClose]);

  // Focus hex input when shown
  useEffect(() => {
    if (showHexInput) setTimeout(() => hexInputRef.current?.focus(), 50);
  }, [showHexInput]);

  // Positioning — appear below the anchor, shift left if needed
  const W = 272;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = anchorRect ? anchorRect.left + anchorRect.width / 2 - W / 2 : vw / 2 - W / 2;
  let top  = anchorRect ? anchorRect.bottom + 8 : vh / 2 - 200;
  if (left + W > vw - 8)  left = vw - W - 8;
  if (left < 8)            left = 8;
  const estimatedH = 290;
  if (top + estimatedH > vh - 8) top = (anchorRect ? anchorRect.top : vh / 2) - estimatedH - 8;
  if (top < 8)             top  = 8;

  const opClass = `cgp-op-${uid}`;

  const SWATCH_SIZE = 22;
  const SWATCH_GAP  = 3;

  return createPortal(
    <>
      <style>{`
        @keyframes cpop-${uid}{from{opacity:0;transform:translateY(5px) scale(0.97)}to{opacity:1;transform:none}}
        .${opClass}{appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer;width:100%;height:100%;position:absolute;inset:0;margin:0;opacity:0;}
        .${opClass}::-webkit-slider-thumb{appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.5);cursor:pointer;}
        .${opClass}::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#fff;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.5);cursor:pointer;}
      `}</style>

      <div
        ref={popRef}
        data-drawing-popup
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        style={{
          position:       "fixed",
          left, top,
          zIndex:         99999,
          width:          W,
          background:     "rgba(28,32,40,0.98)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border:         "1px solid rgba(255,255,255,0.08)",
          borderRadius:   12,
          boxShadow:      "0 8px 40px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)",
          animation:      `cpop-${uid} .15s ${EASE_OPEN}`,
          padding:        "10px 10px 12px",
          userSelect:     "none",
        }}
      >
        {/* ── Color grid ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: SWATCH_GAP }}>
          {TV_GRID.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: SWATCH_GAP }}>
              {row.map(color => {
                const c6 = color.replace("#","").toUpperCase();
                const isSelected = c6 === hex6.toUpperCase();
                return (
                  <button
                    key={color}
                    title={color}
                    onClick={e => { e.stopPropagation(); pickColor(color); }}
                    onPointerDown={e => e.stopPropagation()}
                    style={{
                      width:           SWATCH_SIZE,
                      height:          SWATCH_SIZE,
                      borderRadius:    5,
                      flexShrink:      0,
                      cursor:          "pointer",
                      background:      color,
                      border:          isSelected
                        ? "2.5px solid #ffffff"
                        : "1.5px solid rgba(255,255,255,0.07)",
                      boxShadow:       isSelected
                        ? `0 0 0 2px ${color}88, 0 0 10px ${color}66`
                        : "none",
                      transition:      "transform .08s, box-shadow .08s, border-color .08s",
                      outline:         "none",
                      padding:         0,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.transform = "scale(1.18)";
                      (e.currentTarget as HTMLElement).style.zIndex = "2";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                      (e.currentTarget as HTMLElement).style.zIndex = "";
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Separator ──────────────────────────────────────────────────────── */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "9px 0" }} />

        {/* ── Recent colors ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 9 }}>
          {recents.map((c, i) => {
            const c6 = c.replace("#","").toUpperCase();
            const isSelected = c6 === hex6.toUpperCase();
            return (
              <button
                key={`${c}-${i}`}
                title={c}
                onClick={e => { e.stopPropagation(); pickColor(c); }}
                onPointerDown={e => e.stopPropagation()}
                style={{
                  width:        20, height: 20, borderRadius: 4,
                  flexShrink:   0, cursor: "pointer",
                  background:   c,
                  border:       isSelected ? "2px solid #fff" : "1.5px solid rgba(255,255,255,0.1)",
                  boxShadow:    isSelected ? `0 0 0 2px ${c}66` : "none",
                  transition:   "transform .08s",
                  outline:      "none", padding: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.15)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
              />
            );
          })}

          {/* + button — adds current color to recents */}
          <button
            title="Add current color to recent"
            onClick={e => { e.stopPropagation(); addCurrentToRecents(); }}
            onPointerDown={e => e.stopPropagation()}
            style={{
              width: 20, height: 20, borderRadius: 4, flexShrink: 0,
              cursor: "pointer", background: "rgba(255,255,255,0.06)",
              border: "1.5px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.6)", fontSize: 15, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              outline: "none", padding: 0, transition: "background .1s, color .1s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.14)";
              (e.currentTarget as HTMLElement).style.color = "#fff";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
            }}
          >
            +
          </button>
        </div>

        {/* ── Opacity ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "rgba(200,205,215,0.65)", fontWeight: 500, flexShrink: 0, minWidth: 50 }}>
            Opacity
          </span>

          {/* Slider track */}
          <div style={{
            flex: 1, position: "relative", height: 14, borderRadius: 999,
            background: "linear-gradient(45deg,#3a3a3a 25%,transparent 25%,transparent 75%,#3a3a3a 75%) 0 0/7px 7px, linear-gradient(45deg,#3a3a3a 25%,#2a2a2a 25%,#2a2a2a 75%,#3a3a3a 75%) 3.5px 3.5px/7px 7px",
            overflow: "hidden",
          }}>
            {/* Colored fill layer */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: 999,
              background: `linear-gradient(to right, transparent 0%, #${hex6} 100%)`,
              pointerEvents: "none",
            }} />
            {/* Native input (transparent, captures drag) */}
            <input
              type="range" min={0} max={100} step={1}
              value={Math.round(alpha * 100)}
              className={opClass}
              onChange={e => {
                const a = Number(e.target.value) / 100;
                setAlpha(a);
                emit(hex6, a);
              }}
            />
            {/* Visual thumb */}
            <div style={{
              position: "absolute", top: "50%",
              left: `${alpha * 100}%`,
              transform: "translate(-50%,-50%)",
              pointerEvents: "none",
              width: 18, height: 18, borderRadius: "50%",
              background: `#${hex6}`,
              border: "2.5px solid #fff",
              boxShadow: "0 1px 6px rgba(0,0,0,0.55)",
            }} />
          </div>

          {/* Percentage display — click to type hex */}
          <div
            onClick={() => setShowHexInput(v => !v)}
            style={{
              flexShrink: 0,
              minWidth: 46, height: 28,
              borderRadius: 6,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 12, color: "rgba(220,225,235,0.9)", fontFamily: "monospace", fontWeight: 600 }}>
              {Math.round(alpha * 100)}%
            </span>
          </div>
        </div>

        {/* ── Hex input (shown on % click) ──────────────────────────────────── */}
        {showHexInput && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 5, flexShrink: 0,
              background: `#${hex6}`,
              border: "1px solid rgba(255,255,255,0.15)",
            }} />
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{
                position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
                fontSize: 11, color: "rgba(200,200,200,0.35)", fontFamily: "monospace",
                pointerEvents: "none", zIndex: 1,
              }}>#</span>
              <input
                ref={hexInputRef}
                value={hexIn}
                onChange={e => setHexIn(e.target.value.toUpperCase().replace(/[^0-9A-F]/g,"").slice(0,6))}
                onBlur={() => applyHexInput(hexIn)}
                onKeyDown={e => {
                  if (e.key === "Enter") { applyHexInput(hexIn); setShowHexInput(false); }
                  if (e.key === "Escape") setShowHexInput(false);
                  e.stopPropagation();
                }}
                onClick={e => e.stopPropagation()}
                maxLength={6}
                placeholder="FF9800"
                style={{
                  width: "100%", height: 30, paddingLeft: 22, borderRadius: 6,
                  boxSizing: "border-box",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "#f0f4f8", fontSize: 12, fontFamily: "monospace", fontWeight: 600,
                  outline: "none",
                }}
                onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.3)"; }}
                onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.14)"; }}
              />
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
});

export default ColorPickerGlass;
