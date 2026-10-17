export const TIMEOUT_MESSAGE =
  "The webhook timed out. It may already have been accepted. Retry uses the same idempotency key and will not send a duplicate if n8n stored this request.";

export const NETWORK_MESSAGE =
  "The webhook could not be reached. Retry uses the same idempotency key.";

export const UNEXPECTED_RESPONSE_MESSAGE =
  "The webhook returned an unexpected response. Retry uses the same idempotency key.";

export const AUTH_FAILED_MESSAGE = "Webhook authentication failed.";

export const BULK_TIMEOUT_MESSAGE =
  "The webhook timed out. This job may already have been accepted. Retry uses the same job id and will not start a second send if n8n stored it.";

export const BULK_NETWORK_MESSAGE =
  "The webhook could not be reached. Retry uses the same job id.";

export const BULK_URL_MISSING_MESSAGE =
  "N8N_BULK_SEND_URL is not configured. Add it to the server environment and try again.";

export const BULK_SECRET_MISSING_MESSAGE = "N8N_WEBHOOK_SECRET is not configured.";
