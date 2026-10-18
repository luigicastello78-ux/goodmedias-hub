import { toErrorResponse } from "@/lib/api-error";
import { processDueQueue } from "@/lib/campaign-sequence";
import { processDripDistributions } from "@/lib/distribution";
import { jsonResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

export const POST = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    const released = await processDripDistributions(campaignId);
    const processed = await processDueQueue(new Date(), campaignId);
    return jsonResponse({ ok: true, campaignId, processed, released });
  } catch (error) {
    return toErrorResponse(error);
  }
};
