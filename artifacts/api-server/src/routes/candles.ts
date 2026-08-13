/**
 * candles.ts — authoritative historical OHLC + live current-candle merge.
 * Crypto perpetuals use Bybit for both historical and live market data.
 */
import { Router, type IRouter } from "express";
import type { CandleAggregator, OHLCBar, CandleInterval } from "../services/CandleAggregator.js";
import type { MarketDataService } from "../services/MarketDataService.js";
import { fetchDeltaCandles } from "../services/deltaHistoryService.js";
import { fetchSymbolsViaProtoOA } from "../lib/ctraderProtoOA.js";
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const VALID_INTERVALS = new Set(["1", "3", "5", "15", "30", "60", "120", "240", "D", "W"]);
const CTRADER_SYMBOLS = new Set(["NAS100","US30","US500","SPX500","GER40","DE40","UK100","JP225","XAUUSD","XAGUSD","USOIL","UKOIL","NATGAS","EURUSD","GBPUSD","GBPJPY","USDJPY","AUDUSD","USDCAD","USDCHF","EURGBP","EURJPY","EURAUD","GBPAUD","NZDUSD"]);
const INTERVAL_LABEL: Partial<Record<string, string>> = { "1":"1m","3":"3m","5":"5m","15":"15m","30":"30m","60":"1H","120":"2H","240":"4H","D":"Daily","W":"Weekly" };

function normalizeBybitSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  return s.endsWith("USDT") ? s : s.endsWith("USD") ? `${s.slice(0, -3)}USDT` : `${s}USDT`;
}

function isBybitCryptoSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase().replace(/\.(pro|raw|ecn|std)$/i, "");
  return !CTRADER_SYMBOLS.has(s) && (/^[A-Z0-9]{2,12}USD$/.test(s) || /^[A-Z0-9]{2,12}USDT$/.test(s));
}

function bybitInterval(interval: string): string | null {
  if (["1","3","5","15","30","60","120","240"].includes(interval)) return interval;
  return null;
}

async function fetchBybitCandles(symbol: string, interval: string, limit = 500, beforeSec?: number): Promise<OHLCBar[]> {
  const iv = bybitInterval(interval);
  if (!iv) return [];
  const params = new URLSearchParams({ category: "linear", symbol: normalizeBybitSymbol(symbol), interval: iv, limit: String(Math.min(limit, 1000)) });
  if (beforeSec && beforeSec > 0) params.set("end", String(Math.floor(beforeSec * 1000) - 1));

  const response = await fetch(`https://api.bybit.com/v5/market/kline?${params.toString()}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Bybit kline HTTP ${response.status}`);
  const json = await response.json() as { retCode?: number; retMsg?: string; result?: { list?: string[][] } };
  if (json.retCode !== 0) throw new Error(`Bybit kline ${json.retCode}: ${json.retMsg ?? "unknown error"}`);

  const rows = json.result?.list ?? [];
  return rows.map(row => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5] ?? 0),
  })).filter(b => Number.isFinite(b.time) && Number.isFinite(b.open) && Number.isFinite(b.high) && Number.isFinite(b.low) && Number.isFinite(b.close)).sort((a,b) => a.time - b.time);
}

function mergeBars(historical: OHLCBar[], aggregated: OHLCBar[]): OHLCBar[] {
  const history = historical.slice(-500); const live = aggregated.at(-1); if (!live) return history; if (!history.length) return [live];
  const last = history.at(-1)!; if (live.time < last.time) return history;
  if (live.time === last.time) return [...history.slice(0,-1), { time:last.time, open:last.open, high:Math.max(last.high,live.high,last.open,live.close), low:Math.min(last.low,live.low,last.open,live.close), close:live.close, volume:Math.max(last.volume,live.volume) }];
  return [...history, live].slice(-501);
}

interface TrendbarsEntry { bars: OHLCBar[]; fetchedAt: number; }
const trendbarsCache = new Map<string, TrendbarsEntry>();
const TRENDBARS_CACHE_TTL = 5 * 60_000;
let symbolLoadPromise: Promise<void> | null = null;
let symbolLoadedAt = 0;
const SYMBOL_RELOAD_COOLDOWN = 30_000;

async function lookupSymbolId(symbol: string): Promise<{ symbolId: number; symbolName: string } | null> {
  const row = await pool.query<{ symbol_id: number; symbol_name: string }>("SELECT symbol_id, symbol_name FROM ctrader_symbols WHERE UPPER(symbol_name) = UPPER($1) LIMIT 1", [symbol]);
  if (!row.rows.length) return null; return { symbolId:Number(row.rows[0].symbol_id), symbolName:row.rows[0].symbol_name };
}

async function saveSymbolsToDB(symbols: Array<{symbolId:number;symbolName:string;description:string;pipPosition:number;digits:number}>): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS ctrader_symbols (symbol_id INTEGER PRIMARY KEY, symbol_name TEXT NOT NULL, description TEXT NOT NULL, pip_position INTEGER NOT NULL, digits INTEGER NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  for (const sym of symbols) await pool.query(`INSERT INTO ctrader_symbols (symbol_id,symbol_name,description,pip_position,digits,fetched_at) VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT (symbol_id) DO UPDATE SET symbol_name=EXCLUDED.symbol_name,description=EXCLUDED.description,pip_position=EXCLUDED.pip_position,digits=EXCLUDED.digits,fetched_at=NOW()`, [sym.symbolId,sym.symbolName,sym.description,sym.pipPosition,sym.digits]);
}

async function autoLoadSymbols(targetSymbol: string): Promise<{symbolId:number;symbolName:string}|null> {
  const now=Date.now(); if(!symbolLoadPromise&&now-symbolLoadedAt<SYMBOL_RELOAD_COOLDOWN)return lookupSymbolId(targetSymbol);
  const creds=ctraderTickEngine.getEngineCredentials(); if(!creds){logger.warn({targetSymbol},"candles: symbol auto-load skipped — engine has no credentials");return null;}
  if(!symbolLoadPromise){symbolLoadPromise=(async()=>{try{const symbols=await fetchSymbolsViaProtoOA({ctidTraderAccountId:creds.ctidTraderAccountId,isLive:creds.isLive,accessToken:creds.accessToken,clientId:creds.clientId,clientSecret:creds.clientSecret,timeoutMs:30000});await saveSymbolsToDB(symbols);symbolLoadedAt=Date.now();}catch(err){logger.error({targetSymbol,err:String(err)},"candles: symbol auto-load FAILED");}finally{symbolLoadPromise=null;}})();}
  await symbolLoadPromise.catch(()=>{}); return lookupSymbolId(targetSymbol);
}

export function createCandlesRouter(aggregator: CandleAggregator, _marketData: MarketDataService): IRouter {
  const router: IRouter = Router();

  router.get("/candles/ctrader/diagnostic/:symbol/:interval", async (req,res):Promise<void>=>{
    const symbol=(req.params["symbol"]??"").toUpperCase().trim(); const interval=req.params["interval"]??""; const engineStatus=ctraderTickEngine.getStatus(); const engineCreds=ctraderTickEngine.getEngineCredentials(); const symRow=await lookupSymbolId(symbol).catch(()=>null); const aggBars=aggregator.getBars(symbol,interval as CandleInterval);
    const diag:Record<string,unknown>={symbol,interval,timeframeLabel:INTERVAL_LABEL[interval]??interval,isCtraderSymbol:CTRADER_SYMBOLS.has(symbol),isBybitCrypto:isBybitCryptoSymbol(symbol),engineStatus:engineStatus.status,engineAccountId:engineStatus.accountId,engineIsLive:engineStatus.isLive,engineSubscribedSymbols:engineStatus.subscribedSymbols,engineHasCreds:!!engineCreds,symbolId:symRow?.symbolId??null,symbolIdFound:!!symRow,aggregatorBars:aggBars.length,cacheKey:`${symbol}:${interval}`,cached:trendbarsCache.has(`${symbol}:${interval}`)};
    if(isBybitCryptoSymbol(symbol)){try{const t0=Date.now();const bars=await fetchBybitCandles(symbol,interval,5);diag["testFetch"]={ok:true,provider:"bybit",bars:bars.length,durationMs:Date.now()-t0};}catch(e){diag["testFetch"]={ok:false,provider:"bybit",error:String(e)};}}
    res.json(diag);
  });

  router.get("/candles/:symbol/:interval", async(req,res):Promise<void>=>{
    const symbol=(req.params["symbol"]??"").toUpperCase().trim(); const interval=req.params["interval"]??"";
    if(!symbol||!VALID_INTERVALS.has(interval)){res.status(400).json({error:"Invalid symbol or interval"});return;}
    const beforeRaw=req.query["before"]; const beforeSec=typeof beforeRaw==="string"?parseInt(beforeRaw,10):NaN; const beforeSecOpt=(!isNaN(beforeSec)&&beforeSec>0)?beforeSec:undefined; const iv=interval as CandleInterval;

    if(isBybitCryptoSymbol(symbol)){
      try{
        const bars=await fetchBybitCandles(symbol,interval,500,beforeSecOpt);
        const aggBars=aggregator.getBars(symbol,iv);
        if(!bars.length){res.json(aggBars.slice(-501));return;}
        res.json(mergeBars(bars,aggBars));
      }catch(err){
        logger.error({symbol,interval,beforeSecOpt,err:String(err)},"candles: Bybit historical OHLC failed");
        const aggBars=aggregator.getBars(symbol,iv); res.json(aggBars.slice(-501));
      }
      return;
    }

    if(CTRADER_SYMBOLS.has(symbol)){
      if(beforeSecOpt){const engineStatus=ctraderTickEngine.getStatus();if(engineStatus.status!=="streaming"){res.json([]);return;}const symRow=await lookupSymbolId(symbol).catch(()=>null);if(!symRow){res.json([]);return;}let bars:OHLCBar[]=[];try{bars=await ctraderTickEngine.fetchTrendbarsOnSession(symRow.symbolId,interval,500,15000,beforeSecOpt) as OHLCBar[];}catch(firstErr){try{bars=await ctraderTickEngine.fetchTrendbarsOnSession(symRow.symbolId,interval,500,15000,beforeSecOpt) as OHLCBar[];}catch(retryErr){logger.error({symbol,interval,err:String(retryErr)},"candles: cTrader history page failed");res.json([]);return;}}res.json(bars.filter(b=>b.time<beforeSecOpt));return;}
      const cacheKey=`${symbol}:${interval}`; const aggBars=aggregator.getBars(symbol,iv); const cached=trendbarsCache.get(cacheKey);
      if(cached&&Date.now()-cached.fetchedAt<TRENDBARS_CACHE_TTL){res.json(mergeBars(cached.bars,aggBars));return;}
      const engineStatus=ctraderTickEngine.getStatus();if(engineStatus.status!=="streaming"){res.json(aggBars.slice(-501));return;}
      let symRow=await lookupSymbolId(symbol).catch(()=>null);if(!symRow)symRow=await autoLoadSymbols(symbol);if(!symRow){res.json(aggBars.slice(-501));return;}
      const {symbolId,symbolName}=symRow;if(!engineStatus.subscribedSymbols.includes(symbolName))ctraderTickEngine.addSymbol(symbolId,symbolName);let trendbars:OHLCBar[];try{trendbars=await ctraderTickEngine.fetchTrendbarsOnSession(symbolId,interval,500) as OHLCBar[];}catch(err){logger.error({symbol,symbolId,interval,err:String(err)},"candles: ProtoOAGetTrendbarsReq FAILED");res.json(aggBars.slice(-501));return;}if(!trendbars.length){res.json(aggregator.getBars(symbol,iv).slice(-501));return;}trendbarsCache.set(cacheKey,{bars:trendbars,fetchedAt:Date.now()});res.json(mergeBars(trendbars,aggregator.getBars(symbol,iv)));return;
    }

    if(beforeSecOpt){res.json(await fetchDeltaCandles(symbol,interval,500,beforeSecOpt));return;}
    const historicalBars=await fetchDeltaCandles(symbol,interval,500);const aggBars=aggregator.getBars(symbol,iv);if(!historicalBars.length){res.json(aggBars.slice(-501));return;}res.json(mergeBars(historicalBars,aggBars));
  });
  return router;
}
