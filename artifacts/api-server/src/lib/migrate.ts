import { pool } from "@workspace/db";
import { logger } from "./logger.js";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS watchlist (
    id          SERIAL PRIMARY KEY,
    symbol      TEXT NOT NULL UNIQUE,
    provider    TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS trades (
    id                  SERIAL PRIMARY KEY,
    symbol              TEXT NOT NULL,
    side                TEXT NOT NULL,
    entry_price         REAL NOT NULL,
    exit_price          REAL NOT NULL,
    quantity            REAL NOT NULL,
    pnl                 REAL NOT NULL,
    pnl_percent         REAL,
    outcome             TEXT NOT NULL,
    risk_reward_ratio   REAL,
    stop_loss           REAL,
    take_profit         REAL,
    notes               TEXT,
    tags                TEXT,
    tv_link             TEXT,
    screenshot          TEXT,
    setup_tags          TEXT,
    mistake_tags        TEXT,
    entry_date          TIMESTAMPTZ NOT NULL,
    exit_date           TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS notes (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    tags        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS alerts (
    id               SERIAL PRIMARY KEY,
    symbol           TEXT NOT NULL,
    condition        TEXT NOT NULL,
    target_price     REAL NOT NULL,
    message          TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    is_triggered     BOOLEAN NOT NULL DEFAULT false,
    triggered_at     TIMESTAMPTZ,
    triggered_price  REAL,
    telegram_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS zones (
    id               SERIAL PRIMARY KEY,
    symbol           TEXT NOT NULL,
    upper_price      REAL NOT NULL,
    lower_price      REAL NOT NULL,
    zone_type        TEXT NOT NULL DEFAULT 'support_resistance',
    timeframe        TEXT NOT NULL DEFAULT '1H',
    condition        TEXT NOT NULL DEFAULT 'touch',
    notes            TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    is_triggered     BOOLEAN NOT NULL DEFAULT false,
    triggered_at     TIMESTAMPTZ,
    triggered_price  REAL,
    telegram_enabled BOOLEAN NOT NULL DEFAULT true,
    cooldown_until   TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS trendlines (
    id               SERIAL PRIMARY KEY,
    symbol           TEXT NOT NULL,
    timeframe        TEXT NOT NULL DEFAULT '1H',
    point1_price     REAL NOT NULL,
    point1_time      TIMESTAMPTZ NOT NULL,
    point2_price     REAL NOT NULL,
    point2_time      TIMESTAMPTZ NOT NULL,
    condition        TEXT NOT NULL DEFAULT 'break',
    notes            TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    is_triggered     BOOLEAN NOT NULL DEFAULT false,
    triggered_at     TIMESTAMPTZ,
    triggered_price  REAL,
    telegram_enabled BOOLEAN NOT NULL DEFAULT true,
    cooldown_until   TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS alert_events (
    id               SERIAL PRIMARY KEY,
    alert_id         INTEGER,
    alert_type       TEXT NOT NULL,
    symbol           TEXT NOT NULL,
    condition        TEXT NOT NULL,
    price_at_trigger REAL NOT NULL,
    message          TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS calendar_events (
    id          SERIAL PRIMARY KEY,
    date        TEXT NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT,
    event_type  TEXT NOT NULL DEFAULT 'note',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS chart_layouts (
    slot           TEXT PRIMARY KEY,
    symbol         TEXT NOT NULL DEFAULT 'BTCUSD',
    interval       TEXT NOT NULL DEFAULT '60',
    market         TEXT NOT NULL DEFAULT 'Crypto',
    watchlist_open BOOLEAN NOT NULL DEFAULT true,
    bottom_open    BOOLEAN NOT NULL DEFAULT true,
    bottom_height  INTEGER NOT NULL DEFAULT 190,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `ALTER TABLE zones ADD COLUMN IF NOT EXISTS last_state TEXT`,
  `ALTER TABLE trendlines ADD COLUMN IF NOT EXISTS last_side TEXT`,

  `ALTER TABLE trendlines ADD COLUMN IF NOT EXISTS drawing_type TEXT NOT NULL DEFAULT 'trendline'`,
  `ALTER TABLE trendlines ADD COLUMN IF NOT EXISTS alert_status TEXT NOT NULL DEFAULT 'active'`,

  `CREATE TABLE IF NOT EXISTS drawing_alerts (
    id               SERIAL PRIMARY KEY,
    trendline_id     INTEGER NOT NULL REFERENCES trendlines(id) ON DELETE CASCADE,
    symbol           TEXT NOT NULL,
    timeframe        TEXT NOT NULL DEFAULT '1H',
    drawing_type     TEXT NOT NULL DEFAULT 'trendline',
    condition        TEXT NOT NULL,
    alert_status     TEXT NOT NULL DEFAULT 'active',
    notes            TEXT,
    telegram_enabled BOOLEAN NOT NULL DEFAULT true,
    triggered_at     TIMESTAMPTZ,
    triggered_price  REAL,
    projected_price  REAL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS alert_events_v2 (
    id               SERIAL PRIMARY KEY,
    source_id        INTEGER,
    source_type      TEXT NOT NULL,
    symbol           TEXT NOT NULL,
    timeframe        TEXT,
    drawing_type     TEXT,
    condition        TEXT NOT NULL,
    price_at_trigger REAL NOT NULL,
    projected_price  REAL,
    message          TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    sid    VARCHAR NOT NULL,
    sess   JSON    NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    CONSTRAINT sessions_pkey PRIMARY KEY (sid)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions (expire)`,

  `CREATE TABLE IF NOT EXISTS ctrader_oauth_state (
    state      TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS drawings (
    id          SERIAL PRIMARY KEY,
    symbol      TEXT NOT NULL,
    timeframe   TEXT NOT NULL DEFAULT '1H',
    tool_type   TEXT NOT NULL,
    points      JSONB NOT NULL DEFAULT '[]',
    style       JSONB NOT NULL DEFAULT '{}',
    is_locked   BOOLEAN NOT NULL DEFAULT false,
    is_visible  BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_drawings_symbol_tf ON drawings (symbol, timeframe)`,

  `CREATE TABLE IF NOT EXISTS broker_accounts (
    id              SERIAL PRIMARY KEY,
    broker_id       TEXT NOT NULL,
    label           TEXT NOT NULL DEFAULT '',
    api_key_enc     TEXT NOT NULL,
    api_secret_enc  TEXT NOT NULL,
    api_token       TEXT NOT NULL DEFAULT '',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_broker_accounts_broker_id ON broker_accounts (broker_id)`,

  `ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS api_token TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS meta JSONB`,

  `CREATE INDEX IF NOT EXISTS idx_trades_exit_date ON trades (exit_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_trades_outcome ON trades (outcome)`,
  `CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades (created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS live_prices (
    symbol     TEXT PRIMARY KEY,
    price      REAL NOT NULL,
    provider   TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // Persistent repeat-notification state for backend-owned reminders.
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS repeat_mode TEXT NOT NULL DEFAULT 'three_reminders'`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ`,
  `ALTER TABLE zones ADD COLUMN IF NOT EXISTS repeat_mode TEXT NOT NULL DEFAULT 'three_reminders'`,
  `ALTER TABLE zones ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE zones ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ`,
  `ALTER TABLE trendlines ADD COLUMN IF NOT EXISTS repeat_mode TEXT NOT NULL DEFAULT 'three_reminders'`,
  `ALTER TABLE trendlines ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE trendlines ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ`,

  // ATR-Based Proximity alert fields
  `ALTER TABLE trendlines ADD COLUMN IF NOT EXISTS atr_period INTEGER NOT NULL DEFAULT 14`,
  `ALTER TABLE trendlines ADD COLUMN IF NOT EXISTS atr_multiplier REAL NOT NULL DEFAULT 0.15`,

  // Persistent display IDs for chart drawings (TL-001, TL-002, …)
  `CREATE SEQUENCE IF NOT EXISTS drawing_display_id_seq START 1 MINVALUE 1 NO CYCLE`,
  `ALTER TABLE drawings ADD COLUMN IF NOT EXISTS display_id TEXT`,

  // Link trendline alerts back to the chart drawing that spawned them
  `ALTER TABLE trendlines ADD COLUMN IF NOT EXISTS drawing_display_id TEXT`,
];

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    logger.info("Running DB migrations…");
    for (const sql of MIGRATIONS) {
      await client.query(sql);
    }
    const tableCount = MIGRATIONS.filter(s => s.trimStart().startsWith("CREATE TABLE")).length;
    logger.info({ tables: tableCount }, "DB migrations complete — all tables verified");
  } catch (err) {
    logger.error({ err }, "DB migration failed");
    throw err;
  } finally {
    client.release();
  }
}
