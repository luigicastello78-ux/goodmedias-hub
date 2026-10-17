import { describe, expect, it } from "vitest";

import { estimateBulkDuration } from "@/lib/bulk-estimate";

describe("estimateBulkDuration", () => {
  const now = new Date("2026-10-17T10:00:00.000Z");

  it("counts only the pause for a single email", () => {
    const estimate = estimateBulkDuration({
      contactCount: 1,
      intervalMinutes: 5,
      pauseMin: 4,
      pauseMax: 22,
      sendWindowEnabled: false,
      now,
    });
    expect(estimate.totalSeconds).toBe(13);
    expect(estimate.finishAt).toBe(new Date(now.getTime() + 13_000).toISOString());
    expect(estimate.windowMayExtend).toBe(false);
    expect(estimate.label).toContain("1 email");
  });

  it("adds the interval between emails and the average pause", () => {
    const estimate = estimateBulkDuration({
      contactCount: 28,
      intervalMinutes: 5,
      pauseMin: 4,
      pauseMax: 22,
      sendWindowEnabled: true,
      now,
    });
    expect(estimate.totalSeconds).toBe(27 * 5 * 60 + 28 * 13);
    expect(estimate.windowMayExtend).toBe(true);
    expect(estimate.label).toContain("28 emails");
    expect(estimate.label).toContain("2 hours 21 minutes");
  });
});
