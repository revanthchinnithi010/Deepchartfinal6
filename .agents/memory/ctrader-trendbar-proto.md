---
name: cTrader ProtoOATrendbar wire layout
description: Actual field numbers and encoding for ProtoOATrendbar (confirmed via hex dump) — differs from published proto docs
---

## Rule

The `ProtoOATrendbar` messages received from the cTrader live API use this actual wire layout:

| Field | Content | Type | Encoding |
|-------|---------|------|----------|
| 3 | tick volume | uint64 | raw varint (no ZigZag) |
| 5 | low price (× 100000) | uint64 | raw varint (no ZigZag) |
| 6 | deltaOpen (open − low, ≥0) | uint64 | raw varint (no ZigZag) |
| 7 | deltaClose (close − low, ≥0) | uint64 | raw varint (no ZigZag) |
| 8 | deltaHigh (high − low, ≥0) | uint64 | raw varint (no ZigZag) |
| 9 | utcTimestampInMinutes | uint64 | raw varint (no ZigZag) |

And `ProtoOAGetTrendbarsRes` has trendbars at **field 5** (repeated bytes), not field 4.

**Why:** The published Spotware proto docs show fields 3–7 with sint64 ZigZag, but the live server sends fields 5–9 with uint64. All delta fields are non-negative offsets from low (not signed deltas), so ZigZag would produce wrong (negative) prices. Diagnosed by hex-dumping the first trendbar buffer from a live session.

**How to apply:**
- In `CtraderTickEngine._decodeTrendbars`: read outer field 5 (not 4) for trendbar bufs; read inner fields 5/6/7/8/9 (not 3/4/5/6/7); do NOT apply `_zigzag64` to any of them.
- Prices: `open = (low + deltaOpen) / 100000`, etc.
- Timestamp: `timeSec = rawTsMin * 60` (direct multiply, no ZigZag).
- Filter: `timeSec <= 0 || lowPrice <= 0` catches any malformed bars.

## Verified output (EURUSD 1m, July 2026)
- 500 bars, 0 OHLC violations
- First bar: 2026-07-03T12:35:00 o=1.14477 h=1.14486 lo=1.14474 c=1.14483
