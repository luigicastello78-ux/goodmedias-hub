import "server-only";

import type { EmailAddress, ManualSendRequest } from "@/types/n8n";
import type { InboxMessage, InboxThread } from "@/types/inbox";

export interface FixtureThreadRecord {
  thread: InboxThread;
  messages: InboxMessage[];
}

const address = (email: string, name: string): EmailAddress => ({ email, name });

const createSeedThreads = (): FixtureThreadRecord[] => [
  {
    thread: {
      id: "thread_northwind",
      subject: "Intro for the Northwind pipeline",
      snippet: "Could you send a time that works next week?",
      receivedAt: "2026-10-11T15:24:00.000Z",
      unread: true,
      from: address("ava@northwind.test", "Ava Nguyen"),
      to: [address("alex@goodmedias.test", "Alex Rivera")],
      messageCount: 2,
    },
    messages: [
      {
        id: "msg_northwind_1",
        direction: "outbound",
        from: address("alex@goodmedias.test", "Alex Rivera"),
        to: [address("ava@northwind.test", "Ava Nguyen")],
        subject: "Intro for the Northwind pipeline",
        bodyText:
          "Hi Ava,\n\nI work with agencies that want a cleaner outbound workflow. Worth a short look at how Northwind is booking meetings?",
        sentAt: "2026-10-10T14:05:00.000Z",
        messageIdHeader: "<northwind-1@goodmedias.test>",
      },
      {
        id: "msg_northwind_2",
        direction: "inbound",
        from: address("ava@northwind.test", "Ava Nguyen"),
        to: [address("alex@goodmedias.test", "Alex Rivera")],
        subject: "Re: Intro for the Northwind pipeline",
        bodyText: "Could you send a time that works next week? I can loop in our partnerships lead.",
        sentAt: "2026-10-11T15:24:00.000Z",
        messageIdHeader: "<northwind-2@northwind.test>",
        references: ["<northwind-1@goodmedias.test>"],
        fields: {
          first_name: "Ava",
          company: "Northwind",
          city: "Seattle",
        },
      },
    ],
  },
  {
    thread: {
      id: "thread_contoso",
      subject: "Quick question about Contoso outbound",
      snippet: "I am out until Thursday, then happy to take a look.",
      receivedAt: "2026-10-09T18:02:00.000Z",
      unread: false,
      from: address("liam@contoso.test", "Liam Patel"),
      to: [address("jordan@goodmedias.test", "Jordan Lee")],
      messageCount: 2,
    },
    messages: [
      {
        id: "msg_contoso_1",
        direction: "outbound",
        from: address("jordan@goodmedias.test", "Jordan Lee"),
        to: [address("liam@contoso.test", "Liam Patel")],
        subject: "Quick question about Contoso outbound",
        bodyText: "Hi Liam,\n\nAre you the right person for outbound at Contoso?",
        sentAt: "2026-10-09T13:12:00.000Z",
        messageIdHeader: "<contoso-1@goodmedias.test>",
      },
      {
        id: "msg_contoso_2",
        direction: "inbound",
        from: address("liam@contoso.test", "Liam Patel"),
        to: [address("jordan@goodmedias.test", "Jordan Lee")],
        subject: "Re: Quick question about Contoso outbound",
        bodyText: "I am out until Thursday, then happy to take a look.",
        sentAt: "2026-10-09T18:02:00.000Z",
        messageIdHeader: "<contoso-2@contoso.test>",
        references: ["<contoso-1@goodmedias.test>"],
        fields: {
          first_name: "Liam",
          company: "Contoso",
          city: "Austin",
        },
      },
    ],
  },
  {
    thread: {
      id: "thread_adventure",
      subject: "Pricing for Adventure Works",
      snippet: "Can you share the starter plan before we book a call?",
      receivedAt: "2026-10-08T11:41:00.000Z",
      unread: false,
      from: address("mia@adventure.test", "Mia Ross"),
      to: [address("alex@goodmedias.test", "Alex Rivera")],
      messageCount: 2,
    },
    messages: [
      {
        id: "msg_adventure_1",
        direction: "outbound",
        from: address("alex@goodmedias.test", "Alex Rivera"),
        to: [address("mia@adventure.test", "Mia Ross")],
        subject: "Pricing for Adventure Works",
        bodyText: "Hi Mia,\n\nI can send a short outline of the starter plan if that is useful.",
        sentAt: "2026-10-07T16:20:00.000Z",
        messageIdHeader: "<adventure-1@goodmedias.test>",
      },
      {
        id: "msg_adventure_2",
        direction: "inbound",
        from: address("mia@adventure.test", "Mia Ross"),
        to: [address("alex@goodmedias.test", "Alex Rivera")],
        subject: "Re: Pricing for Adventure Works",
        bodyText: "Can you share the starter plan before we book a call?",
        sentAt: "2026-10-08T11:41:00.000Z",
        messageIdHeader: "<adventure-2@adventure.test>",
        references: ["<adventure-1@goodmedias.test>"],
        fields: {
          first_name: "Mia",
          company: "Adventure Works",
          city: "Denver",
        },
      },
    ],
  },
];

export const fixtureThreads: FixtureThreadRecord[] = createSeedThreads();

export const fixtureSenders: EmailAddress[] = [
  address("alex@goodmedias.test", "Alex Rivera"),
  address("jordan@goodmedias.test", "Jordan Lee"),
];

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
