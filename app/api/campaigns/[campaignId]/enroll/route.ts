import { toErrorResponse } from "@/lib/api-error";
import { enrollMany, listEnrolled } from "@/lib/campaign-enrollment";
import { enrollSchema } from "@/lib/campaign-schema";
import { getCampaign } from "@/lib/campaigns";
import { currentUserId } from "@/lib/current-user";
import { createDistribution } from "@/lib/distribution";
import { jsonResponse } from "@/lib/http";
import { parseBody, readJson } from "@/lib/read-json";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

export const GET = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    await getCampaign(campaignId);
    return jsonResponse({ ok: true, contacts: await listEnrolled(campaignId) });
  } catch (error) {
    return toErrorResponse(error);
  }
};

export const POST = async (request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    const payload = parseBody(enrollSchema, await readJson(request));
    const createdBy = await currentUserId();
    if (payload.distribution) {
      const distribution = await createDistribution({
        campaignId,
        createdBy,
        ...payload.distribution,
      });
      return jsonResponse({ ok: true, distribution });
    }
    const result = await enrollMany(campaignId, payload.people ?? [], createdBy);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
};
