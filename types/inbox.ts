import type { EmailAddress } from "@/types/n8n";

export interface InboxThread {
  id: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  unread: boolean;
  from: EmailAddress;
  to: EmailAddress[];
  messageCount: number;
}

export interface InboxListResponse {
  ok: true;
  threads: InboxThread[];
  nextCursor: string | null;
}

export interface InboxMessage {
  id: string;
  direction: "inbound" | "outbound";
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  bodyText: string;
  sentAt: string;
  messageIdHeader?: string;
  references?: string[];
  fields?: Record<string, string>;
}

export interface ThreadDetailResponse {
  ok: true;
  thread: InboxThread;
  messages: InboxMessage[];
}

export interface SendersResponse {
  ok: true;
  senders: EmailAddress[];
}

export interface InboxQuery {
  cursor?: string;
  q?: string;
  limit?: number;
}

export type DispatchStatus = "idle" | "sending" | "sent" | "error";

export interface ComposerDraft {
  fromEmail: string;
  toEmail: string;
  toName: string;
  subject: string;
  bodyText: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
}
