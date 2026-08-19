import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";

const PointSchema = z.object({
  time:  z.number(),
  price: z.number(),
});

const StyleSchema = z.object({
  color:              z.string().default("#B7FF5A"),
  thickness:          z.number().int().min(1).max(6).default(2),
  lineStyle:          z.enum(["solid", "dashed", "dotted"]).default("solid"),
  fillOpacity:        z.number().min(0).max(1).default(0.1),
  opacity:            z.number().min(0).max(1).optional(),
  profitColor:        z.string().optional(),
  stopColor:          z.string().optional(),
  visibleTimeframes:  z.array(z.string()).optional(),
});

const CreateBody = z.object({
  symbol:    z.string().min(1).transform((s) => s.toUpperCase()),
  timeframe: z.string().default("1H"),
  toolType:  z.string().min(1),
  points:    z.array(PointSchema).min(1).max(5),
  style:     StyleSchema.optional(),
  isLocked:  z.boolean().optional().default(false),
  isVisible: z.boolean().optional().default(true),
});

const PatchBody = z.object({
  points:    z.array(PointSchema).min(1).max(5).optional(),
  style:     StyleSchema.partial().optional(),
  isLocked:  z.boolean().optional(),
  isVisible: z.boolean().optional(),
  toolType:  z.string().min(1).optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

// Line drawings use the drawing primary key as their public display ID.
// This deliberately matches the UI fallback (TL-{drawing.id}) so the chart,
// alert creator and alert list can never drift apart because of a second sequence.
const LINE_TOOL_TYPES = new Set(["trendline", "ray", "extended"]);

function serializeRow(row: Record<string, unknown>) {
  return {
    id:        row["id"],
    symbol:    row["symbol"],
    timeframe: row["timeframe"],
    toolType:  row["tool_type"],
    points:    row["points"],
    style:     row["style"],
    isLocked:  row["is_locked"],
    isVisible: row["is_visible"],
    createdAt: row["created_at"],
    ...(row["display_id"] != null ? { displayId: row["display_id"] } : {}),
  };
}

const DEFAULT_STYLE = { color: "#B7FF5A", thickness: 2, lineStyle: "solid", fillOpacity: 0.1 };

export const drawingsRouter: IRouter = Router();

drawingsRouter.get("/drawings", async (req, res): Promise<void> => {
  const symbol    = typeof req.query["symbol"]    === "string" ? req.query["symbol"].toUpperCase()   : null;
  const timeframe = typeof req.query["timeframe"] === "string" ? req.query["timeframe"] : null;
  try {
    const client = await pool.connect();
    try {
      let result;
      if (symbol && timeframe) {
        result = await client.query(
          `SELECT * FROM drawings WHERE symbol=$1 AND timeframe=$2 ORDER BY created_at DESC`,
          [symbol, timeframe],
        );
      } else if (symbol) {
        result = await client.query(
          `SELECT * FROM drawings WHERE symbol=$1 ORDER BY created_at DESC`,
          [symbol],
        );
      } else {
        result = await client.query(`SELECT * FROM drawings ORDER BY created_at DESC LIMIT 500`);
      }
      res.json((result.rows as Record<string, unknown>[]).map(serializeRow));
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({ error: "Failed to fetch drawings" });
  }
});

drawingsRouter.post("/drawings", async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d     = parsed.data;
  const style = { ...DEFAULT_STYLE, ...d.style };
  try {
    const client = await pool.connect();
    try {
      // Use the drawings primary-key sequence itself for TL-NNN. There is now
      // exactly one ID source, so a drawing can never be TL-061 on the chart
      // while the alert UI independently derives TL-087 from the row ID.
      const result = await client.query(
        `WITH new_id AS (
           SELECT nextval('drawings_id_seq') AS id
         )
         INSERT INTO drawings (id, symbol, timeframe, tool_type, points, style, is_locked, is_visible, display_id)
         SELECT
           new_id.id,
           $1,
           $2,
           $3,
           $4::jsonb,
           $5::jsonb,
           $6,
           $7,
           CASE WHEN $3 = ANY($8::text[]) THEN 'TL-' || LPAD(new_id.id::TEXT, 3, '0') ELSE NULL END
         FROM new_id
         RETURNING *`,
        [
          d.symbol,
          d.timeframe,
          d.toolType,
          JSON.stringify(d.points),
          JSON.stringify(style),
          d.isLocked,
          d.isVisible,
          Array.from(LINE_TOOL_TYPES),
        ],
      );
      res.status(201).json(serializeRow(result.rows[0] as Record<string, unknown>));
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({ error: "Failed to create drawing" });
  }
});

drawingsRouter.patch("/drawings/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.points    !== undefined) { sets.push(`points=$${i++}::jsonb`);   vals.push(JSON.stringify(d.points)); }
  if (d.style     !== undefined) {
    sets.push(`style = style || $${i++}::jsonb`);
    vals.push(JSON.stringify(d.style));
  }
  if (d.isLocked  !== undefined) { sets.push(`is_locked=$${i++}`);   vals.push(d.isLocked); }
  if (d.isVisible !== undefined) { sets.push(`is_visible=$${i++}`);  vals.push(d.isVisible); }
  if (d.toolType  !== undefined) { sets.push(`tool_type=$${i++}`);   vals.push(d.toolType); }
  if (sets.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  vals.push(params.data.id);
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE drawings SET ${sets.join(", ")} WHERE id=$${i} RETURNING *`,
        vals,
      );
      if (result.rows.length === 0) { res.status(404).json({ error: "Drawing not found" }); return; }
      res.json(serializeRow(result.rows[0] as Record<string, unknown>));
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({ error: "Failed to update drawing" });
  }
});

drawingsRouter.delete("/drawings/:id", async (req, res): Promise<void> => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM drawings WHERE id=$1 RETURNING id`,
        [params.data.id],
      );
      if (result.rows.length === 0) { res.status(404).json({ error: "Drawing not found" }); return; }
      res.sendStatus(204);
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({ error: "Failed to delete drawing" });
  }
});
