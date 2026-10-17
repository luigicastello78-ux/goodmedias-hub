import "server-only";

import { ApiError } from "@/lib/api-error";
import { contactFromFields, isSuppressed, upsertContact } from "@/lib/contacts";
import { getDb, withTransaction, type AppDatabase } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { manualSend } from "@/lib/n8n-client";
import { asIso, parseStoredJson } from "@/lib/stored-json";
import type { ManualSendRequest, ManualSendResponse } from "@/types/n8n";
import type { ContactActivity, OutboundMessage, OutboundStatus } from "@/types/email-ledger";

const inFlight = new Set<string>();

interface OutboundRow {
  id: string;
  contact_id: string | null;
  status: OutboundStatus;
  from_email: string;
  from_name: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_text: string;
  body_html: string | null;
  thread_id: string | null;
  in_reply_to: string | null;
  references_json: unknown;
  provider_message_id: string | null;
  error: string | null;
  requested_at: unknown;
  sent_at: unknown;
  created_at: unknown;
  updated_at: unknown;
}

const SUPPRESSED_MESSAGE = "This address is suppressed and will not be emailed.";

const toMessage = (row: OutboundRow): OutboundMessage => {
  const references = parseStoredJson(row.references_json);
  return {
    id: row.id,
    contactId: row.contact_id,
    status: row.status,
    fromEmail: row.from_email,
    fromName: row.from_name,
    toEmail: row.to_email,
    toName: row.to_name,
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    threadId: row.thread_id,
    inReplyTo: row.in_reply_to,
    references: Array.isArray(references) ? references.map((item) => String(item)) : [],
    providerMessageId: row.provider_message_id,
    error: row.error,
    requestedAt: asIso(row.requested_at) ?? "",
    sentAt: asIso(row.sent_at),
    createdAt: asIso(row.created_at) ?? "",
    updatedAt: asIso(row.updated_at) ?? "",
  };
};

const toResponse = (row: OutboundRow): ManualSendResponse => ({
  ok: true,
  status: "sent",
  idempotencyKey: row.id,
  providerMessageId: row.provider_message_id ?? "",
  threadId: row.thread_id ?? `thread_${row.id.slice(0, 8)}`,
});

const isUniqueError = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return true;
    }
  }
  return error instanceof Error && /unique|primary key/i.test(error.message);
};

const findRow = async (db: AppDatabase, id: string): Promise<OutboundRow | null> => {
  const row = await db.prepare("SELECT * FROM outbound_messages WHERE id = ?").get(id);
  return row ? (row as OutboundRow) : null;
};

const assertConfigured = (): void => {
  const env = getEnv();
  if (env.N8N_MODE === "fixture") {
    return;
  }
  if (!env.N8N_MANUAL_SEND_URL) {
    throw new ApiError(500, "UPSTREAM", "Webhook URL is not configured.", false);
  }
  if (!env.N8N_WEBHOOK_SECRET) {
    throw new ApiError(500, "UNAUTHORIZED", "Webhook secret is not configured.", false);
  }
};

const insertMessage = async (payload: ManualSendRequest, createdBy: string | null): Promise<void> => {
  const timestamp = new Date().toISOString();
  await withTransaction(async (db) => {
    const contactId = await upsertContact(
      db,
      contactFromFields(payload.to.email, {}, payload.to.name),
      timestamp,
    );
    await db
      .prepare(
        `INSERT INTO outbound_messages (
           id, contact_id, created_by, status, from_email, from_name, to_email, to_name,
           subject, body_text, body_html, thread_id, in_reply_to, references_json,
           requested_at, created_at, updated_at
         ) VALUES (?, ?, ?, 'submitting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        payload.idempotencyKey,
        contactId,
        createdBy,
        payload.from.email,
        payload.from.name ?? null,
        payload.to.email.trim().toLowerCase(),
        payload.to.name ?? null,
        payload.subject,
        payload.bodyText,
        payload.bodyHtml ?? null,
        payload.thread.threadId ?? null,
        payload.thread.inReplyTo ?? null,
        JSON.stringify(payload.thread.references ?? []),
        payload.requestedAt,
        timestamp,
        timestamp,
      );
  });
};

const finishSend = async (id: string): Promise<ManualSendResponse> => {
  const db = await getDb();
  const row = await findRow(db, id);
  if (!row) {
    throw new ApiError(404, "VALIDATION", "Sent message not found.", false);
  }
  if (row.status === "sent" && row.provider_message_id) {
    return toResponse(row);
  }
  if (row.status === "failed") {
    throw new ApiError(400, "VALIDATION", row.error ?? "The message was not sent.", false);
  }
  if (inFlight.has(id)) {
    throw new ApiError(409, "VALIDATION", "A submit is already in progress for this message.", true);
  }

  inFlight.add(id);
  try {
    const payload: ManualSendRequest = {
      idempotencyKey: row.id,
      requestedAt: asIso(row.requested_at) ?? new Date().toISOString(),
      from: { email: row.from_email, ...(row.from_name ? { name: row.from_name } : {}) },
      to: { email: row.to_email, ...(row.to_name ? { name: row.to_name } : {}) },
      subject: row.subject,
      bodyText: row.body_text,
      ...(row.body_html ? { bodyHtml: row.body_html } : {}),
      thread: {
        ...(row.thread_id ? { threadId: row.thread_id } : {}),
        ...(row.in_reply_to ? { inReplyTo: row.in_reply_to } : {}),
        ...((() => {
          const references = parseStoredJson(row.references_json);
          return Array.isArray(references) && references.length > 0
            ? { references: references.map((item) => String(item)) }
            : {};
        })()),
      },
    };
    const result = await manualSend(payload);
    const sentAt = new Date().toISOString();
    await db
      .prepare(
        `UPDATE outbound_messages
         SET status = 'sent', provider_message_id = ?, thread_id = ?, error = NULL, sent_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(result.providerMessageId, result.threadId, sentAt, sentAt, id);
    return result;
  } catch (error) {
    const retryable = error instanceof ApiError ? error.retryable : true;
    const message = error instanceof Error ? error.message : "The message could not be sent.";
    await db
      .prepare(
        "UPDATE outbound_messages SET status = ?, error = ?, updated_at = ? WHERE id = ? AND status IN ('submitting', 'unknown')",
      )
      .run(retryable ? "unknown" : "failed", message, new Date().toISOString(), id);
    throw error;
  } finally {
    inFlight.delete(id);
  }
};

export const sendAndRecordManual = async (
  payload: ManualSendRequest,
  createdBy: string | null,
): Promise<ManualSendResponse> => {
  assertConfigured();
  const db = await getDb();
  if (await isSuppressed(db, payload.to.email)) {
    throw new ApiError(400, "VALIDATION", SUPPRESSED_MESSAGE, false);
  }

  const existing = await findRow(db, payload.idempotencyKey);
  if (!existing) {
    try {
      await insertMessage(payload, createdBy);
    } catch (error) {
      if (!isUniqueError(error)) {
        throw error;
      }
    }
  }

  return finishSend(payload.idempotencyKey);
};

export const listOutboundMessages = async (limit = 50): Promise<OutboundMessage[]> => {
  const rows = (await (
    await getDb()
  )
    .prepare("SELECT * FROM outbound_messages ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(limit)) as OutboundRow[];
  return rows.map(toMessage);
};

export const getOutboundMessage = async (id: string): Promise<OutboundMessage> => {
  const row = await findRow(await getDb(), id);
  if (!row) {
    throw new ApiError(404, "VALIDATION", "Sent message not found.", false);
  }
  return toMessage(row);
};

export const listContactActivity = async (email: string): Promise<ContactActivity[]> => {
  const normalized = email.trim().toLowerCase();
  const db = await getDb();
  const single = (await db
    .prepare(
      `SELECT id, subject, status, created_at
       FROM outbound_messages
       WHERE to_email = ?
       ORDER BY created_at DESC
       LIMIT 20`,
    )
    .all(normalized)) as Array<{ id: string; subject: string; status: string; created_at: unknown }>;
  const drip = (await db
    .prepare(
      `SELECT jobs.job_id, jobs.name, recipients.status, jobs.created_at
       FROM bulk_job_recipients AS recipients
       JOIN bulk_jobs AS jobs ON jobs.id = recipients.bulk_job_id
       WHERE recipients.email = ?
       ORDER BY jobs.created_at DESC
       LIMIT 20`,
    )
    .all(normalized)) as Array<{ job_id: string; name: string; status: string; created_at: unknown }>;
  const campaigns = (await db
    .prepare(
      `SELECT batches.id, batches.name, contacts.status, batches.created_at
       FROM campaign_batch_contacts AS contacts
       JOIN campaign_batches AS batches ON batches.id = contacts.batch_id
       WHERE contacts.email = ?
       ORDER BY batches.created_at DESC
       LIMIT 20`,
    )
    .all(normalized)) as Array<{ id: string; name: string; status: string; created_at: unknown }>;

  return [
    ...single.map((row) => ({
      source: "single" as const,
      id: row.id,
      label: row.subject,
      status: row.status,
      at: asIso(row.created_at) ?? "",
    })),
    ...drip.map((row) => ({
      source: "drip" as const,
      id: row.job_id,
      label: row.name,
      status: row.status,
      at: asIso(row.created_at) ?? "",
    })),
    ...campaigns.map((row) => ({
      source: "campaign" as const,
      id: row.id,
      label: row.name,
      status: row.status,
      at: asIso(row.created_at) ?? "",
    })),
  ].sort((left, right) => right.at.localeCompare(left.at));
};
