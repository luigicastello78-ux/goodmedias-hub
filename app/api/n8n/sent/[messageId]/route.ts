import { toErrorResponse } from "@/lib/api-error";
import { jsonResponse } from "@/lib/http";
import { getOutboundMessage, listContactActivity } from "@/lib/outbound-messages";

type SentRouteContext = {
  params: Promise<{ messageId: string }>;
};

export const GET = async (_request: Request, context: SentRouteContext): Promise<Response> => {
  try {
    const { messageId } = await context.params;
    const message = await getOutboundMessage(messageId);
    const activity = await listContactActivity(message.toEmail);
    return jsonResponse({ ok: true, message, activity });
  } catch (error) {
    return toErrorResponse(error);
  }
};
