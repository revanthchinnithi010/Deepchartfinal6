import { create } from "zustand";
import type { Drawing, ToolType, DrawingStyle } from "@/types/drawing";
import { DEFAULT_STYLE } from "@/types/drawing";

const MAX_HISTORY    = 50;
const DELETED_LS_KEY = "tv_deleted_drawing_ids";

const STYLE_LS_PREFIX = "drawingStyle_";

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

interface DrawingStore {
  activeTool:    ToolType;
  setActiveTool: (tool: ToolType) => void;

  stayInDraw:    boolean;
  setStayInDraw: (v: boolean) => void;

  drawings:       Drawing[];
  resetDrawings:  (drawings: Drawing[]) => void;
  setDrawings:    (drawings: Drawing[]) => void;
  addDrawing:     (drawing: Drawing) => void;
  updateDrawing:  (id: number, patch: Partial<Drawing>) => void;
  removeDrawing:  (id: number) => void;

  _history: Drawing[][];
  _future:  Drawing[][];
  undo:     () => void;
  redo:     () => void;
  canUndo:  boolean;
  canRedo:  boolean;

  activeStyle:         DrawingStyle;
  /**
   * Called by the user intentionally changing a style property.
   * Updates activeStyle AND persists the new defaults to localStorage
   * so future drawings of the same type inherit them.
   */
  setActiveStyle:      (style: Partial<DrawingStyle>) => void;
  /**
   * Called internally when a drawing is selected, to sync the style
   * panel to show the selected drawing's current style.
   * Does NOT save to localStorage — avoids clobbering persisted defaults.
   */
  syncActiveStyle:     (style: DrawingStyle) => void;

  selectedDrawingId:    number | null;
  setSelectedDrawingId: (id: number | null) => void;

  isDrawing:    boolean;
  setIsDrawing: (v: boolean) => void;
}

function snapshot(drawings: Drawing[], history: Drawing[][]): Drawing[][] {
  return [drawings, ...history].slice(0, MAX_HISTORY);
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  activeTool:    "cursor",
  setActiveTool: (tool) => {
    const savedStyle = loadDrawingStyle(tool);
    set({
      activeTool: tool,
      isDrawing: false,
      ...(savedStyle ? { activeStyle: savedStyle } : {}),
    });
  },

  stayInDraw:    false,
  setStayInDraw: (v) => set({ stayInDraw: v }),

  drawings: [],
  _history: [],
  _future:  [],
  canUndo:  false,
  canRedo:  false,

  resetDrawings: (drawings) => set({ drawings, _history: [], _future: [], canUndo: false, canRedo: false }),

  setDrawings: (drawings) => {
    const { drawings: prev, _history } = get();
    const history = snapshot(prev, _history);
    set({ drawings, _history: history, _future: [], canUndo: true, canRedo: false });
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
    // Fire-and-forget DB delete — every caller (toolbar, context menu, mobile
    // panel, drawings list) goes through this one function, so this is the
    // single place that needs to talk to the backend. Safe to call even if
    // a caller already issued its own DELETE first (idempotent 404, ignored).
    fetch(`/api/drawings/${id}`, { method: "DELETE" }).catch(() => { /* offline/best-effort */ });
    set((s) => {
      const history = snapshot(s.drawings, s._history);
      return { drawings: s.drawings.filter(d => d.id !== id), _history: history, _future: [], canUndo: true, canRedo: false };
    });
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

  // User-initiated style change — persists defaults to localStorage.
  setActiveStyle: (patch) => set((s) => {
    const next = { ...s.activeStyle, ...patch };

    // Save as the default for the selected drawing's tool type, so future
    // drawings of that type inherit the new style.
    if (s.selectedDrawingId !== null) {
      const selectedDrawing = s.drawings.find(d => d.id === s.selectedDrawingId);
      if (selectedDrawing) {
        saveDrawingStyle(selectedDrawing.toolType, next);
      }
    }

    // Also save under the active drawing tool (when no drawing is selected
    // but a draw tool is active — e.g. user changes color before drawing).
    if (s.activeTool !== "cursor") {
      saveDrawingStyle(s.activeTool, next);
    }

    // Update selected drawing's style in real-time.
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

  // Internal selection sync — does NOT persist to localStorage.
  syncActiveStyle: (style) => set({ activeStyle: style }),

  selectedDrawingId:    null,
  setSelectedDrawingId: (id) => set({ selectedDrawingId: id }),

  isDrawing:    false,
  setIsDrawing: (v) => set({ isDrawing: v }),
}));
