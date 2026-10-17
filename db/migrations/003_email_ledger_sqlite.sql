CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_outbound_at TEXT
);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts (id) ON DELETE SET NULL,
  created_by TEXT,
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
  references_json TEXT NOT NULL DEFAULT '[]',
  provider_message_id TEXT,
  error TEXT,
  requested_at TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbound_messages_created_by ON outbound_messages (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_to_email ON outbound_messages (to_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_thread ON outbound_messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_messages_provider ON outbound_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS suppressions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint', 'manual')),
  source TEXT NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  released_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS suppressions_active_email ON suppressions (email) WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS campaign_batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitting', 'queued', 'failed', 'unknown')),
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  sender_pool TEXT NOT NULL,
  schedule TEXT NOT NULL,
  n8n_batch_id TEXT,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_batches_created_at ON campaign_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_batch_contacts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES campaign_batches (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  contact_id TEXT REFERENCES contacts (id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  fields TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  reject_reason TEXT,
  UNIQUE (batch_id, email)
);

CREATE INDEX IF NOT EXISTS idx_campaign_batch_contacts_status ON campaign_batch_contacts (batch_id, status);

ALTER TABLE bulk_job_recipients ADD COLUMN contact_id TEXT REFERENCES contacts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bulk_recipients_contact ON bulk_job_recipients (contact_id);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_created_by ON bulk_jobs (created_by, created_at DESC);
