import { describe, expect, it } from "vitest";

import { bulkSendRequestSchema } from "@/lib/bulk-schema";
import { manualSendRequestSchema } from "@/lib/schemas";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

const validRequest = () => ({
  jobId: JOB_ID,
  name: "October outreach",
  from: { email: "alex@goodmedias.com", name: "Alex" },
  emailColumn: "email",
  rows: [{ email: "sam@contoso.com", firstName: "Sam" }],
  drip: { intervalMinutes: 5 },
  template: { subject: "Hi {{firstName|there}}", bodyText: "Hello" },
});

describe("bulkSendRequestSchema", () => {
  it("applies drip defaults", () => {
    const parsed = bulkSendRequestSchema.parse(validRequest());
    expect(parsed.drip.jitterSeconds).toBe(45);
    expect(parsed.drip.preSendPauseSeconds).toEqual({ min: 4, max: 22 });
  });

  it("rejects an interval outside 0 to 1440", () => {
    expect(bulkSendRequestSchema.safeParse({ ...validRequest(), drip: { intervalMinutes: 0 } }).success).toBe(false);
    expect(bulkSendRequestSchema.safeParse({ ...validRequest(), drip: { intervalMinutes: 1441 } }).success).toBe(false);
    expect(bulkSendRequestSchema.safeParse({ ...validRequest(), drip: { intervalMinutes: 0.5 } }).success).toBe(true);
  });

  it("rejects a pause range whose minimum is above the maximum", () => {
    const result = bulkSendRequestSchema.safeParse({
      ...validRequest(),
      drip: { intervalMinutes: 5, preSendPauseSeconds: { min: 30, max: 4 } },
    });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues[0]?.message).toBe("Pause minimum cannot be greater than the maximum.");
  });

  it("rejects an unknown timezone", () => {
    const result = bulkSendRequestSchema.safeParse({
      ...validRequest(),
      sendWindow: { timezone: "Not/AZone", startHour: 9, endHour: 17, weekdaysOnly: true },
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 5000 contacts", () => {
    const rows = Array.from({ length: 5001 }, (_, index) => ({ email: `person${index}@contoso.com` }));
    const result = bulkSendRequestSchema.safeParse({ ...validRequest(), rows });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues[0]?.message).toContain("5000");
  });

  it("requires a template unless every contact has its own copy", () => {
    const missing = bulkSendRequestSchema.safeParse({
      ...validRequest(),
      template: { subject: "", bodyText: "" },
    });
    expect(missing.success).toBe(false);

    const perContact = bulkSendRequestSchema.safeParse({
      ...validRequest(),
      template: { subject: "", bodyText: "" },
      rows: [{ email: "sam@contoso.com", subject: "Hello", bodyText: "There" }],
    });
    expect(perContact.success).toBe(true);
  });
});

describe("manualSendRequestSchema", () => {
  const manual = {
    idempotencyKey: JOB_ID,
    requestedAt: "2026-10-17T10:00:00.000Z",
    from: { email: "alex@goodmedias.com" },
    to: { email: "sam@contoso.com" },
    subject: "Hello",
    bodyText: "Hi Sam",
    thread: {},
  };

  it("still rejects unresolved tokens", () => {
    const result = manualSendRequestSchema.safeParse({ ...manual, bodyText: "Hi {{firstName}}" });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues[0]?.message).toContain("unused tokens");
  });

  it("accepts final text", () => {
    expect(manualSendRequestSchema.safeParse(manual).success).toBe(true);
  });
});
