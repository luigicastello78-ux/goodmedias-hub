import { toErrorResponse } from "@/lib/api-error";
import { jsonResponse } from "@/lib/http";
import { listOutboundMessagesPaginated } from "@/lib/outbound-messages";

export const GET = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25)));
    const offset = (page - 1) * pageSize;
    const { messages, total } = await listOutboundMessagesPaginated(pageSize, offset);
    return jsonResponse({ ok: true, messages, total, page, pageSize });
  } catch (error) {
    return toErrorResponse(error);
  }
};
