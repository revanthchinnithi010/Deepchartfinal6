import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "src/components/charts/MobileChartLayout.tsx");
let s = fs.readFileSync(file, "utf8");

// The mobile chart toolbar should not expose the broker/plugin shortcut.
s = s.replace("Pencil, Plug, MoreHorizontal, Maximize2, Minimize2,", "Pencil, MoreHorizontal, Maximize2, Minimize2,");

// Keep the existing broker props for compatibility with the parent while the
// visual plugin button is removed. `void` keeps strict no-unused settings happy.
const miniProps = `  const MiniControlBar = memo(function MiniControlBar({\n  activeKey, badge, interval, watchlistItems,\n  onSelectSymbol, onTF, onTrade, onDraw, onBroker, onMore, onPrev, onNext, onFullscreen, isFullscreen,\n  brokerConnected,\n}: {`;
const miniPropsNew = `const MiniControlBar = memo(function MiniControlBar({\n  activeKey, badge, interval, watchlistItems,\n  onSelectSymbol, onTF, onTrade, onDraw, onBroker, onMore, onPrev, onNext, onFullscreen, isFullscreen,\n  brokerConnected,\n}: {`;
if (s.includes(miniProps)) s = s.replace(miniProps, miniPropsNew);

const oldPencil = `        {/* Pencil / drawing tools */}\n        <CtrlBtn onClick={onDraw}>\n          <Pencil style={{ width:17, height:17, color: GL_TEAL }} />\n        </CtrlBtn>\n\n        {/* Broker connect */}\n        <CtrlBtn onClick={onBroker}>\n          <div style={{ position:\"relative\", display:\"flex\", alignItems:\"center\", justifyContent:\"center\" }}>\n            <Plug style={{ width:17, height:17, color: brokerConnected ? \"#B7FF5A\" : GL_TEAL }} />\n            <div style={{\n              position:\"absolute\", top:-3, right:-4,\n              width:7, height:7, borderRadius:\"50%\",\n              background: brokerConnected ? \"#22C55E\" : \"rgba(167,184,169,0.35)\",\n              border: \"1.5px solid rgba(11,16,23,0.9)\",\n              boxShadow: brokerConnected ? \"0 0 6px rgba(34,197,94,0.7)\" : \"none\",\n              transition: \"background 0.3s, box-shadow 0.3s\",\n            }} />\n          </div>\n        </CtrlBtn>`;

const newDrawingButton = `        {/* Drawing tools — prominent orange action, matching the Show Positions CTA */}\n        <button\n          onClick={onDraw}\n          aria-label=\"Drawing tools\"\n          style={{\n            height:42, minWidth:148, padding:\"0 18px\",\n            borderRadius:22,\n            display:\"inline-flex\", alignItems:\"center\", justifyContent:\"center\", gap:9,\n            flexShrink:0, cursor:\"pointer\", outline:\"none\",\n            color:\"#ffffff\",\n            background:\"linear-gradient(180deg,#ff7a00 0%,#ff5a00 100%)\",\n            border:\"1px solid rgba(255,191,122,0.38)\",\n            boxShadow:\"0 0 22px rgba(255,102,0,0.34), 0 6px 16px rgba(255,91,0,0.22), inset 0 1px 0 rgba(255,255,255,0.18)\",\n            fontSize:15, fontWeight:700, letterSpacing:\"-0.1px\",\n            touchAction:\"manipulation\",\n            transition:\"transform .12s ease, filter .12s ease\",\n          }}\n          onPointerDown={e => { (e.currentTarget as HTMLElement).style.transform=\"scale(0.97)\"; }}\n          onPointerUp={e => { (e.currentTarget as HTMLElement).style.transform=\"scale(1)\"; }}\n          onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform=\"scale(1)\"; }}\n        >\n          <Pencil style={{ width:18, height:18, color:\"#ffffff\", strokeWidth:2.2 }} />\n          <span>Drawing Tools</span>\n        </button>`;

if (s.includes(oldPencil)) {
  s = s.replace(oldPencil, newDrawingButton);
} else if (!s.includes("Drawing tools — prominent orange action")) {
  throw new Error("Mobile drawing/plugin toolbar block not found; refusing to write a partial fix.");
}

fs.writeFileSync(file, s, "utf8");
console.log("Applied mobile drawing CTA fix: plugin button removed; orange Drawing Tools CTA enabled.");
