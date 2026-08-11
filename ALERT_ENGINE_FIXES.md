# DeepChart Alert Engine — Complete Alert Fixes

## Alert types
- Price alerts
- Zone alerts
- Trendline / drawing alerts

## Price conditions
- Above (`price_above`)
- Below (`price_below`)
- Touch (`touch_price`) — fires only when price enters the touch band; it does not spam on every tick.
- % Up (`percent_change_up`) — uses provider 24h change when available, otherwise a session fallback.
- % Down (`percent_change_down`)

## Zone conditions
- Enter — outside -> inside
- Touch — reaches a zone boundary; entering the middle of the zone is not mislabeled as a touch.
- Break — inside -> outside, including a single tick that jumps across the full zone.
- Retest — a real break must happen first; only a later return from the broken side into the zone triggers Retest.

## Trendline / drawing conditions
- Touch
- Break / Breakout
- Retest — breakout -> move away -> return to the trendline touch band
- Cross Above
- Cross Below
- Rejection — touch then move away on the same side without crossing
- Above Price / Below Price
- Enter Zone / Exit Zone (trendline proximity band)
- ATR Proximity — repeatable proximity alert; it resets after price leaves the ATR band

## DB and UI behavior
- Charts and Alerts hydrate from the real DB instead of relying on stale localStorage.
- Triggered WebSocket events immediately update the global alert store.
- Delete removes the DB row and then updates UI; if DB deletion fails, the UI rolls back.
- Drawing alert IDs use `p_<id>`, `z_<id>`, `t_<id>` consistently.
- Alert creation from Charts / Alerts / quick-create is persisted through the API.
- Quick-create trendlines now use two different timestamps so the trendline can actually be projected.
- Duplicate ATR proximity creation from the overlay was removed.

## Telegram
Messages now clearly distinguish:
- Price Above / Below / Touch / % change
- Entered Zone
- Touched Zone Boundary
- Zone Break
- Zone Retest
- Trendline Touch / Break / Retest / Cross / Rejection / ATR Proximity

## Validation
The modified TypeScript/TSX files were syntax-checked with TypeScript in this environment. A full dependency install/build could not be run because the environment has no network access to the npm registry.
