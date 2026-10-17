import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAndQueueCampaign } from "@/lib/campaign-batches";
import { createAndSubmitBulkJob, getBulkJob } from "@/lib/bulk-jobs";
import { closeDatabase, getDb } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { sendAndRecordManual, listContactActivity, listOutboundMessages } from "@/lib/outbound-messages";
import { ApiError } from "@/lib/api-error";
import type { BulkIngestRequest, ManualSendRequest } from "@/types/n8n";

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const BATCH_ID = "33333333-3333-4333-8333-333333333333";

let tempDir = "";

const manual = (email = "sam@contoso.com"): ManualSendRequest => ({
  idempotencyKey: MESSAGE_ID,
  requestedAt: "2026-10-17T10:00:00.000Z",
  from: { email: "alex@goodmedias.com", name: "Alex" },
  to: { email, name: "Sam" },
  subject: "Hello",
  bodyText: "Hi Sam",
  thread: { threadId: "thread_demo", inReplyTo: "<prev@contoso.com>", references: ["<prev@contoso.com>"] },
});

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "goodmedias-ledger-"));
  process.env.N8N_MODE = "fixture";
  process.env.BULK_DB_PATH = path.join(tempDir, "ledger.sqlite");
  resetEnvCache();
  await closeDatabase();
});

afterEach(async () => {
  await closeDatabase();
  resetEnvCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("email ledger", () => {
  it("records a single send once and keeps the provider id", async () => {
    const first = await sendAndRecordManual(manual(), null);
    const second = await sendAndRecordManual(manual(), null);
    expect(second.providerMessageId).toBe(first.providerMessageId);
    expect(second.threadId).toBe(first.threadId);

    const messages = await listOutboundMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      status: "sent",
      toEmail: "sam@contoso.com",
      threadId: first.threadId,
      inReplyTo: "<prev@contoso.com>",
      providerMessageId: first.providerMessageId,
    });

    const activity = await listContactActivity("sam@contoso.com");
    expect(activity.some((item) => item.source === "single" && item.id === MESSAGE_ID)).toBe(true);
  });

  it("refuses a suppressed address before sending", async () => {
    const db = await getDb();
    await db
      .prepare(
        `INSERT INTO suppressions (id, email, reason, source, created_at)
         VALUES (?, 'sam@contoso.com', 'manual', 'test', ?)`,
      )
      .run("44444444-4444-4444-8444-444444444444", new Date().toISOString());

    await expect(sendAndRecordManual(manual(), null)).rejects.toBeInstanceOf(ApiError);
    expect(await listOutboundMessages()).toHaveLength(0);
  });

  it("stores a campaign batch and the rejected contacts", async () => {
    const request: BulkIngestRequest = {
      idempotencyKey: BATCH_ID,
      requestedAt: "2026-10-17T10:00:00.000Z",
      campaignName: "October",
      subjectTemplate: "Hi {{first_name}}",
      bodyTemplate: "Hello {{first_name}}",
      senderPool: ["alex@goodmedias.com"],
      schedule: {
        timezone: "Europe/Skopje",
        startAt: null,
        daysOfWeek: [1, 2, 3, 4, 5],
        startHour: 9,
        endHour: 17,
        minDelaySeconds: 45,
        maxDelaySeconds: 120,
        maxPerDay: 80,
      },
      contacts: [
        { email: "sam@contoso.com", fields: { first_name: "Sam" } },
        { email: "blocked@reject.test", fields: { first_name: "No" } },
      ],
    };

    const result = await createAndQueueCampaign(request, null);
    expect(result.status).toBe("queued");
    expect(result.acceptedCount).toBe(1);
    expect(result.rejected.map((item) => item.email)).toContain("blocked@reject.test");

    const again = await createAndQueueCampaign(request, null);
    expect(again.batchId).toBe(result.batchId);
  });

  it("skips a suppressed drip recipient and still queues the rest", async () => {
    const db = await getDb();
    await db
      .prepare(
        `INSERT INTO suppressions (id, email, reason, source, created_at)
         VALUES (?, 'skip@contoso.com', 'unsubscribe', 'test', ?)`,
      )
      .run("55555555-5555-4555-8555-555555555555", new Date().toISOString());

    const job = await createAndSubmitBulkJob(
      {
        jobId: JOB_ID,
        name: "Drip",
        from: { email: "alex@goodmedias.com" },
        emailColumn: "email",
        rows: [
          { email: "sam@contoso.com", firstName: "Sam" },
          { email: "skip@contoso.com", firstName: "Skip" },
        ],
        drip: { intervalMinutes: 5, jitterSeconds: 45, preSendPauseSeconds: { min: 4, max: 22 } },
        template: { subject: "Hi", bodyText: "Hello" },
        cc: "",
        bcc: "",
      },
      null,
    );

    expect(job.status).toBe("queued");
    expect(job.total).toBe(2);
    const detail = await getBulkJob(JOB_ID, { limit: 20, offset: 0 });
    expect(detail.recipients.find((recipient) => recipient.email === "skip@contoso.com")).toMatchObject({
      status: "skipped",
      skipReason: "Suppressed.",
    });
    expect(detail.recipients.find((recipient) => recipient.email === "sam@contoso.com")?.status).toBe("pending");
    const activity = await listContactActivity("sam@contoso.com");
    expect(activity.some((item) => item.source === "drip")).toBe(true);
  });
});
