import { useState, useCallback } from "react";
import type { ChartType, IndicatorState } from "@/store/chartStore";
import type { ChartSettings } from "@/components/charts/chartSettingsTypes";
import { toArray } from "@/lib/safeArray";

export interface NamedLayout {
  id: string;
  name: string;
  symbol: string;
  interval: string;
  chartType: ChartType;
  indicators: IndicatorState;
  chartSettings: ChartSettings;
  layoutCount: number;
  savedAt: number;
}

const LS_KEY        = "tj_named_layouts_v1";
const LS_ACTIVE_KEY = "tj_active_layout_id_v1";

function readLayouts(): NamedLayout[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? toArray<NamedLayout>(JSON.parse(raw), "useNamedLayouts.readLayouts:localStorage") : [];
  } catch { return []; }
}

function writeLayouts(layouts: NamedLayout[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(layouts)); } catch { /* ignore */ }
}

function readActiveId(): string | null {
  try { return localStorage.getItem(LS_ACTIVE_KEY); } catch { return null; }
}

function writeActiveId(id: string | null) {
  try {
    if (id === null) {
      localStorage.removeItem(LS_ACTIVE_KEY);
    } else {
      localStorage.setItem(LS_ACTIVE_KEY, id);
    }
  } catch { /* ignore */ }
}

export function useNamedLayouts() {
  const [layouts, setLayouts] = useState<NamedLayout[]>(readLayouts);
  const [activeLayoutId, setActiveLayoutIdState] = useState<string | null>(readActiveId);

  const persist = useCallback((next: NamedLayout[]) => {
    setLayouts(next);
    writeLayouts(next);
  }, []);

  const setActiveLayoutId = useCallback((id: string | null) => {
    console.log(`[LayoutActive] Selected Layout ID: ${id}  Stored Layout ID: ${readActiveId()}`);
    setActiveLayoutIdState(id);
    writeActiveId(id);
    console.log(`[LayoutActive] Current Active Layout ID now: ${id}`);
  }, []);

  const saveLayout = useCallback((data: Omit<NamedLayout, "id" | "savedAt">) => {
    const base = readLayouts();
    const next: NamedLayout[] = [
      ...base,
      { ...data, id: crypto.randomUUID(), savedAt: Date.now() },
    ];
    persist(next);
  }, [persist]);

  const renameLayout = useCallback((id: string, name: string) => {
    persist(readLayouts().map(l => l.id === id ? { ...l, name: name.trim() || l.name } : l));
  }, [persist]);

  const deleteLayout = useCallback((id: string) => {
    persist(readLayouts().filter(l => l.id !== id));
    // Clear active if the deleted layout was active
    if (readActiveId() === id) setActiveLayoutId(null);
  }, [persist, setActiveLayoutId]);

  return { layouts, saveLayout, renameLayout, deleteLayout, activeLayoutId, setActiveLayoutId };
}
