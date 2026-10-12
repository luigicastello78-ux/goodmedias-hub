export interface EmailAddress {
  email: string;
  name?: string;
}

export interface ManualSendRequest {
  idempotencyKey: string;
  requestedAt: string;
  from: EmailAddress;
  to: EmailAddress;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  thread: {
    threadId?: string;
    inReplyTo?: string;
    references?: string[];
  };
}

export interface ManualSendResponse {
  ok: true;
  status: "sent";
  idempotencyKey: string;
  providerMessageId: string;
  threadId: string;
}

export interface BulkSchedule {
  timezone: string;
  startAt: string | null;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  maxPerDay: number;
}

export interface BulkContact {
  email: string;
  fields: Record<string, string>;
}

export interface BulkIngestRequest {
  idempotencyKey: string;
  requestedAt: string;
  campaignName: string;
  subjectTemplate: string;
  bodyTemplate: string;
  senderPool: string[];
  schedule: BulkSchedule;
  contacts: BulkContact[];
}

export interface BulkRejectedContact {
  index: number;
  email: string;
  reason: string;
}

export interface BulkIngestResponse {
  ok: true;
  status: "queued";
  idempotencyKey: string;
  batchId: string;
  acceptedCount: number;
  rejected: BulkRejectedContact[];
}

export type N8nErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "TIMEOUT";

export interface N8nErrorResponse {
  ok: false;
  error: {
    code: N8nErrorCode;
    message: string;
    retryable: boolean;
  };
}
