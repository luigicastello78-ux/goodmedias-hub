import { isEmail } from "@/lib/email";
import { uniqueSlug } from "@/lib/csv";
import { findTemplateIssues, isTokenName } from "@/lib/spintax";
import type { BulkContact } from "@/types/n8n";
import type { TokenBinding } from "@/types/campaign";

export interface ContactAnalysis {
  validCount: number;
  invalidRows: number[];
  duplicateRows: Array<{ email: string; rowNumber: number; index: number }>;
}

export const guessEmailColumn = (headers: string[]): string =>
  headers.find((header) => /e-?mail/i.test(header)) ?? "";

export const bindingsForHeaders = (
  headers: string[],
  emailColumn: string,
  previous: TokenBinding[] = [],
): TokenBinding[] => {
  const previousByColumn = new Map(previous.map((binding) => [binding.sourceColumn, binding.token]));
  const used = new Set<string>();
  const bindings: TokenBinding[] = [];

  for (const header of headers) {
    if (header === emailColumn) {
      continue;
    }

    const existing = previousByColumn.get(header);
    if (existing && isTokenName(existing) && !used.has(existing)) {
      used.add(existing);
      bindings.push({ sourceColumn: header, token: existing });
      continue;
    }

    bindings.push({ sourceColumn: header, token: uniqueSlug(header, used) });
  }

  return bindings;
};

export const getMappingError = (emailColumn: string, bindings: TokenBinding[]): string | null => {
  if (!emailColumn) {
    return "Choose the email column.";
  }

  const tokens = bindings.map((binding) => binding.token.trim());
  if (tokens.some((token) => !isTokenName(token))) {
    return "Tokens must start with a letter and use only letters, numbers, and underscores.";
  }

  if (new Set(tokens).size !== tokens.length) {
    return "Each token name must be unique.";
  }

  return null;
};

export const getTemplateError = (subject: string, body: string): string | null => {
  if (!subject.trim()) {
    return "Subject is required.";
  }
  if (!body.trim()) {
    return "Message body is required.";
  }
  return findTemplateIssues(subject) ?? findTemplateIssues(body);
};

export const analyzeRows = (
  rows: Array<Record<string, string>>,
  emailColumn: string,
): ContactAnalysis => {
  if (!emailColumn) {
    return { validCount: 0, invalidRows: [], duplicateRows: [] };
  }

  const seen = new Map<string, number>();
  const invalidRows: number[] = [];
  const duplicateRows: ContactAnalysis["duplicateRows"] = [];

  rows.forEach((row, index) => {
    const email = (row[emailColumn] ?? "").trim();
    if (!isEmail(email)) {
      invalidRows.push(index);
      return;
    }

    const key = email.toLowerCase();
    if (seen.has(key)) {
      duplicateRows.push({ email, rowNumber: index + 2, index });
      return;
    }

    seen.set(key, index);
  });

  return { validCount: seen.size, invalidRows, duplicateRows };
};

export const buildContacts = (
  rows: Array<Record<string, string>>,
  emailColumn: string,
  bindings: TokenBinding[],
): BulkContact[] => {
  const seen = new Set<string>();
  const contacts: BulkContact[] = [];

  for (const row of rows) {
    const email = (row[emailColumn] ?? "").trim();
    if (!isEmail(email)) {
      continue;
    }

    const key = email.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const fields: Record<string, string> = {};
    for (const binding of bindings) {
      fields[binding.token.trim()] = (row[binding.sourceColumn] ?? "").trim();
    }
    contacts.push({ email, fields });
  }

  return contacts;
};

export const duplicateRowIndexes = (
  rows: Array<Record<string, string>>,
  emailColumn: string,
): number[] => analyzeRows(rows, emailColumn).duplicateRows.map((row) => row.index);
