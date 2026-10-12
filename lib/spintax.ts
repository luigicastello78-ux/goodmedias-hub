const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export const isTokenName = (value: string): boolean =>
  /^[a-zA-Z][a-zA-Z0-9_]*$/.test(value);

export const listTokens = (template: string): string[] => {
  const found = new Set<string>();
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const token = match[1];
    if (token) {
      found.add(token);
    }
  }
  return [...found];
};

export const findTemplateIssues = (template: string): string | null => {
  let depth = 0;
  let index = 0;

  while (index < template.length) {
    if (template.startsWith("{{", index)) {
      const close = template.indexOf("}}", index + 2);
      if (close === -1) {
        return "A token is missing its closing braces.";
      }
      const name = template.slice(index + 2, close).trim();
      if (!/^[a-zA-Z0-9_]+$/.test(name)) {
        return "Tokens use letters, numbers, and underscores.";
      }
      index = close + 2;
      continue;
    }

    const character = template[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth < 0) {
        return "A spintax block is missing its opening brace.";
      }
    }
    index += 1;
  }

  if (depth > 0) {
    return "A spintax block is missing its closing brace.";
  }

  return null;
};

export const replaceKnownTokens = (
  template: string,
  fields: Record<string, string>,
): { text: string; missing: string[] } => {
  const missing = new Set<string>();
  const text = template.replace(TOKEN_PATTERN, (match, token: string) => {
    if (!Object.prototype.hasOwnProperty.call(fields, token)) {
      missing.add(token);
      return match;
    }
    return fields[token] ?? "";
  });

  return { text, missing: [...missing] };
};

const findMatchingBrace = (source: string, openIndex: number): number => {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
};

const splitTopLevel = (source: string): string[] => {
  const options: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    } else if (character === "|" && depth === 0) {
      options.push(source.slice(start, index));
      start = index + 1;
    }
  }

  options.push(source.slice(start));
  return options;
};

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const expand = (source: string, random: () => number): string => {
  let result = "";

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "{") {
      result += source[index];
      continue;
    }

    const close = findMatchingBrace(source, index);
    if (close === -1) {
      result += source.slice(index);
      break;
    }

    const options = splitTopLevel(source.slice(index + 1, close));
    const pick = options[Math.floor(random() * options.length)] ?? "";
    result += expand(pick, random);
    index = close;
  }

  return result;
};

export const renderPreview = (
  template: string,
  fields: Record<string, string>,
  seed: number,
): string => {
  const withTokens = template.replace(TOKEN_PATTERN, (_, token: string) => fields[token] ?? "");
  return expand(withTokens, createRandom(seed));
};
