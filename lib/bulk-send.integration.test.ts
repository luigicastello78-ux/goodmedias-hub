import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDatabase } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { resetRateLimits } from "@/lib/rate-limit";
import { resetBulkSubmitFixtures } from "@/lib/bulk-n8n";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";

const requestBody = (jobId = JOB_ID) => ({
  jobId,
  name: "October outreach",
  from: { email: "alex@goodmedias.com", name: "Alex" },
  emailColumn: "email",
  rows: [
    { email: "sam@contoso.com", firstName: "Sam", company: "Contoso" },
    { email: "skip@contoso.com", firstName: "Skip" },
  ],
  drip: { intervalMinutes: 5 },
  sendWindow: { timezone: "Europe/Skopje", startHour: 9, endHour: 17, weekdaysOnly: true },
  template: {
    subject: "Quick question, {{firstName|there}}",
    bodyText: "Hi {{firstName|there}}",
    bodyHtml: "<p>Hi {{firstName|there}}</p>",
  },
  cc: "",
  bcc: "",
});

const acceptedBody = (jobId = JOB_ID) => ({
  ok: true,
  status: "accepted",
  jobId,
  total: 2,
  skippedCount: 1,
  skipped: [{ row: 2, email: "skip@contoso.com", reason: "Mailbox rejected." }],
  intervalMinutes: 5,
  jitterSeconds: 45,
  estimatedDurationMinutes: 6,
  estimatedFinishAt: "2026-10-17T12:00:00.000Z",
  executionId: "exec-1",
});

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let tempDir = "";

const postJson = async (url: string, body: unknown, headers?: HeadersInit): Promise<Response> => {
  const request = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (url.includes("bulk-progress")) {
    const progressRoute = await import("@/app/api/n8n/bulk-progress/route");
    return progressRoute.POST(request);
  }

  if (url.includes("/retry")) {
    const jobId = new URL(url).pathname.split("/").filter((part) => part !== "retry").pop() ?? "";
    const retryRoute = await import("@/app/api/n8n/bulk-send/[jobId]/retry/route");
    return retryRoute.POST(request, { params: Promise.resolve({ jobId }) });
  }

  const createRoute = await import("@/app/api/n8n/bulk-send/route");
  return createRoute.POST(request);
};

const getJob = async (jobId: string): Promise<Response> => {
  const route = await import("@/app/api/n8n/bulk-send/[jobId]/route");
  return route.GET(new Request(`http://localhost/api/n8n/bulk-send/${jobId}`), {
    params: Promise.resolve({ jobId }),
  });
};

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "goodmedias-bulk-"));
  process.env.N8N_MODE = "live";
  process.env.N8N_WEBHOOK_SECRET = "test-secret";
  process.env.N8N_BULK_SEND_URL = "https://n8n.example/webhook/goodmedias/bulk-send";
  process.env.BULK_DB_PATH = path.join(tempDir, "bulk.sqlite");
  resetEnvCache();
  closeDatabase();
  resetRateLimits();
  resetBulkSubmitFixtures();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  closeDatabase();
  resetEnvCache();
  vi.unstubAllGlobals();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("bulk send routes", () => {
  it("stores an accepted job and skipped recipients", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(acceptedBody(), 202));
    const response = await postJson("http://localhost/api/n8n/bulk-send", requestBody());
    expect(response.status).toBe(202);

    const payload = (await response.json()) as { job: { status: string; n8nExecutionId: string; estimatedFinishAt: string; skipped: number } };
    expect(payload.job.status).toBe("queued");
    expect(payload.job.n8nExecutionId).toBe("exec-1");
    expect(payload.job.estimatedFinishAt).toBe("2026-10-17T12:00:00.000Z");
    expect(payload.job.skipped).toBe(1);

    const detail = (await (await getJob(JOB_ID)).json()) as {
      recipients: Array<{ email: string; status: string; skipReason: string | null }>;
    };
    expect(detail.recipients.map((recipient) => [recipient.email, recipient.status, recipient.skipReason])).toEqual([
      ["sam@contoso.com", "pending", null],
      ["skip@contoso.com", "skipped", "Mailbox rejected."],
    ]);

    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as { jobId: string; drip: { jitterSeconds: number } };
    expect(body.jobId).toBe(JOB_ID);
    expect(body.drip.jitterSeconds).toBe(45);
    expect(new Headers(init?.headers).get("X-Webhook-Secret")).toBe("test-secret");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a duplicate response as the same job", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ok: true, status: "duplicate", jobId: JOB_ID, message: "Already accepted." }, 200),
    );
    const response = await postJson("http://localhost/api/n8n/bulk-send", requestBody());
    expect(response.status).toBe(202);
    const first = (await response.json()) as { job: { id: number; status: string } };
    expect(first.job.status).toBe("queued");

    const again = await postJson("http://localhost/api/n8n/bulk-send", requestBody());
    const second = (await again.json()) as { job: { id: number } };
    expect(second.job.id).toBe(first.job.id);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("marks a rejected job failed and returns the n8n error", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ok: false, status: "rejected", error: "Sender is not allowed." }, 400),
    );
    const response = await postJson("http://localhost/api/n8n/bulk-send", requestBody());
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { message: string } };
    expect(payload.error.message).toBe("Sender is not allowed.");

    const detail = (await (await getJob(JOB_ID)).json()) as { job: { status: string; error: string } };
    expect(detail.job.status).toBe("failed");
    expect(detail.job.error).toBe("Sender is not allowed.");
  });

  it("keeps the same job id when a timeout is retried", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    vi.mocked(fetch).mockRejectedValueOnce(timeout).mockResolvedValueOnce(jsonResponse(acceptedBody(), 202));

    const failed = await postJson("http://localhost/api/n8n/bulk-send", requestBody());
    expect(failed.status).toBe(504);
    const unknown = (await (await getJob(JOB_ID)).json()) as { job: { status: string; jobId: string } };
    expect(unknown.job.status).toBe("unknown");
    expect(unknown.job.jobId).toBe(JOB_ID);

    const retried = await postJson(`http://localhost/api/n8n/bulk-send/${JOB_ID}/retry`, {});
    expect(retried.status).toBe(202);
    const queued = (await retried.json()) as { job: { status: string; jobId: string } };
    expect(queued.job.status).toBe("queued");
    expect(queued.job.jobId).toBe(JOB_ID);

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0]?.[1]?.body)).jobId).toBe(JOB_ID);
    expect(JSON.parse(String(calls[1]?.[1]?.body)).jobId).toBe(JOB_ID);
  });

  it("does not post twice when the same job is submitted together", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(fetch).mockImplementation(async () => {
      await gate;
      return jsonResponse(acceptedBody(), 202);
    });

    const first = postJson("http://localhost/api/n8n/bulk-send", requestBody());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const second = await postJson("http://localhost/api/n8n/bulk-send", requestBody());
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(202);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects the progress callback when the secret is wrong", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(acceptedBody(), 202));
    await postJson("http://localhost/api/n8n/bulk-send", requestBody());

    const response = await postJson(
      "http://localhost/api/n8n/bulk-progress",
      {
        event: "email_result",
        jobId: JOB_ID,
        index: 1,
        total: 2,
        email: "sam@contoso.com",
        status: "sent",
        providerMessageId: "<one>",
        error: null,
        sentAt: "2026-10-17T10:00:00.000Z",
        nextSendInSeconds: 300,
      },
      { "X-Webhook-Secret": "wrong" },
    );
    expect(response.status).toBe(401);
    const detail = (await (await getJob(JOB_ID)).json()) as { recipients: Array<{ status: string }> };
    expect(detail.recipients[0]?.status).toBe("pending");
  });

  it("applies an email result once and reconciles a completed job", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(acceptedBody(OTHER_JOB_ID), 202));
    await postJson("http://localhost/api/n8n/bulk-send", requestBody(OTHER_JOB_ID));

    const event = {
      event: "email_result",
      jobId: OTHER_JOB_ID,
      index: 1,
      total: 2,
      email: "Sam@contoso.com",
      status: "sent",
      providerMessageId: "<one>",
      error: null,
      sentAt: "2026-10-17T10:00:00.000Z",
      nextSendInSeconds: 300,
    };
    const headers = { "X-Webhook-Secret": "test-secret" };
    expect((await postJson("http://localhost/api/n8n/bulk-progress", event, headers)).status).toBe(200);
    expect((await postJson("http://localhost/api/n8n/bulk-progress", { ...event, providerMessageId: "<two>" }, headers)).status).toBe(200);

    const afterResult = (await (await getJob(OTHER_JOB_ID)).json()) as {
      job: { status: string };
      recipients: Array<{ email: string; status: string; providerMessageId: string | null }>;
    };
    expect(afterResult.job.status).toBe("running");
    expect(afterResult.recipients[0]).toMatchObject({
      email: "sam@contoso.com",
      status: "sent",
      providerMessageId: "<one>",
    });

    const completed = await postJson(
      "http://localhost/api/n8n/bulk-progress",
      {
        event: "job_completed",
        jobId: OTHER_JOB_ID,
        total: 2,
        sent: 1,
        failed: 1,
        skipped: 1,
        failures: [{ index: 2, email: "skip@contoso.com", error: "Mailbox rejected." }],
        finishedAt: "2026-10-17T12:00:00.000Z",
      },
      headers,
    );
    expect(completed.status).toBe(200);
    expect((await postJson("http://localhost/api/n8n/bulk-progress", {
      event: "job_completed",
      jobId: OTHER_JOB_ID,
      total: 2,
      sent: 1,
      failed: 1,
      skipped: 1,
      failures: [{ index: 2, email: "skip@contoso.com", error: "Mailbox rejected." }],
      finishedAt: "2026-10-17T12:00:00.000Z",
    }, headers)).status).toBe(200);

    const detail = (await (await getJob(OTHER_JOB_ID)).json()) as {
      job: { status: string; sent: number; failed: number; skipped: number };
      counts: { unknown: number; sent: number; skipped: number };
      recipients: Array<{ email: string; status: string }>;
    };
    expect(detail.job.status).toBe("completed_with_errors");
    expect(detail.job.sent).toBe(1);
    expect(detail.job.failed).toBe(1);
    expect(detail.recipients.find((recipient) => recipient.email === "sam@contoso.com")?.status).toBe("sent");
    expect(detail.counts.unknown).toBe(0);

    const missing = await postJson(
      "http://localhost/api/n8n/bulk-progress",
      {
        event: "job_completed",
        jobId: "33333333-3333-4333-8333-333333333333",
        total: 1,
        sent: 1,
        failed: 0,
        skipped: 0,
        failures: [],
        finishedAt: "2026-10-17T12:00:00.000Z",
      },
      headers,
    );
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ ok: true });
  });

  it("marks recipients with no email result as unknown when the job completes", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ...acceptedBody(), skipped: [], skippedCount: 0 }, 202));
    await postJson("http://localhost/api/n8n/bulk-send", requestBody());
    const response = await postJson(
      "http://localhost/api/n8n/bulk-progress",
      {
        event: "job_completed",
        jobId: JOB_ID,
        total: 2,
        sent: 1,
        failed: 1,
        skipped: 0,
        failures: [{ email: "skip@contoso.com", error: "SMTP refused." }],
        finishedAt: "2026-10-17T12:30:00.000Z",
      },
      { "X-Webhook-Secret": "test-secret" },
    );
    expect(response.status).toBe(200);
    const detail = (await (await getJob(JOB_ID)).json()) as {
      counts: { unknown: number; failed: number };
      recipients: Array<{ email: string; status: string; error: string | null }>;
    };
    expect(detail.recipients.find((recipient) => recipient.email === "sam@contoso.com")?.status).toBe("unknown");
    expect(detail.recipients.find((recipient) => recipient.email === "skip@contoso.com")).toMatchObject({
      status: "failed",
      error: "SMTP refused.",
    });
    expect(detail.counts.unknown).toBe(1);
  });
});
