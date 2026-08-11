# Trading Journal Project Rules

## Architecture
- React + TypeScript only
- Reuse existing components
- No duplicate components
- Mobile first design
- Do not break desktop layouts

## UI Theme
- Dark monochrome theme
- Primary background: #0F1618
- Profit = Green
- Loss = Red
- No unnecessary bright colors

## Market Data
- Delta Exchange and cTrader only
- No Finnhub
- No mock data
- Tick-by-tick data wherever available

## Markets
- Category based markets
- Forex
- Indices
- Commodities
- Crypto
- Stocks

## Watchlist
- Auto subscribe when symbol added
- Auto unsubscribe when removed
- Mobile and desktop watchlists must stay synchronized

## cTrader
- OAuth authentication
- Fetch all available symbols
- Category-wise display
- Real-time tick data
- Support positions, orders and account information

## Charts
- Smooth rendering
- Mobile mini control bar
- Watchlist popup synced with Markets section

## Development Rules
- Fix root cause, not temporary patches
- Verify before marking complete
- No hardcoded demo data