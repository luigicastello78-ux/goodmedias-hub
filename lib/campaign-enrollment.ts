import "server-only";

import { ApiError } from "@/lib/api-error";
import { activateAndStart, scheduleNextMessage } from "@/lib/campaign-sequence";
import { contactFromFields, isSuppressed, upsertContact } from "@/lib/contacts";
import { getDb } from "@/lib/db";
import { asIso } from "@/lib/stored-json";
import type { EnrolledContact, EnrollmentStatus } from "@/types/campaigns";

export interface PersonFields {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  status?: string | null;
  source?: string | null;
  notes?: string | null;
}

const blank = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const isUniqueEnrollment = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return true;
    }
  }
  return error instanceof Error && /unique|primary key/i.test(error.message);
};

export const savePerson = async (fields: PersonFields, createdByTouchedAt = new Date().toISOString()): Promise<string> => {
  const db = await getDb();
  const email = fields.email.trim().toLowerCase();
  const id = await upsertContact(
    db,
    contactFromFields(
      email,
      {
        firstName: fields.firstName ?? "",
        lastName: fields.lastName ?? "",
        company: fields.company ?? "",
      },
      [fields.firstName, fields.lastName].filter(Boolean).join(" "),
    ),
    createdByTouchedAt,
  );
  await db
    .prepare(
      `UPDATE contacts
       SET phone = COALESCE(?, phone),
           job_title = COALESCE(?, job_title),
           status = COALESCE(?, status),
           source = COALESCE(?, source),
           notes = COALESCE(?, notes),
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      blank(fields.phone),
      blank(fields.jobTitle),
      blank(fields.status),
      blank(fields.source),
      blank(fields.notes),
      createdByTouchedAt,
      id,
    );
  return id;
};

export const enrollPerson = async (
  campaignId: string,
  fields: PersonFields,
  createdBy: string | null,
): Promise<{ contactId: string; alreadyEnrolled: boolean }> => {
  const db = await getDb();
  const campaign = (await db.prepare("SELECT id, status FROM campaigns WHERE id = ?").get(campaignId)) as {
    status: string;
  } | null;
  if (!campaign) {
    throw new ApiError(404, "VALIDATION", "Campaign not found.", false);
  }
  if (campaign.status === "archived" || campaign.status === "completed") {
    throw new ApiError(409, "VALIDATION", "This campaign is not accepting people.", false);
  }
  if (await isSuppressed(db, fields.email)) {
    throw new ApiError(400, "VALIDATION", "This address is suppressed and will not be emailed.", false);
  }

  const contactId = await savePerson(fields);
  const existing = await db
    .prepare("SELECT id FROM campaign_contacts WHERE campaign_id = ? AND contact_id = ?")
    .get(campaignId, contactId);
  if (existing) {
    return { contactId, alreadyEnrolled: true };
  }

  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO campaign_contacts (id, campaign_id, contact_id, status, current_sequence, enrolled_at)
         VALUES (?, ?, ?, 'enrolled', 0, ?)`,
      )
      .run(crypto.randomUUID(), campaignId, contactId, now);
  } catch (error) {
    if (isUniqueEnrollment(error)) {
      return { contactId, alreadyEnrolled: true };
    }
    throw error;
  }

  if (campaign.status === "active") {
    await scheduleNextMessage(db, campaignId, contactId, 0, new Date(), createdBy);
  }
  return { contactId, alreadyEnrolled: false };
};

export const enrollMany = async (
  campaignId: string,
  people: PersonFields[],
  createdBy: string | null,
): Promise<{ enrolled: number; skipped: number }> => {
  let enrolled = 0;
  let skipped = 0;
  for (const person of people) {
    try {
      const result = await enrollPerson(campaignId, person, createdBy);
      if (result.alreadyEnrolled) {
        skipped += 1;
      } else {
        enrolled += 1;
      }
    } catch (error) {
      if (error instanceof ApiError && error.message.includes("suppressed")) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  return { enrolled, skipped };
};

export const activateCampaign = async (campaignId: string, createdBy: string | null): Promise<void> => {
  await activateAndStart(campaignId, createdBy);
};

export const listEnrolled = async (campaignId: string): Promise<EnrolledContact[]> => {
  const rows = (await (
    await getDb()
  )
    .prepare(
      `SELECT contacts.id, contacts.email, contacts.first_name, contacts.last_name, contacts.display_name,
              enrollment.status, enrollment.current_sequence, enrollment.enrolled_at, enrollment.last_message_sent_at,
              (
                SELECT scheduled_for FROM message_queue
                WHERE campaign_id = enrollment.campaign_id AND contact_id = enrollment.contact_id
                  AND status IN ('pending', 'unknown')
                ORDER BY scheduled_for ASC LIMIT 1
              ) AS next_send_at
       FROM campaign_contacts AS enrollment
       JOIN contacts ON contacts.id = enrollment.contact_id
       WHERE enrollment.campaign_id = ?
       ORDER BY enrollment.enrolled_at DESC`,
    )
    .all(campaignId)) as Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    status: EnrollmentStatus;
    current_sequence: number;
    enrolled_at: unknown;
    last_message_sent_at: unknown;
    next_send_at: unknown;
  }>;

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.display_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email,
    status: row.status,
    currentSequence: Number(row.current_sequence),
    enrolledAt: asIso(row.enrolled_at) ?? "",
    lastMessageSentAt: asIso(row.last_message_sent_at),
    nextSendAt: asIso(row.next_send_at),
  }));
};
