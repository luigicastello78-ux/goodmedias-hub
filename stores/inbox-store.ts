"use client";

import { create } from "zustand";

import { requestJson, getErrorMessage, isRetryableError } from "@/lib/api-client";
import { isEmail } from "@/lib/email";
import { createIdempotencyKey } from "@/lib/idempotency";
import { replaceKnownTokens } from "@/lib/spintax";
import type { ManualSendResponse } from "@/types/n8n";
import type {
  ComposerDraft,
  DispatchStatus,
  InboxMessage,
  InboxQuery,
  InboxThread,
  SendersResponse,
  ThreadDetailResponse,
  InboxListResponse,
} from "@/types/inbox";
import type { EmailAddress } from "@/types/n8n";

const emptyComposer = (fromEmail = ""): ComposerDraft => ({
  fromEmail,
  toEmail: "",
  toName: "",
  subject: "",
  bodyText: "",
});

const replySubject = (subject: string): string =>
  /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;

const collectFields = (messages: InboxMessage[]): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const message of messages) {
    if (message.fields) {
      Object.assign(fields, message.fields);
    }
  }
  return fields;
};

const editPatch = (state: {
  dispatchStatus: DispatchStatus;
  dispatchRetryable: boolean;
  idempotencyKey: string | null;
}) => {
  if (state.dispatchStatus !== "error") {
    return {};
  }

  return {
    editedSinceError: true,
    idempotencyKey: state.dispatchRetryable ? null : state.idempotencyKey,
  };
};

let listRequest = 0;
let detailRequest = 0;

interface InboxState {
  threads: InboxThread[];
  nextCursor: string | null;
  listStatus: "loading" | "ready" | "error";
  listError: string | null;
  selectedThreadId: string | null;
  detail: ThreadDetailResponse | null;
  detailStatus: "idle" | "loading" | "ready" | "error";
  detailError: string | null;
  isComposing: boolean;
  senders: EmailAddress[];
  sendersStatus: "loading" | "ready" | "error";
  sendersError: string | null;
  contactFields: Record<string, string>;
  composer: ComposerDraft;
  dispatchStatus: DispatchStatus;
  dispatchError: string | null;
  dispatchRetryable: boolean;
  editedSinceError: boolean;
  idempotencyKey: string | null;
  providerMessageId: string | null;
  filter: string;
  fetchInbox: () => Promise<void>;
  loadMore: () => Promise<void>;
  fetchSenders: () => Promise<void>;
  loadThread: (threadId: string, options?: { preserveComposer?: boolean }) => Promise<void>;
  startNewMessage: () => void;
  showList: () => void;
  setFilter: (filter: string) => void;
  updateComposer: (patch: Partial<ComposerDraft>) => void;
  sendManual: () => Promise<void>;
}

const inboxUrl = (query: InboxQuery): string => {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit ?? 50));
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  if (query.q) {
    params.set("q", query.q);
  }
  return `/api/n8n/inbox?${params.toString()}`;
};

export const useInboxStore = create<InboxState>((set, get) => ({
  threads: [],
  nextCursor: null,
  listStatus: "loading",
  listError: null,
  selectedThreadId: null,
  detail: null,
  detailStatus: "idle",
  detailError: null,
  isComposing: false,
  senders: [],
  sendersStatus: "loading",
  sendersError: null,
  contactFields: {},
  composer: emptyComposer(),
  dispatchStatus: "idle",
  dispatchError: null,
  dispatchRetryable: false,
  editedSinceError: false,
  idempotencyKey: null,
  providerMessageId: null,
  filter: "",
  fetchInbox: async () => {
    const requestId = ++listRequest;
    set({ listStatus: "loading", listError: null });
    try {
      const data = await requestJson<InboxListResponse>(inboxUrl({ limit: 50 }));
      if (requestId !== listRequest) {
        return;
      }
      set({ threads: data.threads, nextCursor: data.nextCursor, listStatus: "ready" });
    } catch (error) {
      if (requestId !== listRequest) {
        return;
      }
      set({ listStatus: "error", listError: getErrorMessage(error) });
    }
  },
  loadMore: async () => {
    const { nextCursor, listStatus } = get();
    if (!nextCursor || listStatus === "loading") {
      return;
    }
    const requestId = ++listRequest;
    set({ listStatus: "loading", listError: null });
    try {
      const data = await requestJson<InboxListResponse>(inboxUrl({ cursor: nextCursor, limit: 50 }));
      if (requestId !== listRequest) {
        return;
      }
      set((state) => ({
        threads: [...state.threads, ...data.threads],
        nextCursor: data.nextCursor,
        listStatus: "ready",
      }));
    } catch (error) {
      if (requestId !== listRequest) {
        return;
      }
      set({ listStatus: "error", listError: getErrorMessage(error) });
    }
  },
  fetchSenders: async () => {
    set({ sendersStatus: "loading", sendersError: null });
    try {
      const data = await requestJson<SendersResponse>("/api/n8n/senders");
      set({
        senders: data.senders,
        sendersStatus: "ready",
      });
    } catch (error) {
      set({ sendersStatus: "error", sendersError: getErrorMessage(error) });
    }
  },
  loadThread: async (threadId, options) => {
    const requestId = ++detailRequest;
    set({
      selectedThreadId: threadId,
      isComposing: true,
      detailStatus: "loading",
      detailError: null,
      ...(options?.preserveComposer
        ? {}
        : {
            detail: null,
            dispatchStatus: "idle" as const,
            dispatchError: null,
            dispatchRetryable: false,
            editedSinceError: false,
            idempotencyKey: null,
            providerMessageId: null,
          }),
    });

    try {
      const data = await requestJson<ThreadDetailResponse>(
        `/api/n8n/inbox/${encodeURIComponent(threadId)}`,
      );
      if (requestId !== detailRequest) {
        return;
      }

      const latestInbound = [...data.messages].reverse().find((message) => message.direction === "inbound");
      const references = [...(latestInbound?.references ?? [])];
      if (latestInbound?.messageIdHeader && !references.includes(latestInbound.messageIdHeader)) {
        references.push(latestInbound.messageIdHeader);
      }
      const recipient = latestInbound ? latestInbound.from : data.thread.from;

      set((state) => ({
        detailStatus: "ready",
        detail: data,
        threads: state.threads.map((thread) => (thread.id === data.thread.id ? data.thread : thread)),
        contactFields: collectFields(data.messages),
        ...(options?.preserveComposer
          ? {}
          : {
              composer: {
                fromEmail: state.composer.fromEmail,
                toEmail: recipient.email,
                toName: recipient.name ?? "",
                subject: replySubject(data.thread.subject),
                bodyText: "",
                threadId: data.thread.id,
                inReplyTo: latestInbound?.messageIdHeader,
                references,
              },
            }),
      }));
    } catch (error) {
      if (requestId !== detailRequest) {
        return;
      }
      set({ detailStatus: "error", detailError: getErrorMessage(error) });
    }
  },
  startNewMessage: () => {
    detailRequest += 1;
    set((state) => ({
      selectedThreadId: null,
      detail: null,
      detailStatus: "idle",
      detailError: null,
      isComposing: true,
      contactFields: {},
      dispatchStatus: "idle",
      dispatchError: null,
      dispatchRetryable: false,
      editedSinceError: false,
      idempotencyKey: null,
      providerMessageId: null,
      composer: emptyComposer(),
    }));
  },
  showList: () => set({ isComposing: false }),
  setFilter: (filter) => set({ filter }),
  updateComposer: (patch) =>
    set((state) => ({
      composer: { ...state.composer, ...patch },
      ...editPatch(state),
    })),
  sendManual: async () => {
    const state = get();
    if (state.dispatchStatus === "sending") {
      return;
    }

    const { composer, contactFields, senders } = state;
    if (!isEmail(composer.fromEmail)) {
      set({
        dispatchStatus: "error",
        dispatchError: "Enter a valid from address.",
        dispatchRetryable: false,
        editedSinceError: false,
      });
      return;
    }
    if (!isEmail(composer.toEmail)) {
      set({
        dispatchStatus: "error",
        dispatchError: "Enter a valid recipient email.",
        dispatchRetryable: false,
        editedSinceError: false,
      });
      return;
    }
    if (!composer.subject.trim() || !composer.bodyText.trim()) {
      set({
        dispatchStatus: "error",
        dispatchError: !composer.subject.trim() ? "Subject is required." : "Message body is required.",
        dispatchRetryable: false,
        editedSinceError: false,
      });
      return;
    }

    const subjectResult = replaceKnownTokens(composer.subject, contactFields);
    const bodyResult = replaceKnownTokens(composer.bodyText, contactFields);
    const missing = [...new Set([...subjectResult.missing, ...bodyResult.missing])];
    if (missing.length > 0) {
      set({
        dispatchStatus: "error",
        dispatchError: `These tokens have no value on this conversation: ${missing.join(", ")}.`,
        dispatchRetryable: false,
        editedSinceError: false,
      });
      return;
    }

    const key = state.idempotencyKey ?? createIdempotencyKey();
    const sender = senders.find((item) => item.email === composer.fromEmail);
    set({
      idempotencyKey: key,
      dispatchStatus: "sending",
      dispatchError: null,
      providerMessageId: null,
    });

    try {
      const result = await requestJson<ManualSendResponse>("/api/n8n/manual-send", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: key,
          requestedAt: new Date().toISOString(),
          from: { email: composer.fromEmail, ...(sender?.name ? { name: sender.name } : {}) },
          to: {
            email: composer.toEmail.trim(),
            ...(composer.toName.trim() ? { name: composer.toName.trim() } : {}),
          },
          subject: subjectResult.text.trim(),
          bodyText: bodyResult.text.trim(),
          thread: {
            ...(composer.threadId ? { threadId: composer.threadId } : {}),
            ...(composer.inReplyTo ? { inReplyTo: composer.inReplyTo } : {}),
            ...(composer.references && composer.references.length > 0
              ? { references: composer.references }
              : {}),
          },
        }),
      });

      set({
        dispatchStatus: "sent",
        providerMessageId: result.providerMessageId,
        idempotencyKey: null,
        dispatchRetryable: false,
        editedSinceError: false,
        dispatchError: null,
      });

      if (composer.threadId) {
        await get().loadThread(composer.threadId, { preserveComposer: true });
      }
    } catch (error) {
      set({
        dispatchStatus: "error",
        dispatchError: getErrorMessage(error),
        dispatchRetryable: isRetryableError(error),
        editedSinceError: false,
        idempotencyKey: key,
      });
    }
  },
}));
