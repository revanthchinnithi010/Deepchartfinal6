import fs from "node:fs";

const path = "./src/pages/trades.tsx";
let s = fs.readFileSync(path, "utf8");

if (!s.includes('import { useWatchlist } from "@/contexts/WatchlistContext";')) {
  const marker = 'import { useIsMobile } from "@/hooks/use-mobile";';
  if (!s.includes(marker)) throw new Error("useIsMobile import marker not found");
  s = s.replace(marker, `${marker}\nimport { useWatchlist } from "@/contexts/WatchlistContext";`);
}

if (!s.includes('const { items: watchlistItems')) {
  const marker = '  const [modalTab, setModalTab] = useState<ModalTab>("details");';
  if (!s.includes(marker)) throw new Error("AddTradeSheet state marker not found");
  s = s.replace(marker, `${marker}\n\n  // Asset choices come only from the user's live Markets → Watchlist.\n  const { items: watchlistItems, loading: watchlistLoading } = useWatchlist();\n  const [assetPickerOpen, setAssetPickerOpen] = useState(false);`);
}

const start = s.indexOf('                    {/* Symbol + Side + Broker */}');
const end = s.indexOf('                    {/* Source Badge */}', start);
if (start < 0 || end < 0) throw new Error("Asset/direction/broker block markers not found");

const replacement = `                    {/* Asset + Direction — TradingView-style controls */}
                    <div className="space-y-4">
                      <FormField control={form.control} name="symbol" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Asset</FormLabel>
                          <FormControl>
                            <button
                              type="button"
                              onClick={() => setAssetPickerOpen(true)}
                              className="w-full h-12 rounded-xl bg-[#0b0d10] border border-white/[0.10] px-3.5 flex items-center justify-between text-left transition-colors active:bg-white/[0.06] focus:outline-none focus:border-white/25"
                            >
                              <span className="text-[14px] font-semibold text-white truncate">{field.value || (watchlistLoading ? "Loading watchlist…" : "Select from Watchlist")}</span>
                              <ChevronDown className="h-4 w-4 text-white/45 shrink-0" />
                            </button>
                          </FormControl>
                          <p className="text-[10px] text-muted-foreground/45">Markets → Watchlist symbols only</p>
                          <FormMessage />

                          {assetPickerOpen && createPortal(
                            <div className="fixed inset-0 z-[700] bg-black/70 backdrop-blur-sm" onClick={() => setAssetPickerOpen(false)}>
                              <div
                                className="absolute left-3 right-3 bottom-3 max-h-[72vh] overflow-hidden rounded-2xl border border-white/[0.10] bg-[#0b0d10] shadow-2xl"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                                  <div>
                                    <div className="text-[14px] font-semibold text-white">Select Asset</div>
                                    <div className="text-[10px] text-white/35 mt-0.5">From your Markets watchlist</div>
                                  </div>
                                  <button type="button" onClick={() => setAssetPickerOpen(false)} className="h-8 w-8 rounded-full bg-white/[0.06] text-white/60 flex items-center justify-center">×</button>
                                </div>
                                <div className="overflow-y-auto max-h-[calc(72vh-64px)] p-2">
                                  {watchlistLoading ? (
                                    <div className="px-3 py-8 text-center text-[12px] text-white/45">Loading watchlist…</div>
                                  ) : watchlistItems.length === 0 ? (
                                    <div className="px-3 py-8 text-center text-[12px] text-white/45">No symbols in your watchlist</div>
                                  ) : (
                                    watchlistItems.map(item => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => { field.onChange(item.symbol); setAssetPickerOpen(false); }}
                                        className={field.value === item.symbol ? "w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-colors bg-white/[0.09]" : "w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-colors hover:bg-white/[0.05] active:bg-white/[0.08]"}
                                      >
                                        <div className="min-w-0">
                                          <div className="text-[13px] font-semibold text-white">{item.symbol}</div>
                                          {item.label && item.label !== item.symbol && <div className="text-[10px] text-white/35 mt-0.5 truncate">{item.label}</div>}
                                        </div>
                                        {field.value === item.symbol && <span className="text-[11px] font-semibold text-white/70">Selected</span>}
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>,
                            document.body
                          )}
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="side" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={AT_LABEL}>Direction</FormLabel>
                          <FormControl>
                            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0b0d10] border border-white/[0.09]">
                              <button type="button" onClick={() => field.onChange("long")} className="h-11 rounded-lg text-[13px] font-bold transition-all" style={{ background: field.value === "long" ? "rgba(34,197,94,0.14)" : "transparent", border: field.value === "long" ? "1px solid rgba(34,197,94,0.38)" : "1px solid transparent", color: field.value === "long" ? "#4ade80" : "rgba(148,163,184,0.72)" }}>Long <span className="font-medium opacity-70">(Buy)</span></button>
                              <button type="button" onClick={() => field.onChange("short")} className="h-11 rounded-lg text-[13px] font-bold transition-all" style={{ background: field.value === "short" ? "rgba(239,68,68,0.14)" : "transparent", border: field.value === "short" ? "1px solid rgba(239,68,68,0.38)" : "1px solid transparent", color: field.value === "short" ? "#f87171" : "rgba(148,163,184,0.72)" }}>Short <span className="font-medium opacity-70">(Sell)</span></button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

`;

s = s.slice(0, start) + replacement + s.slice(end);

s = s.replace(
  'const AT_INPUT = "bg-white/[0.04] border-white/[0.09] rounded-xl h-10 text-[13px] focus:border-primary/50 focus:ring-0 placeholder:text-muted-foreground/50 transition-colors";',
  'const AT_INPUT = "bg-[#0b0d10] border-white/[0.10] rounded-xl h-11 text-[13px] focus:border-white/25 focus:ring-0 placeholder:text-muted-foreground/45 transition-colors";'
);

fs.writeFileSync(path, s);
console.log("Add Trade watchlist asset picker fixed with a reliable portal-based mobile picker");
