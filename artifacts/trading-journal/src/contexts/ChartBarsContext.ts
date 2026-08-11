import { createContext, useContext } from "react";
import type { OHLCBar } from "@/store/chartStore";

export interface ChartBarsContextValue {
  barsRef: React.MutableRefObject<OHLCBar[]>;
  /** Increments whenever barsRef.current is updated — use as a useEffect dep to react to replay advances */
  replayBarCount: number;
}

const fallbackRef: React.MutableRefObject<OHLCBar[]> = { current: [] };

export const ChartBarsContext = createContext<ChartBarsContextValue>({ barsRef: fallbackRef, replayBarCount: 0 });

export function useChartBars(): ChartBarsContextValue {
  return useContext(ChartBarsContext);
}
