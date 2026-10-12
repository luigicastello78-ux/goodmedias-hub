import "server-only";

import { NextResponse } from "next/server";

export const jsonResponse = <T>(body: T, status = 200): NextResponse<T> =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
