import { toErrorResponse } from "@/lib/api-error";
import { listCampaignBatches } from "@/lib/campaign-batches";
import { jsonResponse } from "@/lib/http";

export const GET = async (): Promise<Response> => {
  try {
    return jsonResponse({ ok: true, batches: await listCampaignBatches() });
  } catch (error) {
    return toErrorResponse(error);
  }
};
