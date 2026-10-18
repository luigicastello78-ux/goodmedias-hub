import { toErrorResponse } from "@/lib/api-error";
import { createPerson, deletePeople, listPeoplePaginated } from "@/lib/people";
import { personSchema } from "@/lib/campaign-schema";
import { jsonResponse } from "@/lib/http";
import { parseBody, readJson } from "@/lib/read-json";

export const GET = async (request: Request): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const status = url.searchParams.get("status") ?? "all";
    const tag = url.searchParams.get("tag") ?? "all";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(1000, Math.max(1, Number(url.searchParams.get("pageSize") ?? "100") || 100));
    const result = await listPeoplePaginated({ query, status, tag, page, pageSize });
    return jsonResponse({ ok: true, contacts: result.contacts, total: result.total, page, pageSize });
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

export const DELETE = async (request: Request): Promise<Response> => {
  try {
    const body = (await readJson(request)) as { ids?: string[] };
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonResponse({ ok: false, error: "ids array required" }, 400);
    }
    const deleted = await deletePeople(ids);
    return jsonResponse({ ok: true, deleted });
  } catch (error) {
    return toErrorResponse(error);
  }
};
