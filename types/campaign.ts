import type { BulkRejectedContact } from "@/types/n8n";

export interface TokenBinding {
  sourceColumn: string;
  token: string;
}

export interface ScheduleDraft {
  timezone: string;
  startAtLocal: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  maxPerDay: number;
}

export interface CampaignResult {
  campaignName: string;
  batchId: string;
  acceptedCount: number;
  rejected: BulkRejectedContact[];
}

export type CampaignDispatchStatus = "idle" | "sending" | "error";

export interface CsvDraft {
  fileName: string | null;
  headers: string[];
  rows: Array<Record<string, string>>;
  parseWarnings: string[];
}
