import { memo, useState, useRef, useEffect, useCallback } from "react";
import binTrashUrl from "@/assets/bin-trash.svg?url";
import { usePopup } from "@/hooks/usePopup";
import { createPortal } from "react-dom";
import {
  X, Star, ChevronRight,
  Undo2, Redo2,
} from "lucide-react";
import { useDrawingStore } from "@/store/drawingStore";
import type { ToolType } from "@/types/drawing";
import { motion, AnimatePresence } from "motion/react";
import { AnimatedList, AnimatedListItem } from "@/components/animations";

import trendlineSvgUrl      from "@assets/trendline1_1780242299048.svg";
import raySvgUrl             from "@assets/ray1_1780242299093.svg";
import hlineSvgUrl           from "@assets/horizontalline1_1780242299153.svg";
import hraySvgUrl            from "@assets/horizontalray1_1780242299123.svg";
import vlineSvgUrl           from "@assets/verticalline1_1780242299183.svg";
import extendedSvgUrl        from "@assets/extendedline1_1780242299217.svg";
import parallelChannelSvgUrl from "@assets/parallelchannel1_1780242299247.svg";
import fibSvgUrl             from "@assets/fibonacci1_1780243582556.svg";
import fibChannelSvgUrl      from "@assets/fibchannel1_1780243582588.svg";
import zoomSvgUrl            from "@assets/zoom1_1780244291842.svg";
import scaleSvgUrl           from "@assets/scale1_1780245206496.svg";
import longPosSvgUrl         from "@assets/longposition1_1780247637052.svg";
import shortPosSvgUrl        from "@assets/shortposition1_1780247637032.svg";
import dateRangeSvgUrl       from "@assets/daterange1_1780247636983.svg";
import priceRangeSvgUrl      from "@assets/pricerange1_1780247637012.svg";
import textNewSvgUrl         from "@assets/text1_1780246000361.svg";
import noteSvgUrl            from "@assets/note1_1780245960632.svg";
import lockSvgUrl            from "@assets/lock1_1780244291888.svg";
import magnetSvgUrl          from "@assets/magnet1_1780244291924.svg";
import pencilLockSvgUrl      from "@assets/pencillock1_1780244291961.svg";
import eyeBrushSvgUrl        from "@assets/eyebrush1_1780244291990.svg";
import brushSvgUrl           from "@assets/brushnew1_1780251266199.svg";
import highlighterSvgUrl     from "@assets/highlighter1_1780251266178.svg";
import rectangleSvgUrl       from "@assets/rectangle1_1780251266157.svg";
import pathSvgUrl            from "@assets/path1_1780251266126.svg";
import circleBrushSvgUrl     from "@assets/circle1_1780251266093.svg";
import curveSvgUrl           from "@assets/curve1_1780251266030.svg";

// ── Color presets ─────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#B7FF5A", "#34d399", "#38bdf8", "#818cf8", "#f472b6",
  "#f59e0b", "#fb923c", "#f87171", "#e2e8f0", "#ffffff",
];
function hexToRgb(hex: string) {
  const c = hex.replace(/^#/, "");
  if (c.length !== 6) return null;
  const n = parseInt(c, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

// ── Unified icon system ───────────────────────────────────────────────────────
// Single visual standard: every icon renders at exactly ICON_PX × ICON_PX with
// the same brightness/contrast filter.  One factory, zero exceptions.
const ICON_PX     = 22;
const ICON_PX_LG  = 30; // padded assets: rendered larger so artwork fills the same visual space
const ICON_FILTER = "brightness(2) contrast(1.05)";
const S           = ICON_PX; // inline-SVG size — matches img icons exactly

/** Standard icon — for assets whose artwork fills the viewBox tightly */
function makeIcon(url: string, px = ICON_PX) {
  return function NormIcon(_: { c: string }) {
    return (
      <img
        src={url}
        width={px}
        height={px}
        style={{
          display: "block",
          userSelect: "none",
          pointerEvents: "none",
          imageRendering: "crisp-edges",
          filter: ICON_FILTER,
        }}
      />
    );
  };
}

/** Large icon — for assets that have heavy internal padding/whitespace baked in */
const makeIconLg = (url: string) => makeIcon(url, ICON_PX_LG);

// ── Asset-based icons ─────────────────────────────────────────────────────────
// Tight-artwork assets → standard 22px
const IcoTrendline     = makeIcon(trendlineSvgUrl);
const IcoRayLine       = makeIcon(raySvgUrl);
const IcoExtendedLine  = makeIcon(extendedSvgUrl);
const IcoHLine         = makeIcon(hlineSvgUrl);
const IcoHRay          = makeIcon(hraySvgUrl);
const IcoVLine         = makeIcon(vlineSvgUrl);
const IcoChannel       = makeIcon(parallelChannelSvgUrl);
const IcoZoomSvg       = makeIcon(zoomSvgUrl);
const IcoScaleSvg      = makeIcon(scaleSvgUrl);
const IcoLongPosSvg    = makeIconLg(longPosSvgUrl);
const IcoShortPosSvg   = makeIconLg(shortPosSvgUrl);
const IcoDateRangeSvg  = makeIcon(dateRangeSvgUrl);
const IcoPriceRangeSvg = makeIcon(priceRangeSvgUrl);
const IcoTextNewSvg    = makeIcon(textNewSvgUrl);
const IcoNoteSvg       = makeIcon(noteSvgUrl);
const IcoLockSvg       = makeIcon(lockSvgUrl);
const IcoMagnetSvg     = makeIcon(magnetSvgUrl);
const IcoPencilLockSvg = makeIcon(pencilLockSvgUrl);
const IcoEyeBrushSvg   = makeIcon(eyeBrushSvgUrl);
const IcoHighlighterSvg= makeIcon(highlighterSvgUrl);
const IcoRectangleSvg  = makeIcon(rectangleSvgUrl);
const IcoPathSvg       = makeIcon(pathSvgUrl);
const IcoCircleBrushSvg= makeIcon(circleBrushSvgUrl);
const IcoCurveSvg      = makeIcon(curveSvgUrl);
// Padded-artwork assets → 32px so the actual artwork reaches the same visual size
const IcoFibSvg        = makeIconLg(fibSvgUrl);
const IcoFibChannelSvg = makeIconLg(fibChannelSvgUrl);
const IcoBrushSvg      = makeIconLg(brushSvgUrl);

/** Cursor: crosshair with arrows */
function IcoCursor({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <line x1="10" y1="2"  x2="10" y2="8"  stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="12" x2="10" y2="18" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="2"  y1="10" x2="8"  y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="10" x2="18" y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="7.5" y="7.5" width="5" height="5" rx="1" stroke={c} strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

/** Fib retracement: 3 horizontal parallel lines (like TV) */
function IcoFib({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <line x1="3" y1="5"  x2="17" y2="5"  stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="3" y1="10" x2="17" y2="10" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="3" y1="15" x2="17" y2="15" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      {/* Small circle connectors on left */}
      <circle cx="3" cy="5"  r="1.5" fill={c}/>
      <circle cx="3" cy="10" r="1.5" fill={c}/>
      <circle cx="3" cy="15" r="1.5" fill={c}/>
      <line x1="3" y1="5" x2="3" y2="15" stroke={c} strokeWidth="1.2" strokeOpacity="0.5"/>
    </svg>
  );
}

/** Channels/Patterns: network of nodes like TV */
function IcoChannels({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      {/* 4 nodes connected */}
      <circle cx="4"  cy="10" r="2" stroke={c} strokeWidth="1.3" fill="none"/>
      <circle cx="10" cy="4"  r="2" stroke={c} strokeWidth="1.3" fill="none"/>
      <circle cx="16" cy="10" r="2" stroke={c} strokeWidth="1.3" fill="none"/>
      <circle cx="10" cy="16" r="2" stroke={c} strokeWidth="1.3" fill="none"/>
      <line x1="6"  y1="10" x2="8"  y2="10" stroke={c} strokeWidth="1.2" strokeDasharray="1 1"/>
      <line x1="12" y1="10" x2="14" y2="10" stroke={c} strokeWidth="1.2" strokeDasharray="1 1"/>
      <line x1="10" y1="6"  x2="10" y2="8"  stroke={c} strokeWidth="1.2" strokeDasharray="1 1"/>
      <line x1="10" y1="12" x2="10" y2="14" stroke={c} strokeWidth="1.2" strokeDasharray="1 1"/>
    </svg>
  );
}

/** Position/Measure: ⊢ style — price range ruler */
function IcoMeasure({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      {/* Vertical axis */}
      <line x1="4" y1="3" x2="4" y2="17" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      {/* Two horizontal ticks */}
      <line x1="4" y1="6"  x2="16" y2="6"  stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="4" y1="14" x2="16" y2="14" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      {/* Short horizontal at ends */}
      <line x1="14" y1="4.5" x2="14" y2="7.5"  stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="14" y1="12.5" x2="14" y2="15.5" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

/** Brush: diagonal brush stroke like TV */
function IcoBrush({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      {/* Brush handle */}
      <line x1="5" y1="15" x2="15" y2="5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      {/* Brush tip wider */}
      <path d="M3.5 16.5 C4 15 5 14.5 6.5 15.5 C5.5 17 4 17.5 3.5 16.5Z" stroke={c} strokeWidth="1.1" fill="none"/>
      {/* Highlight diagonal marks */}
      <line x1="9"  y1="11" x2="12" y2="8"  stroke={c} strokeWidth="1.1" strokeOpacity="0.5" strokeLinecap="round"/>
    </svg>
  );
}

/** Text: T with serif-style crossbar */
function IcoText({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <line x1="4"  y1="5"  x2="16" y2="5"  stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="5"  x2="10" y2="16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7"  y1="16" x2="13" y2="16" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6"/>
    </svg>
  );
}

/** Shapes/Annotations: smiley face like TV */
function IcoShapes({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.5" stroke={c} strokeWidth="1.4" fill="none"/>
      <circle cx="7.5" cy="8.5" r="1" fill={c}/>
      <circle cx="12.5" cy="8.5" r="1" fill={c}/>
      <path d="M7 12.5 C8 14.5 12 14.5 13 12.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

/** Ruler: diagonal ruler with tick marks */
function IcoRuler({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      {/* Main ruler bar, diagonal */}
      <rect x="2.5" y="7" width="15" height="6" rx="1.5" transform="rotate(-35 10 10)" stroke={c} strokeWidth="1.3" fill="none"/>
      {/* Tick marks inside */}
      <line x1="6.5"  y1="8.5"  x2="6.5"  y2="11.5" stroke={c} strokeWidth="1.1" strokeLinecap="round" transform="rotate(-35 10 10)"/>
      <line x1="10"   y1="8.5"  x2="10"   y2="11.5"  stroke={c} strokeWidth="1.1" strokeLinecap="round" transform="rotate(-35 10 10)"/>
      <line x1="13.5" y1="8.5"  x2="13.5" y2="11.5" stroke={c} strokeWidth="1.1" strokeLinecap="round" transform="rotate(-35 10 10)"/>
    </svg>
  );
}

/** Zoom: magnifier with + */
function IcoZoom({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <circle cx="9" cy="9" r="5.5" stroke={c} strokeWidth="1.4" fill="none"/>
      <line x1="13.5" y1="13.5" x2="17.5" y2="17.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="9" x2="11" y2="9" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="9" y1="7" x2="9" y2="11" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

/** Magnet: U-shape with poles */
function IcoMagnet({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <path d="M5 4 L5 11 A5 5 0 0 0 15 11 L15 4" stroke={c} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <line x1="3" y1="4" x2="7"  y2="4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="13" y1="4" x2="17" y2="4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

/** Pencil-Lock: lock drawing mode (pencil with small lock) */
function IcoPencilLock({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      {/* Pencil */}
      <path d="M3 15 L4 12 L12 4 L16 8 L8 16 Z" stroke={c} strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
      <line x1="10" y1="6" x2="14" y2="10" stroke={c} strokeWidth="1.1" strokeOpacity="0.5"/>
      {/* Mini lock bottom right */}
      <rect x="12.5" y="14" width="5" height="4" rx="1" stroke={c} strokeWidth="1.1" fill="none"/>
      <path d="M13.5 14 L13.5 13 A1.5 1.5 0 0 1 16.5 13 L16.5 14" stroke={c} strokeWidth="1.1" fill="none"/>
    </svg>
  );
}

/** Lock: padlock */
function IcoLock({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <rect x="4" y="9" width="12" height="9" rx="2" stroke={c} strokeWidth="1.4" fill="none"/>
      <path d="M7 9 L7 6 A3 3 0 0 1 13 6 L13 9" stroke={c} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      <circle cx="10" cy="14" r="1.2" fill={c}/>
    </svg>
  );
}

/** Eye with slash: hide all */
function IcoHide({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <path d="M2 10 C5 5 15 5 18 10 C15 15 5 15 2 10Z" stroke={c} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      <circle cx="10" cy="10" r="2.5" stroke={c} strokeWidth="1.3" fill="none"/>
      <line x1="3.5" y1="3.5" x2="16.5" y2="16.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

/** Eye: show all */
function IcoEye({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <path d="M2 10 C5 5 15 5 18 10 C15 15 5 15 2 10Z" stroke={c} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      <circle cx="10" cy="10" r="2.5" stroke={c} strokeWidth="1.3" fill="none"/>
    </svg>
  );
}

/** Trash */
function IcoTrash(_: { c: string }) {
  return (
    <img
      src={binTrashUrl}
      width={S}
      height={S}
      style={{ width: S, height: S, display: "block", filter: "brightness(0) invert(1)" }}
      alt="Remove all drawings"
      draggable={false}
    />
  );
}

/** Fib channel */
function IcoFibChannel({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <line x1="2" y1="4"  x2="18" y2="4"  stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="2" y1="8"  x2="18" y2="8"  stroke={c} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="3 2" strokeOpacity="0.85"/>
      <line x1="2" y1="11" x2="18" y2="11" stroke={c} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="3 2" strokeOpacity="0.75"/>
      <line x1="2" y1="13" x2="18" y2="13" stroke={c} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="3 2" strokeOpacity="0.65"/>
      <line x1="2" y1="16" x2="18" y2="16" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="2"  cy="4"  r="1.3" fill={c}/>
      <circle cx="2"  cy="16" r="1.3" fill={c}/>
    </svg>
  );
}

/** Long position — 2 lines (TP top / SL bottom), circle anchors left, "L" centered */
function IcoLong({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <circle cx="2.8" cy="6"   r="1.4" fill={c} />
      <line x1="4.8" y1="6"   x2="17" y2="6"   stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="2.8" cy="14"  r="1.4" fill={c} />
      <line x1="4.8" y1="14"  x2="17" y2="14"  stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <text x="11.5" y="11.8" textAnchor="middle" fontSize="6.5" fontWeight="800"
        fill={c} fontFamily="ui-monospace,monospace">L</text>
    </svg>
  );
}

/** Short position — 2 lines (TP top / SL bottom), circle anchors left, "S" centered */
function IcoShort2({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <circle cx="2.8" cy="6"   r="1.4" fill={c} />
      <line x1="4.8" y1="6"   x2="17" y2="6"   stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="2.8" cy="14"  r="1.4" fill={c} />
      <line x1="4.8" y1="14"  x2="17" y2="14"  stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <text x="11.5" y="11.8" textAnchor="middle" fontSize="6.5" fontWeight="800"
        fill={c} fontFamily="ui-monospace,monospace">S</text>
    </svg>
  );
}

/** Rectangle */
function IcoRect({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <rect x="3" y="5" width="14" height="10" rx="1" stroke={c} strokeWidth="1.4" fill="none"/>
      <circle cx="3"  cy="5"  r="1.4" fill={c}/>
      <circle cx="17" cy="5"  r="1.4" fill={c}/>
      <circle cx="3"  cy="15" r="1.4" fill={c}/>
      <circle cx="17" cy="15" r="1.4" fill={c}/>
    </svg>
  );
}

/** Circle */
function IcoCircle({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.5" stroke={c} strokeWidth="1.4" fill="none"/>
      <circle cx="10" cy="2.5" r="1.4" fill={c}/>
      <circle cx="17.5" cy="10" r="1.4" fill={c}/>
      <circle cx="10" cy="17.5" r="1.4" fill={c}/>
      <circle cx="2.5" cy="10" r="1.4" fill={c}/>
    </svg>
  );
}

/** Arrow */
function IcoArrow({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <line x1="4" y1="16" x2="16" y2="4" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <polyline points="9,4 16,4 16,11" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

/** Anchor / Stay-in-draw */
function IcoAnchor({ c }: { c: string }) {
  return (
    <svg width={S} height={S} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="5.5" r="2" stroke={c} strokeWidth="1.4" fill="none"/>
      <line x1="10" y1="7.5" x2="10" y2="17" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M5 12 A5 5 0 0 0 15 12" stroke={c} strokeWidth="1.3" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

/** Palette dot for color picker button */
function IcoDot({ color }: { color: string }) {
  return (
    <div style={{ width:20, height:20, borderRadius:"50%", background:color, boxShadow:`0 0 7px ${color}80`, border:"1.5px solid rgba(255,255,255,0.18)" }} />
  );
}

// ── Tool system ───────────────────────────────────────────────────────────────
type IcoComp = React.ComponentType<{ c: string }>;

interface ToolDef {
  key:      string;
  realType: ToolType;
  Icon:     IcoComp;
  label:    string;
  shortcut?: string;
}
interface ToolSection { title: string; tools: ToolDef[]; }
interface GroupDef {
  id:         string;
  Icon:       IcoComp;
  label:      string;
  defaultType:ToolType;
  defaultKey: string;
  sections:   ToolSection[];
}

// Groups (no duplicates):
// 1. Lines — trendline, ray, extended, hline, vline, channel
// 2. Fibonacci — fib retracement, extension, fan
// 3. Forecast/Measure — long/short position, price range ruler
// 4. Text
// 5. Shapes — rectangle, circle, arrow
const GROUPS: GroupDef[] = [
  {
    id:"lines", Icon:IcoTrendline, label:"Lines", defaultType:"trendline", defaultKey:"trendline",
    sections:[
      { title:"LINES", tools:[
        { key:"trendline", realType:"trendline", Icon:IcoTrendline, label:"Trendline",        shortcut:"Alt+T" },
        { key:"ray",       realType:"ray",        Icon:IcoRayLine,       label:"Ray" },
        { key:"extended",  realType:"extended",   Icon:IcoExtendedLine,  label:"Extended line" },
        { key:"hline",     realType:"hline",      Icon:IcoHLine,     label:"Horizontal line",  shortcut:"Alt+H" },
        { key:"hray",      realType:"hray",       Icon:IcoHRay,      label:"Horizontal ray" },
        { key:"vline",     realType:"vline",      Icon:IcoVLine,     label:"Vertical line",    shortcut:"Alt+V" },
      ]},
      { title:"CHANNELS", tools:[
        { key:"channel", realType:"channel", Icon:IcoChannel, label:"Parallel channel" },
      ]},
    ],
  },
  {
    id:"fib", Icon:IcoFibSvg, label:"Fibonacci", defaultType:"fib", defaultKey:"fib",
    sections:[
      { title:"FIBONACCI", tools:[
        { key:"fib",         realType:"fib",         Icon:IcoFibSvg,        label:"Fib retracement", shortcut:"Alt+F" },
        { key:"fib_channel", realType:"fib_channel", Icon:IcoFibChannelSvg, label:"Fib channel" },
      ]},
    ],
  },
  {
    id:"forecast", Icon:IcoLongPosSvg, label:"Forecast & Measure", defaultType:"position_long", defaultKey:"position_long",
    sections:[
      { title:"FORECASTING", tools:[
        { key:"position_long",  realType:"position_long",  Icon:IcoLongPosSvg,   label:"Long position" },
        { key:"position_short", realType:"position_short", Icon:IcoShortPosSvg,  label:"Short position" },
      ]},
      { title:"MEASURERS", tools:[
        { key:"date_range",  realType:"date_range",  Icon:IcoDateRangeSvg,  label:"Date Range" },
        { key:"price_range", realType:"price_range", Icon:IcoPriceRangeSvg, label:"Price Range" },
      ]},
    ],
  },
  {
    id:"text", Icon:IcoTextNewSvg, label:"Text", defaultType:"text", defaultKey:"text",
    sections:[
      { title:"TEXT AND NOTES", tools:[
        { key:"text", realType:"text", Icon:IcoTextNewSvg, label:"Text", shortcut:"Alt+X" },
        { key:"note", realType:"note", Icon:IcoNoteSvg,    label:"Note" },
      ]},
    ],
  },
  {
    id:"brushes_shapes", Icon:IcoBrushSvg, label:"Brushes & Shapes", defaultType:"brush", defaultKey:"brush_brush",
    sections:[
      { title:"BRUSHES", tools:[
        { key:"brush_brush",       realType:"brush",       Icon:IcoBrushSvg,      label:"Brush" },
        { key:"brush_highlighter", realType:"highlighter", Icon:IcoHighlighterSvg, label:"Highlighter" },
        { key:"brush_arrow",       realType:"arrow",       Icon:IcoArrow,          label:"Arrow" },
      ]},
      { title:"SHAPES", tools:[
        { key:"shape_rect",   realType:"rect",    Icon:IcoRectangleSvg,   label:"Rectangle" },
        { key:"shape_path",   realType:"path",    Icon:IcoPathSvg,        label:"Path" },
        { key:"shape_circle", realType:"ellipse", Icon:IcoCircleBrushSvg, label:"Circle" },
        { key:"shape_curve",  realType:"curve",   Icon:IcoCurveSvg,       label:"Curve" },
      ]},
    ],
  },
];

const ALL_TOOLS: ToolDef[] = GROUPS.flatMap(g => g.sections.flatMap(s => s.tools));

const FAVS_KEY = "tv_toolbar_favorites_v3";
const LAST_KEY = "tv_toolbar_last_v3";
const AKEY_KEY = "tv_toolbar_activekey_v3";

function loadFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAVS_KEY) ?? "[]")); } catch { return new Set(); }
}
function saveFavs(s: Set<string>) { localStorage.setItem(FAVS_KEY, JSON.stringify([...s])); }
function loadLast(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}"); } catch { return {}; }
}
function saveLast(r: Record<string, string>) { localStorage.setItem(LAST_KEY, JSON.stringify(r)); }

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position:"relative" }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position:"absolute", left:60, top:"50%", transform:"translateY(-50%)",
          zIndex:90, pointerEvents:"none", whiteSpace:"nowrap",
          background:"rgba(8,8,8,0.97)", border:"1px solid rgba(60,60,60,0.55)",
          borderRadius:7, padding:"4px 10px",
          fontSize:12, fontWeight:600, color:"#F3FFF3",
          boxShadow:"4px 2px 18px rgba(0,0,0,0.75)",
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

// ── Style Flyout ──────────────────────────────────────────────────────────────
function StyleFlyout({ anchorRect, onClose }: { anchorRect: DOMRect; onClose: () => void }) {
  const { activeStyle, setActiveStyle } = useDrawingStore();
  const ref = useRef<HTMLDivElement>(null);
  const [hexInput, setHexInput] = useState(activeStyle.color.replace(/^#/, "").toUpperCase());
  const [hexError, setHexError] = useState(false);

  usePopup("toolbar-style-flyout", ref, onClose);

  useEffect(() => {
    setHexInput(activeStyle.color.replace(/^#/, "").toUpperCase());
    setHexError(false);
  }, [activeStyle.color]);

  const applyHex = (raw: string) => {
    const c = raw.replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(c)) { setActiveStyle({ color:`#${c.toUpperCase()}` }); setHexError(false); }
    else setHexError(true);
  };
  const rgb = hexToRgb(activeStyle.color);
  const setRgbCh = (ch:"r"|"g"|"b", val:number) => {
    if (!rgb) return;
    const next = { ...rgb, [ch]:Math.max(0,Math.min(255,val)) };
    const hex = rgbToHex(next.r,next.g,next.b);
    setActiveStyle({ color:hex });
    setHexInput(hex.replace("#","").toUpperCase());
  };

  const POPUP_H = 390;
  const left = anchorRect.right + 8;
  const top = Math.min(Math.max(anchorRect.top, 8), window.innerHeight - POPUP_H - 8);

  return createPortal(
    <motion.div
      ref={ref}
      data-drawing-popup
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -5 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{
        position:"fixed", left, top, zIndex:9999,
        width:224, background:"rgba(10,10,10,0.98)", backdropFilter:"blur(28px)",
        border:"1px solid rgba(60,60,60,0.45)", borderRadius:12,
        boxShadow:"12px 8px 48px rgba(0,0,0,0.9)",
      }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 13px 7px" }}>
        <span style={{ fontSize:10, fontWeight:800, color:"rgba(200,200,200,0.4)", textTransform:"uppercase", letterSpacing:".1em" }}>Style</span>
        <button onClick={onClose} style={{ cursor:"pointer", display:"flex", opacity:0.4, background:"none", border:"none" }}>
          <X style={{ width:11, height:11, color:"#ccc" }} />
        </button>
      </div>
      <div style={{ height:1, background:"rgba(255,255,255,0.07)", marginBottom:10 }} />
      <div style={{ padding:"0 13px 10px" }}>
        <p style={{ fontSize:9, color:"rgba(200,200,200,0.38)", marginBottom:7, textTransform:"uppercase", letterSpacing:".07em", fontWeight:700 }}>Color</p>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <div style={{ width:26, height:26, borderRadius:7, flexShrink:0, background:activeStyle.color, border:"1px solid rgba(255,255,255,0.12)", boxShadow:`0 0 10px ${activeStyle.color}60` }} />
          <div style={{ position:"relative", flex:1 }}>
            <span style={{ position:"absolute", left:7, top:"50%", transform:"translateY(-50%)", fontSize:10, color:"rgba(200,200,200,0.3)", fontFamily:"monospace" }}>#</span>
            <input value={hexInput}
              onChange={e => { setHexInput(e.target.value.toUpperCase().slice(0,6)); setHexError(false); }}
              onBlur={() => applyHex(hexInput)} onKeyDown={e => { if(e.key==="Enter")applyHex(hexInput); }}
              maxLength={6} style={{ width:"100%", height:26, paddingLeft:18, paddingRight:6, borderRadius:7, background:hexError?"rgba(239,68,68,0.1)":"rgba(28,28,28,0.9)", border:`1px solid ${hexError?"rgba(239,68,68,0.5)":"rgba(60,60,60,0.6)"}`, color:"#F3FFF3", fontSize:12, fontFamily:"monospace", fontWeight:700, outline:"none" }} />
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5, marginBottom:12 }}>
          {PRESET_COLORS.map(col => {
            const act = activeStyle.color.toUpperCase()===col.toUpperCase();
            return <button key={col} onClick={() => setActiveStyle({ color:col })} style={{ height:22, borderRadius:5, background:col, cursor:"pointer", border:act?"2px solid rgba(255,255,255,0.9)":"2px solid transparent", boxShadow:act?`0 0 8px ${col}90`:"none", transition:"all .1s" }} />;
          })}
        </div>
        {rgb && (
          <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:8 }}>
            {(["r","g","b"] as const).map((ch,i) => {
              const colors=[["#111","#f87171"],["#111","#34d399"],["#111","#38bdf8"]];
              return (
                <div key={ch} style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <span style={{ width:10, fontSize:9, fontWeight:800, color:"rgba(200,200,200,0.38)", textTransform:"uppercase", flexShrink:0 }}>{ch}</span>
                  <div style={{ flex:1, position:"relative", height:14, display:"flex", alignItems:"center" }}>
                    <div style={{ width:"100%", height:4, borderRadius:4, background:`linear-gradient(to right,${colors[i][0]},${colors[i][1]})`, position:"absolute" }} />
                    <input type="range" min={0} max={255} value={rgb[ch]} onChange={e=>setRgbCh(ch,parseInt(e.target.value))} style={{ width:"100%", position:"relative", accentColor:colors[i][1], margin:0, height:4, cursor:"pointer" }} />
                  </div>
                  <input type="number" min={0} max={255} value={rgb[ch]} onChange={e=>setRgbCh(ch,parseInt(e.target.value)||0)} style={{ width:30, height:20, borderRadius:5, textAlign:"center", background:"rgba(22,22,22,0.9)", border:"1px solid rgba(60,60,60,0.5)", color:"#F3FFF3", fontSize:9, fontFamily:"monospace", fontWeight:700, outline:"none" }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ height:1, background:"rgba(255,255,255,0.06)", marginBottom:10 }} />
      <div style={{ padding:"0 13px 10px" }}>
        <p style={{ fontSize:9, color:"rgba(200,200,200,0.38)", marginBottom:7, textTransform:"uppercase", letterSpacing:".07em", fontWeight:700 }}>Thickness</p>
        <div style={{ display:"flex", gap:4 }}>
          {[1,2,3,4,5].map(t => {
            const act=activeStyle.thickness===t;
            return <button key={t} onClick={() => setActiveStyle({ thickness:t })} style={{ flex:1, height:32, borderRadius:6, cursor:"pointer", background:act?"rgba(183,255,90,0.1)":"rgba(35,35,35,0.8)", border:`1px solid ${act?"rgba(183,255,90,0.5)":"rgba(60,60,60,0.4)"}`, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .1s" }}>
              <div style={{ width:"82%", height:Math.max(t + 1, 2), background:act?"#B7FF5A":"rgba(210,210,210,0.85)", borderRadius:t }} />
            </button>;
          })}
        </div>
      </div>
      <div style={{ height:1, background:"rgba(255,255,255,0.06)", marginBottom:10 }} />
      <div style={{ padding:"0 13px 14px" }}>
        <p style={{ fontSize:9, color:"rgba(200,200,200,0.38)", marginBottom:7, textTransform:"uppercase", letterSpacing:".07em", fontWeight:700 }}>Line Style</p>
        <div style={{ display:"flex", gap:4 }}>
          {(["solid","dashed","dotted"] as const).map(ls => {
            const act=activeStyle.lineStyle===ls;
            return <button key={ls} onClick={() => setActiveStyle({ lineStyle:ls })} style={{ flex:1, height:26, borderRadius:6, cursor:"pointer", background:act?"rgba(183,255,90,0.1)":"rgba(35,35,35,0.8)", border:`1px solid ${act?"rgba(183,255,90,0.5)":"rgba(60,60,60,0.4)"}`, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .1s" }}>
              <svg width={28} height={6}><line x1={0} y1={3} x2={28} y2={3} stroke={act?"#B7FF5A":"rgba(170,170,170,0.5)"} strokeWidth={1.5} strokeDasharray={ls==="dashed"?"6 3":ls==="dotted"?"1.5 3":undefined} strokeLinecap="round"/></svg>
            </button>;
          })}
        </div>
      </div>
    </motion.div>,
    document.body
  );
}

// ── Tool Row ──────────────────────────────────────────────────────────────────
function ToolRow({ tool, activeToolKey, favorites, onSelect, onToggleFav }: {
  tool:ToolDef; activeToolKey:string; favorites:Set<string>;
  onSelect:(t:ToolDef)=>void; onToggleFav:(key:string)=>void;
}) {
  const act  = activeToolKey===tool.key;
  const fav  = favorites.has(tool.key);
  const [hov, setHov] = useState(false);
  const ic = act?"#B7FF5A":"rgba(255,255,255,0.72)";
  return (
    <div
      style={{ display:"flex", alignItems:"center", height:38, paddingLeft:12, paddingRight:10, background:act?"rgba(183,255,90,0.08)":hov?"rgba(183,255,90,0.05)":"transparent", transition:"background .1s", cursor:"pointer" }}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
    >
      <button onClick={()=>onSelect(tool)} style={{ flex:1, display:"flex", alignItems:"center", gap:10, border:"none", background:"transparent", cursor:"pointer", textAlign:"left", padding:0, minWidth:0 }}>
        <div style={{ width:24, height:24, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
          <tool.Icon c={ic} />
        </div>
        <span style={{ flex:1, fontSize:13, fontWeight:act?700:500, color:act?"#B7FF5A":"#ffffff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", lineHeight:1 }}>{tool.label}</span>
        {tool.shortcut && (
          <span style={{ fontSize:10, fontWeight:500, color:"rgba(255,255,255,0.45)", letterSpacing:"0.02em", flexShrink:0, marginRight:4 }}>{tool.shortcut}</span>
        )}
      </button>
      <button onClick={e=>{e.stopPropagation();onToggleFav(tool.key);}}
        style={{ width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:5, background:"transparent", border:"none", cursor:"pointer", flexShrink:0, transition:"opacity .15s" }}>
        <Star style={{ width:13, height:13, color:fav?"#f59e0b":hov?"rgba(255,255,255,0.7)":"rgba(255,255,255,0.3)", fill:fav?"#f59e0b":"none", stroke:fav?"#f59e0b":hov?"rgba(255,255,255,0.7)":"rgba(255,255,255,0.3)" }} />
      </button>
    </div>
  );
}

// ── Tool Popup ────────────────────────────────────────────────────────────────
function ToolPopup({ group, activeToolKey, favorites, anchorRect, onSelect, onToggleFav, onClose }: {
  group:GroupDef; activeToolKey:string; favorites:Set<string>; anchorRect:DOMRect;
  onSelect:(t:ToolDef)=>void; onToggleFav:(key:string)=>void; onClose:()=>void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePopup("toolbar-tool-popup", ref, onClose);

  const left = anchorRect.right + 8;
  const maxTop = window.innerHeight - 60;
  const top = Math.min(Math.max(anchorRect.top, 8), maxTop);

  const content = (
    <motion.div
      ref={ref}
      data-drawing-popup
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      initial={{ opacity: 0, x: -6, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -6, scale: 0.97 }}
      transition={{ duration: 0.11, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position:"fixed", left, top, zIndex:9999, width:230,
        background:"rgba(7,17,13,0.97)",
        backdropFilter:"blur(28px)", WebkitBackdropFilter:"blur(28px)",
        border:"1px solid rgba(183,255,90,0.13)", borderRadius:10,
        boxShadow:"0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(183,255,90,0.05)",
        overflow:"hidden",
      }}>
      <div style={{ overflowY:"auto", maxHeight:"68vh", scrollbarWidth:"none", padding:"4px 0 6px" }}>
        <AnimatedList>
          {group.sections.map((sec, si) => (
            <AnimatedListItem key={sec.title}>
              <div key={sec.title}>
                {si>0 && <div style={{ height:1, background:"rgba(183,255,90,0.07)", margin:"3px 0" }} />}
                <div style={{ padding:"6px 12px 2px" }}>
                  <span style={{ fontSize:9, fontWeight:800, color:"rgba(167,184,169,0.38)", textTransform:"uppercase", letterSpacing:"0.09em" }}>{sec.title}</span>
                </div>
                {sec.tools.map(tool => <ToolRow key={tool.key} tool={tool} activeToolKey={activeToolKey} favorites={favorites} onSelect={onSelect} onToggleFav={onToggleFav} />)}
              </div>
            </AnimatedListItem>
          ))}
        </AnimatedList>
      </div>
    </motion.div>
  );
  return createPortal(content, document.body);
}

// ── Draggable Favorites Bar ────────────────────────────────────────────────────
const FAV_POS_KEY = "tv_fav_bar_pos";

function loadFavPos(): { x: number; y: number } | null {
  try {
    const s = localStorage.getItem(FAV_POS_KEY);
    return s ? JSON.parse(s) as { x: number; y: number } : null;
  } catch { return null; }
}

function FavoritesBar({ tools, activeToolKey, onSelect, onToggleFav }: {
  tools:ToolDef[]; activeToolKey:string;
  onSelect:(t:ToolDef)=>void; onToggleFav:(key:string)=>void;
}) {
  const barRef      = useRef<HTMLDivElement>(null);
  const posRef      = useRef<{ x: number; y: number } | null>(null);
  const dragState   = useRef<{ startX: number; startY: number; origX: number; origY: number; pointerId: number } | null>(null);
  const rafRef      = useRef<number | null>(null);
  const isDragging  = useRef(false);

  // ── Position init ────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadFavPos();
    if (saved) {
      posRef.current = saved;
    } else {
      const barW = 56 + tools.length * 44 + 24;
      posRef.current = { x: (window.innerWidth - barW) / 2, y: window.innerHeight - 80 };
    }
    if (barRef.current) {
      barRef.current.style.transform = `translate3d(${posRef.current.x}px,${posRef.current.y}px,0)`;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const applyPos = useCallback((x: number, y: number) => {
    const el = barRef.current;
    if (!el) return;
    const cx = Math.max(0, Math.min(x, window.innerWidth  - el.offsetWidth));
    const cy = Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight));
    posRef.current = { x: cx, y: cy };
    el.style.transform = `translate3d(${cx}px,${cy}px,0)`;
  }, []);

  // ── Pointer handlers (attached to the bar for wide capture) ──────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = barRef.current;
    if (!el) return;

    // Hit-test: only start drag when pointer is in the left 20% of the bar
    const rect = el.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (localX > rect.width * 0.20) return; // outside drag zone — let button clicks through

    e.preventDefault();
    e.stopPropagation();
    // Capture pointer on the bar so we never lose it mid-drag
    el.setPointerCapture(e.pointerId);
    isDragging.current = false;

    const pos = posRef.current ?? { x: 0, y: 0 };
    dragState.current = {
      startX: e.clientX, startY: e.clientY,
      origX: pos.x, origY: pos.y,
      pointerId: e.pointerId,
    };
    // Switch cursor immediately
    el.style.cursor = "grabbing";
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || dragState.current.pointerId !== e.pointerId) return;
    const { startX, startY, origX, origY } = dragState.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Require a minimum 3px movement to commit to dragging (prevents accidental
    // drags on taps that land in the zone)
    if (!isDragging.current && Math.hypot(dx, dy) < 3) return;
    isDragging.current = true;

    e.preventDefault();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      applyPos(origX + dx, origY + dy);
    });
  }, [applyPos]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || dragState.current.pointerId !== e.pointerId) return;
    dragState.current = null;
    isDragging.current = false;
    if (barRef.current) barRef.current.style.cursor = "";
    if (posRef.current) {
      try { localStorage.setItem(FAV_POS_KEY, JSON.stringify(posRef.current)); } catch { /* ignore */ }
    }
  }, []);

  return createPortal(
    <motion.div
      ref={barRef}
      data-drawing-popup
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{
        position:"fixed", top:0, left:0,
        transform:"translate3d(0px,0px,0)",
        zIndex:800,
        display:"flex", alignItems:"center", gap:2,
        padding:"5px 8px",
        background:"rgba(30,32,38,0.97)",
        backdropFilter:"blur(20px)",
        WebkitBackdropFilter:"blur(20px)",
        borderRadius:10,
        border:"1px solid rgba(255,255,255,0.09)",
        boxShadow:"0 4px 24px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset",
        pointerEvents:"all",
        userSelect:"none",
        touchAction:"none",
        willChange:"transform",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Grip dots — visual cue for the drag zone (left ~20%) */}
      <div
        style={{
          display:"flex", alignItems:"center", flexShrink:0,
          paddingRight:7, marginRight:1,
          borderRight:"1px solid rgba(255,255,255,0.08)",
          cursor:"grab",
          // Extra invisible padding so the visual grip area matches the 20% touch zone
          paddingLeft:4,
        }}
      >
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:3, padding:"2px 1px" }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ width:3, height:3, borderRadius:"50%", background:"rgba(255,255,255,0.35)" }} />
          ))}
        </div>
      </div>
      {tools.map(tool => (
        <FavBtn key={tool.key} tool={tool} active={activeToolKey===tool.key} onSelect={onSelect} onToggleFav={onToggleFav} />
      ))}
    </motion.div>,
    document.body
  );
}

function FavBtn({ tool, active, onSelect, onToggleFav }: {
  tool:ToolDef; active:boolean; onSelect:(t:ToolDef)=>void; onToggleFav:(key:string)=>void;
}) {
  const [hov, setHov] = useState(false);
  const ic = active?"#B7FF5A":hov?"#d4ffda":"rgba(183,220,190,0.85)";
  return (
    <div style={{ position:"relative", flexShrink:0 }}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <button onClick={()=>onSelect(tool)} style={{
        width:36, height:36, borderRadius:7,
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor:"pointer", outline:"none",
        background:active?"rgba(183,255,90,0.13)":hov?"rgba(255,255,255,0.08)":"transparent",
        border:`1px solid ${active?"rgba(183,255,90,0.28)":hov?"rgba(255,255,255,0.1)":"transparent"}`,
        transition:"all .12s ease",
      }}
        onPointerDown={e=>{(e.currentTarget as HTMLElement).style.transform="scale(0.91)";}}
        onPointerUp={e=>{(e.currentTarget as HTMLElement).style.transform="scale(1)";}}
        onPointerLeave={e=>{(e.currentTarget as HTMLElement).style.transform="scale(1)";}}
      >
        <tool.Icon c={ic} />
      </button>
      {/* Tooltip — above the button */}
      {hov && (
        <div style={{
          position:"absolute", bottom:"calc(100% + 7px)", left:"50%",
          transform:"translateX(-50%)",
          zIndex:900, pointerEvents:"none", whiteSpace:"nowrap",
          background:"rgba(18,18,22,0.97)", border:"1px solid rgba(255,255,255,0.1)",
          borderRadius:6, padding:"4px 9px",
          fontSize:11, fontWeight:600, color:"#e8e8e8",
          boxShadow:"0 4px 14px rgba(0,0,0,0.6)",
        }}>
          {tool.label}
        </div>
      )}
      {/* Star to unfavorite */}
      {hov && (
        <button onClick={e=>{e.stopPropagation();onToggleFav(tool.key);}} style={{
          position:"absolute", top:-3, right:-3, zIndex:10, width:14, height:14, borderRadius:"50%",
          display:"flex", alignItems:"center", justifyContent:"center",
          background:"rgba(15,15,15,0.95)", border:"1px solid rgba(245,158,11,0.6)",
          cursor:"pointer", padding:0, outline:"none",
        }}>
          <Star style={{ width:8, height:8, color:"#f59e0b", fill:"#f59e0b" }} />
        </button>
      )}
    </div>
  );
}

// ── Main DrawingToolbar ───────────────────────────────────────────────────────
const DrawingToolbar = memo(function DrawingToolbar() {
  const {
    activeTool, setActiveTool,
    stayInDraw, setStayInDraw,
    activeStyle, drawings, setDrawings,
    undo, redo, canUndo, canRedo,
  } = useDrawingStore();

  const [activeToolKey, setActiveToolKey] = useState<string>(() => {
    try { return localStorage.getItem(AKEY_KEY) ?? "cursor"; } catch { return "cursor"; }
  });
  const [openGroup,      setOpenGroup]      = useState<string|null>(null);
  const [popupRect,      setPopupRect]      = useState<DOMRect|null>(null);
  const [showStyle,      setShowStyle]      = useState(false);
  const [styleRect,      setStyleRect]      = useState<DOMRect|null>(null);
  const [favs,           setFavs]           = useState<Set<string>>(loadFavs);
  const [lastInGroup,    setLastInGroup]    = useState<Record<string,string>>(loadLast);
  const [hideAll,        setHideAll]        = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const groupBtnRefs = useRef<Record<string,HTMLDivElement|null>>({});
  const styleBtnRef  = useRef<HTMLButtonElement|null>(null);
  const pressTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    if (activeTool==="cursor") {
      setActiveToolKey("cursor");
      localStorage.setItem(AKEY_KEY,"cursor");
    }
  }, [activeTool]);

  const selectTool = useCallback((key:string, realType:ToolType) => {
    setActiveTool(realType);
    setActiveToolKey(key);
    localStorage.setItem(AKEY_KEY, key);
    setOpenGroup(null);
    setShowStyle(false);
  }, [setActiveTool]);

  const toggleFav = useCallback((key:string) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveFavs(next);
      return next;
    });
  }, []);

  const activateGroupTool = useCallback((tool:ToolDef, gid:string) => {
    selectTool(tool.key, tool.realType);
    setLastInGroup(prev => {
      const next = { ...prev, [gid]:tool.key };
      saveLast(next);
      return next;
    });
  }, [selectTool]);

  useEffect(() => {
    const h = (e:PointerEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current?.contains(target)) return;
      if (target.closest?.('[data-drawing-popup]')) return;
      setOpenGroup(null); setShowStyle(false);
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, []);

  const getGroupRect = useCallback((gid:string): DOMRect|null => {
    const el = groupBtnRefs.current[gid];
    return el ? el.getBoundingClientRect() : null;
  }, []);

  useEffect(() => {
    const h = (e:KeyboardEvent) => {
      if (e.key==="Escape") {
        if (!stayInDraw) selectTool("cursor","cursor");
        setOpenGroup(null); setShowStyle(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectTool, stayInDraw]);

  // ── Toolbar button helpers ────────────────────────────────────────────────
  const BTN = 44;

  const bs = (active:boolean, danger=false): React.CSSProperties => ({
    width:BTN, height:BTN, borderRadius:4,
    display:"flex", alignItems:"center", justifyContent:"center",
    cursor:"pointer", flexShrink:0, outline:"none",
    pointerEvents:"auto",
    background:active
      ? (danger?"rgba(239,68,68,0.18)":"rgba(255,255,255,0.14)")
      : "transparent",
    border:"none",
    boxShadow:"none",
    transition:"background 0.12s",
  });

  const hOn  = (e:React.PointerEvent | React.MouseEvent, active:boolean) => {
    const el = e.currentTarget as HTMLElement;
    if (!active) el.style.background="rgba(255,255,255,0.08)";
    el.style.transform="scale(1.04)";
  };
  const hOff = (e:React.PointerEvent | React.MouseEvent, active:boolean) => {
    const el = e.currentTarget as HTMLElement;
    if (!active) el.style.background="transparent";
    el.style.transform="scale(1)";
  };
  const pOn  = (e:React.PointerEvent) => { (e.currentTarget as HTMLElement).style.transform="scale(0.92)"; };
  const pOff = (e:React.PointerEvent) => { (e.currentTarget as HTMLElement).style.transform="scale(1)"; };

  const SEP = null;

  const resolveGroup = (g:GroupDef) => {
    const lastKey = lastInGroup[g.id];
    const lastTool = lastKey ? ALL_TOOLS.find(t => t.key===lastKey) : null;
    const tool = lastTool ?? g.sections[0].tools[0];
    const groupKeys = new Set(g.sections.flatMap(s => s.tools.map(t => t.key)));
    const isActive = groupKeys.has(activeToolKey);
    return { tool, isActive };
  };

  const favTools = ALL_TOOLS.filter(t => favs.has(t.key));

  const Btn = ({
    active=false, danger=false, disabled=false,
    onClick, label, children,
  }: {
    active?:boolean; danger?:boolean; disabled?:boolean;
    onClick?:()=>void; label:string; children:React.ReactNode;
  }) => (
    <Tip label={label}>
      <button style={{ ...bs(active,danger), opacity:disabled?0.25:1, touchAction:"none" }}
        disabled={disabled} onClick={onClick}
        onMouseEnter={e=>{if(!disabled)hOn(e,active);}}
        onMouseLeave={e=>{if(!disabled)hOff(e,active);}}
        onPointerDown={pOn} onPointerUp={pOff} onPointerLeave={pOff}
      >
        {children}
      </button>
    </Tip>
  );

  const ic = (active:boolean, danger=false) =>
    active ? (danger?"#f87171":"#ffffff") : "#ffffff";

  return (
    <>
    {/* Outer layout-aware wrapper — takes 64px from the flex row, pointer-events:none so chart is never blocked */}
    <div style={{
      width:52, flexShrink:0, position:"relative",
      pointerEvents:"none", zIndex:40,
      background:"#0a0a0a",
      borderRight:"1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Scroll container: fills exactly the chart-safe area — no 100vh overflow */}
      <div style={{
        position:"absolute",
        top:0, left:0, right:0, bottom:0,
        overflowY:"auto", overflowX:"hidden",
        scrollbarWidth:"none",
        pointerEvents:"auto",
        touchAction:"pan-y",
      }}>
      {/* Centering wrapper — centers buttons when there is room, scrolls when chart is short */}
      <div ref={containerRef} data-drawing-toolbar="true" style={{
        minHeight:"100%",
        display:"flex", flexDirection:"column", alignItems:"center", gap:10,
        padding:"8px 0",
        justifyContent:"flex-start",
      }}>

      {/* ① Cursor */}
      <Btn label="Cursor (Esc)" active={activeToolKey==="cursor"}
        onClick={()=>selectTool("cursor","cursor")}>
        <IcoCursor c={ic(activeToolKey==="cursor")} />
      </Btn>

      {SEP}

      {/* ②–⑧ Tool groups */}
      {GROUPS.map(g => {
        const { tool, isActive } = resolveGroup(g);
        const isOpen = openGroup===g.id;

        const openPopup = () => {
          const rect = getGroupRect(g.id);
          if (rect) { setPopupRect(rect); setOpenGroup(g.id); setShowStyle(false); }
        };

        const isFav = favs.has(tool.key);
        return (
          <div key={g.id} ref={el=>{groupBtnRefs.current[g.id]=el;}} style={{ position:"relative" }}
            className="group-btn-row">
            <div style={{ position:"relative" }}>
              <button
                style={{ ...bs(isActive), position:"relative" }}
                onClick={()=>{
                  if (isOpen) { setOpenGroup(null); }
                  else { openPopup(); }
                }}
                onMouseEnter={e=>hOn(e,isActive)}
                onMouseLeave={e=>hOff(e,isActive)}
                onPointerDown={pOn} onPointerUp={pOff} onPointerLeave={pOff}
              >
                <tool.Icon c={ic(isActive)} />
              </button>
            </div>
            {isOpen && popupRect && (
              <ToolPopup
                group={g} activeToolKey={activeToolKey} favorites={favs}
                anchorRect={popupRect}
                onSelect={td=>activateGroupTool(td,g.id)}
                onToggleFav={toggleFav}
                onClose={()=>setOpenGroup(null)}
              />
            )}
          </div>
        );
      })}

      {SEP}

      {/* ⑪ Magnet */}
      <Btn label="Magnet snap" onClick={()=>{}}>
        <IcoMagnetSvg c="#E8F0ED" />
      </Btn>

      {/* ⑫ Stay in draw mode */}
      <Btn label={stayInDraw?"Stay in draw: ON":"Stay in draw: OFF"} active={stayInDraw}
        onClick={()=>setStayInDraw(!stayInDraw)}>
        <IcoPencilLockSvg c={ic(stayInDraw)} />
      </Btn>

      {/* ⑬ Lock all */}
      <Btn label="Lock / unlock all"
        onClick={()=>setDrawings(drawings.map(d=>({...d,isLocked:!d.isLocked})))}>
        <IcoLockSvg c="#E8F0ED" />
      </Btn>

      {/* ⑭ Hide/Show */}
      <Btn label={hideAll?"Show drawings":"Hide drawings"} active={hideAll}
        onClick={()=>{const n=!hideAll;setHideAll(n);setDrawings(drawings.map(d=>({...d,isVisible:!n})));}}
      >
        <IcoEyeBrushSvg c="#E8F0ED" />
      </Btn>

      {SEP}

      {/* ⑮ Trash */}
      <Btn label="Remove all drawings" danger onClick={()=>setDrawings([])}>
        <IcoTrash c="rgba(220,80,80,0.82)" />
      </Btn>

      {SEP}

      {/* Undo / Redo */}
      <Btn label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        <Undo2 style={{ width:18, height:18, color:"#E8F0ED" }} />
      </Btn>
      <Btn label="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
        <Redo2 style={{ width:18, height:18, color:"#E8F0ED" }} />
      </Btn>

      {SEP}

      {/* Color picker */}
      <Tip label="Drawing style">
        <button ref={styleBtnRef}
          style={{ ...bs(showStyle) }}
          onClick={()=>{
            const rect = styleBtnRef.current?.getBoundingClientRect() ?? null;
            if (rect) setStyleRect(rect);
            setShowStyle(v=>!v); setOpenGroup(null);
          }}
          onMouseEnter={e=>hOn(e,showStyle)} onMouseLeave={e=>hOff(e,showStyle)}
          onPointerDown={pOn} onPointerUp={pOff} onPointerLeave={pOff}
        >
          <IcoDot color={activeStyle.color} />
        </button>
        {showStyle && styleRect && <StyleFlyout anchorRect={styleRect} onClose={()=>setShowStyle(false)} />}
      </Tip>

      </div>
      </div>{/* end scroll container */}
    </div>{/* end outer docked wrapper */}

    {favTools.length>0 && (
      <FavoritesBar
        tools={favTools} activeToolKey={activeToolKey}
        onSelect={t=>{selectTool(t.key,t.realType);}}
        onToggleFav={toggleFav}
      />
    )}
    </>
  );
});

export default DrawingToolbar;
