import "server-only";

import { ApiError } from "@/lib/api-error";
import { getDb, type AppDatabase } from "@/lib/db";
import { delayMs, replaceTags, type MergeContact, type MergeTagFallbacks } from "@/lib/merge-tags";
import { sendAndRecordManual } from "@/lib/outbound-messages";
import { parseStoredJson } from "@/lib/stored-json";
import type { SequenceItemType } from "@/types/campaigns";

export interface SequenceRow {
  id: string;
  sequence_order: number;
  item_type: SequenceItemType;
  delay_days: number;
  delay_hours: number;
  delay_minutes: number;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
}

interface CampaignSendRow {
  id: string;
  status: string;
  sender_email: string;
  sender_name: string | null;
  merge_tag_fallbacks: unknown;
}

interface PersonRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  phone: string | null;
}

const fallbacksFrom = (raw: unknown): MergeTagFallbacks => {
  const value = parseStoredJson(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: MergeTagFallbacks = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      result[key] = item;
    }
  }
  return result;
};

const toMergeContact = (row: PersonRow): MergeContact => ({
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  company: row.company,
  jobTitle: row.job_title,
  phone: row.phone,
});

export const loadSequences = async (db: AppDatabase, campaignId: string): Promise<SequenceRow[]> =>
  (await db
    .prepare("SELECT * FROM campaign_sequences WHERE campaign_id = ? ORDER BY sequence_order ASC")
    .all(campaignId)) as SequenceRow[];

const loadPerson = async (db: AppDatabase, contactId: string): Promise<PersonRow> => {
  const row = (await db
    .prepare("SELECT id, email, first_name, last_name, company, job_title, phone FROM contacts WHERE id = ?")
    .get(contactId)) as PersonRow | null;
  if (!row) {
    throw new ApiError(404, "VALIDATION", "Contact not found.", false);
  }
  return row;
};

const markCompleted = async (db: AppDatabase, campaignId: string, contactId: string, now: string): Promise<void> => {
  await db
    .prepare(
      `UPDATE campaign_contacts
       SET status = 'completed', completed_at = ?, current_sequence = (
         SELECT COALESCE(MAX(sequence_order), current_sequence) FROM campaign_sequences WHERE campaign_id = ?
       )
       WHERE campaign_id = ? AND contact_id = ? AND status <> 'completed'`,
    )
    .run(now, campaignId, campaignId, contactId);

  const open = (await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ? AND status NOT IN ('completed', 'unsubscribed', 'failed')) AS people,
         (SELECT COUNT(*) FROM message_queue WHERE campaign_id = ? AND status IN ('pending', 'processing', 'unknown')) AS waiting,
         (SELECT COUNT(*) FROM batch_contacts
            JOIN batch_distributions ON batch_distributions.id = batch_contacts.batch_id
           WHERE batch_distributions.campaign_id = ? AND batch_contacts.status = 'pending') AS holding`,
    )
    .get(campaignId, campaignId, campaignId)) as { people: number; waiting: number; holding: number };
  if (Number(open.people) === 0 && Number(open.waiting) === 0 && Number(open.holding) === 0) {
    await db
      .prepare("UPDATE campaigns SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'active'")
      .run(now, now, campaignId);
  }
};

const deliverStep = async (
  db: AppDatabase,
  campaign: CampaignSendRow,
  person: PersonRow,
  step: SequenceRow,
  createdBy: string | null,
): Promise<void> => {
  const now = new Date().toISOString();
  const contact = toMergeContact(person);
  const fallbacks = fallbacksFrom(campaign.merge_tag_fallbacks);
  const subject = replaceTags(step.subject ?? "", contact, fallbacks);
  const bodyText = replaceTags(step.body_text ?? "", contact, fallbacks);
  const bodyHtml = step.body_html ? replaceTags(step.body_html, contact, fallbacks) : "";
  const queueId = crypto.randomUUID();
  const displayName = [person.first_name, person.last_name].filter((part) => part && part.trim().length > 0).join(" ");

  await db
    .prepare(
      `INSERT INTO message_queue (
         id, campaign_id, contact_id, sequence_id, subject, body_text, body_html,
         scheduled_for, status, attempts, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing', 1, ?, ?)`,
    )
    .run(queueId, campaign.id, person.id, step.id, subject, bodyText, bodyHtml || null, now, now, now);

  try {
    await sendAndRecordManual(
      {
        idempotencyKey: queueId,
        requestedAt: now,
        from: {
          email: campaign.sender_email,
          ...(campaign.sender_name ? { name: campaign.sender_name } : {}),
        },
        to: { email: person.email, ...(displayName ? { name: displayName } : {}) },
        subject,
        bodyText,
        ...(bodyHtml ? { bodyHtml } : {}),
        thread: {},
      },
      createdBy,
    );
    await db
      .prepare(
        `UPDATE message_queue
         SET status = 'sent', outbound_message_id = ?, error = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(queueId, new Date().toISOString(), queueId);
    await db
      .prepare(
        `UPDATE campaign_contacts
         SET status = 'in_progress', current_sequence = ?, last_message_sent_at = ?
         WHERE campaign_id = ? AND contact_id = ?`,
      )
      .run(step.sequence_order, new Date().toISOString(), campaign.id, person.id);
  } catch (error) {
    const retryable = error instanceof ApiError ? error.retryable : true;
    const message = error instanceof Error ? error.message : "The webhook could not send this step.";
    await db
      .prepare("UPDATE message_queue SET status = ?, error = ?, updated_at = ? WHERE id = ?")
      .run(retryable ? "unknown" : "failed", message, new Date().toISOString(), queueId);
    if (!retryable) {
      await db
        .prepare("UPDATE campaign_contacts SET status = 'failed' WHERE campaign_id = ? AND contact_id = ?")
        .run(campaign.id, person.id);
    }
    throw error;
  }
};

const queueStep = async (
  db: AppDatabase,
  campaign: CampaignSendRow,
  person: PersonRow,
  step: SequenceRow,
  scheduledFor: string,
): Promise<void> => {
  const contact = toMergeContact(person);
  const fallbacks = fallbacksFrom(campaign.merge_tag_fallbacks);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO message_queue (
         id, campaign_id, contact_id, sequence_id, subject, body_text, body_html,
         scheduled_for, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      campaign.id,
      person.id,
      step.id,
      replaceTags(step.subject ?? "", contact, fallbacks),
      replaceTags(step.body_text ?? "", contact, fallbacks),
      step.body_html ? replaceTags(step.body_html, contact, fallbacks) : null,
      scheduledFor,
      now,
      now,
    );
};

export const scheduleNextMessage = async (
  db: AppDatabase,
  campaignId: string,
  contactId: string,
  afterOrder: number,
  fromTime: Date,
  createdBy: string | null,
): Promise<"queued" | "sent" | "completed"> => {
  const campaign = (await db
    .prepare("SELECT id, status, sender_email, sender_name, merge_tag_fallbacks FROM campaigns WHERE id = ?")
    .get(campaignId)) as CampaignSendRow | null;
  if (!campaign || campaign.status !== "active") {
    return "completed";
  }

  const sequences = await loadSequences(db, campaignId);
  const person = await loadPerson(db, contactId);
  let at = fromTime.getTime();

  for (const step of sequences) {
    if (step.sequence_order <= afterOrder) {
      continue;
    }
    if (step.item_type === "delay") {
      at += delayMs(Number(step.delay_days), Number(step.delay_hours), Number(step.delay_minutes));
      continue;
    }

    if (at <= Date.now()) {
      await deliverStep(db, campaign, person, step, createdBy);
      return scheduleNextMessage(db, campaignId, contactId, step.sequence_order, new Date(), createdBy);
    }

    await queueStep(db, campaign, person, step, new Date(at).toISOString());
    await db
      .prepare("UPDATE campaign_contacts SET status = 'in_progress' WHERE campaign_id = ? AND contact_id = ? AND status = 'enrolled'")
      .run(campaignId, contactId);
    return "queued";
  }

  await markCompleted(db, campaignId, contactId, new Date().toISOString());
  return "completed";
};

export const dispatchQueuedMessage = async (queueId: string, createdBy: string | null = null): Promise<void> => {
  const db = await getDb();
  const row = (await db
    .prepare(
      `SELECT queue.id, queue.campaign_id, queue.contact_id, queue.sequence_id, queue.subject, queue.body_text, queue.body_html,
              queue.status, sequences.sequence_order, campaigns.status AS campaign_status, campaigns.sender_email, campaigns.sender_name,
              contacts.email, contacts.first_name, contacts.last_name
       FROM message_queue AS queue
       JOIN campaign_sequences AS sequences ON sequences.id = queue.sequence_id
       JOIN campaigns ON campaigns.id = queue.campaign_id
       JOIN contacts ON contacts.id = queue.contact_id
       WHERE queue.id = ?`,
    )
    .get(queueId)) as {
    id: string;
    campaign_id: string;
    contact_id: string;
    sequence_id: string;
    subject: string;
    body_text: string;
    body_html: string | null;
    status: string;
    sequence_order: number;
    campaign_status: string;
    sender_email: string;
    sender_name: string | null;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;

  if (!row || row.campaign_status !== "active") {
    return;
  }
  if (row.status === "sent") {
    return;
  }

  const now = new Date().toISOString();
  await db.prepare("UPDATE message_queue SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?").run(now, row.id);
  const displayName = [row.first_name, row.last_name].filter((part) => part && part.trim().length > 0).join(" ");

  try {
    await sendAndRecordManual(
      {
        idempotencyKey: row.id,
        requestedAt: now,
        from: { email: row.sender_email, ...(row.sender_name ? { name: row.sender_name } : {}) },
        to: { email: row.email, ...(displayName ? { name: displayName } : {}) },
        subject: row.subject,
        bodyText: row.body_text,
        ...(row.body_html ? { bodyHtml: row.body_html } : {}),
        thread: {},
      },
      createdBy,
    );
    await db
      .prepare("UPDATE message_queue SET status = 'sent', outbound_message_id = ?, error = NULL, updated_at = ? WHERE id = ?")
      .run(row.id, new Date().toISOString(), row.id);
    await db
      .prepare(
        `UPDATE campaign_contacts SET status = 'in_progress', current_sequence = ?, last_message_sent_at = ?
         WHERE campaign_id = ? AND contact_id = ?`,
      )
      .run(row.sequence_order, new Date().toISOString(), row.campaign_id, row.contact_id);
    await scheduleNextMessage(db, row.campaign_id, row.contact_id, Number(row.sequence_order), new Date(), createdBy);
  } catch (error) {
    const retryable = error instanceof ApiError ? error.retryable : true;
    const message = error instanceof Error ? error.message : "The webhook could not send this step.";
    await db
      .prepare("UPDATE message_queue SET status = ?, error = ?, updated_at = ? WHERE id = ?")
      .run(retryable ? "unknown" : "failed", message, new Date().toISOString(), row.id);
    if (!retryable) {
      throw error;
    }
  }
};

export const processDueQueue = async (now = new Date()): Promise<number> => {
  const db = await getDb();
  const due = (await db
    .prepare(
      `SELECT queue.id
       FROM message_queue AS queue
       JOIN campaigns ON campaigns.id = queue.campaign_id
       WHERE queue.status IN ('pending', 'unknown')
         AND queue.scheduled_for <= ?
         AND campaigns.status = 'active'
       ORDER BY queue.scheduled_for ASC
       LIMIT 50`,
    )
    .all(now.toISOString())) as Array<{ id: string }>;

  for (const item of due) {
    await dispatchQueuedMessage(item.id, null);
  }
  return due.length;
};

export const activateAndStart = async (campaignId: string, createdBy: string | null): Promise<void> => {
  const now = new Date();
  const db = await getDb();
  const campaign = (await db.prepare("SELECT status FROM campaigns WHERE id = ?").get(campaignId)) as { status: string } | null;
  if (!campaign) {
    throw new ApiError(404, "VALIDATION", "Campaign not found.", false);
  }
  if (campaign.status === "paused") {
    const { resumeCampaign } = await import("@/lib/campaigns");
    await resumeCampaign(campaignId);
    return;
  }
  if (campaign.status === "active") {
    return;
  }
  if (campaign.status !== "draft") {
    throw new ApiError(409, "VALIDATION", "This campaign cannot be activated.", false);
  }

  const steps = await loadSequences(db, campaignId);
  if (!steps.some((step) => step.item_type === "message")) {
    throw new ApiError(400, "VALIDATION", "Add at least one email step.", false);
  }

  await db
    .prepare("UPDATE campaigns SET status = 'active', started_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
    .run(now.toISOString(), now.toISOString(), campaignId);

  const people = (await db
    .prepare("SELECT contact_id FROM campaign_contacts WHERE campaign_id = ? AND status = 'enrolled'")
    .all(campaignId)) as Array<{ contact_id: string }>;
  for (const person of people) {
    const existing = await db
      .prepare("SELECT id FROM message_queue WHERE campaign_id = ? AND contact_id = ? LIMIT 1")
      .get(campaignId, person.contact_id);
    if (existing) {
      continue;
    }
    await scheduleNextMessage(db, campaignId, person.contact_id, 0, now, createdBy);
  }
};
