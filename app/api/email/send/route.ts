import { toErrorResponse } from "@/lib/api-error";
import { sendDirectEmail, directSendRequestSchema } from "@/lib/cloudflare-email";
import { jsonResponse } from "@/lib/http";
import { parseBody, readJson } from "@/lib/read-json";

export const POST = async (request: Request): Promise<Response> => {
  try {
    const json = await readJson(request);
    const payload = parseBody(directSendRequestSchema, json);
    const result = await sendDirectEmail(payload);
    return jsonResponse(result);
  } catch (error) {
    return toErrorResponse(error);
  }
};
