import "server-only";

import { ApiError } from "@/lib/api-error";
import { savePerson, type PersonFields } from "@/lib/campaign-enrollment";
import { getDb } from "@/lib/db";
import { asIso } from "@/lib/stored-json";
import type { ContactStatus, Person } from "@/types/campaigns";

interface PersonRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  company: string | null;
  phone: string | null;
  job_title: string | null;
  status: ContactStatus;
  source: string | null;
  notes: string | null;
  created_at: unknown;
}

const toPerson = (row: PersonRow): Person => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  displayName: row.display_name,
  company: row.company,
  phone: row.phone,
  jobTitle: row.job_title,
  status: row.status,
  source: row.source,
  notes: row.notes,
  createdAt: asIso(row.created_at) ?? "",
});

export const listPeople = async (query: string): Promise<Person[]> => {
  const term = query.trim().toLowerCase().replace(/[\\%_]/g, "\\$&");
  const db = await getDb();
  const rows = (
    term.length === 0
      ? await db.prepare("SELECT * FROM contacts ORDER BY created_at DESC LIMIT 200").all()
      : await db
          .prepare(
            `SELECT * FROM contacts
             WHERE email LIKE ? ESCAPE '\\' OR lower(coalesce(first_name, '')) LIKE ? ESCAPE '\\'
                OR lower(coalesce(last_name, '')) LIKE ? ESCAPE '\\' OR lower(coalesce(company, '')) LIKE ? ESCAPE '\\'
             ORDER BY created_at DESC LIMIT 200`,
          )
          .all(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`)
  ) as PersonRow[];
  return rows.map(toPerson);
};

export const getPerson = async (id: string): Promise<Person> => {
  const row = (await (await getDb()).prepare("SELECT * FROM contacts WHERE id = ?").get(id)) as PersonRow | null;
  if (!row) {
    throw new ApiError(404, "VALIDATION", "Contact not found.", false);
  }
  return toPerson(row);
};

const isUniqueEmail = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return true;
    }
  }
  return error instanceof Error && /unique|primary key/i.test(error.message);
};

export const createPerson = async (fields: PersonFields): Promise<Person> => {
  const existing = await (
    await getDb()
  )
    .prepare("SELECT id FROM contacts WHERE email = ?")
    .get(fields.email.trim().toLowerCase());
  if (existing) {
    throw new ApiError(409, "VALIDATION", "A contact with this email already exists.", false);
  }
  const id = await savePerson(fields);
  return getPerson(id);
};

export const updatePerson = async (id: string, fields: PersonFields): Promise<Person> => {
  const db = await getDb();
  const existing = await db.prepare("SELECT id FROM contacts WHERE id = ?").get(id);
  if (!existing) {
    throw new ApiError(404, "VALIDATION", "Contact not found.", false);
  }
  const now = new Date().toISOString();
  const display = [fields.firstName, fields.lastName].filter((part) => part && part.trim().length > 0).join(" ");
  try {
    await db
      .prepare(
        `UPDATE contacts
         SET email = ?, first_name = ?, last_name = ?, display_name = ?, company = ?, phone = ?,
             job_title = ?, status = ?, source = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
      fields.email.trim().toLowerCase(),
      fields.firstName?.trim() || null,
      fields.lastName?.trim() || null,
      display || null,
      fields.company?.trim() || null,
      fields.phone?.trim() || null,
      fields.jobTitle?.trim() || null,
      fields.status?.trim() || "active",
      fields.source?.trim() || null,
      fields.notes?.trim() || null,
        now,
        id,
      );
  } catch (error) {
    if (isUniqueEmail(error)) {
      throw new ApiError(409, "VALIDATION", "A contact with this email already exists.", false);
    }
    throw error;
  }
  return getPerson(id);
};
