import "server-only";

import { NextResponse } from "next/server";

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
