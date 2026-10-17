import { toErrorResponse } from "@/lib/api-error";
import { jsonResponse } from "@/lib/http";
import { currentUserId } from "@/lib/current-user";
import { sendAndRecordManual } from "@/lib/outbound-messages";
import { parseBody, readJson } from "@/lib/read-json";
import { manualSendRequestSchema } from "@/lib/schemas";

export const POST = async (request: Request): Promise<Response> => {
  try {
    const json = await readJson(request);
    const payload = parseBody(manualSendRequestSchema, json);
    const result = await sendAndRecordManual(payload, await currentUserId());
    return jsonResponse(result);
  } catch (error) {
    return toErrorResponse(error);
  }
};
