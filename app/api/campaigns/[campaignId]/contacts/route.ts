import { toErrorResponse } from "@/lib/api-error";
import { listEnrolled } from "@/lib/campaign-enrollment";
import { jsonResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

export const GET = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    return jsonResponse({ ok: true, contacts: await listEnrolled(campaignId) });
  } catch (error) {
    return toErrorResponse(error);
  }
};
