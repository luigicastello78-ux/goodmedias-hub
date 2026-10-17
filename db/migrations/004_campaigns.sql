ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_status_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_status_check
  CHECK (status IN ('active', 'inactive', 'lead', 'customer'));

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  merge_tag_fallbacks JSONB NOT NULL DEFAULT '{}'::jsonb,
  paused_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES neon_auth."user" (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_sequences (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
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
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('enrolled', 'in_progress', 'completed', 'failed', 'unsubscribed')),
  current_sequence INTEGER NOT NULL DEFAULT 0,
  enrolled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  last_message_sent_at TIMESTAMPTZ,
  UNIQUE (campaign_id, contact_id)
);

CREATE TABLE IF NOT EXISTS message_queue (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES campaign_sequences (id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'unknown')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  outbound_message_id UUID REFERENCES outbound_messages (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS message_queue_open_step
  ON message_queue (campaign_id, contact_id, sequence_id)
  WHERE status IN ('pending', 'processing', 'unknown');

CREATE INDEX IF NOT EXISTS idx_message_queue_due ON message_queue (status, scheduled_for);

CREATE TABLE IF NOT EXISTS campaign_pause_events (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  paused_at TIMESTAMPTZ NOT NULL,
  resumed_at TIMESTAMPTZ,
  pause_duration_ms BIGINT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS batch_distributions (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'paused')),
  execution_type TEXT NOT NULL CHECK (execution_type IN ('immediate', 'drip')),
  total_contacts INTEGER NOT NULL DEFAULT 0,
  processed_contacts INTEGER NOT NULL DEFAULT 0,
  drip_contacts_per_batch INTEGER NOT NULL DEFAULT 1,
  drip_interval_minutes INTEGER NOT NULL DEFAULT 5,
  last_drip_sent_at TIMESTAMPTZ,
  send_window_enabled INTEGER NOT NULL DEFAULT 0,
  send_window_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  send_window_start_hour INTEGER NOT NULL DEFAULT 9,
  send_window_end_hour INTEGER NOT NULL DEFAULT 17,
  send_window_timezone TEXT NOT NULL DEFAULT 'UTC',
  paused_at TIMESTAMPTZ,
  error TEXT,
  created_by UUID REFERENCES neon_auth."user" (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batch_distributions_campaign ON batch_distributions (campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS batch_contacts (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES batch_distributions (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  contact_data JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  processing_order INTEGER NOT NULL,
  enrolled_contact_id UUID REFERENCES contacts (id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  UNIQUE (batch_id, email)
);

CREATE INDEX IF NOT EXISTS idx_batch_contacts_pending ON batch_contacts (batch_id, status, processing_order);
