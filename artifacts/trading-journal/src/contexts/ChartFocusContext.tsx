import { createContext, useContext } from "react";

interface ChartFocusContextValue {
  openSidebar: () => void;
}

export const ChartFocusContext = createContext<ChartFocusContextValue>({
  openSidebar: () => {},
});

export function useChartFocusMode() {
  return useContext(ChartFocusContext);
}
