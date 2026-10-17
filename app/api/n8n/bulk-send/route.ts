import { toErrorResponse } from "@/lib/api-error";
import { createAndSubmitBulkJob, listBulkJobs } from "@/lib/bulk-jobs";
import { currentUserId } from "@/lib/current-user";
import { bulkSendRequestSchema } from "@/lib/bulk-schema";
import { jsonResponse } from "@/lib/http";
import { parseBody, readJson } from "@/lib/read-json";
import { assertRateLimit, clientIp } from "@/lib/rate-limit";
import { BULK_MAX_JSON_BYTES } from "@/lib/constants";

const CREATE_LIMIT = 8;
const CREATE_WINDOW_MS = 10 * 60 * 1000;

export const GET = async (): Promise<Response> => {
  try {
    return jsonResponse({ ok: true, jobs: await listBulkJobs() });
  } catch (error) {
    return toErrorResponse(error);
  }
};

export const POST = async (request: Request): Promise<Response> => {
  try {
    assertRateLimit(`bulk-create:${clientIp(request)}`, CREATE_LIMIT, CREATE_WINDOW_MS);
    const json = await readJson(request, BULK_MAX_JSON_BYTES);
    const payload = parseBody(bulkSendRequestSchema, json);
    const job = await createAndSubmitBulkJob(payload, await currentUserId());
    const status = job.status === "queued" ? 202 : 200;
    return jsonResponse({ ok: true, job }, status);
  } catch (error) {
    return toErrorResponse(error);
  }
};
