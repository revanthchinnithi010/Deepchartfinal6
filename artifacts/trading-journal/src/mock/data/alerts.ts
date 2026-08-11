// Raw shapes as returned by the real /api/alerts, /api/zones, /api/trendlines
// endpoints (see artifacts/trading-journal/src/pages/alerts.tsx converters).

export const MOCK_API_PRICE_ALERTS = [
  { id: 1, symbol: "BTCUSDT", condition: "price_above", targetPrice: 70000, currentPrice: 64842, message: "Breakout above 70k — major resistance", isActive: true,  isTriggered: false, expiresAt: "2026-08-01T00:00:00Z", createdAt: "2026-06-28T10:00:00Z", triggeredAt: null },
  { id: 2, symbol: "ETHUSDT", condition: "price_below", targetPrice: 3000,  currentPrice: 3378, message: "Macro support — accumulation zone",   isActive: true,  isTriggered: false, expiresAt: null,                    createdAt: "2026-06-29T11:00:00Z", triggeredAt: null },
  { id: 3, symbol: "SOLUSDT", condition: "price_above", targetPrice: 165,   currentPrice: 145.6, message: "Range breakout target",              isActive: true,  isTriggered: false, expiresAt: "2026-07-20T00:00:00Z", createdAt: "2026-07-01T09:00:00Z", triggeredAt: null },
  { id: 4, symbol: "NAS100",  condition: "price_above", targetPrice: 18750, currentPrice: 18451, message: "Break above ATH — continuation entry", isActive: true, isTriggered: false, expiresAt: "2026-07-25T00:00:00Z", createdAt: "2026-06-30T08:00:00Z", triggeredAt: null },
  { id: 5, symbol: "US30",    condition: "price_below", targetPrice: 39000, currentPrice: 39680, message: "Key support breakdown — short setup", isActive: true, isTriggered: false, expiresAt: null,                    createdAt: "2026-06-27T14:00:00Z", triggeredAt: null },
  { id: 6, symbol: "XAUUSD",  condition: "price_above", targetPrice: 2350,  currentPrice: 2345.8, message: "Round number psychological level",   isActive: false, isTriggered: true,  expiresAt: null,                    createdAt: "2026-06-20T09:00:00Z", triggeredAt: "2026-07-08T06:45:00Z" },
  { id: 7, symbol: "EURUSD",  condition: "price_below", targetPrice: 1.085, currentPrice: 1.0912, message: "Parity resistance retrace",          isActive: true, isTriggered: false, expiresAt: "2026-07-18T00:00:00Z", createdAt: "2026-07-02T12:00:00Z", triggeredAt: null },
  { id: 8, symbol: "BTCUSDT", condition: "price_below", targetPrice: 60000, currentPrice: 64842, message: "Downside invalidation level",         isActive: false, isTriggered: false, expiresAt: "2026-07-01T00:00:00Z", createdAt: "2026-06-15T10:00:00Z", triggeredAt: null }, // expired
];

export const MOCK_API_ZONE_ALERTS = [
  { id: 101, symbol: "BTCUSDT", zoneType: "order_block",         upperPrice: 66000, lowerPrice: 65000, timeframe: "4H", condition: "retest", notes: "Bullish OB — last up close before impulse", isActive: true, isTriggered: false, createdAt: "2026-06-25T12:00:00Z", triggeredAt: null },
  { id: 102, symbol: "ETHUSDT", zoneType: "demand",              upperPrice: 3100,  lowerPrice: 2980,  timeframe: "1D", condition: "touch",  notes: "Daily demand — swing low retest expected",  isActive: false, isTriggered: false, createdAt: "2026-06-18T10:00:00Z", triggeredAt: null },
  { id: 103, symbol: "SOLUSDT", zoneType: "support_resistance",  upperPrice: 152,   lowerPrice: 140,   timeframe: "1H", condition: "break",  notes: "Consolidation block",                       isActive: true, isTriggered: false, createdAt: "2026-07-01T08:00:00Z", triggeredAt: null },
  { id: 104, symbol: "NAS100",  zoneType: "supply",              upperPrice: 18750, lowerPrice: 18600, timeframe: "1H", condition: "touch",  notes: "HTF supply zone from June distribution",    isActive: true, isTriggered: false, createdAt: "2026-06-22T09:00:00Z", triggeredAt: null },
  { id: 105, symbol: "XAUUSD",  zoneType: "support_resistance",  upperPrice: 2365,  lowerPrice: 2345,  timeframe: "1H", condition: "break",  notes: "Break triggers momentum",                   isActive: false, isTriggered: true, createdAt: "2026-06-20T08:00:00Z", triggeredAt: "2026-07-07T07:30:00Z" },
];

export const MOCK_API_TRENDLINE_ALERTS = [
  { id: 201, symbol: "US30",    timeframe: "1H", point1Price: 39100, point1Time: "2026-06-20T09:00:00Z", point2Price: 39420, point2Time: "2026-06-27T09:00:00Z", condition: "break",  notes: "Ascending trendline break — momentum shift", isActive: true, isTriggered: false, createdAt: "2026-06-27T10:00:00Z", triggeredAt: null },
  { id: 202, symbol: "EURUSD",  timeframe: "4H", point1Price: 1.0780, point1Time: "2026-06-15T08:00:00Z", point2Price: 1.0845, point2Time: "2026-06-24T08:00:00Z", condition: "retest", notes: "Broken support now resistance retest",       isActive: false, isTriggered: true, createdAt: "2026-06-24T09:00:00Z", triggeredAt: "2026-07-06T08:15:00Z" },
];
