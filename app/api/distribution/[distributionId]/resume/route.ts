import { toErrorResponse } from "@/lib/api-error";
import { resumeDistribution } from "@/lib/distribution";
import { jsonResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ distributionId: string }>;
}

export const POST = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { distributionId } = await context.params;
    await resumeDistribution(distributionId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
};
