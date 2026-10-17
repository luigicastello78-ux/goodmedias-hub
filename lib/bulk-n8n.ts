import "server-only";

import { ApiError } from "@/lib/api-error";
import { BULK_SUBMIT_TIMEOUT_MS } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import {
  BULK_NETWORK_MESSAGE,
  BULK_SECRET_MISSING_MESSAGE,
  BULK_TIMEOUT_MESSAGE,
  BULK_URL_MISSING_MESSAGE,
  UNEXPECTED_RESPONSE_MESSAGE,
} from "@/lib/messages";
import { bulkAcceptedSchema, bulkDuplicateSchema } from "@/lib/bulk-schema";
import type { BulkN8nAccepted, BulkN8nDuplicate, BulkN8nPayload, BulkN8nRejected } from "@/types/bulk-send";

export type BulkSubmitResult =
  | { kind: "accepted"; body: BulkN8nAccepted }
  | { kind: "duplicate"; body: BulkN8nDuplicate }
  | { kind: "rejected"; body: BulkN8nRejected };

const acceptedFixtures = new Map<string, BulkN8nAccepted>();

const isTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "TimeoutError" || error.name === "AbortError";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const resetBulkSubmitFixtures = (): void => {
  acceptedFixtures.clear();
};

const fixtureResult = (payload: BulkN8nPayload): BulkSubmitResult => {
  const existing = acceptedFixtures.get(payload.jobId);
  if (existing) {
    return {
      kind: "duplicate",
      body: {
        ok: true,
        status: "duplicate",
        jobId: payload.jobId,
        message: "This job was already accepted.",
      },
    };
  }

  const averagePause =
    (payload.drip.preSendPauseSeconds.min + payload.drip.preSendPauseSeconds.max) / 2;
  const seconds =
    payload.contacts.length === 0
      ? 0
      : (payload.contacts.length - 1) * payload.drip.intervalMinutes * 60 + payload.contacts.length * averagePause;
  const accepted: BulkN8nAccepted = {
    ok: true,
    status: "accepted",
    jobId: payload.jobId,
    total: payload.contacts.length,
    skippedCount: 0,
    skipped: [],
    intervalMinutes: payload.drip.intervalMinutes,
    jitterSeconds: payload.drip.jitterSeconds,
    estimatedDurationMinutes: Math.round(seconds / 60),
    estimatedFinishAt: new Date(Date.now() + seconds * 1000).toISOString(),
    executionId: `fixture_${payload.jobId.slice(0, 8)}`,
  };
  acceptedFixtures.set(payload.jobId, accepted);
  return { kind: "accepted", body: accepted };
};

export const submitBulkToN8n = async (payload: BulkN8nPayload): Promise<BulkSubmitResult> => {
  const env = getEnv();
  if (env.N8N_MODE === "fixture") {
    return fixtureResult(payload);
  }

  if (!env.N8N_BULK_SEND_URL) {
    throw new ApiError(500, "UPSTREAM", BULK_URL_MISSING_MESSAGE, false);
  }

  if (!env.N8N_WEBHOOK_SECRET) {
    throw new ApiError(500, "UNAUTHORIZED", BULK_SECRET_MISSING_MESSAGE, false);
  }

  let response: Response;
  try {
    response = await fetch(env.N8N_BULK_SEND_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Webhook-Secret": env.N8N_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(BULK_SUBMIT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (isTimeoutError(error)) {
      throw new ApiError(504, "TIMEOUT", BULK_TIMEOUT_MESSAGE, true);
    }
    throw new ApiError(502, "UPSTREAM", BULK_NETWORK_MESSAGE, true);
  }

  console.info(`bulk-send ${payload.jobId} n8n status ${response.status}`);

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }

  if (response.status === 202) {
    const parsed = bulkAcceptedSchema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(502, "UPSTREAM", UNEXPECTED_RESPONSE_MESSAGE, true);
    }
    return { kind: "accepted", body: parsed.data };
  }

  if (response.status === 200) {
    const parsed = bulkDuplicateSchema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(502, "UPSTREAM", UNEXPECTED_RESPONSE_MESSAGE, true);
    }
    return { kind: "duplicate", body: parsed.data };
  }

  if (response.status === 400) {
    const record = isRecord(json) ? json : {};
    const errorText =
      typeof record.error === "string" && record.error.trim()
        ? record.error
        : "The webhook rejected the request.";
    const rejected: BulkN8nRejected = {
      ok: false,
      status: "rejected",
      error: errorText,
    };
    if (typeof record.jobId === "string") {
      rejected.jobId = record.jobId;
    }
    return { kind: "rejected", body: rejected };
  }

  if (response.status >= 500 || response.status === 429 || response.status === 408) {
    throw new ApiError(
      response.status === 429 ? 429 : 502,
      response.status === 429 ? "RATE_LIMITED" : "UPSTREAM",
      "The webhook failed before accepting the request.",
      true,
    );
  }

  throw new ApiError(response.status, "VALIDATION", "The webhook rejected the request.", false);
};
