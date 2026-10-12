export const TIMEOUT_MESSAGE =
  "The webhook timed out. It may already have been accepted. Retry uses the same idempotency key and will not send a duplicate if n8n stored this request.";

export const NETWORK_MESSAGE =
  "The webhook could not be reached. Retry uses the same idempotency key.";

export const UNEXPECTED_RESPONSE_MESSAGE =
  "The webhook returned an unexpected response. Retry uses the same idempotency key.";

export const AUTH_FAILED_MESSAGE = "Webhook authentication failed.";
