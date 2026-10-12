import { ApiError, toErrorResponse } from "@/lib/api-error";
import { jsonResponse } from "@/lib/http";
import { listInbox } from "@/lib/n8n-client";
import { firstIssueMessage, inboxQuerySchema } from "@/lib/schemas";

export const GET = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const parsed = inboxQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION", firstIssueMessage(parsed.error), false);
    }

    const result = await listInbox(parsed.data);
    return jsonResponse(result);
  } catch (error) {
    return toErrorResponse(error);
  }
};
