import { create } from "zustand";
import type { Drawing, ToolType, DrawingStyle } from "@/types/drawing";
import { DEFAULT_STYLE, pointsNeeded, isFreehand } from "@/types/drawing";

const MAX_HISTORY    = 50;
const DELETED_LS_KEY = "tv_deleted_drawing_ids";
const STYLE_LS_PREFIX = "drawingStyle_";
const DRAWINGS_CHANGED_EVENT = "tj:drawings-changed";

function notifyDrawingsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DRAWINGS_CHANGED_EVENT));
  }
}

export function saveDrawingStyle(toolType: ToolType, style: DrawingStyle): void {
  try {
    localStorage.setItem(STYLE_LS_PREFIX + toolType, JSON.stringify(style));
  } catch { /* ignore */ }
}

export function loadDrawingStyle(toolType: ToolType): DrawingStyle | null {
  try {
    const raw = localStorage.getItem(STYLE_LS_PREFIX + toolType);
    return raw ? (JSON.parse(raw) as DrawingStyle) : null;
  } catch { return null; }
}

export function getDeletedDrawingIds(): Set<number> {
  try {
    const raw = localStorage.getItem(DELETED_LS_KEY);
    if (!raw) return new Set();
    return new Set<number>(JSON.parse(raw) as number[]);
  } catch { return new Set(); }
}

function persistDeletedId(id: number) {
  try {
    const ids = getDeletedDrawingIds();
    ids.add(id);
    localStorage.setItem(DELETED_LS_KEY, JSON.stringify([...ids].slice(-1000)));
  } catch { /* ignore */ }
}

/**
 * Desktop / landscape layout does not have the mobile crosshair-seeding effect.
 * DrawingOverlay hides the two crosshair SVG lines whenever activeTool changes
 * and normally reveals them only from pointermove. Seed the actual SVG lines
 * after React has committed the selected 2-point drawing tool so the first frame
 * matches the vertical/mobile drawing experience.
 */
function seedDrawingCrosshairAfterToolSelect(tool: ToolType): void {
  if (
    tool === "cursor" ||
    tool === "eraser" ||
    typeof window === "undefined" ||
    pointsNeeded(tool) !== 2 ||
    isFreehand(tool)
  ) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const lines = Array.from(document.querySelectorAll<SVGLineElement>("svg line"));

        const hLine = lines.find(line =>
          line.getAttribute("x1") === "0" &&
          line.getAttribute("x2") === "100%" &&
          line.getAttribute("y1") === "0" &&
          line.getAttribute("y2") === "0"
        );
        const vLine = lines.find(line =>
          line.getAttribute("x1") === "0" &&
          line.getAttribute("x2") === "0" &&
          line.getAttribute("y1") === "0" &&
          line.getAttribute("y2") === "100%"
        );

        if (!hLine || !vLine) return;

        const svg = hLine.closest("svg");
        const rect = svg?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;

        const cx = rect.width / 2;
        const cy = rect.height * 0.4;

        hLine.setAttribute("y1", String(cy));
        hLine.setAttribute("y2", String(cy));
        hLine.style.display = "";

        vLine.setAttribute("x1", String(cx));
        vLine.setAttribute("x2", String(cx));
        vLine.style.display = "";
      } catch {
        // Best-effort DOM enhancement; drawing functionality must remain unaffected.
      }
    });
  });
}

interface DrawingStore {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  stayInDraw: boolean;
  setStayInDraw: (v: boolean) => void;
  drawings: Drawing[];
  resetDrawings: (drawings: Drawing[]) => void;
  setDrawings: (drawings: Drawing[]) => void;
  addDrawing: (drawing: Drawing) => void;
  updateDrawing: (id: number, patch: Partial<Drawing>) => void;
  removeDrawing: (id: number) => void;
  _history: Drawing[][];
  _future: Drawing[][];
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  activeStyle: DrawingStyle;
  setActiveStyle: (style: Partial<DrawingStyle>) => void;
  syncActiveStyle: (style: DrawingStyle) => void;
  selectedDrawingId: number | null;
  setSelectedDrawingId: (id: number | null) => void;
  isDrawing: boolean;
  setIsDrawing: (v: boolean) => void;
}

function snapshot(drawings: Drawing[], history: Drawing[][]): Drawing[][] {
  return [drawings, ...history].slice(0, MAX_HISTORY);
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  activeTool: "cursor",
  setActiveTool: (tool) => {
    const savedStyle = loadDrawingStyle(tool);
    set({
      activeTool: tool,
      isDrawing: false,
      ...(savedStyle ? { activeStyle: savedStyle } : {}),
    });
    seedDrawingCrosshairAfterToolSelect(tool);
  },

  stayInDraw: false,
  setStayInDraw: (v) => set({ stayInDraw: v }),

  drawings: [],
  _history: [],
  _future: [],
  canUndo: false,
  canRedo: false,

  resetDrawings: (drawings) => {
    set({ drawings, _history: [], _future: [], canUndo: false, canRedo: false });
    notifyDrawingsChanged();
  },

  setDrawings: (drawings) => {
    const { drawings: prev, _history } = get();
    const history = snapshot(prev, _history);
    set({ drawings, _history: history, _future: [], canUndo: true, canRedo: false });
    notifyDrawingsChanged();
  },

  addDrawing: (drawing) => set((s) => {
    const history = snapshot(s.drawings, s._history);
    return { drawings: [drawing, ...s.drawings], _history: history, _future: [], canUndo: true, canRedo: false };
  }),

  updateDrawing: (id, patch) => set((s) => ({
    drawings: s.drawings.map(d => d.id === id ? { ...d, ...patch } : d),
  })),

  removeDrawing: (id) => {
    persistDeletedId(id);
    fetch(`/api/drawings/${id}`, { method: "DELETE" }).catch(() => { /* offline/best-effort */ });
    set((s) => {
      const history = snapshot(s.drawings, s._history);
      return { drawings: s.drawings.filter(d => d.id !== id), _history: history, _future: [], canUndo: true, canRedo: false };
    });
    notifyDrawingsChanged();
  },

  undo: () => set((s) => {
    if (s._history.length === 0) return s;
    const [prev, ...rest] = s._history;
    const future = [s.drawings, ...s._future].slice(0, MAX_HISTORY);
    return { drawings: prev, _history: rest, _future: future, canUndo: rest.length > 0, canRedo: true };
  }),

  redo: () => set((s) => {
    if (s._future.length === 0) return s;
    const [next, ...rest] = s._future;
    const history = snapshot(s.drawings, s._history);
    return { drawings: next, _history: history, _future: rest, canUndo: true, canRedo: rest.length > 0 };
  }),

  activeStyle: DEFAULT_STYLE,

  setActiveStyle: (patch) => set((s) => {
    const next = { ...s.activeStyle, ...patch };
    if (s.selectedDrawingId !== null) {
      const selectedDrawing = s.drawings.find(d => d.id === s.selectedDrawingId);
      if (selectedDrawing) saveDrawingStyle(selectedDrawing.toolType, next);
    }
    if (s.activeTool !== "cursor") saveDrawingStyle(s.activeTool, next);
    if (s.selectedDrawingId !== null) {
      const drawings = s.drawings.map(d =>
        d.id === s.selectedDrawingId
          ? { ...d, style: { ...d.style, ...patch } }
          : d
      );
      return { activeStyle: next, drawings };
    }
    return { activeStyle: next };
  }),

  syncActiveStyle: (style) => set({ activeStyle: style }),
  selectedDrawingId: null,
  setSelectedDrawingId: (id) => set({ selectedDrawingId: id }),
  isDrawing: false,
  setIsDrawing: (v) => set({ isDrawing: v }),
}));
