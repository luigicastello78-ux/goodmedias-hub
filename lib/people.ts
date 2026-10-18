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
  tags: unknown;
  advertiser: string | null;
  job_board: string | null;
  industry: string | null;
  created_at: unknown;
}

const parseTags = (raw: unknown): string[] | null => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* ignore */
    }
  }
  return null;
};

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
  tags: parseTags(row.tags),
  advertiser: row.advertiser,
  jobBoard: row.job_board,
  industry: row.industry,
  createdAt: asIso(row.created_at) ?? "",
});

export interface ListPeopleOptions {
  query?: string;
  status?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPeopleResult {
  contacts: Person[];
  total: number;
}

export const listPeople = async (queryOrOptions: string | ListPeopleOptions = ""): Promise<Person[]> => {
  const opts = typeof queryOrOptions === "string" ? { query: queryOrOptions } : queryOrOptions;
  const result = await listPeoplePaginated(opts);
  return result.contacts;
};

export const listPeoplePaginated = async (opts: ListPeopleOptions = {}): Promise<ListPeopleResult> => {
  const term = (opts.query ?? "").trim().toLowerCase().replace(/[\\%_]/g, "\\$&");
  const status = opts.status && opts.status !== "all" ? opts.status : null;
  const tag = opts.tag && opts.tag !== "all" ? opts.tag : null;
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 200;
  const offset = (page - 1) * pageSize;
  const db = await getDb();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (term.length > 0) {
    conditions.push(
      `(email LIKE ? ESCAPE '\\' OR lower(coalesce(first_name, '')) LIKE ? ESCAPE '\\'
        OR lower(coalesce(last_name, '')) LIKE ? ESCAPE '\\' OR lower(coalesce(company, '')) LIKE ? ESCAPE '\\'
        OR lower(coalesce(phone, '')) LIKE ? ESCAPE '\\')`,
    );
    const pattern = `%${term}%`;
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  if (tag) {
    conditions.push("tags::text LIKE ?");
    params.push(`%"${tag}"%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = (await db.prepare(`SELECT count(*) as cnt FROM contacts ${where}`).get(...params)) as { cnt: number } | null;
  const total = countRow?.cnt ?? 0;

  const rows = (await db
    .prepare(`SELECT * FROM contacts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)) as PersonRow[];

  return { contacts: rows.map(toPerson), total };
};

export const deletePeople = async (ids: string[]): Promise<number> => {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`).run(...ids);
  return typeof result === "object" && result !== null && "changes" in result ? (result as { changes: number }).changes : ids.length;
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

export interface UpdatePersonFields extends PersonFields {
  tags?: string[] | null;
  advertiser?: string | null;
  jobBoard?: string | null;
  industry?: string | null;
}

export const updatePerson = async (id: string, fields: UpdatePersonFields): Promise<Person> => {
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
             job_title = ?, status = ?, source = ?, notes = ?, tags = ?,
             advertiser = ?, job_board = ?, industry = ?, updated_at = ?
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
        fields.tags ? JSON.stringify(fields.tags) : null,
        fields.advertiser?.trim() || null,
        fields.jobBoard?.trim() || null,
        fields.industry?.trim() || null,
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
