import "server-only";

import { connection, NextResponse } from "next/server";

export const jsonResponse = async <T>(body: T, status = 200): Promise<NextResponse<T>> => {
  await connection();
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
};
