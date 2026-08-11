import { defineConfig } from "drizzle-kit";
import path from "path";

const connStr = process.env.DATABASE_URL;

if (!connStr) {
  throw new Error(
    "DATABASE_URL is not set. " +
    "Set it in Replit Secrets to your Supabase connection string before running migrations.\n" +
    "Tip: use the Session Mode pooler URL from Supabase Dashboard → Settings → Database → Connection pooling.",
  );
}

// Enable SSL for Supabase connections (both direct host and pooler require it).
function needsSsl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com");
  } catch {
    return false;
  }
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connStr,
    ...(needsSsl(connStr) ? { ssl: { rejectUnauthorized: false } } : {}),
  },
});
