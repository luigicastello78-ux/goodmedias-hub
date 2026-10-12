"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { requestJson, getErrorMessage, isRetryableError } from "@/lib/api-client";
import {
  bindingsForHeaders,
  buildContacts,
  duplicateRowIndexes,
  getMappingError,
  getTemplateError,
  guessEmailColumn,
} from "@/lib/campaign-draft";
import { createIdempotencyKey } from "@/lib/idempotency";
import { toSchedulePayload } from "@/lib/schedule";
import type { ScheduleDraft, TokenBinding, CampaignDispatchStatus, CampaignResult } from "@/types/campaign";
import type { BulkIngestResponse } from "@/types/n8n";

const initialSchedule = (): ScheduleDraft => ({
  timezone: "UTC",
  startAtLocal: "",
  daysOfWeek: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
  minDelaySeconds: 45,
  maxDelaySeconds: 120,
  maxPerDay: 80,
});

interface DraftData {
  fileName: string | null;
  headers: string[];
  rows: Array<Record<string, string>>;
  parseWarnings: string[];
  emailColumn: string;
  tokenBindings: TokenBinding[];
  campaignName: string;
  subjectTemplate: string;
  bodyTemplate: string;
  previewRowIndex: number;
  previewSeed: number;
  schedule: ScheduleDraft;
  senderPool: string[];
  timezoneCustomized: boolean;
  idempotencyKey: string | null;
  dispatchStatus: CampaignDispatchStatus;
  dispatchError: string | null;
  dispatchRetryable: boolean;
  editedSinceError: boolean;
}

const createInitialDraft = (): DraftData => ({
  fileName: null,
  headers: [],
  rows: [],
  parseWarnings: [],
  emailColumn: "",
  tokenBindings: [],
  campaignName: "",
  subjectTemplate: "",
  bodyTemplate: "",
  previewRowIndex: 0,
  previewSeed: 1,
  schedule: initialSchedule(),
  senderPool: [],
  timezoneCustomized: false,
  idempotencyKey: null,
  dispatchStatus: "idle",
  dispatchError: null,
  dispatchRetryable: false,
  editedSinceError: false,
});

const editPatch = (state: DraftData) => {
  if (state.dispatchStatus !== "error") {
    return {};
  }

  return {
    editedSinceError: true,
    idempotencyKey: state.dispatchRetryable ? null : state.idempotencyKey,
  };
};

interface CampaignState extends DraftData {
  lastResult: CampaignResult | null;
  hasHydrated: boolean;
  setHydrated: (value: boolean) => void;
  applyCsv: (
    fileName: string,
    headers: string[],
    rows: Array<Record<string, string>>,
    warnings: string[],
  ) => void;
  clearCsv: () => void;
  removeRow: (index: number) => void;
  removeDuplicateEmails: () => void;
  setEmailColumn: (column: string) => void;
  setToken: (sourceColumn: string, token: string) => void;
  setCampaignName: (value: string) => void;
  setSubjectTemplate: (value: string) => void;
  setBodyTemplate: (value: string) => void;
  setPreviewRowIndex: (index: number) => void;
  shufflePreview: () => void;
  updateSchedule: (patch: Partial<ScheduleDraft>) => void;
  toggleDay: (day: number) => void;
  toggleSender: (email: string) => void;
  dismissResult: () => void;
  dispatchCampaign: () => Promise<void>;
}

export const useCampaignStore = create<CampaignState>()(
  persist(
    (set, get) => ({
      ...createInitialDraft(),
      lastResult: null,
      hasHydrated: false,
      setHydrated: (hasHydrated) => set({ hasHydrated }),
      applyCsv: (fileName, headers, rows, warnings) =>
        set((state) => {
          const emailColumn = guessEmailColumn(headers);
          return {
            ...createInitialDraft(),
            fileName,
            headers,
            rows,
            parseWarnings: warnings,
            emailColumn,
            tokenBindings: bindingsForHeaders(headers, emailColumn),
            schedule: state.schedule,
            timezoneCustomized: state.timezoneCustomized,
            lastResult: null,
            hasHydrated: true,
          };
        }),
      clearCsv: () =>
        set((state) => ({
          ...createInitialDraft(),
          schedule: state.schedule,
          timezoneCustomized: state.timezoneCustomized,
          lastResult: state.lastResult,
          hasHydrated: true,
        })),
      removeRow: (index) =>
        set((state) => {
          const rows = state.rows.filter((_, rowIndex) => rowIndex !== index);
          return {
            ...editPatch(state),
            rows,
            previewRowIndex: Math.min(state.previewRowIndex, Math.max(rows.length - 1, 0)),
          };
        }),
      removeDuplicateEmails: () =>
        set((state) => {
          const indexes = new Set(duplicateRowIndexes(state.rows, state.emailColumn));
          const rows = state.rows.filter((_, index) => !indexes.has(index));
          return {
            ...editPatch(state),
            rows,
            previewRowIndex: Math.min(state.previewRowIndex, Math.max(rows.length - 1, 0)),
          };
        }),
      setEmailColumn: (emailColumn) =>
        set((state) => ({
          ...editPatch(state),
          emailColumn,
          tokenBindings: bindingsForHeaders(state.headers, emailColumn, state.tokenBindings),
          previewRowIndex: 0,
        })),
      setToken: (sourceColumn, token) =>
        set((state) => ({
          ...editPatch(state),
          tokenBindings: state.tokenBindings.map((binding) =>
            binding.sourceColumn === sourceColumn ? { ...binding, token } : binding,
          ),
        })),
      setCampaignName: (campaignName) =>
        set((state) => ({ ...editPatch(state), campaignName })),
      setSubjectTemplate: (subjectTemplate) =>
        set((state) => ({ ...editPatch(state), subjectTemplate })),
      setBodyTemplate: (bodyTemplate) =>
        set((state) => ({ ...editPatch(state), bodyTemplate })),
      setPreviewRowIndex: (previewRowIndex) => set({ previewRowIndex }),
      shufflePreview: () => set((state) => ({ previewSeed: state.previewSeed + 1 })),
      updateSchedule: (patch) =>
        set((state) => ({
          ...editPatch(state),
          timezoneCustomized: patch.timezone !== undefined ? true : state.timezoneCustomized,
          schedule: { ...state.schedule, ...patch },
        })),
      toggleDay: (day) =>
        set((state) => {
          const selected = state.schedule.daysOfWeek.includes(day);
          const daysOfWeek = selected
            ? state.schedule.daysOfWeek.filter((value) => value !== day)
            : [...state.schedule.daysOfWeek, day];
          return {
            ...editPatch(state),
            schedule: { ...state.schedule, daysOfWeek },
          };
        }),
      toggleSender: (email) =>
        set((state) => ({
          ...editPatch(state),
          senderPool: state.senderPool.includes(email)
            ? state.senderPool.filter((value) => value !== email)
            : [...state.senderPool, email],
        })),
      dismissResult: () => set({ lastResult: null }),
      dispatchCampaign: async () => {
        const state = get();
        if (state.dispatchStatus === "sending") {
          return;
        }

        const mappingError = getMappingError(state.emailColumn, state.tokenBindings);
        const templateError = getTemplateError(state.subjectTemplate, state.bodyTemplate);
        const scheduleResult = toSchedulePayload(state.schedule);
        const contacts = buildContacts(state.rows, state.emailColumn, state.tokenBindings);
        const error = !state.campaignName.trim()
          ? "Campaign name is required."
          : mappingError ??
            templateError ??
            (scheduleResult.ok ? null : scheduleResult.error) ??
            (contacts.length === 0 ? "No valid email addresses to send." : null);

        if (error || !scheduleResult.ok) {
          set({
            dispatchStatus: "error",
            dispatchError: error ?? "Schedule is invalid.",
            dispatchRetryable: false,
            editedSinceError: false,
          });
          return;
        }

        const key = state.idempotencyKey ?? createIdempotencyKey();
        set({ idempotencyKey: key, dispatchStatus: "sending", dispatchError: null });

        try {
          const result = await requestJson<BulkIngestResponse>("/api/n8n/bulk-ingest", {
            method: "POST",
            body: JSON.stringify({
              idempotencyKey: key,
              requestedAt: new Date().toISOString(),
              campaignName: state.campaignName.trim(),
              subjectTemplate: state.subjectTemplate,
              bodyTemplate: state.bodyTemplate,
              senderPool: state.senderPool,
              schedule: scheduleResult.schedule,
              contacts,
            }),
          });

          set((current) => ({
            ...createInitialDraft(),
            schedule: {
              ...initialSchedule(),
              timezone: current.schedule.timezone,
            },
            timezoneCustomized: current.timezoneCustomized,
            hasHydrated: true,
            lastResult: {
              campaignName: state.campaignName.trim(),
              batchId: result.batchId,
              acceptedCount: result.acceptedCount,
              rejected: result.rejected,
            },
          }));
        } catch (error) {
          set({
            dispatchStatus: "error",
            dispatchError: getErrorMessage(error),
            dispatchRetryable: isRetryableError(error),
            editedSinceError: false,
            idempotencyKey: key,
          });
        }
      },
    }),
    {
      name: "goodmedias-campaign-draft",
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
      partialize: (state) => ({
        fileName: state.fileName,
        headers: state.headers,
        rows: state.rows,
        parseWarnings: state.parseWarnings,
        emailColumn: state.emailColumn,
        tokenBindings: state.tokenBindings,
        campaignName: state.campaignName,
        subjectTemplate: state.subjectTemplate,
        bodyTemplate: state.bodyTemplate,
        previewRowIndex: state.previewRowIndex,
        previewSeed: state.previewSeed,
        schedule: state.schedule,
        senderPool: state.senderPool,
        timezoneCustomized: state.timezoneCustomized,
        idempotencyKey: state.idempotencyKey,
        dispatchStatus: state.dispatchStatus === "sending" ? "idle" : state.dispatchStatus,
        dispatchError: state.dispatchError,
        dispatchRetryable: state.dispatchRetryable,
        editedSinceError: state.editedSinceError,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          useCampaignStore.setState({ hasHydrated: true });
          return;
        }

        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        useCampaignStore.setState((current) => ({
          hasHydrated: true,
          schedule:
            !current.timezoneCustomized && detected
              ? { ...current.schedule, timezone: detected }
              : current.schedule,
        }));
      },
    },
  ),
);
