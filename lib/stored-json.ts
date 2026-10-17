export const parseStoredJson = (raw: unknown): unknown => {
  if (typeof raw !== "string") {
    return raw ?? null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

export const asIso = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
