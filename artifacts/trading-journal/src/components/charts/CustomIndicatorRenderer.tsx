import { useEffect, useRef, useState, useCallback, memo } from "react";
import { LineSeries, AreaSeries, LineStyle as LWLineStyle, type ISeriesApi, type Time, type SeriesType } from "lightweight-charts";
import { useChartContext } from "@/contexts/ChartContext";
import { useChartBars } from "@/contexts/ChartBarsContext";
import { useIndicatorStore } from "@/store/indicatorStore";
import { useChartStore } from "@/store/chartStore";
import { subscribePanRange, getPanRange } from "./chartPanState";
import { parsePineScript, computeCustomIndicator, type ParsedPineResult, type PineZone, type PineLevel } from "@/calculations/pineParser";
import type { OHLCBar } from "@/store/chartStore";

function useChartSize(ref: React.RefObject<HTMLElement | null>) {
  const [size,setSize]=useState({w:0,h:0});
  useEffect(()=>{const el=ref.current;if(!el)return;const ro=new ResizeObserver(es=>{const e=es[0];if(e)setSize({w:e.contentRect.width,h:e.contentRect.height})});ro.observe(el);setSize({w:el.clientWidth,h:el.clientHeight});return()=>ro.disconnect()},[ref]);
  return size;
}
function zoneColor(k:PineZone["kind"]){switch(k){case"fvg_bull":return{fill:"rgba(34,197,94,.10)",stroke:"rgba(34,197,94,.5)"};case"fvg_bear":return{fill:"rgba(239,68,68,.10)",stroke:"rgba(239,68,68,.5)"};case"ob_bull":return{fill:"rgba(34,197,94,.14)",stroke:"rgba(34,197,94,.65)"};default:return{fill:"rgba(239,68,68,.14)",stroke:"rgba(239,68,68,.65)"}}}
function levelColor(k:PineLevel["kind"]){switch(k){case"bos_bull":return"#22c55e";case"bos_bear":return"#ef4444";case"choch_bull":return"#a78bfa";case"choch_bear":return"#fb923c";case"liq_high":return"#38bdf8";default:return"#f59e0b"}}

const SMCOverlay=memo(function SMCOverlay({result,visible}:{result:ParsedPineResult;visible:boolean}){
  const {chart,candle}=useChartContext();const ref=useRef<HTMLDivElement>(null);const size=useChartSize(ref);const[,rerender]=useState(0);
  useEffect(()=>{if(!chart)return;const f=()=>rerender(x=>x+1);chart.timeScale().subscribeVisibleLogicalRangeChange(f);chart.timeScale().subscribeVisibleTimeRangeChange(f);return()=>{try{chart.timeScale().unsubscribeVisibleLogicalRangeChange(f);chart.timeScale().unsubscribeVisibleTimeRangeChange(f)}catch{}}},[chart]);
  if(!visible)return null;const W=size.w||800,H=size.h||500;const x=(t:number)=>{try{return chart?.timeScale().timeToCoordinate(t as Time)??null}catch{return null}};const y=(p:number)=>{try{return candle?.priceToCoordinate(p)??null}catch{return null}};
  return <div ref={ref} style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:15,overflow:"hidden"}}><svg width={W} height={H} style={{position:"absolute",inset:0}}>{result.zones.map((z,i)=>{const x1=x(z.startTime),x2=x(z.endTime)??W,y1=y(z.top),y2=y(z.bottom);if(x1==null||y1==null||y2==null)return null;const c=zoneColor(z.kind),rx=Math.min(x1,x2),ry=Math.min(y1,y2);return <g key={i}><rect x={rx} y={ry} width={Math.max(8,Math.abs(x2-x1))} height={Math.abs(y2-y1)} fill={c.fill} stroke={c.stroke}/><text x={rx+4} y={ry+10} fontSize={9} fill={c.stroke}>{z.label}</text></g>})}{result.levels.map((l,i)=>{const x1=x(l.time),yy=y(l.price);if(x1==null||yy==null)return null;const c=levelColor(l.kind);return <g key={i}><line x1={x1} y1={yy} x2={W} y2={yy} stroke={c} strokeDasharray="6 4"/><rect x={W-36} y={yy-8} width={34} height={14} rx={3} fill={c}/><text x={W-19} y={yy+4} fontSize={8.5} fill="#111" textAnchor="middle">{l.label}</text></g>})}</svg></div>
});

interface IndSeries{seriesList:ISeriesApi<SeriesType>[];paneIndex:number}
function lineStyle(s?:string){return s==="dashed"?LWLineStyle.Dashed:s==="dotted"?LWLineStyle.Dotted:LWLineStyle.Solid}

export default function CustomIndicatorRenderer(){
  const {chart}=useChartContext();const {barsRef,replayBarCount}=useChartBars();const {appliedIndicators}=useIndicatorStore();const {barsLoaded}=useChartStore();
  const mapRef=useRef<Map<string,IndSeries>>(new Map());const resultsRef=useRef<Map<string,ParsedPineResult>>(new Map());const paneRef=useRef(1);
  // Built-in indicators now carry generated Pine code, so they use the same renderer as custom indicators.
  const renderable=appliedIndicators.filter(i=>i.type==="CUSTOM"||Boolean(i.pineCode));

  useEffect(()=>{
    if(!chart||!barsLoaded)return;const bars=barsRef.current;const map=mapRef.current;const ids=new Set(renderable.map(i=>i.id));
    for(const [id,e] of map){if(!ids.has(id)){for(const s of e.seriesList){try{chart.removeSeries(s)}catch{}}map.delete(id);resultsRef.current.delete(id)}}
    for(const ind of renderable){const code=ind.pineCode??"";const parsed=parsePineScript(code);const result=computeCustomIndicator(parsed,bars,ind.color,code);resultsRef.current.set(ind.id,result);const existing=map.get(ind.id);
      if(result.multiSeries.length){const pane=existing?.paneIndex??paneRef.current++;if(existing){existing.seriesList.forEach((s,i)=>{const ms=result.multiSeries[i];if(ms)try{s.applyOptions({visible:ind.visible});s.setData(ms.plots.map(p=>({time:p.time as Time,value:p.value})) as never[])}catch{}})}else{const list:ISeriesApi<SeriesType>[]=[];for(const ms of result.multiSeries){try{const s=chart.addSeries(ms.style==="area"?AreaSeries:LineSeries,{color:ms.color,lineColor:ms.color,topColor:ms.areaTopColor??"rgba(59,130,246,.3)",bottomColor:ms.areaBottomColor??"rgba(59,130,246,.05)",lineWidth:(ms.lineWidth??1) as 1|2|3|4,priceLineVisible:false,crosshairMarkerVisible:false,lastValueVisible:false,visible:ind.visible},pane);s.setData(ms.plots.map(p=>({time:p.time as Time,value:p.value})) as never[]);list.push(s)}catch{}}map.set(ind.id,{seriesList:list,paneIndex:pane})}}
      else if(result.plots.length&&result.overlay){const data=result.plots.map(p=>({time:p.time as Time,value:p.value})) as never[];if(existing){try{existing.seriesList[0].applyOptions({visible:ind.visible,color:ind.color,lineWidth:(ind.lineWidth||1) as 1|2|3|4,lineStyle:lineStyle(ind.lineStyle),priceLineVisible:false});existing.seriesList[0].setData(data)}catch{}}else{try{const s=chart.addSeries(LineSeries,{color:ind.color,lineWidth:(ind.lineWidth||1) as 1|2|3|4,lineStyle:lineStyle(ind.lineStyle),priceLineVisible:false,crosshairMarkerVisible:false,lastValueVisible:false,visible:ind.visible},0);s.setData(data);map.set(ind.id,{seriesList:[s],paneIndex:0})}catch{}}}
      else if(existing){for(const s of existing.seriesList){try{chart.removeSeries(s)}catch{}}map.delete(ind.id)}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[chart,barsLoaded,renderable,barsRef,replayBarCount]);

  // Keep EMA/SMA/VWAP/RSI lines live with the current candle. Recompute only the applied Pine-backed indicators.
  useEffect(()=>{if(!chart||!barsLoaded)return;const timer=setInterval(()=>{const bars=barsRef.current;if(!bars.length)return;for(const ind of renderable){if(!ind.pineCode)continue;const parsed=parsePineScript(ind.pineCode);if(!["EMA","SMA","VWAP","RSI"].includes(parsed.type))continue;const result=computeCustomIndicator(parsed,bars,ind.color,ind.pineCode);const s=mapRef.current.get(ind.id)?.seriesList[0];if(s&&result.plots.length){try{s.update(result.plots[result.plots.length-1] as never)}catch{try{s.setData(result.plots.map(p=>({time:p.time as Time,value:p.value})) as never[])}catch{}}}}},500);return()=>clearInterval(timer)},[chart,barsLoaded,renderable,barsRef]);

  useEffect(()=>subscribePanRange(range=>{for(const e of mapRef.current.values()){if(e.paneIndex!==0)continue;for(const s of e.seriesList)try{s.applyOptions({autoscaleInfoProvider:()=>{const r=getPanRange();return r?{priceRange:{minValue:r.lo,maxValue:r.hi}}:null}})}catch{}}}),[]);
  useEffect(()=>()=>{if(!chart)return;for(const e of mapRef.current.values())for(const s of e.seriesList)try{chart.removeSeries(s)}catch{}mapRef.current.clear();paneRef.current=1},[chart]);

  const smc=renderable.filter(i=>i.type==="CUSTOM").map(i=>({i,result:resultsRef.current.get(i.id)})).filter(x=>x.result&&["SMC_FULL","SMC_STRUCTURE","SMC_FVG","SMC_OB","SMC_LIQUIDITY","UNKNOWN"].includes(x.result!.type));
  return <>{smc.map(x=><SMCOverlay key={x.i.id} result={x.result!} visible={x.i.visible}/>)}</>;
}
