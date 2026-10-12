import { toErrorResponse } from "@/lib/api-error";
import { jsonResponse } from "@/lib/http";
import { bulkIngest } from "@/lib/n8n-client";
import { parseBody, readJson } from "@/lib/read-json";
import { bulkIngestRequestSchema } from "@/lib/schemas";

export const POST = async (request: Request): Promise<Response> => {
  try {
    const json = await readJson(request);
    const payload = parseBody(bulkIngestRequestSchema, json);
    const result = await bulkIngest(payload);
    return jsonResponse(result, 202);
  } catch (error) {
    return toErrorResponse(error);
  }
};
