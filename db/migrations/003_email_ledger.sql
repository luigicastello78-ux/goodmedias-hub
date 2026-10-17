CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_outbound_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id UUID PRIMARY KEY,
  contact_id UUID REFERENCES contacts (id) ON DELETE SET NULL,
  created_by UUID REFERENCES neon_auth."user" (id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('submitting', 'sent', 'failed', 'unknown')),
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  thread_id TEXT,
  in_reply_to TEXT,
  references_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_message_id TEXT,
  error TEXT,
  requested_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbound_messages_created_by ON outbound_messages (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_to_email ON outbound_messages (to_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_thread ON outbound_messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_messages_provider ON outbound_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS suppressions (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint', 'manual')),
  source TEXT NOT NULL,
  note TEXT,
  created_by UUID REFERENCES neon_auth."user" (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS suppressions_active_email ON suppressions (email) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS campaign_batches (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitting', 'queued', 'failed', 'unknown')),
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  sender_pool JSONB NOT NULL,
  schedule JSONB NOT NULL,
  n8n_batch_id TEXT,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_by UUID REFERENCES neon_auth."user" (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_batches_created_by ON campaign_batches (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_batches_created_at ON campaign_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_batch_contacts (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES campaign_batches (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  contact_id UUID REFERENCES contacts (id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  fields JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  reject_reason TEXT,
  UNIQUE (batch_id, email)
);

CREATE INDEX IF NOT EXISTS idx_campaign_batch_contacts_status ON campaign_batch_contacts (batch_id, status);

ALTER TABLE bulk_jobs
  ALTER COLUMN job_id TYPE UUID USING job_id::uuid,
  ALTER COLUMN created_by TYPE UUID USING NULLIF(created_by, '')::uuid,
  ALTER COLUMN send_window_json TYPE JSONB USING send_window_json::jsonb,
  ALTER COLUMN estimated_finish_at TYPE TIMESTAMPTZ USING estimated_finish_at::timestamptz,
  ALTER COLUMN last_event_at TYPE TIMESTAMPTZ USING last_event_at::timestamptz,
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz,
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::timestamptz,
  ALTER COLUMN completed_at TYPE TIMESTAMPTZ USING completed_at::timestamptz;

ALTER TABLE bulk_jobs
  ADD CONSTRAINT bulk_jobs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES neon_auth."user" (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_created_by ON bulk_jobs (created_by, created_at DESC);

ALTER TABLE bulk_job_recipients
  ALTER COLUMN fields_json TYPE JSONB USING fields_json::jsonb,
  ALTER COLUMN sent_at TYPE TIMESTAMPTZ USING sent_at::timestamptz;

ALTER TABLE bulk_job_recipients
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bulk_recipients_contact ON bulk_job_recipients (contact_id);
