import "server-only";

import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

import type { N8nErrorCode, N8nErrorResponse } from "@/types/n8n";

export class ApiError extends Error {
  readonly status: number;
  readonly code: N8nErrorCode;
  readonly retryable: boolean;

  constructor(status: number, code: N8nErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export const toErrorResponse = (error: unknown): NextResponse<N8nErrorResponse> => {
  unstable_rethrow(error);
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      },
      { status: error.status },
    );
  }

  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "22P02") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "That id is not valid.",
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof Error && /DATABASE_URL|NEON_AUTH_/.test(error.message)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UPSTREAM",
          message: error.message,
          retryable: false,
        },
      },
      { status: 500 },
    );
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Unhandled route error: ${message}`);

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "UPSTREAM",
        message: "Something went wrong while contacting the webhook.",
        retryable: true,
      },
    },
    { status: 500 },
  );
};
