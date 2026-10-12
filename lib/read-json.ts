import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api-error";
import { MAX_JSON_BYTES } from "@/lib/constants";
import { firstIssueMessage } from "@/lib/schemas";

export const readJson = async (request: Request): Promise<unknown> => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) {
    throw new ApiError(413, "VALIDATION", "Payload is too large.", false);
  }

  if (!raw.trim()) {
    throw new ApiError(400, "VALIDATION", "Request body is empty.", false);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError(400, "VALIDATION", "Request body must be JSON.", false);
  }
};

export const parseBody = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION", firstIssueMessage(parsed.error), false);
  }
  return parsed.data;
};
