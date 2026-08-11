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

export const SAMPLE_PRICE_ALERTS: PriceAlert[] = [];
export const SAMPLE_ZONE_ALERTS: ZoneAlert[] = [];
export const SAMPLE_TRENDLINE_ALERTS: TrendlineAlert[] = [];
export const ALL_ALERTS: AnyAlert[] = [];

// Production notifications come from live WebSocket alert events. Keep this
// legacy export empty so demo history can never appear in the UI.
export const NOTIFICATION_HISTORY: Array<{
  id: string;
  symbol: string;
  message: string;
  type: AlertType;
  severity: "high" | "medium" | "low";
  time: string;
  read: boolean;
}> = [];

export const TIMEFRAMES = ["1M", "5M", "15M", "30M", "1H", "4H", "1D", "1W"];

// Must stay in sync with ALERT_SYMBOLS in artifacts/api-server/src/lib/symbols.ts.
// Crypto uses the plain USD suffix (BTCUSD, not BTCUSDT) to match the internal
// symbol name emitted by the Delta Exchange provider's tick events, ensuring
// zone.symbol === tick.symbol in the AlertEngine evaluateZones() comparisons.
export const SYMBOLS = [
  "NAS100", "US30",
  "XAUUSD", "EURUSD", "GBPJPY",
  "USOIL",  "UKOIL",
  "BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "PEPEUSD",
];
