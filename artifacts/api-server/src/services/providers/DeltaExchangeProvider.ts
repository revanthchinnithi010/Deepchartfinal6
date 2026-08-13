import WebSocket from "ws";
import { BaseProvider, type ProviderTick } from "./BaseProvider.js";
import { BybitProvider } from "./BybitProvider.js";
import { logger } from "../../lib/logger.js";

const DELTA_INDIA_WS = "wss://public-socket.india.delta.exchange";
const PING_INTERVAL_MS = 20_000;
const DELTA_RESOLUTION_BY_INTERVAL: Record<string, string> = { "1":"1m", "3":"3m", "5":"5m", "15":"15m", "30":"30m", "60":"1h", "240":"4h", D:"1d", W:"1w" };
const INTERVAL_BY_DELTA_RESOLUTION = new Map(Object.entries(DELTA_RESOLUTION_BY_INTERVAL).map(([k,v]) => [v,k]));
interface DeltaCandleMsg { type:string; sy?:string; symbol?:string; ts?:number; t?:number; o?:string|number; h?:string|number; l?:string|number; c?:string|number; v?:string|number; }
function parsePrice(v:string|number|undefined|null):number { if(v===undefined||v===null)return NaN; const n=typeof v==="number"?v:parseFloat(v); return Number.isFinite(n)&&n>0?n:NaN; }
function normToMs(ts:number|undefined):number { if(!Number.isFinite(ts)||!ts)return Date.now(); if(ts>1e15)return Math.floor(ts/1000); if(ts>1e12)return Math.floor(ts); return Math.floor(ts*1000); }
function normalizeDeltaContractSymbol(symbol:string):string { const s=symbol.toUpperCase().trim(); return s.endsWith("USDT")?`${s.slice(0,-4)}USD`:s; }
export interface DeltaSymbolEntry { internalSymbol:string; deltaSymbol:string; }

export class DeltaExchangeProvider extends BaseProvider {
  readonly name="delta"; readonly displayName="Delta Exchange India"; readonly badge="delta"; readonly color="#8B5CF6";
  private internalToDelta=new Map<string,string>(); private deltaToInternal=new Map<string,string>();
  private ws:WebSocket|null=null; private pingTimer:ReturnType<typeof setInterval>|null=null; private subscribedDelta=new Set<string>();
  private bybitProvider:BybitProvider|null=null;
  get supportedSymbols():string[]{return [...this.internalToDelta.keys()];}
  constructor(entries:DeltaSymbolEntry[]){super();this._loadSymbols(entries);}

  private _loadSymbols(entries:DeltaSymbolEntry[]):void {
    this.internalToDelta.clear(); this.deltaToInternal.clear();
    for(const entry of entries){const internal=entry.internalSymbol.toUpperCase().trim();const delta=normalizeDeltaContractSymbol(entry.deltaSymbol);if(!internal||!delta)continue;this.internalToDelta.set(internal,delta);this.deltaToInternal.set(delta,internal);}
    this.bybitProvider?.refreshSymbols([...this.internalToDelta.keys()]);
    logger.info({count:entries.length,provider:this.name},"DeltaExchangeProvider: symbol map loaded");
  }

  refreshSymbols(entries:DeltaSymbolEntry[]):void { const previous=new Set(this.subscriptions); this._loadSymbols(entries); if(this.ws?.readyState===WebSocket.OPEN)for(const internal of previous)if(this.internalToDelta.has(internal))this.subscribeSymbol(internal); }

  connect():void {
    if(this.destroyed)return; this.clearReconnectTimer(); this.clearPing();
    if(!this.bybitProvider){
      this.bybitProvider=new BybitProvider([...this.internalToDelta.keys()]);
      this.bybitProvider.on("tick",(tick:ProviderTick)=>this.emit("tick",tick));
      this.bybitProvider.on("connected",()=>logger.info({provider:"bybit"},"DeltaExchangeProvider: Bybit live feed connected"));
      this.bybitProvider.on("disconnected",info=>logger.warn({provider:"bybit",...info},"DeltaExchangeProvider: Bybit live feed disconnected"));
      this.bybitProvider.on("error",err=>logger.warn({provider:"bybit",err:err.message},"DeltaExchangeProvider: Bybit live feed error"));
      this.bybitProvider.connect();
    } else if(!this.bybitProvider.isConnected()) this.bybitProvider.connect();

    this.ws=new WebSocket(DELTA_INDIA_WS,{handshakeTimeout:10_000});
    this.ws.on("open",()=>{this.onConnected();this.pingTimer=setInterval(()=>{if(this.ws?.readyState===WebSocket.OPEN)this.ws.ping();},PING_INTERVAL_MS);});
    this.ws.on("pong",()=>{});
    this.ws.on("message",raw=>{
      const str=raw.toString();
      try{
        const msg=JSON.parse(str) as Record<string,unknown>;
        if(msg.type==="subscriptions"||msg.type==="heartbeat"||msg.type==="pong")return;
        if(msg.type==="error"){logger.warn({provider:this.name,raw:str.slice(0,500)},"DeltaExchangeProvider: server error");return;}
        // Live perpetual trades and L1 are sourced exclusively from Bybit.
        if(msg.type==="trades"||msg.type==="ob_l1")return;
        if(typeof msg.type==="string"&&msg.type.startsWith("candlestick_")){
          const candle=msg as unknown as DeltaCandleMsg; const deltaSym=(candle.sy??candle.symbol)?.toUpperCase(); if(!deltaSym)return;
          const internal=this.deltaToInternal.get(deltaSym); if(!internal)return;
          const resolution=msg.type.slice("candlestick_".length).toLowerCase(); const interval=INTERVAL_BY_DELTA_RESOLUTION.get(resolution); if(!interval)return;
          const o=parsePrice(candle.o),h=parsePrice(candle.h),l=parsePrice(candle.l),c=parsePrice(candle.c),tsMs=normToMs(candle.ts??candle.t); if(![o,h,l,c].every(Number.isFinite)||tsMs<=0)return;
          const rawV=typeof candle.v==="string"?parseFloat(candle.v):candle.v; const bar={time:Math.floor(tsMs/1000),open:o,high:h,low:l,close:c,volume:Number.isFinite(rawV)?Number(rawV):0};
          this.onTick({symbol:internal,providerSymbol:deltaSym,provider:this.name,price:c,volume:bar.volume,timestamp:tsMs,receivedAt:Date.now(),tickType:"quote",authoritativeBar:bar,authoritativeInterval:interval} as ProviderTick&Record<string,unknown>);
        }
      }catch(err){logger.warn({err,provider:this.name,raw:str.slice(0,300)},"DeltaExchangeProvider: message parse error");}
    });
    this.ws.on("error",(err:Error)=>{logger.warn({provider:this.name,err:err.message},"DeltaExchangeProvider: WS error");this.onError(err);});
    this.ws.on("close",(code,reason)=>{this.clearPing();logger.info({provider:this.name,code,reason:reason.toString()},"DeltaExchangeProvider: candle socket closed");this.onDisconnected(code);});
  }

  override subscribe(symbol:string):boolean {
    const s=symbol.toUpperCase().trim();
    if(!this.internalToDelta.has(s)&&/^[A-Z0-9]+(?:USD|USDT)$/.test(s)){const deltaSym=normalizeDeltaContractSymbol(s);this.internalToDelta.set(s,deltaSym);this.deltaToInternal.set(deltaSym,s);this.bybitProvider?.refreshSymbols([s]);}
    return super.subscribe(s);
  }

  subscribeSymbol(symbol:string):void {
    const internal=symbol.toUpperCase().trim(); const deltaSym=this.internalToDelta.get(internal); if(!deltaSym)return;
    // Watchlist add -> immediate Bybit publicTrade subscription.
    this.bybitProvider?.subscribe(internal);
    if(this.ws?.readyState===WebSocket.OPEN&&!this.subscribedDelta.has(deltaSym))this._sendSubscribe(deltaSym);
  }

  unsubscribeSymbol(symbol:string):void {
    const internal=symbol.toUpperCase().trim(); const deltaSym=this.internalToDelta.get(internal); if(!deltaSym)return;
    this.bybitProvider?.unsubscribe(internal); this.subscribedDelta.delete(deltaSym);
    if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:"unsubscribe",payload:{channels:Object.values(DELTA_RESOLUTION_BY_INTERVAL).map(resolution=>({name:`candlestick_${resolution}`,symbols:[deltaSym]}))}}));
  }

  destroy():void { this.destroyed=true;this.clearPing();this.clearReconnectTimer();this.bybitProvider?.destroy();this.bybitProvider=null;this.ws?.close();this.ws=null; }
  private _sendSubscribe(deltaSym:string):void { if(this.subscribedDelta.has(deltaSym))return;this.subscribedDelta.add(deltaSym);const channels=Object.values(DELTA_RESOLUTION_BY_INTERVAL).map(resolution=>({name:`candlestick_${resolution}`,symbols:[deltaSym]}));this.ws!.send(JSON.stringify({type:"subscribe",payload:{channels}})); }
  private clearPing():void { if(this.pingTimer){clearInterval(this.pingTimer);this.pingTimer=null;} }
}
