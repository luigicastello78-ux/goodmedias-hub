import Papa from "papaparse";

import { MAX_CSV_BYTES, MAX_CSV_ROWS } from "@/lib/constants";

export interface CsvParseOptions {
  maxBytes?: number;
  maxRows?: number;
}

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

const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const formatMegabytes = (bytes: number): string => {
  const megabytes = bytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? String(megabytes) : megabytes.toFixed(1);
};

const finalizeCsv = (
  results: Papa.ParseResult<Record<string, string>>,
  headerCounts: Map<string, { label: string; count: number }>,
  maxRows: number,
): CsvParseResult => {
  const duplicate = [...headerCounts.values()].find((entry) => entry.count > 1);
  if (duplicate) {
    return {
      ok: false,
      message: `The column "${duplicate.label}" appears more than once.`,
    };
  }

  const headers = (results.meta.fields ?? []).map((header) => header.trim());
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    return { ok: false, message: "The CSV needs a header row." };
  }

  const seen = new Set<string>();
  for (const header of headers) {
    if (!header) {
      return { ok: false, message: "Every column needs a header." };
    }
    const key = header.toLowerCase();
    if (seen.has(key)) {
      return {
        ok: false,
        message: `The column "${header}" appears more than once.`,
      };
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
    return { ok: false, message: "The CSV has no contacts." };
  }

  if (rows.length > maxRows) {
    return {
      ok: false,
      message: `This file has ${rows.length} contacts. The limit is ${maxRows} rows.`,
    };
  }

  const fatal = results.errors.find((error) => error.type === "Quotes");
  const warnings = fatal ? [`Some rows may be incomplete: ${fatal.message}`] : [];
  return { ok: true, headers, rows, warnings };
};

export const parseCsvText = (text: string, options?: CsvParseOptions): CsvParseResult => {
  const maxBytes = options?.maxBytes ?? MAX_CSV_BYTES;
  const maxRows = options?.maxRows ?? MAX_CSV_ROWS;
  const stripped = text.replace(/^\uFEFF/, "");

  if (byteLength(stripped) > maxBytes) {
    return {
      ok: false,
      message: `This file is larger than ${formatMegabytes(maxBytes)} MB. Split the list and try again.`,
    };
  }

  if (!stripped.trim()) {
    return { ok: false, message: "The CSV file is empty." };
  }

  const headerCounts = new Map<string, { label: string; count: number }>();
  const results = Papa.parse<Record<string, string>>(stripped, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
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
  });

  return finalizeCsv(results, headerCounts, maxRows);
};

export const parseCsvFile = async (file: File): Promise<CsvParseResult> => {
  if (!isCsvFile(file)) {
    return {
      ok: false,
      message: "Upload a .csv file.",
    };
  }

  if (file.size > MAX_CSV_BYTES) {
    return {
      ok: false,
      message: "This file is larger than 2 MB. Split the list and try again.",
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      message: "The CSV file is empty.",
    };
  }

  const text = await file.text();
  return parseCsvText(text);
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
