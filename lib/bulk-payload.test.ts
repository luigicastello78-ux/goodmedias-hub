import { describe, expect, it } from "vitest";

import { buildBulkPayload } from "@/lib/bulk-payload";

const base = {
  jobId: "11111111-1111-4111-8111-111111111111",
  fromEmail: "alex@goodmedias.com",
  fromName: "Alex",
  subject: "Quick question, {{firstName|there}}",
  bodyText: "Hi {{firstName|there}},",
  bodyHtml: "<p>Hi {{firstName|there}},</p>",
  cc: "",
  bcc: "",
  intervalMinutes: 5,
  jitterSeconds: 45,
  pauseMin: 4,
  pauseMax: 22,
  contacts: [
    {
      email: "sam@contoso.com",
      fields: { firstName: "Sam", lastName: "Lee", company: "Contoso" },
    },
  ],
};

describe("buildBulkPayload", () => {
  it("matches the n8n bulk contract and applies drip defaults", () => {
    expect(
      buildBulkPayload({
        ...base,
        sendWindow: {
          timezone: "Europe/Skopje",
          startHour: 9,
          endHour: 17,
          weekdaysOnly: true,
        },
      }),
    ).toEqual({
      jobId: "11111111-1111-4111-8111-111111111111",
      from: { email: "alex@goodmedias.com", name: "Alex" },
      drip: {
        intervalMinutes: 5,
        jitterSeconds: 45,
        preSendPauseSeconds: { min: 4, max: 22 },
      },
      sendWindow: {
        timezone: "Europe/Skopje",
        startHour: 9,
        endHour: 17,
        weekdaysOnly: true,
      },
      template: {
        subject: "Quick question, {{firstName|there}}",
        bodyText: "Hi {{firstName|there}},",
        bodyHtml: "<p>Hi {{firstName|there}},</p>",
      },
      cc: "",
      bcc: "",
      contacts: [
        { email: "sam@contoso.com", firstName: "Sam", lastName: "Lee", company: "Contoso" },
      ],
    });
  });

  it("omits the send window when it is disabled", () => {
    const payload = buildBulkPayload({ ...base, fromName: null, bodyHtml: null, sendWindow: null });
    expect(payload.sendWindow).toBeUndefined();
    expect(payload.template.bodyHtml).toBeUndefined();
    expect(payload.from).toEqual({ email: "alex@goodmedias.com" });
  });
});
