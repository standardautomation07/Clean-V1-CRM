-- Persist inbound and outbound WhatsApp Cloud API messages.
DO $$ BEGIN CREATE TYPE whatsapp_message_direction AS ENUM ('Inbound', 'Outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE whatsapp_message_status AS ENUM ('Received', 'Sent', 'Failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS whatsapp_messages (
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
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_lead_idx ON whatsapp_messages (lead_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_idx ON whatsapp_messages (phone, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_messages_wa_id_idx ON whatsapp_messages (wa_message_id);
