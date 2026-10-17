import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

const readText = async (response: Response): Promise<string> => {
  const text = await response.text();
  return text.slice(0, 300);
};

export const GET = async (): Promise<Response> => {
  await cookies();
  const postgresUrl = process.env.DATABASE_URL?.trim();
  const functionUrl = process.env.NEON_FUNCTION_HELLO_BASE_URL?.trim();
  const gatewayBase = process.env.NEON_AI_GATEWAY_BASE_URL?.trim();
  const gatewayToken = process.env.NEON_AI_GATEWAY_TOKEN?.trim();

  const postgres = postgresUrl
    ? await (async () => {
        const db = await getDb();
        const row = (await db
          .prepare("SELECT current_database() AS database_name, COUNT(*) AS jobs FROM bulk_jobs")
          .get()) as { database_name: string; jobs: number | string };
        return {
          ok: true,
          database: row.database_name,
          bulkJobs: Number(row.jobs),
        };
      })()
    : { ok: false, error: "DATABASE_URL is not set." };

  const hello = functionUrl
    ? await (async () => {
        const response = await fetch(functionUrl);
        return { ok: response.ok, status: response.status, body: await readText(response) };
      })()
    : { ok: false, error: "NEON_FUNCTION_HELLO_BASE_URL is not set." };

  const aiGateway = gatewayBase && gatewayToken
    ? await (async () => {
        const response = await fetch(`${gatewayBase}/v1/models`, {
          headers: { Authorization: `Bearer ${gatewayToken}` },
        });
        return { ok: response.ok, status: response.status, body: await readText(response) };
      })()
    : { ok: false, error: "Neon AI Gateway environment variables are not set." };

  return jsonResponse({
    ok: postgres.ok === true && hello.ok === true,
    postgres,
    function: hello,
    aiGateway,
  });
};
