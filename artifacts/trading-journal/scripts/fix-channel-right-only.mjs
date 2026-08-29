import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Railway runs package scripts with artifacts/trading-journal as cwd.
const target = resolve("src/components/charts/DrawingOverlay.tsx");
let source = readFileSync(target, "utf8");

const oldSimple = /const d1\s*=\s*extendBothEnds\(px\[0\],\s*px\[1\],\s*W,\s*H\);\s*const d2\s*=\s*extendBothEnds\(c0,\s*c1,\s*W,\s*H\);/;
const newSimple = `const d1 = extendRight(px[0], px[1], W);\n      const d2 = extendRight(c0, c1, W);`;

const oldExpanded = /const \[a1,b1\]=extendBothEnds\(px\[0\],px\[1\],W,H\)\.split\(" "\) as any;[\s\S]*?const d1=`M \$\{baseA\.x\.toFixed\(1\)\} \$\{baseA\.y\.toFixed\(1\)\} L \$\{baseB\.x\.toFixed\(1\)\} \$\{baseB\.y\.toFixed\(1\)\}`;\s*const d2=`M \$\{offA\.x\.toFixed\(1\)\} \$\{offA\.y\.toFixed\(1\)\} L \$\{offB\.x\.toFixed\(1\)\} \$\{offB\.y\.toFixed\(1\)}`;/;
const newExpanded = `const d1 = extendRight(px[0], px[1], W);\n      const d2 = extendRight(c0, c1, W);`;

let changed = false;
if (oldExpanded.test(source)) {
  source = source.replace(oldExpanded, newExpanded);
  changed = true;
} else if (oldSimple.test(source)) {
  source = source.replace(oldSimple, newSimple);
  changed = true;
}

// Defensive fallback: replace the DrawingShape channel renderer as a whole.
// This catches partially-applied historical patches that can leave baseA/baseB
// references in the production bundle even though the build itself succeeds.
if (source.includes("baseA") || source.includes("baseB") || source.includes("offA") || source.includes("offB")) {
  const matches = [...source.matchAll(/\n    case "channel": \{/g)];
  if (matches.length >= 2) {
    const start = matches[1].index + 1;
    const endMarker = /\n    case "fib": \{/g;
    endMarker.lastIndex = start;
    const endMatch = endMarker.exec(source);
    if (!endMatch) throw new Error("Channel renderer end marker not found; refusing unsafe edit");

    const replacement = `    case "channel": {\n      if (px.length < 2) return null;\n\n      const d1 = extendRight(px[0], px[1], W);\n      if (px.length < 3) {\n        return (\n          <g opacity={op} {...eraseClick}>\n            <Glow d={d1} />\n            <path d={d1} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n            <path d={d1} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" />\n            <Anchor i={0} p={px[0]} />\n            <Anchor i={1} p={px[1]} />\n          </g>\n        );\n      }\n\n      const dx = px[1].x - px[0].x;\n      const dy = px[1].y - px[0].y;\n      const len = Math.hypot(dx, dy) || 1;\n      const channelWidth = ((px[2].x - px[0].x) * (-dy) + (px[2].y - px[0].y) * dx) / len;\n      const [c0, c1] = parallelOffset(px[0], px[1], channelWidth);\n      const d2 = extendRight(c0, c1, W);\n\n      return (\n        <g opacity={op} {...eraseClick}>\n          <Glow d={d1} />\n          <path d={d1} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n          <path d={d2} stroke="transparent" strokeWidth={HIT} fill="none" {...hitProps} />\n          <path d={d1} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" />\n          <path d={d2} stroke={col} strokeWidth={sw} strokeDasharray={dash} fill="none" opacity={0.6} />\n          <polygon points={`${px[0].x},${px[0].y} ${px[1].x},${px[1].y} ${c1.x},${c1.y} ${c0.x},${c0.y}`} fill={col} fillOpacity={style.fillOpacity * 0.5} />\n          <Anchor i={0} p={px[0]} />\n          <Anchor i={1} p={px[1]} />\n          <Anchor i={2} p={px[2]} />\n        </g>\n      );\n    }`;

    source = source.slice(0, start) + replacement + source.slice(endMatch.index + 1);
    changed = true;
  }
}

if (!source.includes("const d1 = extendRight(px[0], px[1], W);")) {
  throw new Error("Parallel channel right-only geometry pattern not found; refusing unsafe edit");
}

if (changed) {
  writeFileSync(target, source);
  console.log("[channel-fix] rails start at Point 1, extend right only, and baseA runtime bug is removed");
}
