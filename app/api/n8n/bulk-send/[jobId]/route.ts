import { ApiError, toErrorResponse } from "@/lib/api-error";
import { getBulkJob } from "@/lib/bulk-jobs";
import { jsonResponse } from "@/lib/http";
import type { BulkRecipientStatus } from "@/types/bulk-send";

type JobRouteContext = {
  params: Promise<{ jobId: string }>;
};

const RECIPIENT_STATUSES = new Set<BulkRecipientStatus>(["pending", "sent", "failed", "skipped", "unknown"]);

const readLimit = (value: string | null, fallback: number, max: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(0, Math.floor(parsed)));
};

export const GET = async (request: Request, context: JobRouteContext): Promise<Response> => {
  try {
    const { jobId } = await context.params;
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    if (statusParam && !RECIPIENT_STATUSES.has(statusParam as BulkRecipientStatus)) {
      throw new ApiError(400, "VALIDATION", "Recipient status filter is invalid.", false);
    }

    const detail = await getBulkJob(jobId, {
      status: statusParam ? (statusParam as BulkRecipientStatus) : undefined,
      limit: readLimit(url.searchParams.get("limit"), 50, 200) || 50,
      offset: readLimit(url.searchParams.get("offset"), 0, 100000),
    });
    return jsonResponse({ ok: true, ...detail });
  } catch (error) {
    return toErrorResponse(error);
  }
};
