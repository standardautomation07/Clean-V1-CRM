-- Outbound prospecting emails from HUNTER.
-- Records every send, including failures, so a campaign is auditable.
-- Non-destructive: safe to run more than once.
DO $$ BEGIN CREATE TYPE outreach_status AS ENUM ('Sent','Failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS outreach_emails (
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
);
CREATE INDEX IF NOT EXISTS outreach_emails_lead_idx ON outreach_emails (lead_id, sent_at);
CREATE INDEX IF NOT EXISTS outreach_emails_owner_idx ON outreach_emails (owner_id, sent_at);
CREATE INDEX IF NOT EXISTS outreach_emails_to_idx ON outreach_emails (to_email);

GRANT SELECT, INSERT, UPDATE, DELETE ON outreach_emails TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;
