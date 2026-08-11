import type { IChartApi } from "lightweight-charts";

export const chartApiRef: { current: IChartApi | null } = { current: null };
