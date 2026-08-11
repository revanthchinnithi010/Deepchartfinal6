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
  gridVisible:         boolean;
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
  upColor:         "#C28D39",
  downColor:       "#EFE5D2",
  upBorderColor:   "#C28D39",
  downBorderColor: "#EFE5D2",
  upWickColor:     "#C28D39",
  downWickColor:   "#EFE5D2",
  timezone:        "UTC",
  bgColor:         "#000000",
  bgType:          "solid",
  gridStyle:       "none",
  crosshairColor:  "rgba(255,255,255,0.5)",
  crosshairStyle:  "solid",
  crosshairWidth:  1,
  textColor:       "rgba(255,255,255,0.85)",
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
  priceLabelBullColor:  "#B7FF5A",
  priceLabelBearColor:  "#ef4444",
  priceLabelTextColor:  "#ffffff",
  priceLabelLineColor:  "rgba(255,255,255,0.4)",
};
