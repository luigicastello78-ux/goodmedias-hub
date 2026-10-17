import { jsonResponse } from "@/lib/http";
import { applyBulkProgress } from "@/lib/bulk-jobs";
import { bulkProgressSchema } from "@/lib/bulk-schema";
import { getEnv } from "@/lib/env";
import { readJson } from "@/lib/read-json";
import { secretsMatch } from "@/lib/webhook-secret";

export const POST = async (request: Request): Promise<Response> => {
  const provided = request.headers.get("x-webhook-secret") ?? "";
  if (!secretsMatch(provided, getEnv().N8N_WEBHOOK_SECRET)) {
    console.info("bulk-progress rejected");
    return jsonResponse({ ok: false }, 401);
  }

  try {
    const json = await readJson(request);
    const parsed = bulkProgressSchema.safeParse(json);
    if (!parsed.success) {
      return jsonResponse({ ok: false }, 400);
    }
    await applyBulkProgress(parsed.data);
    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Progress update failed.";
    console.error(`bulk-progress failed: ${message}`);
    return jsonResponse({ ok: false }, 500);
  }
};
