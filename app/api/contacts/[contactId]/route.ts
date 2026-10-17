import { toErrorResponse } from "@/lib/api-error";
import { personSchema } from "@/lib/campaign-schema";
import { jsonResponse } from "@/lib/http";
import { getPerson, updatePerson } from "@/lib/people";
import { parseBody, readJson } from "@/lib/read-json";

interface RouteContext {
  params: Promise<{ contactId: string }>;
}

export const GET = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { contactId } = await context.params;
    return jsonResponse({ ok: true, contact: await getPerson(contactId) });
  } catch (error) {
    return toErrorResponse(error);
  }
};

export const PATCH = async (request: Request, context: RouteContext): Promise<Response> => {
  try {
    const { contactId } = await context.params;
    const payload = parseBody(personSchema, await readJson(request));
    return jsonResponse({ ok: true, contact: await updatePerson(contactId, payload) });
  } catch (error) {
    return toErrorResponse(error);
  }
};
