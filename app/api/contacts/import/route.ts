import { toErrorResponse } from "@/lib/api-error";
import { importSchema } from "@/lib/campaign-schema";
import { savePerson } from "@/lib/campaign-enrollment";
import { jsonResponse } from "@/lib/http";
import { parseBody, readJson } from "@/lib/read-json";

export const POST = async (request: Request): Promise<Response> => {
  try {
    const payload = parseBody(importSchema, await readJson(request));
    let imported = 0;
    for (const contact of payload.contacts) {
      await savePerson({ ...contact, source: contact.source ?? "import" });
      imported += 1;
    }
    return jsonResponse({ ok: true, imported });
  } catch (error) {
    return toErrorResponse(error);
  }
};
