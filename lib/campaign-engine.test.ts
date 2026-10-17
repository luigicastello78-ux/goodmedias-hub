import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveCampaign, pauseCampaign, resumeCampaign } from "@/lib/campaigns";
import { enrollPerson } from "@/lib/campaign-enrollment";
import { processDueQueue } from "@/lib/campaign-sequence";
import { createDistribution, processDripDistributions } from "@/lib/distribution";
import { closeDatabase, getDb } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { listOutboundMessages } from "@/lib/outbound-messages";

let tempDir = "";

const draft = {
  name: "Follow up",
  description: "",
  senderEmail: "alex@goodmedias.com",
  senderName: "Alex",
  mergeTagFallbacks: { first_name: "there" },
  steps: [
    { itemType: "message" as const, delayDays: 0, delayHours: 0, delayMinutes: 0, subject: "Hi [first_name|there]", bodyText: "Hello [first_name]", bodyHtml: "" },
    { itemType: "delay" as const, delayDays: 1, delayHours: 0, delayMinutes: 0, subject: "", bodyText: "", bodyHtml: "" },
    { itemType: "message" as const, delayDays: 0, delayHours: 0, delayMinutes: 0, subject: "Checking in", bodyText: "Second note", bodyHtml: "" },
  ],
};

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "goodmedias-campaigns-"));
  process.env.N8N_MODE = "fixture";
  process.env.BULK_DB_PATH = path.join(tempDir, "campaigns.sqlite");
  resetEnvCache();
  await closeDatabase();
});

afterEach(async () => {
  await closeDatabase();
  resetEnvCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const activate = async (id: string): Promise<void> => {
  const { activateCampaign } = await import("@/lib/campaign-enrollment");
  await activateCampaign(id, null);
};

describe("campaign sequence", () => {
  it("posts the first email through the send webhook and queues the follow-up", async () => {
    const campaign = await saveCampaign(draft, null);
    await activate(campaign.id);
    await enrollPerson(campaign.id, { email: "sam@contoso.com", firstName: "Sam" }, null);

    const sent = await listOutboundMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.providerMessageId).toContain("@fixture.goodmedias");
    expect(sent[0]?.subject).toBe("Hi Sam");

    const db = await getDb();
    const queued = (await db
      .prepare("SELECT status, subject, scheduled_for FROM message_queue WHERE campaign_id = ? ORDER BY scheduled_for ASC")
      .all(campaign.id)) as Array<{ status: string; subject: string; scheduled_for: string }>;
    expect(queued.map((row) => row.status)).toEqual(["sent", "pending"]);
    expect(queued[1]?.subject).toBe("Checking in");
    expect(new Date(queued[1]?.scheduled_for ?? 0).getTime()).toBeGreaterThan(Date.now() + 60_000);

    await processDueQueue();
    expect(await listOutboundMessages()).toHaveLength(1);
  });

  it("refuses a suppressed address", async () => {
    const campaign = await saveCampaign({ ...draft, steps: [draft.steps[0]] }, null);
    await activate(campaign.id);
    const db = await getDb();
    await db
      .prepare("INSERT INTO suppressions (id, email, reason, source, created_at) VALUES (?, 'sam@contoso.com', 'manual', 'test', ?)")
      .run("66666666-6666-4666-8666-666666666666", new Date().toISOString());

    await expect(enrollPerson(campaign.id, { email: "sam@contoso.com" }, null)).rejects.toThrow(/suppressed/i);
    expect(await listOutboundMessages()).toHaveLength(0);
  });

  it("shifts a queued follow-up when the campaign resumes", async () => {
    const campaign = await saveCampaign(draft, null);
    await activate(campaign.id);
    await enrollPerson(campaign.id, { email: "sam@contoso.com", firstName: "Sam" }, null);
    const db = await getDb();
    const before = (await db
      .prepare("SELECT scheduled_for FROM message_queue WHERE campaign_id = ? AND status = 'pending'")
      .get(campaign.id)) as { scheduled_for: string };
    await pauseCampaign(campaign.id);
    const pausedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await db.prepare("UPDATE campaigns SET paused_at = ? WHERE id = ?").run(pausedAt, campaign.id);
    await resumeCampaign(campaign.id);
    const after = (await db
      .prepare("SELECT scheduled_for FROM message_queue WHERE campaign_id = ? AND status = 'pending'")
      .get(campaign.id)) as { scheduled_for: string };
    const shift = new Date(after.scheduled_for).getTime() - new Date(before.scheduled_for).getTime();
    expect(shift).toBeGreaterThan(60 * 60 * 1000);
  });

  it("releases one drip contact per tick and does not enroll the rest early", async () => {
    const campaign = await saveCampaign({ ...draft, steps: [draft.steps[0]] }, null);
    await activate(campaign.id);
    await createDistribution({
      campaignId: campaign.id,
      name: "October",
      executionType: "drip",
      contacts: [
        { email: "one@contoso.com", firstName: "One" },
        { email: "two@contoso.com", firstName: "Two" },
      ],
      dripContactsPerBatch: 1,
      dripIntervalMinutes: 30,
      sendWindowEnabled: false,
      sendWindowDays: [1, 2, 3, 4, 5],
      sendWindowStartHour: 9,
      sendWindowEndHour: 17,
      sendWindowTimezone: "UTC",
      createdBy: null,
    });

    expect(await listOutboundMessages()).toHaveLength(1);
    expect(await processDripDistributions()).toBe(0);
    expect(await listOutboundMessages()).toHaveLength(1);

    const db = await getDb();
    await db
      .prepare("UPDATE batch_distributions SET last_drip_sent_at = ? WHERE campaign_id = ?")
      .run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), campaign.id);
    expect(await processDripDistributions()).toBe(1);
    const sent = await listOutboundMessages();
    expect(sent).toHaveLength(2);
    expect(new Set(sent.map((message) => message.toEmail)).size).toBe(2);
  });
});
