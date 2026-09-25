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

export const pool = new Pool({
  connectionString: stripSslQuery(process.env.DATABASE_URL),
  // Required for Supabase transaction pooler (and similar PgBouncer setups)
  prepare: false,
  // Supabase pooler cert chain fails verify-full on Vercel/node-pg
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export * from "./schema";
