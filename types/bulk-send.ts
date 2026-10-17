export type BulkJobStatus =
  | "draft"
  | "submitting"
  | "queued"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "unknown";

export type BulkRecipientStatus = "pending" | "sent" | "failed" | "skipped" | "unknown";

export interface BulkSendWindow {
  timezone: string;
  startHour: number;
  endHour: number;
  weekdaysOnly: boolean;
}

export interface BulkPreparedContact {
  email: string;
  fields: Record<string, string>;
}

export interface BulkJob {
  id: number;
  jobId: string;
  name: string;
  status: BulkJobStatus;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  cc: string;
  bcc: string;
  intervalMinutes: number;
  jitterSeconds: number;
  pauseMin: number;
  pauseMax: number;
  sendWindow: BulkSendWindow | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  n8nExecutionId: string | null;
  estimatedFinishAt: string | null;
  lastEventAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface BulkRecipient {
  id: number;
  position: number;
  email: string;
  fields: Record<string, string>;
  status: BulkRecipientStatus;
  error: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  skipReason: string | null;
}

export interface BulkRecipientCounts {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  unknown: number;
}

export interface BulkJobDetail {
  job: BulkJob;
  recipients: BulkRecipient[];
  recipientTotal: number;
  counts: BulkRecipientCounts;
}

export interface BulkN8nContact extends Record<string, string> {
  email: string;
}

export interface BulkN8nPayload {
  jobId: string;
  from: { email: string; name?: string };
  drip: {
    intervalMinutes: number;
    jitterSeconds: number;
    preSendPauseSeconds: { min: number; max: number };
  };
  sendWindow?: BulkSendWindow;
  template: {
    subject: string;
    bodyText: string;
    bodyHtml?: string;
  };
  cc: string;
  bcc: string;
  contacts: BulkN8nContact[];
}

export interface BulkSkippedContact {
  row: number;
  email: string;
  reason: string;
}

export interface BulkN8nAccepted {
  ok: true;
  status: "accepted";
  jobId: string;
  total: number;
  skippedCount: number;
  skipped: BulkSkippedContact[];
  intervalMinutes: number;
  jitterSeconds: number;
  estimatedDurationMinutes: number;
  estimatedFinishAt: string;
  executionId: string;
}

export interface BulkN8nDuplicate {
  ok: true;
  status: "duplicate";
  jobId: string;
  message: string;
}

export interface BulkN8nRejected {
  ok: false;
  status: "rejected";
  error: string;
  jobId?: string;
  skipped?: BulkSkippedContact[];
}

export interface BulkEmailResultEvent {
  event: "email_result";
  jobId: string;
  index?: number;
  total?: number;
  email: string;
  status: "sent" | "failed";
  providerMessageId?: string | null;
  error?: string | null;
  sentAt?: string;
  nextSendInSeconds?: number | null;
}

export interface BulkJobCompletedEvent {
  event: "job_completed";
  jobId: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  failures: Array<{ index?: number; email: string; error: string }>;
  finishedAt: string;
}

export type BulkProgressEvent = BulkEmailResultEvent | BulkJobCompletedEvent;
