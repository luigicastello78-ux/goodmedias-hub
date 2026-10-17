import { isEmail } from "@/lib/email";
import type { BulkPreparedContact } from "@/types/bulk-send";

export interface PreparedContacts {
  contacts: BulkPreparedContact[];
  invalidCount: number;
  duplicateCount: number;
}

export const fieldByNormalizedName = (row: Record<string, string>, name: string): string => {
  const target = name.toLowerCase().replace(/[\s_\-]+/g, "");
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase().replace(/[\s_\-]+/g, "") === target) {
      return value.trim();
    }
  }
  return "";
};

export const prepareBulkContacts = (
  rows: Array<Record<string, string>>,
  emailColumn: string,
): PreparedContacts => {
  const seen = new Set<string>();
  const contacts: BulkPreparedContact[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const row of rows) {
    const raw = (row[emailColumn] ?? "").trim();
    if (!isEmail(raw)) {
      invalidCount += 1;
      continue;
    }

    const email = raw.toLowerCase();
    if (seen.has(email)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(email);
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === emailColumn) {
        continue;
      }
      fields[key] = value;
    }
    contacts.push({ email, fields });
  }

  return { contacts, invalidCount, duplicateCount };
};
