import { toErrorResponse } from "@/lib/api-error";
import { getCampaignBatch } from "@/lib/campaign-batches";
import { jsonResponse } from "@/lib/http";

type BatchRouteContext = {
  params: Promise<{ batchId: string }>;
};

export const GET = async (_request: Request, context: BatchRouteContext): Promise<Response> => {
  try {
    const { batchId } = await context.params;
    return jsonResponse({ ok: true, ...(await getCampaignBatch(batchId)) });
  } catch (error) {
    return toErrorResponse(error);
  }
};
