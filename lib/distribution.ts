import "server-only";

import { ApiError } from "@/lib/api-error";
import { enrollPerson, type PersonFields } from "@/lib/campaign-enrollment";
import { getDb } from "@/lib/db";
import { isInsideSendWindow } from "@/lib/merge-tags";
import { asIso, parseStoredJson } from "@/lib/stored-json";
import type { DistributionSummary } from "@/types/campaigns";

export interface DistributionInput {
  campaignId: string;
  name: string;
  executionType: "immediate" | "drip";
  contacts: PersonFields[];
  dripContactsPerBatch: number;
  dripIntervalMinutes: number;
  sendWindowEnabled: boolean;
  sendWindowDays: number[];
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  sendWindowTimezone: string;
  createdBy: string | null;
}

interface BatchRow {
  id: string;
  name: string;
  status: string;
  execution_type: "immediate" | "drip";
  total_contacts: number;
  processed_contacts: number;
  drip_contacts_per_batch: number;
  drip_interval_minutes: number;
  last_drip_sent_at: unknown;
  send_window_enabled: number | boolean;
  send_window_days: unknown;
  send_window_start_hour: number;
  send_window_end_hour: number;
  send_window_timezone: string;
  campaign_id: string;
}

const toSummary = (row: BatchRow): DistributionSummary => ({
  id: row.id,
  name: row.name,
  status: row.status,
  executionType: row.execution_type,
  totalContacts: Number(row.total_contacts),
  processedContacts: Number(row.processed_contacts),
  dripContactsPerBatch: Number(row.drip_contacts_per_batch),
  dripIntervalMinutes: Number(row.drip_interval_minutes),
  lastDripSentAt: asIso(row.last_drip_sent_at),
});

const daysFrom = (raw: unknown): number[] => {
  const value = parseStoredJson(raw);
  return Array.isArray(value) ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [1, 2, 3, 4, 5];
};

const releaseContacts = async (batch: BatchRow, limit: number, createdBy: string | null): Promise<number> => {
  const db = await getDb();
  const rows = (await db
    .prepare(
      `SELECT id, email, contact_data FROM batch_contacts
       WHERE batch_id = ? AND status = 'pending'
       ORDER BY processing_order ASC
       LIMIT ?`,
    )
    .all(batch.id, limit)) as Array<{ id: string; email: string; contact_data: unknown }>;

  let released = 0;
  for (const row of rows) {
    const data = parseStoredJson(row.contact_data);
    const fields = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
    const text = (key: string): string | null => {
      const value = fields[key];
      return typeof value === "string" ? value : null;
    };
    const now = new Date().toISOString();
    try {
      const result = await enrollPerson(
        batch.campaign_id,
        {
          email: row.email,
          firstName: text("firstName"),
          lastName: text("lastName"),
          company: text("company"),
          phone: text("phone"),
          jobTitle: text("jobTitle"),
        },
        createdBy,
      );
      await db
        .prepare(
          `UPDATE batch_contacts
           SET status = 'completed', enrolled_contact_id = ?, processed_at = ?, error_message = NULL
           WHERE id = ?`,
        )
        .run(result.contactId, now, row.id);
      released += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "This contact could not be enrolled.";
      const skipped = error instanceof ApiError && error.status === 400;
      await db
        .prepare("UPDATE batch_contacts SET status = ?, error_message = ?, processed_at = ? WHERE id = ?")
        .run(skipped ? "skipped" : "failed", message, now, row.id);
      released += 1;
    }
  }

  const counts = (await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM batch_contacts WHERE batch_id = ? AND status IN ('completed', 'skipped', 'failed')) AS done,
         (SELECT COUNT(*) FROM batch_contacts WHERE batch_id = ? AND status = 'pending') AS pending`,
    )
    .get(batch.id, batch.id)) as { done: number; pending: number };
  const finished = Number(counts.pending) === 0;
  await db
    .prepare(
      `UPDATE batch_distributions
       SET processed_contacts = ?, status = ?, completed_at = ?, updated_at = ?, last_drip_sent_at = ?
       WHERE id = ?`,
    )
    .run(
      Number(counts.done),
      finished ? "completed" : "processing",
      finished ? new Date().toISOString() : null,
      new Date().toISOString(),
      new Date().toISOString(),
      batch.id,
    );
  return released;
};

export const createDistribution = async (input: DistributionInput): Promise<DistributionSummary> => {
  if (input.contacts.length === 0) {
    throw new ApiError(400, "VALIDATION", "Add at least one contact.", false);
  }
  const db = await getDb();
  const campaign = await db.prepare("SELECT id FROM campaigns WHERE id = ?").get(input.campaignId);
  if (!campaign) {
    throw new ApiError(404, "VALIDATION", "Campaign not found.", false);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const seen = new Set<string>();
  const unique = input.contacts.filter((contact) => {
    const email = contact.email.trim().toLowerCase();
    if (seen.has(email)) {
      return false;
    }
    seen.add(email);
    return true;
  });

  await db
    .prepare(
      `INSERT INTO batch_distributions (
         id, campaign_id, name, status, execution_type, total_contacts, processed_contacts,
         drip_contacts_per_batch, drip_interval_minutes, send_window_enabled, send_window_days,
         send_window_start_hour, send_window_end_hour, send_window_timezone, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, 'pending', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.campaignId,
      input.name.trim() || "Distribution",
      input.executionType,
      unique.length,
      Math.max(1, input.dripContactsPerBatch),
      Math.max(1, input.dripIntervalMinutes),
      input.sendWindowEnabled ? 1 : 0,
      JSON.stringify(input.sendWindowDays),
      input.sendWindowStartHour,
      input.sendWindowEndHour,
      input.sendWindowTimezone || "UTC",
      input.createdBy,
      now,
      now,
    );

  let order = 1;
  for (const contact of unique) {
    await db
      .prepare(
        `INSERT INTO batch_contacts (id, batch_id, email, contact_data, status, processing_order, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        id,
        contact.email.trim().toLowerCase(),
        JSON.stringify({
          firstName: contact.firstName ?? "",
          lastName: contact.lastName ?? "",
          company: contact.company ?? "",
          phone: contact.phone ?? "",
          jobTitle: contact.jobTitle ?? "",
        }),
        order,
        now,
      );
    order += 1;
  }

  const batch = (await db.prepare("SELECT * FROM batch_distributions WHERE id = ?").get(id)) as BatchRow;
  if (input.executionType === "immediate") {
    await releaseContacts(batch, unique.length, input.createdBy);
  } else {
    await releaseDueBatch(batch, input.createdBy);
  }
  return toSummary((await db.prepare("SELECT * FROM batch_distributions WHERE id = ?").get(id)) as BatchRow);
};

const releaseDueBatch = async (batch: BatchRow, createdBy: string | null): Promise<number> => {
  if (batch.status === "paused" || batch.status === "completed") {
    return 0;
  }
  const db = await getDb();
  const campaign = (await db.prepare("SELECT status FROM campaigns WHERE id = ?").get(batch.campaign_id)) as { status: string } | null;
  if (!campaign || campaign.status !== "active") {
    return 0;
  }
  const last = asIso(batch.last_drip_sent_at);
  if (last) {
    const nextAt = new Date(last).getTime() + Number(batch.drip_interval_minutes) * 60_000;
    if (Date.now() + 5000 < nextAt) {
      return 0;
    }
  }
  const open = isInsideSendWindow(new Date(), {
    enabled: batch.send_window_enabled === true || Number(batch.send_window_enabled) === 1,
    days: daysFrom(batch.send_window_days),
    startHour: Number(batch.send_window_start_hour),
    endHour: Number(batch.send_window_end_hour),
    timeZone: batch.send_window_timezone || "UTC",
  });
  if (!open) {
    return 0;
  }
  return releaseContacts(batch, Number(batch.drip_contacts_per_batch), createdBy);
};

export const processDripDistributions = async (campaignId?: string): Promise<number> => {
  const rows = (await (
    await getDb()
  )
    .prepare(
      `SELECT * FROM batch_distributions
       WHERE execution_type = 'drip' AND status IN ('pending', 'processing')
         ${campaignId ? "AND campaign_id = ?" : ""}`,
    )
    .all(...(campaignId ? [campaignId] : []))) as BatchRow[];
  let released = 0;
  for (const row of rows) {
    released += await releaseDueBatch(row, null);
  }
  return released;
};

export const listDistributions = async (campaignId: string): Promise<DistributionSummary[]> => {
  const rows = (await (
    await getDb()
  )
    .prepare("SELECT * FROM batch_distributions WHERE campaign_id = ? ORDER BY created_at DESC")
    .all(campaignId)) as BatchRow[];
  return rows.map(toSummary);
};

export const pauseDistribution = async (id: string): Promise<void> => {
  const now = new Date().toISOString();
  const result = await (
    await getDb()
  )
    .prepare(
      "UPDATE batch_distributions SET status = 'paused', paused_at = ?, updated_at = ? WHERE id = ? AND status IN ('pending', 'processing')",
    )
    .run(now, now, id);
  if (result.changes === 0) {
    throw new ApiError(409, "VALIDATION", "This distribution cannot be paused.", false);
  }
};

export const resumeDistribution = async (id: string): Promise<void> => {
  const now = new Date().toISOString();
  const result = await (
    await getDb()
  )
    .prepare(
      "UPDATE batch_distributions SET status = 'processing', paused_at = NULL, updated_at = ? WHERE id = ? AND status = 'paused'",
    )
    .run(now, id);
  if (result.changes === 0) {
    throw new ApiError(409, "VALIDATION", "This distribution is not paused.", false);
  }
};
