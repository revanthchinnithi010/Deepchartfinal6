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
  s = s.replace(marker, `${marker}\n\n  // Asset choices come only from the user's live Markets → Watchlist.\n  const { items: watchlistItems, loading: watchlistLoading } = useWatchlist();`);
}

const start = s.indexOf('                    {/* Symbol + Side + Broker */}');
const end = s.indexOf('                    {/* Source Badge */}', start);
if (start >= 0 && end >= 0) {
  const replacement = `                    {/* Asset + Direction — TradingView-style controls */}\n                    <div className="space-y-3">\n                      <div className="grid grid-cols-1 gap-3">\n                        <FormField control={form.control} name="symbol" render={({ field }) => (\n                          <FormItem>\n                            <FormLabel className={AT_LABEL}>Asset</FormLabel>\n                            <Select value={field.value} onValueChange={field.onChange}>\n                              <FormControl>\n                                <SelectTrigger className="h-12 rounded-xl bg-[#0b0d10] border-white/[0.10] px-3.5 text-[14px] font-semibold text-white focus:border-white/25 focus:ring-0">\n                                  <SelectValue placeholder={watchlistLoading ? "Loading watchlist…" : "Select from Watchlist"} />\n                                </SelectTrigger>\n                              </FormControl>\n                              <SelectContent className="border-white/[0.10] rounded-xl bg-[#0b0d10] text-white">\n                                {watchlistItems.length === 0 ? (\n                                  <div className="px-3 py-3 text-[12px] text-muted-foreground">\n                                    {watchlistLoading ? "Loading watchlist…" : "No symbols in your watchlist"}\n                                  </div>\n                                ) : (\n                                  watchlistItems.map(item => (\n                                    <SelectItem key={item.id} value={item.symbol} className="rounded-lg py-2.5 text-[13px] focus:bg-white/[0.08]">\n                                      <span className="font-semibold">{item.symbol}</span>\n                                      {item.label && item.label !== item.symbol && (\n                                        <span className="ml-2 text-muted-foreground">{item.label}</span>\n                                      )}\n                                    </SelectItem>\n                                  ))\n                                )}\n                              </SelectContent>\n                            </Select>\n                            <p className="text-[10px] text-muted-foreground/45">Markets → Watchlist symbols only</p>\n                            <FormMessage />\n                          </FormItem>\n                        )} />\n                      </div>\n\n                      <FormField control={form.control} name="side" render={({ field }) => (\n                        <FormItem>\n                          <FormLabel className={AT_LABEL}>Direction</FormLabel>\n                          <FormControl>\n                            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0b0d10] border border-white/[0.09]">\n                              <button type="button" onClick={() => field.onChange("long")} className="h-11 rounded-lg text-[13px] font-bold transition-all" style={{ background: field.value === "long" ? "rgba(34,197,94,0.14)" : "transparent", border: field.value === "long" ? "1px solid rgba(34,197,94,0.38)" : "1px solid transparent", color: field.value === "long" ? "#4ade80" : "rgba(148,163,184,0.72)" }}>Long <span className="font-medium opacity-70">(Buy)</span></button>\n                              <button type="button" onClick={() => field.onChange("short")} className="h-11 rounded-lg text-[13px] font-bold transition-all" style={{ background: field.value === "short" ? "rgba(239,68,68,0.14)" : "transparent", border: field.value === "short" ? "1px solid rgba(239,68,68,0.38)" : "1px solid transparent", color: field.value === "short" ? "#f87171" : "rgba(148,163,184,0.72)" }}>Short <span className="font-medium opacity-70">(Sell)</span></button>\n                            </div>\n                          </FormControl>\n                          <FormMessage />\n                        </FormItem>\n                      )} />\n                    </div>\n\n`;
  s = s.slice(0, start) + replacement + s.slice(end);
}

// Make the first-step controls visually closer to TradingView's compact dark UI.
s = s.replace(
  'const AT_INPUT = "bg-white/[0.04] border-white/[0.09] rounded-xl h-10 text-[13px] focus:border-primary/50 focus:ring-0 placeholder:text-muted-foreground/50 transition-colors";',
  'const AT_INPUT = "bg-[#0b0d10] border-white/[0.10] rounded-xl h-11 text-[13px] focus:border-white/25 focus:ring-0 placeholder:text-muted-foreground/45 transition-colors";'
);

fs.writeFileSync(path, s);
console.log("Add Trade first step now uses live watchlist assets, Long/Short segmented controls, and no broker field");
