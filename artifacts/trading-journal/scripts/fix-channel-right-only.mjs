import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Railway runs package scripts with artifacts/trading-journal as cwd.
const target = resolve("src/components/charts/DrawingOverlay.tsx");
let source = readFileSync(target, "utf8");

const oldSimple = /const d1\s*=\s*extendBothEnds\(px\[0\],\s*px\[1\],\s*W,\s*H\);\s*const d2\s*=\s*extendBothEnds\(c0,\s*c1,\s*W,\s*H\);/;
const newSimple = `const d1 = extendRight(px[0], px[1], W);\n      const d2 = extendRight(c0, c1, W);`;

const oldExpanded = /const \[a1,b1\]=extendBothEnds\(px\[0\],px\[1\],W,H\)\.split\(" "\) as any;[\s\S]*?const d1=`M \$\{baseA\.x\.toFixed\(1\)\} \$\{baseA\.y\.toFixed\(1\)\} L \$\{baseB\.x\.toFixed\(1\)\} \$\{baseB\.y\.toFixed\(1\)\}`;\s*const d2=`M \$\{offA\.x\.toFixed\(1\)\} \$\{offA\.y\.toFixed\(1\)\} L \$\{offB\.x\.toFixed\(1\)\} \$\{offB\.y\.toFixed\(1\)\}`;/;
const newExpanded = `const d1 = extendRight(px[0], px[1], W);\n      const d2 = extendRight(c0, c1, W);`;

let changed = false;
if (oldExpanded.test(source)) {
  source = source.replace(oldExpanded, newExpanded);
  changed = true;
} else if (oldSimple.test(source)) {
  source = source.replace(oldSimple, newSimple);
  changed = true;
}

if (!changed && !source.includes("const d1 = extendRight(px[0], px[1], W);")) {
  throw new Error("Parallel channel right-only geometry pattern not found; refusing unsafe edit");
}

if (changed) {
  writeFileSync(target, source);
  console.log("[channel-fix] rails now start at Point 1 and extend right only");
}
