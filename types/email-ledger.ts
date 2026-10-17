export type OutboundStatus = "submitting" | "sent" | "failed" | "unknown";

export interface OutboundMessage {
  id: string;
  contactId: string | null;
  status: OutboundStatus;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  toName: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  threadId: string | null;
  inReplyTo: string | null;
  references: string[];
  providerMessageId: string | null;
  error: string | null;
  requestedAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CampaignBatchStatus = "submitting" | "queued" | "failed" | "unknown";
export type CampaignContactStatus = "pending" | "accepted" | "rejected";

export interface CampaignBatch {
  id: string;
  name: string;
  status: CampaignBatchStatus;
  subjectTemplate: string;
  bodyTemplate: string;
  senderPool: string[];
  n8nBatchId: string | null;
  acceptedCount: number;
  rejectedCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignBatchContact {
  id: string;
  position: number;
  email: string;
  status: CampaignContactStatus;
  rejectReason: string | null;
}

export interface ContactActivity {
  source: "single" | "drip" | "campaign";
  id: string;
  label: string;
  status: string;
  at: string;
}
