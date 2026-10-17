import "server-only";

import { ApiError } from "@/lib/api-error";
import { contactFromFields, suppressedEmails, upsertContact } from "@/lib/contacts";
import { getDb, withTransaction, type AppDatabase } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { bulkIngest } from "@/lib/n8n-client";
import { asIso, parseStoredJson } from "@/lib/stored-json";
import type { CampaignBatch, CampaignBatchContact, CampaignBatchStatus, CampaignContactStatus } from "@/types/email-ledger";
import type { BulkContact, BulkIngestRequest, BulkIngestResponse, BulkRejectedContact } from "@/types/n8n";

const inFlight = new Set<string>();

interface BatchRow {
  id: string;
  name: string;
  status: CampaignBatchStatus;
  subject_template: string;
  body_template: string;
  sender_pool: unknown;
  schedule: unknown;
  n8n_batch_id: string | null;
  accepted_count: number;
  rejected_count: number;
  error: string | null;
  created_at: unknown;
  updated_at: unknown;
}

interface ContactRow {
  id: string;
  position: number;
  email: string;
  fields: unknown;
  status: CampaignContactStatus;
  reject_reason: string | null;
}

const isUniqueError = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return true;
    }
  }
  return error instanceof Error && /unique|primary key/i.test(error.message);
};

const asStringList = (raw: unknown): string[] => {
  const value = parseStoredJson(raw);
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
};

const toBatch = (row: BatchRow): CampaignBatch => ({
  id: row.id,
  name: row.name,
  status: row.status,
  subjectTemplate: row.subject_template,
  bodyTemplate: row.body_template,
  senderPool: asStringList(row.sender_pool),
  n8nBatchId: row.n8n_batch_id,
  acceptedCount: Number(row.accepted_count),
  rejectedCount: Number(row.rejected_count),
  error: row.error,
  createdAt: asIso(row.created_at) ?? "",
  updatedAt: asIso(row.updated_at) ?? "",
});

const toContact = (row: ContactRow): CampaignBatchContact => ({
  id: row.id,
  position: row.position,
  email: row.email,
  status: row.status,
  rejectReason: row.reject_reason,
});

const fieldsRecord = (raw: unknown): Record<string, string> => {
  const fields = parseStoredJson(raw);
  const record: Record<string, string> = {};
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    for (const [key, value] of Object.entries(fields)) {
      record[key] = value == null ? "" : String(value);
    }
  }
  return record;
};

const findRow = async (db: AppDatabase, id: string): Promise<BatchRow | null> => {
  const row = await db.prepare("SELECT * FROM campaign_batches WHERE id = ?").get(id);
  return row ? (row as BatchRow) : null;
};

const assertConfigured = (): void => {
  const env = getEnv();
  if (env.N8N_MODE === "fixture") {
    return;
  }
  if (!env.N8N_BULK_INGEST_URL) {
    throw new ApiError(500, "UPSTREAM", "Webhook URL is not configured.", false);
  }
  if (!env.N8N_WEBHOOK_SECRET) {
    throw new ApiError(500, "UNAUTHORIZED", "Webhook secret is not configured.", false);
  }
};

const storedResponse = async (row: BatchRow): Promise<BulkIngestResponse> => {
  const rejected = (await (
    await getDb()
  )
    .prepare(
      `SELECT position, email, reject_reason
       FROM campaign_batch_contacts
       WHERE batch_id = ? AND status = 'rejected'
       ORDER BY position ASC`,
    )
    .all(row.id)) as Array<{ position: number; email: string; reject_reason: string | null }>;

  return {
    ok: true,
    status: "queued",
    idempotencyKey: row.id,
    batchId: row.n8n_batch_id ?? row.id,
    acceptedCount: Number(row.accepted_count),
    rejected: rejected.map((item) => ({
      index: item.position - 1,
      email: item.email,
      reason: item.reject_reason ?? "Rejected.",
    })),
  };
};

const insertBatch = async (
  input: BulkIngestRequest,
  createdBy: string | null,
  sendable: Array<{ contact: BulkContact; index: number }>,
  blocked: BulkRejectedContact[],
): Promise<void> => {
  const timestamp = new Date().toISOString();
  await withTransaction(async (db) => {
    await db
      .prepare(
        `INSERT INTO campaign_batches (
           id, name, status, subject_template, body_template, sender_pool, schedule,
           accepted_count, rejected_count, created_by, created_at, updated_at
         ) VALUES (?, ?, 'submitting', ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        input.idempotencyKey,
        input.campaignName,
        input.subjectTemplate,
        input.bodyTemplate,
        JSON.stringify(input.senderPool),
        JSON.stringify(input.schedule),
        blocked.length,
        createdBy,
        timestamp,
        timestamp,
      );

    let position = 1;
    for (const item of sendable) {
      const contactId = await upsertContact(db, contactFromFields(item.contact.email, item.contact.fields), timestamp);
      await db
        .prepare(
          `INSERT INTO campaign_batch_contacts (id, batch_id, position, contact_id, email, fields, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        )
        .run(
          crypto.randomUUID(),
          input.idempotencyKey,
          position,
          contactId,
          item.contact.email.trim().toLowerCase(),
          JSON.stringify(item.contact.fields),
        );
      position += 1;
    }
    for (const item of blocked) {
      const contactId = await upsertContact(db, contactFromFields(item.email, {}), timestamp);
      await db
        .prepare(
          `INSERT INTO campaign_batch_contacts (
             id, batch_id, position, contact_id, email, fields, status, reject_reason
           ) VALUES (?, ?, ?, ?, ?, '{}', 'rejected', ?)`,
        )
        .run(crypto.randomUUID(), input.idempotencyKey, position, contactId, item.email, item.reason);
      position += 1;
    }
  });
};

const applyIngest = async (input: BulkIngestRequest, sendable: BulkContact[]): Promise<BulkIngestResponse> => {
  if (inFlight.has(input.idempotencyKey)) {
    throw new ApiError(409, "VALIDATION", "A submit is already in progress for this campaign.", true);
  }
  inFlight.add(input.idempotencyKey);
  const db = await getDb();
  try {
    const result = await bulkIngest({ ...input, contacts: sendable });
    const updatedAt = new Date().toISOString();
    const rejectedEmails = new Set(result.rejected.map((item) => item.email.trim().toLowerCase()));
    for (const item of result.rejected) {
      await db
        .prepare(
          `UPDATE campaign_batch_contacts
           SET status = 'rejected', reject_reason = ?
           WHERE batch_id = ? AND email = ? AND status = 'pending'`,
        )
        .run(item.reason, input.idempotencyKey, item.email.trim().toLowerCase());
    }
    if (rejectedEmails.size < sendable.length) {
      await db
        .prepare(
          "UPDATE campaign_batch_contacts SET status = 'accepted' WHERE batch_id = ? AND status = 'pending'",
        )
        .run(input.idempotencyKey);
    }
    const rejectedCount = (await db
      .prepare("SELECT COUNT(*) AS count FROM campaign_batch_contacts WHERE batch_id = ? AND status = 'rejected'")
      .get(input.idempotencyKey)) as { count: number };
    await db
      .prepare(
        `UPDATE campaign_batches
         SET status = 'queued', n8n_batch_id = ?, accepted_count = ?, rejected_count = ?, error = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(result.batchId, result.acceptedCount, Number(rejectedCount.count), updatedAt, input.idempotencyKey);

    const localRejected = (await db
      .prepare(
        `SELECT email, reject_reason FROM campaign_batch_contacts
         WHERE batch_id = ? AND status = 'rejected' AND reject_reason = 'Suppressed.'`,
      )
      .all(input.idempotencyKey)) as Array<{ email: string; reject_reason: string }>;
    return {
      ...result,
      rejected: [
        ...result.rejected,
        ...localRejected.map((item) => ({ index: -1, email: item.email, reason: item.reject_reason })),
      ],
    };
  } catch (error) {
    const retryable = error instanceof ApiError ? error.retryable : true;
    const message = error instanceof Error ? error.message : "The campaign could not be queued.";
    await db
      .prepare(
        "UPDATE campaign_batches SET status = ?, error = ?, updated_at = ? WHERE id = ? AND status IN ('submitting', 'unknown')",
      )
      .run(retryable ? "unknown" : "failed", message, new Date().toISOString(), input.idempotencyKey);
    throw error;
  } finally {
    inFlight.delete(input.idempotencyKey);
  }
};

export const createAndQueueCampaign = async (
  input: BulkIngestRequest,
  createdBy: string | null,
): Promise<BulkIngestResponse> => {
  assertConfigured();
  const db = await getDb();
  const existing = await findRow(db, input.idempotencyKey);
  if (existing?.status === "queued") {
    return storedResponse(existing);
  }
  if (existing?.status === "failed") {
    throw new ApiError(409, "VALIDATION", existing.error ?? "This campaign was rejected. Start a new one.", false);
  }
  if (existing && (existing.status === "submitting" || existing.status === "unknown")) {
    const pending = (await db
      .prepare("SELECT email, fields FROM campaign_batch_contacts WHERE batch_id = ? AND status = 'pending' ORDER BY position ASC")
      .all(existing.id)) as Array<{ email: string; fields: unknown }>;
    return applyIngest(
      input,
      pending.map((row) => ({ email: row.email, fields: fieldsRecord(row.fields) })),
    );
  }

  const blockedSet = await suppressedEmails(
    db,
    input.contacts.map((contact) => contact.email),
  );
  const sendable: Array<{ contact: BulkContact; index: number }> = [];
  const blocked: BulkRejectedContact[] = [];
  input.contacts.forEach((contact, index) => {
    if (blockedSet.has(contact.email.trim().toLowerCase())) {
      blocked.push({ index, email: contact.email.trim().toLowerCase(), reason: "Suppressed." });
      return;
    }
    sendable.push({ contact, index });
  });
  if (sendable.length === 0) {
    throw new ApiError(400, "VALIDATION", "Every address is suppressed.", false);
  }

  try {
    await insertBatch(input, createdBy, sendable, blocked);
  } catch (error) {
    if (!isUniqueError(error)) {
      throw error;
    }
    const raced = await findRow(await getDb(), input.idempotencyKey);
    if (!raced) {
      throw error;
    }
    if (raced.status === "queued") {
      return storedResponse(raced);
    }
    if (raced.status === "failed") {
      throw new ApiError(409, "VALIDATION", raced.error ?? "This campaign was rejected. Start a new one.", false);
    }
  }

  const pending = (await (
    await getDb()
  )
    .prepare(
      "SELECT email, fields FROM campaign_batch_contacts WHERE batch_id = ? AND status = 'pending' ORDER BY position ASC",
    )
    .all(input.idempotencyKey)) as Array<{ email: string; fields: unknown }>;

  return applyIngest(
    input,
    pending.map((row) => ({ email: row.email, fields: fieldsRecord(row.fields) })),
  );
};

export const listCampaignBatches = async (): Promise<CampaignBatch[]> => {
  const rows = (await (
    await getDb()
  )
    .prepare("SELECT * FROM campaign_batches ORDER BY created_at DESC, id DESC")
    .all()) as BatchRow[];
  return rows.map(toBatch);
};

export const getCampaignBatch = async (
  id: string,
): Promise<{ batch: CampaignBatch; contacts: CampaignBatchContact[] }> => {
  const row = await findRow(await getDb(), id);
  if (!row) {
    throw new ApiError(404, "VALIDATION", "Campaign batch not found.", false);
  }
  const contacts = (await (
    await getDb()
  )
    .prepare(
      `SELECT id, position, email, fields, status, reject_reason
       FROM campaign_batch_contacts
       WHERE batch_id = ?
       ORDER BY position ASC`,
    )
    .all(id)) as ContactRow[];
  return { batch: toBatch(row), contacts: contacts.map(toContact) };
};
