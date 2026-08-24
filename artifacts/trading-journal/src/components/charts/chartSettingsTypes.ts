export interface ChartSettings {
  upColor:         string;
  downColor:       string;
  upBorderColor:   string;
  downBorderColor: string;
  upWickColor:     string;
  downWickColor:   string;
  lineColor:       string;
  lineOpacity:     number;
  lineWidth:       number;
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

const CHART_SETTINGS_DEFAULT_KEY = "deepcharts_chart_settings_default_v2";

const BASE_CHART_SETTINGS: ChartSettings = {
  upColor:         "#22c55e",
  downColor:       "#ef4444",
  upBorderColor:   "#22c55e",
  downBorderColor: "#ef4444",
  upWickColor:     "#22c55e",
  downWickColor:   "#ef4444",
  lineColor:       "#22c55e",
  lineOpacity:     1,
  lineWidth:       2,
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
  gridColor:       "rgba(255,255,255,0.08)",
  borderColor:     "rgba(255,255,255,0.7)",
  bordersVisible:  true,
  panelBorderVisible: true,
  panelBorderColor: "#ffffff",
  panelBorderThickness: 1,
  gridVisible:     false,
  crosshair:       "normal",
  precision:       "2",
  scaleMode:       "normal",
  priceScaleAutoScale: true,
  priceLabelBullColor: "#22c55e",
  priceLabelBearColor: "#ef4444",
  priceLabelTextColor: "#ffffff",
  priceLabelLineColor: "rgba(255,255,255,0.4)",
};

function readSavedChartSettings(): ChartSettings {
  if (typeof window === "undefined") return BASE_CHART_SETTINGS;
  try {
    const raw = window.localStorage.getItem(CHART_SETTINGS_DEFAULT_KEY);
    if (!raw) return BASE_CHART_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return BASE_CHART_SETTINGS;
    return { ...BASE_CHART_SETTINGS, ...(parsed as Partial<ChartSettings>) };
  } catch {
    return BASE_CHART_SETTINGS;
  }
}

function findSettingsFromSaveButton(button: HTMLButtonElement): ChartSettings | null {
  const fiberKey = Object.keys(button).find(key => key.startsWith("__reactFiber$"));
  if (!fiberKey) return null;

  let fiber: any = (button as any)[fiberKey];
  while (fiber) {
    const settings = fiber.memoizedProps?.settings;
    if (
      settings &&
      typeof settings === "object" &&
      typeof settings.upColor === "string" &&
      typeof settings.downColor === "string"
    ) {
      return { ...BASE_CHART_SETTINGS, ...settings } as ChartSettings;
    }
    fiber = fiber.return;
  }
  return null;
}

// Save-as-default is shared by the chart settings UIs. Persist the settings
// after the existing React handler has applied them, then load them on startup.
if (typeof document !== "undefined") {
  document.addEventListener("click", event => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button") as HTMLButtonElement | null;
    if (!button) return;
    const label = button.textContent?.trim() ?? "";
    if (!label.startsWith("Save as Default") && !label.startsWith("✓ Saved as Default")) return;

    requestAnimationFrame(() => {
      const settings = findSettingsFromSaveButton(button);
      if (!settings) return;
      try {
        window.localStorage.setItem(CHART_SETTINGS_DEFAULT_KEY, JSON.stringify(settings));
      } catch {
        // Ignore storage failures; chart continues using the in-memory settings.
      }
    });
  });
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = readSavedChartSettings();
