import Papa from "papaparse";

import { MAX_CSV_BYTES, MAX_CSV_ROWS } from "@/lib/constants";

export interface CsvParseSuccess {
  ok: true;
  headers: string[];
  rows: Array<Record<string, string>>;
  warnings: string[];
}

export interface CsvParseFailure {
  ok: false;
  message: string;
}

export type CsvParseResult = CsvParseSuccess | CsvParseFailure;

const isCsvFile = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel"
  );
};

export const parseCsvFile = (file: File): Promise<CsvParseResult> => {
  if (!isCsvFile(file)) {
    return Promise.resolve({
      ok: false,
      message: "Upload a .csv file.",
    });
  }

  if (file.size > MAX_CSV_BYTES) {
    return Promise.resolve({
      ok: false,
      message: "This file is larger than 2 MB. Split the list and try again.",
    });
  }

  if (file.size === 0) {
    return Promise.resolve({
      ok: false,
      message: "The CSV file is empty.",
    });
  }

  return new Promise((resolve) => {
    const headerCounts = new Map<string, { label: string; count: number }>();

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => {
        const trimmed = header.trim();
        const key = trimmed.toLowerCase();
        const existing = headerCounts.get(key);
        if (!existing) {
          headerCounts.set(key, { label: trimmed || key, count: 1 });
          return trimmed;
        }
        existing.count += 1;
        return `${trimmed}__duplicate_${existing.count}`;
      },
      complete: (results) => {
        const duplicate = [...headerCounts.values()].find((entry) => entry.count > 1);
        if (duplicate) {
          resolve({
            ok: false,
            message: `The column "${duplicate.label}" appears more than once.`,
          });
          return;
        }

        const headers = (results.meta.fields ?? []).map((header) => header.trim());
        if (headers.length === 0 || headers.every((header) => header.length === 0)) {
          resolve({ ok: false, message: "The CSV needs a header row." });
          return;
        }

        const seen = new Set<string>();
        for (const header of headers) {
          if (!header) {
            resolve({ ok: false, message: "Every column needs a header." });
            return;
          }
          const key = header.toLowerCase();
          if (seen.has(key)) {
            resolve({
              ok: false,
              message: `The column "${header}" appears more than once.`,
            });
            return;
          }
          seen.add(key);
        }

        const rows = results.data
          .map((row) => {
            const normalized: Record<string, string> = {};
            for (const header of headers) {
              const value = row[header];
              normalized[header] = value == null ? "" : String(value).trim();
            }
            return normalized;
          })
          .filter((row) => Object.values(row).some((value) => value.length > 0));

        if (rows.length === 0) {
          resolve({ ok: false, message: "The CSV has no contacts." });
          return;
        }

        if (rows.length > MAX_CSV_ROWS) {
          resolve({
            ok: false,
            message: `This file has ${rows.length} contacts. The limit is ${MAX_CSV_ROWS} rows.`,
          });
          return;
        }

        const fatal = results.errors.find((error) => error.type === "Quotes");
        const warnings = fatal ? [`Some rows may be incomplete: ${fatal.message}`] : [];

        resolve({ ok: true, headers, rows, warnings });
      },
      error: (error: Error) => {
        resolve({
          ok: false,
          message: error.message || "The CSV could not be parsed.",
        });
      },
    });
  });
};

export const slugifyHeader = (header: string): string => {
  const slug = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "field_$1");

  return slug || "field";
};

export const uniqueSlug = (header: string, used: Set<string>): string => {
  const base = slugifyHeader(header);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) {
    suffix += 1;
  }

  const next = `${base}_${suffix}`;
  used.add(next);
  return next;
};
