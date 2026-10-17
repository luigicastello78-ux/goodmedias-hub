import { toErrorResponse } from "@/lib/api-error";
import { activateCampaign } from "@/lib/campaign-enrollment";
import { getCampaign } from "@/lib/campaigns";
import { currentUserId } from "@/lib/current-user";
import { jsonResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

export const POST = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    await activateCampaign(campaignId, await currentUserId());
    return jsonResponse({ ok: true, campaign: await getCampaign(campaignId) });
  } catch (error) {
    return toErrorResponse(error);
  }
};
