#!/usr/bin/env node
/**
 * Apply CRM Postgres schema during Vercel build.
 * Uses node-pg with ssl.rejectUnauthorized=false (Supabase pooler cert chain).
 * Never prints DATABASE_URL.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(path.join(root, "lib/db/package.json"));
const pg = require("pg");

function stripSslQuery(url) {
  if (!url) return url;
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

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("ensure-schema: DATABASE_URL is not set");
  process.exit(1);
}

// Fail fast with an actionable message: node-pg parses the connection string
// with WHATWG URL, so an unencoded reserved character in the password (most
// often "@") surfaces as ERR_INVALID_URL. The value itself is never printed.
let parsedUrl;
try {
  parsedUrl = new URL(raw.trim());
} catch {
  console.error(
    "ensure-schema: DATABASE_URL is not a valid connection URI. Percent-encode reserved characters inside the password (@ -> %40, : -> %3A, / -> %2F, ? -> %3F, # -> %23) and keep the single @ that separates credentials from the host.",
  );
  process.exit(1);
}
if (!/^postgres(ql)?:$/.test(parsedUrl.protocol)) {
  console.error(`ensure-schema: DATABASE_URL must use the postgresql:// scheme (got ${parsedUrl.protocol.replace(":", "")}://).`);
  process.exit(1);
}
console.log(`ensure-schema: target ${parsedUrl.hostname}:${parsedUrl.port || 5432}${parsedUrl.pathname}`);

const connectionString = stripSslQuery(raw.trim());
const pool = new pg.Pool({
  connectionString,
  ssl: parsedUrl.searchParams.get("sslmode") === "disable" ? false : { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30_000,
});

const statements = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `DO $$ BEGIN
     CREATE TYPE lead_status AS ENUM ('New','Contacted','Qualified','Proposal','Negotiation','Won','Lost');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE lead_source AS ENUM ('Website','WhatsApp','Phone','Email','Referral','Other');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE quotation_status AS ENUM ('Draft','Generated');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS sessions (
     sid varchar PRIMARY KEY,
     sess jsonb NOT NULL,
     expire timestamp NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire)`,
  `CREATE TABLE IF NOT EXISTS users (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     email varchar UNIQUE,
     first_name varchar,
     last_name varchar,
     profile_image_url varchar,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS leads (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     company_name varchar(200) NOT NULL,
     contact_name varchar(200) NOT NULL,
     phone varchar(50) NOT NULL DEFAULT '',
     email varchar(320) NOT NULL,
     source lead_source NOT NULL,
     requirement text NOT NULL DEFAULT '',
     estimated_value numeric(12,2) NOT NULL DEFAULT 0,
     status lead_status NOT NULL DEFAULT 'New',
     next_follow_up date,
     notes text NOT NULL DEFAULT '',
     owner_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS leads_owner_idx ON leads (owner_id)`,
  `CREATE INDEX IF NOT EXISTS leads_owner_status_idx ON leads (owner_id, status)`,
  `CREATE INDEX IF NOT EXISTS leads_owner_follow_up_idx ON leads (owner_id, next_follow_up)`,
  `CREATE TABLE IF NOT EXISTS activities (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
     type varchar(32) NOT NULL,
     description text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     created_by varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE
   )`,
  `CREATE TABLE IF NOT EXISTS customers (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     lead_id integer NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
     owner_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     company_name varchar(200) NOT NULL,
     contact_name varchar(200) NOT NULL,
     phone varchar(50) NOT NULL DEFAULT '',
     email varchar(320) NOT NULL,
     requirement text NOT NULL DEFAULT '',
     value numeric(12,2) NOT NULL DEFAULT 0,
     converted_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS customers_owner_idx ON customers (owner_id)`,
  `CREATE TABLE IF NOT EXISTS quotations (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     owner_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
     quotation_number varchar(32) NOT NULL,
     status quotation_status NOT NULL DEFAULT 'Draft',
     currency varchar(3) NOT NULL DEFAULT 'INR',
     subtotal numeric(12,2) NOT NULL DEFAULT 0,
     discount numeric(12,2) NOT NULL DEFAULT 0,
     tax_rate numeric(5,2) NOT NULL DEFAULT 18,
     tax_amount numeric(12,2) NOT NULL DEFAULT 0,
     total numeric(12,2) NOT NULL DEFAULT 0,
     valid_until date,
     terms text NOT NULL DEFAULT '',
     notes text NOT NULL DEFAULT '',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS quotations_number_idx ON quotations (quotation_number)`,
  `CREATE INDEX IF NOT EXISTS quotations_owner_idx ON quotations (owner_id)`,
  `CREATE INDEX IF NOT EXISTS quotations_lead_idx ON quotations (lead_id)`,
  `CREATE TABLE IF NOT EXISTS quotation_items (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     quotation_id integer NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
     product_model varchar(64) NOT NULL DEFAULT '',
     product_name varchar(300) NOT NULL,
     quantity numeric(12,2) NOT NULL DEFAULT 1,
     unit varchar(32) NOT NULL DEFAULT 'Nos',
     unit_price numeric(12,2) NOT NULL DEFAULT 0,
     discount numeric(5,2) NOT NULL DEFAULT 0,
     line_total numeric(12,2) NOT NULL DEFAULT 0,
     sort_order integer NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS quotation_items_quotation_idx ON quotation_items (quotation_id)`,
  `DO $$ BEGIN
     CREATE TYPE whatsapp_message_direction AS ENUM ('Inbound','Outbound');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE whatsapp_message_status AS ENUM ('Received','Sent','Failed');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS whatsapp_messages (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     owner_id varchar REFERENCES users(id) ON DELETE SET NULL,
     lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
     direction whatsapp_message_direction NOT NULL,
     status whatsapp_message_status NOT NULL,
     wa_message_id varchar(200) NOT NULL,
     phone varchar(50) NOT NULL,
     message_type varchar(40) NOT NULL,
     body text NOT NULL DEFAULT '',
     payload jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS whatsapp_messages_lead_idx ON whatsapp_messages (lead_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_idx ON whatsapp_messages (phone, created_at)`,
  `CREATE INDEX IF NOT EXISTS whatsapp_messages_wa_id_idx ON whatsapp_messages (wa_message_id)`,
];

try {
  const client = await pool.connect();
  try {
    const who = await client.query("select current_database() as db");
    console.log("ensure-schema: connected to database", who.rows[0].db);
    for (const sql of statements) {
      await client.query(sql);
    }
    const tables = await client.query(
      "select table_name from information_schema.tables where table_schema='public' order by 1",
    );
    console.log(
      "ensure-schema: ok tables=",
      tables.rows.map((r) => r.table_name).join(","),
    );
  } finally {
    client.release();
  }
} catch (err) {
  console.error("ensure-schema: FAILED", err && err.message ? err.message : err);
  if (err && err.code) console.error("ensure-schema: code=", err.code);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
