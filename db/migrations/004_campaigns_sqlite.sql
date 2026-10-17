ALTER TABLE contacts ADD COLUMN phone TEXT;
ALTER TABLE contacts ADD COLUMN job_title TEXT;
ALTER TABLE contacts ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE contacts ADD COLUMN source TEXT;
ALTER TABLE contacts ADD COLUMN notes TEXT;

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  merge_tag_fallbacks TEXT NOT NULL DEFAULT '{}',
  paused_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_sequences (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('message', 'delay')),
  delay_days INTEGER NOT NULL DEFAULT 0,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  UNIQUE (campaign_id, sequence_order)
);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('enrolled', 'in_progress', 'completed', 'failed', 'unsubscribed')),
  current_sequence INTEGER NOT NULL DEFAULT 0,
  enrolled_at TEXT NOT NULL,
  completed_at TEXT,
  last_message_sent_at TEXT,
  UNIQUE (campaign_id, contact_id)
);

CREATE TABLE IF NOT EXISTS message_queue (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  sequence_id TEXT NOT NULL REFERENCES campaign_sequences (id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'unknown')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  outbound_message_id TEXT REFERENCES outbound_messages (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS message_queue_open_step
  ON message_queue (campaign_id, contact_id, sequence_id)
  WHERE status IN ('pending', 'processing', 'unknown');

CREATE INDEX IF NOT EXISTS idx_message_queue_due ON message_queue (status, scheduled_for);

CREATE TABLE IF NOT EXISTS campaign_pause_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  paused_at TEXT NOT NULL,
  resumed_at TEXT,
  pause_duration_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batch_distributions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'paused')),
  execution_type TEXT NOT NULL CHECK (execution_type IN ('immediate', 'drip')),
  total_contacts INTEGER NOT NULL DEFAULT 0,
  processed_contacts INTEGER NOT NULL DEFAULT 0,
  drip_contacts_per_batch INTEGER NOT NULL DEFAULT 1,
  drip_interval_minutes INTEGER NOT NULL DEFAULT 5,
  last_drip_sent_at TEXT,
  send_window_enabled INTEGER NOT NULL DEFAULT 0,
  send_window_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  send_window_start_hour INTEGER NOT NULL DEFAULT 9,
  send_window_end_hour INTEGER NOT NULL DEFAULT 17,
  send_window_timezone TEXT NOT NULL DEFAULT 'UTC',
  paused_at TEXT,
  error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_batch_distributions_campaign ON batch_distributions (campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS batch_contacts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batch_distributions (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  contact_data TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  processing_order INTEGER NOT NULL,
  enrolled_contact_id TEXT REFERENCES contacts (id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  UNIQUE (batch_id, email)
);

CREATE INDEX IF NOT EXISTS idx_batch_contacts_pending ON batch_contacts (batch_id, status, processing_order);
