---
name: ProtoOASymbol real field numbers
description: verified field numbers for ProtoOA Symbol/Trader messages, vs. old unverified guesses
---

The original `fetchSingleSymbolSpec` in ctraderProtoOA.ts used field numbers guessed without
consulting the source `.proto` (29/30 as initial/maintenance margin doubles, 32 as tradeMode,
34 as swapType, 37 as description, 13 as scheduleTimeZone, 14 as commissionType). These were
wrong per the real spotware/openapi-proto-messages ProtoOASymbol definition.

Verified real field numbers: 1 symbolId, 2 digits, 3 pipPosition, 6 swapRollover3Days
(Triple Swap Day), 7 swapLong(double), 8 swapShort(double), 9 maxVolume, 10 minVolume,
11 stepVolume, 15 commissionType, 16 slDistance, 17 tpDistance, 20 distanceSetIn,
23 minCommissionAsset(str), 26 scheduleTimeZone(str), 27 tradingMode (execution mode enum),
29 swapCalculationType, 30 lotSize(cents,/100), 32 preciseMinCommission(/1e8),
34 pnlConversionFeeRate (currency conversion fee, 1=0.01%), 36 swapPeriod(hrs), 40 measurementUnits.
Full Symbol message has NO plain "description" field (that only exists on ProtoOALightSymbol,
field 7, along with baseAssetId=4/quoteAssetId=5).

ProtoOATrader (via TRADER_REQ/RES, PT 2121/2122): leverage = field10/100, maxLeverage = field12/100,
moneyDigits = field20, depositAssetId = field8, accountType = field15.

**Why:** No live cTrader account was available to hex-dump and empirically verify: had to derive
values from the official proto source text instead of the previous approach of guessing/copying
adjacent numbers. Any future ProtoOA symbol/trader field work should start from the official
.proto definitions (github.com/spotware/openapi-proto-messages), not from adjacent guesses.

**How to apply:** When adding new ProtoOA symbol/trader/margin/depth fields to
artifacts/api-server/src/lib/ctraderProtoOA.ts, fetch the real `.proto` text first and cross-check
field numbers before wiring them into fetchSingleSymbolSpec/fetchTraderInfo. Note PT.HEARTBEAT_EVENT
(value 51) was previously only in the debug-name lookup table (PT_NAME), not the typed `PT` const,
causing a TS error wherever code referenced `PT.HEARTBEAT_EVENT` — now added to `PT`.
