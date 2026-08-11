---
name: cTrader ProtoOA volume encoding — correct conversion formula
description: The minVolume/maxVolume/stepVolume fields are NOT centilots; correct formula confirmed via live hex-dump.
---

## Rule

ProtoOA `minVolume`, `maxVolume`, `stepVolume` (fields 10, 9, 11) are in **1/100 units**,
the same unit system as `lotSize` (field 30). The correct conversion to lots is:

```
volumeLots = rawVolume / (100 × lotSizeUnits)
```

where `lotSizeUnits` = `spec.lotSize` (already divided by 100 from raw field 30, giving units per lot).

**Do NOT use `rawVolume / 100`** — that gives units, not lots.

### Verified values (EURUSD, live cTrader account):
| Field | Raw value | Formula | Result |
|---|---|---|---|
| minVolume (field 10) | 100,000 | 100,000 / (100 × 100,000) | 0.01 lots ✓ |
| maxVolume (field 9)  | 1,000,000,000 | 1e9 / (100 × 100,000) | 100 lots ✓ |
| stepVolume (field 11)| 100,000 | 100,000 / (100 × 100,000) | 0.01 lots ✓ |
| lotSize (field 30)   | 10,000,000 | 10,000,000 / 100 | 100,000 units ✓ |

**Why:** The original code divided by 100 (treating volumes as centilots). This was wrong — it gave EURUSD a min of 1,000 lots. The ProtoOA .proto comments say "(in cents)" for all these fields, meaning 1/100 of a unit, so the divisor is `100 × lotSizeUnits`.

**How to apply:** Any new code that converts raw ProtoOA volume fields to lots must use `rawVol / (100 * spec.lotSize)` where `spec.lotSize` is already in units (field 30 ÷ 100). The conversion lives in `artifacts/api-server/src/routes/contract_info.ts` → `buildCtraderSpec`. The sanity check rejects values > 100 lots (legitimate broker minimums don't exceed this).
