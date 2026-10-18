import "server-only";

import { ApiError } from "@/lib/api-error";
import { getDb, withTransaction, type AppDatabase } from "@/lib/db";
import { asIso, parseStoredJson } from "@/lib/stored-json";
import type {
  CampaignDetail,
  CampaignDraft,
  CampaignStatus,
  CampaignStep,
  CampaignSummary,
  SequenceItemType,
} from "@/types/campaigns";

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  sender_email: string;
  sender_name: string | null;
  merge_tag_fallbacks: unknown;
  paused_at: unknown;
  started_at: unknown;
  enrolled_count?: number;
  sent_count?: number;
  step_count?: number;
  created_at: unknown;
  updated_at: unknown;
}

interface StepRow {
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

const fallbacksFrom = (raw: unknown): Record<string, string> => {
  const value = parseStoredJson(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim().length > 0) {
      result[key] = item.trim();
    }
  }
  return result;
};

const toStep = (row: StepRow): CampaignStep => ({
  id: row.id,
  sequenceOrder: Number(row.sequence_order),
  itemType: row.item_type,
  delayDays: Number(row.delay_days),
  delayHours: Number(row.delay_hours),
  delayMinutes: Number(row.delay_minutes),
  subject: row.subject,
  bodyText: row.body_text,
  bodyHtml: row.body_html,
});

const summarySelect = `
  SELECT campaigns.*,
    (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = campaigns.id) AS enrolled_count,
    (SELECT COUNT(*) FROM message_queue WHERE campaign_id = campaigns.id AND status = 'sent') AS sent_count,
    (SELECT COUNT(*) FROM campaign_sequences WHERE campaign_id = campaigns.id) AS step_count
  FROM campaigns
`;

const toSummary = (row: CampaignRow): CampaignSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  senderEmail: row.sender_email,
  senderName: row.sender_name,
  enrolledCount: Number(row.enrolled_count ?? 0),
  sentCount: Number(row.sent_count ?? 0),
  stepCount: Number(row.step_count ?? 0),
  createdAt: asIso(row.created_at) ?? "",
  updatedAt: asIso(row.updated_at) ?? "",
});

export const listCampaigns = async (): Promise<CampaignSummary[]> => {
  const rows = (await (
    await getDb()
  )
    .prepare(`${summarySelect} WHERE status <> 'archived' ORDER BY created_at DESC`)
    .all()) as CampaignRow[];
  return rows.map(toSummary);
};

const loadSteps = async (db: AppDatabase, campaignId: string): Promise<StepRow[]> =>
  (await db
    .prepare("SELECT * FROM campaign_sequences WHERE campaign_id = ? ORDER BY sequence_order ASC")
    .all(campaignId)) as StepRow[];

export const getCampaign = async (id: string): Promise<CampaignDetail> => {
  const db = await getDb();
  const row = (await db.prepare(`${summarySelect} WHERE campaigns.id = ?`).get(id)) as CampaignRow | null;
  if (!row) {
    throw new ApiError(404, "VALIDATION", "Campaign not found.", false);
  }
  const steps = (await loadSteps(db, id)).map(toStep);
  const next = (await db
    .prepare(
      `SELECT scheduled_for FROM message_queue
       WHERE campaign_id = ? AND status IN ('pending', 'unknown')
       ORDER BY scheduled_for ASC LIMIT 1`,
    )
    .get(id)) as { scheduled_for: unknown } | null;
  return {
    ...toSummary(row),
    mergeTagFallbacks: fallbacksFrom(row.merge_tag_fallbacks),
    pausedAt: asIso(row.paused_at),
    startedAt: asIso(row.started_at),
    steps,
    nextSendAt: asIso(next?.scheduled_for ?? null),
  };
};

const assertSteps = (steps: CampaignDraft["steps"]): void => {
  if (!steps.some((step) => step.itemType === "message")) {
    throw new ApiError(400, "VALIDATION", "Add at least one email step.", false);
  }
  for (const step of steps) {
    if (step.itemType === "message" && (step.subject.trim().length === 0 || step.bodyText.trim().length === 0)) {
      throw new ApiError(400, "VALIDATION", "Each email step needs a subject and a body.", false);
    }
  }
};

export const saveCampaign = async (input: CampaignDraft, createdBy: string | null): Promise<CampaignDetail> => {
  assertSteps(input.steps);
  const now = new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();

  await withTransaction(async (db) => {
    const existing = input.id
      ? ((await db.prepare("SELECT id, status FROM campaigns WHERE id = ?").get(input.id)) as { status: CampaignStatus } | null)
      : null;
    if (input.id && !existing) {
      throw new ApiError(404, "VALIDATION", "Campaign not found.", false);
    }
    if (existing && (existing.status === "archived" || existing.status === "completed")) {
      throw new ApiError(409, "VALIDATION", "This campaign can no longer be edited.", false);
    }

    if (!existing) {
      await db
        .prepare(
          `INSERT INTO campaigns (
             id, name, description, status, sender_email, sender_name, merge_tag_fallbacks, created_by, created_at, updated_at
           ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.name.trim(),
          input.description.trim() || null,
          input.senderEmail.trim().toLowerCase(),
          input.senderName.trim() || null,
          JSON.stringify(input.mergeTagFallbacks),
          createdBy,
          now,
          now,
        );
    } else {
      await db
        .prepare(
          `UPDATE campaigns
           SET name = ?, description = ?, sender_email = ?, sender_name = ?, merge_tag_fallbacks = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.name.trim(),
          input.description.trim() || null,
          input.senderEmail.trim().toLowerCase(),
          input.senderName.trim() || null,
          JSON.stringify(input.mergeTagFallbacks),
          now,
          id,
        );
    }

    const current = await loadSteps(db, id);
    const kept = new Set(input.steps.map((step) => step.id).filter((stepId): stepId is string => Boolean(stepId)));
    for (const step of current) {
      if (kept.has(step.id)) {
        continue;
      }
      const queued = await db
        .prepare("SELECT id FROM message_queue WHERE sequence_id = ? LIMIT 1")
        .get(step.id);
      if (queued) {
        throw new ApiError(409, "VALIDATION", "A step that already has queued mail cannot be removed.", false);
      }
      await db.prepare("DELETE FROM campaign_sequences WHERE id = ?").run(step.id);
    }

    let order = 1000;
    for (const step of input.steps) {
      order += 1;
      if (step.id && current.some((row) => row.id === step.id)) {
        await db
          .prepare(
            `UPDATE campaign_sequences
             SET sequence_order = ?, item_type = ?, delay_days = ?, delay_hours = ?, delay_minutes = ?,
                 subject = ?, body_text = ?, body_html = ?
             WHERE id = ? AND campaign_id = ?`,
          )
          .run(
            order,
            step.itemType,
            step.delayDays,
            step.delayHours,
            step.delayMinutes,
            step.subject.trim() || null,
            step.bodyText.trim() || null,
            step.bodyHtml.trim() || null,
            step.id,
            id,
          );
      } else {
        await db
          .prepare(
            `INSERT INTO campaign_sequences (
               id, campaign_id, sequence_order, item_type, delay_days, delay_hours, delay_minutes, subject, body_text, body_html
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            step.id ?? crypto.randomUUID(),
            id,
            order,
            step.itemType,
            step.delayDays,
            step.delayHours,
            step.delayMinutes,
            step.subject.trim() || null,
            step.bodyText.trim() || null,
            step.bodyHtml.trim() || null,
          );
      }
    }

    const ordered = await loadSteps(db, id);
    for (const [index, step] of ordered.entries()) {
      await db.prepare("UPDATE campaign_sequences SET sequence_order = ? WHERE id = ?").run(1000 + index, step.id);
    }
    const parked = await loadSteps(db, id);
    for (const [index, step] of parked.entries()) {
      await db.prepare("UPDATE campaign_sequences SET sequence_order = ? WHERE id = ?").run(index + 1, step.id);
    }
  });

  return getCampaign(id);
};

export const pauseCampaign = async (id: string): Promise<CampaignDetail> => {
  const now = new Date().toISOString();
  const db = await getDb();
  const result = await db
    .prepare("UPDATE campaigns SET status = 'paused', paused_at = ?, updated_at = ? WHERE id = ? AND status = 'active'")
    .run(now, now, id);
  if (result.changes === 0) {
    const row = (await db.prepare("SELECT status FROM campaigns WHERE id = ?").get(id)) as { status: CampaignStatus } | null;
    if (!row) {
      throw new ApiError(404, "VALIDATION", "Campaign not found.", false);
    }
    if (row.status !== "paused") {
      throw new ApiError(409, "VALIDATION", "Only an active campaign can be paused.", false);
    }
  }
  return getCampaign(id);
};

export const resumeCampaign = async (id: string): Promise<CampaignDetail> => {
  const db = await getDb();
  const row = (await db.prepare("SELECT status, paused_at FROM campaigns WHERE id = ?").get(id)) as {
    status: CampaignStatus;
    paused_at: unknown;
  } | null;
  if (!row) {
    throw new ApiError(404, "VALIDATION", "Campaign not found.", false);
  }
  if (row.status === "active") {
    return getCampaign(id);
  }
  if (row.status !== "paused") {
    throw new ApiError(409, "VALIDATION", "Only a paused campaign can be resumed.", false);
  }

  const now = new Date();
  const pausedAt = asIso(row.paused_at);
  const duration = pausedAt ? Math.max(0, now.getTime() - new Date(pausedAt).getTime()) : 0;
  const pending = (await db
    .prepare("SELECT id, scheduled_for FROM message_queue WHERE campaign_id = ? AND status IN ('pending', 'unknown')")
    .all(id)) as Array<{ id: string; scheduled_for: unknown }>;

  await withTransaction(async (tx) => {
    for (const item of pending) {
      const scheduled = asIso(item.scheduled_for);
      if (!scheduled) {
        continue;
      }
      const shifted = new Date(new Date(scheduled).getTime() + duration).toISOString();
      await tx.prepare("UPDATE message_queue SET scheduled_for = ?, updated_at = ? WHERE id = ?").run(shifted, now.toISOString(), item.id);
    }
    await tx
      .prepare(
        `INSERT INTO campaign_pause_events (id, campaign_id, paused_at, resumed_at, pause_duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(crypto.randomUUID(), id, pausedAt ?? now.toISOString(), now.toISOString(), duration, now.toISOString());
    await tx
      .prepare("UPDATE campaigns SET status = 'active', paused_at = NULL, updated_at = ? WHERE id = ?")
      .run(now.toISOString(), id);
  });

  const { startUnscheduledEnrollments } = await import("@/lib/campaign-sequence");
  await startUnscheduledEnrollments(id, null);
  return getCampaign(id);
};

export const archiveCampaign = async (id: string): Promise<void> => {
  const now = new Date().toISOString();
  const result = await (
    await getDb()
  )
    .prepare(
      "UPDATE campaigns SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ? AND status <> 'archived'",
    )
    .run(now, now, id);
  if (result.changes === 0) {
    throw new ApiError(404, "VALIDATION", "Campaign not found.", false);
  }
};
