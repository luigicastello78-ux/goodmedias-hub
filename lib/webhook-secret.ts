import { createHash, timingSafeEqual } from "node:crypto";

export const secretsMatch = (provided: string, expected: string): boolean => {
  if (!expected) {
    return false;
  }

  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
};
