import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { pool } from "@workspace/db";
import { decrypt } from "../services/BrokerEncryption.js";
import {
  fetchSingleSymbolSpec, fetchTraderInfo, fetchDynamicLeverage, fetchAssetList,
  type CtraderAsset, type DynamicLeverageTier, type CtraderSymbolSpec,
} from "../lib/ctraderProtoOA.js";

const DELTA_INDIA_REST = "https://api.india.delta.exchange";
const CACHE_TTL_MS     = 5  * 60 * 1_000;
const SPEC_CACHE_TTL   = 10 * 60 * 1_000;

interface RawDeltaProduct {
  symbol:                  string;
  description?:            string;
  short_description?:      string;
  contract_type:           string;
  trading_status:          string;
  contract_value?:         string | number | null;
  contract_unit_currency?: string;
  tick_size?:              string | number | null;
  initial_margin?:         string | number;
  maintenance_margin?:     string | number;
  default_leverage?:       string | number;
  max_leverage?:           string | number;
  underlying_asset?:       { symbol: string };
  settling_asset?:         { symbol: string };
  spot_index?:             { symbol: string };
  position_size_limit?:    number | null;
}

interface RawTicker {
  symbol:        string;
  mark_price?:   string | number;
  spot_price?:   string | number;
  turnover_usd?: string | number;
  oi_value_usd?: string | number;
  funding_rate?: string | number;
}

export interface ContractInfo {
  symbol:             string;
  description:        string;
  type:               string;
  lotSize:            string;
  lotSizeNum:         number;
  tickSize:           string;
  settlementCurrency: string;
  initialMargin:      string;
  maintenanceMargin:  string;
  maxLeverage:        string;
  maxLeverageNum:     number;
  underlyingIndex:    string;
  positionLimit:      string;
  status:             string;
}

export interface ContractField {
  label:     string;
  value:     string;
  highlight?: boolean;
}

/**
 * Delta Exchange quantity specification — completely independent from cTrader's
 * lot-based system. Delta orders are always placed as a whole number of contracts;
 * each contract represents `contractValue` units of the underlying (e.g. 0.001 BTC).
 *
 * Display rule (matches the official Delta Exchange app):
 *  - contractValue < 1  → quantityMode "coin": show quantity in the underlying coin
 *    (contracts × contractValue), e.g. "0.001 BTC", "0.01 ETH".
 *  - contractValue >= 1 → quantityMode "contracts": show raw integer contracts,
 *    e.g. "100 Contracts".
 * Orders themselves are always submitted as an integer contract count — the coin
 * display is a derived label only.
 */
export interface DeltaQtySpec {
  /** Underlying asset / contract unit symbol, e.g. "BTC", "ETH", "FARTCOIN". */
  contractUnit:          string;
  /** Coin (or unit) amount represented by exactly 1 contract, e.g. 0.001. */
  contractValue:         number;
  /** Minimum order size in whole contracts (Delta requires integer contracts). */
  minOrderSizeContracts: number;
  /** Maximum order size in whole contracts (from position_size_limit). */
  maxOrderSizeContracts: number;
  /** Contract increment step — always 1 whole contract on Delta. */
  stepSizeContracts:     number;
  /** Minimum price increment. */
  tickSize:              number;
  /** Decimal places for price display, derived from tickSize. */
  pricePrecision:        number;
  /** "coin" when contractValue < 1 (show coin qty), "contracts" otherwise. */
  quantityMode:          "coin" | "contracts";
  /** Decimal places needed to represent quantity in the active quantityMode. */
  quantityPrecision:     number;
}

export interface BrokerContractSpec {
  broker:            "delta" | "ctrader";
  symbol:            string;
  fetchedAt:         number;
  description:       string;
  maxLeverageNum:    number;
  lotSizeNum:        number;
  settlementCurrency: string;
  partial?:          boolean;
  fields:            ContractField[];
  // ── cTrader quantity spec (null for Delta — cTrader lots must NEVER be used for Delta) ──
  /**
   * Minimum tradeable quantity in lots, e.g. 0.01.
   * Conversion: rawMinVolume / (100 × lotSizeUnits).
   * ProtoOA volumes are in 1/100-units (same unit as lotSize field 30),
   * NOT centilots. Divide by (100 × lotSizeUnits) — not just 100 — to get lots.
   */
  minVolumeLots:  number | null;
  /** Maximum tradeable quantity in lots, e.g. 500. Same conversion as minVolumeLots. */
  maxVolumeLots:  number | null;
  /** Volume increment in lots, e.g. 0.01. Same conversion as minVolumeLots. */
  stepVolumeLots: number | null;
  /** Actual account leverage (e.g. 100 for 1:100), read from ProtoOATrader field 10 ÷ 100. */
  leverage:       number | null;
  /**
   * Symbol-specific maximum leverage — DISTINCT from account leverage. For Delta this is
   * read directly from the product's own max_leverage / initial_margin (always real,
   * per-contract). For cTrader this is read from ProtoOADynamicLeverage (PT 2177/2178)
   * via the leverageId in ProtoOASymbol field 35 — the first (highest-leverage) tier's
   * ratio after dividing by 100 (stored in "cents" like ProtoOATrader.leverageInCents).
   * Null only when leverageId is absent in the symbol spec.
   */
  maxSymbolLeverageNum: number | null;
  /** Pip decimal position (e.g. 4 for EURUSD means 1 pip = 0.0001). */
  pipPosition:    number | null;
  /** Price decimal precision shown by broker (e.g. 5 for EURUSD). */
  digits:         number | null;
  /** Delta Exchange contract spec (null for cTrader — never mix broker specifications). */
  deltaQty:       DeltaQtySpec | null;
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  perpetual_futures: "Linear Perpetual",
  futures:           "Linear Future",
  call_options:      "Call Option",
  put_options:       "Put Option",
  spot:              "Spot",
};

function toMarginPct(v: string | number | undefined): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n) || n === 0) return "—";
  return `${n}%`;
}

/**
 * Convert a margin-requirement percentage into the maximum leverage it implies.
 * Example: 0.5% → 1:200, 1% → 1:100, 2% → 1:50.
 * Returns null (never a fabricated number) for invalid/zero input.
 */
function marginPctToMaxLeverage(marginPct: number): number | null {
  if (isNaN(marginPct) || marginPct <= 0) return null;
  return Math.round(100 / marginPct);
}

function formatProduct(p: RawDeltaProduct): ContractInfo {
  const underlying = p.underlying_asset?.symbol ?? p.symbol.replace(/USD.*$/, "");
  const settling   = p.settling_asset?.symbol ?? "USD";
  const unit       = p.contract_unit_currency ?? underlying;

  const contractVal = parseFloat(String(p.contract_value ?? "1"));
  const lotSizeNum  = !isNaN(contractVal) && contractVal > 0 ? contractVal : 1;
  const lotSize     = `${lotSizeNum} ${unit}`;

  const tickVal  = parseFloat(String(p.tick_size ?? "0"));
  const tickSize = !isNaN(tickVal) && tickVal > 0 ? String(tickVal) : "—";

  const rawMaxLev = parseFloat(String(p.max_leverage  ?? "0"));
  const rawDefLev = parseFloat(String(p.default_leverage ?? "0"));
  const rawIM     = parseFloat(String(p.initial_margin ?? "0"));

  let maxLeverageNum = 0;
  if (!isNaN(rawMaxLev) && rawMaxLev > 0) {
    maxLeverageNum = Math.round(rawMaxLev);
  } else if (!isNaN(rawIM) && rawIM > 0) {
    maxLeverageNum = marginPctToMaxLeverage(rawIM) ?? 0;
  } else if (!isNaN(rawDefLev) && rawDefLev > 0) {
    maxLeverageNum = Math.round(rawDefLev);
  }
  const maxLeverage = maxLeverageNum > 0 ? `${maxLeverageNum}x` : "—";

  const posLimit = (() => {
    const posLimitContracts = p.position_size_limit;
    if (!posLimitContracts) return "—";
    const cv = parseFloat(String(p.contract_value ?? "0"));
    if (!isNaN(cv) && cv > 0) return `${posLimitContracts * cv} ${unit}`;
    return `${posLimitContracts} contracts`;
  })();

  const underlyingIndex = p.spot_index?.symbol ?? `.DEX${underlying}${settling}`;

  const contractTypeLabel = CONTRACT_TYPE_LABELS[p.contract_type] ?? p.contract_type ?? "";
  const description = p.short_description
    ?? p.description
    ?? (`${underlying} ${contractTypeLabel}`.trim() || p.symbol);

  return {
    symbol:             p.symbol,
    description,
    type:               CONTRACT_TYPE_LABELS[p.contract_type] ?? p.contract_type ?? "—",
    lotSize,
    lotSizeNum,
    tickSize,
    settlementCurrency: settling,
    initialMargin:      toMarginPct(p.initial_margin),
    maintenanceMargin:  toMarginPct(p.maintenance_margin),
    maxLeverage,
    maxLeverageNum,
    underlyingIndex,
    positionLimit:      posLimit,
    status:             p.trading_status === "operational" ? "Operational" : (p.trading_status ?? "—"),
  };
}

const cache     = new Map<string, { data: ContractInfo;       fetchedAt: number }>();
const specCache = new Map<string, { data: BrokerContractSpec; fetchedAt: number }>();

// ── Asset list cache (base/quote name resolution) ─────────────────────────────
// Asset list is stable per account — cache for a long time and key by accountId.
const assetListCache = new Map<number, { data: CtraderAsset[]; fetchedAt: number }>();
const ASSET_LIST_TTL = 60 * 60 * 1_000; // 1h

async function getAssetList(opts: {
  ctidTraderAccountId: number; isLive: boolean; accessToken: string;
  clientId: string; clientSecret: string;
}): Promise<CtraderAsset[]> {
  const hit = assetListCache.get(opts.ctidTraderAccountId);
  if (hit && Date.now() - hit.fetchedAt < ASSET_LIST_TTL) return hit.data;
  const data = await fetchAssetList(opts);
  assetListCache.set(opts.ctidTraderAccountId, { data, fetchedAt: Date.now() });
  return data;
}

/** Resolve a symbol name (e.g. "EURUSD", "XAUUSD") into { base, quote } ISO-style codes.
 *  Purely derived from the symbol's own name — no fabricated data — since FX/metal pairs
 *  are always base+quote concatenated 3-letter codes. Returns null when not applicable
 *  (indices/commodities like NAS100, US30 aren't asset pairs). */
function splitSymbolIntoAssets(symbolName: string): { base: string; quote: string } | null {
  const s = symbolName.toUpperCase();
  if (/^[A-Z]{6}$/.test(s)) return { base: s.slice(0, 3), quote: s.slice(3, 6) };
  return null;
}

/** Compute open/closed status + time of next change from a real ProtoOA weekly schedule.
 *  schedule: seconds-from-Sunday-00:00 intervals, expressed in `tz` (symbol's own timezone).
 *  Returns null (never fabricated) if the schedule is empty or the timezone can't be resolved. */
function computeMarketStatus(
  schedule: Array<{ startSecond: number; endSecond: number }>,
  tz: string | null,
  nowMs = Date.now(),
): { isOpen: boolean; nextChangeAt: number; reason: string } | null {
  if (!schedule || schedule.length === 0 || !tz) return null;

  let weekdayIdx: number, hh: number, mm: number, ss: number;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(new Date(nowMs));
    const get   = (type: string) => parts.find(p => p.type === type)?.value ?? "";
    const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    weekdayIdx = WD[get("weekday")];
    hh = parseInt(get("hour"), 10) % 24;
    mm = parseInt(get("minute"), 10);
    ss = parseInt(get("second"), 10);
    if (weekdayIdx === undefined || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  } catch {
    return null; // unrecognized timezone string — do not guess
  }

  const nowSec = weekdayIdx * 86400 + hh * 3600 + mm * 60 + ss;
  const WEEK   = 7 * 86400;
  const sorted = [...schedule].sort((a, b) => a.startSecond - b.startSecond);

  for (const { startSecond, endSecond } of sorted) {
    if (nowSec >= startSecond && nowSec < endSecond) {
      return { isOpen: true, nextChangeAt: nowMs + (endSecond - nowSec) * 1000, reason: "Market open" };
    }
  }

  let best: number | null = null;
  for (const { startSecond } of sorted) {
    const delta = startSecond >= nowSec ? startSecond - nowSec : startSecond + WEEK - nowSec;
    if (best === null || delta < best) best = delta;
  }
  if (best === null) return { isOpen: false, nextChangeAt: nowMs, reason: "No sessions scheduled" };
  return { isOpen: false, nextChangeAt: nowMs + best * 1000, reason: "Market closed" };
}

// ── Helpers shared by Delta spec builder ──────────────────────────────────────

function fmtDeltaPrice(v: unknown): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n) || n === 0) return "—";
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1_000)  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (n >= 1)      return n.toFixed(4);
  return n.toPrecision(4);
}

function fmtFunding(v: unknown): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(4)}%`;
}

function nextFundingCountdown(): string {
  const now        = new Date();
  const currMins   = now.getUTCHours() * 60 + now.getUTCMinutes();
  const dayMins    = 24 * 60;
  const funding    = [0, 8 * 60, 16 * 60]; // 00:00, 08:00, 16:00 UTC
  const remaining  = Math.min(
    ...funding.map(fm => ((fm - currMins + dayMins) % dayMins) || dayMins),
  );
  const h = Math.floor(remaining / 60);
  const m = remaining % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Delta quantity spec builder ───────────────────────────────────────────────
// Delta Exchange has no independent min/max/step order-size fields in the public
// product schema — orders are always placed in whole contracts (integer step=1,
// min=1 contract). Read ONLY Delta metadata here; never fall back to cTrader lots.
function computeDeltaQty(p: RawDeltaProduct): DeltaQtySpec | null {
  const contractValue = parseFloat(String(p.contract_value ?? "0"));
  if (isNaN(contractValue) || contractValue <= 0) return null;

  const tickSize = parseFloat(String(p.tick_size ?? "0"));
  const pricePrecision = (!isNaN(tickSize) && tickSize > 0)
    ? Math.max(0, (String(tickSize).split(".")[1] ?? "").length)
    : 2;

  const contractUnit = p.contract_unit_currency
    ?? p.underlying_asset?.symbol
    ?? p.symbol.replace(/USD.*$/, "");

  const maxOrderSizeContracts = (p.position_size_limit && p.position_size_limit > 0)
    ? p.position_size_limit
    : 1_000_000;

  // Matches the official Delta Exchange app: quantity is expressed in the
  // underlying coin UNLESS one contract exactly equals one coin unit (contractValue
  // === 1), in which case "Contracts" and coin quantity are identical and Delta
  // labels it "Contracts" instead (e.g. FARTCOINUSD: 1 contract = 1 FARTCOIN → "1 Contract").
  const quantityMode: "coin" | "contracts" =
    Math.abs(contractValue - 1) < 1e-9 ? "contracts" : "coin";
  const quantityPrecision = quantityMode === "coin"
    ? Math.max(0, (String(contractValue).split(".")[1] ?? "").length)
    : 0;

  return {
    contractUnit,
    contractValue,
    minOrderSizeContracts: 1,
    maxOrderSizeContracts,
    stepSizeContracts: 1,
    tickSize: !isNaN(tickSize) && tickSize > 0 ? tickSize : 0,
    pricePrecision,
    quantityMode,
    quantityPrecision,
  };
}

// ── Delta spec builder ────────────────────────────────────────────────────────

async function buildDeltaSpec(symbol: string): Promise<BrokerContractSpec> {
  const [prodRes, tickRes] = await Promise.allSettled([
    fetch(`${DELTA_INDIA_REST}/v2/products?states=live`, {
      signal:  AbortSignal.timeout(10_000),
      headers: { Accept: "application/json", "User-Agent": "TradeVault/1.0" },
    }),
    fetch(`${DELTA_INDIA_REST}/v2/tickers`, {
      signal:  AbortSignal.timeout(8_000),
      headers: { Accept: "application/json", "User-Agent": "TradeVault/1.0" },
    }),
  ]);

  let product: RawDeltaProduct | undefined;
  if (prodRes.status === "fulfilled" && prodRes.value.ok) {
    const body = await prodRes.value.json() as { result?: RawDeltaProduct[] };
    product = (body.result ?? []).find(p => p.symbol === symbol);
    if (product) cache.set(symbol, { data: formatProduct(product), fetchedAt: Date.now() });
  }
  if (!product) {
    const stale = cache.get(symbol);
    if (stale) product = stale.data as unknown as RawDeltaProduct;
    else throw new Error(`Delta: product not found for ${symbol}`);
  }

  const info = formatProduct(product);

  const liveFields: ContractField[] = [];
  if (tickRes.status === "fulfilled" && tickRes.value.ok) {
    const tbody = await tickRes.value.json() as { result?: RawTicker[] };
    const r = (tbody.result ?? []).find(t => t.symbol === symbol);
    if (r) {
      const mark    = fmtDeltaPrice(r.mark_price);
      const index   = fmtDeltaPrice(r.spot_price);
      const funding = fmtFunding(r.funding_rate);
      if (mark    !== "—") liveFields.push({ label: "Mark Price",        value: mark });
      if (index   !== "—") liveFields.push({ label: "Index Price",       value: index });
      if (funding !== "—") {
        liveFields.push({ label: "Funding Rate (8h)", value: funding });
        liveFields.push({ label: "Next Funding In",   value: nextFundingCountdown() });
      }
    }
  }

  const fields: ContractField[] = [
    { label: "Contract Type",       value: info.type },
    { label: "Description",         value: info.description },
    { label: "Lot Size",            value: info.lotSize },
    { label: "Tick Size",           value: info.tickSize },
    { label: "Settlement Currency", value: info.settlementCurrency },
    { label: "Initial Margin",      value: info.initialMargin },
    { label: "Maintenance Margin",  value: info.maintenanceMargin },
    { label: "Max Symbol Leverage", value: info.maxLeverage },
    { label: "Underlying Index",    value: info.underlyingIndex },
    { label: "Position Limit",      value: info.positionLimit },
    { label: "Trading Status",      value: info.status, highlight: info.status === "Operational" },
    ...liveFields,
  ].filter(f => f.value && f.value !== "—");

  const deltaQty = computeDeltaQty(product);
  if (deltaQty) {
    logger.info({ symbol, deltaQty }, "contract-spec/delta: quantity spec parsed (contracts, NOT lots)");
  } else {
    logger.warn({ symbol }, "contract-spec/delta: unable to derive deltaQty — contract_value missing/invalid");
  }

  return {
    broker:             "delta",
    symbol,
    fetchedAt:          Date.now(),
    description:        info.description,
    maxLeverageNum:     info.maxLeverageNum,
    lotSizeNum:         info.lotSizeNum,
    settlementCurrency: info.settlementCurrency,
    fields,
    // Delta uses contract-based sizing; cTrader lot fields must stay null — never mix specs
    minVolumeLots:  null,
    maxVolumeLots:  null,
    stepVolumeLots: null,
    leverage:       null,
    // Delta's max leverage is always symbol-specific real data (from the product's own
    // max_leverage / initial_margin) — never a generic account-wide value.
    maxSymbolLeverageNum: info.maxLeverageNum > 0 ? info.maxLeverageNum : null,
    pipPosition:    null,
    digits:         null,
    deltaQty,
  };
}

// ── cTrader spec builder ──────────────────────────────────────────────────────

async function buildCtraderSpec(symbol: string): Promise<BrokerContractSpec> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_symbols (
      symbol_id   INT, symbol_name TEXT, description TEXT,
      pip_position INT, digits INT, fetched_at TIMESTAMPTZ DEFAULT NOW()
    )`);

  const symRow = await pool.query<{
    symbol_id: number; symbol_name: string; description: string;
    pip_position: number; digits: number;
  }>(
    "SELECT symbol_id, symbol_name, description, pip_position, digits FROM ctrader_symbols WHERE UPPER(symbol_name) = $1 LIMIT 1",
    [symbol.toUpperCase()],
  );

  if (!symRow.rows.length) {
    // No cTrader account connected or symbol not synced yet — return a minimal placeholder
    return {
      broker: "ctrader",
      symbol,
      fetchedAt: Date.now(),
      description: symbol,
      maxLeverageNum: 0,
      maxSymbolLeverageNum: null,
      lotSizeNum: 0.01,
      settlementCurrency: "USD",
      partial: true,
      fields: [
        { label: "Symbol", value: symbol },
        { label: "Status", value: "Connect a cTrader account to load contract details" },
      ],
      minVolumeLots:  null,
      maxVolumeLots:  null,
      stepVolumeLots: null,
      leverage:       null,
      pipPosition:    null,
      digits:         null,
      deltaQty:       null,
    };
  }

  const db   = symRow.rows[0];
  const desc = db.description || db.symbol_name;

  const baseFields: ContractField[] = [
    { label: "Symbol",       value: db.symbol_name },
    { label: "Description",  value: desc },
    { label: "Digits",       value: String(db.digits) },
    { label: "Pip Position", value: String(db.pip_position) },
  ];

  const extFields: ContractField[] = [];
  let maxLeverageNum  = 0;
  let lotSizeNum      = 0.01;
  let minVolumeLots:  number | null = null;
  let maxVolumeLots:  number | null = null;
  let stepVolumeLots: number | null = null;
  let leverageNum:    number | null = null;
  let pipPositionNum: number | null = db.pip_position ?? null;
  let digitsNum:      number | null = db.digits ?? null;
  let maxSymbolLeverageNum:   number | null = null;
  let maxSymbolLeverageLabel: string        = "Broker Managed";

  try {
    const [tokRow, cfgRow] = await Promise.all([
      pool.query<{ access_token_enc: string }>(
        "SELECT access_token_enc FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
      ),
      pool.query<{ account_id: number; is_live: boolean }>(
        "SELECT account_id, is_live FROM ctrader_spot_config WHERE id=1",
      ),
    ]);

    if (!tokRow.rows.length || !cfgRow.rows.length) {
      throw new Error("cTrader credentials not configured");
    }

    const accessToken = decrypt(tokRow.rows[0].access_token_enc);
    if (!accessToken) throw new Error("cTrader token decrypt failed");

    const cfg          = cfgRow.rows[0];
    const clientId     = process.env["CTRADER_CLIENT_ID"];
    const clientSecret = process.env["CTRADER_CLIENT_SECRET"];
    if (!clientId || !clientSecret) throw new Error("CTRADER_CLIENT_ID/SECRET not set");

    const [specResult, traderResult] = await Promise.allSettled([
      fetchSingleSymbolSpec({
        ctidTraderAccountId: cfg.account_id,
        isLive:              Boolean(cfg.is_live),
        accessToken,
        clientId,
        clientSecret,
        symbolId: db.symbol_id,
      }),
      fetchTraderInfo({
        ctidTraderAccountId: cfg.account_id,
        isLive:              Boolean(cfg.is_live),
        accessToken,
        clientId,
        clientSecret,
      }),
    ]);

    if (specResult.status === "rejected") throw specResult.reason;
    const spec = specResult.value;

    if (traderResult.status === "fulfilled" && traderResult.value.leverage !== null) {
      leverageNum    = traderResult.value.leverage;
      maxLeverageNum = traderResult.value.maxLeverage ?? traderResult.value.leverage;
      extFields.push({ label: "Account Leverage", value: `1:${traderResult.value.leverage}` });
    } else if (traderResult.status === "rejected") {
      logger.warn({ symbol, err: String(traderResult.reason) }, "contract-spec/ctrader: trader info fetch skipped");
    }

    // ── Raw margin/leverage diagnostic log ────────────────────────────────────
    // Print every field from ProtoOASymbol that is margin or leverage related.
    // leverageId (field 35) is the ONLY way cTrader exposes per-symbol leverage.
    // ProtoOASymbol has no marginRate field — field 13 is the trading schedule.
    logger.info({
      symbol,
      f35_leverageId:       spec.leverageId,
      f9_maxVolume:         spec.maxVolume,
      f10_minVolume:        spec.minVolume,
      f11_stepVolume:       spec.stepVolume,
      f30_lotSize_units:    spec.lotSize,
      f27_tradeMode:        spec.tradeMode,
      f34_pnlConvFeeRate:   spec.pnlConversionFeeRate,
      accountLeverage:      leverageNum,
      accountMaxLeverage:   maxLeverageNum,
      verdict: spec.leverageId !== null
        ? `leverageId=${spec.leverageId} — will fetch dynamic tiers`
        : "leverageId absent — no per-symbol leverage data; will show Broker Managed",
    }, "contract-spec/ctrader: raw margin/leverage fields");

    // ── Dynamic leverage fetch ─────────────────────────────────────────────────
    // ProtoOASymbol.leverageId (field 35) links to a ProtoOADynamicLeverage entity.
    // Fetch it if present to get real per-symbol leverage tiers instead of guessing.
    let dynamicTiers: DynamicLeverageTier[] = [];
    let dynamicLeverageFetchReason: string | null = null;  // set when tiers are empty with a reason
    if (spec.leverageId !== null && spec.leverageId > 0) {
      try {
        dynamicTiers = await fetchDynamicLeverage({
          ctidTraderAccountId: cfg.account_id,
          isLive:              Boolean(cfg.is_live),
          accessToken,
          clientId,
          clientSecret,
          leverageId:          spec.leverageId,
        });
        if (dynamicTiers.length === 0) {
          dynamicLeverageFetchReason = `PT2178 received but broker returned 0 tiers for leverageId=${spec.leverageId} (check API console hex dump)`;
        }
      } catch (dynErr) {
        dynamicLeverageFetchReason = String(dynErr);
        logger.warn({
          symbol, leverageId: spec.leverageId, err: dynamicLeverageFetchReason,
        }, "contract-spec/ctrader: dynamic leverage fetch failed");
      }
    }

    const TRADE_MODES: Record<number, string> = { 0: "Enabled", 1: "Disabled", 2: "Close Only" };
    const SWAP_TYPES:  Record<number, string>  = { 0: "Points / Day", 1: "% / Year" };
    const DAY_NAMES:   Record<number, string>  = {
      0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday", 4: "Friday", 5: "Saturday", 6: "Sunday",
    };

    const tickSize = 1 / Math.pow(10, spec.digits);

    if (tickSize > 0) extFields.push({ label: "Tick Size", value: tickSize.toPrecision(1) });

    // Update pip/digit precision from live spec (overrides DB values if available)
    if (spec.pipPosition !== null) pipPositionNum = spec.pipPosition;
    if (spec.digits      !== null) digitsNum      = spec.digits;

    if (spec.lotSize !== null && spec.lotSize > 0) {
      lotSizeNum = spec.lotSize;
      extFields.push({ label: "Lot Size", value: `${spec.lotSize.toLocaleString()} units` });
    }

    // ── Volume fields: ProtoOA stores volumes in 1/100 UNITS (same as lotSize field 30) ──────────
    // field 10 = minVolume, field 9 = maxVolume, field 11 = stepVolume — all in 1/100 units.
    // Correct conversion: rawVolume / (100 × lotSizeUnits) → lots
    //   where lotSizeUnits = spec.lotSize (already ÷100 from raw field 30).
    // Do NOT divide by just 100 — that gives units, not lots.
    // Example (EURUSD): rawMin=100,000 / (100 × 100,000) = 0.01 lots ✓
    const rawMin  = spec.minVolume;
    const rawMax  = spec.maxVolume;
    const rawStep = spec.stepVolume;
    // lotSizeUnits: spec.lotSize is already in units (raw field 30 ÷ 100)
    const lotSizeUnits = spec.lotSize && spec.lotSize > 0 ? spec.lotSize : null;

    const toLotsFromRaw = (rawVol: number | null): number | null => {
      if (rawVol === null || rawVol <= 0 || !lotSizeUnits) return null;
      // rawVol is in 1/100 units; ÷100 → units; ÷lotSizeUnits → lots
      return rawVol / (100 * lotSizeUnits);
    };

    const minLotsCandidate  = toLotsFromRaw(rawMin);
    const maxLotsCandidate  = toLotsFromRaw(rawMax);
    const stepLotsCandidate = toLotsFromRaw(rawStep);

    // Sanity: reject if min > 100 lots (any legitimate broker minimum ≤ 100 lots)
    if (minLotsCandidate !== null) {
      if (minLotsCandidate > 0 && minLotsCandidate <= 100) {
        minVolumeLots = minLotsCandidate;
      } else {
        logger.warn({
          symbol, rawMinVolume: rawMin, lotSizeUnits,
          computedMinLots: minLotsCandidate,
          formula: "rawMin / (100 × lotSizeUnits)",
        }, "contract-spec/ctrader: minVolume SANITY CHECK FAILED — result outside expected range (0, 100]");
      }
    }
    if (maxLotsCandidate !== null && maxLotsCandidate > 0) {
      maxVolumeLots = maxLotsCandidate;
    } else if (rawMax !== null) {
      logger.warn({ symbol, rawMaxVolume: rawMax, lotSizeUnits, computedMaxLots: maxLotsCandidate }, "contract-spec/ctrader: maxVolume invalid");
    }
    if (stepLotsCandidate !== null && stepLotsCandidate > 0) {
      stepVolumeLots = stepLotsCandidate;
    } else if (rawStep !== null) {
      logger.warn({ symbol, rawStepVolume: rawStep, lotSizeUnits, computedStepLots: stepLotsCandidate }, "contract-spec/ctrader: stepVolume invalid");
    }

    // ── Detailed diagnostic log ───────────────────────────────────────────────
    logger.info({
      symbol,
      // Raw ProtoOA values (in 1/100 units)
      raw: { minVolume: rawMin, maxVolume: rawMax, stepVolume: rawStep },
      // Conversion factor
      lotSizeUnits, conversionDivisor: lotSizeUnits ? 100 * lotSizeUnits : null,
      // Converted lot values
      lots: { minVolumeLots, maxVolumeLots, stepVolumeLots },
      // Account params
      leverage: leverageNum, pipPosition: pipPositionNum, digits: digitsNum,
      sanityOk: minVolumeLots !== null,
    }, "contract-spec/ctrader: quantity spec parsed");

    const fmtLot = (v: number) => {
      // Round to reasonable precision; avoid e.g. "0.010000000001 lots"
      const prec = v < 0.01 ? 4 : v < 0.1 ? 3 : v < 1 ? 2 : 0;
      return v.toFixed(prec);
    };
    if (minVolumeLots  !== null) extFields.push({ label: "Min Volume",  value: `${fmtLot(minVolumeLots)} lots` });
    if (maxVolumeLots  !== null) extFields.push({ label: "Max Volume",  value: `${fmtLot(maxVolumeLots)} lots` });
    if (stepVolumeLots !== null) extFields.push({ label: "Volume Step", value: `${fmtLot(stepVolumeLots)} lots` });

    if (spec.tradeMode !== null) {
      extFields.push({
        label:     "Execution Mode",
        value:     TRADE_MODES[spec.tradeMode] ?? String(spec.tradeMode),
        highlight: spec.tradeMode === 0,
      });
    }
    if (spec.swapLong !== null) {
      extFields.push({ label: "Swap Long", value: spec.swapLong.toFixed(2), highlight: spec.swapLong >= 0 });
    }
    if (spec.swapShort !== null) {
      extFields.push({ label: "Swap Short", value: spec.swapShort.toFixed(2), highlight: spec.swapShort >= 0 });
    }
    if (spec.swapType !== null) {
      extFields.push({ label: "Swap Type", value: SWAP_TYPES[spec.swapType] ?? String(spec.swapType) });
    }
    if (spec.swapRollover3Days !== null) {
      extFields.push({ label: "Triple Swap Day", value: DAY_NAMES[spec.swapRollover3Days] ?? String(spec.swapRollover3Days) });
    }
    if (spec.pnlConversionFeeRate !== null) {
      const pct = spec.pnlConversionFeeRate * 0.01;
      extFields.push({ label: "Currency Conversion Fee", value: pct > 0 ? `${pct.toFixed(2)}%` : "None" });
    }
    if (spec.minCommission !== null && spec.minCommission > 0) {
      extFields.push({
        label: "Commission",
        value: `${spec.minCommission.toFixed(2)}${spec.minCommissionAsset ? " " + spec.minCommissionAsset : ""} min`,
      });
    }
    if (spec.scheduleTimeZone) {
      extFields.push({ label: "Schedule Timezone", value: spec.scheduleTimeZone });
    }
    if (spec.measurementUnits) {
      extFields.push({ label: "Measurement Units", value: spec.measurementUnits });
    }

    // ── Market hours / open-closed status (real ProtoOA schedule, never fabricated) ──
    const marketStatus = computeMarketStatus(spec.schedule, spec.scheduleTimeZone);
    if (marketStatus) {
      extFields.push({
        label: "Market Status",
        value: marketStatus.isOpen ? "Open" : "Closed",
        highlight: marketStatus.isOpen,
      });
      const secsLeft = Math.max(0, Math.round((marketStatus.nextChangeAt - Date.now()) / 1000));
      const h = Math.floor(secsLeft / 3600), m = Math.floor((secsLeft % 3600) / 60);
      extFields.push({
        label: marketStatus.isOpen ? "Closes In" : "Opens In",
        value: h > 0 ? `${h}h ${m}m` : `${m}m`,
      });
    } else if (spec.schedule.length === 0) {
      extFields.push({ label: "Market Status", value: "Unavailable (no schedule from broker)" });
    }

    // ── Base/quote asset name resolution (from real account asset list) ──
    const pair = splitSymbolIntoAssets(db.symbol_name);
    if (pair) {
      try {
        const assets = await getAssetList({ ctidTraderAccountId: cfg.account_id, isLive: Boolean(cfg.is_live), accessToken, clientId, clientSecret });
        const baseAsset  = assets.find(a => a.name?.toUpperCase() === pair.base);
        const quoteAsset = assets.find(a => a.name?.toUpperCase() === pair.quote);
        extFields.push({ label: "Base Asset",  value: baseAsset?.displayName  ?? baseAsset?.name  ?? pair.base });
        extFields.push({ label: "Quote Asset", value: quoteAsset?.displayName ?? quoteAsset?.name ?? pair.quote });
      } catch (e) {
        logger.warn({ symbol, err: String(e) }, "contract-spec/ctrader: asset list resolution skipped");
        extFields.push({ label: "Base Asset",  value: pair.base });
        extFields.push({ label: "Quote Asset", value: pair.quote });
      }
    }

    // ── Symbol leverage display ───────────────────────────────────────────────
    // ProtoOADynamicLeverageTier.leverage is stored ×100 (same "cents" convention
    // as ProtoOATrader.leverageInCents) — already divided by 100 in fetchDynamicLeverage.
    // volumeUsdCents ≥ 1e12 ($10B) is a sentinel meaning "all position sizes" — flat leverage.
    //
    // Tiers are sorted by volume ascending; tier[0] has the smallest cap → highest leverage ratio.
    //
    // We NEVER copy account leverage here — per-symbol leverage is always different.

    // USD sentinel threshold: $10 billion = 1,000,000,000,000 cents
    const SENTINEL_USD_CENTS = 1e12;

    const fmtUsdCents = (cents: number): string => {
      // Returns compact USD string, e.g. 100000000 → "$1M", 500000 → "$5K"
      const usd = cents / 100;
      if (usd >= 1e9)  return `${(usd / 1e9).toFixed(usd % 1e9 === 0 ? 0 : 1)}B`;
      if (usd >= 1e6)  return `${(usd / 1e6).toFixed(usd % 1e6 === 0 ? 0 : 1)}M`;
      if (usd >= 1e3)  return `${Math.round(usd / 1e3)}K`;
      return `${Math.round(usd).toLocaleString()}`;
    };

    if (dynamicTiers.length > 0) {
      // Determine if this is flat (all tiers use sentinel) or truly tiered
      const isFlatLeverage = dynamicTiers.every(t => t.volumeUsdCents >= SENTINEL_USD_CENTS);

      // Max leverage = first tier (smallest volume cap → highest leverage ratio)
      const maxLev = dynamicTiers[0]!.leverage;
      maxSymbolLeverageNum   = maxLev;
      maxSymbolLeverageLabel = `1:${maxLev}`;

      logger.info({
        symbol, leverageId: spec.leverageId,
        isFlatLeverage, tierCount: dynamicTiers.length,
        tiers: dynamicTiers.map(t => ({ volumeUsdCents: t.volumeUsdCents, leverage: t.leverage })),
      }, "contract-spec/ctrader: leverage display resolved");

      if (isFlatLeverage) {
        // Single flat leverage applies to all position sizes
        extFields.push({ label: "Dynamic Leverage", value: `1:${maxLev}` });
      } else {
        // Real tiered structure with different leverage ratios by position size
        // Filter out any sentinel-capped final tier (it acts as "and above")
        const tierLines = dynamicTiers.map((t, i) => {
          const isFirst   = i === 0;
          const isLast    = i === dynamicTiers.length - 1;
          const isSentinel = t.volumeUsdCents >= SENTINEL_USD_CENTS;

          // from: exclusive lower bound (">prev" for non-first tiers)
          const fromStr = isFirst ? "0" : `>${fmtUsdCents(dynamicTiers[i - 1]!.volumeUsdCents)}`;

          if (isSentinel || isLast) {
            // Last tier: ">[prev] USD" — no upper cap
            return isFirst
              ? `All positions: 1:${t.leverage}`
              : `${fromStr} USD: 1:${t.leverage}`;
          }
          // Middle tier: "0–$100K USD"
          return `${fromStr}–${fmtUsdCents(t.volumeUsdCents)} USD: 1:${t.leverage}`;
        });

        extFields.push({
          label: "Dynamic Leverage",
          value: tierLines.join("\n"),
        });
      }
    } else if (spec.leverageId !== null && spec.leverageId > 0) {
      // leverageId is present in the symbol spec but the broker returned no tiers.
      // Show the precise reason — never silently fall back.
      const reason = dynamicLeverageFetchReason
        ?? `leverageId=${spec.leverageId} present but PT2178 returned 0 tiers`;
      logger.warn({ symbol, leverageId: spec.leverageId, reason },
        "contract-spec/ctrader: leverageId set but tiers empty or fetch failed");
      extFields.push({
        label:     "Dynamic Leverage",
        value:     `Unavailable — ${reason}`,
        highlight: false,
      });
    } else {
      // ProtoOASymbol field 35 (leverageId) is absent — broker has no dynamic leverage profile
      extFields.push({ label: "Dynamic Leverage", value: "No dynamic leverage profile assigned by broker." });
    }

    logger.info({ symbol, lotSizeNum, extCount: extFields.length }, "contract-spec/ctrader: ProtoOA ✓");
  } catch (err) {
    logger.warn({ symbol, err: String(err) }, "contract-spec/ctrader: ProtoOA fetch skipped, using DB only");
  }

  return {
    broker:             "ctrader",
    symbol,
    fetchedAt:          Date.now(),
    description:        desc,
    maxLeverageNum,
    lotSizeNum,
    settlementCurrency: "USD",
    partial:            extFields.length === 0,
    fields:             [...baseFields, ...extFields].filter(f => f.value && f.value !== "—"),
    minVolumeLots,
    maxVolumeLots,
    stepVolumeLots,
    leverage:       leverageNum,
    // Never fabricated — null unless a verified per-symbol margin/leverage field is
    // decoded above; the UI shows "Broker Managed" via the extFields entry instead.
    maxSymbolLeverageNum,
    pipPosition:    pipPositionNum,
    digits:         digitsNum,
    // cTrader never uses Delta contract specs — always null here
    deltaQty:       null,
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createContractInfoRouter(): IRouter {
  const router = Router();

  // ── Legacy Delta-only endpoint (kept for backwards compat) ─────────────────
  router.get("/contract-info/:symbol", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase();
    if (!symbol) { res.status(400).json({ error: "Symbol is required" }); return; }

    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(cached.data);
      return;
    }

    try {
      const url  = `${DELTA_INDIA_REST}/v2/products?states=live`;
      const resp = await fetch(url, {
        signal:  AbortSignal.timeout(10_000),
        headers: { Accept: "application/json", "User-Agent": "TradeVault/1.0" },
      });
      if (!resp.ok) throw new Error(`Delta API HTTP ${resp.status}`);

      const body     = await resp.json() as { result?: RawDeltaProduct[] };
      const products = Array.isArray(body.result) ? body.result : [];
      const product  = products.find(p => p.symbol === symbol);

      if (!product) { res.status(404).json({ error: `No contract found for ${symbol}` }); return; }

      const info = formatProduct(product);
      cache.set(symbol, { data: info, fetchedAt: Date.now() });
      logger.info({ symbol, maxLeverageNum: info.maxLeverageNum, lotSizeNum: info.lotSizeNum }, "contract-info: fetched from Delta Exchange");

      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, symbol }, "contract-info: fetch failed");
      if (cached) { res.json(cached.data); return; }
      res.status(502).json({ error: `Failed to fetch contract info: ${msg}` });
    }
  });

  // ── Debug: full dynamic-leverage diagnostic for a cTrader symbol ───────────
  // GET /api/ctrader/debug-leverage/:symbol
  // Returns raw leverageId, tier hex, all parsed fields. No cache.
  router.get("/ctrader/debug-leverage/:symbol", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase();
    if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }

    try {
      // ── Step 1: resolve cTrader account creds (same tables as buildCtraderSpec) ──
      const [tokRow, cfgRow] = await Promise.all([
        pool.query<{ access_token_enc: string }>(
          "SELECT access_token_enc FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
        ),
        pool.query<{ account_id: number; is_live: boolean }>(
          "SELECT account_id, is_live FROM ctrader_spot_config WHERE id=1",
        ),
      ]);
      if (!tokRow.rows.length || !cfgRow.rows.length) {
        res.status(404).json({ error: "cTrader credentials not configured (check ctrader_tokens + ctrader_spot_config)" });
        return;
      }
      const accessToken = decrypt(tokRow.rows[0]!.access_token_enc);
      if (!accessToken) { res.status(500).json({ error: "cTrader token decrypt failed" }); return; }
      const cfg          = cfgRow.rows[0]!;
      const clientId     = process.env["CTRADER_CLIENT_ID"]    ?? "";
      const clientSecret = process.env["CTRADER_CLIENT_SECRET"] ?? "";
      if (!clientId || !clientSecret) {
        res.status(500).json({ error: "CTRADER_CLIENT_ID/SECRET env not set" }); return;
      }

      // ── Step 2: look up symbolId from DB ──────────────────────────────────
      const symRow = await pool.query<{ symbol_id: number; symbol_name: string; description: string }>(
        "SELECT symbol_id, symbol_name, description FROM ctrader_symbols WHERE UPPER(symbol_name) = $1 LIMIT 1",
        [symbol],
      );
      if (!symRow.rows.length) { res.status(404).json({ error: `Symbol ${symbol} not found in ctrader_symbols` }); return; }
      const symbolId = symRow.rows[0]!.symbol_id;

      logger.info({ symbol, symbolId, accountId: cfg.account_id, isLive: cfg.is_live },
        "debug-leverage: starting fresh fetch (no cache)");

      // ── Step 3: fetch symbol spec (gets leverageId from field 35) ─────────
      const spec: CtraderSymbolSpec = await fetchSingleSymbolSpec({
        symbolId, ctidTraderAccountId: cfg.account_id,
        isLive: Boolean(cfg.is_live), accessToken, clientId, clientSecret,
      });

      const step3 = {
        symbolId,
        leverageId:           spec.leverageId,
        digits:               spec.digits,
        pipPosition:          spec.pipPosition,
        lotSize:              spec.lotSize,
        tradeMode:            spec.tradeMode,
        minVolume:            spec.minVolume,
        maxVolume:            spec.maxVolume,
        specDurationMs:       spec.durationMs,
        verdict: spec.leverageId !== null && spec.leverageId > 0
          ? `leverageId=${spec.leverageId} found — will attempt dynamic leverage fetch`
          : "leverageId absent (null/0) — broker has no dynamic leverage profile for this symbol",
      };
      logger.info(step3, "debug-leverage: symbol spec result");

      if (!spec.leverageId || spec.leverageId <= 0) {
        res.json({ symbol, symbolId, step3, step4: null, conclusion: step3.verdict });
        return;
      }

      // ── Step 4: fetch dynamic leverage tiers (PT2177 → PT2178) ───────────
      // fetchDynamicLeverage logs full hex at INFO level — check API server console
      let tiers: DynamicLeverageTier[] = [];
      let fetchError: string | null = null;
      try {
        tiers = await fetchDynamicLeverage({
          ctidTraderAccountId: cfg.account_id,
          isLive:              Boolean(cfg.is_live),
          accessToken, clientId, clientSecret,
          leverageId: spec.leverageId,
        });
      } catch (e) {
        fetchError = String(e);
        logger.error({ symbol, leverageId: spec.leverageId, err: fetchError },
          "debug-leverage: PT2177→PT2178 fetch threw");
      }

      // CONFIRMED: ProtoOADynamicLeverageTier.leverage is stored ×100 (same as ProtoOATrader.leverageInCents)
      // fetchDynamicLeverage already divides by 100. tiers[].leverage is the TRUE ratio (e.g. 500 = 1:500).
      // volumeUsdCents ≥ 1e12 ($10B) is a sentinel meaning "flat leverage, no upper cap".
      const SENTINEL = 1e12;
      const step4 = {
        leverageId:  spec.leverageId,
        fetchError,
        tierCount: tiers.length,
        isFlatLeverage: tiers.length > 0 && tiers.every(t => t.volumeUsdCents >= SENTINEL),
        tiers: tiers.map(t => ({
          volumeUsdCents:    t.volumeUsdCents,
          volumeUsd:         `${(t.volumeUsdCents / 100).toLocaleString()}`,
          isSentinelVolume:  t.volumeUsdCents >= SENTINEL,
          leverage:          t.leverage,          // already ÷100 — the REAL ratio
          leverageLabel:     `1:${t.leverage}`,
        })),
        note: tiers.length > 0
          ? `Confirmed: leverage is stored ×100 in proto and already divided. '1:${tiers[0]!.leverage}' is the correct display value.`
          : fetchError
            ? `PT2177 sent, fetch threw: ${fetchError}`
            : "PT2178 received but 0 tiers parsed — check API console for full hex dump",
      };

      let conclusion: string;
      if (fetchError) {
        conclusion = `PT2177/2178 error: ${fetchError}`;
      } else if (tiers.length === 0) {
        conclusion = "PT2178 received but 0 tiers parsed — see API console hex dump";
      } else if (step4.isFlatLeverage) {
        conclusion = `Flat leverage: 1:${tiers[0]!.leverage} applies to all position sizes (single sentinel-volume tier).`;
      } else {
        conclusion = `${tiers.length} real tier(s). Leverage varies by position size. Check 'tiers' array.`;
      }

      logger.info({ symbol, symbolId, step3, step4, conclusion }, "debug-leverage: complete");
      res.json({ symbol, symbolId, step3, step4, conclusion });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ symbol, err: msg }, "debug-leverage: fatal error");
      res.status(500).json({ error: msg });
    }
  });

  // ── Broker-aware unified spec ──────────────────────────────────────────────
  // GET /api/contract-spec/:symbol?broker=delta|ctrader
  // When ?broker is omitted, auto-detects from symbol (same logic as frontend brokerRouter.ts).

  /** Symbols always served by cTrader. Keep in sync with brokerRouter.ts CTRADER_SYMBOL_SET. */
  const CTRADER_AUTO = new Set([
    "EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD",
    "EURGBP","EURJPY","EURAUD","EURCAD","EURCHF","EURNZD",
    "GBPJPY","GBPAUD","GBPCAD","GBPCHF","GBPNZD",
    "AUDJPY","AUDCAD","AUDCHF","AUDNZD",
    "CADJPY","CADCHF","CHFJPY","NZDJPY","NZDCAD","NZDCHF",
    "XAUUSD","XAGUSD","XPTUSD","XPDUSD",
    "USOIL","UKOIL","NATGAS","BRENTOIL",
    "NAS100","US30","US500","SPX500","DOW30",
    "GER40","DE40","UK100","JP225","AUS200",
    "FRA40","EUSTX50","SPA35","ESP35",
  ]);

  function autoDetectBroker(sym: string): "delta" | "ctrader" {
    const s = sym.toUpperCase();
    if (CTRADER_AUTO.has(s)) return "ctrader";
    if (/^(US|NAS|NDX|UK|GER|DE|AUS|JPN?|FRA|SPA|ESP|HK|SG|IT)\d+$/.test(s)) return "ctrader";
    if (/^[A-Z]{6}$/.test(s) && !s.endsWith("USD")) return "ctrader";
    return "delta";
  }

  router.get("/contract-spec/:symbol", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase();
    const brokerParam = (req.query["broker"] as string | undefined)?.toLowerCase();
    const broker: "delta" | "ctrader" =
      (brokerParam === "delta" || brokerParam === "ctrader") ? brokerParam : autoDetectBroker(symbol);

    if (!symbol) { res.status(400).json({ error: "Symbol is required" }); return; }

    const force    = req.query["force"] === "1";
    const cacheKey = `${broker}:${symbol}`;
    const hit      = specCache.get(cacheKey);
    if (!force && hit && Date.now() - hit.fetchedAt < SPEC_CACHE_TTL) {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(hit.data);
      return;
    }
    if (force) specCache.delete(cacheKey);

    try {
      logger.info({ symbol, broker, force }, "contract-spec: building spec");
      const spec = broker === "ctrader"
        ? await buildCtraderSpec(symbol)
        : await buildDeltaSpec(symbol);

      specCache.set(cacheKey, { data: spec, fetchedAt: Date.now() });
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(spec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ symbol, broker, err: msg }, "contract-spec: build failed");
      if (hit) { res.json(hit.data); return; }
      res.status(502).json({ error: `Failed to build contract spec: ${msg}` });
    }
  });

  return router;
}
