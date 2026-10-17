CREATE TABLE IF NOT EXISTS bulk_jobs (
  id INTEGER PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'draft',
      'submitting',
      'queued',
      'running',
      'completed',
      'completed_with_errors',
      'failed',
      'unknown'
    )
  ),
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  cc TEXT NOT NULL DEFAULT '',
  bcc TEXT NOT NULL DEFAULT '',
  interval_minutes REAL NOT NULL,
  jitter_seconds INTEGER NOT NULL,
  pause_min INTEGER NOT NULL,
  pause_max INTEGER NOT NULL,
  send_window_json TEXT,
  total INTEGER NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  n8n_execution_id TEXT,
  estimated_finish_at TEXT,
  last_event_at TEXT,
  error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status ON bulk_jobs (status);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_created_at ON bulk_jobs (created_at);

CREATE TABLE IF NOT EXISTS bulk_job_recipients (
  id INTEGER PRIMARY KEY,
  bulk_job_id INTEGER NOT NULL REFERENCES bulk_jobs (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  email TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'unknown')),
  error TEXT,
  provider_message_id TEXT,
  sent_at TEXT,
  skip_reason TEXT,
  UNIQUE (bulk_job_id, email)
);

CREATE INDEX IF NOT EXISTS idx_bulk_recipients_job_status ON bulk_job_recipients (bulk_job_id, status);
