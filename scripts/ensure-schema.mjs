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
     gstin varchar(20) NOT NULL DEFAULT '',
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
  `DO $$ BEGIN
     CREATE TYPE nova_approval_status AS ENUM ('Pending','Approved','Rejected','Executed','Failed');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS nova_approvals (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     owner_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     tool_name varchar(120) NOT NULL,
     risk varchar(32) NOT NULL,
     input jsonb NOT NULL DEFAULT '{}'::jsonb,
     status nova_approval_status NOT NULL DEFAULT 'Pending',
     requested_at timestamptz NOT NULL DEFAULT now(),
     decided_at timestamptz,
     executed_at timestamptz,
     decided_by varchar REFERENCES users(id) ON DELETE SET NULL,
     result jsonb,
     error text
   )`,
  `CREATE INDEX IF NOT EXISTS nova_approvals_owner_status_idx ON nova_approvals (owner_id, status)`,
  `CREATE INDEX IF NOT EXISTS nova_approvals_owner_requested_idx ON nova_approvals (owner_id, requested_at)`,
  `DO $$ BEGIN
     CREATE TYPE commercial_document_type AS ENUM ('SalesOrder','DeliveryChallan','Invoice');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE commercial_document_status AS ENUM ('Draft','PendingApproval','Approved','Issued','Cancelled');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS commercial_documents (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     owner_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
     document_type commercial_document_type NOT NULL,
     document_number varchar(40) NOT NULL,
     status commercial_document_status NOT NULL DEFAULT 'Draft',
     reference_document_id integer,
     document_date timestamptz NOT NULL DEFAULT now(),
     customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
     totals jsonb NOT NULL DEFAULT '{}'::jsonb,
     tax_details jsonb NOT NULL DEFAULT '{}'::jsonb,
     logistics jsonb NOT NULL DEFAULT '{}'::jsonb,
     notes text NOT NULL DEFAULT '',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS commercial_documents_number_idx ON commercial_documents (document_number)`,
  `CREATE INDEX IF NOT EXISTS commercial_documents_owner_idx ON commercial_documents (owner_id)`,
  `CREATE INDEX IF NOT EXISTS commercial_documents_lead_idx ON commercial_documents (lead_id)`,
  `CREATE INDEX IF NOT EXISTS commercial_documents_reference_idx ON commercial_documents (reference_document_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_document_items (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     document_id integer NOT NULL REFERENCES commercial_documents(id) ON DELETE CASCADE,
     product_model varchar(64) NOT NULL,
     product_name varchar(300) NOT NULL,
     quantity numeric(12,2) NOT NULL DEFAULT 1,
     unit varchar(32) NOT NULL DEFAULT 'Nos',
     unit_price numeric(12,2) NOT NULL DEFAULT 0,
     discount numeric(5,2) NOT NULL DEFAULT 0,
     line_total numeric(12,2) NOT NULL DEFAULT 0,
     sort_order integer NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS commercial_document_items_document_idx ON commercial_document_items (document_id)`,
  `DO $$ BEGIN
     CREATE TYPE outreach_status AS ENUM ('Sent','Failed');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS outreach_emails (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     owner_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
     to_email varchar(320) NOT NULL,
     from_email varchar(320) NOT NULL,
     subject varchar(300) NOT NULL,
     body text NOT NULL,
     status outreach_status NOT NULL,
     provider_message_id varchar(200),
     error text NOT NULL DEFAULT '',
     sent_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS outreach_emails_lead_idx ON outreach_emails (lead_id, sent_at)`,
  `CREATE INDEX IF NOT EXISTS outreach_emails_owner_idx ON outreach_emails (owner_id, sent_at)`,
  `CREATE INDEX IF NOT EXISTS outreach_emails_to_idx ON outreach_emails (to_email)`,
];

// Columns added to tables that already exist. The table check below skips all
// DDL once every table is present, which is right for a least-privilege role
// but would silently miss a new column. These are additive and idempotent, so
// they are safe to attempt on every deploy, and a permission error on them is
// reported without failing the deployment.
const ADDITIVE_COLUMNS = [
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS gstin varchar(20) NOT NULL DEFAULT ''`,
];

/** Every table the application expects to exist. */
const REQUIRED_TABLES = [
  "activities",
  "commercial_document_items",
  "commercial_documents",
  "customers",
  "leads",
  "nova_approvals",
  "quotation_items",
  "quotations",
  "sessions",
  "users",
  "whatsapp_messages",
  "outreach_emails",
];

try {
  const client = await pool.connect();
  try {
    const who = await client.query("select current_database() as db, current_user as role");
    console.log(`ensure-schema: connected to database ${who.rows[0].db} as ${who.rows[0].role}`);

    const present = async () => {
      const rows = await client.query(
        "select table_name from information_schema.tables where table_schema='public'",
      );
      return new Set(rows.rows.map((r) => r.table_name));
    };

    // The application should connect with a least-privilege role that cannot
    // change the schema. When migrations have already been applied by the
    // database owner there is nothing to do, so skip the DDL rather than
    // failing on "permission denied for schema public".
    const before = await present();
    const missing = REQUIRED_TABLES.filter((t) => !before.has(t));
    if (missing.length === 0) {
      console.log(`ensure-schema: schema already present (${REQUIRED_TABLES.length} tables), nothing to apply`);
    } else {
      console.log(`ensure-schema: applying schema, missing: ${missing.join(",")}`);
      try {
        for (const sql of statements) {
          await client.query(sql);
        }
      } catch (err) {
        if (err && err.code === "42501") {
          console.error(
            `ensure-schema: FAILED ${err.message}. The connected role may not change the schema. Apply lib/db/migrations/*.sql as the database owner, then redeploy. Missing tables: ${missing.join(",")}`,
          );
          process.exitCode = 1;
          throw null;
        }
        throw err;
      }
      const after = await present();
      const stillMissing = REQUIRED_TABLES.filter((t) => !after.has(t));
      if (stillMissing.length) {
        console.error(`ensure-schema: FAILED tables still missing after apply: ${stillMissing.join(",")}`);
        process.exitCode = 1;
        throw null;
      }
      console.log(`ensure-schema: ok tables= ${[...after].sort().join(",")}`);
    }

    // Runs whether or not the tables were just created, because a column added
    // to an existing table is exactly the case the check above skips.
    for (const sql of ADDITIVE_COLUMNS) {
      try {
        await client.query(sql);
      } catch (err) {
        if (err && err.code === "42501") {
          console.error(`ensure-schema: could not apply "${sql}" (permission denied). Apply lib/db/migrations/*.sql as the database owner.`);
        } else {
          throw err;
        }
      }
    }
    console.log(`ensure-schema: additive columns checked (${ADDITIVE_COLUMNS.length})`);
  } finally {
    client.release();
  }
} catch (err) {
  if (err === null) {
    // Already reported with an actionable message above.
  } else {
    console.error("ensure-schema: FAILED", err && err.message ? err.message : err);
    if (err && err.code) console.error("ensure-schema: code=", err.code);
    process.exitCode = 1;
  }
} finally {
  await pool.end().catch(() => {});
}
