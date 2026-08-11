/**
 * GET /api/market-calendar/:symbol
 *
 * Returns economic calendar events relevant to the active trading symbol.
 * Uses the free ForexFactory JSON feed (no API key required).
 *
 * Currency extraction:
 *   EURUSD → [EUR, USD]    (standard 6-letter FX pair)
 *   XAUUSD → [USD]         (XAU, XAG are metals — only the quote currency matters)
 *   BTCUSD → [USD]         (crypto — only quote currency)
 *   NAS100, US30, SPX → [USD]  (indices → USD)
 *   GBPJPY → [GBP, JPY]
 */

import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Known metal/commodity base codes that should NOT be treated as a currency
const NON_CURRENCY_BASES = new Set([
  "XAU", "XAG", "XPT", "XPD", "OIL", "WTI", "BCO",
  "BTC", "ETH", "XRP", "LTC", "ADA", "SOL", "DOGE", "BNB",
]);

// Major currencies (ISO 4217) for detecting FX pairs
const MAJOR_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD",
  "SEK", "NOK", "DKK", "SGD", "HKD", "MXN", "ZAR", "TRY",
  "CNY", "CNH", "INR", "BRL", "PLN", "CZK", "HUF",
]);

/**
 * Extract the relevant currency codes from a trading symbol.
 * Returns deduplicated array of currency codes (e.g. ["EUR","USD"]).
 */
function extractCurrencies(symbol: string): string[] {
  const s = symbol.toUpperCase().replace(/[._-]/, "");

  // Standard 6-char FX pair like EURUSD, GBPJPY
  if (s.length === 6) {
    const base  = s.slice(0, 3);
    const quote = s.slice(3, 6);
    const currencies: string[] = [];
    if (MAJOR_CURRENCIES.has(base) && !NON_CURRENCY_BASES.has(base))  currencies.push(base);
    if (MAJOR_CURRENCIES.has(quote) && !NON_CURRENCY_BASES.has(quote)) currencies.push(quote);
    if (currencies.length > 0) return currencies;
    // e.g. XAUUSD → base XAU ignored, quote USD returned
    if (NON_CURRENCY_BASES.has(base) && MAJOR_CURRENCIES.has(quote)) return [quote];
  }

  // Indices: NAS100, US30, SPX500, DJ30, GER40, UK100, etc.
  if (/^(NAS|NDX|SPX|SPY|QQQ|US|DJ|DOW|GER|UK|FRA|JPN|AUS|EU|IND)/.test(s)) {
    // US-based indices → USD; EU-based → EUR; UK → GBP; JP → JPY
    if (/^(NAS|NDX|US|DJ|DOW|SPX|SPY|QQQ)/.test(s)) return ["USD"];
    if (/^GER/.test(s)) return ["EUR"];
    if (/^UK/.test(s))  return ["GBP"];
    if (/^JPN/.test(s)) return ["JPY"];
    if (/^AUS/.test(s)) return ["AUD"];
    return ["USD"];
  }

  // Fallback — try to find any embedded major currencies
  for (const cur of MAJOR_CURRENCIES) {
    if (s.startsWith(cur) && !NON_CURRENCY_BASES.has(cur)) return [cur];
    if (s.endsWith(cur))   return [cur];
  }

  return ["USD"]; // ultimate fallback
}

interface FFEvent {
  title:    string;
  country:  string;
  date:     string;  // "MM-DD-YYYY"
  time:     string;  // "12:30pm" | "All Day" | "Tentative"
  impact:   string;  // "High" | "Medium" | "Low" | "Holiday"
  forecast: string;
  previous: string;
}

interface CalendarEvent {
  id:       string;
  title:    string;
  currency: string;
  date:     string;   // ISO date "YYYY-MM-DD"
  time:     string;
  impact:   "High" | "Medium" | "Low" | "Holiday";
  forecast: string;
  previous: string;
}

function normalizeDateStr(dateStr: string): string {
  // FF date format: "MM-DD-YYYY" → "YYYY-MM-DD"
  const parts = dateStr.split("-");
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  return dateStr;
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  USD: "USD", EUR: "EUR", GBP: "GBP", JPY: "JPY", CHF: "CHF",
  AUD: "AUD", CAD: "CAD", NZD: "NZD", CNY: "CNY", SGD: "SGD",
};

// Simple in-memory cache: keyed by week offset (0=this week, 1=next week)
const ffCache = new Map<number, { data: FFEvent[]; fetchedAt: number }>();
const FF_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function fetchFFWeek(weekOffset: 0 | 1): Promise<FFEvent[]> {
  const cached = ffCache.get(weekOffset);
  if (cached && Date.now() - cached.fetchedAt < FF_CACHE_TTL_MS) return cached.data;

  const url = weekOffset === 0
    ? "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
    : "https://nfs.faireconomy.media/ff_calendar_nextweek.json";

  const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!resp.ok) throw new Error(`ForexFactory calendar HTTP ${resp.status}`);
  const data = await resp.json() as FFEvent[];
  ffCache.set(weekOffset, { data, fetchedAt: Date.now() });
  return data;
}

router.get("/market-calendar/:symbol", async (req, res): Promise<void> => {
  const symbol    = (req.params["symbol"] ?? "").toUpperCase();
  const currencies = extractCurrencies(symbol);

  try {
    // Fetch this week + next week in parallel; gracefully handle failures
    const [thisWeek, nextWeek] = await Promise.allSettled([
      fetchFFWeek(0),
      fetchFFWeek(1),
    ]);

    const allEvents: FFEvent[] = [
      ...(thisWeek.status === "fulfilled" ? thisWeek.value : []),
      ...(nextWeek.status === "fulfilled" ? nextWeek.value : []),
    ];

    if (allEvents.length === 0) {
      const reason = [
        thisWeek.status === "rejected"  ? String(thisWeek.reason)  : null,
        nextWeek.status === "rejected"  ? String(nextWeek.reason)  : null,
      ].filter(Boolean).join("; ");
      res.json({ available: false, reason: reason || "No events returned", symbol, currencies });
      return;
    }

    // Map country code (ForexFactory uses "USD", "EUR" etc directly as country)
    const currencySet = new Set(currencies);

    const filtered: CalendarEvent[] = allEvents
      .filter(e => currencySet.has(e.country))
      .map((e, i) => ({
        id:       `${e.date}-${e.country}-${i}`,
        title:    e.title,
        currency: e.country,
        date:     normalizeDateStr(e.date),
        time:     e.time,
        impact:   (e.impact as CalendarEvent["impact"]) || "Low",
        forecast: e.forecast,
        previous: e.previous,
      }))
      .sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return  1;
        return 0;
      });

    res.json({
      available:  true,
      symbol,
      currencies,
      events:     filtered,
      source:     "ForexFactory",
      fetchedAt:  Date.now(),
    });
  } catch (err) {
    res.json({
      available: false,
      reason:    `Could not fetch economic calendar: ${String(err)}`,
      symbol,
      currencies,
    });
  }
});

export { router as marketCalendarRouter };
