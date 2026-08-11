import { createContext, useContext } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

export interface ChartContextValue {
  chart:  IChartApi | null;
  candle: ISeriesApi<"Candlestick"> | null;
}

export const ChartContext = createContext<ChartContextValue>({ chart: null, candle: null });

export function useChartContext(): ChartContextValue {
  return useContext(ChartContext);
}
