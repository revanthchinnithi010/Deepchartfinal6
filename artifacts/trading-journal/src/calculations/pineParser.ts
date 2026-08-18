import type { OHLCBar } from "@/store/chartStore";

export type PineResultType = "EMA"|"SMA"|"RSI"|"VWAP"|"WAVETREND"|"SMC_FULL"|"SMC_STRUCTURE"|"SMC_FVG"|"SMC_OB"|"SMC_LIQUIDITY"|"UNKNOWN";
export interface PinePlot{time:number;value:number}
export interface PineSeries{id:string;name:string;plots:PinePlot[];color:string;lineWidth?:number;style:"line"|"area"|"histogram";areaTopColor?:string;areaBottomColor?:string}
export interface PineHLine{price:number;color:string;lineStyle?:"solid"|"dashed"|"dotted";label?:string}
export interface PineZone{kind:"fvg_bull"|"fvg_bear"|"ob_bull"|"ob_bear";top:number;bottom:number;startTime:number;endTime:number;label?:string}
export interface PineLevel{kind:"bos_bull"|"bos_bear"|"choch_bull"|"choch_bear"|"liq_high"|"liq_low";price:number;time:number;label:string}
export interface ParsedPineResult{type:PineResultType;overlay:boolean;period?:number;plots:PinePlot[];multiSeries:PineSeries[];hlines:PineHLine[];zones:PineZone[];levels:PineLevel[]}

export function parsePineScript(code:string):{type:PineResultType;period?:number;overlay:boolean}{
 const lower=code.toLowerCase();
 const isWT=/wavetrend|wt[\s_]?lb|wt1|wt2|tci\s*=|hlc3|ci\s*=\s*\(ap|channel.?length/.test(lower)||(/wt1/.test(lower)&&/wt2/.test(lower));
 if(isWT)return{type:"WAVETREND",overlay:false};
 const overlayFalse=/overlay\s*=\s*false/.test(lower);
 const smcKw=/\b(bos|choch|ob|order[\s._-]?block|fvg|fair[\s._-]?value|liquidity|smc|smart[\s._-]?money|imbalance|supply|demand)\b/;
 if(smcKw.test(lower)){const hasBOS=/\b(bos|choch|structure)\b/.test(lower),hasFVG=/\b(fvg|fair[\s._-]?value|imbalance)\b/.test(lower),hasOB=/\b(ob|order[\s._-]?block|supply|demand)\b/.test(lower),hasLiq=/\b(liquidity|equal[\s._-]?(high|low))\b/.test(lower);if([hasBOS,hasFVG,hasOB,hasLiq].filter(Boolean).length>=2)return{type:"SMC_FULL",overlay:true};if(hasFVG)return{type:"SMC_FVG",overlay:true};if(hasBOS)return{type:"SMC_STRUCTURE",overlay:true};if(hasOB)return{type:"SMC_OB",overlay:true};return{type:"SMC_LIQUIDITY",overlay:true}}
 const emaM=code.match(/ta\.ema\s*\(\s*\w+\s*,\s*(\d+)\s*\)/);if(emaM)return{type:"EMA",period:parseInt(emaM[1],10),overlay:true};
 const smaM=code.match(/ta\.sma\s*\(\s*\w+\s*,\s*(\d+)\s*\)/);if(smaM)return{type:"SMA",period:parseInt(smaM[1],10),overlay:true};
 const rsiM=code.match(/ta\.rsi\s*\(\s*\w+\s*,\s*(\d+)\s*\)/);if(rsiM)return{type:"RSI",period:parseInt(rsiM[1],10),overlay:!overlayFalse};
 if(/ta\.vwap/.test(code))return{type:"VWAP",overlay:true};return{type:"UNKNOWN",overlay:true};
}
function ema(vals:number[],period:number):number[]{const out:number[]=[];if(!vals.length)return out;const k=2/(period+1);let e=vals[0];out.push(e);for(let i=1;i<vals.length;i++){e=vals[i]*k+e*(1-k);out.push(e)}return out}
function sma(vals:number[],period:number):number[]{return vals.map((_,i)=>i<period-1?0:vals.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period)}

/** Continuous EMA seed so an applied EMA is visible over the entire loaded history. */
export function calcEMA(values:number[],period:number):(number|null)[]{if(!values.length)return[];const p=Math.max(1,Math.floor(period)||1),k=2/(p+1);const out:(number|null)[]=new Array(values.length);let e=values[0];out[0]=e;for(let i=1;i<values.length;i++){e=values[i]*k+e*(1-k);out[i]=e}return out}
function calcSMA(values:number[],period:number):(number|null)[]{return values.map((_,i)=>i<period-1?null:values.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period)}
function calcVWAP(bars:OHLCBar[]):(number|null)[]{let pv=0,vol=0;return bars.map(b=>{const tp=(b.high+b.low+b.close)/3;pv+=tp*b.volume;vol+=b.volume;return vol>0?pv/vol:null})}
function calcRSI(closes:number[],period:number):(number|null)[]{const out:(number|null)[]=new Array(period).fill(null);if(closes.length<=period)return out;let avgGain=0,avgLoss=0;for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];if(d>=0)avgGain+=d;else avgLoss-=d}avgGain/=period;avgLoss/=period;out.push(avgLoss===0?100:100-100/(1+avgGain/avgLoss));for(let i=period+1;i<closes.length;i++){const d=closes[i]-closes[i-1];avgGain=(avgGain*(period-1)+(d>0?d:0))/period;avgLoss=(avgLoss*(period-1)+(d<0?-d:0))/period;out.push(avgLoss===0?100:100-100/(1+avgGain/avgLoss))}return out}

export function computeCustomIndicator(parsed:{type:PineResultType;period?:number;overlay:boolean},bars:OHLCBar[],color:string,pineCode=""):ParsedPineResult{
 const base:ParsedPineResult={type:parsed.type,overlay:parsed.overlay,period:parsed.period,plots:[],multiSeries:[],hlines:[],zones:[],levels:[]};if(bars.length<5)return base;const closes=bars.map(b=>b.close);
 switch(parsed.type){case"EMA":{const vals=calcEMA(closes,parsed.period??9);base.plots=bars.map((b,i)=>({time:b.time,value:vals[i]!}));break}case"SMA":{const vals=calcSMA(closes,parsed.period??20);base.plots=bars.flatMap((b,i)=>vals[i]!=null?[{time:b.time,value:vals[i]!}]:[]);break}case"VWAP":{const vals=calcVWAP(bars);base.plots=bars.flatMap((b,i)=>vals[i]!=null?[{time:b.time,value:vals[i]!}]:[]);break}case"RSI":{const vals=calcRSI(closes,parsed.period??14);const slice=closes.slice(-100),minP=Math.min(...slice),maxP=Math.max(...slice),range=maxP-minP||1;base.plots=bars.flatMap((b,i)=>vals[i]!=null?[{time:b.time,value:minP+(vals[i]!/100)*range}]:[]);break}default:break}
 return base;
}
