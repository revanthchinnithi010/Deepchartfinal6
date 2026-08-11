import React, { useMemo, useState } from "react";
import {
  Star,
  ChevronDown,
  ChevronUp,
  Bell,
  SlidersHorizontal,
  ExternalLink,
  Plus,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Mock data                                                         */
/* ------------------------------------------------------------------ */

function pseudoRandom(seed) {
  const x = Math.sin(seed * 999.7) * 10000;
  return x - Math.floor(x);
}

function useCandles(count = 70) {
  return useMemo(() => {
    let price = 64000;
    const out = [];
    for (let i = 0; i < count; i++) {
      const open = price;
      const change = (pseudoRandom(i) - 0.5) * 140;
      const close = open + change;
      const high = Math.max(open, close) + pseudoRandom(i + 0.3) * 50;
      const low = Math.min(open, close) - pseudoRandom(i + 0.6) * 50;
      const volume = 10 + pseudoRandom(i + 0.9) * 90;
      out.push({ open, close, high, low, volume });
      price = close;
    }
    return out;
  }, [count]);
}

function useOrderBook(count = 8) {
  return useMemo(() => {
    const asks = [];
    const bids = [];
    for (let i = 0; i < count; i++) {
      asks.push({
        price: (64004.5 - i * 1.5).toFixed(1),
        size: (24.5 - i * 2.6 + pseudoRandom(i)).toFixed(3),
      });
      bids.push({
        price: (63998.0 - i * 0.5).toFixed(1),
        size: (2.6 + i * 1.4 + pseudoRandom(i + 5)).toFixed(3),
      });
    }
    const maxSize = Math.max(
      ...asks.map((a) => +a.size),
      ...bids.map((b) => +b.size)
    );
    return { asks, bids, maxSize };
  }, [count]);
}

/* ------------------------------------------------------------------ */
/*  Primitive / shared components                                     */
/* ------------------------------------------------------------------ */

function Divider() {
  return <div className="h-px bg-gray-800 w-full" />;
}

function IconButton({ children, accent = false }) {
  return (
    <button
      className={`h-8 w-8 flex items-center justify-center rounded-md border ${
        accent
          ? "border-orange-500 text-orange-500"
          : "border-gray-700 text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Header section                                                    */
/* ------------------------------------------------------------------ */

function AccountModeTabs() {
  return (
    <div className="flex items-center gap-6 px-4 py-3">
      <span className="text-sm text-gray-400">Main</span>
      <span className="text-sm font-semibold text-orange-500 border-b-2 border-orange-500 pb-3 -mb-3">
        Isolated
      </span>
      <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
    </div>
  );
}

function SymbolHeader({ price, changePct, direction }) {
  const up = direction === "up";
  return (
    <div className="flex items-start justify-between px-4 py-2">
      <div className="flex items-start gap-2">
        <Star className="h-5 w-5 text-orange-500 fill-orange-500 mt-0.5" />
        <div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-semibold text-gray-100">
              BTCUSD
            </span>
            <ChevronDown className="h-4 w-4 text-orange-500" />
          </div>
          <p className="text-xs text-gray-400">Bitcoin Perpetual</p>
        </div>
      </div>
      <div className="text-right">
        <div
          className={`text-2xl font-bold flex items-center justify-end gap-1 ${
            up ? "text-emerald-500" : "text-rose-500"
          }`}
        >
          ${price}
          {up ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </div>
        <p className={`text-xs ${up ? "text-emerald-500" : "text-emerald-500"}`}>
          {changePct}%
        </p>
      </div>
    </div>
  );
}

function MarketStatsBar({ expanded, onToggleExpand }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex gap-6">
        <div>
          <p className="text-xs text-gray-400">24h Vol.</p>
          <p className="text-sm text-gray-100">$736.6M</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">OI</p>
          <p className="text-sm text-gray-100">$57.2M</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onToggleExpand}>
          <IconButton accent={expanded}>
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </IconButton>
        </button>

        <div className="flex flex-col items-center">
          <IconButton>
            <Bell className="h-4 w-4" />
          </IconButton>
          <span className="text-[10px] text-amber-400 mt-0.5">
            Price Alert
          </span>
        </div>

        {!expanded && (
          <button className="h-8 px-3 flex items-center gap-1 rounded-md border border-orange-500 text-orange-500 text-sm font-medium">
            Chart <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart view                                                        */
/* ------------------------------------------------------------------ */

function TimeframeTabs() {
  const frames = ["5s", "1m", "5m", "15m", "1h", "4h"];
  const [active, setActive] = useState("1m");
  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto">
      {frames.map((f) => (
        <button
          key={f}
          onClick={() => setActive(f)}
          className={`h-8 px-3 rounded-md text-sm whitespace-nowrap ${
            active === f
              ? "bg-gray-800 text-gray-100 font-medium"
              : "text-gray-500"
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

function CandlestickChart() {
  const candles = useCandles(70);
  const width = 700;
  const height = 260;
  const volHeight = 36;

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min;

  const slot = width / candles.length;
  const candleW = slot * 0.6;

  const y = (price) => height - ((price - min) / range) * height;

  const maxVol = Math.max(...candles.map((c) => c.volume));

  return (
    <div className="px-2">
      <svg
        viewBox={`0 0 ${width} ${height + volHeight}`}
        className="w-full h-[300px]"
        preserveAspectRatio="none"
      >
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={width}
            y1={height * t}
            y2={height * t}
            className="stroke-gray-800"
            strokeWidth="1"
          />
        ))}

        {/* candles */}
        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const x = i * slot + slot / 2;
          const color = up ? "#10B981" : "#F43F5E";
          return (
            <g key={i}>
              <line
                x1={x}
                x2={x}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
                strokeWidth="1"
              />
              <rect
                x={x - candleW / 2}
                y={Math.min(y(c.open), y(c.close))}
                width={candleW}
                height={Math.max(Math.abs(y(c.open) - y(c.close)), 1)}
                fill={color}
              />
            </g>
          );
        })}

        {/* volume */}
        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const x = i * slot + slot / 2;
          const h = (c.volume / maxVol) * volHeight;
          return (
            <rect
              key={`v-${i}`}
              x={x - candleW / 2}
              y={height + volHeight - h}
              width={candleW}
              height={h}
              fill={up ? "#10B981" : "#F43F5E"}
              opacity="0.5"
            />
          );
        })}
      </svg>
      <div className="flex justify-between px-2 text-xs text-gray-500 -mt-1">
        <span>15:00</span>
        <span>18:00</span>
        <span>21:00</span>
      </div>
    </div>
  );
}

function FundingRow() {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-xs text-gray-400">Funding (8h) / Countdown</p>
        <p className="text-sm text-gray-100">0.0100% / 06h:26m:04s</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Contract details view (image 2)                                   */
/* ------------------------------------------------------------------ */

function ContractStatsGrid() {
  const stats = [
    { label: "Funding", value: "0.0100% /8h" },
    { label: "Next Funding In", value: "06h:25m:36s" },
    { label: "24h High", value: "$64373.5" },
    { label: "24h Low", value: "$62919.0" },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 px-4 py-4">
      {stats.map((s) => (
        <div key={s.label}>
          <p className="text-[11px] text-gray-400">{s.label}</p>
          <p className="text-sm text-gray-100 mt-1">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, value, link }) {
  return (
    <div className="flex items-center justify-between px-4 h-14 border-b border-gray-800">
      <span className="text-sm text-gray-400">{label}</span>
      <span
        className={`text-sm font-medium flex items-center gap-1 ${
          link ? "text-orange-500" : "text-gray-100"
        }`}
      >
        {value}
        {link && <ExternalLink className="h-3.5 w-3.5" />}
      </span>
    </div>
  );
}

function ContractDetailsPanel() {
  return (
    <div>
      <ContractStatsGrid />
      <Divider />
      <h3 className="px-4 py-4 text-base font-bold text-gray-100">
        Contract Details
      </h3>
      <DetailRow label="Type" value="Linear" />
      <DetailRow label="Lot Size" value="0.001 BTC" />
      <DetailRow label="Effective Settlement Currency" value="INR" />
      <DetailRow label="Initial Margin" value="0.5 %" />
      <DetailRow label="Max Leverage" value="200x" />
      <DetailRow label="Maintenance Margin" value="0.25 %" />
      <DetailRow label="Underlying Index" value=".DEXBTUSD" link />
      <DetailRow label="Position Limit" value="125 BTC, 125,000 contracts" />
      <DetailRow label="Status" value="Operational" />
      <button className="w-full flex items-center justify-center gap-1.5 py-4 text-sm font-medium text-orange-500">
        See full contract specifications <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Order book                                                        */
/* ------------------------------------------------------------------ */

function OrderBookRow({ price, size, maxSize, side }) {
  const pct = Math.min(100, (size / maxSize) * 100);
  const color = side === "ask" ? "text-rose-500" : "text-emerald-500";
  const barColor = side === "ask" ? "bg-rose-500/15" : "bg-emerald-500/15";
  const align = side === "ask" ? "right-0" : "right-0";
  return (
    <div className="relative flex items-center justify-between px-4 h-7 text-sm">
      <div
        className={`absolute inset-y-0 ${align} ${barColor}`}
        style={{ width: `${pct}%` }}
      />
      <span className={`relative z-10 ${color}`}>{price}</span>
      <span className="relative z-10 text-gray-200">{size}</span>
    </div>
  );
}

function OrderBookPanel() {
  const { asks, bids, maxSize } = useOrderBook(8);
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-500">
        <span>Price (USD)</span>
        <span>Size (BTC)</span>
      </div>

      {asks
        .slice()
        .reverse()
        .map((a, i) => (
          <OrderBookRow key={`a-${i}`} {...a} maxSize={maxSize} side="ask" />
        ))}

      <div className="px-4 py-1.5">
        <p className="text-base font-bold text-rose-500">$63998.0</p>
      </div>

      <div className="px-4 py-1 flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="h-4 w-4 flex items-center justify-center rounded-sm border border-gray-600 text-[10px]">
            I
          </span>
          64020
        </span>
      </div>
      <div className="px-4 py-1 flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="h-4 w-4 flex items-center justify-center rounded-sm border border-gray-600 text-[10px]">
            M
          </span>
          63998.6
        </span>
      </div>

      {bids.map((b, i) => (
        <OrderBookRow key={`b-${i}`} {...b} maxSize={maxSize} side="bid" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Order entry panel                                                 */
/* ------------------------------------------------------------------ */

function SideToggle() {
  const [side, setSide] = useState("buy");
  return (
    <div className="flex h-12">
      <button
        onClick={() => setSide("buy")}
        className={`flex-1 flex items-center justify-center font-semibold text-sm skew-x-[-10deg] -mr-3 pl-3 ${
          side === "buy"
            ? "bg-emerald-500 text-white"
            : "bg-gray-900 text-emerald-500"
        }`}
      >
        <span className="skew-x-[10deg]">Buy | Long</span>
      </button>
      <button
        onClick={() => setSide("sell")}
        className={`flex-1 flex items-center justify-center font-semibold text-sm skew-x-[-10deg] pr-3 ${
          side === "sell"
            ? "bg-rose-500 text-white"
            : "bg-gray-900 text-gray-400"
        }`}
      >
        <span className="skew-x-[10deg]">Sell | Short</span>
      </button>
    </div>
  );
}

function SelectField({ label, value }) {
  return (
    <div className="h-11 flex items-center justify-between rounded-lg border border-gray-700 px-3">
      <span className="text-sm text-gray-300">
        {label && <span className="text-gray-400 mr-1">{label}</span>}
        <span className="text-orange-500 font-medium">{value}</span>
      </span>
      <ChevronDown className="h-4 w-4 text-gray-500" />
    </div>
  );
}

function QuantityInput() {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">Quantity</p>
      <div className="h-12 flex items-center justify-between rounded-lg bg-gray-900 border border-gray-700 px-3">
        <span className="text-sm text-gray-100">1 Lot = 0.001 BTC</span>
        <span className="flex items-center gap-1 text-sm font-medium text-gray-100">
          Lot <ChevronDown className="h-4 w-4 text-gray-500" />
        </span>
      </div>
    </div>
  );
}

function PercentQuickSelect() {
  const opts = ["10%", "25%", "50%", "75%", "100%"];
  return (
    <div className="flex justify-between px-1 py-2">
      {opts.map((o) => (
        <span key={o} className="text-xs text-gray-500">
          {o}
        </span>
      ))}
    </div>
  );
}

function BracketOrderRow() {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">Bracket Order</span>
      <button className="h-8 px-3 flex items-center gap-1 rounded-md border border-orange-500 text-orange-500 text-sm font-medium">
        <Plus className="h-3.5 w-3.5" /> Add TP/SL
      </button>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-100">{value}</span>
    </div>
  );
}

function ScalperBadge() {
  return (
    <div className="h-10 flex items-center justify-between rounded-lg border border-gray-700 px-3">
      <span className="flex items-center gap-2 text-sm text-emerald-500">
        <span className="h-3.5 w-3.5 rounded-sm border border-emerald-500" />
        Scalper Active
      </span>
      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
        30m
      </span>
    </div>
  );
}

function OrderEntryPanel() {
  return (
    <div className="w-[44%] min-w-[160px] px-3 py-3 flex flex-col gap-3 border-l border-gray-800">
      <SideToggle />
      <SelectField label="Leverage" value="1x" />
      <SelectField value="Market" />
      <QuantityInput />
      <PercentQuickSelect />
      <BracketOrderRow />
      <SummaryRow label="Funds req." value="0.00 USD" />
      <SummaryRow label="Available Margin" value="0 USD" />
      <button className="h-12 w-full rounded-lg bg-emerald-500 text-white font-bold text-base">
        Buy
      </button>
      <label className="flex items-center gap-2 text-sm text-gray-400">
        <span className="h-4 w-4 rounded-sm border border-gray-600" />
        Reduce Only
      </label>
      <ScalperBadge />
      <div className="flex gap-2">
        <button className="flex-1 h-9 rounded-md border border-gray-700 text-sm text-gray-300">
          Fees
        </button>
        <button className="flex-1 h-9 rounded-md border border-gray-700 text-sm text-gray-300">
          Calculator
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Position tabs + bottom nav                                        */
/* ------------------------------------------------------------------ */

function PositionTabs() {
  const tabs = ["BTCUSD", "Position", "Open Orders (0)"];
  const [active, setActive] = useState("Position");
  return (
    <div className="flex gap-6 px-4 border-t border-gray-800 pt-3">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => setActive(t)}
          className={`text-sm pb-2 -mb-px border-b-2 ${
            active === t
              ? "text-gray-100 font-semibold border-orange-500"
              : "text-gray-500 border-transparent"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Root                                                               */
/* ------------------------------------------------------------------ */

export default function TradingScreen() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-black min-h-screen text-gray-100 max-w-sm mx-auto flex flex-col">
      <AccountModeTabs />
      <Divider />
      <SymbolHeader price="64001.0" changePct="1.65" direction="up" />
      <MarketStatsBar
        expanded={expanded}
        onToggleExpand={() => setExpanded((e) => !e)}
      />
      <Divider />

      {expanded ? (
        <ContractDetailsPanel />
      ) : (
        <>
          <TimeframeTabs />
          <CandlestickChart />
          <Divider />
          <FundingRow />
          <Divider />
          <div className="flex">
            <OrderBookPanel />
            <OrderEntryPanel />
          </div>
          <PositionTabs />
        </>
      )}
    </div>
  );
}
