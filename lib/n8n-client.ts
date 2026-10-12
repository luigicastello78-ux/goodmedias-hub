import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api-error";
import { getEnv } from "@/lib/env";
import { appendFixtureReply, fixtureSenders, fixtureThreads } from "@/lib/fixtures";
import {
  AUTH_FAILED_MESSAGE,
  NETWORK_MESSAGE,
  TIMEOUT_MESSAGE,
  UNEXPECTED_RESPONSE_MESSAGE,
} from "@/lib/messages";
import {
  bulkIngestResponseSchema,
  inboxListResponseSchema,
  manualSendResponseSchema,
  n8nErrorSchema,
  sendersResponseSchema,
  threadDetailResponseSchema,
} from "@/lib/schemas";
import type {
  BulkIngestRequest,
  BulkIngestResponse,
  ManualSendRequest,
  ManualSendResponse,
  N8nErrorCode,
} from "@/types/n8n";
import type { InboxListResponse, InboxQuery, SendersResponse, ThreadDetailResponse } from "@/types/inbox";

const sentMessages = new Map<string, ManualSendResponse>();
const queuedBatches = new Map<string, BulkIngestResponse>();
const failedOnce = new Set<string>();

const isTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "TimeoutError" || error.name === "AbortError";
};

const requestJson = async <T>(
  url: string,
  method: "GET" | "POST",
  body: unknown | undefined,
  schema: z.ZodType<T>,
): Promise<T> => {
  const env = getEnv();
  if (!url) {
    throw new ApiError(500, "UPSTREAM", "Webhook URL is not configured.", false);
  }

  if (env.N8N_MODE === "live" && !env.N8N_WEBHOOK_SECRET) {
    throw new ApiError(500, "UNAUTHORIZED", "Webhook secret is not configured.", false);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Webhook-Secret": env.N8N_WEBHOOK_SECRET,
        "X-Request-Id": crypto.randomUUID(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(env.N8N_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (isTimeoutError(error)) {
      throw new ApiError(504, "TIMEOUT", TIMEOUT_MESSAGE, true);
    }
    throw new ApiError(502, "UPSTREAM", NETWORK_MESSAGE, true);
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(401, "UNAUTHORIZED", AUTH_FAILED_MESSAGE, false);
  }

  if (!response.ok) {
    const parsedError = n8nErrorSchema.safeParse(json);
    if (parsedError.success) {
      const code = parsedError.data.error.code;
      const message = code === "UNAUTHORIZED" ? AUTH_FAILED_MESSAGE : parsedError.data.error.message;
      throw new ApiError(response.status, code, message, parsedError.data.error.retryable);
    }

    const retryable = response.status >= 500 || response.status === 429 || response.status === 408;
    const code: N8nErrorCode = retryable ? "UPSTREAM" : "VALIDATION";
    throw new ApiError(
      response.status,
      code,
      retryable ? "The webhook failed before accepting the request." : "The webhook rejected the request.",
      retryable,
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(502, "UPSTREAM", UNEXPECTED_RESPONSE_MESSAGE, true);
  }

  return parsed.data;
};

const withQuery = (base: string, query: InboxQuery): string => {
  const url = new URL(base);
  if (query.cursor) {
    url.searchParams.set("cursor", query.cursor);
  }
  if (query.q) {
    url.searchParams.set("q", query.q);
  }
  if (query.limit) {
    url.searchParams.set("limit", String(query.limit));
  }
  return url.toString();
};

const resolveThreadUrl = (template: string, threadId: string): string => {
  if (template.includes("{threadId}")) {
    return template.replaceAll("{threadId}", encodeURIComponent(threadId));
  }
  const url = new URL(template);
  url.searchParams.set("threadId", threadId);
  return url.toString();
};

const fixtureListInbox = (query: InboxQuery): InboxListResponse => {
  const needle = query.q?.trim().toLowerCase() ?? "";
  const filtered = fixtureThreads
    .map((record) => record.thread)
    .filter((thread) => {
      if (!needle) {
        return true;
      }
      const haystack = `${thread.subject} ${thread.snippet} ${thread.from.email} ${thread.from.name ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    })
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));

  const offset = query.cursor ? Number(query.cursor) : 0;
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const limit = query.limit ?? 50;
  const threads = filtered.slice(safeOffset, safeOffset + limit);
  const nextOffset = safeOffset + limit;

  return {
    ok: true,
    threads,
    nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
  };
};

const fixtureThread = (threadId: string): ThreadDetailResponse => {
  const record = fixtureThreads.find((item) => item.thread.id === threadId);
  if (!record) {
    throw new ApiError(404, "VALIDATION", "That conversation could not be found.", false);
  }

  record.thread.unread = false;
  return {
    ok: true,
    thread: record.thread,
    messages: record.messages.map((message) => ({ ...message })),
  };
};

const failOnce = (key: string, shouldFail: boolean, message: string): void => {
  if (!shouldFail || failedOnce.has(key)) {
    return;
  }
  failedOnce.add(key);
  throw new ApiError(502, "UPSTREAM", message, true);
};

export const listInbox = async (query: InboxQuery): Promise<InboxListResponse> => {
  const env = getEnv();
  if (env.N8N_MODE === "fixture") {
    return fixtureListInbox(query);
  }
  return requestJson(withQuery(env.N8N_INBOX_URL, query), "GET", undefined, inboxListResponseSchema);
};

export const getThread = async (threadId: string): Promise<ThreadDetailResponse> => {
  const env = getEnv();
  if (env.N8N_MODE === "fixture") {
    return fixtureThread(threadId);
  }
  return requestJson(resolveThreadUrl(env.N8N_THREAD_URL, threadId), "GET", undefined, threadDetailResponseSchema);
};

export const listSenders = async (): Promise<SendersResponse> => {
  const env = getEnv();
  if (env.N8N_MODE === "fixture") {
    return { ok: true, senders: fixtureSenders };
  }
  return requestJson(env.N8N_SENDERS_URL, "GET", undefined, sendersResponseSchema);
};

export const manualSend = async (payload: ManualSendRequest): Promise<ManualSendResponse> => {
  const env = getEnv();
  if (env.N8N_MODE === "fixture") {
    const existing = sentMessages.get(payload.idempotencyKey);
    if (existing) {
      return existing;
    }

    failOnce(
      payload.idempotencyKey,
      payload.to.email.toLowerCase() === "fail@goodmedias.test",
      "Fixture SMTP rejected the message. Retry to simulate a recovered webhook.",
    );

    const threadId = payload.thread.threadId ?? `thread_${payload.idempotencyKey.slice(0, 8)}`;
    const result: ManualSendResponse = {
      ok: true,
      status: "sent",
      idempotencyKey: payload.idempotencyKey,
      providerMessageId: `<${payload.idempotencyKey}@fixture.goodmedias>`,
      threadId,
    };
    sentMessages.set(payload.idempotencyKey, result);
    appendFixtureReply(payload, threadId);
    return result;
  }

  return requestJson(env.N8N_MANUAL_SEND_URL, "POST", payload, manualSendResponseSchema);
};

export const bulkIngest = async (payload: BulkIngestRequest): Promise<BulkIngestResponse> => {
  const env = getEnv();
  if (env.N8N_MODE === "fixture") {
    const existing = queuedBatches.get(payload.idempotencyKey);
    if (existing) {
      return existing;
    }

    failOnce(
      payload.idempotencyKey,
      payload.campaignName.trim().toLowerCase() === "force-error",
      "Fixture queue rejected the batch. Retry to simulate a recovered webhook.",
    );

    const rejected = payload.contacts
      .map((contact, index) => ({ contact, index }))
      .filter(({ contact }) => contact.email.toLowerCase().endsWith("@reject.test"))
      .map(({ contact, index }) => ({
        index,
        email: contact.email,
        reason: "Fixture recipient is blocked.",
      }));

    const result: BulkIngestResponse = {
      ok: true,
      status: "queued",
      idempotencyKey: payload.idempotencyKey,
      batchId: `batch_${payload.idempotencyKey.slice(0, 8)}`,
      acceptedCount: payload.contacts.length - rejected.length,
      rejected,
    };
    queuedBatches.set(payload.idempotencyKey, result);
    return result;
  }

  return requestJson(env.N8N_BULK_INGEST_URL, "POST", payload, bulkIngestResponseSchema);
};
