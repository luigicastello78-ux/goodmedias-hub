import "server-only";

import { ApiError } from "@/lib/api-error";
import { prepareBulkContacts } from "@/lib/bulk-contacts";
import { buildBulkPayload, payloadSourceFromJob } from "@/lib/bulk-payload";
import { submitBulkToN8n } from "@/lib/bulk-n8n";
import type { BulkSendRequest } from "@/lib/bulk-schema";
import { contactFromFields, suppressedEmails, upsertContact } from "@/lib/contacts";
import { getDb, withTransaction } from "@/lib/db";
import { asIso, isRecord, parseStoredJson } from "@/lib/stored-json";
import { getEnv } from "@/lib/env";
import { BULK_SECRET_MISSING_MESSAGE, BULK_URL_MISSING_MESSAGE } from "@/lib/messages";
import type {
  BulkJob,
  BulkJobCompletedEvent,
  BulkJobDetail,
  BulkJobStatus,
  BulkPreparedContact,
  BulkProgressEvent,
  BulkRecipient,
  BulkRecipientCounts,
  BulkRecipientStatus,
  BulkSendWindow,
} from "@/types/bulk-send";

const RETRYABLE_STATUSES = new Set<BulkJobStatus>(["submitting", "unknown"]);
const TERMINAL_JOB_STATUSES = new Set<BulkJobStatus>(["completed", "completed_with_errors", "failed"]);
const inFlight = new Set<string>();

interface JobRow {
  id: number;
  job_id: string;
  name: string;
  status: BulkJobStatus;
  from_email: string;
  from_name: string | null;
  subject: string;
  body_text: string;
  body_html: string | null;
  cc: string;
  bcc: string;
  interval_minutes: number;
  jitter_seconds: number;
  pause_min: number;
  pause_max: number;
  send_window_json: unknown;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  n8n_execution_id: string | null;
  error: string | null;
  created_at: unknown;
  updated_at: unknown;
  completed_at: unknown;
  estimated_finish_at: unknown;
  last_event_at: unknown;
}

interface RecipientRow {
  id: number;
  position: number;
  email: string;
  fields_json: unknown;
  status: BulkRecipientStatus;
  error: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  skip_reason: string | null;
}

const parseFields = (raw: unknown): Record<string, string> => {
  const value = parseStoredJson(raw);
  if (!isRecord(value)) {
    return {};
  }
  const fields: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    fields[key] = item == null ? "" : String(item);
  }
  return fields;
};

const parseWindow = (raw: unknown): BulkSendWindow | null => {
  const value = parseStoredJson(raw);
  if (!isRecord(value)) {
    return null;
  }
  try {
    if (
      typeof value.timezone !== "string" ||
      typeof value.startHour !== "number" ||
      typeof value.endHour !== "number" ||
      typeof value.weekdaysOnly !== "boolean"
    ) {
      return null;
    }
    return {
      timezone: value.timezone,
      startHour: value.startHour,
      endHour: value.endHour,
      weekdaysOnly: value.weekdaysOnly,
    };
  } catch {
    return null;
  }
};

const pendingCount = (row: Pick<JobRow, "total" | "sent" | "failed" | "skipped">): number =>
  Math.max(0, row.total - row.sent - row.failed - row.skipped);

const toJob = (row: JobRow): BulkJob => ({
  id: row.id,
  jobId: row.job_id,
  name: row.name,
  status: row.status,
  fromEmail: row.from_email,
  fromName: row.from_name,
  subject: row.subject,
  bodyText: row.body_text,
  bodyHtml: row.body_html,
  cc: row.cc,
  bcc: row.bcc,
  intervalMinutes: row.interval_minutes,
  jitterSeconds: row.jitter_seconds,
  pauseMin: row.pause_min,
  pauseMax: row.pause_max,
  sendWindow: parseWindow(row.send_window_json),
  total: row.total,
  sent: row.sent,
  failed: row.failed,
  skipped: row.skipped,
  pending: pendingCount(row),
  n8nExecutionId: row.n8n_execution_id,
  estimatedFinishAt: asIso(row.estimated_finish_at),
  lastEventAt: asIso(row.last_event_at),
  error: row.error,
  createdAt: asIso(row.created_at) ?? "",
  updatedAt: asIso(row.updated_at) ?? "",
  completedAt: asIso(row.completed_at),
});

const toRecipient = (row: RecipientRow): BulkRecipient => ({
  id: row.id,
  position: row.position,
  email: row.email,
  fields: parseFields(row.fields_json),
  status: row.status,
  error: row.error,
  providerMessageId: row.provider_message_id,
  sentAt: asIso(row.sent_at),
  skipReason: row.skip_reason,
});

const isUniqueError = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE") {
      return true;
    }
  }
  return error instanceof Error && /unique/i.test(error.message);
};

const nowIso = (): string => new Date().toISOString();

const findRow = async (jobId: string): Promise<JobRow | null> => {
  const row = await (await getDb()).prepare("SELECT * FROM bulk_jobs WHERE job_id = ?").get(jobId);
  return row ? (row as JobRow) : null;
};

const requireRow = async (jobId: string): Promise<JobRow> => {
  const row = await findRow(jobId);
  if (!row) {
    throw new ApiError(404, "VALIDATION", "Bulk job not found.", false);
  }
  return row;
};

const claim = (jobId: string): boolean => {
  if (inFlight.has(jobId)) {
    return false;
  }
  inFlight.add(jobId);
  return true;
};

const release = (jobId: string): void => {
  inFlight.delete(jobId);
};

const inProgressError = (): ApiError =>
  new ApiError(409, "VALIDATION", "A submit is already in progress for this job.", true);

const assertBulkConfigured = (): void => {
  const env = getEnv();
  if (env.N8N_MODE === "fixture") {
    return;
  }
  if (!env.N8N_BULK_SEND_URL) {
    throw new ApiError(500, "UPSTREAM", BULK_URL_MISSING_MESSAGE, false);
  }
  if (!env.N8N_WEBHOOK_SECRET) {
    throw new ApiError(500, "UNAUTHORIZED", BULK_SECRET_MISSING_MESSAGE, false);
  }
};

const handleExisting = (row: JobRow): BulkJob => {
  if (row.status === "failed") {
    throw new ApiError(409, "VALIDATION", "This job was rejected. Start a new job to send again.", false);
  }
  if (RETRYABLE_STATUSES.has(row.status)) {
    if (inFlight.has(row.job_id)) {
      throw inProgressError();
    }
    throw new ApiError(409, "VALIDATION", "This job is waiting for a retry. Use Retry submit.", true);
  }
  return toJob(row);
};

const loadContacts = async (bulkJobId: number): Promise<BulkPreparedContact[]> => {
  const rows = (await (
    await getDb()
  )
    .prepare(
      "SELECT email, fields_json FROM bulk_job_recipients WHERE bulk_job_id = ? AND status = 'pending' ORDER BY position ASC",
    )
    .all(bulkJobId)) as Array<{ email: string; fields_json: string }>;

  return rows.map((row) => ({
    email: row.email,
    fields: parseFields(row.fields_json),
  }));
};

const recount = async (bulkJobId: number, updatedAt: string): Promise<void> => {
  const rows = (await (
    await getDb()
  )
    .prepare("SELECT status, COUNT(*) AS count FROM bulk_job_recipients WHERE bulk_job_id = ? GROUP BY status")
    .all(bulkJobId)) as Array<{ status: BulkRecipientStatus; count: number }>;

  const counts: BulkRecipientCounts = { pending: 0, sent: 0, failed: 0, skipped: 0, unknown: 0 };
  for (const row of rows) {
    counts[row.status] = Number(row.count);
  }

  await (
    await getDb()
  )
    .prepare("UPDATE bulk_jobs SET sent = ?, failed = ?, skipped = ?, updated_at = ? WHERE id = ?")
    .run(counts.sent, counts.failed, counts.skipped, updatedAt, bulkJobId);
};

const markSkipped = async (
  bulkJobId: number,
  skipped: Array<{ row: number; email: string; reason: string }>,
): Promise<void> => {
  const db = await getDb();
  const byPosition = db.prepare(
    "UPDATE bulk_job_recipients SET status = 'skipped', skip_reason = ? WHERE bulk_job_id = ? AND position = ? AND status = 'pending'",
  );
  const byEmail = db.prepare(
    "UPDATE bulk_job_recipients SET status = 'skipped', skip_reason = ? WHERE bulk_job_id = ? AND email = ? AND status = 'pending'",
  );

  for (const entry of skipped) {
    const positioned = await byPosition.run(entry.reason, bulkJobId, entry.row);
    if (Number(positioned.changes) > 0) {
      continue;
    }
    await byEmail.run(entry.reason, bulkJobId, entry.email.trim().toLowerCase());
  }
};

const applySubmitResult = async (jobId: string): Promise<BulkJob> => {
  const row = await requireRow(jobId);
  const job = toJob(row);
  const payload = buildBulkPayload(payloadSourceFromJob(job, await loadContacts(row.id)));

  try {
    const result = await submitBulkToN8n(payload);
    const updatedAt = nowIso();
    const db = await getDb();

    if (result.kind === "rejected") {
      await db
        .prepare("UPDATE bulk_jobs SET status = 'failed', error = ?, updated_at = ?, completed_at = ? WHERE id = ?")
        .run(result.body.error, updatedAt, updatedAt, row.id);
      throw new ApiError(400, "VALIDATION", result.body.error, false);
    }

    if (result.kind === "duplicate") {
      await db
        .prepare(
          "UPDATE bulk_jobs SET status = 'queued', error = NULL, updated_at = ? WHERE id = ? AND status IN ('submitting', 'unknown')",
        )
        .run(updatedAt, row.id);
      return toJob(await requireRow(jobId));
    }

    await markSkipped(row.id, result.body.skipped);
    await recount(row.id, updatedAt);
    await db
      .prepare(
        `UPDATE bulk_jobs
         SET status = 'queued', n8n_execution_id = ?, estimated_finish_at = ?, error = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(result.body.executionId, result.body.estimatedFinishAt, updatedAt, row.id);
    return toJob(await requireRow(jobId));
  } catch (error) {
    if (error instanceof ApiError && !error.retryable) {
      throw error;
    }
    await (
      await getDb()
    )
      .prepare(
        "UPDATE bulk_jobs SET status = 'unknown', updated_at = ? WHERE id = ? AND status IN ('submitting', 'unknown')",
      )
      .run(nowIso(), row.id);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(502, "UPSTREAM", "The webhook could not be reached. Retry uses the same job id.", true);
  }
};

const insertJob = async (
  input: BulkSendRequest,
  sendable: BulkPreparedContact[],
  blocked: BulkPreparedContact[],
  createdBy: string | null,
): Promise<void> => {
  const timestamp = nowIso();
  const sendWindow = input.sendWindow ? JSON.stringify(input.sendWindow) : null;
  await withTransaction(async (db) => {
    const inserted = await db
      .prepare(
        `INSERT INTO bulk_jobs (
          job_id, name, status, from_email, from_name, subject, body_text, body_html,
          cc, bcc, interval_minutes, jitter_seconds, pause_min, pause_max, send_window_json,
          total, sent, failed, skipped, created_by, created_at, updated_at
        ) VALUES (?, ?, 'submitting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
        RETURNING id`,
      )
      .get(
        input.jobId,
        input.name,
        input.from.email,
        input.from.name?.trim() ? input.from.name.trim() : null,
        input.template.subject,
        input.template.bodyText,
        input.template.bodyHtml?.trim() ? input.template.bodyHtml : null,
        input.cc,
        input.bcc,
        input.drip.intervalMinutes,
        input.drip.jitterSeconds,
        input.drip.preSendPauseSeconds.min,
        input.drip.preSendPauseSeconds.max,
        sendWindow,
        sendable.length + blocked.length,
        blocked.length,
        createdBy,
        timestamp,
        timestamp,
      );

    const bulkJobId = Number((inserted as { id: number } | null)?.id);
    const insertRecipient = db.prepare(
      `INSERT INTO bulk_job_recipients (bulk_job_id, position, email, fields_json, status, contact_id, skip_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    let position = 1;
    for (const contact of sendable) {
      const contactId = await upsertContact(db, contactFromFields(contact.email, contact.fields), timestamp);
      await insertRecipient.run(bulkJobId, position, contact.email, JSON.stringify(contact.fields), "pending", contactId, null);
      position += 1;
    }
    for (const contact of blocked) {
      const contactId = await upsertContact(db, contactFromFields(contact.email, contact.fields), timestamp);
      await insertRecipient.run(
        bulkJobId,
        position,
        contact.email,
        JSON.stringify(contact.fields),
        "skipped",
        contactId,
        "Suppressed.",
      );
      position += 1;
    }
  });
};

export const createAndSubmitBulkJob = async (input: BulkSendRequest, createdBy: string | null = null): Promise<BulkJob> => {
  assertBulkConfigured();
  const existing = await findRow(input.jobId);
  if (existing) {
    return handleExisting(existing);
  }

  const prepared = prepareBulkContacts(input.rows, input.emailColumn);
  if (prepared.contacts.length === 0) {
    throw new ApiError(400, "VALIDATION", "Add at least one valid email address.", false);
  }
  if (prepared.contacts.length > 5000) {
    throw new ApiError(
      400,
      "VALIDATION",
      "A bulk job can include at most 5000 contacts. Split the file and start another job.",
      false,
    );
  }

  const blockedSet = await suppressedEmails(
    await getDb(),
    prepared.contacts.map((contact) => contact.email),
  );
  const sendable = prepared.contacts.filter((contact) => !blockedSet.has(contact.email));
  const blocked = prepared.contacts.filter((contact) => blockedSet.has(contact.email));
  if (sendable.length === 0) {
    throw new ApiError(400, "VALIDATION", "Every address is suppressed.", false);
  }

  if (!claim(input.jobId)) {
    throw inProgressError();
  }

  try {
    try {
      await insertJob(input, sendable, blocked, createdBy);
    } catch (error) {
      if (isUniqueError(error)) {
        const row = await findRow(input.jobId);
        if (row) {
          return handleExisting(row);
        }
      }
      throw error;
    }

    console.info(`bulk-send ${input.jobId} stored ${prepared.contacts.length} recipients`);
    return await applySubmitResult(input.jobId);
  } finally {
    release(input.jobId);
  }
};

export const retryBulkJob = async (jobId: string): Promise<BulkJob> => {
  assertBulkConfigured();
  const existing = await requireRow(jobId);
  if (!RETRYABLE_STATUSES.has(existing.status)) {
    throw new ApiError(409, "VALIDATION", "Retry is only available when the submit result is unknown.", false);
  }
  if (!claim(jobId)) {
    throw inProgressError();
  }

  try {
    const updatedAt = nowIso();
    await (
      await getDb()
    )
      .prepare("UPDATE bulk_jobs SET status = 'submitting', updated_at = ? WHERE job_id = ? AND status IN ('submitting', 'unknown')")
      .run(updatedAt, jobId);
    return await applySubmitResult(jobId);
  } finally {
    release(jobId);
  }
};

export const listBulkJobs = async (): Promise<BulkJob[]> => {
  const rows = (await (await getDb()).prepare("SELECT * FROM bulk_jobs ORDER BY created_at DESC, id DESC").all()) as JobRow[];
  return rows.map(toJob);
};

export const getBulkJob = async (
  jobId: string,
  query: { status?: BulkRecipientStatus; limit: number; offset: number },
): Promise<BulkJobDetail> => {
  const row = await requireRow(jobId);
  const filters = ["bulk_job_id = ?"];
  const params: Array<string | number> = [row.id];
  if (query.status) {
    filters.push("status = ?");
    params.push(query.status);
  }
  const where = filters.join(" AND ");
  const totalRow = (await (
    await getDb()
  )
    .prepare(`SELECT COUNT(*) AS count FROM bulk_job_recipients WHERE ${where}`)
    .get(...params)) as { count: number };
  const recipients = (
    (await (
      await getDb()
    )
      .prepare(
        `SELECT id, position, email, fields_json, status, error, provider_message_id, sent_at, skip_reason
         FROM bulk_job_recipients WHERE ${where} ORDER BY position ASC LIMIT ? OFFSET ?`,
      )
      .all(...params, query.limit, query.offset)) as RecipientRow[]
  ).map(toRecipient);

  const grouped = (await (
    await getDb()
  )
    .prepare("SELECT status, COUNT(*) AS count FROM bulk_job_recipients WHERE bulk_job_id = ? GROUP BY status")
    .all(row.id)) as Array<{ status: BulkRecipientStatus; count: number }>;
  const counts: BulkRecipientCounts = { pending: 0, sent: 0, failed: 0, skipped: 0, unknown: 0 };
  for (const entry of grouped) {
    counts[entry.status] = Number(entry.count);
  }

  return {
    job: toJob(row),
    recipients,
    recipientTotal: Number(totalRow.count),
    counts,
  };
};

export const applyBulkProgress = async (event: BulkProgressEvent): Promise<void> => {
  const row = await findRow(event.jobId);
  if (!row) {
    console.info(`bulk-progress ignored unknown job ${event.jobId}`);
    return;
  }

  const updatedAt = nowIso();
  if (event.event === "email_result") {
    const email = event.email.trim().toLowerCase();
    const updated = await (
      await getDb()
    )
      .prepare(
        `UPDATE bulk_job_recipients
         SET status = ?, error = ?, provider_message_id = ?, sent_at = ?
         WHERE bulk_job_id = ? AND email = ? AND status IN ('pending', 'unknown')`,
      )
      .run(
        event.status,
        event.status === "failed" ? (event.error ?? "Send failed.") : null,
        event.providerMessageId ?? null,
        event.sentAt ?? updatedAt,
        row.id,
        email,
      );

    if (Number(updated.changes) === 0) {
      console.info(`bulk-progress ${event.jobId} email_result duplicate`);
      return;
    }

    await recount(row.id, updatedAt);
    if (!TERMINAL_JOB_STATUSES.has(row.status)) {
      await (
        await getDb()
      )
        .prepare(
          `UPDATE bulk_jobs
           SET status = 'running', last_event_at = ?, updated_at = ?
           WHERE id = ? AND status IN ('submitting', 'queued', 'running', 'unknown')`,
        )
        .run(event.sentAt ?? updatedAt, updatedAt, row.id);
    } else {
      await (
        await getDb()
      )
        .prepare("UPDATE bulk_jobs SET last_event_at = ?, updated_at = ? WHERE id = ?")
        .run(updatedAt, updatedAt, row.id);
    }
    console.info(`bulk-progress ${event.jobId} email_result ${event.status}`);
    return;
  }

  await applyJobCompleted(row, event, updatedAt);
};

const applyJobCompleted = async (row: JobRow, event: BulkJobCompletedEvent, updatedAt: string): Promise<void> => {
  const db = await getDb();
  const markFailure = db.prepare(
    `UPDATE bulk_job_recipients
     SET status = 'failed', error = ?
     WHERE bulk_job_id = ? AND email = ? AND status IN ('pending', 'unknown', 'failed')`,
  );
  for (const failure of event.failures) {
    await markFailure.run(failure.error, row.id, failure.email.trim().toLowerCase());
  }

  await db
    .prepare("UPDATE bulk_job_recipients SET status = 'unknown' WHERE bulk_job_id = ? AND status = 'pending'")
    .run(row.id);

  const status = event.failed === 0 ? "completed" : "completed_with_errors";
  await db
    .prepare(
      `UPDATE bulk_jobs
       SET status = ?, total = ?, sent = ?, failed = ?, skipped = ?, last_event_at = ?, completed_at = ?, updated_at = ?, error = NULL
       WHERE id = ?`,
    )
    .run(
      status,
      Math.max(row.total, event.total),
      event.sent,
      event.failed,
      event.skipped,
      event.finishedAt || updatedAt,
      event.finishedAt || updatedAt,
      updatedAt,
      row.id,
    );
  console.info(`bulk-progress ${event.jobId} job_completed sent ${event.sent} failed ${event.failed}`);
};
