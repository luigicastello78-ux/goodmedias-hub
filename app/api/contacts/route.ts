import { toErrorResponse } from "@/lib/api-error";
import { createPerson, listPeople } from "@/lib/people";
import { personSchema } from "@/lib/campaign-schema";
import { jsonResponse } from "@/lib/http";
import { parseBody, readJson } from "@/lib/read-json";

export const GET = async (request: Request): Promise<Response> => {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return jsonResponse({ ok: true, contacts: await listPeople(query) });
  } catch (error) {
    return toErrorResponse(error);
  }
};

export const POST = async (request: Request): Promise<Response> => {
  try {
    const payload = parseBody(personSchema, await readJson(request));
    const contact = await createPerson(payload);
    return jsonResponse({ ok: true, contact }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
};
