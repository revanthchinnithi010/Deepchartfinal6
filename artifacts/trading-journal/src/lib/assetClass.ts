export type AssetClass = "crypto" | "forex" | "metal" | "index" | "commodity" | "unknown";
export type DataProvider = "delta" | "ctrader" | "unknown";

const METALS      = new Set(["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"]);
const INDICES     = new Set([
  "US30", "NAS100", "SPX500", "GER40", "UK100", "JP225", "AUS200", "STOXX50",
  "HK50", "CN50", "USTECH", "USTEC", "US500", "US2000", "EU50",
  "DE40", "FR40", "IT40", "ES35", "CH20", "NETH25", "SE30",
]);
const COMMODITIES = new Set([
  "USOIL", "UKOIL", "NGAS", "COPPER", "WHEAT", "CORN", "SUGAR", "COFFEE",
  "COCOA", "COTTON", "SOYBEANS", "LUMBER",
]);
const FOREX_PAIRS = new Set([
  "EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF",
  "EURGBP","GBPJPY","EURJPY","EURAUD","GBPAUD","NZDUSD",
  "USDSGD","USDHKD","USDMXN","USDZAR","USDNOK","USDSEK",
  "AUDCAD","AUDCHF","AUDNZD","CADCHF","CADJPY","CHFJPY",
  "EURNZD","EURCAD","EURCHF","GBPCAD","GBPCHF","GBPNZD",
  "NZDCAD","NZDCHF","NZDJPY",
]);

let runtimeRouting: Record<string, string> = {};
let runtimeClasses: Record<string, string> = {};
let runtimeReasons: Record<string, string> = {};

export function updateSymbolProviderRouting(
  routing: Record<string, string>,
  classes?: Record<string, string>,
  reasons?: Record<string, string>,
): void {
  runtimeRouting = routing;
  if (classes) runtimeClasses = classes;
  if (reasons) runtimeReasons = reasons;
}

export function getAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase().replace(/\.(pro|raw|ecn|std)$/i, "");

  const serverClass = runtimeClasses[s] as AssetClass | undefined;

  if (METALS.has(s))      return "metal";
  if (INDICES.has(s))     return "index";
  if (COMMODITIES.has(s)) return "commodity";
  if (FOREX_PAIRS.has(s)) return "forex";
  if (/^[A-Z0-9]{2,12}USDT$/.test(s)) return "crypto";
  if (/^[A-Z0-9]{2,8}USD$/.test(s) && !FOREX_PAIRS.has(s) && !METALS.has(s)) return "crypto";
  if (/^[A-Z]{6}$/.test(s)) return "forex";
  if (/^(US30|NAS|SPX|GER|UK1|JP2|AUS|DOW|DAX|CAC|FTSE|IBEX|DE4|FR4|IT4|ES3|EU5|CH2|SE3|NETH)/.test(s)) return "index";
  if (/^(OIL|GAS|WTI|BRENT|NGAS|USOIL|UKOIL|COPP|WHEAT|CORN|SUGAR|COFFEE|COCOA|COTTON)/.test(s)) return "commodity";

  return serverClass ?? "unknown";
}

export function getDataProvider(symbol: string): DataProvider {
  const cls = getAssetClass(symbol);
  if (cls === "crypto") return "delta";

  const s    = symbol.toUpperCase();
  const live = runtimeRouting[s];
  if (live === "delta")   return "delta";
  if (live === "ctrader") return "ctrader";

  return "unknown";
}

export function getRoutingReason(symbol: string): string {
  const s = symbol.toUpperCase();

  const serverReason = runtimeReasons[s];
  if (serverReason) return serverReason;

  const live = runtimeRouting[s];
  if (live === "ctrader") return "cTrader ProtoOA real-time spot subscription";

  const cls = getAssetClass(s);
  switch (cls) {
    case "crypto":    return "Crypto symbols always use Delta Exchange";
    case "forex":     return "No provider available for Forex symbols";
    case "metal":     return "No provider available for Metal symbols";
    case "index":     return "No provider available for Index symbols";
    case "commodity": return "No provider available for Commodity symbols";
    default:          return "Unknown — no provider matched";
  }
}

export function getAssetClassLabel(cls: AssetClass): string {
  switch (cls) {
    case "crypto":    return "Crypto";
    case "forex":     return "Forex";
    case "metal":     return "Metal";
    case "index":     return "Index";
    case "commodity": return "Commodity";
    default:          return "Unknown";
  }
}

export function getProviderLabel(provider: DataProvider): string {
  switch (provider) {
    case "delta":   return "Delta Exchange";
    case "ctrader": return "cTrader";
    default:        return "Unknown";
  }
}

export function getProviderFullLabel(provider: DataProvider): string {
  switch (provider) {
    case "delta":   return "Delta Exchange India";
    case "ctrader": return "cTrader (ProtoOA)";
    default:        return "Unknown";
  }
}
