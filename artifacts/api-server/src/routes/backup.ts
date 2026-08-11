import { Router } from "express";
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";
import { logger } from "../lib/logger.js";

const BACKUP_TABLES = [
  "trades",
  "notes",
  "drawings",
  "alerts",
  "zones",
  "trendlines",
  "watchlist",
  "chart_layouts",
  "calendar_events",
] as const;

type BackupTable = typeof BACKUP_TABLES[number];

async function upsertRows(
  client: PoolClient,
  table: BackupTable,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (!rows.length) return 0;
  let inserted = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    if (!cols.length) continue;
    const vals = cols.map(c => row[c]);
    const colStr     = cols.map(c => `"${c}"`).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const updates    = cols.filter(c => c !== "id").map(c => `"${c}" = EXCLUDED."${c}"`).join(", ");
    const updateClause = updates || `"id" = EXCLUDED."id"`;
    await client.query(
      `INSERT INTO "${table}" (${colStr}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateClause}`,
      vals,
    );
    inserted++;
  }
  return inserted;
}

export const backupRouter = Router();

backupRouter.get("/backup/export", async (_req, res) => {
  try {
    const results = await Promise.all(
      BACKUP_TABLES.map(t => pool.query(`SELECT * FROM "${t}" ORDER BY id`)),
    );
    const data: Record<string, unknown[]> = {};
    BACKUP_TABLES.forEach((t, i) => { data[t] = results[i]!.rows; });

    const backup = {
      version: "1",
      exportedAt: new Date().toISOString(),
      data,
    };

    const filename = `tradevault-backup-${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(backup);

    logger.info(
      { rowCounts: Object.fromEntries(BACKUP_TABLES.map((t, i) => [t, results[i]!.rows.length])) },
      "backup/export: done",
    );
  } catch (err) {
    logger.error({ err }, "backup/export: failed");
    res.status(500).json({ error: "Export failed", details: String(err) });
  }
});

backupRouter.post("/backup/import", async (req, res) => {
  const body = req.body as { version?: string; data?: Record<string, unknown[]> };
  if (!body?.data || typeof body.data !== "object") {
    res.status(400).json({ error: "Invalid backup file — missing data field" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const summary: Record<string, number> = {};
    for (const table of BACKUP_TABLES) {
      const rows = body.data[table];
      if (!Array.isArray(rows)) continue;
      const count = await upsertRows(client, table, rows as Record<string, unknown>[]);
      summary[table] = count;
    }
    await client.query("COMMIT");
    logger.info({ summary }, "backup/import: done");
    res.json({ success: true, summary });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "backup/import: failed");
    res.status(500).json({ error: "Import failed", details: String(err) });
  } finally {
    client.release();
  }
});
