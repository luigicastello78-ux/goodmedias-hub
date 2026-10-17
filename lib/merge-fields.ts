const MERGE_PATTERN = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g;

export interface MergeField {
  name: string;
  fallback: string | null;
}

export const normalizeMergeKey = (value: string): string =>
  value.toLowerCase().replace(/[\s_\-]+/g, "");

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const fieldMap = (fields: Record<string, string>): Map<string, string> => {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(fields)) {
    map.set(normalizeMergeKey(key), value);
  }
  return map;
};

export const listMergeFields = (template: string): MergeField[] => {
  const found: MergeField[] = [];
  const seen = new Set<string>();

  for (const match of template.matchAll(MERGE_PATTERN)) {
    const name = match[1]?.trim() ?? "";
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    const fallback = match[2];
    found.push({ name, fallback: fallback === undefined ? null : fallback });
  }

  return found;
};

export const renderMerge = (
  template: string,
  fields: Record<string, string>,
  options?: { html?: boolean },
): string => {
  const values = fieldMap(fields);

  return template.replace(MERGE_PATTERN, (_match, rawName: string, rawFallback?: string) => {
    const stored = values.get(normalizeMergeKey(rawName.trim()));
    const resolved = stored == null || stored.trim() === "" ? (rawFallback ?? "") : stored;
    return options?.html ? escapeHtml(resolved) : resolved;
  });
};

export const listMissingMergeFields = (templates: string[], fieldNames: string[]): string[] => {
  const available = new Set(fieldNames.map((name) => normalizeMergeKey(name)));
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const template of templates) {
    for (const field of listMergeFields(template)) {
      if (field.fallback !== null) {
        continue;
      }
      if (available.has(normalizeMergeKey(field.name)) || seen.has(field.name)) {
        continue;
      }
      seen.add(field.name);
      missing.push(field.name);
    }
  }

  return missing;
};
