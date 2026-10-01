import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function stripSslQuery(url: string) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^ssl/i.test(key) || key.toLowerCase() === "uselibpqcompat") {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Supabase pooler certificates fail verify-full on Vercel, so verification is
// relaxed by default. "?sslmode=disable" in the URL turns TLS off entirely,
// which only a local development database should ever ask for.
function sslOption(url: string): false | { rejectUnauthorized: boolean } {
  try {
    if (new URL(url).searchParams.get("sslmode") === "disable") return false;
  } catch {
    // Fall through: an unparseable URL fails later with a clearer error.
  }
  return { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString: stripSslQuery(process.env.DATABASE_URL.trim()),
  // node-postgres only issues prepared statements for named queries, which
  // drizzle does not use, so the Supabase transaction pooler (PgBouncer) is
  // already safe; pg has no "prepare" option of its own.
  ssl: sslOption(process.env.DATABASE_URL.trim()),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
