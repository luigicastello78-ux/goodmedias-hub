import { ApiError, toErrorResponse } from "@/lib/api-error";
import { jsonResponse } from "@/lib/http";
import { getThread } from "@/lib/n8n-client";

type ThreadRouteContext = {
  params: Promise<{ threadId: string }>;
};

export const GET = async (_request: Request, context: ThreadRouteContext): Promise<Response> => {
  try {
    const { threadId } = await context.params;
    const decoded = decodeURIComponent(threadId).trim();
    if (!decoded || decoded.length > 200) {
      throw new ApiError(400, "VALIDATION", "Thread id is invalid.", false);
    }

    const result = await getThread(decoded);
    return jsonResponse(result);
  } catch (error) {
    return toErrorResponse(error);
  }
};
