import { toErrorResponse } from "@/lib/api-error";
import { retryBulkJob } from "@/lib/bulk-jobs";
import { jsonResponse } from "@/lib/http";
import { assertRateLimit, clientIp } from "@/lib/rate-limit";

type RetryRouteContext = {
  params: Promise<{ jobId: string }>;
};

const RETRY_LIMIT = 30;
const RETRY_WINDOW_MS = 60 * 60 * 1000;

export const POST = async (request: Request, context: RetryRouteContext): Promise<Response> => {
  try {
    assertRateLimit(`bulk-retry:${clientIp(request)}`, RETRY_LIMIT, RETRY_WINDOW_MS);
    const { jobId } = await context.params;
    const job = await retryBulkJob(jobId);
    return jsonResponse({ ok: true, job }, job.status === "queued" ? 202 : 200);
  } catch (error) {
    return toErrorResponse(error);
  }
};
