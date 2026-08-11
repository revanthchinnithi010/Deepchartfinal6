import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// All 20 broker-synced trades from Delta Exchange, FusionMarkets, Groww
// Mirrored from artifacts/trading-journal/src/data/brokerData.ts SAMPLE_SYNCED_TRADES
const syncedTrades = [
  // ── Delta Exchange ──────────────────────────────────────────────────────
  { symbol: "NAS100",   side: "long",  entry: 18245.50, exit: 18490.00, qty: 1,          pnl:  489.00, rr: 2.4, outcome: "win",  setup: "Breakout,Trend",          entryTime: "2026-05-23T05:15:00Z", exitTime: "2026-05-23T09:15:00Z" },
  { symbol: "NAS100",   side: "short", entry: 18650.00, exit: 18520.00, qty: 1,          pnl:  260.00, rr: 1.8, outcome: "win",  setup: "Reversal,HOD/LOD",        entryTime: "2026-05-22T10:30:00Z", exitTime: "2026-05-22T14:30:00Z" },
  { symbol: "US30",     side: "long",  entry: 39250.00, exit: 39680.00, qty: 1,          pnl:  860.00, rr: 3.2, outcome: "win",  setup: "Breakout,Trend",          entryTime: "2026-05-22T06:45:00Z", exitTime: "2026-05-22T10:45:00Z" },
  { symbol: "US30",     side: "short", entry: 39800.00, exit: 40050.00, qty: 1,          pnl: -500.00, rr: 0.7, outcome: "loss", setup: "Reversal",                 mistake: "Wrong Direction",       entryTime: "2026-05-21T11:20:00Z", exitTime: "2026-05-21T15:20:00Z" },
  { symbol: "XAUUSD",   side: "long",  entry:  2318.50, exit:  2345.80, qty: 2,          pnl:  546.00, rr: 2.8, outcome: "win",  setup: "Support/Resistance,Trend", entryTime: "2026-05-23T03:30:00Z", exitTime: "2026-05-23T07:30:00Z" },
  { symbol: "XAUUSD",   side: "short", entry:  2360.00, exit:  2341.50, qty: 2,          pnl:  370.00, rr: 2.0, outcome: "win",  setup: "HOD/LOD",                 entryTime: "2026-05-21T07:00:00Z", exitTime: "2026-05-21T11:00:00Z" },
  { symbol: "BTCUSD",   side: "long",  entry: 67250.00, exit: 69100.00, qty: 0.1,        pnl: 1850.00, rr: 2.2, outcome: "win",  setup: "Breakout,Momentum",       entryTime: "2026-05-22T12:00:00Z", exitTime: "2026-05-22T16:00:00Z" },
  { symbol: "BTCUSD",   side: "short", entry: 68500.00, exit: 69200.00, qty: 0.1,        pnl: -700.00, rr: 0.6, outcome: "loss", setup: "Trend",                    mistake: "FOMO Entry",            entryTime: "2026-05-20T05:30:00Z", exitTime: "2026-05-20T09:30:00Z" },
  { symbol: "ETHUSD",   side: "long",  entry:  3145.00, exit:  3280.00, qty: 1,          pnl:  675.00, rr: 2.6, outcome: "win",  setup: "Breakout,EMA Bounce",     entryTime: "2026-05-21T09:45:00Z", exitTime: "2026-05-21T13:45:00Z" },
  { symbol: "ETHUSD",   side: "short", entry:  3350.00, exit:  3290.00, qty: 1,          pnl:  300.00, rr: 1.9, outcome: "win",  setup: "Reversal,HOD/LOD",        entryTime: "2026-05-20T13:00:00Z", exitTime: "2026-05-20T17:00:00Z" },
  // ── FusionMarkets ───────────────────────────────────────────────────────
  { symbol: "EURUSD",   side: "long",  entry:  1.0845,  exit:  1.0912,  qty: 50000,      pnl:  335.00, rr: 2.1, outcome: "win",  setup: "Support/Resistance",      entryTime: "2026-05-23T04:00:00Z", exitTime: "2026-05-23T08:00:00Z" },
  { symbol: "EURUSD",   side: "short", entry:  1.0960,  exit:  1.1010,  qty: 50000,      pnl: -250.00, rr: 0.8, outcome: "loss", setup: "Reversal",                 mistake: "Early Exit",            entryTime: "2026-05-22T08:30:00Z", exitTime: "2026-05-22T12:30:00Z" },
  { symbol: "Crude Oil", side: "long", entry:    79.45,  exit:   82.30,  qty: 5,          pnl:  570.00, rr: 2.5, outcome: "win",  setup: "HOD/LOD,Trend",           entryTime: "2026-05-22T05:15:00Z", exitTime: "2026-05-22T09:15:00Z" },
  { symbol: "Crude Oil", side: "short",entry:    83.10,  exit:   80.90,  qty: 5,          pnl:  440.00, rr: 2.3, outcome: "win",  setup: "HOD/LOD",                 entryTime: "2026-05-20T10:00:00Z", exitTime: "2026-05-20T14:00:00Z" },
  { symbol: "SOLUSD",   side: "long",  entry:   148.20,  exit:  161.50,  qty: 10,         pnl:  665.00, rr: 2.4, outcome: "win",  setup: "Breakout,Momentum",       entryTime: "2026-05-21T06:30:00Z", exitTime: "2026-05-21T10:30:00Z" },
  { symbol: "SOLUSD",   side: "short", entry:   172.40,  exit:  178.10,  qty: 10,         pnl: -285.00, rr: 0.7, outcome: "loss", setup: "Trend",                    mistake: "FOMO Entry",            entryTime: "2026-05-19T11:45:00Z", exitTime: "2026-05-19T15:45:00Z" },
  // ── Groww ────────────────────────────────────────────────────────────────
  { symbol: "DOGEUSD",  side: "long",  entry:   0.1620,  exit:   0.1785, qty: 10000,      pnl:  825.00, rr: 2.8, outcome: "win",  setup: "Breakout,Momentum",       entryTime: "2026-05-22T07:00:00Z", exitTime: "2026-05-22T11:00:00Z" },
  { symbol: "DOGEUSD",  side: "short", entry:   0.1930,  exit:   0.1860, qty: 10000,      pnl:  350.00, rr: 1.8, outcome: "win",  setup: "Reversal",                entryTime: "2026-05-20T12:30:00Z", exitTime: "2026-05-20T16:30:00Z" },
  { symbol: "PEPEUSD",  side: "long",  entry: 0.0000090, exit: 0.0000115, qty: 100000000, pnl: 1388.00, rr: 3.5, outcome: "win",  setup: "Momentum,Breakout",       entryTime: "2026-05-21T05:00:00Z", exitTime: "2026-05-21T09:00:00Z" },
  { symbol: "PEPEUSD",  side: "short", entry: 0.0000125, exit: 0.0000138, qty: 100000000, pnl: -520.00, rr: 0.6, outcome: "loss", setup: "Trend",                    mistake: "Overleverage",          entryTime: "2026-05-19T10:00:00Z", exitTime: "2026-05-19T14:00:00Z" },
];

async function seedSynced() {
  const client = await pool.connect();
  try {
    // Check existing to avoid duplication
    const existing = await client.query("SELECT COUNT(*) FROM trades");
    console.log(`Current trade count: ${existing.rows[0].count}`);

    // Remove any previously inserted synced trades from these symbols in May 2026
    // to avoid double-inserting when this script is run again
    await client.query(`
      DELETE FROM trades
      WHERE exit_date >= '2026-05-19'
        AND symbol IN ('NAS100','US30','XAUUSD','BTCUSD','ETHUSD','EURUSD','Crude Oil','SOLUSD','DOGEUSD','PEPEUSD')
    `);
    console.log("Cleared May 2026 broker-synced trades (deduplication)");

    let inserted = 0;
    for (const t of syncedTrades) {
      const stopLoss = t.side === "long"
        ? t.entry * (1 - 0.008)
        : t.entry * (1 + 0.008);
      const takeProfit = t.side === "long"
        ? t.entry * (1 + t.rr * 0.008)
        : t.entry * (1 - t.rr * 0.008);

      const pnlPct = ((t.pnl / (t.entry * Math.abs(t.qty))) * 100).toFixed(4);

      await client.query(
        `INSERT INTO trades
          (symbol, side, entry_price, exit_price, quantity, pnl, pnl_percent, outcome,
           risk_reward_ratio, stop_loss, take_profit, setup_tags, mistake_tags, entry_date, exit_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          t.symbol, t.side, t.entry, t.exit, t.qty,
          t.pnl, pnlPct, t.outcome, t.rr,
          stopLoss, takeProfit,
          t.setup || null,
          t.mistake || null,
          t.entryTime,
          t.exitTime,
        ]
      );
      inserted++;
    }

    const final = await client.query(
      "SELECT COUNT(*)::int AS total, SUM(pnl)::float AS net_pnl, ROUND(COUNT(CASE WHEN outcome='win' THEN 1 END)*100.0/COUNT(*),1)::float AS win_rate FROM trades"
    );
    const row = final.rows[0];
    console.log(`Inserted ${inserted} synced trades`);
    console.log(`── Final DB Stats ──`);
    console.log(`  Total trades : ${row.total}`);
    console.log(`  Net PnL      : $${row.net_pnl?.toFixed(2)}`);
    console.log(`  Win Rate     : ${row.win_rate}%`);
  } finally {
    client.release();
    await pool.end();
  }
}

seedSynced().catch(err => { console.error("Seed failed:", err.message); process.exit(1); });
