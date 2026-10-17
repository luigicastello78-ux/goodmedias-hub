export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "archived";
export type SequenceItemType = "message" | "delay";
export type EnrollmentStatus = "enrolled" | "in_progress" | "completed" | "failed" | "unsubscribed";
export type QueueStatus = "pending" | "processing" | "sent" | "failed" | "unknown";
export type ContactStatus = "active" | "inactive" | "lead" | "customer";

export interface CampaignStepInput {
  id?: string;
  itemType: SequenceItemType;
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export interface CampaignDraft {
  id?: string;
  name: string;
  description: string;
  senderEmail: string;
  senderName: string;
  mergeTagFallbacks: Record<string, string>;
  steps: CampaignStepInput[];
}

export interface CampaignSummary {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  senderEmail: string;
  senderName: string | null;
  enrolledCount: number;
  sentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignStep {
  id: string;
  sequenceOrder: number;
  itemType: SequenceItemType;
  delayDays: number;
  delayHours: number;
  delayMinutes: number;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
}

export interface CampaignDetail extends CampaignSummary {
  mergeTagFallbacks: Record<string, string>;
  pausedAt: string | null;
  startedAt: string | null;
  steps: CampaignStep[];
  nextSendAt: string | null;
}

export interface EnrolledContact {
  id: string;
  email: string;
  name: string;
  status: EnrollmentStatus;
  currentSequence: number;
  enrolledAt: string;
  lastMessageSentAt: string | null;
  nextSendAt: string | null;
}

export interface Person {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  company: string | null;
  phone: string | null;
  jobTitle: string | null;
  status: ContactStatus;
  source: string | null;
  notes: string | null;
  createdAt: string;
}

export interface DistributionSummary {
  id: string;
  name: string;
  status: string;
  executionType: "immediate" | "drip";
  totalContacts: number;
  processedContacts: number;
  dripContactsPerBatch: number;
  dripIntervalMinutes: number;
  lastDripSentAt: string | null;
}
