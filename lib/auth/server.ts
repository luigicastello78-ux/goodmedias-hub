import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

type NeonAuthInstance = ReturnType<typeof createNeonAuth>;

let cached: NeonAuthInstance | null = null;

export const isAuthConfigured = (): boolean => {
  const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim();
  const secret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  return Boolean(baseUrl && secret && secret.length >= 32);
};

export const getAuth = (): NeonAuthInstance => {
  if (cached) {
    return cached;
  }

  const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim();
  const secret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!baseUrl || !secret) {
    throw new Error("NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required.");
  }
  if (secret.length < 32) {
    throw new Error("NEON_AUTH_COOKIE_SECRET must be at least 32 characters.");
  }

  cached = createNeonAuth({
    baseUrl,
    cookies: { secret },
  });
  return cached;
};
