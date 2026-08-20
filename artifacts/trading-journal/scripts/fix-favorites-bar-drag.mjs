import fs from "node:fs";

const file = new URL("../src/components/charts/DrawingToolbar.tsx", import.meta.url);
let source = fs.readFileSync(file, "utf8");

const oldDragZone = `    // Hit-test: only start drag when pointer is in the left 20% of the bar
    const rect = el.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (localX > rect.width * 0.20) return; // outside drag zone — let button clicks through

    e.preventDefault();`;

const newDragZone = `    // Drag from any empty area of the favorites bar while keeping tool/star buttons clickable.
    // The old fixed 20% hit-zone made desktop dragging unreliable outside the small grip area.
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;

    e.preventDefault();`;

if (source.includes(oldDragZone)) source = source.replace(oldDragZone, newDragZone);

// Framer Motion must not own the transform because the drag implementation
// updates transform directly with translate3d(). Animate opacity only.
const oldMotion = `      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}`;

const newMotion = `      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}`;

if (source.includes(oldMotion)) source = source.replace(oldMotion, newMotion);

fs.writeFileSync(file, source);
console.log("Favorites bar drag fix applied");
