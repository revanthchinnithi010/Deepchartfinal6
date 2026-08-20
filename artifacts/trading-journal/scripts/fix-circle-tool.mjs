import fs from "node:fs";

const path = new URL("../src/components/charts/DrawingOverlay.tsx", import.meta.url).pathname;
const s = fs.readFileSync(path, "utf8");

const needles = [
  "ellipse",
  "activeTool",
  "setAnchor",
  "setMousePoint",
  "saveDrawing",
  "onPointerDown",
  "onPointerMove",
  "onPointerUp",
];

console.log("[circle-inspect] DrawingOverlay structure:");
const lines = s.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  if (needles.some((n) => lines[i].includes(n))) {
    const from = Math.max(0, i - 2);
    const to = Math.min(lines.length, i + 3);
    console.log(`[circle-inspect] lines ${from + 1}-${to}`);
    for (let j = from; j < to; j++) console.log(`${j + 1}: ${lines[j]}`);
  }
}

const rendererPath = new URL("../src/components/charts/drawingCanvasRenderer.ts", import.meta.url).pathname;
const renderer = fs.readFileSync(rendererPath, "utf8");
console.log("[circle-inspect] renderer ellipse occurrences:", (renderer.match(/ellipse/g) || []).length);
console.log("[circle-inspect] renderer ellipse cases:", (renderer.match(/case [\"']ellipse[\"']/g) || []).length);
console.log("[circle-inspect] inspection complete");
