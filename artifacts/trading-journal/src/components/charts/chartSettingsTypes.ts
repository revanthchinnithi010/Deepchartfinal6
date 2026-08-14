export interface ChartSettings {
  upColor:         string;
  downColor:       string;
  upBorderColor:   string;
  downBorderColor: string;
  upWickColor:     string;
  downWickColor:   string;
  timezone:        "UTC" | "IST" | "Exchange" | "Local";
  bgColor:         string;
  bgType:          "solid" | "gradient";
  gridStyle:       "both" | "vertical" | "horizontal" | "none";
  crosshairColor:  string;
  crosshairStyle:  "solid" | "dashed" | "dotted";
  crosshairWidth:  number;
  textColor:       string;
  fontSize:        number;
  linesColor:      string;
  gridColor:           string;
  borderColor:         string;
  bordersVisible:      boolean;
  panelBorderVisible:  boolean;
  panelBorderColor:    string;
  panelBorderThickness: number;
  gridVisible:          boolean;
  crosshair:       "normal" | "magnet";
  precision:       "2" | "4" | "5" | "8";
  scaleMode:       "normal" | "log" | "percent" | "indexed";
  priceScaleAutoScale: boolean;
  priceLabelBullColor:  string;
  priceLabelBearColor:  string;
  priceLabelTextColor:  string;
  priceLabelLineColor:  string;
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  // Standard trading-chart candle palette: bullish = green, bearish = red.
  // Keep border + wick colors synchronized with the body so every candle has
  // a clean, consistent silhouette on the dark chart background.
  upColor:         "#22c55e",
  downColor:       "#ef4444",
  upBorderColor:   "#22c55e",
  downBorderColor: "#ef4444",
  upWickColor:     "#22c55e",
  downWickColor:   "#ef4444",
  timezone:        "UTC",
  bgColor:         "#000000",
  bgType:          "solid",
  gridStyle:       "none",
  crosshairColor:  "rgba(255,255,255,0.5)",
  crosshairStyle:  "solid",
  crosshairWidth:  1,
  textColor:       "#ffffff",
  fontSize:        11,
  linesColor:      "rgba(255,255,255,0.08)",
  gridColor:            "rgba(255,255,255,0.08)",
  borderColor:          "rgba(255,255,255,0.7)",
  bordersVisible:       true,
  panelBorderVisible:   true,
  panelBorderColor:     "#ffffff",
  panelBorderThickness: 1,
  gridVisible:          false,
  crosshair:       "normal",
  precision:       "2",
  scaleMode:       "normal",
  priceScaleAutoScale: true,
  // Live price label must use the exact same bullish/bearish colors as candles.
  priceLabelBullColor:  "#22c55e",
  priceLabelBearColor:  "#ef4444",
  priceLabelTextColor:  "#ffffff",
  priceLabelLineColor:  "rgba(255,255,255,0.4)",
};
