import { toErrorResponse } from "@/lib/api-error";
import { listCampaigns, saveCampaign } from "@/lib/campaigns";
import { campaignDraftSchema } from "@/lib/campaign-schema";
import { currentUserId } from "@/lib/current-user";
import { jsonResponse } from "@/lib/http";
import { parseBody, readJson } from "@/lib/read-json";

export const GET = async (): Promise<Response> => {
  try {
    return jsonResponse({ ok: true, campaigns: await listCampaigns() });
  } catch (error) {
    return toErrorResponse(error);
  }
};

export const POST = async (request: Request): Promise<Response> => {
  try {
    const payload = parseBody(campaignDraftSchema, await readJson(request));
    const campaign = await saveCampaign(payload, await currentUserId());
    return jsonResponse({ ok: true, campaign }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
};
