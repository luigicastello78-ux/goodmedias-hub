import { toErrorResponse } from "@/lib/api-error";
import { processDueQueue } from "@/lib/campaign-sequence";
import { jsonResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

export const POST = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { campaignId } = await context.params;
    const processed = await processDueQueue();
    return jsonResponse({ ok: true, campaignId, processed });
  } catch (error) {
    return toErrorResponse(error);
  }
};
