import "server-only";

export interface AppEnv {
  N8N_MODE: "live" | "fixture";
  N8N_WEBHOOK_SECRET: string;
  N8N_MANUAL_SEND_URL: string;
  N8N_BULK_INGEST_URL: string;
  N8N_INBOX_URL: string;
  N8N_THREAD_URL: string;
  N8N_SENDERS_URL: string;
  N8N_TIMEOUT_MS: number;
}

let cached: AppEnv | null = null;

const readTimeout = (): number => {
  const raw = process.env.N8N_TIMEOUT_MS ?? "30000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return 30000;
  }
  return parsed;
};

export const getEnv = (): AppEnv => {
  if (cached) {
    return cached;
  }

  const mode = process.env.N8N_MODE ?? "fixture";
  if (mode !== "live" && mode !== "fixture") {
    throw new Error("N8N_MODE must be live or fixture.");
  }

  cached = {
    N8N_MODE: mode,
    N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET ?? "",
    N8N_MANUAL_SEND_URL: process.env.N8N_MANUAL_SEND_URL ?? "",
    N8N_BULK_INGEST_URL: process.env.N8N_BULK_INGEST_URL ?? "",
    N8N_INBOX_URL: process.env.N8N_INBOX_URL ?? "",
    N8N_THREAD_URL: process.env.N8N_THREAD_URL ?? "",
    N8N_SENDERS_URL: process.env.N8N_SENDERS_URL ?? "",
    N8N_TIMEOUT_MS: readTimeout(),
  };

  return cached;
};
