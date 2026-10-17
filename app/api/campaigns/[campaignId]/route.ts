import { toErrorResponse } from "@/lib/api-error";
import { archiveCampaign, getCampaign, saveCampaign } from "@/lib/campaigns";
import { campaignDraftSchema } from "@/lib/campaign-schema";
import { listDistributions } from "@/lib/distribution";
import { currentUserId } from "@/lib/current-user";
import { jsonResponse } from "@/lib/http";
import { parseBody, readJson } from "@/lib/read-json";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

export const GET = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    const campaign = await getCampaign(campaignId);
    return jsonResponse({ ok: true, campaign, distributions: await listDistributions(campaignId) });
  } catch (error) {
    return toErrorResponse(error);
  }
};

export const PATCH = async (request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    const payload = parseBody(campaignDraftSchema, await readJson(request));
    const campaign = await saveCampaign({ ...payload, id: campaignId }, await currentUserId());
    return jsonResponse({ ok: true, campaign });
  } catch (error) {
    return toErrorResponse(error);
  }
};

export const DELETE = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    await archiveCampaign(campaignId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
};
