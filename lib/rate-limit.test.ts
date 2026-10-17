import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-error";
import { assertRateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("assertRateLimit", () => {
  it("blocks the request that exceeds the window", () => {
    resetRateLimits();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      assertRateLimit("bulk-create:local", 8, 60_000);
    }
    expect(() => assertRateLimit("bulk-create:local", 8, 60_000)).toThrow(ApiError);
  });
});
