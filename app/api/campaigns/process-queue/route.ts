import { toErrorResponse } from "@/lib/api-error";
import { processDueQueue } from "@/lib/campaign-sequence";
import { getEnv } from "@/lib/env";
import { jsonResponse } from "@/lib/http";
import { secretsMatch } from "@/lib/webhook-secret";

export const POST = async (request: Request): Promise<Response> => {
  const provided = request.headers.get("x-webhook-secret") ?? "";
  if (!secretsMatch(provided, getEnv().N8N_WEBHOOK_SECRET)) {
    return jsonResponse({ ok: false }, 401);
  }

  try {
    const processed = await processDueQueue();
    return jsonResponse({ ok: true, processed });
  } catch (error) {
    return toErrorResponse(error);
  }
};
