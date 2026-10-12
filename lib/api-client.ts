export class ClientRequestError extends Error {
  readonly retryable: boolean;
  readonly code: string;

  constructor(message: string, retryable: boolean, code: string) {
    super(message);
    this.name = "ClientRequestError";
    this.retryable = retryable;
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong.";

export const isRetryableError = (error: unknown): boolean =>
  error instanceof ClientRequestError ? error.retryable : false;

export const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ClientRequestError(
      "The network request failed. Retry uses the same idempotency key.",
      true,
      "UPSTREAM",
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const errorRecord =
    isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const succeeded = response.ok && isRecord(payload) && payload.ok === true;

  if (!succeeded) {
    const message =
      typeof errorRecord?.message === "string"
        ? errorRecord.message
        : "The request could not be completed.";
    const retryable =
      typeof errorRecord?.retryable === "boolean"
        ? errorRecord.retryable
        : response.status >= 500 || response.status === 429 || response.status === 408;
    const code = typeof errorRecord?.code === "string" ? errorRecord.code : "UPSTREAM";
    throw new ClientRequestError(message, retryable, code);
  }

  return payload as T;
};
