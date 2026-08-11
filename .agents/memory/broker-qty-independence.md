---
name: Broker-independent quantity architecture
description: Delta Exchange (contracts/coin) and cTrader (lots) order-quantity systems must never share code paths, fallback defaults, or math
---

Delta Exchange and cTrader use fundamentally different quantity models:
- cTrader: lots, with `minVolumeLots`/`maxVolumeLots`/`stepVolumeLots`/`lotSizeNum` from ProtoOA.
  Live reference line: "1 Lot = {lotSizeNum} Units" (e.g. "1 Lot = 100,000 Units" for EURUSD).
- Delta: whole integer contracts, displayed as a coin amount UNLESS `contract_value === 1`
  (i.e. 1 contract == 1 coin unit exactly), in which case it displays as a raw contract count
  instead (e.g. FARTCOINUSD, contractValue=1 → "1 Contract"; DOGEUSD, contractValue=100 →
  "100 DOGE"; BTCUSD, contractValue=0.001 → "0.001 BTC"). The `contractValue < 1` threshold is
  WRONG — verified against real Delta app behavior, the only special case is `=== 1`.
  Always from Delta REST metadata (`contract_value`, `contract_unit_currency`, `tick_size`,
  `position_size_limit`) — never hardcoded. Live reference line: "1 Lot = {contractValue}
  {contractUnit}" always shown in coin terms regardless of the active display mode.

**Why:** The original bug was UI code that hardcoded `?? 0.01`, `?? 500`, `?? 0.01` fallbacks
for lot fields. Since Delta's lot fields are always null, every Delta symbol silently rendered
lot-based UI (wrong units, wrong precision, wrong step) instead of failing loudly or using
Delta's own metadata.

**How to apply:** Any UI or calc code touching order quantity must branch explicitly on the
resolved broker (`resolveBroker()` / `activeAccount.broker_id`) into two fully separate code
paths — one reading only `deltaQty` (a `DeltaQtySpec`), one reading only lot fields (a `LotSpec`).
Never fall back from one broker's spec to the other's defaults. Switching broker/symbol must
reset quantity state to the new broker's own minimum, not carry over the previous value.

Relevant files: `artifacts/trading-journal/src/lib/deltaMath.ts` (Delta-only pure math, mirrors
`lotMath.ts`'s cTrader-only pure math), `PlaceOrderPanel.tsx` (desktop) and
`MobileChartLayout.tsx` (mobile) both implement this branch pattern for quantity
input/validation/calc/submit. Backend: `contract_info.ts` has `buildDeltaSpec` (Delta REST) and
`buildCtraderSpec` (ProtoOA) as separate builders; `BrokerContractSpec.deltaQty` is null for
cTrader and populated only for Delta.
