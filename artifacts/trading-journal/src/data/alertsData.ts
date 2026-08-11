export type AlertType = "price" | "zone" | "trendline";
export type AlertStatus = "active" | "triggered" | "paused" | "expired";
export type AlertCondition = "above" | "below" | "enter" | "touch" | "break" | "retest" | "percent_up" | "percent_down";
export type ZoneType = "supply" | "demand" | "support_resistance" | "order_block";

/**
 * Repeat mode for an alert — controls what happens after the alert triggers.
 *   three_reminders        — 3 total notifications (+5 min, +10 min), then auto-delete
 *   repeat_until_dismissed — repeats every 10 min until user deletes/disables the alert
 *   triple_ring            — one notification + 3 alert sounds with 1 s pauses; stays active
 */
export type RepeatMode = "three_reminders" | "repeat_until_dismissed" | "triple_ring";

export interface PriceAlert {
  id: string;
  type: "price";
  symbol: string;
  timeframe: string;
  condition: "above" | "below" | "touch" | "percent_up" | "percent_down";
  targetPrice: number;
  currentPrice: number;
  notes: string;
  status: AlertStatus;
  expiry: string | null;
  createdAt: string;
  triggeredAt: string | null;
  repeatMode?: RepeatMode;
}

export interface ZoneAlert {
  id: string;
  type: "zone";
  symbol: string;
  zoneType: ZoneType;
  upperPrice: number;
  lowerPrice: number;
  timeframe: string;
  condition: AlertCondition;
  notes: string;
  status: AlertStatus;
  createdAt: string;
  triggeredAt: string | null;
  repeatMode?: RepeatMode;
}

export interface TrendlineAlert {
  id: string;
  type: "trendline";
  symbol: string;
  timeframe: string;
  point1Price: number;
  point1Time: string;
  point2Price: number;
  point2Time: string;
  condition: "touch" | "break" | "retest" | "atr_proximity" | "cross_above" | "cross_below" | "breakout" | "enter_zone" | "exit_zone" | "rejection" | "above_price" | "below_price" | "touch_price";
  /** ATR period used for proximity zone calculation (default 14) */
  atrPeriod?: number;
  /** ATR multiplier for zone buffer size (default 0.15) */
  atrMultiplier?: number;
  /** Chart drawing display ID (e.g. TL-004) this alert belongs to. */
  drawingDisplayId?: string;
  notes: string;
  status: AlertStatus;
  createdAt: string;
  triggeredAt: string | null;
  repeatMode?: RepeatMode;
}

export type AnyAlert = PriceAlert | ZoneAlert | TrendlineAlert;

export const SAMPLE_PRICE_ALERTS: PriceAlert[] = [
  { id: "pa1", type: "price", symbol: "NAS100", timeframe: "1H", condition: "above", targetPrice: 18750, currentPrice: 18490, notes: "Break above ATH — momentum continuation entry", status: "active", expiry: "2026-05-30T00:00:00Z", createdAt: "2026-05-23T08:00:00Z", triggeredAt: null },
  { id: "pa2", type: "price", symbol: "US30", timeframe: "4H", condition: "below", targetPrice: 39000, currentPrice: 39680, notes: "Key support breakdown — short setup", status: "active", expiry: null, createdAt: "2026-05-22T14:00:00Z", triggeredAt: null },
  { id: "pa3", type: "price", symbol: "XAUUSD", timeframe: "1D", condition: "touch", targetPrice: 2350, currentPrice: 2345.8, notes: "Round number psychological level", status: "triggered", expiry: null, createdAt: "2026-05-21T09:00:00Z", triggeredAt: "2026-05-23T06:45:00Z" },
  { id: "pa4", type: "price", symbol: "BTCUSDT", timeframe: "4H", condition: "above", targetPrice: 70000, currentPrice: 69100, notes: "Breakout above 70k — major resistance", status: "active", expiry: "2026-06-01T00:00:00Z", createdAt: "2026-05-20T10:00:00Z", triggeredAt: null },
  { id: "pa5", type: "price", symbol: "ETHUSDT", timeframe: "1H", condition: "below", targetPrice: 3000, currentPrice: 3280, notes: "Macro support — accumulation zone", status: "paused", expiry: null, createdAt: "2026-05-19T11:00:00Z", triggeredAt: null },
  { id: "pa6", type: "price", symbol: "EURUSD", timeframe: "1D", condition: "touch", targetPrice: 1.1, currentPrice: 1.0912, notes: "Parity resistance retrace", status: "active", expiry: "2026-05-28T00:00:00Z", createdAt: "2026-05-22T12:00:00Z", triggeredAt: null },
];

export const SAMPLE_ZONE_ALERTS: ZoneAlert[] = [
  { id: "za1", type: "zone", symbol: "NAS100", zoneType: "supply", upperPrice: 18750, lowerPrice: 18600, timeframe: "1H", condition: "touch", notes: "HTF supply zone from April distribution", status: "active", createdAt: "2026-05-22T09:00:00Z", triggeredAt: null },
  { id: "za2", type: "zone", symbol: "US30", zoneType: "demand", upperPrice: 38800, lowerPrice: 38500, timeframe: "4H", condition: "touch", notes: "Major demand — institutional buying zone", status: "active", createdAt: "2026-05-21T15:00:00Z", triggeredAt: null },
  { id: "za3", type: "zone", symbol: "XAUUSD", zoneType: "support_resistance", upperPrice: 2365, lowerPrice: 2345, timeframe: "1H", condition: "break", notes: "Consolidation block — break triggers momentum", status: "triggered", createdAt: "2026-05-20T08:00:00Z", triggeredAt: "2026-05-23T07:30:00Z" },
  { id: "za4", type: "zone", symbol: "BTCUSDT", zoneType: "order_block", upperPrice: 66000, lowerPrice: 65000, timeframe: "4H", condition: "retest", notes: "Bullish OB — last up close before impulse", status: "active", createdAt: "2026-05-20T12:00:00Z", triggeredAt: null },
  { id: "za5", type: "zone", symbol: "ETHUSDT", zoneType: "demand", upperPrice: 3100, lowerPrice: 2980, timeframe: "1D", condition: "touch", notes: "Daily demand — swing low retest expected", status: "paused", createdAt: "2026-05-18T10:00:00Z", triggeredAt: null },
  { id: "za6", type: "zone", symbol: "USOIL", zoneType: "supply", upperPrice: 84.5, lowerPrice: 83.1, timeframe: "4H", condition: "touch", notes: "Supply zone — short from here", status: "active", createdAt: "2026-05-22T07:00:00Z", triggeredAt: null },
];

export const SAMPLE_TRENDLINE_ALERTS: TrendlineAlert[] = [
  { id: "ta1", type: "trendline", symbol: "NAS100", timeframe: "1H", point1Price: 18100, point1Time: "2026-05-19T09:00:00Z", point2Price: 18350, point2Time: "2026-05-21T09:00:00Z", condition: "break", notes: "Ascending trendline break — shift in momentum", status: "active", createdAt: "2026-05-21T10:00:00Z", triggeredAt: null },
  { id: "ta2", type: "trendline", symbol: "ETHUSDT", timeframe: "4H", point1Price: 3400, point1Time: "2026-05-15T08:00:00Z", point2Price: 3280, point2Time: "2026-05-20T08:00:00Z", condition: "touch", notes: "Descending resistance line touch = short entry", status: "active", createdAt: "2026-05-20T09:00:00Z", triggeredAt: null },
  { id: "ta3", type: "trendline", symbol: "EURUSD", timeframe: "1H", point1Price: 1.078, point1Time: "2026-05-16T06:00:00Z", point2Price: 1.0845, point2Time: "2026-05-20T06:00:00Z", condition: "retest", notes: "Broken support now acting as resistance retest", status: "triggered", createdAt: "2026-05-20T07:00:00Z", triggeredAt: "2026-05-23T08:15:00Z" },
  { id: "ta4", type: "trendline", symbol: "USOIL", timeframe: "4H", point1Price: 85.5, point1Time: "2026-05-10T10:00:00Z", point2Price: 83.1, point2Time: "2026-05-18T10:00:00Z", condition: "break", notes: "Descending channel lower boundary break = bullish", status: "paused", createdAt: "2026-05-18T11:00:00Z", triggeredAt: null },
  { id: "ta5", type: "trendline", symbol: "SOLUSDT", timeframe: "1H", point1Price: 145, point1Time: "2026-05-17T08:00:00Z", point2Price: 153, point2Time: "2026-05-21T08:00:00Z", condition: "touch", notes: "Uptrend support — continuation buy opportunity", status: "active", createdAt: "2026-05-21T09:00:00Z", triggeredAt: null },
];

export const ALL_ALERTS: AnyAlert[] = [...SAMPLE_PRICE_ALERTS, ...SAMPLE_ZONE_ALERTS, ...SAMPLE_TRENDLINE_ALERTS];

// Production notifications come from live WebSocket alert events. This legacy
// export intentionally contains no demo history.
export const NOTIFICATION_HISTORY: Array<{
  id: string; symbol: string; message: string; type: AlertType;
  severity: "high" | "medium" | "low"; time: string; read: boolean;
}> = [];

export const TIMEFRAMES = ["1M", "5M", "15M", "30M", "1H", "4H", "1D", "1W"];

// Must stay in sync with ALERT_SYMBOLS in artifacts/api-server/src/lib/symbols.ts.
export const SYMBOLS = [
  "NAS100", "US30", "XAUUSD", "EURUSD", "GBPJPY",
  "USOIL", "UKOIL", "BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "PEPEUSD",
];
