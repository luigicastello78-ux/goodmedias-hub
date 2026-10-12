import "server-only";

import type { EmailAddress, ManualSendRequest } from "@/types/n8n";
import type { InboxMessage, InboxThread } from "@/types/inbox";

export interface FixtureThreadRecord {
  thread: InboxThread;
  messages: InboxMessage[];
}

export const fixtureThreads: FixtureThreadRecord[] = [];

export const fixtureSenders: EmailAddress[] = [];

export const appendFixtureReply = (payload: ManualSendRequest, threadId: string): void => {
  const record = fixtureThreads.find((item) => item.thread.id === threadId);
  if (!record) {
    return;
  }

  const message: InboxMessage = {
    id: `msg_${payload.idempotencyKey}`,
    direction: "outbound",
    from: payload.from,
    to: [payload.to],
    subject: payload.subject,
    bodyText: payload.bodyText,
    sentAt: payload.requestedAt,
    messageIdHeader: `<${payload.idempotencyKey}@fixture.goodmedias>`,
  };

  record.messages.push(message);
  record.thread.snippet = payload.bodyText.slice(0, 140);
  record.thread.receivedAt = payload.requestedAt;
  record.thread.messageCount = record.messages.length;
  record.thread.unread = false;
};
