import fs from "node:fs";

const path = "./src/pages/trades.tsx";
let s = fs.readFileSync(path, "utf8");

if (!s.includes('import { useWatchlist } from "@/contexts/WatchlistContext";')) {
  const marker = 'import { useIsMobile } from "@/hooks/use-mobile";';
  if (s.includes(marker)) s = s.replace(marker, `${marker}\nimport { useWatchlist } from "@/contexts/WatchlistContext";`);
}

if (!s.includes('const { items: watchlistItems')) {
  const marker = '  const [modalTab, setModalTab] = useState<ModalTab>("details");';
  if (s.includes(marker)) {
    s = s.replace(marker, `${marker}\n\n  // Asset choices come only from the user's live Markets → Watchlist favorites.\n  const { items: watchlistItems, loading: watchlistLoading, refresh: refreshWatchlist } = useWatchlist();\n  const [assetPickerOpen, setAssetPickerOpen] = useState(false);\n  const [assetPickerLoading, setAssetPickerLoading] = useState(false);\n  const openAssetPicker = async () => {\n    setAssetPickerOpen(true);\n    setAssetPickerLoading(true);\n    try {\n      await refreshWatchlist();\n    } finally {\n      setAssetPickerLoading(false);\n    }\n  };`);
  }
}

// The current AddTradeSheet implementation no longer uses the legacy state
// marker above. In that case the existing UI must remain untouched.

// Repair stale build-time JSX edits if an older script left a div closing tag
// where a motion.div closing tag is required. This is intentionally narrow and
// only applies to the two AddTradeSheet panels identified by their keys.
const detailsMarker = 'key="details"';
const analysisMarker = 'key="analysis"';
const fixMotionPanelClose = (source, marker, fromIndex = 0) => {
  const start = source.indexOf(marker, fromIndex);
  if (start < 0) return source;
  const next = source.indexOf('\n                )}', start);
  if (next < 0) return source;
  const closeStart = source.lastIndexOf('\n', next - 1);
  const closeText = source.slice(closeStart + 1, next);
  if (closeText.trim() === '</div>') {
    return source.slice(0, closeStart + 1) + closeText.replace('</div>', '</motion.div>') + source.slice(next);
  }
  return source;
};

s = fixMotionPanelClose(s, detailsMarker);
s = fixMotionPanelClose(s, analysisMarker);

fs.writeFileSync(path, s);
console.log("[fix-add-trade-ui] Build-safe AddTradeSheet patch applied");
