import { NextResponse } from "next/server";

import { getAuth } from "@/lib/auth/server";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

const dispatch = async (request: Request, context: RouteContext): Promise<Response> => {
  try {
    const handlers = getAuth().handler();
    switch (request.method.toUpperCase()) {
      case "GET":
        return handlers.GET(request, context);
      case "POST":
        return handlers.POST(request, context);
      case "PUT":
        return handlers.PUT(request, context);
      case "PATCH":
        return handlers.PATCH(request, context);
      case "DELETE":
        return handlers.DELETE(request, context);
      default:
        return NextResponse.json({ ok: false }, { status: 405 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication is not configured.";
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message, retryable: false } },
      { status: 503 },
    );
  }
};

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
