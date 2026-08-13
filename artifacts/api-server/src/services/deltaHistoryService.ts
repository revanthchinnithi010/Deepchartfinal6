/**
 * Historical OHLC provider. Delta remains the default for existing symbols;
 * FARTCOINUSD is deliberately sourced from Bybit so historical candles and
 * the live Bybit public-trade stream use the same market/source.
 */
import { logger } from "../lib/logger.js";
import type { OHLCBar } from "./CandleAggregator.js";
import { fetchBybitCandles, isBybitHistoricalSymbol } from "./bybitHistoryService.js";

const DELTA_INDIA_REST = "https://api.india.delta.exchange";
const RESOLUTION_MAP: Record<string, string> = {
  "1":"1m", "3":"3m", "5":"5m", "15":"15m", "30":"30m", "60":"1h",
  "120":"2h", "240":"4h", "480":"6h", "720":"12h", "D":"1d", "W":"1w",
};
const INTERVAL_MINUTES: Record<string, number> = {
  "1":1,"3":3,"5":5,"15":15,"30":30,"60":60,"120":120,"240":240,
  "480":480,"720":720,"D":1440,"W":10080,
};
interface DeltaCandle { time:number|string; open:number|string; high:number|string; low:number|string; close:number|string; volume:number|string; }
interface DeltaCandleResponse { success:boolean; result:DeltaCandle[]|null; error?:unknown; }
function toNum(v:number|string|undefined|null):number { if(v==null)return 0; const n=typeof v==="number"?v:parseFloat(String(v)); return Number.isFinite(n)?n:0; }

export async function fetchDeltaCandles(symbol:string, interval:string, limit=500, endSec?:number):Promise<OHLCBar[]> {
  // FARTCOINUSD historical candles must come from the same Bybit market as
  // the live publicTrade stream. This removes cross-exchange OHLC gaps.
  if (isBybitHistoricalSymbol(symbol)) {
    return fetchBybitCandles(symbol, interval, limit, endSec) as Promise<OHLCBar[]>;
  }

  const resolution=RESOLUTION_MAP[interval];
  if(!resolution){ logger.warn({symbol,interval},"deltaHistoryService: no resolution mapping"); return []; }
  const intervalMins=INTERVAL_MINUTES[interval]??60;
  const end=endSec??Math.floor(Date.now()/1000);
  const startSec=end-intervalMins*60*Math.min(limit+100,700);
  const qs=new URLSearchParams({resolution,symbol,start:String(startSec),end:String(end)});
  try {
    const resp=await fetch(`${DELTA_INDIA_REST}/v2/history/candles?${qs}`,{signal:AbortSignal.timeout(15_000),headers:{Accept:"application/json", "User-Agent":"TradeVault/1.0"}});
    if(!resp.ok){ logger.warn({symbol,status:resp.status},"deltaHistoryService: Delta HTTP error"); return []; }
    const body=await resp.json() as DeltaCandleResponse;
    if(!body.success||!Array.isArray(body.result)) return [];
    const bars=body.result.map((c):OHLCBar=>{
      const open=toNum(c.open),close=toNum(c.close),rawHigh=toNum(c.high),rawLow=toNum(c.low);
      return {time:Math.floor(toNum(c.time)),open,high:Math.max(rawHigh,open,close),low:Math.min(rawLow,open,close),close,volume:Math.max(0,toNum(c.volume))};
    }).filter(b=>b.time>0&&b.open>0&&b.high>=b.low&&b.close>0).sort((a,b)=>a.time-b.time);
    return bars.slice(-limit);
  } catch(err) {
    logger.error({err,symbol,interval},"deltaHistoryService: fetch error");
    return [];
  }
}
