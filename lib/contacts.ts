import type { AppDatabase } from "@/lib/db";
import { fieldByNormalizedName } from "@/lib/bulk-contacts";

export interface ContactInput {
  email: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
}

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

export const contactFromFields = (
  email: string,
  fields: Record<string, string>,
  displayName?: string | null,
): ContactInput => {
  const firstName = fieldByNormalizedName(fields, "firstName");
  const lastName = fieldByNormalizedName(fields, "lastName");
  const company = fieldByNormalizedName(fields, "company");
  const combined = [firstName, lastName].filter((part) => part.length > 0).join(" ");
  return {
    email: email.trim().toLowerCase(),
    displayName: blankToNull(displayName) ?? (combined.length > 0 ? combined : null),
    firstName: firstName || null,
    lastName: lastName || null,
    company: company || null,
  };
};

export const upsertContact = async (db: AppDatabase, input: ContactInput, touchedAt: string): Promise<string> => {
  const email = input.email.trim().toLowerCase();
  const row = await db
    .prepare(
      `INSERT INTO contacts (
         id, email, display_name, first_name, last_name, company, created_at, updated_at, last_outbound_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         display_name = COALESCE(NULLIF(excluded.display_name, ''), contacts.display_name),
         first_name = COALESCE(NULLIF(excluded.first_name, ''), contacts.first_name),
         last_name = COALESCE(NULLIF(excluded.last_name, ''), contacts.last_name),
         company = COALESCE(NULLIF(excluded.company, ''), contacts.company),
         updated_at = excluded.updated_at,
         last_outbound_at = excluded.last_outbound_at
       RETURNING id`,
    )
    .get(
      crypto.randomUUID(),
      email,
      blankToNull(input.displayName),
      blankToNull(input.firstName),
      blankToNull(input.lastName),
      blankToNull(input.company),
      touchedAt,
      touchedAt,
      touchedAt,
    );

  const id = (row as { id?: string } | null)?.id;
  if (!id) {
    throw new Error("Contact could not be saved.");
  }
  return String(id);
};

export const suppressedEmails = async (db: AppDatabase, emails: string[]): Promise<Set<string>> => {
  const normalized = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter((email) => email.length > 0))];
  if (normalized.length === 0) {
    return new Set();
  }

  const placeholders = normalized.map(() => "?").join(", ");
  const rows = (await db
    .prepare(`SELECT email FROM suppressions WHERE released_at IS NULL AND email IN (${placeholders})`)
    .all(...normalized)) as Array<{ email: string }>;
  return new Set(rows.map((row) => row.email));
};

export const isSuppressed = async (db: AppDatabase, email: string): Promise<boolean> => {
  const blocked = await suppressedEmails(db, [email]);
  return blocked.has(email.trim().toLowerCase());
};
