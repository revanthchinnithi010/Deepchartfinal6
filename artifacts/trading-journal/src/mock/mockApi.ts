// URL-keyed mock API router. Given a method + pathname, returns a JSON body
// to serve instead of hitting the real network — or `undefined` to pass the
// request through untouched (used for anything this mock layer doesn't own,
// e.g. WS upgrade requests, health checks, telegram/delta connection probes).
import { MOCK_STATS_SUMMARY } from "./data/dashboard";
import { MOCK_EQUITY_CURVE, MOCK_WEEKLY_PNL } from "./data/reports";
import { MOCK_CALENDAR_DAYS } from "./data/calendar";
import { MOCK_SYMBOL_STATS } from "./data/watchlist";
import { MOCK_TRADES, toApiTrade } from "./data/trades";
import { MOCK_NOTES } from "./data/notebook";
import {
  MOCK_BROKER_ACCOUNTS,
  MOCK_DELTA_BALANCE, MOCK_CTRADER_BALANCE,
  MOCK_DELTA_POSITIONS, MOCK_CTRADER_POSITIONS,
  MOCK_DELTA_ORDERS, MOCK_CTRADER_ORDERS,
} from "./data/portfolio";

type Route = { test: (method: string, path: string) => boolean; body: (search: URLSearchParams) => unknown };

const routes: Route[] = [
  { test: (m, p) => m === "GET" && p === "/api/stats/summary",          body: () => MOCK_STATS_SUMMARY },
  { test: (m, p) => m === "GET" && p === "/api/stats/equity-curve",     body: () => MOCK_EQUITY_CURVE },
  { test: (m, p) => m === "GET" && p === "/api/stats/weekly-pnl",       body: () => MOCK_WEEKLY_PNL },
  { test: (m, p) => m === "GET" && p === "/api/stats/calendar-heatmap", body: (search) => {
      const year  = search.get("year")  ? Number(search.get("year"))  : null;
      const month = search.get("month") ? Number(search.get("month")) : null;
      return MOCK_CALENDAR_DAYS.filter(d => {
        if (year  && Number(d.date.slice(0, 4))  !== year)  return false;
        if (month && Number(d.date.slice(5, 7))  !== month) return false;
        return true;
      });
    } },
  { test: (m, p) => m === "GET" && p === "/api/stats/symbol-breakdown", body: () => MOCK_SYMBOL_STATS },

  { test: (m, p) => m === "GET" && p === "/api/trades", body: (search) => {
      const limit = Number(search.get("limit")) || MOCK_TRADES.length;
      const page = Number(search.get("page")) || 1;
      const symbol = search.get("symbol");
      const outcome = search.get("outcome");
      const date = search.get("date"); // YYYY-MM-DD

      let filtered = MOCK_TRADES;
      if (symbol) {
        const needle = symbol.toLowerCase();
        filtered = filtered.filter(t => t.symbol.toLowerCase().includes(needle));
      }
      if (outcome) {
        filtered = filtered.filter(t => t.outcome === outcome);
      }
      if (date) {
        // Match the calendar's grouping: exitDate UTC-slice (first 10 chars of ISO string).
        // Open trades (empty exitDate) are excluded when filtering by date.
        filtered = filtered.filter(t => t.exitDate && t.exitDate.slice(0, 10) === date);
      }

      const start = (page - 1) * limit;
      const sliced = filtered.slice(start, start + limit);
      return { trades: sliced.map(toApiTrade), total: filtered.length, page, limit };
    } },

  { test: (m, p) => m === "GET" && p === "/api/notes", body: () => MOCK_NOTES },

  // NOTE: /api/alerts, /api/zones, /api/trendlines are intentionally NOT
  // mocked here.  Alert state is mutated via real POST/PATCH/DELETE calls, so
  // GET must also hit the real API — otherwise GET would keep returning fixed
  // mock rows that the AlertEngine never sees (it reads from the DB, not from
  // React state), and zone/price/trendline alerts would never fire.

  { test: (m, p) => m === "GET" && p === "/api/broker-accounts", body: () => ({ ok: true, accounts: MOCK_BROKER_ACCOUNTS }) },

  { test: (m, p) => m === "GET" && p === "/api/broker/delta/balance",   body: () => ({ ok: true, balance: MOCK_DELTA_BALANCE }) },
  { test: (m, p) => m === "GET" && p === "/api/broker/delta/positions", body: () => ({ ok: true, positions: MOCK_DELTA_POSITIONS }) },
  { test: (m, p) => m === "GET" && p === "/api/broker/delta/orders",    body: () => ({ ok: true, orders: MOCK_DELTA_ORDERS }) },

  { test: (m, p) => m === "GET" && p === "/api/ctrader/balance",   body: () => ({ ok: true, balance: MOCK_CTRADER_BALANCE }) },
  { test: (m, p) => m === "GET" && p === "/api/ctrader/positions", body: () => ({ ok: true, positions: MOCK_CTRADER_POSITIONS }) },
  { test: (m, p) => m === "GET" && p === "/api/ctrader/orders",    body: () => ({ ok: true, orders: MOCK_CTRADER_ORDERS }) },

  // NOTE: /api/watchlist is intentionally NOT mocked here. Favorites/watchlist
  // state is mutated via real POST/PATCH/DELETE calls (brokerWatchlistStore),
  // so GET must also hit the real API — otherwise GET would keep returning
  // fixed mock rows with IDs that don't exist in the real DB, and every
  // mutation against those IDs would 404 while the UI silently reverts.
];

/** Returns a mock JSON body for the given request, or `undefined` if unmocked. */
export function matchMockRoute(method: string, path: string, search: URLSearchParams): unknown | undefined {
  for (const route of routes) {
    if (route.test(method, path)) return route.body(search);
  }
  return undefined;
}
