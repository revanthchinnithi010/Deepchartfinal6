export type ToolType =
  | "cursor"
  | "trendline"
  | "extended"
  | "ray"
  | "hline"
  | "hray"
  | "vline"
  | "channel"
  | "rect"
  | "ellipse"
  | "fib"
  | "fib_channel"
  | "arrow"
  | "brush"
  | "highlighter"
  | "path"
  | "curve"
  | "text"
  | "note"
  | "position_long"
  | "position_short"
  | "ruler"
  | "date_range"
  | "price_range"
  | "eraser";

export interface DrawingPoint {
  time:  number;
  price: number;
}

export interface DrawingStyle {
  color:       string;
  thickness:   number;
  lineStyle:   "solid" | "dashed" | "dotted";
  fillOpacity: number;
  opacity?:    number;
  text?:       string;
  extendLeft?:         boolean;
  extendRight?:        boolean;
  showMiddlePoint?:    boolean;
  showPriceLabels?:    boolean;
  textColor?:          string;
  fontSize?:           number;
  fontBold?:           boolean;
  fontItalic?:         boolean;
  textAlignH?:         "left" | "center" | "right";
  textAlignV?:         "top" | "middle" | "bottom";
  visibleTimeframes?:  string[];
  // Position tool zone colors (hex, e.g. "#089981")
  profitColor?: string;
  stopColor?:   string;
  // Label / text color for drawings that render a label
  labelColor?:  string;
}

export const DEFAULT_STYLE: DrawingStyle = {
  color:       "#B7FF5A",
  thickness:   2,
  lineStyle:   "solid",
  fillOpacity: 0.1,
};

export interface Drawing {
  id:        number;
  symbol:    string;
  timeframe: string;
  toolType:  ToolType;
  points:    DrawingPoint[];
  style:     DrawingStyle;
  isLocked:  boolean;
  isVisible: boolean;
  createdAt: string;
  /** Persistent human-readable ID for trendlines/rays (e.g. "TL-001"). */
  displayId?: string;
}

export function isFreehand(tool: ToolType): boolean {
  return tool === "brush" || tool === "highlighter";
}

export function pointsNeeded(tool: ToolType): number {
  if (tool === "hline" || tool === "hray" || tool === "vline" || tool === "eraser" || tool === "text" || tool === "note") return 1;
  if (isFreehand(tool)) return Infinity;
  return 2;
}
