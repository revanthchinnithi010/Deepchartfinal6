import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "src/components/charts/DrawingOverlay.tsx");
let s = fs.readFileSync(file, "utf8");

const replacements = [
  [
    '  // ── Mobile: show crosshair immediately when a 2-point draw tool is selected ──\n  // TradingView behavior: selecting the trendline tool shows the crosshair\n  // at the chart center without requiring the user to touch the screen first.\n  useEffect(() => {\n    if (!isMobile) return;',
    '  // ── 2-point draw tools: show the crosshair immediately in every orientation ──\n  // The same drawing interaction is used by portrait and landscape charts.\n  useEffect(() => {',
  ],
  [
    'if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool))',
    'if (pointsNeeded(activeTool) === 2 && !isFreehand(activeTool))',
  ],
  [
    'if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) {',
    'if (pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) {',
  ],
  [
    'if (isMobile && pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) return;',
    'if (pointsNeeded(activeTool) === 2 && !isFreehand(activeTool)) return;',
  ],
];

for (const [from, to] of replacements) {
  if (!s.includes(from)) {
    throw new Error(`Expected DrawingOverlay pattern not found: ${from.slice(0, 100)}`);
  }
  s = s.replaceAll(from, to);
}

// Make the crosshair initialization orientation-independent and explicit.
s = s.replace(
  '    // Place crosshair at 40% height (slightly above center — typical chart position)\n    const cx = overlay.clientWidth  / 2;\n    const cy = overlay.clientHeight * 0.4;',
  '    // Place crosshair at 40% height (slightly above center — typical chart position).\n    // This is intentionally shared by portrait and landscape so tool selection has\n    // identical behavior in both orientations.\n    const cx = overlay.clientWidth / 2;\n    const cy = overlay.clientHeight * 0.4;'
);

fs.writeFileSync(file, s);
console.log("Landscape Trendline interaction patch applied:", file);
