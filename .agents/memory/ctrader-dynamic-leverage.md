---
name: cTrader dynamic leverage
description: How ProtoOADynamicLeverage works, confirmed field encoding and sentinel values from live wire data.
---

## Rule
`ProtoOADynamicLeverageTier.leverage` is stored in "cents" (×100), same convention as `ProtoOATrader.leverageInCents`. Always divide by 100 to get the display ratio.

**Why:** The proto comment just says "Applied leverage" with no unit hint, but confirmed from live PT2178 responses: NAS100 raw=10000→1:100, XAUUSD raw=50000→1:500.

**How to apply:** `fetchDynamicLeverage()` already divides by 100 before returning `DynamicLeverageTier`. Never divide again at display time.

## Sentinel volume
`volumeUsdCents ≥ 1e12` ($10B) means "flat leverage, no upper position cap". Use `SENTINEL_USD_CENTS = 1e12` to detect and display as a flat single value instead of a tier range table.

## Fields
- `ProtoOASymbol` field 35 → `leverageId` (links to `ProtoOADynamicLeverage` entity)
- PT 2177 = `PROTO_OA_GET_DYNAMIC_LEVERAGE_REQ`
- PT 2178 = `PROTO_OA_GET_DYNAMIC_LEVERAGE_RES`
- `ProtoOAGetDynamicLeverageByIDReq`: field2=ctidTraderAccountId, field3=leverageId
- `ProtoOAGetDynamicLeverageByIDRes`: field3=ProtoOADynamicLeverage
- `ProtoOADynamicLeverage`: field1=leverageId, field2=repeated `ProtoOADynamicLeverageTier`
- `ProtoOADynamicLeverageTier`: field1=volume (int64, USD cents), field2=leverage (int32, ×100)

## Max leverage
Tiers are sorted by volume ascending → `tier[0]` has the SMALLEST volume cap → HIGHEST leverage ratio → this is `maxSymbolLeverageNum`.

## Debug endpoint
`GET /api/ctrader/debug-leverage/:symbol` — forces fresh fetch, logs full hex, returns raw + interpreted tier data. Check API console for PT2178 hex dump.
