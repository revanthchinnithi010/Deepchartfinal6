const FAVS_KEY = "tv_toolbar_favorites_v3";
const LABEL_TO_KEY: Record<string,string> = {
  "Trendline":"trendline","Ray":"ray","Extended":"extended","Extended line":"extended",
  "H. Line":"hline","Horizontal line":"hline","H. Ray":"hray","Horizontal ray":"hray",
  "V. Line":"vline","Vertical line":"vline","Channel":"channel","Parallel channel":"channel",
  "Fib Ret.":"fib","Fib retracement":"fib","Fib Channel":"fib_channel","Fib channel":"fib_channel",
  "Long Pos.":"position_long","Long position":"position_long","Short Pos.":"position_short","Short position":"position_short",
  "Date Range":"date_range","Price Range":"price_range","Text":"text","Note":"note",
  "Brush":"brush_brush","Highlighter":"brush_highlighter","Arrow":"brush_arrow",
  "Rectangle":"shape_rect","Path":"shape_path","Circle":"shape_circle","Curve":"shape_curve",
};

function readFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}
function writeFavorites(f: Set<string>) { localStorage.setItem(FAVS_KEY, JSON.stringify([...f])); }
function normalizeLabel(v: string) { return v.replace(/\s+/g," ").trim(); }
function getButtonLabel(b: HTMLElement) {
  const el = b.querySelector<HTMLElement>("[data-tool-label], span:last-child");
  return normalizeLabel(el?.textContent || b.textContent || "");
}
function getKeyForButton(b: HTMLElement) { return LABEL_TO_KEY[getButtonLabel(b)] ?? null; }

function findDrawingPopupFrom(start: Element): HTMLElement | null {
  let cur: Element | null = start;
  for (let depth=0; cur && depth<12; depth++, cur=cur.parentElement) {
    const el = cur as HTMLElement;
    if (!(el.textContent || "").includes("Drawing Tools")) continue;
    const buttons = Array.from(el.querySelectorAll("button")).filter(b => !!getKeyForButton(b as HTMLElement));
    if (buttons.length >= 2) return el;
  }
  return null;
}

function findDrawingPopups(nodes?: NodeList | Node[]) {
  const found = new Set<HTMLElement>();
  const roots = nodes ? Array.from(nodes) : [document.body];
  const visit = (root: Node) => {
    if (!(root instanceof Element)) return;
    const el = root as HTMLElement;
    if (el.matches("[data-drawing-popup]")) found.add(el);
    if ((el.textContent || "").includes("Drawing Tools")) {
      const popup = findDrawingPopupFrom(el);
      if (popup) found.add(popup);
    }
    el.querySelectorAll?.<HTMLElement>("[data-drawing-popup]").forEach(p => found.add(p));
  };
  roots.forEach(visit);
  return [...found];
}

function getToolButtons(popup: HTMLElement) {
  const out: HTMLButtonElement[] = [], seen = new Set<string>();
  popup.querySelectorAll<HTMLButtonElement>("button").forEach(b => {
    if (b.closest("[data-favorites-section]")) return;
    const key = getKeyForButton(b);
    if (!key || seen.has(key)) return;
    seen.add(key); out.push(b);
  });
  return out;
}

function showPrompt(button: HTMLButtonElement, key: string) {
  document.querySelectorAll<HTMLElement>("[data-favorite-prompt]").forEach(e => e.remove());
  const favorite = readFavorites().has(key), rect = button.getBoundingClientRect();
  const prompt = document.createElement("button");
  prompt.type="button"; prompt.dataset.favoritePrompt="true";
  prompt.innerHTML=`<span style="font-size:17px">★</span><span>${favorite?"Remove from favourites":"Add to favourites"}</span>`;
  prompt.style.cssText=`position:fixed;left:${Math.max(10,Math.min(rect.left+8,window.innerWidth-205))}px;top:${Math.max(10,rect.top-50)}px;z-index:2147483647;display:flex;align-items:center;gap:8px;height:38px;padding:0 13px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:#0b0b0d;color:#fff;font:600 13px/1 ui-sans-serif,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.7);cursor:pointer;touch-action:manipulation`;
  const activate=(e:Event)=>{e.preventDefault();e.stopPropagation();const f=readFavorites();favorite?f.delete(key):f.add(key);writeFavorites(f);prompt.remove();refreshFavorites();};
  prompt.addEventListener("pointerdown",e=>e.stopPropagation()); prompt.addEventListener("click",activate); document.body.appendChild(prompt);
  window.setTimeout(()=>prompt.isConnected&&prompt.remove(),3500);
}

function installLongPress(button: HTMLButtonElement) {
  if (button.dataset.longPressFavoriteInstalled === "true") return;
  button.dataset.longPressFavoriteInstalled="true"; button.style.touchAction="manipulation"; button.style.userSelect="none";
  let timer:number|null=null, longPressed=false, sx=0, sy=0;
  const clear=()=>{if(timer!==null)window.clearTimeout(timer);timer=null;};
  button.addEventListener("pointerdown",e=>{clear();longPressed=false;sx=e.clientX;sy=e.clientY;timer=window.setTimeout(()=>{timer=null;longPressed=true;const k=getKeyForButton(button);if(k)showPrompt(button,k);},600)},true);
  button.addEventListener("pointermove",e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)>12)clear()},true);
  button.addEventListener("pointerup",e=>{clear();if(longPressed){e.preventDefault();e.stopPropagation();longPressed=false}},true);
  button.addEventListener("pointercancel",clear,true); button.addEventListener("contextmenu",e=>e.preventDefault());
  button.addEventListener("click",e=>{if(longPressed){e.preventDefault();e.stopPropagation();longPressed=false}},true);
}

function getScrollContainer(popup: HTMLElement) {
  return popup.querySelector<HTMLElement>("[data-drawing-scroll]") || popup.querySelector<HTMLElement>("[style*='overflow']") || popup.firstElementChild as HTMLElement || popup;
}

function buildFavoritesSection(popup: HTMLElement) {
  const buttons=getToolButtons(popup); buttons.forEach(installLongPress);
  const favorites=readFavorites();
  const favoriteButtons=buttons.filter(b=>{const k=getKeyForButton(b);return !!k&&favorites.has(k)});
  let section=popup.querySelector<HTMLElement>("[data-favorites-section]");
  if(!favoriteButtons.length){section?.remove();return;}
  const signature=favoriteButtons.map(b=>getKeyForButton(b)).join("|");
  if(section?.dataset.signature===signature)return;
  if(!section){section=document.createElement("div");section.dataset.favoritesSection="true";section.style.cssText="padding:5px 0 8px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:3px";getScrollContainer(popup).prepend(section);}
  section.dataset.signature=signature;section.innerHTML="";
  const title=document.createElement("div");title.textContent="FAVOURITES";title.style.cssText="padding:6px 12px 5px;font:800 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.1em;color:rgba(255,255,255,.58)";section.appendChild(title);
  const grid=document.createElement("div");grid.dataset.favoritesGrid="true";grid.style.cssText="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:0 8px";section.appendChild(grid);
  favoriteButtons.forEach(original=>{const clone=original.cloneNode(true) as HTMLButtonElement;clone.dataset.favTool="true";clone.removeAttribute("disabled");clone.style.cursor="pointer";clone.style.pointerEvents="auto";clone.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();original.click()});grid.appendChild(clone)});
}

let scheduled=false;
function refreshFavorites(nodes?: NodeList|Node[]){
  if(scheduled)return;scheduled=true;
  window.setTimeout(()=>{scheduled=false;findDrawingPopups(nodes).forEach(buildFavoritesSection)},30);
}

// Observe only DOM additions/removals that can actually create/destroy the drawing sheet.
// Avoid scanning the entire document on every candle/drawing mutation; this keeps the
// second tap of a drawing tool responsive while preserving the FAVOURITES section.
const observer=new MutationObserver(mutations=>{
  const relevant: Node[]=[];
  for(const m of mutations){
    if(m.type!=="childList"||(!m.addedNodes.length&&!m.removedNodes.length))continue;
    m.addedNodes.forEach(n=>relevant.push(n));
  }
  if(relevant.length) refreshFavorites(relevant);
});

function start(){
  if((window as any).__tjDrawingFavoritesStarted)return;
  (window as any).__tjDrawingFavoritesStarted=true;
  observer.observe(document.body,{childList:true,subtree:true});
  refreshFavorites();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
export {};
