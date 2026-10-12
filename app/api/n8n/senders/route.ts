import { toErrorResponse } from "@/lib/api-error";
import { jsonResponse } from "@/lib/http";
import { listSenders } from "@/lib/n8n-client";

export const GET = async (): Promise<Response> => {
  try {
    const result = await listSenders();
    return jsonResponse(result);
  } catch (error) {
    return toErrorResponse(error);
  }
};
