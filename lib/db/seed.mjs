import pg from "pg";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const now = new Date();
const daysAgo = (n) => new Date(now - n * 24 * 60 * 60 * 1000);
const hoursAgo = (d, h) => new Date(d.getTime() - h * 60 * 60 * 1000);

const trades = [
  // --- Week 1 (older) ---
  { symbol: "NAS100",   side: "long",  entry: 18120.0, exit: 18390.0, qty: 1,   pnl:  540.0, rr: 2.7, setup: "Breakout,Trend",       outcome: "win",  exitDate: daysAgo(28), entryDate: hoursAgo(daysAgo(28), 4) },
  { symbol: "XAUUSD",   side: "short", entry:  2345.0, exit:  2318.5, qty: 2,   pnl:  265.0, rr: 1.8, setup: "Reversal",             outcome: "win",  exitDate: daysAgo(27), entryDate: hoursAgo(daysAgo(27), 3) },
  { symbol: "BTCUSD",   side: "long",  entry: 64200.0, exit: 63400.0, qty: 0.1, pnl: -320.0, rr: 0.6, setup: "EMA Bounce",           outcome: "loss", exitDate: daysAgo(26), entryDate: hoursAgo(daysAgo(26), 5), mistake: "FOMO Entry" },
  { symbol: "EURUSD",   side: "long",  entry:  1.0812, exit:  1.0874, qty: 50000, pnl: 310.0, rr: 2.1, setup: "Support/Resistance",  outcome: "win",  exitDate: daysAgo(25), entryDate: hoursAgo(daysAgo(25), 2) },
  { symbol: "US30",     side: "short", entry: 39850.0, exit: 39620.0, qty: 1,   pnl:  460.0, rr: 2.3, setup: "HOD/LOD",             outcome: "win",  exitDate: daysAgo(24), entryDate: hoursAgo(daysAgo(24), 3) },

  // --- Week 2 ---
  { symbol: "ETHUSD",   side: "long",  entry:  3180.0, exit:  3310.0, qty: 1,   pnl:  390.0, rr: 2.6, setup: "Breakout,Momentum",   outcome: "win",  exitDate: daysAgo(21), entryDate: hoursAgo(daysAgo(21), 4) },
  { symbol: "NAS100",   side: "short", entry: 18540.0, exit: 18700.0, qty: 1,   pnl: -320.0, rr: 0.7, setup: "Reversal",            outcome: "loss", exitDate: daysAgo(20), entryDate: hoursAgo(daysAgo(20), 2), mistake: "Wrong Direction" },
  { symbol: "XAUUSD",   side: "long",  entry:  2298.0, exit:  2334.0, qty: 2,   pnl:  720.0, rr: 3.0, setup: "Support/Resistance,Trend", outcome: "win",  exitDate: daysAgo(19), entryDate: hoursAgo(daysAgo(19), 5) },
  { symbol: "SOLUSD",   side: "long",  entry:   152.4, exit:   166.8, qty: 10,  pnl:  576.0, rr: 2.4, setup: "Breakout",            outcome: "win",  exitDate: daysAgo(18), entryDate: hoursAgo(daysAgo(18), 3) },
  { symbol: "Crude Oil",side: "short", entry:   82.40, exit:   79.85, qty: 5,   pnl:  637.5, rr: 2.5, setup: "HOD/LOD,Trend",       outcome: "win",  exitDate: daysAgo(17), entryDate: hoursAgo(daysAgo(17), 6) },

  // --- Week 3 ---
  { symbol: "BTCUSD",   side: "long",  entry: 66800.0, exit: 68950.0, qty: 0.1, pnl:  430.0, rr: 2.2, setup: "Breakout,Momentum",   outcome: "win",  exitDate: daysAgo(14), entryDate: hoursAgo(daysAgo(14), 4) },
  { symbol: "DOGEUSD",  side: "long",  entry:  0.1650, exit:  0.1820, qty: 10000, pnl: 510.0, rr: 2.8, setup: "Breakout",           outcome: "win",  exitDate: daysAgo(13), entryDate: hoursAgo(daysAgo(13), 3) },
  { symbol: "EURUSD",   side: "short", entry:  1.0955, exit:  1.0995, qty: 50000, pnl:-200.0, rr: 0.8, setup: "Reversal",           outcome: "loss", exitDate: daysAgo(12), entryDate: hoursAgo(daysAgo(12), 2), mistake: "Early Exit" },
  { symbol: "NAS100",   side: "long",  entry: 18210.0, exit: 18465.0, qty: 1,   pnl:  510.0, rr: 2.6, setup: "VWAP,Breakout",       outcome: "win",  exitDate: daysAgo(11), entryDate: hoursAgo(daysAgo(11), 5) },
  { symbol: "US30",     side: "long",  entry: 39300.0, exit: 39690.0, qty: 1,   pnl:  780.0, rr: 3.1, setup: "Support/Resistance",  outcome: "win",  exitDate: daysAgo(10), entryDate: hoursAgo(daysAgo(10), 4) },

  // --- Week 4 (recent) ---
  { symbol: "XAUUSD",   side: "long",  entry:  2318.5, exit:  2345.8, qty: 2,   pnl:  546.0, rr: 2.8, setup: "Breakout,Trend",       outcome: "win",  exitDate: daysAgo(7), entryDate: hoursAgo(daysAgo(7), 3) },
  { symbol: "PEPEUSD",  side: "long",  entry: 0.0000090, exit: 0.0000115, qty: 100000000, pnl: 1388.0, rr: 3.5, setup: "Momentum",  outcome: "win",  exitDate: daysAgo(6), entryDate: hoursAgo(daysAgo(6), 5) },
  { symbol: "ETHUSD",   side: "short", entry:  3340.0, exit:  3285.0, qty: 1,   pnl:  275.0, rr: 1.9, setup: "Reversal,HOD/LOD",    outcome: "win",  exitDate: daysAgo(5), entryDate: hoursAgo(daysAgo(5), 4) },
  { symbol: "BTCUSD",   side: "short", entry: 68500.0, exit: 69200.0, qty: 0.1, pnl: -280.0, rr: 0.7, setup: "Trend",               outcome: "loss", exitDate: daysAgo(4), entryDate: hoursAgo(daysAgo(4), 3), mistake: "FOMO Entry" },
  { symbol: "NAS100",   side: "long",  entry: 18245.5, exit: 18490.0, qty: 1,   pnl:  489.0, rr: 2.4, setup: "Breakout,VWAP",       outcome: "win",  exitDate: daysAgo(3), entryDate: hoursAgo(daysAgo(3), 4) },
  { symbol: "SOLUSD",   side: "short", entry:   172.4, exit:   166.8, qty: 10,  pnl:  280.0, rr: 1.8, setup: "Reversal",            outcome: "win",  exitDate: daysAgo(2), entryDate: hoursAgo(daysAgo(2), 3) },
  { symbol: "XAUUSD",   side: "short", entry:  2360.0, exit:  2341.5, qty: 2,   pnl:  370.0, rr: 2.0, setup: "HOD/LOD",             outcome: "win",  exitDate: daysAgo(1), entryDate: hoursAgo(daysAgo(1), 5) },
  { symbol: "US30",     side: "long",  entry: 39250.0, exit: 39680.0, qty: 1,   pnl:  860.0, rr: 3.2, setup: "Breakout,Trend",       outcome: "win",  exitDate: daysAgo(0), entryDate: hoursAgo(daysAgo(0), 4) },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM trades");
    console.log("Cleared existing trades");

    for (const t of trades) {
      const sl = t.entry - (t.entry * 0.008) * (t.side === "long" ? 1 : -1);
      const tp = t.entry + (t.entry * 0.02) * (t.side === "long" ? 1 : -1);
      await client.query(
        `INSERT INTO trades
          (symbol, side, entry_price, exit_price, quantity, pnl, pnl_percent, outcome,
           risk_reward_ratio, stop_loss, take_profit, setup_tags, mistake_tags, entry_date, exit_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          t.symbol, t.side, t.entry, t.exit, t.qty,
          t.pnl, ((t.pnl / (t.entry * t.qty)) * 100).toFixed(4),
          t.outcome, t.rr, sl, tp,
          t.setup || null, t.mistake || null,
          t.entryDate.toISOString(), t.exitDate.toISOString(),
        ]
      );
    }
    console.log(`Seeded ${trades.length} trades successfully`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error("Seed failed:", err.message); process.exit(1); });
