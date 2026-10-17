import { toErrorResponse } from "@/lib/api-error";
import { pauseCampaign } from "@/lib/campaigns";
import { jsonResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

export const POST = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    return jsonResponse({ ok: true, campaign: await pauseCampaign(campaignId) });
  } catch (error) {
    return toErrorResponse(error);
  }
};
