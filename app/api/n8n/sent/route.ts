import { toErrorResponse } from "@/lib/api-error";
import { jsonResponse } from "@/lib/http";
import { listOutboundMessages } from "@/lib/outbound-messages";

export const GET = async (): Promise<Response> => {
  try {
    return jsonResponse({ ok: true, messages: await listOutboundMessages() });
  } catch (error) {
    return toErrorResponse(error);
  }
};
