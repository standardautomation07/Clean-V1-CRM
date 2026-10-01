-- NOVA approval queue and commercial documents.
-- These tables back /api/nova/approvals (loaded by the NOVA Command Center on
-- mount) and /api/documents. They were missing from scripts/ensure-schema.mjs,
-- so a database created purely by the deployment-time schema step does not have
-- them yet. Non-destructive: safe to run more than once.
DO $$ BEGIN CREATE TYPE nova_approval_status AS ENUM ('Pending','Approved','Rejected','Executed','Failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE commercial_document_type AS ENUM ('SalesOrder','DeliveryChallan','Invoice');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE commercial_document_status AS ENUM ('Draft','PendingApproval','Approved','Issued','Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS nova_approvals (
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
);
CREATE INDEX IF NOT EXISTS nova_approvals_owner_status_idx ON nova_approvals (owner_id, status);
CREATE INDEX IF NOT EXISTS nova_approvals_owner_requested_idx ON nova_approvals (owner_id, requested_at);

CREATE TABLE IF NOT EXISTS commercial_documents (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_documents_number_idx ON commercial_documents (document_number);
CREATE INDEX IF NOT EXISTS commercial_documents_owner_idx ON commercial_documents (owner_id);
CREATE INDEX IF NOT EXISTS commercial_documents_lead_idx ON commercial_documents (lead_id);
CREATE INDEX IF NOT EXISTS commercial_documents_reference_idx ON commercial_documents (reference_document_id);

CREATE TABLE IF NOT EXISTS commercial_document_items (
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
);
CREATE INDEX IF NOT EXISTS commercial_document_items_document_idx ON commercial_document_items (document_id);
