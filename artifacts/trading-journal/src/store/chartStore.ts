import { create } from "zustand";

export type ChartType = "candles" | "heikin_ashi" | "line" | "line_with_markers" | "area" | "bars";

export interface IndicatorState {
  ema9:   boolean;
  ema21:  boolean;
  ema50:  boolean;
  ema200: boolean;
  vwap:   boolean;
}

export interface OHLCBar {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface CrosshairInfo {
  time:   number | null;
  open:   number | null;
  high:   number | null;
  low:    number | null;
  close:  number | null;
  volume: number | null;
}

interface ChartStoreState {
  symbol:        string;
  interval:      string;
  chartType:     ChartType;
  indicators:    IndicatorState;
  livePrice:     number | null;
  liveOpen:      number | null;
  crosshairInfo: CrosshairInfo;
  barsLoaded:            boolean;
  mobileChartFullscreen: boolean;
  dashboardSheetOpen:    boolean;

  setSymbol:       (s: string) => void;
  setInterval:     (i: string) => void;
  setChartType:    (t: ChartType) => void;
  setIndicator:    (key: keyof IndicatorState, val: boolean) => void;
  setLivePrice:    (p: number | null) => void;
  setLiveOpen:     (p: number | null) => void;
  setCrosshair:    (info: CrosshairInfo) => void;
  setBarsLoaded:            (v: boolean) => void;
  setMobileChartFullscreen: (v: boolean) => void;
  setDashboardSheetOpen:    (v: boolean) => void;
  dashboardAlertsOpen:      boolean;
  setDashboardAlertsOpen:   (v: boolean) => void;
  dashboardMarketsOpen:     boolean;
  setDashboardMarketsOpen:  (v: boolean) => void;
}

const loadIndicators = (): IndicatorState => {
  try {
    const s = localStorage.getItem("tv_indicators");
    if (s) return JSON.parse(s) as IndicatorState;
  } catch { /* ignore */ }
  return { ema9: false, ema21: false, ema50: false, ema200: false, vwap: false };
};

// Resolve initial values and ensure localStorage is always written on first load.
// This guarantees chartStore.symbol === localStorage.tv_symbol from moment zero.
const _initSymbol   = (typeof localStorage !== "undefined" ? localStorage.getItem("tv_symbol")   : null) ?? "BTCUSD";
const _initInterval = (typeof localStorage !== "undefined" ? localStorage.getItem("tv_interval") : null) ?? "60";
if (typeof localStorage !== "undefined") {
  localStorage.setItem("tv_symbol",   _initSymbol);
  localStorage.setItem("tv_interval", _initInterval);
}

export const useChartStore = create<ChartStoreState>((set, get) => ({
  symbol:     _initSymbol,
  interval:   _initInterval,
  chartType:  (typeof localStorage !== "undefined" ? localStorage.getItem("tv_chartType") as ChartType : null) ?? "candles",
  indicators: loadIndicators(),
  livePrice:  null,
  liveOpen:   null,
  crosshairInfo: { time: null, open: null, high: null, low: null, close: null, volume: null },
  barsLoaded: false,
  mobileChartFullscreen: false,
  dashboardSheetOpen:    false,
  dashboardAlertsOpen:   false,
  dashboardMarketsOpen:  false,

  setSymbol:    (symbol)    => { localStorage.setItem("tv_symbol",   symbol);   set({ symbol,   barsLoaded: false }); },
  setInterval:  (interval)  => { localStorage.setItem("tv_interval", interval); set({ interval, barsLoaded: false }); },
  setChartType: (chartType) => { localStorage.setItem("tv_chartType", chartType); set({ chartType }); },
  setIndicator: (key, val)  => {
    const next = { ...get().indicators, [key]: val };
    localStorage.setItem("tv_indicators", JSON.stringify(next));
    set({ indicators: next });
  },
  setLivePrice:  (livePrice)      => set({ livePrice }),
  setLiveOpen:   (liveOpen)       => set({ liveOpen }),
  setCrosshair:  (crosshairInfo)  => set({ crosshairInfo }),
  setBarsLoaded:            (barsLoaded)            => set({ barsLoaded }),
  setMobileChartFullscreen: (mobileChartFullscreen) => set({ mobileChartFullscreen }),
  setDashboardSheetOpen:    (dashboardSheetOpen)    => set({ dashboardSheetOpen }),
  setDashboardAlertsOpen:   (dashboardAlertsOpen)   => set({ dashboardAlertsOpen }),
  setDashboardMarketsOpen:  (dashboardMarketsOpen)  => set({ dashboardMarketsOpen }),
}));
