import fs from "node:fs";

const path = "src/components/layout.tsx";
const source = fs.readFileSync(path, "utf8");

const stateMarker = '  const pathname      = location.split("?")[0];\n';
const stateBlock = `${stateMarker}\n  // Show a short chart-panel loading state when entering Charts from the main\n  // bottom tabs. The chart itself stays mounted, but the panel is revealed only\n  // after the loading state has been shown so navigation feels intentional and\n  // consistent from Dashboard, Markets, Trades, and Alerts.\n  const [chartNavLoading, setChartNavLoading] = useState(false);\n  const prevChartPathRef = useRef(pathname);\n\n  useEffect(() => {\n    const previousPath = prevChartPathRef.current;\n    const cameFromMainTab = [\"/\", \"/markets\", \"/trades\", \"/alerts\"].includes(previousPath);\n    prevChartPathRef.current = pathname;\n\n    if (pathname !== \"/charts\" || !cameFromMainTab) {\n      if (pathname !== \"/charts\") setChartNavLoading(false);\n      return;\n    }\n\n    setChartNavLoading(true);\n    const timer = setTimeout(() => setChartNavLoading(false), 650);\n    return () => clearTimeout(timer);\n  }, [pathname]);\n`;

if (!source.includes(stateMarker)) {
  throw new Error("[chart-nav-loading] pathname marker not found");
}

let next = source;
if (!next.includes("const [chartNavLoading, setChartNavLoading]")) {
  next = next.replace(stateMarker, stateBlock);
}

const chartNodeMarker = `              {chartsNode}\n            </div>\n          )}`;
const chartNodeReplacement = `              {chartsNode}\n\n              {chartNavLoading && (\n                <div\n                  aria-live=\"polite\"\n                  aria-label=\"Loading chart\"\n                  style={{\n                    position: \"absolute\",\n                    inset: 0,\n                    zIndex: 100,\n                    display: \"flex\",\n                    alignItems: \"center\",\n                    justifyContent: \"center\",\n                    flexDirection: \"column\",\n                    gap: 10,\n                    background: \"#000000\",\n                    color: \"rgba(255,255,255,0.78)\",\n                  }}\n                >\n                  <Loader2 className=\"w-5 h-5 animate-spin\" />\n                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: \"0.02em\" }}>Loading chart…</span>\n                </div>\n              )}\n            </div>\n          )}`;

if (!next.includes(chartNodeMarker)) {
  throw new Error("[chart-nav-loading] charts node marker not found");
}

if (!next.includes("aria-label=\"Loading chart\"")) {
  next = next.replace(chartNodeMarker, chartNodeReplacement);
}

fs.writeFileSync(path, next);
console.log("[chart-nav-loading] Charts now shows a loading panel before opening from Dashboard/Markets/Trades/Alerts");
