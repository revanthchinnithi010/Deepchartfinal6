import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connStr = process.env.DATABASE_URL;

if (!connStr) {
  throw new Error(
    "DATABASE_URL is not set. " +
    "Go to Replit Secrets and add DATABASE_URL = your Supabase connection string.\n" +
    "Use the Session Mode pooler URL from: Supabase Dashboard → Settings → Database → Connection pooling.",
  );
}

// Detect Supabase connections and enable SSL (direct host or pooler both require it).
// Replit's internal 'helium' host does not use SSL — no ssl option for local fallback.
function buildSslOption(url: string) {
  try {
    const { hostname } = new URL(url);
    if (hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com")) {
      return { rejectUnauthorized: false };
    }
  } catch {
    // malformed URL — fall through
  }
  return undefined;
}

export const pool = new Pool({
  connectionString: connStr,
  ssl: buildSslOption(connStr),
  max: 5,                          // Supabase free plan cap: stay well under 20 connections
  idleTimeoutMillis: 60_000,       // Release idle connections after 60 s
  connectionTimeoutMillis: 10_000,
  keepAlive: true,                 // Prevent NAT/firewall from killing idle connections
  statement_timeout: 15_000,       // Kill runaway queries after 15 s
  application_name: "tradevault",
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool client error:", err.message);
});

pool.on("connect", () => {
  console.info("[DB] New client connected to PostgreSQL");
});

export const db = drizzle(pool, { schema });

export async function checkDbConnection(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return { ok: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export * from "./schema";
