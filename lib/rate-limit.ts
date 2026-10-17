import "server-only";

import { ApiError } from "@/lib/api-error";

const buckets = new Map<string, number[]>();

export const resetRateLimits = (): void => {
  buckets.clear();
};

export const clientIp = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return "local";
};

export const assertRateLimit = (key: string, limit: number, windowMs: number): void => {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many bulk send requests. Wait a few minutes and try again.",
      true,
    );
  }
  recent.push(now);
  buckets.set(key, recent);
};
